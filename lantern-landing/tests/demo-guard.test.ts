/**
 * Unit tests for the DemoGuard access decision.
 *
 * Tests are against the exported pure function checkDemoAccess() so no
 * React environment, DOM, or localStorage mock is required.
 *
 * The three scenarios that must hold:
 *   1. NEXT_PUBLIC_DEMO_ENABLED=true  → access granted regardless of stored key.
 *   2. Demo disabled, no valid key    → access denied (redirect).
 *   3. Demo disabled, valid key       → access granted.
 */

import { describe, it, expect } from "vitest";
import { checkDemoAccess } from "@/app/components/DemoGuard";

const VALID_KEY = "tg_demo_2026";

describe("checkDemoAccess", () => {
  // ── Scenario 1: demo globally enabled ──────────────────────────────────────

  it("permits access when demo is globally enabled, even with no stored key", () => {
    expect(checkDemoAccess(true, VALID_KEY, null)).toBe(true);
  });

  it("permits access when demo is globally enabled, even with a wrong stored key", () => {
    expect(checkDemoAccess(true, VALID_KEY, "wrong_key")).toBe(true);
  });

  it("permits access when demo is globally enabled, even with no expectedKey configured", () => {
    // Edge case: NEXT_PUBLIC_DEMO_KEY not set — demoEnabled alone is sufficient.
    expect(checkDemoAccess(true, "", null)).toBe(true);
  });

  // ── Scenario 2: demo disabled, no valid key stored ─────────────────────────

  it("denies access when demo is disabled and localStorage has no key", () => {
    expect(checkDemoAccess(false, VALID_KEY, null)).toBe(false);
  });

  it("denies access when demo is disabled and stored key does not match", () => {
    expect(checkDemoAccess(false, VALID_KEY, "wrong_key")).toBe(false);
  });

  it("denies access when demo is disabled and no expectedKey is configured", () => {
    // If NEXT_PUBLIC_DEMO_KEY is not set, no stored value can match.
    expect(checkDemoAccess(false, "", VALID_KEY)).toBe(false);
  });

  // ── Scenario 3: demo disabled but valid key is stored ──────────────────────

  it("permits access when demo is disabled but stored key matches expectedKey", () => {
    expect(checkDemoAccess(false, VALID_KEY, VALID_KEY)).toBe(true);
  });
});
