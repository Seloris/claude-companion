import type { ErrorRequestHandler } from "express";
import { z } from "zod";

// One OpenAPI component for every feature's error responses.
export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    code: z.string().optional(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .meta({ id: "ProblemDetails" });

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly errors?: ProblemDetails["errors"],
  ) {
    super(message);
    this.name = new.target.name;
  }

  toProblemDetails(): ProblemDetails {
    return {
      type: `urn:problem:${this.code}`,
      title: this.name,
      status: this.status,
      detail: this.message,
      code: this.code,
      ...(this.errors === undefined ? {} : { errors: this.errors }),
    };
  }
}

export class ValidationError extends AppError {
  constructor(errors: NonNullable<ProblemDetails["errors"]>) {
    super(400, "validation_failed", "The request is invalid", errors);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, "forbidden", message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string | number) {
    super(404, "not_found", `${entity} ${id} does not exist`);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class BusinessRuleError extends AppError {
  constructor(code: string, message: string) {
    super(422, code, message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express needs the 4-argument signature
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const problem: ProblemDetails =
    err instanceof AppError
      ? err.toProblemDetails()
      : isMalformedJson(err)
        ? new ValidationError({ body: ["The body is not valid JSON"] }).toProblemDetails()
        : { type: "about:blank", title: "Internal Server Error", status: 500 };
  if (problem.status === 500) console.error(err);
  res.status(problem.status).type("application/problem+json").json(problem);
};

// express.json() rejects a body that does not parse with this type: the client's fault, not a 500.
function isMalformedJson(err: unknown): boolean {
  return typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed";
}
