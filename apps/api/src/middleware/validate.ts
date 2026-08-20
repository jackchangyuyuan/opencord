import type { Request, RequestHandler } from "express";
import type { ZodType } from "zod";

type Dictionary = Record<string, unknown>;

export interface RequestSchemas {
  body?: ZodType;
  params?: ZodType<Dictionary>;
  query?: ZodType<Dictionary>;
}

type Parsed<Schema, Fallback> =
  Schema extends ZodType<infer Output> ? Output : Fallback;

export function validate<Schemas extends RequestSchemas>(
  schemas: Schemas,
): RequestHandler<
  Parsed<Schemas["params"], Request["params"]>,
  unknown,
  Parsed<Schemas["body"], unknown>,
  Parsed<Schemas["query"], Request["query"]>
> {
  return (req, _res, next) => {
    if (schemas.body !== undefined) {
      replace(req, "body", schemas.body.parse(req.body));
    }

    if (schemas.params !== undefined) {
      replace(req, "params", schemas.params.parse(req.params));
    }

    if (schemas.query !== undefined) {
      replace(req, "query", schemas.query.parse(req.query));
    }

    next();
  };
}

function replace(req: object, property: string, value: unknown): void {
  Object.defineProperty(req, property, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}
