'use client'

import { TrendData } from '@/app/trends/page'
import TrendImageCard from './trend-image-card'

interface TrendingNowProps {
  trends: TrendData[]
  loading: boolean
  onTrendClick: (trend: TrendData) => void
}

function trendAnchorId(id: number) {
  return `trend-card-${id}`
}

function SkeletonCard() {
  return (
    <div
      style={{
        aspectRatio: '3 / 4',
        backgroundColor: '#E8E0D4',
        borderRadius: '6px',
        animation: 'pulse 2s infinite',
      }}
    />
  )
}

export default function TrendingNow({ trends, loading, onTrendClick }: TrendingNowProps) {
  const visibleTrends = trends.slice(0, 6)

  return (
    <section style={{ padding: '64px 48px', backgroundColor: '#FAF7F4' }}>
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

      <div
        style={{
          display: 'grid',
          gap: '24px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)
          : visibleTrends.map((trend, index) => (
              <TrendImageCard
                key={trend.id}
                trend={trend}
                index={index}
                anchorId={trendAnchorId(trend.id)}
                onTrendClick={onTrendClick}
              />
            ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </section>
  )
}
