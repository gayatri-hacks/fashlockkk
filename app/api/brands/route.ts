import { NextResponse } from "next/server";
import { loadBrandsData } from "@/lib/data";

export async function GET() {
  try {
    const data = await loadBrandsData();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
