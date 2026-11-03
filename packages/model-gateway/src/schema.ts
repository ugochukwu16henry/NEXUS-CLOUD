import type { ObjectSchema } from "./types";

export class SchemaError extends Error {
  constructor() {
    super("model output did not match the schema");
    this.name = "SchemaError";
  }
}

export function parseStructured(text: string, schema: ObjectSchema): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SchemaError();
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new SchemaError();
  for (const key of schema.required ?? []) {
    if (!(key in value)) throw new SchemaError();
  }
  return value;
}
