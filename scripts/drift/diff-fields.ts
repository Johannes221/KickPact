/**
 * Pure field-level schema diff for the scraper drift checker.
 *
 * Compares an actual runtime value against an expected `FieldSchema` (captured
 * during fixture generation in Phase 1) and returns a `Drift` describing the
 * mismatch — or `null` if the value conforms.
 *
 * No I/O, no external dependencies — safe to import from both the manifest
 * builder (`scripts/fixtures/build-manifest.ts`) and the drift checker
 * (`scripts/drift/check-drift.ts`).
 */

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

function normalize(s: string, schema: FieldSchema): string {
  let out = s;
  if (schema.tolerantWhitespace) out = out.replace(/\s+/g, "").trim();
  if (schema.tolerantCasing) out = out.toLowerCase();
  return out;
}

export function diffField(
  field: string,
  schema: FieldSchema,
  value: unknown,
): Drift | null {
  if (value === null || value === undefined) {
    if (schema.nullable) return null;
    return {
      field,
      expected: schema,
      actual: value,
      reason: "expected non-null value, got null",
    };
  }

  const actualType = typeof value;

  if (schema.type === "number" && actualType !== "number") {
    return {
      field,
      expected: schema,
      actual: value,
      reason: `expected type number, got ${actualType}`,
    };
  }
  if (schema.type === "string" && actualType !== "string") {
    return {
      field,
      expected: schema,
      actual: value,
      reason: `expected type string, got ${actualType}`,
    };
  }

  if (schema.type === "number") {
    const n = value as number;
    if (schema.min !== undefined && n < schema.min) {
      return {
        field,
        expected: schema,
        actual: value,
        reason: `below min ${schema.min}`,
      };
    }
    if (schema.max !== undefined && n > schema.max) {
      return {
        field,
        expected: schema,
        actual: value,
        reason: `above max ${schema.max}`,
      };
    }
  }

  if (schema.type === "string") {
    const raw = value as string;
    const normalized = normalize(raw, schema);

    if (schema.enum) {
      const allowed = schema.enum.map((e) => normalize(e, schema));
      if (!allowed.includes(normalized)) {
        return {
          field,
          expected: schema,
          actual: value,
          reason: `not in enum [${schema.enum.join(", ")}]`,
        };
      }
    }

    if (schema.pattern && !new RegExp(schema.pattern).test(raw)) {
      return {
        field,
        expected: schema,
        actual: value,
        reason: `does not match pattern ${schema.pattern}`,
      };
    }

    if (schema.minLength !== undefined && raw.length < schema.minLength) {
      return {
        field,
        expected: schema,
        actual: value,
        reason: `length ${raw.length} below min ${schema.minLength}`,
      };
    }
  }

  return null;
}
