'use client'

import { useState } from 'react'
import { TrendData } from '@/app/trends/page'
import TrendImageCard from './trend-image-card'

interface TheCycleProps {
  trends: TrendData[]
  loading: boolean
  featuredTrendIds?: number[]
  onTrendClick: (trend: TrendData) => void
}

type CycleStage = 'RISING' | 'PEAKING' | 'FADING'

const STAGES: Array<{ key: CycleStage; title: string }> = [
  { key: 'RISING', title: 'Rising' },
  { key: 'PEAKING', title: 'Peaking' },
  { key: 'FADING', title: 'Fading' },
]

const PREVIEW_LIMIT = 5
const SKELETON_KEYS = ['slot-01', 'slot-02', 'slot-03', 'slot-04', 'slot-05']

function previewTrendsForStage(stageTrends: TrendData[], featuredTrendIds: Set<number>) {
  const eligible = stageTrends.filter((trend) => !featuredTrendIds.has(trend.id))
  if (eligible.length >= PREVIEW_LIMIT) return eligible.slice(0, PREVIEW_LIMIT)

  const fallback = stageTrends.filter((trend) => !eligible.some((item) => item.id === trend.id))
  return [...eligible, ...fallback].slice(0, PREVIEW_LIMIT)
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

export default function TheCycle({ trends, loading, featuredTrendIds = [], onTrendClick }: TheCycleProps) {
  const [expandedStages, setExpandedStages] = useState<Record<CycleStage, boolean>>({
    RISING: false,
    PEAKING: false,
    FADING: false,
  })
  const featuredIds = new Set(featuredTrendIds)

  const toggleStage = (stage: CycleStage) => {
    setExpandedStages((current) => ({
      ...current,
      [stage]: !current[stage],
    }))
  }

  return (
    <section style={{ padding: '64px 48px', backgroundColor: '#FAF7F4' }}>
      <div style={{ marginBottom: '48px' }}>
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
          THE CYCLE
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
          Every trend has a moment
        </h2>
      </div>

      <div style={{ display: 'grid', gap: '42px' }}>
        {STAGES.map((stage) => {
          const stageTrends = trends.filter((trend) => trend.velocity === stage.key)
          const expanded = expandedStages[stage.key]
          const visibleTrends = expanded ? stageTrends : previewTrendsForStage(stageTrends, featuredIds)
          const controlsId = `trend-cycle-${stage.key.toLowerCase()}`
          const hasMore = stageTrends.length > PREVIEW_LIMIT

          return (
            <div key={stage.key}>
              <h3
                style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontSize: '24px',
                  fontWeight: 500,
                  fontStyle: 'italic',
                  color: '#2C2418',
                  margin: '0 0 18px',
                  paddingBottom: '12px',
                  borderBottom: '0.5px solid #D4C8BC',
                }}
              >
                {stage.title}
              </h3>

              <div
                id={controlsId}
                className="cycle-grid"
                style={{
                  display: 'grid',
                  gap: '24px',
                }}
              >
                {loading
                  ? SKELETON_KEYS.map((key) => <SkeletonCard key={`${stage.key}-${key}`} />)
                  : visibleTrends.map((trend, index) => (
                      <TrendImageCard
                        key={`${stage.key}-${trend.id}`}
                        trend={trend}
                        index={index}
                        metadataMode="market"
                        onTrendClick={onTrendClick}
                      />
                    ))}
              </div>

              {!loading && hasMore ? (
                <div style={{ marginTop: '18px', textAlign: 'center' }}>
                  <button
                    type="button"
                    aria-controls={controlsId}
                    aria-expanded={expanded}
                    onClick={() => toggleStage(stage.key)}
                    style={{
                      background: 'transparent',
                      border: '0.5px solid #D4C8BC',
                      borderRadius: '999px',
                      color: '#8C3A54',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '11px',
                      fontWeight: 300,
                      letterSpacing: '0.12em',
                      padding: '10px 18px',
                      textTransform: 'uppercase',
                      transition: 'border-color 200ms ease, color 200ms ease, background-color 200ms ease',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = '#F0EBE3'
                      event.currentTarget.style.borderColor = '#B03A5B'
                      event.currentTarget.style.color = '#B03A5B'
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = 'transparent'
                      event.currentTarget.style.borderColor = '#D4C8BC'
                      event.currentTarget.style.color = '#8C3A54'
                    }}
                  >
                    {expanded ? 'Show less' : 'View all'}
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .cycle-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        @media (min-width: 768px) {
          .cycle-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (min-width: 1180px) {
          .cycle-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }
      `}</style>
    </section>
  )
}
