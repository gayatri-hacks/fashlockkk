'use client'

import { TrendData } from '@/app/trends/page'
import { useMemo } from 'react'

interface DeepDiveHeaderProps {
  trend: TrendData
}

export default function DeepDiveHeader({ trend }: DeepDiveHeaderProps) {
  const sparklinePoints = useMemo(() => {
    const data = trend.trendData || []
    if (data.length === 0) return ''

    const width = 200
    const height = 60
    const padding = 4

    const values = data.map((d) => d.value)
    const maxValue = Math.max(...values, 100)
    const minValue = Math.min(...values, 0)
    const range = maxValue - minValue || 1

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * (width - padding * 2) + padding
      const y = height - padding - ((d.value - minValue) / range) * (height - padding * 2)
      return `${x},${y}`
    })

    return points.join(' ')
  }, [trend.trendData])

  return (
    <div
      style={{
        backgroundColor: '#2C2418',
        padding: '64px 48px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '48px',
        alignItems: 'flex-start',
      }}
    >
      <div>
        <div
          style={{
            display: 'inline-block',
            backgroundColor: '#F4DCE4',
            color: '#B03A5B',
            padding: '4px 8px',
            borderRadius: '2px',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '8px',
            fontWeight: 200,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginBottom: '16px',
          }}
        >
          {trend.velocity}
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '72px',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#F0EBE3',
            lineHeight: 1,
            margin: 0,
            marginBottom: '16px',
          }}
        >
          {trend.editorialName}
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '14px',
            fontWeight: 300,
            color: '#8C7B6E',
            margin: 0,
            marginBottom: '24px',
          }}
        >
          {trend.oneLiner}
        </p>

        <div
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '10px',
            fontWeight: 200,
            color: '#C4B4A6',
          }}
        >
          Hottest in {trend.topMarkets.slice(0, 2).map((m) => m.market).join(', ')}
        </div>
      </div>

      {/* Sparkline */}
      {sparklinePoints && (
        <svg width="200" height="60" style={{ marginTop: '16px' }}>
          <polyline
            points={sparklinePoints}
            fill="none"
            stroke="#B03A5B"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  )
}
