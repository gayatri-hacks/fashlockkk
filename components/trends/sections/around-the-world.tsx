'use client'

import { useState } from 'react'
import Link from 'next/link'

interface City {
  code: string
  name: string
  mood: string
}

interface AroundTheWorldProps {
  // Props for future expansion
  [key: string]: any
}

export default function AroundTheWorld({}: AroundTheWorldProps) {
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadCities = async () => {
    if (loaded || loading) return
    try {
      setLoading(true)
      const res = await fetch('/api/trends/cities-mood?scope=world')
      if (res.ok) {
        const data = await res.json()
        setCities(data.cities || [])
        setLoaded(true)
      }
    } catch (error) {
      console.error('Failed to load cities:', error)
    } finally {
      setLoading(false)
    }
  }

  const SkeletonCard = () => (
    <div
      style={{
        backgroundColor: '#E8E0D4',
        height: '160px',
        borderRadius: '2px',
        animation: 'pulse 2s infinite',
      }}
    />
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
          AROUND THE WORLD
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
          What cities are wearing
        </h2>
      </div>

      {!loaded && !loading ? (
        <button
          type="button"
          onClick={loadCities}
          style={{
            background: '#2C2418',
            color: '#F0EBE3',
            border: 'none',
            borderRadius: '20px',
            padding: '10px 22px',
            cursor: 'pointer',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '9px',
            fontWeight: 200,
            letterSpacing: '4px',
            textTransform: 'uppercase',
          }}
        >
          Load Around The World
        </button>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading
          ? Array(6)
              .fill(0)
              .map((_, i) => <SkeletonCard key={i} />)
          : cities.map((city) => (
              <Link key={city.code} href={`/trends/city/${city.code}`}>
                <div
                  style={{
                    backgroundColor: '#F0EBE3',
                    borderRadius: '2px',
                    padding: '24px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    border: '0.5px solid #D4C8BC',
                    minHeight: '160px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#B03A5B'
                    e.currentTarget.style.transform = 'translateY(-4px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#D4C8BC'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div>
                    <h3
                      style={{
                        fontFamily: 'var(--font-cormorant)',
                        fontSize: '28px',
                        fontWeight: 300,
                        fontStyle: 'italic',
                        color: '#2C2418',
                        margin: 0,
                        marginBottom: '16px',
                      }}
                    >
                      {city.name}
                    </h3>
                    <p
                      style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '13px',
                        fontWeight: 300,
                        color: '#8C7B6E',
                        lineHeight: '1.6',
                        margin: 0,
                      }}
                    >
                      {city.mood}
                    </p>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '11px',
                      fontWeight: 300,
                      color: '#B03A5B',
                      marginTop: '16px',
                    }}
                  >
                    Explore trends →
                  </div>
                </div>
              </Link>
              ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
