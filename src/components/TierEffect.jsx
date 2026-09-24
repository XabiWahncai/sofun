import { useMemo, useState, useEffect } from 'react'

/* ds-allow-hardcode: particle shimmer arrays — gold/silver/bronze animation hues have no design-system token equivalent */
const SPARKLE_CONFIG = {
  golden: {
    colors: ['#FFD700', '#FCC200', '#E8BA2A', '#FFF59D', '#C9A227', '#FFE082'], /* ds-allow-hardcode */
    count: 30,
  },
  silver: {
    colors: ['#FFFFFF', '#E8E8E8', '#C0C0C0', '#A8A9AD', '#F5F5F5', '#D4D4D4'], /* ds-allow-hardcode */
    count: 28,
  },
  bronze: {
    colors: ['#CD7F32', '#E8972A', '#F0A84B', '#FFD4A0', '#B8730A', '#E5A050'], /* ds-allow-hardcode */
    count: 28,
  },
}

const rand = (min, max) => min + Math.random() * (max - min)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

function SparkleEffect({ tier }) {
  const config = SPARKLE_CONFIG[tier]

  const particles = useMemo(() => {
    if (!config) return []
    return Array.from({ length: config.count }, (_, i) => ({
      id: i,
      x: rand(1, 99),
      y: rand(2, 95),
      size: rand(9, 20),
      delay: rand(0, 6),
      duration: rand(2.5, 5.5),
      color: pick(config.colors),
      char: i % 5 === 0 ? '✧' : '✦',
      float: i < Math.floor(config.count * 0.3),
    }))
  }, [tier]) // eslint-disable-line

  return (
    <>
      {particles.map(p => (
        <span
          key={p.id}
          className={`tier-sparkle ${p.float ? 'tier-sparkle-float' : 'tier-sparkle-twinkle'}`}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            fontSize: p.size,
            color: p.color,
            animationDelay: `-${p.delay}s`,
            animationDuration: `${p.duration}s`,
            filter: `drop-shadow(0 0 ${Math.round(p.size * 0.5)}px ${p.color})`,
          }}
        >
          {p.char}
        </span>
      ))}
    </>
  )
}

function RainEffect() {
  const drops = useMemo(() => (
    Array.from({ length: 70 }, (_, i) => ({
      id: i,
      x: rand(0, 100),
      height: rand(18, 55),
      duration: rand(0.45, 0.9),
      delay: rand(0, 3),
      opacity: rand(0.25, 0.65),
      width: Math.random() > 0.7 ? 2 : 1.5,
    }))
  ), [])

  return (
    <>
      {/* Dark gloomy overlay */}
      <div className="rain-overlay" />

      {/* Rotated container so drops fall diagonally */}
      <div className="rain-container">
        {drops.map(d => (
          <span
            key={d.id}
            className="rain-drop"
            style={{
              left: `${d.x}%`,
              height: d.height,
              width: d.width,
              animationDuration: `${d.duration}s`,
              animationDelay: `-${d.delay}s`,
              opacity: d.opacity,
            }}
          />
        ))}
      </div>
    </>
  )
}

const FOOD_ITEMS = ['🍟', '🍗', '🍔', '🍕', '🌮', '🍜', '🥪', '🍩', '🌭', '🍣', '🍦', '🧆']
const MONEY_BILLS = ['💵', '💵', '💵', '💴', '💶', '💷', '💰', '💵', '💵', '💶']
const CHARITY_ITEMS = ['🐱', '💵', '😸', '💰', '🐈', '💴', '😻', '💵', '🐈‍⬛', '💶', '🐱', '💷', '😹', '💵', '🐾']

function FoodEffect() {
  const items = useMemo(() => (
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: rand(0, 96),
      size: rand(22, 42),
      duration: rand(4, 9),
      delay: rand(0, 8),
      wobble: rand(-25, 25),
      emoji: FOOD_ITEMS[i % FOOD_ITEMS.length],
    }))
  ), [])

  return (
    <>
      {items.map(f => (
        <span
          key={f.id}
          className="food-item"
          style={{
            left: `${f.x}%`,
            fontSize: f.size,
            animationDuration: `${f.duration}s`,
            animationDelay: `-${f.delay}s`,
            '--wobble': `${f.wobble}px`,
          }}
        >
          {f.emoji}
        </span>
      ))}
    </>
  )
}

function MoneyEffect() {
  const bills = useMemo(() => (
    Array.from({ length: 35 }, (_, i) => ({
      id: i,
      x: rand(0, 95),
      size: rand(24, 44),
      duration: rand(3, 7),
      delay: rand(0, 7),
      sway: rand(-40, 40),
      spin: rand(-60, 60),
      emoji: MONEY_BILLS[i % MONEY_BILLS.length],
    }))
  ), [])

  return (
    <>
      {bills.map(b => (
        <span
          key={b.id}
          className="money-bill"
          style={{
            left: `${b.x}%`,
            fontSize: b.size,
            animationDuration: `${b.duration}s`,
            animationDelay: `-${b.delay}s`,
            '--sway': `${b.sway}px`,
            '--spin': `${b.spin}deg`,
          }}
        >
          {b.emoji}
        </span>
      ))}
    </>
  )
}

function CharityEffect() {
  const items = useMemo(() => (
    Array.from({ length: 38 }, (_, i) => ({
      id: i,
      x: rand(0, 95),
      size: rand(20, 40),
      duration: rand(3.5, 8),
      delay: rand(0, 8),
      wobble: rand(-35, 35),
      spin: rand(-30, 30),
      emoji: CHARITY_ITEMS[i % CHARITY_ITEMS.length],
    }))
  ), [])

  return (
    <>
      {items.map(f => (
        <span
          key={f.id}
          className="charity-item"
          style={{
            left: `${f.x}%`,
            fontSize: f.size,
            animationDuration: `${f.duration}s`,
            animationDelay: `-${f.delay}s`,
            '--wobble': `${f.wobble}px`,
            '--spin': `${f.spin}deg`,
          }}
        >
          {f.emoji}
        </span>
      ))}
    </>
  )
}

/* ds-allow-hardcode: tier badge colors — map achievement identity to a fixed hue; no semantic token equivalent */
const TIER_COLOR = {
  golden:     '#FFD700',
  silver:     '#C0C0C0',
  bronze:     '#CD7F32',
  sadness:    '#5b7fa6',
  hunger:     '#f97316',
  billionaire:'#FFD700',
  charity:    '#a855f7',
}

export default function TierEffect({ tier }) {
  const [active, setActive] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    setActive(true)
    setFading(false)
    const fadeTimer  = setTimeout(() => setFading(true),  9000)
    const hideTimer  = setTimeout(() => setActive(false), 10000)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [tier])

  const color = TIER_COLOR[tier]

  const badge = color && (
    <div className="tier-color-badge" aria-hidden="true" style={{ background: color, boxShadow: `0 0 10px ${color}88` }} />
  )

  if (!active) return badge

  const wrap = (children) => (
    <div className={`tier-effect-wrap${fading ? ' tier-effect-fading' : ''}`} aria-hidden="true">
      {children}
      {badge}
    </div>
  )

  if (tier === 'sadness')     return wrap(<RainEffect />)
  if (tier === 'hunger')      return wrap(<FoodEffect />)
  if (tier === 'billionaire') return wrap(<MoneyEffect />)
  if (tier === 'charity')     return wrap(<CharityEffect />)
  if (!SPARKLE_CONFIG[tier])  return badge

  return wrap(<SparkleEffect tier={tier} />)
}
