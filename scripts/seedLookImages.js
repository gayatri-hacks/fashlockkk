const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  const contents = fs.readFileSync(envPath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function findPexelsImage(query) {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "5");
  url.searchParams.set("orientation", "portrait");

  const response = await fetch(url, {
    headers: {
      Authorization: process.env.PEXELS_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Pexels ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.photos?.[0]?.src?.large || null;
}

async function main() {
  loadEnvLocal();

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: looks, error } = await supabase
    .from("look_edits")
    .select("id,title,category,aesthetic,hero_image")
    .is("hero_image", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load look_edits: ${error.message}`);
  }

  if (!looks?.length) {
    console.log("No look_edits rows need images.");
    return;
  }

  console.log(`Found ${looks.length} look_edits rows without hero_image.`);

  for (const look of looks) {
    const query = `${look.aesthetic || ""} ${look.category || ""} fashion outfit`.trim();

    try {
      const imageUrl = await findPexelsImage(query);
      if (!imageUrl) {
        console.log(`No Pexels image found: ${look.title} (${query})`);
        continue;
      }

      const { error: updateError } = await supabase
        .from("look_edits")
        .update({ hero_image: imageUrl })
        .eq("id", look.id);

      if (updateError) {
        console.log(`Failed to update ${look.title}: ${updateError.message}`);
        continue;
      }

      console.log(`Updated ${look.title}: ${imageUrl}`);
    } catch (rowError) {
      console.log(`Failed ${look.title}: ${rowError.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
