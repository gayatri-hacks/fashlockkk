import test from "node:test";
import assert from "node:assert/strict";
import { buildTrendImageBrief } from "@/lib/images/trend-image-brief";

test("brief selection keeps floral as fashion textile, not a bouquet", () => {
  const brief = buildTrendImageBrief("floral");

  assert.equal(brief.canonicalKeyword, "floral");
  assert.match(brief.visualSubject, /fashion textile|garment/);
  assert.ok(brief.requiredVisualCues.includes("visible floral print"));
  assert.ok(brief.forbiddenVisualCues.includes("bouquet"));
});

test("brief selection makes baggy about exaggerated trouser volume", () => {
  const brief = buildTrendImageBrief("baggy");

  assert.equal(brief.materialFamily, "washed denim or structured twill");
  assert.ok(brief.requiredVisualCues.includes("exaggerated trouser volume"));
  assert.ok(brief.requiredVisualCues.includes("wide proportions"));
});

test("brief selection makes minimal sharper than a beige tee", () => {
  const brief = buildTrendImageBrief("minimal");

  assert.match(brief.materialFamily, /structured wool|crepe|poplin/);
  assert.ok(brief.requiredVisualCues.includes("minimal construction"));
  assert.ok(brief.forbiddenVisualCues.includes("plain beige T-shirt"));
});

test("brief selection makes flared visibly about widening hems", () => {
  const brief = buildTrendImageBrief("flared");

  assert.ok(brief.requiredVisualCues.includes("widening hem"));
  assert.ok(brief.forbiddenVisualCues.includes("straight leg"));
});
