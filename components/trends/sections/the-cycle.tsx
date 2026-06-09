'use client'

import { TrendData } from '@/app/trends/page'

interface TheCycleProps {
  trends: TrendData[]
  loading: boolean
  onTrendClick: (trend: TrendData) => void
}

export default function TheCycle({ trends, loading, onTrendClick }: TheCycleProps) {
  const risingTrends = trends.filter((t) => t.velocity === 'RISING')
  const peakingTrends = trends.filter((t) => t.velocity === 'PEAKING')
  const fadingTrends = trends.filter((t) => t.velocity === 'FADING')

  const TrendColumn = ({
    title,
    trendList,
    loading,
  }: {
    title: string
    trendList: TrendData[]
    loading: boolean
  }) => (
    <div style={{ flex: 1 }}>
      <h3
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '18px',
          fontWeight: 300,
          fontStyle: 'italic',
          color: '#2C2418',
          marginBottom: '24px',
          paddingBottom: '12px',
          borderBottom: '0.5px solid #D4C8BC',
        }}
      >
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {loading
          ? Array(10)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: '40px',
                    backgroundColor: '#E8E0D4',
                    animation: 'pulse 2s infinite',
                  }}
                />
              ))
          : trendList.map((trend) => (
              <TrendRow key={trend.id} trend={trend} onTrendClick={onTrendClick} />
            ))}
      </div>
    </div>
  )

  const TrendRow = ({
    trend,
    onTrendClick,
  }: {
    trend: TrendData
    onTrendClick: (trend: TrendData) => void
  }) => {
    const getVelocityIcon = () => {
      if (trend.velocity === 'RISING') return '↑'
      if (trend.velocity === 'PEAKING') return '•'
      return '↓'
    }

    const getVelocityColor = () => {
      if (trend.velocity === 'RISING') return '#B03A5B'
      if (trend.velocity === 'PEAKING') return '#8C7B6E'
      return '#8C7B6E'
    }

    return (
      <div
        onClick={() => onTrendClick(trend)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 0',
          borderBottom: '0.5px solid #E8E0D4',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.paddingLeft = '8px'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.paddingLeft = '0'
        }}
      >
        <span
          style={{
            color: getVelocityColor(),
            fontSize: '16px',
            width: '16px',
          }}
        >
          {getVelocityIcon()}
        </span>

        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: '18px',
              fontWeight: 400,
              fontStyle: 'italic',
              color: '#2C2418',
            }}
          >
            {trend.editorialName}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '9px',
              fontWeight: 200,
              color: '#C4B4A6',
              marginTop: '4px',
            }}
          >
            {trend.topMarkets.slice(0, 2).map((m) => m.code).join(' · ')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '64px 48px', backgroundColor: '#FAF7F4' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '48px' }}>
        <TrendColumn title="Rising" trendList={risingTrends} loading={loading} />
        <TrendColumn title="Peaking" trendList={peakingTrends} loading={loading} />
        <TrendColumn title="Fading" trendList={fadingTrends} loading={loading} />
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
