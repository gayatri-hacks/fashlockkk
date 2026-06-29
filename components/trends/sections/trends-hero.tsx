'use client'

import { Search } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'

interface TrendsHeroProps {
  initialQuery?: string
  onTrendSearch: (query: string) => void
}

const PLACEHOLDERS = [
  'Search ballet flats...',
  'Search quiet luxury...',
  'Search what Korea is wearing...',
  'Search linen suits...',
  'Search Y2K revival...',
  'Search cargo trousers...',
]

export default function TrendsHero({ initialQuery = '', onTrendSearch }: TrendsHeroProps) {
  const [query, setQuery] = useState(initialQuery)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PLACEHOLDERS.length)
    }, 2000)

    return () => window.clearInterval(timer)
  }, [])

  const getCurrentSeasonText = () => {
    const month = new Date().getMonth()
    if (month >= 11 || month <= 1) return "What winter is wearing."
    if (month >= 2 && month <= 4) return "What spring is wearing."
    if (month >= 5 && month <= 7) return "What summer is wearing."
    return "What autumn is wearing."
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onTrendSearch(query)
  }

  return (
    <div style={{ backgroundColor: '#F0EBE3', minHeight: '430px', position: 'relative' }} className="flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-4xl">
        <div
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 200,
            letterSpacing: '5px',
            color: '#B03A5B',
            marginBottom: '16px',
            textTransform: 'uppercase',
          }}
        >
          TRENDS
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '72px',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#2C2418',
            lineHeight: 1,
          }}
        >
          {getCurrentSeasonText()}
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '13px',
            fontWeight: 300,
            color: '#8C7B6E',
            marginTop: '12px',
          }}
        >
          The looks, the data, the inspiration — all in one place
        </p>

        <form
          onSubmit={handleSubmit}
          style={{
            width: 'min(600px, calc(100vw - 48px))',
            margin: '28px auto 0',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: '#EDE8DF',
              border: '0.5px solid #D4C8BC',
              borderRadius: '40px',
              padding: '14px 24px',
              transition: 'border-color 0.2s ease',
            }}
            onFocus={(event) => {
              event.currentTarget.style.borderColor = '#B03A5B'
            }}
            onBlur={(event) => {
              event.currentTarget.style.borderColor = '#D4C8BC'
            }}
          >
            <Search size={16} color="#B03A5B" strokeWidth={1.5} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={PLACEHOLDERS[placeholderIndex]}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '14px',
                fontWeight: 300,
                color: '#2C2418',
              }}
            />
          </label>
        </form>

        <div
          style={{
            marginTop: '12px',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '9px',
            fontWeight: 200,
            color: '#B8ADA2',
            letterSpacing: '2px',
            textAlign: 'center',
          }}
        >
          Search any trend, keyword or market
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '0.5px',
          backgroundColor: '#D4C8BC',
          marginTop: '32px',
        }}
      />
    </div>
  )
}
