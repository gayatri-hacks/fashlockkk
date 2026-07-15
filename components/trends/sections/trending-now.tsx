'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendData } from '@/app/trends/page'

interface TrendingNowProps {
  trends: TrendData[]
  loading: boolean
  onTrendClick: (trend: TrendData) => void
}

function trendAnchorId(id: number) {
  return `trend-card-${id}`
}

type TrendCardImage = {
  imageUrl: string | null
  source?: string
  status?: string
}

export default function TrendingNow({ trends, loading, onTrendClick }: TrendingNowProps) {
  const [cardImages, setCardImages] = useState<Record<number, TrendCardImage>>({})
  const visibleTrendIds = useMemo(() => trends.slice(0, 6).map((trend) => trend.id).join(','), [trends])
  const imageStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    objectPosition: 'center 35%',
    filter: 'saturate(0.88) contrast(0.96) brightness(1.06)',
    transition: 'transform 0.5s ease, filter 0.3s ease',
  }

  const handleCardEnter = (card: HTMLDivElement) => {
    card.style.transform = 'translateY(-4px)'
    card.style.boxShadow = '0 14px 36px rgba(44,36,24,0.1)'
    const image = card.querySelector<HTMLImageElement>('img')
    if (image) {
      image.style.transform = 'scale(1.025)'
      image.style.filter = 'saturate(0.94) contrast(0.98) brightness(1.08)'
    }
  }

  const handleCardLeave = (card: HTMLDivElement) => {
    card.style.transform = 'translateY(0)'
    card.style.boxShadow = '0 2px 18px rgba(44,36,24,0.05)'
    const image = card.querySelector<HTMLImageElement>('img')
    if (image) {
      image.style.transform = 'scale(1)'
      image.style.filter = 'saturate(0.88) contrast(0.96) brightness(1.06)'
    }
  }

  const renderVelocityBadge = (velocity: string) => {
    let bg = '#F0E4D0'
    let color = '#8C6030'

    if (velocity === 'RISING') {
      bg = '#F4DCE4'
      color = '#B03A5B'
    } else if (velocity === 'FADING') {
      bg = '#E8E4E0'
      color = '#8C7B6E'
    }

    return (
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          backgroundColor: bg,
          color: color,
          padding: '4px 8px',
          borderRadius: '2px',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '8px',
          fontWeight: 200,
          letterSpacing: '3px',
          textTransform: 'uppercase',
          zIndex: 10,
        }}
      >
        {velocity}
      </div>
    )
  }

  useEffect(() => {
    if (!trends.length) return

    let cancelled = false
    const visibleTrends = trends.slice(0, 6)

    setCardImages((current) => {
      const next = { ...current }
      for (const trend of visibleTrends) {
        if (next[trend.id] === undefined) {
          next[trend.id] = { imageUrl: trend.pexelsImageUrl, source: trend.pexelsImageUrl ? 'placeholder' : 'loading', status: 'loading' }
        }
      }
      return next
    })

    visibleTrends.forEach(async (trend) => {
      try {
        const response = await fetch('/api/trends/generate-outfit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: 'trend-card',
            cardImage: true,
            trendKeyword: trend.keyword,
            outfitTitle: `${trend.editorialName} trend card outfit`,
            gender: 'women',
            velocity: trend.velocity,
            markets: trend.topMarkets,
            oneLiner: trend.oneLiner,
          }),
        })
        const data = response.ok ? await response.json() : null
        if (cancelled) return

        setCardImages((current) => ({
          ...current,
          [trend.id]: {
            imageUrl: data?.imageUrl || trend.pexelsImageUrl || null,
            source: data?.imageSource || (trend.pexelsImageUrl ? 'pexels' : 'fallback'),
            status: data?.status || 'fallback',
          },
        }))
      } catch (error) {
        console.error('Trend card outfit image failed:', error)
        if (cancelled) return
        setCardImages((current) => ({
          ...current,
          [trend.id]: {
            imageUrl: trend.pexelsImageUrl || null,
            source: trend.pexelsImageUrl ? 'pexels' : 'fallback',
            status: 'fallback',
          },
        }))
      }
    })

    return () => {
      cancelled = true
    }
  }, [visibleTrendIds, trends])

  const renderTrendImage = (trend: TrendData, height: string, overlay = false) => {
    const state = cardImages[trend.id]
    const imageUrl = state?.imageUrl || trend.pexelsImageUrl
    const isPreparing = !state || state.status === 'loading'
    const sourceLabel = state?.source === 'ollama' ? 'Generated for this trend' : state?.source && state.source !== 'placeholder' ? state.source.replace('_', ' ') : ''

    return (
      <div style={{ position: 'relative', width: '100%', height, backgroundColor: '#EDE8DF', overflow: 'hidden' }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${trend.editorialName} outfit`}
            style={imageStyle}
          />
        ) : (
          <div
            style={{
              alignItems: 'center',
              color: '#8C7B6E',
              display: 'flex',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '11px',
              fontWeight: 300,
              height: '100%',
              justifyContent: 'center',
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            Preparing outfit image
          </div>
        )}
        {overlay && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              top: 0,
              background: 'linear-gradient(to top, rgba(28,20,16,0.38), rgba(28,20,16,0.08) 55%, transparent)',
            }}
          />
        )}
        {(isPreparing || sourceLabel) && (
          <div
            style={{
              position: 'absolute',
              left: '12px',
              top: '12px',
              backgroundColor: 'rgba(250,247,244,0.88)',
              color: '#8C6030',
              padding: '5px 8px',
              borderRadius: '2px',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '8px',
              fontWeight: 300,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              zIndex: 10,
            }}
          >
            {isPreparing ? 'Preparing look' : sourceLabel}
          </div>
        )}
      </div>
    )
  }

  const SkeletonCard = ({ tall }: { tall?: boolean }) => (
    <div
      style={{
        backgroundColor: '#E8E0D4',
        borderRadius: '2px',
        height: tall ? '400px' : '320px',
        animation: 'pulse 2s infinite',
      }}
    />
  )

  if (loading) {
    return (
      <div style={{ padding: '64px 48px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '8px',
              fontFamily: 'var(--font-dm-sans)',
              fontWeight: 200,
              letterSpacing: '5px',
              color: '#B03A5B',
              textTransform: 'uppercase',
            }}
          >
            RIGHT NOW
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: '36px',
              fontWeight: 300,
              fontStyle: 'italic',
              color: '#2C2418',
              marginTop: '8px',
            }}
          >
            This season's defining looks
          </h2>
        </div>
        <div className="grid gap-5 mt-12">
          <SkeletonCard tall />
          <div className="grid grid-cols-2 gap-5">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="grid grid-cols-3 gap-5">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '64px 48px', backgroundColor: '#FAF7F4' }}>
      <div style={{ marginBottom: '32px' }}>
        <div
          style={{
            fontSize: '8px',
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 200,
            letterSpacing: '5px',
            color: '#B03A5B',
            textTransform: 'uppercase',
          }}
        >
          RIGHT NOW
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '36px',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#2C2418',
            marginTop: '8px',
          }}
        >
          This season's defining looks
        </h2>
      </div>

      <div className="grid gap-6">
        {/* First card - full width, tall */}
        {trends[0] && (
          <div
            id={trendAnchorId(trends[0].id)}
            onClick={() => onTrendClick(trends[0])}
            style={{
              cursor: 'pointer',
              backgroundColor: '#F0EBE3',
              borderRadius: '2px',
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              height: '400px',
              position: 'relative',
              boxShadow: '0 2px 18px rgba(44,36,24,0.05)',
            }}
            onMouseEnter={(e) => {
              handleCardEnter(e.currentTarget)
            }}
            onMouseLeave={(e) => {
              handleCardLeave(e.currentTarget)
            }}
          >
            {renderTrendImage(trends[0], '100%', true)}
            {renderVelocityBadge(trends[0].velocity)}
            <div
              style={{
                position: 'absolute',
                bottom: '0',
                left: '0',
                right: '0',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontSize: '28px',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: '#F0EBE3',
                  padding: '16px',
                  paddingBottom: '0',
                  margin: 0,
                }}
              >
                {trends[0].editorialName}
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '12px',
                  fontWeight: 300,
                  color: '#E8DED4',
                  padding: '14px 16px',
                  margin: 0,
                  maxWidth: '720px',
                }}
              >
                {trends[0].oneLiner}
              </p>
              <div
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '11px',
                  fontWeight: 300,
                  color: '#B03A5B',
                  padding: '0 16px 16px',
                }}
              >
                Explore trend →
              </div>
            </div>
          </div>
        )}

        {/* Cards 2-3 side by side */}
        <div className="grid grid-cols-2 gap-6">
          {trends.slice(1, 3).map((trend) => (
            <div
              id={trendAnchorId(trend.id)}
              key={trend.id}
              onClick={() => onTrendClick(trend)}
              style={{
                cursor: 'pointer',
                backgroundColor: '#F0EBE3',
                borderRadius: '2px',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                minHeight: '390px',
                position: 'relative',
                boxShadow: '0 2px 18px rgba(44,36,24,0.05)',
              }}
              onMouseEnter={(e) => {
                handleCardEnter(e.currentTarget)
              }}
              onMouseLeave={(e) => {
                handleCardLeave(e.currentTarget)
              }}
            >
              {renderTrendImage(trend, '250px')}
              {renderVelocityBadge(trend.velocity)}
              <div style={{ padding: '14px 16px' }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-cormorant)',
                    fontSize: '20px',
                    fontWeight: 400,
                    fontStyle: 'italic',
                    color: '#2C2418',
                    margin: 0,
                    marginBottom: '8px',
                  }}
                >
                  {trend.editorialName}
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '11px',
                    fontWeight: 300,
                    color: '#8C7B6E',
                    margin: 0,
                    marginBottom: '8px',
                  }}
                >
                  {trend.oneLiner}
                </p>
                <div
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '11px',
                    fontWeight: 300,
                    color: '#B03A5B',
                  }}
                >
                  Explore trend →
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Cards 4-6 in a row */}
        <div className="grid grid-cols-3 gap-6">
          {trends.slice(3, 6).map((trend) => (
            <div
              id={trendAnchorId(trend.id)}
              key={trend.id}
              onClick={() => onTrendClick(trend)}
              style={{
                cursor: 'pointer',
                backgroundColor: '#F0EBE3',
                borderRadius: '2px',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                minHeight: '320px',
                position: 'relative',
                boxShadow: '0 2px 18px rgba(44,36,24,0.05)',
              }}
              onMouseEnter={(e) => {
                handleCardEnter(e.currentTarget)
              }}
              onMouseLeave={(e) => {
                handleCardLeave(e.currentTarget)
              }}
            >
              {renderTrendImage(trend, '220px')}
              {renderVelocityBadge(trend.velocity)}
              <div style={{ padding: '10px 12px' }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-cormorant)',
                    fontSize: '16px',
                    fontWeight: 400,
                    fontStyle: 'italic',
                    color: '#2C2418',
                    margin: 0,
                    marginBottom: '4px',
                  }}
                >
                  {trend.editorialName}
                </h3>
                <div
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '10px',
                    fontWeight: 300,
                    color: '#B03A5B',
                  }}
                >
                  Explore →
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
