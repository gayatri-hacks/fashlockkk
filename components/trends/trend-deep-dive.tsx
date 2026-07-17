'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { TrendData } from '@/app/trends/page'

interface TrendDeepDiveProps {
  trend: TrendData
  onBack: () => void
}

type MarketData = {
  market: string
  code: string
  value: number
}

type GenderEdit = 'women' | 'men'

type StyleFormula = {
  occasion: string
  formula: string
  why: string
}

type StyleModeData = {
  welcome: string
  formulas: Record<GenderEdit, StyleFormula[]>
  avoidThis: string
  starterSearchTerm: string
}

type OutfitImageResult = {
  imageUrl: string | null
  source?: string
  status?: string
}

type OutfitImageState = Record<GenderEdit, Record<string, OutfitImageResult | undefined>>
type OutfitImageLoadingState = Record<GenderEdit, Record<string, boolean>>

const STYLE_RETAILERS = [
  { name: 'MYNTRA', url: (term: string) => `https://www.myntra.com/${term.trim().toLowerCase().replace(/\s+/g, '-')}` },
  { name: 'ZARA', url: (term: string) => `https://www.zara.com/in/en/search?searchTerm=${encodeURIComponent(term)}` },
  { name: 'H&M', url: (term: string) => `https://www2.hm.com/en_in/search-results.html?q=${encodeURIComponent(term)}` },
  { name: 'ASOS', url: (term: string) => `https://www.asos.com/search/?q=${encodeURIComponent(term)}` },
  { name: 'AJIO', url: (term: string) => `https://www.ajio.com/search/?query=${encodeURIComponent(term)}` },
]

function getVelocityColors(velocity: TrendData['velocity']) {
  if (velocity === 'RISING') return { background: '#F4DCE4', color: '#B03A5B' }
  if (velocity === 'FADING') return { background: '#E8E0D4', color: '#8C7B6E' }
  return { background: '#EFE6DC', color: '#8C7B6E' }
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-dm-sans)',
        fontSize: '8px',
        fontWeight: 200,
        letterSpacing: '5px',
        color: '#B03A5B',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: 'var(--font-cormorant)',
        fontSize: '36px',
        fontWeight: 300,
        fontStyle: 'italic',
        color: '#2C2418',
        margin: '8px 0 0',
      }}
    >
      {children}
    </h2>
  )
}

function outfitImageKey(formula: StyleFormula, gender: GenderEdit) {
  return `${gender}:${formula.occasion}:${formula.formula}`
}

function audienceForGender(gender: GenderEdit) {
  return gender === 'men' ? 'him' : 'her'
}

export default function TrendDeepDive({ trend, onBack }: TrendDeepDiveProps) {
  const [genderEdit, setGenderEdit] = useState<GenderEdit>('women')
  const [styleData, setStyleData] = useState<StyleModeData | null>(null)
  const [styleLoading, setStyleLoading] = useState(true)
  const [outfitImages, setOutfitImages] = useState<OutfitImageState>({ women: {}, men: {} })
  const [outfitImageLoading, setOutfitImageLoading] = useState<OutfitImageLoadingState>({ women: {}, men: {} })
  const [markets, setMarkets] = useState<MarketData[]>(trend.topMarkets.map((market) => ({ ...market, value: 70 })))
  const velocityColors = getVelocityColors(trend.velocity)
  const marketRows = markets.length ? markets : trend.topMarkets.map((market) => ({ ...market, value: 65 }))
  const trendingMarkets = marketRows.filter((market) => market.value > 0).length || trend.topMarkets.length || 0
  const formulas = styleData?.formulas?.[genderEdit] || []
  const starterTerm = styleData?.starterSearchTerm || trend.shopSearchTerms[0] || trend.keyword

  const loadOutfitImages = async (nextFormulas: StyleFormula[], gender: GenderEdit) => {
    const missing = nextFormulas
      .slice(0, 3)
      .filter((formula) => {
        const key = outfitImageKey(formula, gender)
        return outfitImages[gender][key] === undefined && !outfitImageLoading[gender][key]
      })

    if (!missing.length) return

    setOutfitImageLoading((current) => ({
      ...current,
      [gender]: {
        ...current[gender],
        ...Object.fromEntries(missing.map((formula) => [outfitImageKey(formula, gender), true])),
      },
    }))

    await Promise.all(
      missing.map(async (formula) => {
        const key = outfitImageKey(formula, gender)

        try {
          const response = await fetch('/api/trends/generate-outfit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trendKeyword: trend.keyword,
              trendId: trend.id,
              keyword: trend.keyword,
              context: 'trend-detail',
              audience: audienceForGender(gender),
              formula: formula.formula,
              occasion: formula.occasion,
              outfitTitle: `${trend.editorialName} ${formula.occasion}`,
              gender,
            }),
          })
          const data = response.ok ? await response.json() : { imageUrl: null }

          setOutfitImages((current) => ({
            ...current,
            [gender]: {
              ...current[gender],
              [key]: {
                imageUrl: data.imageUrl || null,
                source: data.imageSource || 'fallback',
                status: data.status || 'fallback',
              },
            },
          }))
        } catch (error) {
          console.error('Failed to load generated outfit image:', error)
          setOutfitImages((current) => ({
            ...current,
            [gender]: {
              ...current[gender],
              [key]: {
                imageUrl: null,
                source: 'fallback',
                status: 'fallback',
              },
            },
          }))
        } finally {
          setOutfitImageLoading((current) => ({
            ...current,
            [gender]: {
              ...current[gender],
              [key]: false,
            },
          }))
        }
      })
    )
  }

  useEffect(() => {
    setGenderEdit('women')
    setStyleData(null)
    setStyleLoading(true)
    setOutfitImages({ women: {}, men: {} })
    setOutfitImageLoading({ women: {}, men: {} })
  }, [trend])

  useEffect(() => {
    const loadStyleData = async () => {
      try {
        setStyleLoading(true)
        const params = new URLSearchParams({
          keyword: trend.keyword,
          editorialName: trend.editorialName,
        })
        const response = await fetch(`/api/trends/style?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          setStyleData(data)
        }
      } catch (error) {
        console.error('Failed to load style mode:', error)
      } finally {
        setStyleLoading(false)
      }
    }

    loadStyleData()
  }, [trend.keyword, trend.editorialName])

  useEffect(() => {
    const loadMarkets = async () => {
      try {
        const response = await fetch(`/api/trends/market-data?keyword=${encodeURIComponent(trend.keyword)}`)
        if (response.ok) {
          const data = await response.json()
          if (data.markets?.length) setMarkets(data.markets)
        }
      } catch (error) {
        console.error('Failed to load market data:', error)
      }
    }

    loadMarkets()
  }, [trend.keyword])

  useEffect(() => {
    if (styleData?.formulas?.women?.length) {
      loadOutfitImages(styleData.formulas.women, 'women')
    }
    if (styleData?.formulas?.men?.length) {
      loadOutfitImages(styleData.formulas.men, 'men')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleData?.formulas?.women, styleData?.formulas?.men])

  useEffect(() => {
    if (genderEdit === 'men' && styleData?.formulas?.men?.length) {
      loadOutfitImages(styleData.formulas.men, 'men')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderEdit, styleData?.formulas?.men])

  return (
    <div style={{ backgroundColor: '#FAF7F4', minHeight: '100vh' }}>
      <style>{`
        .style-formula-grid { grid-template-columns: repeat(3, 1fr); }
        .style-retailer-link:hover {
          background: #F4DCE4 !important;
          border-color: #B03A5B !important;
          color: #B03A5B !important;
        }
        @keyframes stylePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.48; }
        }
        @media (max-width: 900px) {
          .style-section { padding-left: 24px !important; padding-right: 24px !important; }
          .style-title { font-size: 52px !important; }
          .style-formula-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ backgroundColor: '#FAF7F4', padding: '18px 48px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '11px',
            fontWeight: 300,
            color: '#B03A5B',
            padding: 0,
          }}
        >
          ← All trends
        </button>
      </div>

      <section className="style-section" style={{ backgroundColor: '#FAF7F4', padding: '64px 48px' }}>
        <div
          style={{
            display: 'inline-block',
            backgroundColor: velocityColors.background,
            color: velocityColors.color,
            padding: '5px 10px',
            borderRadius: '999px',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '8px',
            fontWeight: 200,
            letterSpacing: '3px',
            textTransform: 'uppercase',
          }}
        >
          {trend.velocity}
        </div>
        <h1
          className="style-title"
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '72px',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#2C2418',
            lineHeight: 1,
            margin: '16px 0 0',
          }}
        >
          {trend.editorialName}
        </h1>
        {styleLoading && !styleData ? (
          <div style={{ width: 'min(640px, 100%)', height: '144px', backgroundColor: '#E8E0D4', borderRadius: '2px', marginTop: '28px', animation: 'stylePulse 1.6s infinite' }} />
        ) : (
          <p
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: '22px',
              fontWeight: 300,
              fontStyle: 'italic',
              color: '#2C2418',
              lineHeight: 1.8,
              maxWidth: '640px',
              margin: '28px 0 0',
            }}
          >
            {styleData?.welcome}
          </p>
        )}
        <div
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '9px',
            fontWeight: 200,
            color: '#C4B4A6',
            letterSpacing: '2px',
            marginTop: '24px',
            textTransform: 'uppercase',
          }}
        >
          TRENDING IN {Math.min(trendingMarkets, 12)} OF 12 MARKETS
        </div>
      </section>

      <section className="style-section" style={{ backgroundColor: '#F0EBE3', padding: '56px 48px' }}>
        <SectionLabel>YOUR EDIT</SectionLabel>
        <SectionTitle>Can you wear it?</SectionTitle>
        <div style={{ display: 'flex', gap: '22px', marginTop: '22px' }}>
          {[
            { label: 'HER EDIT', value: 'women' as GenderEdit },
            { label: 'HIS EDIT', value: 'men' as GenderEdit },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setGenderEdit(tab.value)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: genderEdit === tab.value ? '1px solid #B03A5B' : '1px solid transparent',
                color: genderEdit === tab.value ? '#B03A5B' : '#C4B4A6',
                cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '9px',
                fontWeight: 200,
                letterSpacing: '4px',
                padding: '0 0 6px',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {styleLoading && !formulas.length ? (
          <div className="style-formula-grid" style={{ display: 'grid', gap: '20px', marginTop: '28px' }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} style={{ height: '668px', backgroundColor: '#E8E0D4', borderRadius: '2px', animation: 'stylePulse 1.6s infinite' }} />
            ))}
          </div>
        ) : (
          <div className="style-formula-grid" style={{ display: 'grid', gap: '20px', marginTop: '28px' }}>
            {formulas.map((formula, index) => {
              const key = outfitImageKey(formula, genderEdit)
              const imageResult = outfitImages[genderEdit][key]
              const imageUrl = imageResult?.imageUrl
              const isImageLoading = outfitImageLoading[genderEdit][key] || imageResult === undefined
              const imageRejected = imageUrl === null && !isImageLoading
              const sourceLabel =
                imageResult?.source === 'ollama' || imageResult?.source === 'gemini'
                  ? 'Generated for this outfit'
                  : imageResult?.source
                    ? imageResult.source.replace('_', ' ')
                    : ''
              const preparingLabel = genderEdit === 'men' ? 'Preparing his edit' : 'Preparing her edit'

              return (
                <div key={`${formula.occasion}-${index}`} style={{ borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '480px', overflow: 'hidden', borderRadius: '2px 2px 0 0', backgroundColor: '#F3EEE7', position: 'relative' }}>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`${formula.occasion} ${genderEdit} outfit`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center center',
                          opacity: 1,
                          transition: 'opacity 0.4s ease',
                        }}
                      />
                    ) : imageRejected ? (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#EFE8DE',
                          color: '#C4B4A6',
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '8px',
                          fontWeight: 200,
                          letterSpacing: '3px',
                          textTransform: 'uppercase',
                        }}
                      >
                        Image fallback unavailable
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: '100%', backgroundColor: '#E8E0D4', animation: 'stylePulse 1.6s infinite' }} />
                    )}

                    {(isImageLoading || sourceLabel) && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '12px',
                          top: '12px',
                          backgroundColor: 'rgba(250,247,244,0.9)',
                          color: '#8C6030',
                          padding: '5px 8px',
                          borderRadius: '2px',
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '8px',
                          fontWeight: 300,
                          letterSpacing: '2px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {isImageLoading ? preparingLabel : sourceLabel}
                      </div>
                    )}

                    {isImageLoading && !imageUrl && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            alignItems: 'center',
                            color: '#8C7B6E',
                            display: 'flex',
                            fontFamily: 'var(--font-dm-sans)',
                            fontSize: '10px',
                            fontWeight: 300,
                            justifyContent: 'center',
                            letterSpacing: '3px',
                            textTransform: 'uppercase',
                          }}
                        >
                          {preparingLabel}
                        </div>
                      )}
                  </div>

                  <div style={{ backgroundColor: '#FAF7F4', padding: '20px 24px' }}>
                    <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '8px', fontWeight: 200, color: '#B03A5B', letterSpacing: '3px', textTransform: 'uppercase' }}>
                      {formula.occasion}
                    </div>
                    <div style={{ fontFamily: 'var(--font-cormorant)', fontSize: '20px', fontWeight: 300, fontStyle: 'italic', color: '#2C2418', lineHeight: 1.6, marginTop: '12px' }}>
                      {formula.formula}
                    </div>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '11px', fontWeight: 300, color: '#8C7B6E', margin: '8px 0 0', lineHeight: 1.7 }}>
                      {formula.why}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="style-section" style={{ backgroundColor: '#FAF7F4', padding: '32px 48px', borderTop: '0.5px solid #E8E0D4' }}>
        <SectionLabel>COMMON MISTAKE</SectionLabel>
        {styleLoading && !styleData ? (
          <div style={{ width: 'min(600px, 100%)', height: '68px', backgroundColor: '#E8E0D4', borderRadius: '2px', marginTop: '18px', animation: 'stylePulse 1.6s infinite' }} />
        ) : (
          <p style={{ fontFamily: 'var(--font-cormorant)', fontSize: '20px', fontWeight: 300, fontStyle: 'italic', color: '#2C2418', maxWidth: '600px', margin: '18px 0 0', lineHeight: 1.7 }}>
            {styleData?.avoidThis}
          </p>
        )}
      </section>

      <section className="style-section" style={{ backgroundColor: '#F0EBE3', padding: '56px 48px' }}>
        <SectionLabel>WHERE TO FIND IT</SectionLabel>
        <SectionTitle>Shop softly</SectionTitle>
        {styleLoading && !styleData ? (
          <div style={{ width: '360px', maxWidth: '100%', height: '28px', backgroundColor: '#E8E0D4', borderRadius: '2px', marginTop: '24px', animation: 'stylePulse 1.6s infinite' }} />
        ) : (
          <div style={{ fontFamily: 'var(--font-cormorant)', fontSize: '18px', fontWeight: 300, fontStyle: 'italic', color: '#2C2418', marginTop: '24px', marginBottom: '24px' }}>
            Start with searching: '{starterTerm}'
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {STYLE_RETAILERS.map((retailer) => (
            <a
              className="style-retailer-link"
              key={retailer.name}
              href={retailer.url(starterTerm)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                backgroundColor: '#FAF7F4',
                border: '0.5px solid #D4C8BC',
                borderRadius: '20px',
                padding: '10px 24px',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '12px',
                fontWeight: 300,
                color: '#2C2418',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {retailer.name}
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
