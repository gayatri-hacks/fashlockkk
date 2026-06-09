'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const BODY_TYPES = [
  { id: 'hourglass', label: 'Hourglass', desc: 'Balanced curves, defined waist', emoji: '⌛' },
  { id: 'pear', label: 'Pear', desc: 'Wider hips, narrower shoulders', emoji: '🍐' },
  { id: 'apple', label: 'Apple', desc: 'Fuller midsection, great shoulders', emoji: '🍎' },
  { id: 'rectangle', label: 'Rectangle', desc: 'Athletic, similar width throughout', emoji: '▬' },
  { id: 'inverted-triangle', label: 'Inverted Triangle', desc: 'Broader shoulders, narrow hips', emoji: '🔺' },
]
const VIBES = [
  { id: 'minimal', label: 'Minimal', emoji: '🤍', keywords: 'linen, checks' },
  { id: 'streetwear', label: 'Streetwear', emoji: '🔥', keywords: 'cargo, baggy' },
  { id: 'cottagecore', label: 'Cottagecore', emoji: '🌸', keywords: 'floral, embroidered' },
  { id: 'y2k', label: 'Y2K', emoji: '⚡', keywords: 'flared, cropped' },
  { id: 'quiet-luxury', label: 'Quiet Luxury', emoji: '💎', keywords: 'pleated, chinos' },
  { id: 'indo-fusion', label: 'Indo Fusion', emoji: '🪔', keywords: 'embroidered, floral' },
  { id: 'coastal', label: 'Coastal', emoji: '🌊', keywords: 'linen, seersucker' },
  { id: 'quirky', label: 'Quirky', emoji: '🎨', keywords: 'graphic, checks' },
]
const BUDGETS = ['Under ₹500', '₹500–2000', '₹2000–5000', 'No limit 💸']

export default function StyleQuizPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [bodyType, setBodyType] = useState('')
  const [selectedVibes, setSelectedVibes] = useState<string[]>([])
  const [budget, setBudget] = useState('')

  const toggleVibe = (id: string) => {
    setSelectedVibes(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : prev.length < 3 ? [...prev, id] : prev
    )
  }

  const handleFinish = () => {
    localStorage.setItem('fashniq_style', JSON.stringify({ bodyType, vibes: selectedVibes, budget }))
    router.push('/discover')
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className="h-2 flex-1 rounded-full transition-all"
            style={{ background: step >= s ? '#FF6B35' : '#e5e7eb' }} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h1 className="text-3xl font-black mb-2">What's your body type?</h1>
          <p className="text-gray-500 mb-6">We'll suggest styles that flatter you</p>
          <div className="space-y-3">
            {BODY_TYPES.map(bt => (
              <button key={bt.id} onClick={() => setBodyType(bt.id)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition text-left"
                style={{ borderColor: bodyType === bt.id ? '#FF6B35' : '#e5e7eb', background: bodyType === bt.id ? '#FFF8F0' : 'white' }}>
                <span className="text-3xl">{bt.emoji}</span>
                <div>
                  <p className="font-bold">{bt.label}</p>
                  <p className="text-sm text-gray-500">{bt.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} disabled={!bodyType}
            className="w-full mt-6 py-4 rounded-2xl text-white font-semibold disabled:opacity-40"
            style={{ background: '#FF6B35' }}>
            Continue →
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1 className="text-3xl font-black mb-2">Pick your vibe</h1>
          <p className="text-gray-500 mb-6">Choose up to 3</p>
          <div className="grid grid-cols-2 gap-3">
            {VIBES.map(v => (
              <button key={v.id} onClick={() => toggleVibe(v.id)}
                className="p-4 rounded-2xl border-2 transition text-left"
                style={{ borderColor: selectedVibes.includes(v.id) ? '#FF6B35' : '#e5e7eb', background: selectedVibes.includes(v.id) ? '#FFF8F0' : 'white' }}>
                <p className="text-2xl mb-1">{v.emoji}</p>
                <p className="font-bold text-sm">{v.label}</p>
                <p className="text-xs text-gray-400">{v.keywords}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(1)} className="flex-1 py-4 rounded-2xl border border-gray-200 font-semibold text-gray-600">← Back</button>
            <button onClick={() => setStep(3)} disabled={selectedVibes.length === 0}
              className="flex-1 py-4 rounded-2xl text-white font-semibold disabled:opacity-40"
              style={{ background: '#FF6B35' }}>Continue →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h1 className="text-3xl font-black mb-2">Your budget per outfit?</h1>
          <p className="text-gray-500 mb-6">We'll filter products accordingly</p>
          <div className="space-y-3">
            {BUDGETS.map(b => (
              <button key={b} onClick={() => setBudget(b)}
                className="w-full py-4 rounded-2xl border-2 font-medium transition"
                style={{ borderColor: budget === b ? '#FF6B35' : '#e5e7eb', background: budget === b ? '#FF6B35' : 'white', color: budget === b ? 'white' : '#374151' }}>
                {b}
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(2)} className="flex-1 py-4 rounded-2xl border border-gray-200 font-semibold text-gray-600">← Back</button>
            <button onClick={handleFinish} disabled={!budget}
              className="flex-1 py-4 rounded-2xl text-white font-semibold disabled:opacity-40"
              style={{ background: '#FF6B35' }}>See my picks ✨</button>
          </div>
        </div>
      )}
    </div>
  )
}