"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, ImageUp, Loader2, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type OutfitBuild = {
  title: string;
  occasion: string;
  pieces: string[];
  stylingNote: string;
};

type AnalyseResponse = {
  aesthetic?: string;
  rating?: number;
  feedback?: string;
  proportionAnalysis?: string;
  colourPalette?: {
    season: string;
    bestColours: string[];
    avoidColours: string[];
    note: string;
  };
  occasionFit?: {
    occasion: string;
    score: number;
    verdict: string;
  };
  bodyTypeAdvice?: string;
  gapFinder?: {
    missingPiece: string;
    why: string;
    suggestions: string[];
  };
  outfitBuilds?: OutfitBuild[];
  keywords?: string[];
  suggestions?: string[];
  source?: "gemini" | "fallback";
};

const bodyFocusOptions = ["Elongate silhouette", "Define waist", "Balance proportions", "Add structure", "Soften shape"];
const colourSeasons = ["Unknown", "Spring", "Summer", "Autumn", "Winter"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.readAsDataURL(file);
  });
}

function ScoreRing({ value }: { value: number }) {
  const score = Math.max(0, Math.min(10, value || 0));
  return (
    <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border border-[#B03A5B]/25 bg-[#fff8f8]">
      <span className="text-3xl font-semibold text-[#B03A5B]">{score}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7A6F65]">out of 10</span>
    </div>
  );
}

export default function OutfitUploadPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [occasion, setOccasion] = useState("A rooftop party, casual but elevated");
  const [bodyFocus, setBodyFocus] = useState(bodyFocusOptions[0]);
  const [colourSeason, setColourSeason] = useState("Unknown");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const score = result?.occasionFit?.score ?? result?.rating ?? 0;
  const builds = useMemo(() => result?.outfitBuilds ?? [], [result]);

  function pickFile(file: File | null) {
    setError(null);
    setResult(null);
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    pickFile(event.target.files?.[0] ?? null);
  }

  async function analyse() {
    if (!imageFile) return;
    setLoading(true);
    setError(null);

    try {
      const imageBase64 = await fileToBase64(imageFile);
      const response = await fetch("/api/analyseoutfit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mediaType: imageFile.type || "image/jpeg",
          occasion,
          bodyFocus,
          colourSeason,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Request failed (${response.status})`);
      }

      setResult((await response.json()) as AnalyseResponse);
    } catch (event) {
      setError(event instanceof Error ? event.message : "Could not analyse this outfit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF7F4] text-[#2C2A27]">
      <main className="px-6 pb-20 pt-8 md:px-12">
        <section className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.48fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7A6F65]">Style Guide</p>
            <h1 className="mt-4 max-w-3xl text-5xl italic leading-none [font-family:var(--font-display)] md:text-7xl">
              Let the outfit speak first.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#7A6F65]">
              Upload one look, set the occasion, and get a precise read on proportion, colour, event fit, and what would make it stronger.
            </p>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "mt-10 flex min-h-[560px] w-full items-center justify-center overflow-hidden rounded-[12px] border border-dashed border-[#B03A5B]/30 bg-white/50 text-center transition hover:bg-white",
                imagePreview && "border-none bg-white",
              )}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Uploaded outfit" className="h-full max-h-[760px] w-full object-cover" />
              ) : (
                <div className="px-8">
                  <ImageUp className="mx-auto h-8 w-8 text-[#B03A5B]" />
                  <p className="mt-5 text-3xl italic [font-family:var(--font-display)]">Upload your outfit</p>
                  <p className="mt-3 text-[13px] text-[#7A6F65]">Drop a photo or click to choose one.</p>
                </div>
              )}
            </button>
            <input ref={inputRef} className="hidden" type="file" accept="image/*" onChange={onFileChange} />
          </div>

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-[12px] bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">Coach settings</p>
                  <h2 className="mt-2 text-2xl italic [font-family:var(--font-display)]">Where is this going?</h2>
                </div>
                {imageFile ? (
                  <button type="button" onClick={() => pickFile(null)} className="rounded-full bg-[#FAF7F4] p-2 text-[#7A6F65]" aria-label="Remove image">
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="mt-6 space-y-5">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7A6F65]">Occasion</span>
                  <textarea
                    value={occasion}
                    onChange={(event) => setOccasion(event.target.value)}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-[12px] border border-[#eadfd8] bg-[#FAF7F4] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#B03A5B]"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7A6F65]">Body focus</span>
                  <select
                    value={bodyFocus}
                    onChange={(event) => setBodyFocus(event.target.value)}
                    className="mt-2 w-full rounded-[12px] border border-[#eadfd8] bg-[#FAF7F4] px-4 py-3 text-sm outline-none transition focus:border-[#B03A5B]"
                  >
                    {bodyFocusOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7A6F65]">Colour season</span>
                  <select
                    value={colourSeason}
                    onChange={(event) => setColourSeason(event.target.value)}
                    className="mt-2 w-full rounded-[12px] border border-[#eadfd8] bg-[#FAF7F4] px-4 py-3 text-sm outline-none transition focus:border-[#B03A5B]"
                  >
                    {colourSeasons.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  disabled={!imageFile || loading}
                  onClick={analyse}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#B03A5B] px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-40"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {loading ? "Analysing..." : "Analyse look"}
                </button>
              </div>
            </div>

            {error ? <p className="mt-4 rounded-[12px] bg-[#fcf0f0] px-4 py-3 text-sm text-[#9b2f3a]">{error}</p> : null}

            {result ? (
              <div className="mt-5 rounded-[12px] bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between gap-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">{result.source === "gemini" ? "Gemini read" : "Style read"}</p>
                    <h2 className="mt-2 text-3xl italic capitalize [font-family:var(--font-display)]">{result.aesthetic}</h2>
                  </div>
                  <ScoreRing value={score} />
                </div>
                <div className="mt-5 h-px bg-[#B03A5B]/30" />
                <p className="mt-5 text-sm leading-7 text-[#2C2A27]">{result.feedback}</p>
              </div>
            ) : null}
          </aside>
        </section>

        {result ? (
          <section className="mx-auto mt-12 max-w-7xl space-y-8">
            <div className="grid gap-5 md:grid-cols-3">
              <article className="rounded-[12px] bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">Proportion</p>
                <p className="mt-4 text-sm leading-7">{result.proportionAnalysis}</p>
              </article>
              <article className="rounded-[12px] bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">Colour</p>
                <h3 className="mt-3 text-2xl italic [font-family:var(--font-display)]">{result.colourPalette?.season}</h3>
                <p className="mt-3 text-sm leading-7">{result.colourPalette?.note}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(result.colourPalette?.bestColours ?? []).map((colour) => (
                    <span key={colour} className="rounded-full bg-[#FAF7F4] px-3 py-1 text-xs font-semibold text-[#2C2A27]">
                      {colour}
                    </span>
                  ))}
                </div>
              </article>
              <article className="rounded-[12px] bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">Body advice</p>
                <p className="mt-4 text-sm leading-7">{result.bodyTypeAdvice}</p>
              </article>
            </div>

            <div>
              <div className="flex items-end justify-between gap-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">Occasion builder</p>
                  <h2 className="mt-3 text-4xl italic [font-family:var(--font-display)]">Ways to wear it</h2>
                </div>
                <p className="hidden max-w-md text-sm leading-7 text-[#7A6F65] md:block">{result.occasionFit?.verdict}</p>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {builds.map((build) => (
                  <article key={`${build.title}-${build.occasion}`} className="rounded-[12px] bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7A6F65]">{build.occasion}</p>
                    <h3 className="mt-3 text-lg font-semibold">{build.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#2C2A27]">{build.stylingNote}</p>
                    <div className="mt-4 space-y-2">
                      {build.pieces.slice(0, 5).map((piece) => (
                        <p key={piece} className="flex items-center gap-2 text-xs text-[#7A6F65]">
                          <Check className="h-3 w-3 text-[#B03A5B]" />
                          {piece}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            {result.gapFinder ? (
              <section className="rounded-[12px] bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">Gap finder</p>
                <div className="mt-3 grid gap-6 md:grid-cols-[0.7fr_1fr] md:items-end">
                  <div>
                    <h2 className="text-4xl italic [font-family:var(--font-display)]">{result.gapFinder.missingPiece}</h2>
                    <p className="mt-4 text-sm leading-7 text-[#7A6F65]">{result.gapFinder.why}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {result.gapFinder.suggestions.map((suggestion) => (
                      <div key={suggestion} className="flex items-center justify-between rounded-[12px] bg-[#FAF7F4] px-4 py-3 text-sm font-semibold">
                        {suggestion}
                        <ChevronRight className="h-4 w-4 text-[#B03A5B]" />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
