import { NextResponse } from "next/server";
import {
  DEFAULT_OLLAMA_IMAGE_MODEL,
  DEFAULT_OLLAMA_IMAGE_SIZE,
  buildTrendImageJobPayload,
  getGeneratedFashionImage,
} from "@/lib/images/generated-fashion-images";
import {
  buildTrendCardOutfitFormula,
  resolveTrendOutfitFallback,
  type TrendOutfitAssetSource,
} from "@/lib/trend-outfit-assets";
import { syntheticTrendIdForKeyword } from "@/lib/images/build-fashion-image-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 86400;

type Gender = "women" | "men";

type OutfitResponse = {
  imageUrl: string | null;
  imageSource: TrendOutfitAssetSource;
  assetId?: number | null;
  cached?: boolean;
  status?: "cached" | "generated" | "fallback" | "pending";
};

function unavailableResponse(): OutfitResponse {
  return {
    imageUrl: null,
    imageSource: "fallback",
    assetId: null,
    cached: false,
    status: "pending",
  };
}

function variantForRequest({
  assetContext,
  gender,
}: {
  assetContext: string;
  gender: Gender;
}) {
  if (assetContext === "trend-card") return "trend_hero" as const;
  return gender === "men" ? ("trend_men" as const) : ("trend_women" as const);
}

export async function POST(req: Request) {
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
    const trendId = Number(body.trendId || body.entityId || body.id || 0);
    const variant = variantForRequest({ assetContext, gender });
    const outfitFormula = formula || buildTrendCardOutfitFormula(trendKeyword || outfitTitle, audience);

    const candidateTrendIds = Array.from(
      new Set(
        [
          Number.isFinite(trendId) && trendId !== 0 ? trendId : null,
          trendKeyword ? syntheticTrendIdForKeyword(trendKeyword) : null,
        ].filter((id): id is number => typeof id === "number"),
      ),
    );

    for (const candidateTrendId of candidateTrendIds) {
      const exactPayload =
        assetContext === "trend-detail" && formula
          ? buildTrendImageJobPayload({
              trend: {
                id: candidateTrendId,
                keyword: trendKeyword || formula,
                editorialName: trendKeyword || outfitTitle,
              },
              variant,
              outfitFormula,
              outfitOccasion: occasion || outfitTitle,
              gender,
              model: DEFAULT_OLLAMA_IMAGE_MODEL,
              imageSize: DEFAULT_OLLAMA_IMAGE_SIZE,
            })
          : null;

      const generatedImage = await getGeneratedFashionImage({
        entityType: "trend",
        entityId: candidateTrendId,
        variant,
        promptHash: exactPayload?.prompt_hash,
      });

      if (generatedImage?.image_url) {
        return NextResponse.json({
          imageUrl: generatedImage.image_url,
          imageSource: "ollama",
          assetId: null,
          cached: true,
          status: "cached",
        } satisfies OutfitResponse);
      }
    }

    if (assetContext === "trend-detail") {
      return NextResponse.json(unavailableResponse());
    }

    const fallback = await resolveTrendOutfitFallback({
      trendKeyword: trendKeyword || formula,
      outfitFormula,
      outfitTitle,
      gender,
      assetContext,
      audience,
    });

    return NextResponse.json({
      imageUrl: fallback.imageUrl,
      imageSource: fallback.imageSource,
      assetId: fallback.asset?.id ?? null,
      cached: Boolean(fallback.asset),
      status: "fallback",
    } satisfies OutfitResponse);
  } catch (error) {
    console.error("Outfit image lookup route error:", error);
    return NextResponse.json(unavailableResponse());
  }
}
