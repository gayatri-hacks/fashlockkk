'use client'

import { TrendData } from '@/app/trends/page'

interface HowToWearItProps {
  trend: TrendData
}

export default function HowToWearIt({ trend }: HowToWearItProps) {
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
          STYLE DIRECTIONS
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
          How to wear it
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {trend.howToWear.map((direction, index) => (
          <div
            key={index}
            style={{
              backgroundColor: '#F0EBE3',
              padding: '24px',
              borderRadius: '2px',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '24px',
                right: '24px',
                fontFamily: 'var(--font-cormorant)',
                fontSize: '48px',
                fontWeight: 200,
                color: '#E8E0D4',
              }}
            >
              {index + 1}
            </div>

            <div
              style={{
                fontFamily: 'var(--font-cormorant)',
                fontSize: '20px',
                fontWeight: 400,
                fontStyle: 'italic',
                color: '#2C2418',
                lineHeight: '1.5',
                paddingRight: '32px',
              }}
            >
              {direction}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
