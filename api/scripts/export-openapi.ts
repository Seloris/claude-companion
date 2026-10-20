import { writeFileSync } from "node:fs";
import "../src/features/dashboard/dashboard.schema.js";
import "../src/features/health/health.schema.js";
import "../src/features/ingestion/ingestion.schema.js";
import "../src/features/live/live.schema.js";
import "../src/features/retention/retention.schema.js";
import "../src/features/workspaces/workspaces.schema.js";
import { buildOpenApiDocument } from "../src/shared/openapi.js";

const target = process.argv[2];
if (target === undefined) {
  console.error("usage: tsx scripts/export-openapi.ts {file}");
  process.exit(1);
}
const document = buildOpenApiDocument({ title: "claude-companion", version: "0.0.0" });
writeFileSync(target, JSON.stringify(document, null, 2) + "\n");
console.log(`wrote ${target}`);
