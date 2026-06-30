import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "../app/hotels/HotelSearch.tsx"),
  "utf8",
);

describe("hotel comparison modal", () => {
  it("renders comparison content on an opaque light surface", () => {
    expect(source).toContain('className="fixed inset-0 z-50 flex flex-col bg-white text-gray-900"');
    expect(source).not.toContain('fixed inset-0 z-50 flex flex-col bg-black/75');
  });

  it("keeps non-winning score bars visible on the light surface", () => {
    expect(source).toContain('isW ? "bg-teal-600" : "bg-gray-200"');
    expect(source).not.toContain('isW ? "bg-teal-600" : "bg-white/[0.16]"');
  });

  it("exposes accessible dialog semantics", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-labelledby="hotel-compare-title"');
  });
});
