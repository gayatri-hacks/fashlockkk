"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { Sparkles, Trash2, Upload, X } from "lucide-react";
import { thumbnailUrl } from "@/lib/image-utils";
import { cn } from "@/lib/utils";

type WardrobeItem = {
  id: string;
  image_url: string;
  category: string;
  color: string | null;
  name: string | null;
  tags: string[] | null;
  created_at: string;
};

type CompleteLook = {
  name: string;
  uses: string[];
  missing: string[];
  why: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

function pieceLabel(item: WardrobeItem) {
  const color = item.color?.trim();
  const name = item.name?.trim();

  if (name && color && !name.toLowerCase().includes(color.toLowerCase())) return `${color} ${name}`;
  return name || item.category || "Wardrobe piece";
}

function LoadingOverlay({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#FAF7F4]/92 px-6 text-center text-[#2C2A27] backdrop-blur-sm"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#B03A5B]">Fashlock wardrobe</p>
        <h2 className="mt-4 text-4xl italic leading-tight [font-family:var(--font-fashlock-display)] md:text-5xl">{label}</h2>
        <motion.div
          animate={{ width: [42, 132, 42], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mt-8 h-px bg-[#B03A5B]"
        />
      </div>
    </motion.div>
  );
}

export function WardrobeClient({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [latestItem, setLatestItem] = useState<WardrobeItem | null>(null);
  const [outfits, setOutfits] = useState<CompleteLook[]>([]);
  const [loading, setLoading] = useState<"upload" | "complete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const piecesNeeded = Math.max(0, 3 - items.length);

  useEffect(() => {
    async function loadItems() {
      try {
        const res = await fetch("/api/wardrobe/items", { credentials: "include" });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error ?? "Could not load wardrobe");
        }

        setItems(data.items || []);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load wardrobe");
      }
    }

    loadItems();
  }, []);

  async function uploadFile(file: File | null) {
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Upload a jpg, png, or webp image.");
      return;
    }

    setError(null);
    setOutfits([]);
    setLoading("upload");

    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/wardrobe/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          imageBase64,
          mediaType: file.type,
          fileName: file.name,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Upload failed");
      }

      setItems((current) => [data.item, ...current]);
      setLatestItem(data.item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setLoading(null);
      setDragActive(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    uploadFile(event.dataTransfer.files?.[0] ?? null);
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    uploadFile(event.target.files?.[0] ?? null);
  }

  async function deleteItem(item: WardrobeItem) {
    setError(null);
    setOutfits([]);

    const res = await fetch(`/api/wardrobe/items?id=${encodeURIComponent(item.id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      setError(data.error ?? "Could not delete item");
      return;
    }

    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    if (latestItem?.id === item.id) setLatestItem(null);
  }

  async function completeLooks() {
    if (items.length < 3) return;

    setError(null);
    setLoading("complete");

    try {
      const res = await fetch("/api/wardrobe/style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: items.map((item) => ({
            name: item.name,
            color: item.color,
            category: item.category,
          })),
          labels: items.map(pieceLabel),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Could not complete these looks");
      }

      setOutfits(Array.isArray(data.outfits) ? data.outfits : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete these looks");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className={cn("min-h-screen bg-[#FAF7F4] text-[#2C2A27] [font-family:var(--font-fashlock-body)]", className)}>
      <AnimatePresence>{loading ? <LoadingOverlay label={loading === "upload" ? "Analysing your piece..." : "Finding what completes the look..."} /> : null}</AnimatePresence>

      <main className="mx-auto max-w-7xl px-5 pb-24 pt-12 md:px-10 lg:px-16">
        <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#B03A5B]">Wardrobe</p>
            <h1 className="mt-5 max-w-3xl text-5xl italic leading-[0.95] [font-family:var(--font-fashlock-display)] md:text-7xl">
              Your wardrobe, made smarter.
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-[#7A6F65] md:text-base">
              Upload pieces you own. We'll tell you what to add to complete the look.
            </p>
          </div>

          <div className="rounded-[14px] border border-[#E5DAD0] bg-[#F0EBE3] p-4 md:p-5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={() => setDragActive(true)}
              onDragLeave={() => setDragActive(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              className={cn(
                "flex min-h-[190px] w-full flex-col items-center justify-center rounded-[12px] border border-dashed px-6 py-8 text-center transition",
                dragActive ? "border-[#B03A5B] bg-white" : "border-[#B03A5B]/35 bg-[#FAF7F4]/55 hover:bg-white/70",
              )}
            >
              <Upload className="mb-5 h-5 w-5 text-[#B03A5B]" />
              <span className="text-2xl italic [font-family:var(--font-fashlock-display)]">Drop a piece here</span>
              <span className="mt-3 text-[12px] uppercase tracking-[0.2em] text-[#8C7B6E]">or click to upload</span>
              <span className="mt-4 text-xs text-[#9B8C80]">jpg, png, webp</span>
            </button>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} />

            {latestItem ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-center gap-4 rounded-[12px] bg-white/70 p-3"
              >
                <img src={thumbnailUrl(latestItem.image_url, 120, 120)} alt={pieceLabel(latestItem)} className="h-16 w-16 rounded-[10px] object-cover" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B03A5B]">Added</p>
                  <p className="mt-1 text-sm text-[#2C2A27]">{pieceLabel(latestItem)}</p>
                </div>
              </motion.div>
            ) : null}
          </div>
        </section>

        {error ? (
          <div className="mt-8 flex items-start justify-between gap-4 rounded-[12px] bg-white px-5 py-4 text-sm leading-6 text-[#B03A5B] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <section className="mt-16">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#7A6F65]">Your pieces</p>
              <h2 className="mt-3 text-4xl italic [font-family:var(--font-fashlock-display)]">The closet map</h2>
            </div>
            <p className="text-sm text-[#8C7B6E]">{items.length} {items.length === 1 ? "piece" : "pieces"}</p>
          </div>

          {items.length ? (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {items.map((item) => (
                <article key={item.id} className="group relative">
                  <div className="aspect-[4/5] overflow-hidden rounded-[12px] bg-[#EEE8E1]">
                    <img src={thumbnailUrl(item.image_url, 360, 450)} alt={pieceLabel(item)} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" />
                  </div>
                  <div className="mt-3 pr-9">
                    <p className="truncate text-sm text-[#2C2A27]">{pieceLabel(item)}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#9B8C80]">{item.category}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteItem(item)}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#FAF7F4]/90 text-[#B03A5B] opacity-100 shadow-sm backdrop-blur transition md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`Delete ${pieceLabel(item)}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-[14px] border border-[#E5DAD0] bg-[#F0EBE3] px-6 py-14 text-center">
              <p className="text-3xl italic [font-family:var(--font-fashlock-display)]">Start with one piece.</p>
              <p className="mt-3 text-sm text-[#8C7B6E]">A shirt, trouser, shoe, bag, anything you actually own.</p>
            </div>
          )}
        </section>

        {items.length > 0 ? (
          <section className="mt-[72px] rounded-[16px] bg-[#2C2418] px-5 py-8 text-[#FAF7F4] md:px-8 md:py-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#DCA0B0]">Complete this look</p>
                <h2 className="mt-3 text-4xl italic [font-family:var(--font-fashlock-display)]">What you're missing.</h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[#D8CCC0]">
                  We'll use your uploaded pieces and suggest the few smart additions that make them feel like complete outfits.
                </p>
              </div>
              {items.length >= 3 ? (
                <button
                  type="button"
                  onClick={completeLooks}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#B03A5B] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#982F4D]"
                >
                  <Sparkles className="h-4 w-4" />
                  See what to add
                </button>
              ) : (
                <p className="max-w-sm rounded-[12px] border border-[#FAF7F4]/15 bg-[#FAF7F4]/8 px-5 py-4 text-sm leading-6 text-[#D8CCC0]">
                  Add {piecesNeeded} more {piecesNeeded === 1 ? "piece" : "pieces"} to see what's missing from your outfits.
                </p>
              )}
            </div>

            {outfits.length ? (
              <div className="mt-8">
                <div className="grid gap-5 lg:grid-cols-3">
                  {outfits.map((outfit) => (
                    <motion.article
                      key={outfit.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-[14px] bg-[#FAF7F4] p-5 text-[#2C2A27]"
                    >
                      <h3 className="text-2xl italic leading-tight [font-family:var(--font-fashlock-display)]">{outfit.name}</h3>
                      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8C7B6E]">Uses</p>
                      <div className="mt-3 space-y-2">
                        {outfit.uses.map((piece) => (
                          <p key={piece} className="text-sm text-[#2C2A27]">{piece}</p>
                        ))}
                      </div>
                      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#B03A5B]">Missing</p>
                      <div className="mt-3 space-y-2">
                        {outfit.missing.map((piece) => (
                          <p key={piece} className="rounded-[10px] bg-[#B03A5B]/10 px-3 py-2 text-sm text-[#B03A5B]">{piece}</p>
                        ))}
                      </div>
                      <p className="mt-5 text-sm italic leading-6 text-[#7A6F65]">{outfit.why}</p>
                    </motion.article>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/style?wardrobe=true";
                  }}
                  className="mt-7 inline-flex rounded-full border border-[#FAF7F4]/35 px-6 py-3 text-sm font-semibold text-[#FAF7F4] transition hover:border-[#DCA0B0] hover:text-[#DCA0B0]"
                >
                  Not sure what actually suits you? Ask Laila →
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
