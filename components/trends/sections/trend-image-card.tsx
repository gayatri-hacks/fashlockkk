'use client'

import Image from 'next/image'
import { TrendData } from '@/app/trends/page'
import { rankLookLibrary } from '@/lib/look-library'

type TrendImageCardProps = {
  trend: TrendData
  index: number
  anchorId?: string
  imagePriority?: boolean
  metadataMode?: 'stage-market' | 'market'
  onTrendClick: (trend: TrendData) => void
}

const FALLBACK_LOOKS = [
  '/looks/female-carolyn-bessette-uniform.jpg',
  '/looks/female-rachel-green-off-duty.jpg',
  '/looks/female-linen-co-ord-set.jpg',
  '/looks/female-satin-slip-dress.jpg',
  '/looks/male-soft-linen-suit.jpg',
  '/looks/male-cargo-utility-look.jpg',
  '/looks/female-trench-coat-formula.jpg',
  '/looks/male-wide-leg-denim.jpg',
]

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function fallbackLookImageForTrend(trend: TrendData, index: number) {
  const ranked = rankLookLibrary({
    trendDrivers: [
      trend.keyword,
      trend.editorialName,
      trend.velocity,
      ...(trend.shopSearchTerms || []),
      ...(trend.howToWear || []),
    ],
  })

  return ranked[0]?.heroImage || FALLBACK_LOOKS[index % FALLBACK_LOOKS.length]
}

function cardImageForTrend(trend: TrendData, index: number) {
  return trend.conceptImageUrl || trend.generatedImageUrl || trend.pexelsImageUrl || fallbackLookImageForTrend(trend, index)
}

function primaryMarket(trend: TrendData) {
  const market = trend.topMarkets?.[0]
  return market?.code || market?.market || 'Global'
}

function metadataForTrend(trend: TrendData, mode: TrendImageCardProps['metadataMode']) {
  const market = primaryMarket(trend)
  if (mode === 'market') return market

  const stage = titleCase(trend.velocity.toLowerCase())
  return `${stage} · ${market}`
}

export default function TrendImageCard({
  trend,
  index,
  anchorId,
  imagePriority = false,
  metadataMode = 'stage-market',
  onTrendClick,
}: TrendImageCardProps) {
  const imageUrl = cardImageForTrend(trend, index)
  const metadata = metadataForTrend(trend, metadataMode)

  return (
    <article
      id={anchorId}
      onClick={() => onTrendClick(trend)}
      style={{
        aspectRatio: '3 / 4',
        borderRadius: '6px',
        boxShadow: '0 0 0 rgba(44,36,24,0)',
        cursor: 'pointer',
        overflow: 'hidden',
        position: 'relative',
        transform: 'scale(1)',
        transition: 'transform 250ms ease, box-shadow 250ms ease',
        width: '100%',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = 'scale(1.02)'
        event.currentTarget.style.boxShadow = '0 18px 42px rgba(44,36,24,0.18)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = 'scale(1)'
        event.currentTarget.style.boxShadow = '0 0 0 rgba(44,36,24,0)'
      }}
    >
      <Image
        src={imageUrl}
        alt={`${trend.editorialName} trend concept`}
        fill
        priority={imagePriority}
        sizes="(min-width: 1280px) 18vw, (min-width: 900px) 30vw, (min-width: 640px) 45vw, 92vw"
        style={{
          objectFit: 'cover',
          objectPosition: 'center top',
        }}
      />

      <div
        style={{
          color: 'rgba(250,247,244,0.85)',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '11px',
          fontWeight: 400,
          left: '14px',
          letterSpacing: '0.08em',
          position: 'absolute',
          textTransform: 'uppercase',
          top: '14px',
        }}
      >
        Look {String(index + 1).padStart(2, '0')}
      </div>

      <div
        style={{
          background: 'linear-gradient(to top, rgba(44,36,24,0.85), rgba(44,36,24,0))',
          bottom: 0,
          height: '58%',
          left: 0,
          position: 'absolute',
          right: 0,
        }}
      />

      <div
        style={{
          bottom: '18px',
          left: '16px',
          position: 'absolute',
          right: '16px',
        }}
      >
        <h3
          style={{
            color: '#FAF7F4',
            fontFamily: 'var(--font-cormorant)',
            fontSize: '20px',
            fontWeight: 500,
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {trend.editorialName}
        </h3>
        <p
          style={{
            color: 'rgba(250,247,244,0.78)',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '11px',
            fontWeight: 400,
            letterSpacing: '0.05em',
            lineHeight: 1.4,
            margin: '7px 0 0',
            textTransform: metadataMode === 'stage-market' ? 'uppercase' : 'none',
          }}
        >
          {metadata}
        </p>
      </div>
    </article>
  )
}
