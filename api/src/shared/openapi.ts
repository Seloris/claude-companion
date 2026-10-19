import { OpenApiGeneratorV31, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const registry = new OpenAPIRegistry();

export function buildOpenApiDocument(info: { title: string; version: string }) {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info,
  });
}
