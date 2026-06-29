"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type ClosetGapResponse =
  | { authenticated: false }
  | { authenticated: true; status: "insufficient_data"; itemCount: number }
  | {
      authenticated: true;
      status: "ready";
      missingCategory: string;
      unlockedLookCount: number;
      copy: string;
      shopTerms: string[];
    };

function neededPieces(itemCount: number) {
  return Math.max(0, 3 - itemCount);
}

function pieceLabel(count: number) {
  return `${count} more ${count === 1 ? "piece" : "pieces"}`;
}

function CardShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn("bg-[#FAF7F4] px-5 pb-8 pt-2 md:px-[120px] md:pb-14 md:pt-0", className)}
      aria-label="Complete Your Closet"
    >
      <div className="relative overflow-hidden rounded-[2px] border border-[#D4C8BC] bg-[#F0EBE3] px-6 py-7 shadow-[0_2px_24px_rgba(44,36,24,0.06)] md:px-9 md:py-8" style={{ borderWidth: 0.5 }}>
        <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full border border-[#D4C8BC] opacity-50" style={{ borderWidth: 0.5 }} />
        <div className="pointer-events-none absolute bottom-0 right-0 h-px w-1/2 bg-[#D4C8BC]" />
        {children}
      </div>
    </motion.section>
  );
}

function LoadingCard() {
  return (
    <CardShell>
      <div className="grid gap-6 md:grid-cols-[1fr_220px] md:items-end">
        <div>
          <div className="fashlock-skeleton mb-5 h-3 w-36 rounded-[2px]" />
          <div className="fashlock-skeleton h-12 w-full max-w-[420px] rounded-[2px]" />
          <div className="fashlock-skeleton mt-4 h-4 w-full max-w-[520px] rounded-[2px]" />
        </div>
        <div className="flex gap-2 md:justify-end">
          <div className="fashlock-skeleton h-9 w-24 rounded-full" />
          <div className="fashlock-skeleton h-9 w-28 rounded-full" />
        </div>
      </div>
    </CardShell>
  );
}

function TeaserCard() {
  return (
    <CardShell>
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="mb-3 text-[8px] font-[200] uppercase tracking-[5px] text-[#B03A5B]">COMPLETE YOUR CLOSET</p>
          <h2 className="max-w-2xl text-[34px] font-[300] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)] md:text-[46px]">
            See what one piece would unlock in your closet.
          </h2>
          <p className="mt-4 max-w-xl text-[12px] font-[300] leading-6 tracking-[0.2px] text-[#8C7B6E]">
            Fashlock reads your wardrobe against the style library and finds the single addition that could make more outfits work.
          </p>
        </div>
        <Link
          href="/signin"
          className="inline-flex w-fit items-center rounded-full border border-[#D4C8BC] bg-[#FAF7F4] px-5 py-3 text-[11px] font-[300] text-[#2C2418] transition hover:border-[#B03A5B] hover:text-[#B03A5B]"
          style={{ borderWidth: 0.5 }}
        >
          Sign in
        </Link>
      </div>
    </CardShell>
  );
}

function ProgressCard({ itemCount }: { itemCount: number }) {
  const count = neededPieces(itemCount);

  return (
    <CardShell>
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="mb-3 text-[8px] font-[200] uppercase tracking-[5px] text-[#B03A5B]">COMPLETE YOUR CLOSET</p>
          <h2 className="max-w-2xl text-[34px] font-[300] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)] md:text-[46px]">
            Add {pieceLabel(count)} to unlock this.
          </h2>
          <p className="mt-4 max-w-xl text-[12px] font-[300] leading-6 tracking-[0.2px] text-[#8C7B6E]">
            You have {itemCount} {itemCount === 1 ? "piece" : "pieces"} saved. Three is enough for Fashlock to read the pattern and find the missing category.
          </p>
        </div>
        <Link
          href="/wardrobe"
          className="inline-flex w-fit items-center rounded-full border border-[#D4C8BC] bg-[#FAF7F4] px-5 py-3 text-[11px] font-[300] text-[#2C2418] transition hover:border-[#B03A5B] hover:text-[#B03A5B]"
          style={{ borderWidth: 0.5 }}
        >
          Add wardrobe pieces
        </Link>
      </div>
    </CardShell>
  );
}

function ReadyCard({ result }: { result: Extract<ClosetGapResponse, { status: "ready" }> }) {
  const terms = result.shopTerms.slice(0, 3);

  return (
    <CardShell>
      <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_280px] md:items-end">
        <div>
          <p className="mb-3 text-[8px] font-[200] uppercase tracking-[5px] text-[#B03A5B]">COMPLETE YOUR CLOSET</p>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <h2 className="text-[48px] font-[300] italic leading-none text-[#2C2418] [font-family:var(--font-fashlock-display)] md:text-[72px]">
              {result.missingCategory}
            </h2>
            <p className="pb-2 text-[13px] font-[300] uppercase tracking-[3px] text-[#B03A5B]">
              would unlock {result.unlockedLookCount} looks
            </p>
          </div>
          <p className="mt-5 max-w-2xl text-[13px] font-[300] leading-7 tracking-[0.2px] text-[#8C7B6E]">
            {result.copy}
          </p>
        </div>

        {terms.length ? (
          <div className="md:justify-self-end">
            <p className="mb-3 text-[8px] font-[200] uppercase tracking-[3px] text-[#B03A5B]">SHOP THE GAP</p>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {terms.map((term) => (
                <Link
                  key={term}
                  href={`/products?search=${encodeURIComponent(term)}`}
                  className="rounded-full border border-[#D4C8BC] bg-[#FAF7F4] px-4 py-[10px] text-[11px] font-[300] text-[#2C2418] transition hover:border-[#B03A5B] hover:text-[#B03A5B]"
                  style={{ borderWidth: 0.5 }}
                >
                  {term}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}

export function CompleteYourClosetCard() {
  const [result, setResult] = useState<ClosetGapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/discover/closet-gaps")
      .then((response) => {
        if (!response.ok) throw new Error(`Closet gaps failed with ${response.status}`);
        return response.json() as Promise<ClosetGapResponse>;
      })
      .then((payload) => {
        if (active) setResult(payload);
      })
      .catch((error) => {
        console.error("Complete Your Closet failed:", error);
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (failed) return null;
  if (loading) return <LoadingCard />;
  if (!result) return null;
  if (!result.authenticated) return <TeaserCard />;
  if (result.status === "insufficient_data") return <ProgressCard itemCount={result.itemCount} />;
  return <ReadyCard result={result} />;
}
