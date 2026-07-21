import test from "node:test";
import assert from "node:assert/strict";
import { buildTrendImageBrief } from "@/lib/images/trend-image-brief";
import { buildFashionImagePrompt } from "@/lib/images/build-fashion-image-prompt";

function conceptPrompt(keyword: string) {
  return buildFashionImagePrompt({
    entityType:"trend",
    entityId:-1,
    variant:"trend_concept",
    keyword,
    model:"mock",
    imageSize:"1024x1280",
  });
}

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

test("oversized brief forbids collar labels and centred ecommerce composition", () => {
  const brief = buildTrendImageBrief("oversized");

  assert.match(brief.visualSubject, /off-centre close study/);
  assert.ok(brief.requiredVisualCues.includes("exaggerated sleeve volume"));
  assert.ok(brief.requiredVisualCues.includes("extra-wide silhouette"));
  assert.ok(brief.forbiddenVisualCues.includes("sewn label"));
  assert.ok(brief.forbiddenVisualCues.includes("imitation writing"));
  assert.ok(brief.forbiddenVisualCues.includes("complete centred ecommerce shirt"));
});

test("layering brief requires separate believable garments and rejects fused hybrids", () => {
  const brief = buildTrendImageBrief("layering");

  assert.match(brief.visualSubject, /clearly separate real garments/);
  assert.ok(brief.requiredVisualCues.includes("distinct collars hems sleeves and edges"));
  assert.ok(brief.requiredVisualCues.includes("asymmetric editorial arrangement"));
  assert.ok(brief.forbiddenVisualCues.includes("fused garment"));
  assert.ok(brief.forbiddenVisualCues.includes("impossible seams"));
  assert.ok(brief.forbiddenVisualCues.includes("hybrid clothing object"));
});

test("approved kurta brief remains unchanged", () => {
  const brief = buildTrendImageBrief("kurta");

  assert.equal(brief.visualSubject, "edge-to-edge close study of kurta neckline, placket, weave and fabric");
  assert.equal(brief.compositionMode, "cropped construction detail");
  assert.deepEqual(brief.requiredVisualCues, ["kurta construction", "Indian garment detail", "fabric richness"]);
  assert.deepEqual(brief.forbiddenVisualCues, ["poster layout", "caption panel", "typography", "letters", "symbols", "full beige garment"]);
});

test("oversized and layering generation prompts carry the calibration corrections", () => {
  const oversized=conceptPrompt("oversized");
  const layering=conceptPrompt("layering");

  assert.match(oversized,/no visible inner tag area/i);
  assert.match(oversized,/sewn label/i);
  assert.match(oversized,/complete centred ecommerce shirt/i);
  assert.match(layering,/clearly separate real garments/i);
  assert.match(layering,/distinct collars hems sleeves and edges/i);
  assert.match(layering,/fused garment/i);
  assert.match(layering,/impossible seams/i);
});
