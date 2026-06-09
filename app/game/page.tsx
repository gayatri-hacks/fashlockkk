'use client'

import { useEffect, useState } from 'react'

const LEADERBOARD = [
  { name: 'stylegeek_ria', score: 340, badge: 'Trend Oracle 🔮' },
  { name: 'fashionfwd', score: 280, badge: 'Style Sage 🌟' },
  { name: 'trendwatch', score: 210, badge: 'Style Sage 🌟' },
  { name: 'outfitdiary', score: 150, badge: 'Fashion Rookie ✨' },
]

export default function GamePage() {
  const [keywords, setKeywords] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [locked, setLocked] = useState(false)
  const [predictions, setPredictions] = useState<any[]>([])
  const [userScore, setUserScore] = useState(0)

  useEffect(() => {
    fetch('/api/game-keywords').then(r => r.json()).then(data => {
      const all = (data.keywords || [])
      const shuffled = all.sort(() => Math.random() - 0.5).slice(0, 3)
      setKeywords(shuffled)
    })

    const saved = JSON.parse(localStorage.getItem('fashniq_predictions') || '[]')
    setPredictions(saved)
    setUserScore(saved.filter((p: any) => p.correct).length * 10)

    const thisWeek = saved.find((p: any) => {
      const d = new Date(p.date)
      const now = new Date()
      return d.getFullYear() === now.getFullYear() &&
        Math.floor((now.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000)) === 0
    })
    if (thisWeek) { setSelected(thisWeek.keyword); setLocked(true) }
  }, [])

  const handleLock = () => {
    if (!selected || locked) return
    const newPrediction = { keyword: selected, date: new Date().toISOString(), correct: Math.random() > 0.5 }
    const updated = [...predictions, newPrediction]
    localStorage.setItem('fashniq_predictions', JSON.stringify(updated))
    setPredictions(updated)
    setLocked(true)
  }

  const handleShare = () => {
    const text = `I'm predicting "${selected}" will trend in Indian fashion in 4 weeks 👀 Let's see if I'm right! #FashniqOracle`
    if (navigator.share) navigator.share({ text })
    else navigator.clipboard.writeText(text)
  }

  const badge = userScore >= 100 ? 'Trend Oracle 🔮' : userScore >= 50 ? 'Style Sage 🌟' : 'Fashion Rookie ✨'

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-3xl font-black mb-1">Trend Oracle 🔮</h1>
      <p className="text-gray-500 mb-6">Predict what's Rising in 4 weeks</p>

      <div className="rounded-3xl p-6 mb-6 text-white text-center"
        style={{ background: 'linear-gradient(135deg, #FF6B35, #FFD166)' }}>
        <p className="text-5xl font-black">{userScore}</p>
        <p className="text-sm opacity-80 mt-1">points</p>
        <p className="font-semibold mt-2">{badge}</p>
      </div>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Top Predictors</p>
        <div className="space-y-2">
          {[...LEADERBOARD, { name: 'you', score: userScore, badge }]
            .sort((a, b) => b.score - a.score)
            .map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-2xl"
                style={{ background: p.name === 'you' ? '#FFF8F0' : 'white', border: p.name === 'you' ? '2px solid #FF6B35' : '1px solid #e5e7eb' }}>
                <p className="font-black text-gray-400 w-5">#{i + 1}</p>
                <p className="flex-1 font-medium">{p.name}</p>
                <p className="text-sm text-gray-500">{p.badge}</p>
                <p className="font-bold" style={{ color: '#FF6B35' }}>{p.score}pts</p>
              </div>
            ))}
        </div>
      </div>

      <div className="rounded-3xl border-2 p-5 mb-6" style={{ borderColor: '#FF6B35' }}>
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#FF6B35' }}>This Week's Challenge</p>
        <p className="font-bold text-lg mb-4">Which will be 🔥 Rising in 4 weeks?</p>
        <div className="space-y-2 mb-4">
          {keywords.map(kw => (
            <button key={kw} onClick={() => !locked && setSelected(kw)}
              className="w-full py-3 rounded-2xl border-2 font-medium transition capitalize"
              style={{
                borderColor: selected === kw ? '#FF6B35' : '#e5e7eb',
                background: selected === kw ? '#FFF8F0' : 'white',
                color: selected === kw ? '#FF6B35' : '#374151'
              }}>
              {kw}
            </button>
          ))}
        </div>
        <button onClick={handleLock} disabled={!selected || locked}
          className="w-full py-3 rounded-2xl text-white font-semibold disabled:opacity-40"
          style={{ background: '#FF6B35' }}>
          {locked ? '🔒 Prediction Locked!' : 'Lock In My Prediction 🔒'}
        </button>
      </div>

      {locked && (
        <button onClick={handleShare}
          className="w-full py-3 rounded-2xl border border-gray-200 font-medium text-gray-600 mb-6">
          Share my prediction 👀
        </button>
      )}

      {predictions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Your Past Predictions</p>
          <div className="space-y-2">
            {predictions.slice().reverse().map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-gray-100">
                <p className="text-xl">{p.correct ? '✅' : '⏳'}</p>
                <div className="flex-1">
                  <p className="font-medium capitalize">{p.keyword}</p>
                  <p className="text-xs text-gray-400">{new Date(p.date).toLocaleDateString()}</p>
                </div>
                {p.correct && <p className="text-sm font-bold text-green-600">+10pts</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
