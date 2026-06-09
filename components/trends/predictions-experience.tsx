"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import type { HistoricalPrediction, HistoricalPredictionsData, MarketHeat } from "@/lib/historical-predictions";
import { cn } from "@/lib/utils";

const tabs = ["Rising", "Peaking", "Fading"] as const;

function formatVelocity(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function Sparkline({ data }: { data: number[] }) {
  const values = data.length > 1 ? data : [0, data[0] ?? 0];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 160;
      const y = 36 - ((value - min) / range) * 36;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 160 36" className="h-10 w-40 overflow-visible" aria-hidden="true">
      <polyline points={points} fill="none" stroke="#B03A5B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Markets({ markets }: { markets: MarketHeat[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {markets.map((market) => (
        <span key={market.code} className="rounded-full bg-[#E8E0D4] px-3 py-1 text-[10px] font-light text-[#8C7B6E]">
          {market.flag} {market.market}
        </span>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[8px] font-extralight uppercase tracking-[5px] text-[#B03A5B]">{children}</p>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-3 text-4xl font-light italic text-[#2C2418] [font-family:var(--font-display)]">{children}</h2>;
}

function VelocityBadge({ value }: { value: number }) {
  return (
    <span className="rounded-full bg-[#F4DCE4] px-3 py-1 text-[10px] font-light tracking-[0.12em] text-[#B03A5B]">
      {formatVelocity(value)}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: HistoricalPrediction["confidence"] }) {
  return (
    <span className="rounded-full bg-[#E8E0D4] px-3 py-1 text-[8px] font-extralight uppercase tracking-[0.18em] text-[#8C7B6E]">
      {value}
    </span>
  );
}

function ForecastRow({ prediction, index }: { prediction: HistoricalPrediction; index: number }) {
  return (
    <article className="grid gap-5 border-t border-[#E8E0D4] bg-transparent py-7 md:grid-cols-[44px_1fr_180px] md:items-start">
      <p className="text-[18px] font-extralight text-[#C4B4A6] [font-family:var(--font-display)]">{String(index + 1).padStart(2, "0")}</p>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-light italic capitalize leading-none text-[#2C2418] [font-family:var(--font-display)]">{prediction.keyword}</h3>
          <VelocityBadge value={prediction.velocity} />
          <ConfidenceBadge value={prediction.confidence} />
        </div>
        <p className="mt-4 max-w-3xl text-xs font-light leading-[1.7] text-[#8C7B6E]">{prediction.prediction}</p>
        <p className="mt-3 max-w-3xl text-sm italic leading-7 text-[#B03A5B] [font-family:var(--font-display)]">{prediction.dataInsight}</p>
        <div className="mt-4">
          <Markets markets={prediction.topMarkets} />
        </div>
      </div>
      <div className="md:justify-self-end">
        <Sparkline data={prediction.sparkline} />
      </div>
    </article>
  );
}

function cycleRows(data: HistoricalPredictionsData, tab: (typeof tabs)[number]) {
  if (tab === "Rising") return data.rising;
  if (tab === "Fading") return data.fading;
  return data.peaking;
}

export function PredictionsExperience({ data }: { data: HistoricalPredictionsData }) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Rising");
  const hero = data.nextSeasonPredictions[0] ?? data.rising[0] ?? data.peaking[0] ?? data.fading[0];
  const list = data.nextSeasonPredictions.slice(0, 5);
  const activeRows = cycleRows(data, activeTab);

  if (!hero) {
    return (
      <div className="min-h-screen bg-[#FAF7F4] text-[#2C2A27]">
        <main className="px-6 py-24 text-center">
          <h1 className="text-4xl italic [font-family:var(--font-display)]">Predictions are waiting for data.</h1>
          <p className="mt-4 text-sm text-[#7A6F65]">Run the historical scraper to read velocity, seasonality, and market heat.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F4] text-[#2C2A27]">
      <main className="px-6 pb-24 pt-10 md:px-12">
        <section className="mx-auto max-w-7xl">
          <SectionLabel>Predict</SectionLabel>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_380px] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-[clamp(48px,7vw,80px)] font-light italic leading-none text-[#2C2418] [font-family:var(--font-display)]">
                Tomorrow&apos;s trends, edited down.
              </h1>
              <p className="mt-6 max-w-2xl text-sm font-light leading-7 text-[#8C7B6E]">
                Forecasts from historical Google Trends, seasonal movement, and market heat. No noise, just the signals worth watching.
              </p>
            </div>
            <div className="rounded-sm border border-[#D4C8BC] bg-[#2C2418] p-6 text-[#F0EBE3]">
              <p className="text-[8px] font-extralight uppercase tracking-[5px] text-[#B03A5B]">Lead signal</p>
              <h2 className="mt-3 text-4xl font-light italic capitalize text-[#F0EBE3] [font-family:var(--font-display)]">{hero.keyword}</h2>
              <p className="mt-4 text-xs font-light leading-7 text-[#C4B4A6]">{hero.howToPrepare}</p>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xl font-light text-[#F0EBE3]">{Math.round(hero.currentScore)}</p>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#C4B4A6]">now</p>
                </div>
                <div>
                  <p className="text-xl font-light text-[#F0EBE3]">{Math.round(hero.seasonScore)}</p>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#C4B4A6]">season</p>
                </div>
                <div>
                  <p className="text-xl font-light text-[#B03A5B]">{formatVelocity(hero.velocity)}</p>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#C4B4A6]">velocity</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionLabel>{data.nextSeason} forecast</SectionLabel>
              <SectionTitle>What is moving</SectionTitle>
            </div>
            <Link href={`/products?search=${encodeURIComponent(hero.keyword)}`} className="text-xs font-light text-[#B03A5B]">
              Shop the lead signal
            </Link>
          </div>
          <div className="mt-6">
            {list.map((prediction, index) => (
              <ForecastRow key={prediction.keyword} prediction={prediction} index={index} />
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionLabel>Cycle</SectionLabel>
              <SectionTitle>Rising, peaking, fading</SectionTitle>
            </div>
            <div className="flex gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn("rounded-full px-5 py-2 text-[10px] font-extralight uppercase tracking-[0.18em] transition", activeTab === tab ? "bg-[#2C2418] text-[#F0EBE3]" : "bg-transparent text-[#8C7B6E]")}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeRows.map((prediction) => (
              <article key={`${activeTab}-${prediction.keyword}`} className="rounded-sm border border-[#D4C8BC] bg-[#F0EBE3] p-5">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-2xl font-light italic capitalize text-[#2C2418] [font-family:var(--font-display)]">{prediction.keyword}</h3>
                  <span className="shrink-0 text-sm font-light text-[#B03A5B]">{activeTab === "Peaking" ? "stable" : formatVelocity(prediction.velocity)}</span>
                </div>
                <p className="mt-3 text-xs font-light leading-[1.7] text-[#8C7B6E]">{prediction.whyNow}</p>
                <div className="mt-4">
                  <Markets markets={prediction.topMarkets.slice(0, 2)} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-7xl">
          <SectionLabel>Global heat</SectionLabel>
          <SectionTitle>Where the signal is strongest</SectionTitle>
          <div className="mt-6 overflow-hidden border-y border-[#E8E0D4]">
            {data.globalHeat.map((prediction, index) => (
              <div key={prediction.keyword} className="grid gap-3 border-b border-[#E8E0D4] bg-transparent px-5 py-4 last:border-b-0 md:grid-cols-[48px_1fr_1.4fr]">
                <span className="text-sm font-extralight text-[#C4B4A6] [font-family:var(--font-display)]">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-xl font-normal capitalize text-[#2C2418] [font-family:var(--font-display)]">{prediction.keyword}</p>
                  <p className="mt-1 text-[10px] font-extralight text-[#C4B4A6]">global heat score {Math.round(prediction.currentScore)}</p>
                </div>
                <Markets markets={prediction.topMarkets} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
