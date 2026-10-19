import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  driver: "pglite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: ".data/pglite" },
});
