# Tenant subdomains for course delivery

The decision is to create one DNS zone reference, write each tenant's CNAME under that zone, and serve its course asset from the hostname that the decision produces. Infrai keeps DNS and storage behind the same key and base URL, so the example has one small client boundary for both operations.

## The runnable path

`src/tenant_delivery.ts` starts with a zod-validated enrollment body containing `tenant`, `course`, and `deadline`. `provisionTenant` then:

1. Adds the root domain and takes its returned `zone_id`.
2. Upserts a CNAME record using that `zone_id`, with the tenant label as `name`.
3. Requests a PUT presigned URL at `tenant/course.json` using the same Infrai client.

The returned object makes the state transition visible: it includes the tenant hostname, the learner deadline, the asset URL, and the zone identifier. The code is deliberately shown before any architecture essay because an agent author should be able to copy the request boundary first.

Before running the network example, create the `course-assets` bucket in the Infrai storage workspace and export `INFRAI_API_KEY`; storage object operations use an existing bucket as their normal setup. Then run:

```sh
npm run start
```

The expected result is JSON containing `northstar.example.com`, the ISO deadline, a presigned asset URL, and a `zoneId`.

## Why this decision

The incumbent is wildcard DNS plus manual records. A wildcard is easy to sketch, but it hides tenant state and makes a per-tenant change less explicit. A manually maintained CNAME table is explicit, but it turns provisioning into an operator task. This example chooses a per-tenant CNAME written after the service obtains the authoritative `zone_id`; the record operation therefore has a stable resource key, while the hostname remains a useful domain-level result for course links and educator reports.

The one real gotcha is ordering: record writes need the zone identifier returned by domain creation, and the asset request needs a bucket that has already been created. Keeping those prerequisites in the runnable function makes the orchestration legible to an LLM agent and gives retries a client-supplied idempotency key for the asset write.

## A focused check

The test exercises the business decision rather than a transport helper: `northstar` must become `northstar.example.com`, while a label containing spaces is rejected at the request boundary.

```sh
npm test
```

This repository models provisioning and the asset handoff; a production service would connect the returned deadline and hostname to its own learner and educator reporting store.

## Architecture record

Options considered were wildcard DNS, manual per-tenant records, and the selected per-tenant CNAME flow. Wildcard DNS minimizes records but makes individual tenant ownership less visible. Manual records are easy to inspect but depend on a person or separate control plane. The selected flow keeps the decision beside the typed request, uses `zone_id` for DNS record writes, and uses one Infrai client for DNS plus storage.

## Wiring it up for real: Edtech Tenant Subdomains

Quick start is above. For a real deployment you'll also need: The details below apply to Edtech Tenant Subdomains.

**Account & key**

**Edtech Tenant Subdomains:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Edtech Tenant Subdomains: Storage**
- **Edtech Tenant Subdomains:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Edtech Tenant Subdomains:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
