'use client'

import { useEffect, useState } from 'react'
import { TrendData } from '@/app/trends/page'
import TrendsHero from './sections/trends-hero'
import TrendingNow from './sections/trending-now'
import TheCycle from './sections/the-cycle'
import AroundTheWorld from './sections/around-the-world'

interface TrendsOverviewProps {
  onTrendClick: (trend: TrendData) => void
  onTrendSearch: (query: string) => void
}

export default function TrendsOverview({ onTrendClick, onTrendSearch }: TrendsOverviewProps) {
  const [trendingTrends, setTrendingTrends] = useState<TrendData[]>([])
  const [cycleTrends, setCycleTrends] = useState<TrendData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTrends = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/trends/overview-data')
        if (res.ok) {
          const data = await res.json()
          setTrendingTrends(data.trendingTrends || [])
          setCycleTrends(data.cycleTrends || [])
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
      <TrendsHero onTrendSearch={onTrendSearch} />
      <TrendingNow trends={trendingTrends} loading={loading} onTrendClick={onTrendClick} />
      <TheCycle trends={cycleTrends} loading={loading} onTrendClick={onTrendClick} />
      <AroundTheWorld onTrendClick={onTrendClick} />
    </div>
  )
}
