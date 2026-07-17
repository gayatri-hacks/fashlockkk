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

const IMAGEN_MODEL = process.env.TREND_OUTFIT_IMAGE_MODEL || "imagen-4.0-generate-001";

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

async function generateExactOutfitImage({
  trendKeyword,
  outfitFormula,
  outfitTitle,
  occasion,
  gender,
  audience,
}: {
  trendKeyword: string;
  outfitFormula: string;
  outfitTitle: string;
  occasion: string;
  gender: Gender;
  audience: string;
}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !outfitFormula.trim()) return null;

  const modelDescription = gender === "men" ? "one adult male fashion model" : "one adult female fashion model";
  const audienceDirection =
    audience === "him" || gender === "men"
      ? "Make this a menswear outfit. Do not use womenswear pieces unless they are explicitly named."
      : "Make this a womenswear outfit. Do not use menswear pieces unless they are explicitly named.";
  const prompt = [
    "Photorealistic fashion ecommerce lookbook photograph.",
    "Generate a NEW image for this exact outfit formula, not a generic trend image.",
    audienceDirection,
    `Subject: ${modelDescription}, full body visible from head to toe.`,
    "Shoes and feet must be visible. Camera far enough back. No cropping.",
    "Clean warm ivory studio background. Modern premium styling. Natural pose.",
    `Trend: ${trendKeyword || "fashion trend"}.`,
    `Outfit title: ${outfitTitle}.`,
    occasion ? `Occasion: ${occasion}.` : "",
    `Exact outfit formula to show: ${outfitFormula}.`,
    "Every garment in the formula must be visibly represented.",
    "No text, no logos, no watermark, no collage, no props, no extra people.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "3:4",
          personGeneration: "allow_adult",
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Exact trend outfit image failed:", IMAGEN_MODEL, response.status, await response.text());
      return null;
    }

    const payload = await response.json();
    const imageBase64 =
      payload?.predictions?.[0]?.bytesBase64Encoded ||
      payload?.predictions?.[0]?.bytesBase64 ||
      payload?.predictions?.[0]?.image?.bytesBase64Encoded;

    if (!imageBase64) {
      console.error("Exact trend outfit image missing bytes:", IMAGEN_MODEL);
      return null;
    }

    const mimeType = payload?.predictions?.[0]?.mimeType || "image/png";
    return `data:${mimeType};base64,${imageBase64}`;
  } catch (error) {
    console.error("Exact trend outfit image skipped:", error instanceof Error ? error.message : String(error));
    return null;
  }
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

    const exactGeneratedImage = await generateExactOutfitImage({
      trendKeyword: trendKeyword || formula,
      outfitFormula,
      outfitTitle,
      occasion,
      gender,
      audience,
    });

    if (exactGeneratedImage) {
      console.info("Exact trend outfit image generated", {
        trendKeyword,
        assetContext,
        audience,
        outfitTitle,
      });
      return NextResponse.json({
        imageUrl: exactGeneratedImage,
        imageSource: "gemini",
        assetId: null,
        cached: false,
        status: "generated",
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
