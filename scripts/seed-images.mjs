import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env.local");
const lookLibraryPath = path.join(rootDir, "lib", "look-library.ts");
const outputDir = path.join(rootDir, "public", "looks");
const fallbackModels = ["imagen-3.0-generate-001", "imagen-3.0-fast-generate-001", "imagegeneration@006"];
const regenerateWideLegSummerOnly = process.argv.includes("--regenerate-wide-leg-summer");
const wideLegSummerPrompt = `Editorial fashion photograph. Full body shot. White or soft ivory background. 
Male model wearing wide leg linen trousers in sand or ivory, fitted white or beige tank top, 
leather sandals, minimal chain necklace. 
Clean, minimal, magazine editorial quality. Male model facing forward. Clearly a man.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readEnvValue(key) {
  const envText = await readFile(envPath, "utf8");
  const line = envText
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith("#") && entry.startsWith(`${key}=`));

  if (!line) return "";

  const rawValue = line.slice(key.length + 1).trim();
  return rawValue.replace(/^["']|["']$/g, "");
}

function parseStringField(block, field) {
  const match = block.match(new RegExp(`${field}:\\s*"([^"]*)"`, "m"));
  return match?.[1] || "";
}

function parseArrayField(block, field) {
  const match = block.match(new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`, "m"));
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]*)"/g)).map((item) => item[1]);
}

function parseLooks(source) {
  const lookMatches = source.matchAll(/\{\n\s+id:\s*"([^"]+)",[\s\S]*?\n\s+\},/g);

  return Array.from(lookMatches).map((match) => {
    const block = match[0];
    const heroImage = parseStringField(block, "heroImage");
    return {
      id: match[1],
      block,
      title: parseStringField(block, "title"),
      trendCluster: parseStringField(block, "trendCluster"),
      heroImage,
      hasHeroImage: Boolean(heroImage),
      pieces: parseArrayField(block, "pieces"),
      aesthetic: parseStringField(block, "aesthetic"),
      colours: parseArrayField(block, "colours"),
    };
  });
}

function buildPrompt(look) {
  if (regenerateWideLegSummerOnly && look.id === "male-wide-leg-summer") {
    return wideLegSummerPrompt;
  }

  return [
    "Editorial fashion photograph. Full body shot.",
    `${look.pieces.join(", ")}.`,
    `Aesthetic: ${look.aesthetic}.`,
    `Colours: ${look.colours.join(", ")}.`,
    "Clean white background, minimal, magazine editorial quality, no text, no watermark, no logo.",
  ].join(" ");
}

function injectHeroImages(source, generatedIds) {
  let updated = source;

  for (const id of generatedIds) {
    const blockPattern = new RegExp(`(\\{\\n\\s+id:\\s*"${id}",)([\\s\\S]*?\\n\\s+\\},)`);
    const match = updated.match(blockPattern);
    if (!match) continue;
    if (regenerateWideLegSummerOnly) {
      if (/heroImage:\s*"[^"]*"/.test(match[2])) {
        updated = updated.replace(blockPattern, `$1${match[2].replace(/heroImage:\s*"[^"]*"/, `heroImage: "/looks/${id}.jpg"`)}`
        );
      } else {
        updated = updated.replace(blockPattern, `$1\n    heroImage: "/looks/${id}.jpg",$2`);
      }
      continue;
    }
    if (/heroImage:\s*"[^"]+"/.test(match[2])) continue;

    if (/heroImage:\s*""/.test(match[2])) {
      updated = updated.replace(blockPattern, `$1${match[2].replace(/heroImage:\s*"",/, `heroImage: "/looks/${id}.jpg",`)}`);
    } else {
      updated = updated.replace(blockPattern, `$1\n    heroImage: "/looks/${id}.jpg",$2`);
    }
  }

  return updated;
}

function normalizeModelName(model) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

async function listImagenModels(apiKey) {
  const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const models = await modelsRes.json();
  const imagenModels = models.models?.filter((model) => model.name.includes("imagen"));
  const names = imagenModels?.map((model) => model.name) || [];

  console.log("Available Imagen models:", names);

  return names;
}

async function resolveImageModel(apiKey) {
  const availableModels = await listImagenModels(apiKey);
  const availableSet = new Set(availableModels);

  for (const model of fallbackModels) {
    const normalized = normalizeModelName(model);
    if (availableSet.has(normalized)) return normalized;
  }

  return availableModels[0] || normalizeModelName(fallbackModels[0]);
}

async function generateImage({ apiKey, look, modelName }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${modelName}:predict?key=${apiKey}`;
  const prompt = buildPrompt(look);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: "9:16",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const payload = await response.json();
  const imageBase64 =
    payload?.predictions?.[0]?.bytesBase64Encoded ||
    payload?.predictions?.[0]?.bytesBase64 ||
    payload?.predictions?.[0]?.image?.bytesBase64Encoded;

  if (!imageBase64) {
    throw new Error("Missing predictions[0].bytesBase64Encoded in Imagen response.");
  }

  return Buffer.from(imageBase64, "base64");
}

async function main() {
  const apiKey = await readEnvValue("GEMINI_API_KEY");
  const modelName = await resolveImageModel(apiKey);
  const source = await readFile(lookLibraryPath, "utf8");
  const looks = parseLooks(source);
  const generatedIds = [];
  const skippedIds = [];
  const failedIds = [];

  await mkdir(outputDir, { recursive: true });

  console.log(`Found ${looks.length} looks in lib/look-library.ts`);
  console.log(`Using image model: ${modelName}`);

  for (const look of looks) {
    const isWideLegSummer = look.id === "male-wide-leg-summer" || look.title === "Wide Leg Summer";
    if (regenerateWideLegSummerOnly && !isWideLegSummer) {
      console.log(`SKIP ${look.id}: not Wide Leg Summer`);
      skippedIds.push(look.id);
      continue;
    }

    if (look.hasHeroImage && !regenerateWideLegSummerOnly) {
      console.log(`SKIP ${look.id}: heroImage already exists`);
      skippedIds.push(look.id);
      continue;
    }

    try {
      console.log(`Generating ${look.id}`);
      const imageBuffer = await generateImage({ apiKey, look, modelName });
      await writeFile(path.join(outputDir, `${look.id}.jpg`), imageBuffer);
      generatedIds.push(look.id);
      console.log(`OK ${look.id}`);
    } catch (error) {
      failedIds.push(look.id);
      console.error(`FAIL ${look.id}: ${error instanceof Error ? error.message : String(error)}`);
    }

    await sleep(2000);
  }

  const updatedSource = injectHeroImages(source, generatedIds);
  await writeFile(lookLibraryPath, updatedSource);

  console.log("");
  console.log(`Images generated successfully: ${generatedIds.length}`);
  console.log(`Images skipped: ${skippedIds.length}`);
  console.log(`Failed look IDs: ${failedIds.length ? failedIds.join(", ") : "none"}`);
  console.log(`heroImage values written: ${generatedIds.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
