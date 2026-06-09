"use client";

import { useEffect, useMemo, useState } from "react";
import { buildTrendImageQuery, fallbackTrendImages, type TrendGender, type TrendImage } from "@/lib/unsplash";
import { cn } from "@/lib/utils";

const EMPTY_SEED_IMAGES: TrendImage[] = [];
const imageRequestCache = new Map<string, Promise<TrendImage[]>>();

export function TrendMoodGrid({
  keyword,
  gender = "Unisex",
  seedImages = EMPTY_SEED_IMAGES,
  className,
}: {
  keyword: string;
  gender?: TrendGender;
  seedImages?: TrendImage[];
  className?: string;
}) {
  const initialImages = useMemo(() => {
    const fallback = fallbackTrendImages(keyword, 4);
    return [...seedImages, ...fallback].slice(0, 4);
  }, [keyword, seedImages]);
  const [images, setImages] = useState<TrendImage[]>(initialImages);
  const query = useMemo(() => buildTrendImageQuery(keyword, gender), [keyword, gender]);

  useEffect(() => {
    let cancelled = false;

    const fallback = fallbackTrendImages(query, 4);
    const seeded = [...seedImages, ...fallback].slice(0, 4);
    setImages(seeded);

    if (seedImages.length >= 4) {
      return () => {
        cancelled = true;
      };
    }

    const request =
      imageRequestCache.get(query) ??
      fetch(`/api/unsplash?q=${encodeURIComponent(query)}&count=4`)
        .then((response) => response.json())
        .then((payload: { images?: TrendImage[] }) => payload.images ?? []);

    imageRequestCache.set(query, request);

    request
      .then((remoteImages) => {
        if (!cancelled && remoteImages.length) {
          setImages([...seedImages, ...remoteImages].slice(0, 4));
        }
      })
      .catch(() => {
        if (!cancelled) setImages(seeded);
      });

    return () => {
      cancelled = true;
    };
  }, [query, seedImages]);

  return (
    <div className={cn("grid h-full min-h-[220px] grid-cols-2 gap-1 overflow-hidden rounded-lg bg-border", className)}>
      {images.map((image, index) => (
        <div key={`${image.id}-${index}`} className="relative min-h-[108px] overflow-hidden bg-surface">
          <img
            src={image.url}
            alt={image.alt}
            className="h-full w-full object-cover transition duration-500 hover:scale-[1.03]"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
