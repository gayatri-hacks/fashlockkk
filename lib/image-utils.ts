export function thumbnailUrl(url: string | null | undefined, width = 320, height = width) {
  if (!url) return "";

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("supabase.co") && parsed.pathname.includes("/storage/v1/object/public/")) {
      parsed.pathname = parsed.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
      parsed.searchParams.set("width", String(width));
      parsed.searchParams.set("height", String(height));
      parsed.searchParams.set("resize", "cover");
      return parsed.toString();
    }

    if (parsed.hostname.includes("images.unsplash.com")) {
      parsed.searchParams.set("w", String(width));
      parsed.searchParams.set("q", "70");
      parsed.searchParams.set("fit", "crop");
      return parsed.toString();
    }

    return url;
  } catch {
    return url;
  }
}
