import { createHash } from "crypto";
import { createRequire } from "module";
import { dirname, join, sep } from "path";

const require = createRequire(import.meta.url);

export type OcrBox = {
  text: string;
  confidence: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};

export type OcrResult = {
  available: boolean;
  textDetected: boolean;
  text: string;
  confidence: number;
  boxes: OcrBox[];
  suspiciousTagLikeTextDetected?: boolean;
  suspiciousGlyphClusters?: OcrBox[];
  provider: string;
  error?: string;
};

export interface OcrProvider {
  provider: string;
  detectText(imageBuffer: Buffer): Promise<OcrResult>;
  dispose?(): Promise<void> | void;
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
      boxes: [],
      provider: this.provider,
      error: "IMAGE_OCR_PROVIDER is disabled. Configure IMAGE_OCR_PROVIDER=local_tesseract or http before approving new concept images.",
    };
  }
}

function ocrThreshold(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function compactOcrText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isTextLikeToken(value: string, minWordLength: number) {
  const normalized = value.replace(/[^A-Za-z0-9]/g, "");
  if (normalized.length < minWordLength) return false;
  return /[A-Za-z]/.test(normalized) || /\d{3,}/.test(normalized);
}

function isTagLikeRegion(box: OcrBox) {
  const bbox = box.bbox;
  if (!bbox) return false;
  const centerX = (bbox.x0 + bbox.x1) / 2;
  const centerY = (bbox.y0 + bbox.y1) / 2;
  return centerX >= 0.28 && centerX <= 0.72 && centerY >= 0.02 && centerY <= 0.38;
}

function suspiciousTagLikeClusters(words: OcrBox[], confidenceThreshold: number, minWordLength: number) {
  return words
    .map((word) => ({
      ...word,
      text: compactOcrText(word.text),
      confidence: normalizeConfidence(word.confidence),
    }))
    .filter((word) => {
      if (!word.text || !isTagLikeRegion(word)) return false;
      const normalized = word.text.replace(/[^A-Za-z0-9]/g, "");
      const looksLikeGlyphs = normalized.length >= Math.max(1, minWordLength - 1) && /[A-Za-z0-9]/.test(normalized);
      return looksLikeGlyphs && word.confidence >= 0.28 && word.confidence < confidenceThreshold;
    })
    .slice(0, 8);
}

export function classifyOcrWords(
  words: OcrBox[],
  options: {
    provider: string;
    confidenceThreshold?: number;
    minWordLength?: number;
    minTextFragments?: number;
    rawText?: string;
  },
): OcrResult {
  const confidenceThreshold = options.confidenceThreshold ?? 0.72;
  const minWordLength = options.minWordLength ?? 3;
  const minTextFragments = options.minTextFragments ?? 2;
  const confidentWords = words
    .map((word) => ({
      ...word,
      text: compactOcrText(word.text),
      confidence: normalizeConfidence(word.confidence),
    }))
    .filter((word) => word.text && word.confidence >= confidenceThreshold);

  const textLikeWords = confidentWords.filter((word) => isTextLikeToken(word.text, minWordLength));
  const averageConfidence = confidentWords.length
    ? confidentWords.reduce((sum, word) => sum + word.confidence, 0) / confidentWords.length
    : 0;
  const rawText = compactOcrText(options.rawText || words.map((word) => word.text).join(" "));
  const suspiciousGlyphClusters = suspiciousTagLikeClusters(words, confidenceThreshold, minWordLength);

  return {
    available: true,
    textDetected: textLikeWords.length >= 1 || confidentWords.length >= minTextFragments || suspiciousGlyphClusters.length > 0,
    text: rawText,
    confidence: averageConfidence,
    boxes: confidentWords,
    suspiciousTagLikeTextDetected: suspiciousGlyphClusters.length > 0,
    suspiciousGlyphClusters,
    provider: options.provider,
  };
}

function bundledTesseractLangPath() {
  try {
    return `${join(dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0")}${sep}`;
  } catch {
    return "";
  }
}

class LocalTesseractOcrProvider implements OcrProvider {
  readonly provider = "local_tesseract";
  private workerPromise: Promise<any> | null = null;
  private readonly confidenceThreshold: number;
  private readonly minWordLength: number;
  private readonly minTextFragments: number;
  private readonly langPath: string;
  private readonly cachePath: string | undefined;
  private disposed = false;

  constructor(env: NodeJS.ProcessEnv) {
    this.confidenceThreshold = ocrThreshold(env.IMAGE_OCR_MIN_CONFIDENCE, 0.72);
    this.minWordLength = Math.max(1, Number(env.IMAGE_OCR_MIN_WORD_LENGTH || 2));
    this.minTextFragments = Math.max(1, Number(env.IMAGE_OCR_MIN_FRAGMENTS || 2));
    this.langPath = env.TESSERACT_LANG_PATH || bundledTesseractLangPath();
    this.cachePath = env.TESSERACT_CACHE_PATH;
  }

  private async worker() {
    if (this.disposed) {
      throw new ImagePixelAnalysisError("local Tesseract OCR provider has been disposed");
    }
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        if (!this.langPath) {
          throw new ImagePixelAnalysisError("@tesseract.js-data/eng is required for IMAGE_OCR_PROVIDER=local_tesseract");
        }

        const tesseract: any = await import("tesseract.js");
        const worker = await tesseract.createWorker("eng", 1, {
          langPath: this.langPath,
          ...(this.cachePath ? { cachePath: this.cachePath } : {}),
          gzip: true,
          logger: () => undefined,
        });

        await worker.setParameters({
          tessedit_pageseg_mode: tesseract.PSM?.SPARSE_TEXT || "11",
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        });

        return worker;
      })();
    }
    return this.workerPromise;
  }

  private async recognizeWords(worker: any, imageBuffer: Buffer) {
    const result = await worker.recognize(imageBuffer);
    const data = result?.data || {};
    const metadata = await this.imageMetadata(imageBuffer);
    const words: OcrBox[] = Array.isArray(data.words)
      ? data.words.map((word: any) => ({
          text: String(word.text || ""),
          confidence: normalizeConfidence(word.confidence),
          bbox: word.bbox
            ? {
                x0: Number(word.bbox.x0 || 0) / Math.max(1, metadata.width),
                y0: Number(word.bbox.y0 || 0) / Math.max(1, metadata.height),
                x1: Number(word.bbox.x1 || 0) / Math.max(1, metadata.width),
                y1: Number(word.bbox.y1 || 0) / Math.max(1, metadata.height),
              }
            : undefined,
        }))
      : [];
    return { words, rawText: String(data.text || "") };
  }

  private async imageMetadata(imageBuffer: Buffer) {
    try {
      const sharp = (await import("sharp")).default;
      const metadata = await sharp(imageBuffer).metadata();
      return { width: metadata.width || 1, height: metadata.height || 1 };
    } catch {
      return { width: 1, height: 1 };
    }
  }

  private async enhancedLabelPass(imageBuffer: Buffer) {
    try {
      const sharp = (await import("sharp")).default;
      return sharp(imageBuffer)
        .rotate()
        .resize({ width: 2200, withoutEnlargement: false })
        .greyscale()
        .normalise()
        .linear(1.35, -18)
        .sharpen({ sigma: 0.8, m1: 1.2, m2: 0.45 })
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  }

  async detectText(imageBuffer: Buffer): Promise<OcrResult> {
    const worker = await this.worker();
    const primary = await this.recognizeWords(worker, imageBuffer);
    const enhancedBuffer = await this.enhancedLabelPass(imageBuffer);
    const enhanced = enhancedBuffer ? await this.recognizeWords(worker, enhancedBuffer) : { words: [], rawText: "" };
    const words = [...primary.words, ...enhanced.words];
    const rawText = [primary.rawText, enhanced.rawText].filter(Boolean).join(" ");

    return classifyOcrWords(words, {
      provider: this.provider,
      confidenceThreshold: this.confidenceThreshold,
      minWordLength: this.minWordLength,
      minTextFragments: this.minTextFragments,
      rawText,
    });
  }

  async dispose() {
    this.disposed = true;
    const workerPromise = this.workerPromise;
    this.workerPromise = null;
    if (!workerPromise) return;
    const worker = await workerPromise.catch(() => null);
    if (worker?.terminate) {
      await worker.terminate();
    }
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
      boxes: Array.isArray(payload.boxes)
        ? payload.boxes.map((box: any) => ({
            text: String(box.text || ""),
            confidence: normalizeConfidence(box.confidence),
            bbox: box.bbox,
          }))
        : [],
      provider: String(payload.provider || this.provider),
    };
  }
}

export function createOcrProvider(env: NodeJS.ProcessEnv = process.env): OcrProvider {
  const provider = (env.IMAGE_OCR_PROVIDER || "disabled").toLowerCase();
  if (provider === "local_tesseract") {
    return new LocalTesseractOcrProvider(env);
  }
  if (provider === "http") {
    const url = env.IMAGE_OCR_URL || "";
    if (!url) throw new Error("IMAGE_OCR_URL is required when IMAGE_OCR_PROVIDER=http");
    return new HttpOcrProvider(url, env.IMAGE_OCR_KEY);
  }
  return new UnavailableOcrProvider();
}

export async function disposeOcrProvider(ocrProvider: OcrProvider) {
  await ocrProvider.dispose?.();
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
    boxes: [],
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
