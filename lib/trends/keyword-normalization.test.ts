import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeTrendKeyword, isFashionKeyword } from "@/lib/trends/keyword-normalization";

test("normalises casing, spacing, punctuation and safe aliases", () => {
  assert.equal(canonicalizeTrendKeyword("  Wide-Leg   Denim "), "wide leg denim");
  assert.equal(canonicalizeTrendKeyword("co ord"), "co-ord");
  assert.equal(canonicalizeTrendKeyword("COORD"), "co-ord");
});

test("does not merge distinct loose, oversized and relaxed fit concepts", () => {
  assert.equal(canonicalizeTrendKeyword("loose"), "loose");
  assert.equal(canonicalizeTrendKeyword("oversized"), "oversized");
  assert.equal(canonicalizeTrendKeyword("relaxed fit"), "relaxed fit");
});

test("filters obvious non-fashion terms while keeping fashion signals", () => {
  assert.equal(isFashionKeyword("denim"), true);
  assert.equal(isFashionKeyword("kurta"), true);
  assert.equal(isFashionKeyword("bitcoin stock"), false);
});
