'use client'

import { useEffect, useState } from 'react'
import { TrendData } from '@/app/trends/page'
import TrendsHero from './sections/trends-hero'
import TrendingNow from './sections/trending-now'
import TheCycle from './sections/the-cycle'

interface TrendsOverviewProps {
  initialSearchQuery?: string
  onTrendClick: (trend: TrendData) => void
  onTrendSearch: (query: string) => void
}

type PersonalizedTrendNote = {
  id: number
  keyword: string
  editorialName: string
  note: string
}

function trendAnchorId(id: number) {
  return `trend-card-${id}`
}

function TrendingForYou({ notes }: { notes: PersonalizedTrendNote[] }) {
  if (!notes.length) return null

  const scrollToTrend = (id: number) => {
    document.getElementById(trendAnchorId(id))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <section
      style={{
        backgroundColor: '#FAF7F4',
        borderBottom: '0.5px solid #E8E0D4',
        padding: '54px 48px 30px',
      }}
    >
      <div style={{ marginBottom: '22px' }}>
        <div
          style={{
            color: '#B03A5B',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '8px',
            fontWeight: 200,
            letterSpacing: '5px',
            textTransform: 'uppercase',
          }}
        >
          TRENDING FOR YOU
        </div>
        <h2
          style={{
            color: '#2C2418',
            fontFamily: 'var(--font-cormorant)',
            fontSize: '42px',
            fontStyle: 'italic',
            fontWeight: 300,
            lineHeight: 1,
            margin: '10px 0 0',
            maxWidth: '680px',
          }}
        >
          What's rising right now — edited for your look.
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '14px',
          overflowX: 'auto',
          paddingBottom: '8px',
        }}
      >
        {notes.slice(0, 5).map((item) => (
          <article
            key={`${item.id}-${item.editorialName}`}
            style={{
              backgroundColor: '#F0EBE3',
              border: '0.5px solid #DED3C8',
              borderRadius: '8px',
              flex: '0 0 260px',
              padding: '18px',
            }}
          >
            <h3
              style={{
                color: '#2C2418',
                fontFamily: 'var(--font-cormorant)',
                fontSize: '24px',
                fontStyle: 'italic',
                fontWeight: 300,
                lineHeight: 1.05,
                margin: 0,
              }}
            >
              {item.editorialName}
            </h3>
            <p
              style={{
                color: '#8C7B6E',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '12px',
                fontWeight: 300,
                lineHeight: 1.55,
                margin: '12px 0 18px',
              }}
            >
              {item.note}
            </p>
            <button
              onClick={() => scrollToTrend(item.id)}
              style={{
                background: 'transparent',
                border: 0,
                color: '#B03A5B',
                cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '11px',
                fontWeight: 300,
                padding: 0,
              }}
              type="button"
            >
              See outfits →
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function TrendsOverview({ initialSearchQuery = '', onTrendClick, onTrendSearch }: TrendsOverviewProps) {
  const [trendingTrends, setTrendingTrends] = useState<TrendData[]>([])
  const [cycleTrends, setCycleTrends] = useState<TrendData[]>([])
  const [trendingForYou, setTrendingForYou] = useState<PersonalizedTrendNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTrends = async () => {
      try {
        setLoading(true)
        const sessionId = window.localStorage.getItem('fashlock_session_id')
        const url = sessionId ? `/api/trends/overview-data?sessionId=${encodeURIComponent(sessionId)}` : '/api/trends/overview-data'
        const res = await fetch(url, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setTrendingTrends(data.trendingTrends || [])
          setCycleTrends(data.cycleTrends || [])
          setTrendingForYou(Array.isArray(data.trendingForYou) ? data.trendingForYou : [])
        }
      } catch (error) {
        console.error('Failed to load trends:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTrends()
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF7F4' }}>
      <TrendingForYou notes={trendingForYou} />
      <TrendsHero initialQuery={initialSearchQuery} onTrendSearch={onTrendSearch} />
      <TrendingNow trends={trendingTrends} loading={loading} onTrendClick={onTrendClick} />
      <TheCycle trends={cycleTrends} loading={loading} onTrendClick={onTrendClick} />
    </div>
  )
}
