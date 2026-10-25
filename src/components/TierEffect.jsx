import { useMemo } from 'react'

const SPARKLE_CONFIG = {
  golden: {
    colors: ['#FFD700', '#FCC200', '#E8BA2A', '#FFF59D', '#D4AF37', '#FFE082'],
    count: 24,
  },
  silver: {
    colors: ['#FFFFFF', '#E8E8E8', '#C0C0C0', '#A8A9AD', '#F5F5F5', '#D4D4D4'],
    count: 20,
  },
  bronze: {
    colors: ['#CD7F32', '#E8972A', '#F0A84B', '#FFD4A0', '#B8730A', '#E5A050'],
    count: 20,
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
      size: rand(10, 22),
      delay: rand(0, 6),
      duration: rand(2.5, 5.5),
      color: pick(config.colors),
      icon: i % 3 === 0 ? 'fa-star' : 'fa-certificate',
      float: i < Math.floor(config.count * 0.35),
    }))
  }, [tier])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 399, overflow: 'hidden' }}>
      {particles.map(p => (
        <span
          key={p.id}
          className={`tier-sparkle ${p.float ? 'tier-sparkle-float' : 'tier-sparkle-twinkle'}`}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            fontSize: p.size,
            color: p.color,
            animationDelay: `-${p.delay}s`,
            animationDuration: `${p.duration}s`,
            filter: `drop-shadow(0 0 ${Math.round(p.size * 0.45)}px ${p.color})`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${p.icon}`} style={{ fontSize: p.size }} />
        </span>
      ))}
    </div>
  )
}

function RainEffect() {
  const drops = useMemo(() => (
    Array.from({ length: 55 }, (_, i) => ({
      id: i,
      x: rand(0, 100),
      height: rand(22, 60),
      duration: rand(0.45, 0.85),
      delay: rand(0, 3),
      opacity: rand(0.3, 0.65),
      width: Math.random() > 0.7 ? 2 : 1.5,
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 398 }}>
      <div className="rain-overlay" />
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
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>
    </div>
  )
}

const FOOD_ICONS = [
  { icon: 'fa-burger', color: '#F97316' },
  { icon: 'fa-pizza-slice', color: '#EA580C' },
  { icon: 'fa-drumstick-bite', color: '#FB923C' },
  { icon: 'fa-utensils', color: '#F59E0B' },
  { icon: 'fa-ice-cream', color: '#FB7185' },
  { icon: 'fa-cookie', color: '#D97706' },
  { icon: 'fa-bread-slice', color: '#FBBF24' },
  { icon: 'fa-hotdog', color: '#E11D48' },
  { icon: 'fa-apple-whole', color: '#EF4444' },
  { icon: 'fa-bowl-rice', color: '#F97316' },
  { icon: 'fa-mug-hot', color: '#EA580C' },
  { icon: 'fa-cheese', color: '#FBBF24' },
]

function FoodEffect() {
  const items = useMemo(() => (
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: rand(2, 96),
      size: rand(18, 32),
      duration: rand(5, 10),
      delay: rand(0, 8),
      wobble: rand(-30, 30),
      item: FOOD_ICONS[i % FOOD_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 399, overflow: 'hidden' }}>
      {items.map(f => (
        <span
          key={f.id}
          className="food-item"
          style={{
            position: 'absolute',
            left: `${f.x}%`,
            fontSize: f.size,
            color: f.item.color,
            animationDuration: `${f.duration}s`,
            animationDelay: `-${f.delay}s`,
            '--wobble': `${f.wobble}px`,
            pointerEvents: 'none',
            opacity: 0.85,
          }}
        >
          <i className={`fas ${f.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

const MONEY_ICONS = [
  { icon: 'fa-money-bill-wave', color: '#22c55e' },
  { icon: 'fa-coins', color: '#eab308' },
  { icon: 'fa-sack-dollar', color: '#16a34a' },
  { icon: 'fa-money-bill-1', color: '#4ade80' },
  { icon: 'fa-gem', color: '#60a5fa' },
]

function MoneyEffect() {
  const bills = useMemo(() => (
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: rand(2, 95),
      size: rand(18, 30),
      duration: rand(4, 8),
      delay: rand(0, 7),
      sway: rand(-40, 40),
      spin: rand(-60, 60),
      item: MONEY_ICONS[i % MONEY_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 399, overflow: 'hidden' }}>
      {bills.map(b => (
        <span
          key={b.id}
          className="money-bill"
          style={{
            position: 'absolute',
            left: `${b.x}%`,
            fontSize: b.size,
            color: b.item.color,
            animationDuration: `${b.duration}s`,
            animationDelay: `-${b.delay}s`,
            '--sway': `${b.sway}px`,
            '--spin': `${b.spin}deg`,
            pointerEvents: 'none',
            opacity: 0.85,
          }}
        >
          <i className={`fas ${b.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

const CHARITY_ICONS = [
  { icon: 'fa-heart', color: '#ec4899' },
  { icon: 'fa-paw', color: '#f43f5e' },
  { icon: 'fa-hand-holding-heart', color: '#db2777' },
  { icon: 'fa-ribbon', color: '#f472b6' },
]

function CharityEffect() {
  const items = useMemo(() => (
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: rand(2, 95),
      size: rand(16, 28),
      duration: rand(4.5, 8.5),
      delay: rand(0, 8),
      wobble: rand(-35, 35),
      spin: rand(-30, 30),
      item: CHARITY_ICONS[i % CHARITY_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 399, overflow: 'hidden' }}>
      {items.map(f => (
        <span
          key={f.id}
          className="charity-item"
          style={{
            position: 'absolute',
            left: `${f.x}%`,
            fontSize: f.size,
            color: f.item.color,
            animationDuration: `${f.duration}s`,
            animationDelay: `-${f.delay}s`,
            '--wobble': `${f.wobble}px`,
            '--spin': `${f.spin}deg`,
            pointerEvents: 'none',
            opacity: 0.85,
          }}
        >
          <i className={`fas ${f.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

const TIER_COLOR = {
  golden:     '#D4AF37',
  silver:     '#94A3B8',
  bronze:     '#CD7F32',
  sadness:    '#64748B',
  hunger:     '#F97316',
  billionaire:'#16A34A',
  charity:    '#BE185D',
}

export default function TierEffect({ tier }) {
  if (!tier) return null

  if (tier === 'sadness')     return <RainEffect />
  if (tier === 'hunger')      return <FoodEffect />
  if (tier === 'billionaire') return <MoneyEffect />
  if (tier === 'charity')     return <CharityEffect />
  if (SPARKLE_CONFIG[tier])   return <SparkleEffect tier={tier} />

  const color = TIER_COLOR[tier]
  if (!color) return null

  return (
    <div
      className="tier-color-badge"
      aria-hidden="true"
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 10px ${color}`,
        pointerEvents: 'none',
        zIndex: 399,
      }}
    />
  )
}
