import type { RequestHandler } from "express";
import type { z } from "zod";
import { ValidationError } from "./errors.js";

type Schemas = { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType };

export type Validated<S extends Schemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

// The parsed input goes to res.locals.input: Express 5 makes req.query read-only.
export function validate<S extends Schemas>(schemas: S): RequestHandler {
  return (req, res, next) => {
    const input: Record<string, unknown> = {};
    const errors: Record<string, string[]> = {};
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (schema === undefined) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        input[part] = result.data;
        continue;
      }
      for (const issue of result.error.issues) {
        const field = [part, ...issue.path].join(".");
        (errors[field] ??= []).push(issue.message);
      }
    }
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);
    res.locals.input = input;
    next();
  };
}

export function inputOf<S extends Schemas>(res: { locals: Record<string, unknown> }): Validated<S> {
  return res.locals.input as Validated<S>;
}
