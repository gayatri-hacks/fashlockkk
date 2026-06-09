"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { PredictPageData, PredictTrend, PredictMarket } from "@/lib/predict-page";

const retailers = [
  { name: "MYNTRA", url: (term: string) => `https://www.myntra.com/${term.trim().replace(/\s+/g, "-")}` },
  { name: "ZARA", url: (term: string) => `https://www.zara.com/in/en/search?searchTerm=${encodeURIComponent(term)}` },
  { name: "H&M", url: (term: string) => `https://www2.hm.com/en_in/search-results.html?q=${encodeURIComponent(term)}` },
  { name: "AJIO", url: (term: string) => `https://www.ajio.com/search/?query=${encodeURIComponent(term)}` },
  { name: "ASOS", url: (term: string) => `https://www.asos.com/search/?q=${encodeURIComponent(term)}` },
];

function formatVelocity(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function SectionLabel({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      style={{
        color: light ? "#F0EBE3" : "#B03A5B",
        fontFamily: "var(--font-predict-body)",
        fontSize: 8,
        fontWeight: 200,
        letterSpacing: 5,
        textTransform: "uppercase",
      }}
    >
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        color: "#2C2418",
        fontFamily: "var(--font-predict-display)",
        fontSize: 36,
        fontStyle: "italic",
        fontWeight: 300,
        lineHeight: 1.1,
        margin: "8px 0 0",
      }}
    >
      {children}
    </h2>
  );
}

function Markets({ markets }: { markets: PredictMarket[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {markets.map((market) => (
        <span
          key={market.code}
          style={{
            background: "#E8E0D4",
            borderRadius: 20,
            color: "#8C7B6E",
            fontFamily: "var(--font-predict-body)",
            fontSize: 10,
            fontWeight: 200,
            padding: "5px 10px",
          }}
        >
          {market.flag} {market.market}
        </span>
      ))}
    </div>
  );
}

function confidenceStyle(confidence: PredictTrend["confidenceLevel"]) {
  if (confidence === "HIGH") return { background: "#F4DCE4", color: "#B03A5B" };
  if (confidence === "MEDIUM") return { background: "#F0E4D0", color: "#8C6030" };
  return { background: "#E8E4E0", color: "#8C7B6E" };
}

function PredictionCard({ trend }: { trend: PredictTrend }) {
  const [open, setOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const confidence = confidenceStyle(trend.confidenceLevel);
  const barWidth = `${Math.min(100, Math.max(8, Math.abs(trend.velocity) / 12))}%`;

  return (
    <article
      style={{
        background: "#F0EBE3",
        borderRadius: 2,
        cursor: "pointer",
        overflow: "hidden",
        transition: "transform 0.3s ease",
      }}
      onClick={() => setOpen(true)}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ padding: 28 }}>
        <div className="flex items-center justify-between gap-4">
          <span
            style={{
              ...confidence,
              borderRadius: 20,
              fontFamily: "var(--font-predict-body)",
              fontSize: 8,
              fontWeight: 200,
              letterSpacing: 3,
              padding: "4px 12px",
            }}
          >
            {trend.confidenceLevel}
          </span>
          <span
            style={{
              color: "#B03A5B",
              fontFamily: "var(--font-predict-body)",
              fontSize: 13,
              fontWeight: 300,
            }}
          >
            {formatVelocity(trend.velocity)}
          </span>
        </div>

        <h3
          style={{
            color: "#2C2418",
            fontFamily: "var(--font-predict-display)",
            fontSize: 32,
            fontStyle: "italic",
            fontWeight: 300,
            lineHeight: 1,
            margin: "12px 0 0",
          }}
        >
          {trend.trendName}
        </h3>
        <p
          style={{
            color: "#8C7B6E",
            fontFamily: "var(--font-predict-body)",
            fontSize: 12,
            fontWeight: 300,
            lineHeight: 1.6,
            margin: "8px 0 0",
          }}
        >
          {trend.simpleExplanation}
        </p>
        <p
          style={{
            color: "#2C2418",
            fontFamily: "var(--font-predict-display)",
            fontSize: 16,
            fontStyle: "italic",
            fontWeight: 300,
            lineHeight: 1.6,
            margin: "12px 0 0",
          }}
        >
          {trend.prediction}
        </p>
        {!open && (
          <p
            style={{
              color: "#C4B4A6",
              fontFamily: "var(--font-predict-body)",
              fontSize: 10,
              fontWeight: 200,
              margin: "16px 0 0",
            }}
          >
            Tap to explore →
          </p>
        )}
      </div>

      <div
        style={{
          maxHeight: open ? 1200 : 0,
          overflow: "hidden",
          transition: "max-height 0.4s ease",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: "0 28px 28px" }}>
          <div style={{ marginTop: 4 }}>
            <SectionLabel>What it looks like</SectionLabel>
            {trend.imageUrl ? (
              <img
                src={trend.imageUrl}
                alt={trend.trendName}
                style={{
                  borderRadius: 2,
                  height: 240,
                  marginTop: 12,
                  objectFit: "cover",
                  objectPosition: "center",
                  width: "100%",
                }}
              />
            ) : (
              <div className="fashlock-skeleton" style={{ borderRadius: 2, height: 240, marginTop: 12 }} />
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <SectionLabel>Why now</SectionLabel>
            <p
              style={{
                color: "#8C7B6E",
                fontFamily: "var(--font-predict-display)",
                fontSize: 15,
                fontStyle: "italic",
                fontWeight: 300,
                lineHeight: 1.7,
                margin: "8px 0 0",
              }}
            >
              {trend.whyNow}
            </p>
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>How to start</SectionLabel>
            <p
              style={{
                background: "#FAF7F4",
                borderLeft: "2px solid #B03A5B",
                borderRadius: 2,
                color: "#2C2418",
                fontFamily: "var(--font-predict-body)",
                fontSize: 13,
                fontWeight: 300,
                lineHeight: 1.6,
                margin: "8px 0 0",
                padding: "14px 16px",
              }}
            >
              {trend.styleNote}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDataOpen((value) => !value)}
            style={{
              color: "#C4B4A6",
              fontFamily: "var(--font-predict-body)",
              fontSize: 9,
              fontWeight: 200,
              marginTop: 20,
            }}
          >
            See the data {dataOpen ? "↑" : "↓"}
          </button>

          <div style={{ maxHeight: dataOpen ? 220 : 0, overflow: "hidden", transition: "max-height 0.3s ease" }}>
            <div style={{ marginTop: 12 }}>
              <div className="flex items-center justify-between">
                <SectionLabel>Velocity</SectionLabel>
                <span style={{ color: "#B03A5B", fontFamily: "var(--font-predict-body)", fontSize: 10, fontWeight: 300 }}>
                  {formatVelocity(trend.velocity)}
                </span>
              </div>
              <div style={{ background: "#E8E0D4", borderRadius: 2, height: 3, marginTop: 10, overflow: "hidden" }}>
                <div style={{ background: "#B03A5B", borderRadius: 2, height: "100%", transition: "width 0.8s ease", width: dataOpen ? barWidth : 0 }} />
              </div>
              <div style={{ marginTop: 12 }}>
                <Markets markets={trend.markets} />
              </div>
              <p style={{ color: "#8C7B6E", fontFamily: "var(--font-predict-body)", fontSize: 10, fontWeight: 200, margin: "10px 0 0" }}>
                Strongest in {trend.markets.map((market) => market.market).join(", ") || "global markets"}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <SectionLabel>Get ahead of this trend</SectionLabel>
            <div className="mt-3 space-y-3">
              {trend.shopTerms.map((term) => (
                <div key={term}>
                  <p style={{ color: "#2C2418", fontFamily: "var(--font-predict-body)", fontSize: 12, fontStyle: "italic", fontWeight: 300, marginBottom: 10 }}>
                    {term}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {retailers.map((retailer) => (
                      <a
                        key={`${term}-${retailer.name}`}
                        href={retailer.url(term)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: "#FAF7F4",
                          border: "0.5px solid #D4C8BC",
                          borderRadius: 20,
                          color: "#2C2418",
                          fontFamily: "var(--font-predict-body)",
                          fontSize: 11,
                          fontWeight: 300,
                          padding: "8px 16px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.background = "#F4DCE4";
                          event.currentTarget.style.borderColor = "#B03A5B";
                          event.currentTarget.style.color = "#B03A5B";
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = "#FAF7F4";
                          event.currentTarget.style.borderColor = "#D4C8BC";
                          event.currentTarget.style.color = "#2C2418";
                        }}
                      >
                        {retailer.name}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setDataOpen(false);
            }}
            style={{
              color: "#C4B4A6",
              cursor: "pointer",
              fontFamily: "var(--font-predict-body)",
              fontSize: 9,
              fontWeight: 200,
              marginTop: 16,
            }}
          >
            ↑ Close
          </button>
        </div>
      </div>
    </article>
  );
}

function ShiftSection({ shift }: { shift: PredictPageData["shift"] }) {
  if (!shift) return null;

  return (
    <section style={{ background: "#F0EBE3", padding: "56px 48px" }}>
      <div className="mx-auto max-w-7xl">
        <SectionLabel>The shift</SectionLabel>
        <SectionTitle>What changed from last season</SectionTitle>
        <p style={{ color: "#8C7B6E", fontFamily: "var(--font-predict-body)", fontSize: 12, fontWeight: 300, lineHeight: 1.7, margin: "12px 0 24px" }}>
          {shift.sentence}
        </p>
        <div className="grid overflow-hidden rounded-sm md:grid-cols-2">
          <div style={{ background: "#2C2418", padding: 36 }}>
            <SectionLabel>Last season</SectionLabel>
            <h3 style={{ color: "#F0EBE3", fontFamily: "var(--font-predict-display)", fontSize: 48, fontStyle: "italic", fontWeight: 300, lineHeight: 1, margin: "16px 0 0", opacity: 0.5 }}>
              {shift.lastTrend}
            </h3>
            <p style={{ color: "#6B5545", fontFamily: "var(--font-predict-body)", fontSize: 10, fontWeight: 200, margin: "16px 0 0" }}>Fading</p>
          </div>
          <div style={{ background: "#B03A5B", padding: 36 }}>
            <SectionLabel light>This season</SectionLabel>
            <h3 style={{ color: "#FAF7F4", fontFamily: "var(--font-predict-display)", fontSize: 48, fontStyle: "italic", fontWeight: 300, lineHeight: 1, margin: "16px 0 0" }}>
              {shift.thisTrend}
            </h3>
            <p style={{ color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-predict-body)", fontSize: 10, fontWeight: 200, margin: "16px 0 0" }}>Arriving</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function GlobalHeat({ trends }: { trends: PredictTrend[] }) {
  const max = Math.max(...trends.map((trend) => trend.currentScore), 1);

  return (
    <section style={{ background: "#FAF7F4", padding: "56px 48px 80px" }}>
      <div className="mx-auto max-w-7xl">
        <SectionLabel>Global heat</SectionLabel>
        <SectionTitle>Where it&apos;s hottest</SectionTitle>
        <div className="mt-6 border-y border-[#E8E0D4]">
          {trends.map((trend) => (
            <div key={trend.keyword} className="grid gap-4 border-b border-[#E8E0D4] bg-transparent px-2 py-5 last:border-b-0 md:grid-cols-[1fr_1.2fr_1.2fr] md:items-center">
              <p style={{ color: "#2C2418", fontFamily: "var(--font-predict-display)", fontSize: 20, fontWeight: 400, margin: 0 }}>
                {trend.trendName}
              </p>
              <div style={{ background: "#E8E0D4", borderRadius: 2, height: 3, overflow: "hidden" }}>
                <div style={{ background: "#B03A5B", borderRadius: 2, height: "100%", transition: "width 0.8s ease", width: `${Math.max(8, (trend.currentScore / max) * 100)}%` }} />
              </div>
              <Markets markets={trend.markets} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PredictPageExperience({ data }: { data: PredictPageData }) {
  const [activeEdit, setActiveEdit] = useState<"women" | "men">("women");
  const activePredictions = activeEdit === "men" ? data.menswearPredictions : data.predictions;

  return (
    <div style={{ background: "#FAF7F4", color: "#2C2418", minHeight: "100vh" }}>
      <section className="flex items-center justify-center" style={{ background: "#2C2418", height: 380, padding: "48px 24px", textAlign: "center" }}>
        <div>
          <p style={{ color: "#B03A5B", fontFamily: "var(--font-predict-body)", fontSize: 9, fontWeight: 200, letterSpacing: 6, textTransform: "uppercase" }}>
            FASHLOCK PREDICTIONS · {data.season} {data.year}
          </p>
          <h1 style={{ color: "#F0EBE3", fontFamily: "var(--font-predict-display)", fontSize: "clamp(48px, 7vw, 80px)", fontStyle: "italic", fontWeight: 300, lineHeight: 1.1, margin: "18px 0 0" }}>
            What&apos;s coming before it arrives.
          </h1>
          <p style={{ color: "#8C7B6E", fontFamily: "var(--font-predict-body)", fontSize: 14, fontWeight: 300, lineHeight: 1.7, margin: "16px auto 0", maxWidth: 560 }}>
            Powered by 22 years of global trend data across 12 markets. No guesswork. Just signals.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-10">
            {[
              [activePredictions.length.toString(), activeEdit === "men" ? "menswear signals" : "trends predicted"],
              ["12", "global markets"],
              ["22", "years of data"],
            ].map(([number, label]) => (
              <div key={label}>
                <p style={{ color: "#F0EBE3", fontFamily: "var(--font-predict-display)", fontSize: 32, fontWeight: 300, lineHeight: 1, margin: 0 }}>{number}</p>
                <p style={{ color: "#6B5545", fontFamily: "var(--font-predict-body)", fontSize: 8, fontWeight: 200, letterSpacing: 3, margin: "8px 0 0", textTransform: "uppercase" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "56px 48px" }}>
        <div className="mx-auto max-w-7xl">
          <SectionLabel>What&apos;s coming</SectionLabel>
          <SectionTitle>Next season&apos;s signals</SectionTitle>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p style={{ color: "#8C7B6E", fontFamily: "var(--font-predict-body)", fontSize: 11, fontWeight: 300, margin: 0 }}>
              Tap any prediction to explore it
            </p>
            <div className="flex gap-7">
              {[
                ["women", "HER EDIT"],
                ["men", "HIS EDIT"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveEdit(value as "women" | "men")}
                  style={{
                    borderBottom: activeEdit === value ? "1px solid #B03A5B" : "1px solid transparent",
                    color: activeEdit === value ? "#B03A5B" : "#C4B4A6",
                    fontFamily: "var(--font-predict-body)",
                    fontSize: 9,
                    fontWeight: 200,
                    letterSpacing: 4,
                    paddingBottom: 8,
                    textTransform: "uppercase",
                    transition: "color 0.2s ease, border-color 0.2s ease",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {activePredictions.map((trend) => (
              <PredictionCard key={`${activeEdit}-${trend.keyword}`} trend={trend} />
            ))}
          </div>
        </div>
      </section>

      <ShiftSection shift={data.shift} />
      <GlobalHeat trends={data.globalHeat} />
    </div>
  );
}
