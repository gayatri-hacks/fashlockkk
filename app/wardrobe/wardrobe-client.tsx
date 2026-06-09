"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2, Upload, X } from "lucide-react";
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

type StyleDirection = {
  occasion: string;
  vibe: string[] | string;
  howToWear: string;
  addThese: string[];
  avoid: string;
  editorialLine: string;
};

type SavedOutfit = {
  id: string;
  item_ids: string[];
  occasion: string | null;
  gemini_feedback: string | null;
  created_at: string;
};

type Tab = "wardrobe" | "style" | "saved";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "wardrobe", label: "My Wardrobe" },
  { id: "style", label: "Style My Pieces" },
  { id: "saved", label: "Saved Looks" },
];

const categories = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories"];

const fashionQuotes = [
  "Fashion fades, style is eternal. - Yves Saint Laurent",
  "Simplicity is the keynote of all true elegance. - Coco Chanel",
  "Elegance is not standing out, but being remembered. - Giorgio Armani",
  "Style is a way to say who you are without speaking. - Rachel Zoe",
];

const colorMap: Record<string, string> = {
  black: "#111111",
  white: "#f8f5ef",
  ivory: "#f6efe5",
  cream: "#efe1c7",
  beige: "#d3b990",
  brown: "#74503a",
  tan: "#c89f72",
  blue: "#486c9f",
  navy: "#1b2742",
  denim: "#5e789c",
  pink: "#d889a5",
  red: "#b33a3d",
  burgundy: "#7f253f",
  green: "#55775a",
  olive: "#717348",
  yellow: "#d8b94a",
  gold: "#c8a34a",
  silver: "#bfc1c4",
  grey: "#8d8982",
  gray: "#8d8982",
  purple: "#7c5a8a",
  orange: "#c97845",
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

function colorValue(color?: string | null) {
  if (!color) return "#B9AEA3";
  const normalized = color.toLowerCase().trim();
  return colorMap[normalized] ?? normalized;
}

function directionFromSaved(saved: SavedOutfit): StyleDirection | null {
  if (!saved.gemini_feedback) return null;

  try {
    return JSON.parse(saved.gemini_feedback) as StyleDirection;
  } catch {
    return null;
  }
}

function firstFeedbackLine(saved: SavedOutfit) {
  const direction = directionFromSaved(saved);
  if (direction?.editorialLine) return direction.editorialLine;
  return saved.gemini_feedback?.split(". ")[0] ?? "Saved styling direction";
}

function LoadingScreen({ mode }: { mode: "upload" | "style" }) {
  const quote = fashionQuotes[new Date().getSeconds() % fashionQuotes.length];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#FAF7F4] px-6 text-center text-[#2C2A27]"
    >
      <div>
        <h2 className="text-4xl italic leading-tight [font-family:var(--font-fashlock-display)] md:text-5xl">
          {mode === "upload" ? "Analysing your piece..." : "Finding your 6 looks..."}
        </h2>
        {mode === "style" ? <p className="mx-auto mt-7 max-w-xl text-sm leading-7 text-[#7A6F65]">{quote}</p> : null}
        <motion.div
          animate={{ width: [42, 132, 42], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mt-8 h-px bg-[#B03A5B]"
        />
      </div>
    </motion.div>
  );
}

function WardrobeCard({
  item,
  onAdd,
  onDelete,
}: {
  item: WardrobeItem;
  onAdd?: (item: WardrobeItem) => void;
  onDelete: (item: WardrobeItem) => void;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div
      className="group relative w-[128px] shrink-0"
      onContextMenu={(event) => {
        event.preventDefault();
        setShowDelete(true);
      }}
      onTouchStart={() => {
        longPress.current = setTimeout(() => setShowDelete(true), 520);
      }}
      onTouchEnd={() => {
        if (longPress.current) clearTimeout(longPress.current);
      }}
    >
      <button
        type="button"
        onClick={() => onAdd?.(item)}
        className="relative block aspect-square w-full overflow-hidden rounded-[10px] bg-white outline-none ring-1 ring-transparent transition hover:ring-[#B03A5B]"
      >
        <img src={thumbnailUrl(item.image_url, 260, 260)} alt={item.name ?? "Wardrobe item"} className="h-full w-full object-cover" loading="lazy" />
        {onAdd ? (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/92 text-[#B03A5B] opacity-0 shadow-sm transition group-hover:opacity-100">
            <Plus className="h-4 w-4" />
          </span>
        ) : null}
      </button>
      <div className="mt-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: colorValue(item.color) }} />
        <p className="truncate text-[12px] text-[#2C2A27]">{item.name ?? "Wardrobe piece"}</p>
      </div>
      <button
        type="button"
        onClick={() => onDelete(item)}
        className={cn(
          "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#B03A5B] shadow-sm transition",
          showDelete ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        aria-label={`Delete ${item.name ?? "item"}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function WardrobeClient({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("wardrobe");
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [savedLooks, setSavedLooks] = useState<SavedOutfit[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [directions, setDirections] = useState<StyleDirection[]>([]);
  const [loading, setLoading] = useState<"upload" | "style" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: items.filter((item) => item.category === category),
      })),
    [items],
  );

  const selectedItems = useMemo(() => selectedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean) as WardrobeItem[], [items, selectedIds]);

  async function refresh() {
    const [itemsRes, savedRes] = await Promise.all([fetch("/api/wardrobe/items"), fetch("/api/wardrobe/saved")]);
    const itemsData = await itemsRes.json();
    const savedData = await savedRes.json();

    if (itemsData.success) setItems(itemsData.items);
    if (savedData.success) setSavedLooks(savedData.outfits);
  }

  useEffect(() => {
    refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Failed to load wardrobe"));
  }, []);

  async function uploadFile(file: File | null) {
    if (!file) return;

    setError(null);
    setLoading("upload");

    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/wardrobe/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mediaType: file.type || "image/jpeg",
          fileName: file.name,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Upload failed");
      }

      setItems((current) => [data.item, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setLoading(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    uploadFile(event.dataTransfer.files?.[0] ?? null);
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    uploadFile(event.target.files?.[0] ?? null);
  }

  function toggleSelected(item: WardrobeItem) {
    setDirections([]);
    setSelectedIds((current) => {
      if (current.includes(item.id)) return current.filter((id) => id !== item.id);
      if (current.length >= 5) return current;
      return [...current, item.id];
    });
  }

  async function deleteItem(item: WardrobeItem) {
    setError(null);
    const res = await fetch(`/api/wardrobe/items?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    const data = await res.json();

    if (!res.ok || !data.success) {
      setError(data.error ?? "Could not delete item");
      return;
    }

    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setSelectedIds((current) => current.filter((id) => id !== item.id));
  }

  async function generateDirections() {
    if (!selectedItems.length) return;

    setError(null);
    setLoading("style");

    try {
      const res = await fetch("/api/wardrobe/style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedItems }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Could not style these pieces");
      }

      setDirections(data.directions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not style these pieces");
    } finally {
      setLoading(null);
    }
  }

  async function saveDirection(direction: StyleDirection) {
    setError(null);
    const res = await fetch("/api/wardrobe/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemIds: selectedIds,
        occasion: direction.occasion,
        geminiFeedback: JSON.stringify(direction),
      }),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      setError(data.error ?? "Could not save look");
      return;
    }

    setSavedLooks((current) => [data.outfit, ...current]);
  }

  async function deleteSaved(saved: SavedOutfit) {
    const res = await fetch(`/api/wardrobe/saved?id=${encodeURIComponent(saved.id)}`, { method: "DELETE" });
    const data = await res.json();

    if (!res.ok || !data.success) {
      setError(data.error ?? "Could not delete saved look");
      return;
    }

    setSavedLooks((current) => current.filter((look) => look.id !== saved.id));
  }

  function openSaved(saved: SavedOutfit) {
    setSelectedIds(saved.item_ids.filter((id) => items.some((item) => item.id === id)).slice(0, 5));
    const direction = directionFromSaved(saved);
    setDirections(direction ? [direction] : []);
    setActiveTab("style");
  }

  return (
    <div className={cn("min-h-screen bg-[#FAF7F4] text-[#2C2A27] [font-family:var(--font-fashlock-body)]", className)}>
      <AnimatePresence>{loading ? <LoadingScreen mode={loading} /> : null}</AnimatePresence>

      <main className="px-6 pb-24 pt-14 md:px-[120px]">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#7A6F65]">Fashlock wardrobe</p>
            <h1 className="mt-4 text-5xl italic leading-none [font-family:var(--font-fashlock-display)] md:text-7xl">
              Your pieces, styled beautifully.
            </h1>
          </div>
          <div className="flex gap-6 overflow-x-auto text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7A6F65]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn("whitespace-nowrap pb-2 transition", activeTab === tab.id ? "border-b border-[#B03A5B] text-[#B03A5B]" : "border-b border-transparent")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-8 flex items-start justify-between gap-4 rounded-[12px] bg-white px-5 py-4 text-sm leading-6 text-[#B03A5B] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {activeTab === "wardrobe" ? (
          <section className="mt-12">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              className="flex w-full flex-col items-center justify-center rounded-[12px] border border-dashed border-[#B03A5B]/30 px-6 py-8 text-center transition hover:bg-white/45"
            >
              <Upload className="mb-5 h-5 w-5 text-[#B03A5B]" />
              <span className="text-3xl italic [font-family:var(--font-fashlock-display)]">Add to your wardrobe</span>
              <span className="mt-3 text-[13px] text-[#7A6F65]">Drop an image or click to upload</span>
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />

            <div className="mt-14 space-y-12">
              {grouped.map((group) => (
                <div key={group.category}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">{group.category}</p>
                  {group.items.length ? (
                    <div className="scrollbar-none mt-5 flex gap-5 overflow-x-auto pb-2">
                      {group.items.map((item) => (
                        <WardrobeCard key={item.id} item={item} onAdd={toggleSelected} onDelete={deleteItem} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-5 text-[13px] text-[#7A6F65]">No pieces here yet.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "style" ? (
          <section className="mt-12">
            {!items.length ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <h2 className="text-4xl italic [font-family:var(--font-fashlock-display)]">Your wardrobe is empty</h2>
                <p className="mt-4 text-sm text-[#7A6F65]">Upload your first piece to start styling</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("wardrobe")}
                  className="mt-8 rounded-full border border-[#B03A5B] px-6 py-3 text-sm font-semibold text-[#B03A5B]"
                >
                  Add a piece
                </button>
              </div>
            ) : directions.length ? (
              <div>
                <div className="sticky top-[77px] z-30 -mx-6 flex items-center justify-between gap-5 border-y border-[#2C2A27]/10 bg-[#FAF7F4]/95 px-6 py-4 backdrop-blur md:-mx-[120px] md:px-[120px]">
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="flex -space-x-2">
                      {selectedItems.map((item) => (
                        <img key={item.id} src={thumbnailUrl(item.image_url, 80, 80)} alt={item.name ?? "Selected piece"} className="h-10 w-10 rounded-full object-cover ring-2 ring-[#FAF7F4]" loading="lazy" />
                      ))}
                    </div>
                    <p className="truncate text-[13px] text-[#7A6F65]">Styling these pieces</p>
                  </div>
                  <button type="button" onClick={() => setDirections([])} className="shrink-0 text-sm text-[#B03A5B]">
                    Change pieces
                  </button>
                </div>

                <h2 className="mt-12 text-5xl italic leading-none [font-family:var(--font-fashlock-display)]">6 ways to wear these</h2>
                <div className="mt-10 grid gap-6 lg:grid-cols-2">
                  {directions.map((direction) => {
                    const vibes = Array.isArray(direction.vibe) ? direction.vibe : direction.vibe.split(",").map((vibe) => vibe.trim());
                    return (
                      <article key={direction.occasion} className="rounded-[12px] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">{direction.occasion}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {vibes.slice(0, 3).map((vibe) => (
                            <span key={vibe} className="rounded-full bg-[#B03A5B]/10 px-3 py-1 text-[12px] text-[#B03A5B]">
                              {vibe}
                            </span>
                          ))}
                        </div>
                        <p className="mt-6 text-[16px] italic leading-7 [font-family:var(--font-fashlock-display)]">{direction.editorialLine}</p>
                        <div className="my-6 h-px bg-[#B03A5B]" />
                        <p className="text-[13px] leading-7 text-[#2C2A27]">{direction.howToWear}</p>
                        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">Add these</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {direction.addThese?.map((addition) => (
                            <span key={addition} className="rounded-full bg-[#EEE8E1] px-3 py-1 text-[12px] text-[#2C2A27]">
                              {addition}
                            </span>
                          ))}
                        </div>
                        <p className="mt-5 text-[12px] italic leading-6 text-[#7A6F65]">Avoid: {direction.avoid}</p>
                        <button
                          type="button"
                          onClick={() => saveDirection(direction)}
                          className="mt-6 rounded-full bg-[#B03A5B] px-5 py-2.5 text-sm font-semibold text-white"
                        >
                          Save look
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {items.map((item) => {
                    const selected = selectedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleSelected(item)}
                        className={cn("group relative text-left", selectedIds.length >= 5 && !selected ? "opacity-45" : "opacity-100")}
                      >
                        <span className={cn("block aspect-square overflow-hidden rounded-[12px] bg-white ring-1 transition", selected ? "ring-2 ring-[#B03A5B]" : "ring-transparent")}>
                          <img src={thumbnailUrl(item.image_url, 360, 360)} alt={item.name ?? "Wardrobe item"} className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
                        </span>
                        {selected ? (
                          <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#B03A5B] text-white">
                            <Check className="h-4 w-4" />
                          </span>
                        ) : null}
                        <span className="mt-3 block truncate text-[13px] text-[#2C2A27]">{item.name ?? "Wardrobe piece"}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedItems.length ? (
                  <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-5 rounded-full bg-[#2C2A27] px-5 py-3 text-white shadow-[0_10px_32px_rgba(0,0,0,0.18)]">
                    <span className="text-sm">{selectedItems.length} pieces selected</span>
                    <button type="button" onClick={generateDirections} className="rounded-full bg-[#B03A5B] px-5 py-2 text-sm font-semibold">
                      Style these
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "saved" ? (
          <section className="mt-12">
            {savedLooks.length ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {savedLooks.map((saved) => {
                  const lookItems = saved.item_ids.map((id) => items.find((item) => item.id === id)).filter(Boolean) as WardrobeItem[];
                  return (
                    <article key={saved.id} className="group relative rounded-[12px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                      <button type="button" onClick={() => openSaved(saved)} className="block w-full text-left">
                        <div className="grid aspect-[4/3] grid-cols-3 gap-2 overflow-hidden rounded-[10px] bg-[#FAF7F4] p-3">
                          {lookItems.slice(0, 5).map((item, index) => (
                            <img
                              key={item.id}
                              src={thumbnailUrl(item.image_url, index === 0 ? 420 : 180, index === 0 ? 420 : 180)}
                              alt={item.name ?? "Saved item"}
                              className={cn("h-full w-full rounded-[8px] object-cover", index === 0 ? "col-span-2 row-span-2" : "")}
                              loading="lazy"
                            />
                          ))}
                        </div>
                        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7A6F65]">{saved.occasion ?? "Saved look"}</p>
                        <p className="mt-3 line-clamp-2 text-[15px] italic leading-7 [font-family:var(--font-fashlock-display)]">{firstFeedbackLine(saved)}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSaved(saved)}
                        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#B03A5B] opacity-0 shadow-sm transition group-hover:opacity-100"
                        aria-label="Delete saved look"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center text-center">
                <div>
                  <h2 className="text-4xl italic [font-family:var(--font-fashlock-display)]">No saved looks yet</h2>
                  <p className="mt-4 text-sm text-[#7A6F65]">Style a few pieces, then save the directions you love.</p>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
