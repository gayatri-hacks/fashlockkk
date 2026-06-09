'use client'

import { TrendData } from '@/app/trends/page'

interface RetailerLink {
  retailer: string
  searchTerm: string
  url: string
}

interface ShopTheLookProps {
  trend: TrendData
}

const RETAILERS = [
  {
    name: 'ZARA',
    baseUrl: 'https://www.zara.com/in/en/search?searchTerm=',
  },
  {
    name: 'ASOS',
    baseUrl: 'https://www.asos.com/search/?q=',
  },
  {
    name: 'H&M',
    baseUrl: 'https://www2.hm.com/en_in/search-results.html?q=',
  },
  {
    name: 'Myntra',
    baseUrl: 'https://www.myntra.com/',
  },
  {
    name: 'SSENSE',
    baseUrl: 'https://www.ssense.com/en-in/search?q=',
  },
]

export default function ShopTheLook({ trend }: ShopTheLookProps) {
  const getRetailerLinks = (): RetailerLink[] => {
    const links: RetailerLink[] = []

    const topTerms = trend.shopSearchTerms.slice(0, 2)

    topTerms.forEach((term) => {
      RETAILERS.forEach((retailer) => {
        const url = retailer.baseUrl + encodeURIComponent(term)
        links.push({
          retailer: retailer.name,
          searchTerm: term,
          url,
        })
      })
    })

    return links
  }

  const links = getRetailerLinks()

  return (
    <div style={{ padding: '64px 48px', backgroundColor: '#FAF7F4' }}>
      <div style={{ marginBottom: '16px' }}>
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
          SHOP IT
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
          Find this trend
        </h2>
      </div>

      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '11px',
          fontWeight: 300,
          color: '#8C7B6E',
          marginBottom: '32px',
        }}
      >
        We'll point you in the right direction — you bring the eye.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {links.map((link, index) => (
          <a
            key={index}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div
              style={{
                backgroundColor: '#F0EBE3',
                padding: '20px 24px',
                borderRadius: '2px',
                border: '0.5px solid #D4C8BC',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#B03A5B'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#D4C8BC'
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '12px',
                    fontWeight: 300,
                    color: '#2C2418',
                    letterSpacing: '1px',
                  }}
                >
                  {link.retailer}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '10px',
                    fontWeight: 200,
                    color: '#8C7B6E',
                    fontStyle: 'italic',
                    marginTop: '4px',
                  }}
                >
                  {link.searchTerm}
                </div>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '11px',
                  fontWeight: 300,
                  color: '#B03A5B',
                }}
              >
                Shop →
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
