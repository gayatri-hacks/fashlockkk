import { NextResponse } from "next/server";
import { loadProductsData } from "@/lib/data";
import { productFiltersSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters = productFiltersSchema.parse({
      search: url.searchParams.get("search") ?? "",
      source: url.searchParams.get("source") ?? "",
      brand: url.searchParams.get("brand") ?? "",
      category: url.searchParams.get("category") ?? "",
      color: url.searchParams.get("color") ?? "",
    });

    const data = await loadProductsData(filters);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
