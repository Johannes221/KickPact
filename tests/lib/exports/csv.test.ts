/**
 * Unit tests for the CSV-export helper.
 *
 * Reine pure-function-Tests — keine DB, kein I/O.
 */
import { describe, expect, it } from "vitest";
import {
  buildCsv,
  csvEscape,
  csvFilename,
  csvResponseHeaders
} from "@/lib/exports/csv";

describe("csvEscape", () => {
  it("returns empty for null/undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("passes simple strings through unchanged", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("foo-bar")).toBe("foo-bar");
  });

  it("quotes strings with semicolon separator", () => {
    expect(csvEscape("a;b")).toBe('"a;b"');
  });

  it("quotes + escapes inner double-quotes", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes strings with newlines", () => {
    expect(csvEscape("a\nb")).toBe('"a\nb"');
    expect(csvEscape("a\r\nb")).toBe('"a\r\nb"');
  });

  it("quotes strings with leading/trailing spaces", () => {
    expect(csvEscape(" foo")).toBe('" foo"');
    expect(csvEscape("foo ")).toBe('"foo "');
  });

  it("respects custom separator", () => {
    expect(csvEscape("a,b", ",")).toBe('"a,b"');
    expect(csvEscape("a;b", ",")).toBe("a;b");
  });

  it("formats Date as ISO", () => {
    const d = new Date(Date.UTC(2026, 4, 25, 12, 30, 0));
    expect(csvEscape(d)).toBe("2026-05-25T12:30:00.000Z");
  });

  it("formats numbers as JS toString", () => {
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(3.14)).toBe("3.14");
  });

  it("formats booleans", () => {
    expect(csvEscape(true)).toBe("true");
    expect(csvEscape(false)).toBe("false");
  });
});

describe("buildCsv", () => {
  it("builds simple table with BOM + CRLF", () => {
    const out = buildCsv({
      headers: ["Name", "Alter"],
      rows: [
        ["Alice", 30],
        ["Bob", 25]
      ]
    });
    expect(out.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(out).toContain("Name;Alter\r\n");
    expect(out).toContain("Alice;30\r\n");
    expect(out).toContain("Bob;25\r\n");
  });

  it("omits BOM when bom:false", () => {
    const out = buildCsv({
      headers: ["A"],
      rows: [["v"]],
      bom: false
    });
    expect(out.charCodeAt(0)).toBe("A".charCodeAt(0));
  });

  it("handles custom separator", () => {
    const out = buildCsv({
      headers: ["a", "b"],
      rows: [["x", "y"]],
      separator: ",",
      bom: false
    });
    expect(out).toBe("a,b\r\nx,y\r\n");
  });

  it("escapes cells containing the separator", () => {
    const out = buildCsv({
      headers: ["msg"],
      rows: [["hello; world"]],
      bom: false
    });
    expect(out).toContain('"hello; world"');
  });

  it("handles null cells as empty string", () => {
    const out = buildCsv({
      headers: ["a", "b"],
      rows: [["x", null]],
      bom: false
    });
    expect(out).toBe("a;b\r\nx;\r\n");
  });

  it("ends with trailing CRLF", () => {
    const out = buildCsv({
      headers: ["a"],
      rows: [["1"]],
      bom: false
    });
    expect(out.endsWith("\r\n")).toBe(true);
  });
});

describe("csvFilename", () => {
  it("appends ISO date and .csv", () => {
    const f = csvFilename("charges", new Date(Date.UTC(2026, 4, 25)));
    expect(f).toBe("charges_2026-05-25.csv");
  });

  it("strips unsafe characters", () => {
    const f = csvFilename("../etc/passwd", new Date(Date.UTC(2026, 4, 25)));
    expect(f).not.toContain("/");
    expect(f.endsWith(".csv")).toBe(true);
  });

  it("falls back to 'export' on empty base", () => {
    const f = csvFilename("", new Date(Date.UTC(2026, 4, 25)));
    expect(f).toBe("export_2026-05-25.csv");
  });
});

describe("csvResponseHeaders", () => {
  it("sets Content-Type with charset=utf-8", () => {
    const h = csvResponseHeaders("foo.csv");
    expect(h["Content-Type"]).toBe("text/csv; charset=utf-8");
  });

  it("sets Content-Disposition with attachment", () => {
    const h = csvResponseHeaders("foo.csv");
    expect(h["Content-Disposition"]).toContain("attachment");
    expect(h["Content-Disposition"]).toContain('filename="foo.csv"');
  });

  it("sets Cache-Control: no-store", () => {
    const h = csvResponseHeaders("foo.csv");
    expect(h["Cache-Control"]).toBe("no-store");
  });
});
