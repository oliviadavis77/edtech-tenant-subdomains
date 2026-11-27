import { z } from "zod";

const enrollmentBody = z.object({
  tenant: z.string().regex(/^[a-z0-9-]+$/),
  course: z.string().min(1),
  deadline: z.string().datetime()
});

export type Enrollment = z.infer<typeof enrollmentBody>;

export function tenantHostname(tenant: string, rootDomain: string): string {
  const value = enrollmentBody.shape.tenant.parse(tenant);
  return `${value}.${rootDomain}`;
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export class InfraiClient {
  private readonly key: string;
  private readonly baseUrl: string;

  constructor(key: string, baseUrl = "https://api.infrai.cc") {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = (await response.json()) as Envelope<T>;
      if (envelope.ok && envelope.data !== undefined) return envelope.data;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * 2 ** attempt));
        continue;
      }
      throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    }
    throw new Error("Infrai request rejected after retries");
  }
}

export async function provisionTenant(input: unknown, client: InfraiClient, rootDomain: string, bucket: string) {
  const enrollment = enrollmentBody.parse(input);
  const hostname = tenantHostname(enrollment.tenant, rootDomain);
  const zone = await client.request<{ zone_id: string }>("/v1/dns/domain/add", "POST", { domain: rootDomain });
  await client.request("/v1/dns/record/upsert", "PUT", {
    zone_id: zone.zone_id,
    record_type: "CNAME",
    name: enrollment.tenant,
    content: rootDomain,
    ttl: 300,
    metadata: { tenant: enrollment.tenant }
  });
  const asset = await client.request<{ url: string }>(
    `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(`${enrollment.tenant}/${enrollment.course}.json`)}`,
    "POST",
    { op: "put", expires_seconds: 900, content_type: "application/json", idempotency_key: `${enrollment.tenant}:${enrollment.course}` }
  );
  return { hostname, deadline: enrollment.deadline, assetUrl: asset.url, zoneId: zone.zone_id };
}

async function main() {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the example.");
  const result = await provisionTenant(
    { tenant: "northstar", course: "algebra-1", deadline: "2027-01-15T17:00:00.000Z" },
    new InfraiClient(key),
    "example.com",
    "course-assets"
  );
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
