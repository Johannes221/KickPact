// STUB — will be replaced when the real implementation from Task 8.1 is merged.
// Keep the signature in sync with docs/superpowers/plans/2026-05-22-scraper-realdata-validation.md (Task 8.1).
export type FieldSchema = {
  type: "string" | "number" | "object" | "array";
  pattern?: string;
  enum?: string[];
  min?: number;
  max?: number;
  minLength?: number;
  nullable?: boolean;
  tolerantWhitespace?: boolean;
  tolerantCasing?: boolean;
};

export type Drift = {
  field: string;
  expected: FieldSchema;
  actual: unknown;
  reason: string;
};

export function diffField(field: string, schema: FieldSchema, value: unknown): Drift | null {
  if (value === null || value === undefined) {
    if (schema.nullable) return null;
    return { field, expected: schema, actual: value, reason: "expected non-null value, got null" };
  }
  const actualType = typeof value;
  if (schema.type === "number" && actualType !== "number") {
    return { field, expected: schema, actual: value, reason: `expected type number, got ${actualType}` };
  }
  if (schema.type === "string" && actualType !== "string") {
    return { field, expected: schema, actual: value, reason: `expected type string, got ${actualType}` };
  }
  if (schema.type === "number") {
    const n = value as number;
    if (schema.min !== undefined && n < schema.min) {
      return { field, expected: schema, actual: value, reason: `below min ${schema.min}` };
    }
    if (schema.max !== undefined && n > schema.max) {
      return { field, expected: schema, actual: value, reason: `above max ${schema.max}` };
    }
  }
  if (schema.type === "string") {
    let s = value as string;
    if (schema.tolerantWhitespace) s = s.replace(/\s+/g, " ").trim();
    if (schema.tolerantCasing) s = s.toLowerCase();
    if (schema.enum) {
      const allowed = schema.enum.map((e) => {
        let x = e;
        if (schema.tolerantWhitespace) x = x.replace(/\s+/g, " ").trim();
        if (schema.tolerantCasing) x = x.toLowerCase();
        return x;
      });
      if (!allowed.includes(s)) {
        return { field, expected: schema, actual: value, reason: `not in enum [${schema.enum.join(", ")}]` };
      }
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(s)) {
      return { field, expected: schema, actual: value, reason: `does not match pattern ${schema.pattern}` };
    }
    if (schema.minLength !== undefined && s.length < schema.minLength) {
      return { field, expected: schema, actual: value, reason: `length ${s.length} below min ${schema.minLength}` };
    }
  }
  return null;
}
