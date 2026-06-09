'use client'

import { useEffect, useState } from 'react'
import { TrendData } from '@/app/trends/page'

interface OutfitInspirationProps {
  trend: TrendData
}

export default function OutfitInspiration({ trend }: OutfitInspirationProps) {
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadImages = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/trends/outfit-images-pexels?keyword=${encodeURIComponent(trend.keyword)}`)
        if (res.ok) {
          const data = await res.json()
          setImages(data.images || [])
        }
      } catch (error) {
        console.error('Failed to load outfit images:', error)
      } finally {
        setLoading(false)
      }
    }

    loadImages()
  }, [trend.keyword])

  // Add pulse animation to document
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  const SkeletonImage = () => (
    <div
      style={{
        backgroundColor: '#E8E0D4',
        aspectRatio: '1',
        borderRadius: '2px',
        animation: 'pulse 2s infinite',
      }}
    />
  )

  return (
    <div style={{ padding: '64px 48px', backgroundColor: '#FAF7F4' }}>
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
          HOW IT'S BEING WORN
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
          The looks
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {loading
          ? Array(9)
              .fill(0)
              .map((_, i) => <SkeletonImage key={i} />)
          : images.length > 0
            ? images.map((image, i) => (
                <div key={i} style={{ aspectRatio: '1', borderRadius: '2px', overflow: 'hidden' }}>
                  <img
                    src={image}
                    alt={`${trend.editorialName} outfit ${i + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 0.3s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.03)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                  />
                </div>
              ))
            : Array(9)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: '#E8E0D4',
                      aspectRatio: '1',
                      borderRadius: '2px',
                    }}
                  />
                ))}
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
