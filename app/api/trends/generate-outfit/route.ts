import { NextResponse } from "next/server";
import {
  findApprovedTrendOutfitAsset,
  findReusableTrendOutfitAsset,
  generateAndPersistTrendOutfitAsset,
  buildTrendCardOutfitFormula,
  resolveTrendOutfitFallback,
  type TrendOutfitAssetSource,
} from "@/lib/trend-outfit-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 86400;
export const maxDuration = 180;

type Gender = "women" | "men";

type OutfitResponse = {
  imageUrl: string;
  imageSource: TrendOutfitAssetSource;
  assetId?: number | null;
  cached?: boolean;
  status?: "cached" | "generated" | "fallback";
};

function fallbackResponse(gender: Gender): OutfitResponse {
  return {
    imageUrl: gender === "men" ? "/looks/male-timothee-off-duty.jpg" : "/looks/female-carolyn-bessette-uniform.jpg",
    imageSource: "fallback",
    assetId: null,
  };
}

export async function POST(req: Request) {
  let fallbackGender: Gender = "women";

  try {
    const body = await req.json();
    const formula = typeof body.formula === "string" ? body.formula.trim() : "";
    const occasion = typeof body.occasion === "string" ? body.occasion.trim() : "";
    const trendKeyword =
      typeof body.trendKeyword === "string"
        ? body.trendKeyword.trim()
        : typeof body.keyword === "string"
          ? body.keyword.trim()
          : "";
    const outfitTitle =
      typeof body.outfitTitle === "string"
        ? body.outfitTitle.trim()
        : occasion
          ? `${occasion} outfit`
          : "Trend outfit";
    const gender: Gender = body.gender === "men" ? "men" : "women";
    fallbackGender = gender;
    const assetContext =
      typeof body.context === "string" && body.context.trim()
        ? body.context.trim()
        : body.cardImage === true
          ? "trend-card"
          : "trend-detail";
    const audience =
      typeof body.audience === "string" && body.audience.trim()
        ? body.audience.trim()
        : assetContext === "trend-card"
          ? "neutral"
          : gender === "men"
            ? "him"
            : "her";
    const isTrendCard = assetContext === "trend-card" || body.cardImage === true;
    const outfitFormula = formula || (isTrendCard ? buildTrendCardOutfitFormula(trendKeyword || outfitTitle, audience) : buildTrendCardOutfitFormula(trendKeyword || outfitTitle, audience));

    const savedAsset = await findApprovedTrendOutfitAsset({
      trendKeyword,
      outfitFormula,
      assetContext,
      audience,
    });

    if (savedAsset?.image_url) {
      console.info("Approved trend outfit asset reused", {
        trendKeyword,
        assetContext,
        audience,
        assetId: savedAsset.id,
        imageSource: savedAsset.image_source,
      });
      return NextResponse.json({
        imageUrl: savedAsset.image_url,
        imageSource: savedAsset.image_source,
        assetId: savedAsset.id,
        cached: true,
        status: "cached",
      } satisfies OutfitResponse);
    }

    const reusableAsset = await findReusableTrendOutfitAsset({
      trendKeyword,
      outfitFormula,
      assetContext,
      audience,
    });

    if (reusableAsset?.image_url) {
      console.info("Generated/pending trend outfit asset reused", {
        trendKeyword,
        assetContext,
        audience,
        assetId: reusableAsset.id,
        imageSource: reusableAsset.image_source,
        status: reusableAsset.status,
      });
      return NextResponse.json({
        imageUrl: reusableAsset.image_url,
        imageSource: reusableAsset.image_source,
        assetId: reusableAsset.id,
        cached: true,
        status: "cached",
      } satisfies OutfitResponse);
    }

    const liveOllamaImage = await generateAndPersistTrendOutfitAsset({
      trendKeyword: trendKeyword || formula,
      outfitFormula,
      outfitTitle,
      gender,
      assetContext,
      audience,
    });

    if (liveOllamaImage) {
      console.info("New Ollama trend outfit generation returned", {
        trendKeyword,
        assetContext,
        audience,
        assetId: liveOllamaImage.asset?.id ?? null,
      });
      return NextResponse.json({
        imageUrl: liveOllamaImage.imageUrl,
        imageSource: liveOllamaImage.imageSource,
        assetId: liveOllamaImage.asset?.id ?? null,
        cached: false,
        status: "generated",
      } satisfies OutfitResponse);
    }

    const fallback = await resolveTrendOutfitFallback({
      trendKeyword: trendKeyword || formula,
      outfitFormula,
      outfitTitle,
      gender,
      assetContext,
      audience,
    });

    console.info("Trend outfit fallback used", {
      trendKeyword,
      assetContext,
      audience,
      imageSource: fallback.imageSource,
    });

    return NextResponse.json({
      imageUrl: fallback.imageUrl,
      imageSource: fallback.imageSource,
      assetId: fallback.asset?.id ?? null,
      cached: Boolean(fallback.asset),
      status: "fallback",
    } satisfies OutfitResponse);
  } catch (error) {
    console.error("Generate outfit route error:", error);
    return NextResponse.json(fallbackResponse(fallbackGender));
  }
}
