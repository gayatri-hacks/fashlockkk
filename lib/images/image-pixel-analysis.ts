import { createHash } from "crypto";

export type OcrResult = {
  available: boolean;
  textDetected: boolean;
  text: string;
  confidence: number;
  provider: string;
  error?: string;
};

export interface OcrProvider {
  provider: string;
  detectText(imageBuffer: Buffer): Promise<OcrResult>;
}

export type ImagePixelAnalysis = {
  width: number;
  height: number;
  aspectRatio: number;
  sharpness: number;
  brightness: number;
  contrast: number;
  overexposed: boolean;
  underexposed: boolean;
  dominantPalette: string;
  dominantColor: string;
  dominantColors: string[];
  perceptualHash: string;
  ocr: OcrResult;
  integrityHash: string;
};

export class ImagePixelAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePixelAnalysisError";
  }
}

class UnavailableOcrProvider implements OcrProvider {
  readonly provider = "unavailable";

  async detectText(): Promise<OcrResult> {
    return {
      available: false,
      textDetected: false,
      text: "",
      confidence: 0,
      provider: this.provider,
      error: "IMAGE_OCR_PROVIDER is not configured. Configure tesseract.js or a maintained OCR service before approving new concept images.",
    };
  }
}

class HttpOcrProvider implements OcrProvider {
  readonly provider = "http";

  constructor(private readonly url: string, private readonly key: string | undefined) {}

  async detectText(imageBuffer: Buffer): Promise<OcrResult> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}),
      },
      body: JSON.stringify({ imageBase64: imageBuffer.toString("base64") }),
    });

    if (!response.ok) throw new ImagePixelAnalysisError(`OCR provider returned ${response.status}`);
    const payload = await response.json();
    return {
      available: true,
      textDetected: Boolean(payload.textDetected),
      text: String(payload.text || ""),
      confidence: Number(payload.confidence || 0),
      provider: String(payload.provider || this.provider),
    };
  }
}

export function createOcrProvider(env: NodeJS.ProcessEnv = process.env): OcrProvider {
  const provider = (env.IMAGE_OCR_PROVIDER || "").toLowerCase();
  if (provider === "http") {
    const url = env.IMAGE_OCR_URL || "";
    if (!url) throw new Error("IMAGE_OCR_URL is required when IMAGE_OCR_PROVIDER=http");
    return new HttpOcrProvider(url, env.IMAGE_OCR_KEY);
  }
  return new UnavailableOcrProvider();
}

function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function paletteFamilyForColor([r, g, b]: [number, number, number]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const brightness = max / 255;

  if (brightness > 0.82 && saturation < 0.16) return "ivory/white";
  if (brightness < 0.28) return "black/charcoal";
  if (r > 120 && g > 90 && b < 90 && saturation < 0.45) return "beige/taupe";
  if (b > r * 1.1 && b > g * 0.9) return "blue/indigo";
  if (g > r * 0.9 && g > b * 1.05) return "green/olive";
  if (r > g * 1.15 && r > b * 1.15) return "red/maroon";
  if (r > 120 && g > 95 && b < 85) return "brown/saffron";
  return "mixed neutral";
}

function hexColor([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hashBitsFromLuma(values: number[]) {
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return values.map((value) => (value >= average ? "1" : "0")).join("");
}

function variance(values: number[]) {
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, values.length);
}

function laplacianSharpness(gray: number[], width: number, height: number) {
  const samples: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = gray[y * width + x] * 4;
      const edge = gray[(y - 1) * width + x] + gray[(y + 1) * width + x] + gray[y * width + x - 1] + gray[y * width + x + 1];
      samples.push(Math.abs(center - edge));
    }
  }
  return Math.min(1, Math.sqrt(variance(samples)) / 60);
}

export async function analyzeImagePixels(
  imageBuffer: Buffer,
  options: { ocrProvider?: OcrProvider } = {},
): Promise<ImagePixelAnalysis> {
  let sharpModule: any;
  try {
    sharpModule = (await import("sharp")).default;
  } catch {
    throw new ImagePixelAnalysisError("sharp is required for trend concept pixel validation");
  }

  const decoded = await sharpModule(imageBuffer).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = Number(decoded.info.width);
  const height = Number(decoded.info.height);
  const channels = Number(decoded.info.channels);
  if (!width || !height || channels < 3) throw new ImagePixelAnalysisError("image could not be decoded into RGB pixels");

  const gray: number[] = [];
  const histogram = new Map<string, { rgb: [number, number, number]; count: number }>();
  let lumaSum = 0;
  let under = 0;
  let over = 0;

  for (let offset = 0; offset < decoded.data.length; offset += channels) {
    const r = decoded.data[offset];
    const g = decoded.data[offset + 1];
    const b = decoded.data[offset + 2];
    const y = luma(r, g, b);
    gray.push(y);
    lumaSum += y;
    if (y < 18) under += 1;
    if (y > 240) over += 1;

    const bucket: [number, number, number] = [
      Math.round(r / 32) * 32,
      Math.round(g / 32) * 32,
      Math.round(b / 32) * 32,
    ];
    const key = bucket.join(",");
    const existing = histogram.get(key);
    if (existing) existing.count += 1;
    else histogram.set(key, { rgb: bucket, count: 1 });
  }

  const sortedColors = [...histogram.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const dominantRgb = sortedColors[0]?.rgb || [128, 128, 128];
  const small = await sharpModule(imageBuffer).rotate().resize(8, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  const ocrProvider = options.ocrProvider || createOcrProvider();
  const ocr = await ocrProvider.detectText(imageBuffer).catch((error: unknown) => ({
    available: false,
    textDetected: false,
    text: "",
    confidence: 0,
    provider: ocrProvider.provider,
    error: error instanceof Error ? error.message : String(error),
  }));

  const pixelCount = width * height;
  const brightness = lumaSum / Math.max(1, pixelCount) / 255;

  return {
    width,
    height,
    aspectRatio: width / height,
    sharpness: laplacianSharpness(gray, width, height),
    brightness,
    contrast: Math.min(1, Math.sqrt(variance(gray)) / 90),
    overexposed: over / Math.max(1, pixelCount) > 0.35 || brightness > 0.93,
    underexposed: under / Math.max(1, pixelCount) > 0.35 || brightness < 0.08,
    dominantPalette: paletteFamilyForColor(dominantRgb),
    dominantColor: hexColor(dominantRgb),
    dominantColors: sortedColors.map((item) => hexColor(item.rgb)),
    perceptualHash: hashBitsFromLuma([...small]),
    ocr,
    integrityHash: createHash("sha256").update(imageBuffer).digest("hex"),
  };
}

export async function downloadImagePixels(imageUrl: string) {
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new ImagePixelAnalysisError(`image download returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
