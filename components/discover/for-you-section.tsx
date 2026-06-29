"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Gender = "female" | "male";

type ForYouTrend = {
  keyword: string;
  velocity: number;
  heroImage?: string;
  trendCluster?: string;
  matchedLookId?: string;
  imageSource?: string;
};

type ForYouResponse = {
  gender: Gender;
  personalized: boolean;
  trends: ForYouTrend[];
};

type LookVariation = {
  title: string;
  formula: string;
  pieces: string[];
  stylingNote: string;
  evidenceSources: Array<{ title: string; url: string; source: string }>;
  shopTerms: string[];
};

type ProductCard = {
  title: string;
  price: string;
  imageUrl: string;
  link: string;
  source: string;
};

function velocityLabel(value: number) {
  const percent = Math.round(value * 100);
  if (!Number.isFinite(percent)) return "TRENDING";
  if (Math.abs(percent) > 999) return "UP NOW";
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

function detectProductCategory(text: string) {
  const lower = text.toLowerCase();
  if (/\b(lehenga|saree|sari|kurta|salwar|anarkali|dupatta|ethnic|sherwani)\b/.test(lower)) return "ethnic";
  if (/\b(gym|workout|activewear|training|sports bra|leggings|joggers|running)\b/.test(lower)) return "activewear";
  if (/\b(luxury|designer|premium|cocktail|silk|cashmere|occasion)\b/.test(lower)) return "premium";
  if (/\b(streetwear|cargo|oversized|sneaker|hoodie)\b/.test(lower)) return "street";
  return "western";
}

function LoadingSection() {
  return (
    <section className="bg-[#FAF7F4] px-5 pb-8 pt-7 md:px-[120px] md:pb-12 md:pt-10" aria-label="For You loading">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="fashlock-skeleton mb-3 h-3 w-36 rounded-[2px]" />
          <div className="fashlock-skeleton h-11 w-64 rounded-[2px]" />
        </div>
        <div className="fashlock-skeleton hidden h-9 w-28 rounded-full md:block" />
      </div>
      <div className="scrollbar-none flex gap-4 overflow-x-auto pb-3">
        {[0, 1, 2, 3].map((item) => (
          <div className="fashlock-skeleton h-[310px] w-[250px] shrink-0 rounded-[2px]" key={item} />
        ))}
      </div>
    </section>
  );
}

function EmptyImage({ keyword }: { keyword: string }) {
  return (
    <div className="flex h-full w-full items-end bg-[#F0EBE3] p-5">
      <div>
        <p className="mb-3 text-[8px] font-[200] uppercase tracking-[4px] text-[#B03A5B]">SEE MORE TRENDS</p>
        <p className="text-[30px] font-[300] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)]">
          {keyword}
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#B03A5B] px-3 py-2 text-[9px] font-[300] uppercase tracking-[2px] text-[#B03A5B]" style={{ borderWidth: 0.5 }}>
          Open Trends <ArrowUpRight size={12} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

function ProductRow({ products }: { products: ProductCard[] }) {
  if (!products.length) return null;

  return (
    <div className="mt-6">
      <p className="mb-3 text-[8px] font-[200] uppercase tracking-[4px] text-[#B03A5B]">SHOP THIS LOOK</p>
      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">
        {products.map((product) => (
          <a
            className="w-[150px] shrink-0 border border-[#D4C8BC] bg-[#FAF7F4] p-2 text-[#2C2418] transition hover:border-[#B03A5B]"
            href={product.link}
            key={`${product.title}-${product.link}`}
            rel="noopener noreferrer"
            target="_blank"
            style={{ borderWidth: 0.5 }}
          >
            <img className="mb-3 aspect-[3/4] w-full bg-[#E8E0D4] object-cover" src={product.imageUrl} alt={product.title} />
            <p className="line-clamp-2 text-[11px] font-[300] leading-4">{product.title}</p>
            <p className="mt-1 text-[10px] font-[300] text-[#B03A5B]">{product.price}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

export function ForYouSection() {
  const [gender, setGender] = useState<Gender>("female");
  const [payload, setPayload] = useState<ForYouResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeTrend, setActiveTrend] = useState<ForYouTrend | null>(null);
  const [variations, setVariations] = useState<LookVariation[]>([]);
  const [variationSource, setVariationSource] = useState("");
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setFailed(false);
    fetch(`/api/discover/for-you?gender=${gender}`)
      .then((response) => {
        if (!response.ok) throw new Error(`For You failed with ${response.status}`);
        return response.json() as Promise<ForYouResponse>;
      })
      .then((data) => {
        if (active) {
          console.info(
            "Discover For You cards:",
            data.trends.map((trend) => ({
              keyword: trend.keyword,
              matchedLookId: trend.matchedLookId || null,
              trendCluster: trend.trendCluster || null,
              heroImage: trend.heroImage || null,
              imageSource: trend.imageSource || "unknown",
            })),
          );
          setPayload(data);
        }
      })
      .catch((error) => {
        console.error("Discover For You failed:", error);
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [gender]);

  async function openTrend(trend: ForYouTrend) {
    if (!trend.trendCluster && !trend.matchedLookId) {
      window.location.href = `/trends?search=${encodeURIComponent(trend.keyword)}`;
      return;
    }

    setActiveTrend(trend);
    setVariations([]);
    setVariationSource("");
    setProducts([]);
    setDrawerLoading(true);

    try {
      console.info("Discover For You opening trend:", {
        keyword: trend.keyword,
        matchedLookId: trend.matchedLookId || null,
        trendCluster: trend.trendCluster || null,
        imageSource: trend.imageSource || "unknown",
      });
      const response = await fetch("/api/style/look-variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookId: trend.matchedLookId,
          trendCluster: trend.trendCluster,
        }),
      });
      const data = await response.json();
      setVariations(Array.isArray(data.variations) ? data.variations : []);
      setVariationSource(typeof data.source === "string" ? data.source : "");
    } catch (error) {
      console.error("For You look variations failed:", error);
      setVariations([]);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function shopVariation(variation: LookVariation) {
    const searchTerms = variation.shopTerms?.length ? variation.shopTerms.slice(0, 3) : [variation.formula, ...variation.pieces].filter(Boolean).slice(0, 3);
    setProducts([]);
    setProductsLoading(true);

    try {
      for (const searchQuery of searchTerms) {
        const response = await fetch("/api/style/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchQuery,
            category: detectProductCategory(searchQuery),
            gender,
          }),
        });
        const data = response.ok ? await response.json() : { products: [] };
        const nextProducts = Array.isArray(data.products) ? data.products : [];
        if (nextProducts.length || searchQuery === searchTerms.at(-1)) {
          setProducts(nextProducts);
          break;
        }
      }
    } catch (error) {
      console.error("For You products failed:", error);
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }

  if (failed) return null;
  if (loading) return <LoadingSection />;
  if (!payload?.trends.length) return null;

  return (
    <section className="border-t border-[#D4C8BC] bg-[#FAF7F4] px-5 pb-8 pt-7 md:px-[120px] md:pb-12 md:pt-10" style={{ borderTopWidth: 0.5 }} aria-label="For You">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-[10px] text-[8px] font-[200] uppercase tracking-[5px] text-[#B03A5B]">
            {payload.personalized ? "TRENDING FOR YOU" : "WHAT'S TRENDING"}
          </p>
          <h2 className="text-[42px] font-[300] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)] md:text-[58px]">
            Your next style signal.
          </h2>
        </div>
        <div className="flex rounded-full border border-[#D4C8BC] bg-[#F0EBE3] p-1" style={{ borderWidth: 0.5 }}>
          {(["female", "male"] as Gender[]).map((item) => (
            <button
              className={cn(
                "rounded-full px-4 py-2 text-[10px] font-[300] uppercase tracking-[2px] transition",
                gender === item ? "bg-[#B03A5B] text-[#FAF7F4]" : "text-[#8C7B6E] hover:text-[#2C2418]",
              )}
              key={item}
              onClick={() => setGender(item)}
              type="button"
            >
              {item === "female" ? "HER" : "HIM"}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-none flex snap-x gap-4 overflow-x-auto pb-3">
        {payload.trends.map((trend) => (
          <button
            className="group w-[255px] shrink-0 snap-start overflow-hidden border border-[#D4C8BC] bg-[#F0EBE3] text-left transition hover:border-[#B03A5B]"
            key={`${trend.keyword}-${trend.trendCluster || "trend"}`}
            onClick={() => void openTrend(trend)}
            style={{ borderWidth: 0.5 }}
            type="button"
          >
            <div className="aspect-[4/5] overflow-hidden bg-[#E8E0D4]">
              {trend.heroImage ? (
                <img className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" src={trend.heroImage} alt={trend.keyword} />
              ) : (
                <EmptyImage keyword={trend.keyword} />
              )}
            </div>
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[8px] font-[200] uppercase tracking-[3px] text-[#B03A5B]">{velocityLabel(trend.velocity)}</p>
                {trend.trendCluster ? <p className="text-[8px] font-[200] uppercase tracking-[2px] text-[#8C7B6E]">STYLE IDEAS</p> : null}
              </div>
              <h3 className="text-[28px] font-[300] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)]">
                {trend.keyword}
              </h3>
              {trend.trendCluster ? <p className="mt-3 text-[11px] font-[300] uppercase tracking-[2px] text-[#8C7B6E]">{trend.trendCluster.replace(/-/g, " ")}</p> : null}
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {activeTrend ? (
          <motion.div
            animate={{ y: 0 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto border-t border-[#D4C8BC] bg-[#FAF7F4] shadow-[0_-20px_60px_rgba(44,36,24,0.18)]"
            exit={{ y: "100%" }}
            initial={{ y: "100%" }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ borderTopWidth: 0.5 }}
          >
            <button className="absolute right-5 top-5 text-[#2C2418]" onClick={() => setActiveTrend(null)} type="button" aria-label="Close For You details">
              <X size={20} strokeWidth={1.5} />
            </button>
            <div className="px-5 py-8 md:px-[120px] md:py-12">
              <p className="mb-3 text-[8px] font-[200] uppercase tracking-[5px] text-[#B03A5B]">HOW THIS IS STYLED NOW</p>
              <h2 className="max-w-3xl text-[44px] font-[300] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)] md:text-[68px]">
                {activeTrend.keyword}
              </h2>
              {variationSource ? <p className="mt-3 text-[11px] font-[300] uppercase tracking-[3px] text-[#8C7B6E]">Source: {variationSource}</p> : null}

              {drawerLoading ? <p className="mt-8 text-[13px] font-[300] text-[#8C7B6E]">Reading current styling signals...</p> : null}

              {!drawerLoading ? (
                <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {variations.map((variation) => (
                    <article className="border border-[#D4C8BC] bg-[#F0EBE3] p-5" key={`${variation.title}-${variation.formula}`} style={{ borderWidth: 0.5 }}>
                      <h3 className="text-[24px] font-[300] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)]">{variation.title}</h3>
                      <p className="mt-3 text-[12px] font-[300] leading-5 text-[#8C7B6E]">{variation.formula}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {variation.pieces.slice(0, 6).map((piece) => (
                          <span className="rounded-full border border-[#D4C8BC] bg-[#FAF7F4] px-3 py-2 text-[10px] font-[300] text-[#2C2418]" key={piece} style={{ borderWidth: 0.5 }}>
                            {piece}
                          </span>
                        ))}
                      </div>
                      {variation.stylingNote ? <p className="mt-4 text-[12px] font-[300] italic leading-5 text-[#2C2418]">{variation.stylingNote}</p> : null}
                      {variation.evidenceSources?.length ? (
                        <div className="mt-4 space-y-2">
                          {variation.evidenceSources.slice(0, 3).map((source) => (
                            <a className="block text-[10px] font-[300] uppercase tracking-[2px] text-[#B03A5B]" href={source.url} key={`${source.title}-${source.url}`} rel="noopener noreferrer" target="_blank">
                              {source.source || source.title}
                            </a>
                          ))}
                        </div>
                      ) : null}
                      <button className="mt-5 rounded-full border border-[#B03A5B] px-4 py-3 text-[11px] font-[300] text-[#B03A5B] transition hover:bg-[#B03A5B] hover:text-[#FAF7F4]" onClick={() => void shopVariation(variation)} type="button" style={{ borderWidth: 0.5 }}>
                        {productsLoading ? "Shopping..." : "Shop This Look"}
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}

              {!drawerLoading && !variations.length ? <p className="mt-8 text-[13px] font-[300] text-[#8C7B6E]">No variations found yet.</p> : null}
              <ProductRow products={products} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
