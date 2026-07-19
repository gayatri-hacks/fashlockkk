import test from "node:test";
import assert from "node:assert/strict";
import { trendConceptKeywordsMatch } from "@/lib/images/trend-concept-regeneration-plan";
import { canonicalizeTrendKeyword } from "@/lib/trends/keyword-normalization";

const COORD_ALIASES = [
  "coord",
  "co-ord",
  "co ord",
  "co-ord set",
  "coord set",
  "co ord set",
];

test("co-ord variants canonicalize to the same concept", () => {
  for (const alias of COORD_ALIASES) {
    assert.equal(canonicalizeTrendKeyword(alias), "co-ord");
  }
});

test("co-ord aliases do not trigger regeneration keyword mismatch", () => {
  for (const imageKeyword of COORD_ALIASES) {
    for (const trendKeyword of COORD_ALIASES) {
      assert.equal(trendConceptKeywordsMatch(imageKeyword, trendKeyword), true);
    }
  }
});
