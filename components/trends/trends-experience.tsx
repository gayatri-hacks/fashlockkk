"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, Flame, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { TrendGender } from "@/lib/unsplash";
import { thumbnailUrl } from "@/lib/image-utils";
import type { ProductRow, TrendRow } from "@/lib/types";
import { cn, formatPercent } from "@/lib/utils";

type StatusFilter = "All" | TrendRow["status"];
type FacetFilter = "All" | string;

type TrendMeta = {
  score: number;
  weeksFromPeak: number;
  colour: string;
  cloth: string;
  garment: string;
  region: string;
  vibe: string;
};

const GENDERS: TrendGender[] = ["Women", "Men", "Unisex"];
const STATUS_FILTERS: StatusFilter[] = ["All", "Rising", "Stable", "Declining"];
const GARMENTS = ["All", "Dresses", "Shirts", "Trousers", "Outerwear", "Footwear", "Accessories", "Ethnic", "Sets"];
const COLOURS = ["All", "White", "Black", "Blue", "Red", "Green", "Brown", "Pastel", "Metallic", "Neutral"];
const CLOTHS = ["All", "Denim", "Cotton", "Linen", "Leather", "Silk", "Knit", "Sheer", "Satin", "Handloom"];
const REGIONS = ["All", "India", "Seoul", "Paris", "Tokyo", "New York", "London", "Milan"];
const VIBES = ["All", "Minimal", "Street", "Classic", "Romantic", "Bold", "Craft"];
const BODY_FOCUS = ["All", "Elongate legs", "Define waist", "Balance shoulders", "Add structure", "Soft volume"];

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function inferTrendMeta(trend: TrendRow): TrendMeta {
  const text = `${trend.keyword} ${trend.category ?? ""}`.toLowerCase();

  const garment = includesAny(text, ["dress", "gown", "maxi", "frock"])
    ? "Dresses"
    : includesAny(text, ["shirt", "tee", "top", "blouse", "cropped"])
      ? "Shirts"
      : includesAny(text, ["trouser", "pant", "jean", "cargo", "flared", "wide leg", "baggy"])
        ? "Trousers"
        : includesAny(text, ["coat", "jacket", "blazer", "trench", "varsity"])
          ? "Outerwear"
          : includesAny(text, ["shoe", "sneaker", "heel", "boot", "sandal"])
            ? "Footwear"
            : includesAny(text, ["bag", "belt", "jewel", "watch", "scarf"])
              ? "Accessories"
              : includesAny(text, ["sari", "saree", "kurta", "lehenga", "dupatta", "ikat", "embroidered"])
                ? "Ethnic"
                : "Sets";

  const colour = includesAny(text, ["white", "ivory", "cream"])
    ? "White"
    : includesAny(text, ["black", "charcoal", "monochrome"])
      ? "Black"
      : includesAny(text, ["blue", "navy", "indigo"])
        ? "Blue"
        : includesAny(text, ["red", "burgundy", "maroon"])
          ? "Red"
          : includesAny(text, ["green", "olive"])
            ? "Green"
            : includesAny(text, ["brown", "tan", "camel", "beige"])
              ? "Brown"
              : includesAny(text, ["pastel", "pink", "lavender", "mint", "floral"])
                ? "Pastel"
                : includesAny(text, ["metal", "silver", "gold", "chrome"])
                  ? "Metallic"
                  : "Neutral";

  const cloth = includesAny(text, ["denim", "jean"])
    ? "Denim"
    : includesAny(text, ["linen"])
      ? "Linen"
      : includesAny(text, ["leather"])
        ? "Leather"
        : includesAny(text, ["silk"])
          ? "Silk"
          : includesAny(text, ["knit", "wool", "crochet"])
            ? "Knit"
            : includesAny(text, ["sheer", "mesh", "lace"])
              ? "Sheer"
              : includesAny(text, ["satin"])
                ? "Satin"
                : includesAny(text, ["handloom", "ikat", "khadi", "embroidered"])
                  ? "Handloom"
                  : "Cotton";

  const vibe = includesAny(text, ["minimal", "monochrome", "linen", "tailored"])
    ? "Minimal"
    : includesAny(text, ["street", "cargo", "baggy", "oversized", "varsity", "graphic"])
      ? "Street"
      : includesAny(text, ["blazer", "trench", "tailored", "pleated"])
        ? "Classic"
        : includesAny(text, ["floral", "lace", "satin", "maxi"])
          ? "Romantic"
          : includesAny(text, ["leather", "metal", "cropped"])
            ? "Bold"
            : includesAny(text, ["ikat", "handloom", "embroidered", "kurta"])
              ? "Craft"
              : "Minimal";

  const regions = ["India", "Seoul", "Paris", "Tokyo", "New York", "London", "Milan"];
  const region = regions[trend.keyword.split("").reduce((total, char) => total + char.charCodeAt(0), 0) % regions.length];
  const growthScore = Math.max(0, Math.min(60, trend.growthPercentage * 1.2));
  const countScore = Math.max(0, Math.min(40, trend.currentCount * 1.4));
  const score = Math.round(Math.max(8, Math.min(100, growthScore + countScore)));
  const weeksFromPeak =
    trend.status === "Declining"
      ? 0
      : trend.status === "Stable"
        ? Math.max(1, Math.round(6 - Math.min(4, trend.currentCount / 20)))
        : Math.max(2, Math.round(10 - Math.min(7, score / 13)));

  return { score, weeksFromPeak, colour, cloth, garment, region, vibe };
}

function statusMeta(status: TrendRow["status"]) {
  if (status === "Rising") return { label: "Rising", icon: ArrowUpRight, tone: "border-success/20 bg-success/10 text-success" };
  if (status === "Declining") return { label: "Cooling", icon: ArrowDownRight, tone: "border-danger/20 bg-danger/10 text-danger" };
  return { label: "Stable", icon: ArrowRight, tone: "border-accent/15 bg-accentSoft text-accent" };
}

function productMatchesTrend(product: ProductRow, trend: TrendRow) {
  const tokens = tokenize(trend.keyword);
  const text = `${product.title} ${product.brand} ${product.category} ${product.color}`.toLowerCase();
  return tokens.some((token) => text.includes(token));
}

function productMatchesMeta(product: ProductRow, meta: TrendMeta) {
  const text = `${product.title} ${product.category} ${product.color}`.toLowerCase();
  return (
    text.includes(meta.garment.toLowerCase().replace(/s$/, "")) ||
    text.includes(meta.cloth.toLowerCase()) ||
    text.includes(meta.colour.toLowerCase())
  );
}

function productsForTrend(trend: TrendRow, productRows: ProductRow[], limit = 8) {
  const meta = inferTrendMeta(trend);
  const withImages = productRows.filter((product) => product.image_url);
  const exact = withImages.filter((product) => productMatchesTrend(product, trend));
  const related = withImages.filter((product) => productMatchesMeta(product, meta));
  const seen = new Set<number>();

  return [...exact, ...related, ...withImages]
    .filter((product) => {
      if (seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    })
    .slice(0, limit);
}

function bodyAdvice(focus: string, meta: TrendMeta) {
  if (focus === "Elongate legs") return `Try ${meta.garment.toLowerCase()} with a higher waist, vertical line, or tonal shoe pairing.`;
  if (focus === "Define waist") return `Balance the trend with a tuck, belt, wrap shape, or cropped layer around the waist.`;
  if (focus === "Balance shoulders") return `Keep the shoulder clean and move volume to the lower half or hemline.`;
  if (focus === "Add structure") return `Choose sharper fabric, cleaner seams, or a jacket layer so the trend looks intentional.`;
  if (focus === "Soft volume") return `Pick relaxed volume with movement instead of stiff bulk, especially in ${meta.cloth.toLowerCase()}.`;
  return `Use this as a styling cue: choose one ${meta.vibe.toLowerCase()} piece, then keep the rest of the outfit simple.`;
}

function vibeAdvice(vibe: string, meta: TrendMeta) {
  const active = vibe === "All" ? meta.vibe : vibe;
  if (active === "Street") return "Wear it with heavier proportions, relaxed bottoms, sneakers, and one sharp accessory.";
  if (active === "Classic") return "Keep it tailored, neutral, and clean. Let fit and fabric do the work.";
  if (active === "Romantic") return "Soften it with drape, sheen, delicate color, or a curved silhouette.";
  if (active === "Bold") return "Use contrast: one statement piece, one quiet base, no clutter.";
  if (active === "Craft") return "Lean into texture, handwork, and earthy styling rather than over-accessorizing.";
  return "Keep it minimal: strong silhouette, limited color, clean shoes.";
}

function filterProduct(product: ProductRow, filters: { garment: string; colour: string; cloth: string; search: string }) {
  const text = `${product.title} ${product.brand} ${product.category} ${product.color}`.toLowerCase();
  return (
    (filters.garment === "All" || text.includes(filters.garment.toLowerCase().replace(/s$/, ""))) &&
    (filters.colour === "All" || text.includes(filters.colour.toLowerCase())) &&
    (filters.cloth === "All" || text.includes(filters.cloth.toLowerCase())) &&
    (!filters.search.trim() || text.includes(filters.search.toLowerCase()))
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-[145px] flex-col gap-1">
      <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text outline-none focus:border-accent"
      >
        {options.map((option) => (
          <option key={`${label}-${option}`} value={option}>
            {option === "Declining" ? "Cooling" : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProductTile({ product }: { product: ProductRow }) {
  return (
    <a
      href={product.product_url}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-lg border border-border bg-white transition hover:border-accent/40"
    >
      <div className="aspect-[4/5] bg-[#f7f5f1] p-2">
        <img src={thumbnailUrl(product.image_url, 360, 450)} alt={product.title} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-[40px] text-sm font-semibold leading-5 text-text">{product.title}</p>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">{product.brand || product.source}</span>
          <span className="shrink-0">{product.color || product.category}</span>
        </div>
      </div>
    </a>
  );
}

function TrendProductRack({
  trend,
  products,
  vibe,
  bodyFocus,
}: {
  trend: TrendRow;
  products: ProductRow[];
  vibe: string;
  bodyFocus: string;
}) {
  const meta = inferTrendMeta(trend);
  const status = statusMeta(trend.status);
  const Icon = status.icon;

  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-soft">
      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{meta.vibe} / {meta.garment}</p>
                <h3 className="mt-1 text-2xl font-semibold capitalize leading-tight text-text">{trend.keyword}</h3>
              </div>
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", status.tone)}>
                <Icon className="h-3.5 w-3.5" />
                {status.label}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div>
                <p className="text-2xl font-semibold text-text">{meta.score}</p>
                <p className="text-xs text-muted">score</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-text">{meta.weeksFromPeak}</p>
                <p className="text-xs text-muted">weeks peak</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-text">{formatPercent(trend.growthPercentage)}</p>
                <p className="text-xs text-muted">lift</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[meta.colour, meta.cloth, meta.region].map((tag) => (
                <span key={`${trend.keyword}-${tag}`} className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-semibold text-muted">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Blend it into your look</p>
            <p className="mt-2 text-sm leading-6 text-text">{vibeAdvice(vibe, meta)}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{bodyAdvice(bodyFocus, meta)}</p>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text">Current products carrying this signal</p>
            <p className="text-xs text-muted">{products.length} shown</p>
          </div>
          {products.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {products.slice(0, 8).map((product) => (
                <ProductTile key={`${trend.keyword}-${product.id}`} product={product} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-bg p-6 text-sm text-muted">
              No product images match this filter yet. Add more scraped product data for this category to make the signal visual.
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function TrendsExperience({
  trendRows,
  productRows,
}: {
  trendRows: TrendRow[];
  productRows: ProductRow[];
}) {
  const [gender, setGender] = useState<TrendGender>("Women");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [garment, setGarment] = useState<FacetFilter>("All");
  const [colour, setColour] = useState<FacetFilter>("All");
  const [cloth, setCloth] = useState<FacetFilter>("All");
  const [region, setRegion] = useState<FacetFilter>("All");
  const [vibe, setVibe] = useState<FacetFilter>("All");
  const [bodyFocus, setBodyFocus] = useState<FacetFilter>("All");
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => [...trendRows].sort((a, b) => b.growthPercentage - a.growthPercentage), [trendRows]);
  const rising = trendRows.filter((trend) => trend.status === "Rising").length;
  const stable = trendRows.filter((trend) => trend.status === "Stable").length;
  const declining = trendRows.filter((trend) => trend.status === "Declining").length;

  const filteredTrends = useMemo(
    () =>
      sorted.filter((trend) => {
        const meta = inferTrendMeta(trend);
        const trendSearchText = `${trend.keyword} ${meta.garment} ${meta.colour} ${meta.cloth} ${meta.vibe}`.toLowerCase();
        return (
          (status === "All" || trend.status === status) &&
          (garment === "All" || meta.garment === garment) &&
          (colour === "All" || meta.colour === colour) &&
          (cloth === "All" || meta.cloth === cloth) &&
          (region === "All" || meta.region === region) &&
          (vibe === "All" || meta.vibe === vibe) &&
          (!search.trim() || trendSearchText.includes(search.toLowerCase()))
        );
      }),
    [cloth, colour, garment, region, search, sorted, status, vibe],
  );

  const productFilters = { garment, colour, cloth, search };
  const racks = filteredTrends
    .map((trend) => ({
      trend,
      products: productsForTrend(trend, productRows.filter((product) => filterProduct(product, productFilters)), 8),
    }))
    .filter((rack) => rack.products.length > 0)
    .slice(0, 12);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-surface p-5 shadow-soft">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Trend closet</p>
            <h1 className="mt-2 max-w-3xl text-4xl font-semibold leading-tight text-text lg:text-5xl">See what is trending as real clothes.</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted">
              Explore current trend signals through actual products, then filter by vibe, garment, colour, cloth, and body focus to find what can change your look without feeling copied.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Rising", value: rising, tone: "border-success/20 bg-success/10 text-success", icon: Flame },
              { label: "Stable", value: stable, tone: "border-accent/15 bg-accentSoft text-accent", icon: ArrowRight },
              { label: "Declining", value: declining, tone: "border-danger/20 bg-danger/10 text-danger", icon: ArrowDownRight },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setStatus(item.label === "Declining" ? "Declining" : (item.label as StatusFilter))}
                  className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold", item.tone)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  <span>{item.value}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-soft">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setGender(item)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  gender === item ? "border-accent bg-accent text-white" : "border-border bg-bg text-text hover:border-accent/40",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(130px,155px))] 2xl:grid-cols-[minmax(240px,1fr)_repeat(8,minmax(120px,145px))]">
            <label className="relative flex flex-col gap-1">
              <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Search trends or products</span>
              <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="linen, cargos, blazer..."
                className="h-10 rounded-lg border border-border bg-bg pl-9 pr-4 text-sm text-text outline-none focus:border-accent"
              />
            </label>
            <FilterSelect label="Momentum" value={status} options={STATUS_FILTERS} onChange={(value) => setStatus(value as StatusFilter)} />
            <FilterSelect label="Vibe" value={vibe} options={VIBES} onChange={setVibe} />
            <FilterSelect label="Body" value={bodyFocus} options={BODY_FOCUS} onChange={setBodyFocus} />
            <FilterSelect label="Garment" value={garment} options={GARMENTS} onChange={setGarment} />
            <FilterSelect label="Colour" value={colour} options={COLOURS} onChange={setColour} />
            <FilterSelect label="Cloth" value={cloth} options={CLOTHS} onChange={setCloth} />
            <FilterSelect label="Region" value={region} options={REGIONS} onChange={setRegion} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Currently visible</p>
            <h2 className="mt-1 text-2xl font-semibold text-text">Products inside the trends</h2>
          </div>
          <p className="text-sm text-muted">{racks.length} trend racks</p>
        </div>

        {racks.length > 0 ? (
          <div className="space-y-4">
            {racks.map(({ trend, products }) => (
              <TrendProductRack key={trend.keyword} trend={trend} products={products} vibe={vibe} bodyFocus={bodyFocus} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-muted">
            No product-backed trend racks match those filters yet.
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ever-trending</p>
            <h2 className="mt-1 text-2xl font-semibold text-text">Permanent style pillars</h2>
          </div>
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["Sari", "Drape, proportion, fabric, and occasion keep changing."],
            ["Denim", "A permanent base for fit, wash, and silhouette experiments."],
            ["Trench coat", "A clean structure piece that keeps returning."],
          ].map(([title, note]) => (
            <div key={title} className="rounded-lg border border-border bg-bg p-4">
              <p className="text-lg font-semibold text-text">{title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
