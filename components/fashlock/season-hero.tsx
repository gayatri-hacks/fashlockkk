"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

type SeasonHeroKind = "discover" | "trends";

function getSeasonHero() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring fashion editorial florals light minimal";
  if (month >= 5 && month <= 7) return "summer fashion editorial sun linen minimal elegant";
  if (month >= 8 && month <= 10) return "autumn fashion editorial warm tones coat minimal";
  return "winter fashion editorial dark coat minimal elegant";
}

function getSeasonText() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) {
    return {
      headline: "Spring is here. Dress like it.",
      sub: "Light fabrics, softer palettes, the season of reinvention.",
    };
  }
  if (month >= 5 && month <= 7) {
    return { headline: "Summer dressing, elevated.", sub: "Where warmth meets intention." };
  }
  if (month >= 8 && month <= 10) {
    return {
      headline: "Autumn. The best dressed season.",
      sub: "Layers, texture, and the art of transition.",
    };
  }
  return {
    headline: "Winter dressing is an art form.",
    sub: "Dark palettes, sharp cuts, undeniable presence.",
  };
}

function getTrendsText() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) {
    return { headline: "What spring is saying this year.", sub: "Spring · 2026" };
  }
  if (month >= 5 && month <= 7) {
    return { headline: "Summer's defining looks, right now.", sub: "Summer · 2026" };
  }
  if (month >= 8 && month <= 10) {
    return { headline: "Autumn's trends, before everyone knows.", sub: "Autumn · 2026" };
  }
  return { headline: "Winter dressing. What the world chose.", sub: "Winter · 2026" };
}

export function SeasonHero({ kind }: { kind: SeasonHeroKind }) {
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const heroKeyword = useMemo(() => getSeasonHero(), []);
  const copy = useMemo(() => (kind === "trends" ? getTrendsText() : getSeasonText()), [kind]);

  useEffect(() => {
    const heroCache = `hero_${heroKeyword}`;
    const cachedHero = window.localStorage.getItem(heroCache);

    if (cachedHero) {
      setHeroImage(cachedHero);
      return;
    }

    let cancelled = false;

    async function loadHero() {
      try {
        const response = await fetch("/api/season-hero");
        const data = (await response.json()) as { heroImage?: string | null };
        if (data.heroImage) {
          window.localStorage.setItem(heroCache, data.heroImage);
          if (!cancelled) setHeroImage(data.heroImage);
        }
      } catch {
        if (!cancelled) setHeroImage(null);
      }
    }

    void loadHero();

    return () => {
      cancelled = true;
    };
  }, [heroKeyword]);

  return (
    <section>
      <div
        className="h-screen w-full bg-[#EEE8E1]"
        style={{
          backgroundImage: heroImage ? `url(${heroImage})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          width: "100%",
          height: "100vh",
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="px-6 py-12 text-center md:px-[120px]"
      >
        <h1 className="text-[36px] italic leading-tight [font-family:var(--font-fashlock-display)]">
          {copy.headline}
        </h1>
        <p className="mt-3 text-sm text-[#7A6F65]">{copy.sub}</p>
      </motion.div>
    </section>
  );
}
