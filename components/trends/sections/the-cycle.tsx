'use client'

import { TrendData } from '@/app/trends/page'
import TrendImageCard from './trend-image-card'

interface TheCycleProps {
  trends: TrendData[]
  loading: boolean
  onTrendClick: (trend: TrendData) => void
}

type CycleStage = 'RISING' | 'PEAKING' | 'FADING'

const STAGES: Array<{ key: CycleStage; title: string }> = [
  { key: 'RISING', title: 'Rising' },
  { key: 'PEAKING', title: 'Peaking' },
  { key: 'FADING', title: 'Fading' },
]

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

export default function TheCycle({ trends, loading, onTrendClick }: TheCycleProps) {
  let lookIndex = 0

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
                style={{
                  display: 'grid',
                  gap: '24px',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                {loading
                  ? Array.from({ length: 3 }).map((_, index) => <SkeletonCard key={`${stage.key}-${index}`} />)
                  : stageTrends.map((trend) => {
                      const index = lookIndex
                      lookIndex += 1

                      return (
                        <TrendImageCard
                          key={`${stage.key}-${trend.id}`}
                          trend={trend}
                          index={index}
                          onTrendClick={onTrendClick}
                        />
                      )
                    })}
              </div>
            </div>
          )
        })}
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
