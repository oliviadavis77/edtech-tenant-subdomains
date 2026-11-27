import assert from "node:assert/strict";
import { tenantHostname } from "./tenant_delivery.ts";

assert.equal(tenantHostname("northstar", "example.com"), "northstar.example.com");
assert.throws(() => tenantHostname("Invalid Tenant", "example.com"));
console.log("tenant hostname decision: passed");
