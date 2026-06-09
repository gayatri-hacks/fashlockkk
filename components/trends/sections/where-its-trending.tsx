'use client'

import { useEffect, useState } from 'react'
import { TrendData } from '@/app/trends/page'

interface WhereItsTrendingProps {
  trend: TrendData
}

interface MarketData {
  market: string
  code: string
  value: number
}

export default function WhereItsTrending({ trend }: WhereItsTrendingProps) {
  const [markets, setMarkets] = useState<MarketData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadMarketData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/trends/market-data?keyword=${encodeURIComponent(trend.keyword)}`)
        if (res.ok) {
          const data = await res.json()
          setMarkets(data.markets || [])
        }
      } catch (error) {
        console.error('Failed to load market data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadMarketData()
  }, [trend.keyword])

  const maxValue = Math.max(...markets.map((m) => m.value), 1)

  const SkeletonBar = () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
      }}
    >
      <div style={{ width: '80px', height: '16px', backgroundColor: '#E8E0D4', animation: 'pulse 2s infinite' }} />
      <div style={{ flex: 1, height: '6px', backgroundColor: '#E8E0D4', animation: 'pulse 2s infinite' }} />
    </div>
  )

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
          THE DATA
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
          Where in the world
        </h2>
      </div>

      <div style={{ maxWidth: '600px' }}>
        {loading
          ? Array(12)
              .fill(0)
              .map((_, i) => <SkeletonBar key={i} />)
          : markets.map((market, index) => (
              <div
                key={market.code}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  marginBottom: '24px',
                  animation: `slideIn 0.8s ease forwards`,
                  animationDelay: `${index * 100}ms`,
                  opacity: 0,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '11px',
                    fontWeight: 300,
                    color: '#2C2418',
                    width: '80px',
                  }}
                >
                  {market.market}
                </div>

                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      flex: 1,
                      height: '6px',
                      backgroundColor: '#E8E0D4',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        backgroundColor: '#B03A5B',
                        borderRadius: '3px',
                        width: `${(market.value / maxValue) * 100}%`,
                        animation: `fillWidth 0.8s ease forwards`,
                        animationDelay: `${index * 100 + 200}ms`,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '9px',
                      fontWeight: 200,
                      color: '#C4B4A6',
                      width: '30px',
                      textAlign: 'right',
                    }}
                  >
                    {market.value}
                  </div>
                </div>
              </div>
            ))}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fillWidth {
          from {
            width: 0;
          }
          to {
            width: var(--width, 100%);
          }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
