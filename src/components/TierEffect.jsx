// Tier Ambient Particle Effects Engine for SOFUN Platform
// Custom bespoke visual effects for 100% of achievement themes
// Zero emojis rule strictly applied.

import { useMemo, useState, useEffect } from 'react'

const rand = (min, max) => min + Math.random() * (max - min)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// ── 1. Gold / Silver / Bronze Sparkle Effect ─────────────────────────────────
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
  golden_pass: {
    colors: ['#FFF59D', '#FFE082', '#FFD54F', '#FFCA28', '#FFC107', '#EAB308'],
    count: 26,
  },
}

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
      icon: tier === 'golden_pass' ? (i % 3 === 0 ? 'fa-ticket' : (i % 2 === 0 ? 'fa-star' : 'fa-certificate')) : (i % 3 === 0 ? 'fa-star' : 'fa-certificate'),
      float: i < Math.floor(config.count * 0.35),
    }))
  }, [tier, config])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
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

// ── 2. Rain Effect (Sadness Noir) ────────────────────────────────────────────
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
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
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

// ── 3. Food Effect (The Hunger) ──────────────────────────────────────────────
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
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
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

// ── 4. Money Effect (The Billionaire) ────────────────────────────────────────
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
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
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

// ── 5. Charity Effect (Charity Chairman) ─────────────────────────────────────
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
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
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

// ── 6. Godfather Effect (Crimson Noir Embers & Rose Petals) ───────────────────
const GODFATHER_ICONS = [
  { icon: 'fa-crown', color: '#c62419' },
  { icon: 'fa-fire', color: '#e11d48' },
  { icon: 'fa-crosshairs', color: '#991b1b' },
  { icon: 'fa-wine-glass', color: '#b91c1c' },
  { icon: 'fa-shield-halved', color: '#881337' },
  { icon: 'fa-fan', color: '#dc2626' },
]

function GodfatherEffect() {
  const items = useMemo(() => (
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      x: rand(2, 96),
      size: rand(14, 26),
      duration: rand(6, 11),
      delay: rand(0, 8),
      drift: rand(-45, 45),
      rot: rand(-90, 90),
      item: GODFATHER_ICONS[i % GODFATHER_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(circle at 50% 50%, transparent 60%, rgba(139, 0, 0, 0.08) 100%)',
        pointerEvents: 'none',
        zIndex: 10
      }} />
      {items.map(item => (
        <span
          key={item.id}
          className="tier-godfather-ember"
          style={{
            position: 'absolute',
            left: `${item.x}%`,
            fontSize: item.size,
            color: item.item.color,
            animationDuration: `${item.duration}s`,
            animationDelay: `-${item.delay}s`,
            '--drift': `${item.drift}px`,
            '--rot': `${item.rot}deg`,
            filter: `drop-shadow(0 0 8px ${item.item.color})`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${item.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

// ── 7. Champion Effect (Victory Trophy & Golden Confetti) ─────────────────────
const CHAMPION_ICONS = [
  { icon: 'fa-trophy', color: '#F59E0B' },
  { icon: 'fa-medal', color: '#FBBF24' },
  { icon: 'fa-crown', color: '#D97706' },
  { icon: 'fa-star', color: '#FEF08A' },
  { icon: 'fa-award', color: '#F59E0B' },
  { icon: 'fa-certificate', color: '#FBBF24' },
]

function ChampionEffect() {
  const items = useMemo(() => (
    Array.from({ length: 26 }, (_, i) => ({
      id: i,
      x: rand(2, 96),
      size: rand(16, 28),
      duration: rand(4.5, 8.5),
      delay: rand(0, 7),
      drift: rand(-50, 50),
      rot: rand(-180, 180),
      item: CHAMPION_ICONS[i % CHAMPION_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {items.map(item => (
        <span
          key={item.id}
          className="tier-champion-confetti"
          style={{
            position: 'absolute',
            left: `${item.x}%`,
            fontSize: item.size,
            color: item.item.color,
            animationDuration: `${item.duration}s`,
            animationDelay: `-${item.delay}s`,
            '--drift': `${item.drift}px`,
            '--rot': `${item.rot}deg`,
            filter: `drop-shadow(0 2px 6px rgba(245,158,11,0.5))`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${item.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

// ── 8. Detective Effect (Mystery Clues & Deduction Aura) ─────────────────────
const DETECTIVE_ICONS = [
  { icon: 'fa-magnifying-glass', color: '#3B82F6' },
  { icon: 'fa-fingerprint', color: '#60A5FA' },
  { icon: 'fa-shoe-prints', color: '#2563EB' },
  { icon: 'fa-file-lines', color: '#93C5FD' },
  { icon: 'fa-question', color: '#60A5FA' },
  { icon: 'fa-compass', color: '#1D4ED8' },
]

function DetectiveEffect() {
  const items = useMemo(() => (
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      x: rand(2, 95),
      size: rand(15, 26),
      duration: rand(6, 11),
      delay: rand(0, 8),
      drift: rand(-35, 35),
      item: DETECTIVE_ICONS[i % DETECTIVE_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {items.map(item => (
        <span
          key={item.id}
          className="tier-detective-clue"
          style={{
            position: 'absolute',
            left: `${item.x}%`,
            fontSize: item.size,
            color: item.item.color,
            animationDuration: `${item.duration}s`,
            animationDelay: `-${item.delay}s`,
            '--drift': `${item.drift}px`,
            filter: `drop-shadow(0 0 8px rgba(59,130,246,0.6))`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${item.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

// ── 9. Villain Effect (Phantom Masks & Neon Glitch Danger) ───────────────────
const VILLAIN_ICONS = [
  { icon: 'fa-mask', color: '#EC4899' },
  { icon: 'fa-user-secret', color: '#DB2777' },
  { icon: 'fa-crosshairs', color: '#F472B6' },
  { icon: 'fa-skull', color: '#BE185D' },
  { icon: 'fa-bolt', color: '#F43F5E' },
]

function VillainEffect() {
  const items = useMemo(() => (
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      x: rand(2, 95),
      size: rand(16, 28),
      duration: rand(5, 9),
      delay: rand(0, 7),
      drift: rand(-40, 40),
      rot: rand(-60, 60),
      item: VILLAIN_ICONS[i % VILLAIN_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {items.map(item => (
        <span
          key={item.id}
          className="tier-villain-glitch"
          style={{
            position: 'absolute',
            left: `${item.x}%`,
            fontSize: item.size,
            color: item.item.color,
            animationDuration: `${item.duration}s`,
            animationDelay: `-${item.delay}s`,
            '--drift': `${item.drift}px`,
            '--rot': `${item.rot}deg`,
            filter: `drop-shadow(0 0 10px rgba(219,39,119,0.7))`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${item.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

// ── 10. Veteran Effect (Royal Violet Sleuth Medals & Wisdom) ─────────────────
const VETERAN_ICONS = [
  { icon: 'fa-medal', color: '#8B5CF6' },
  { icon: 'fa-hourglass-half', color: '#A78BFA' },
  { icon: 'fa-shield', color: '#7C3AED' },
  { icon: 'fa-gem', color: '#C4B5FD' },
  { icon: 'fa-ribbon', color: '#6D28D9' },
]

function VeteranEffect() {
  const items = useMemo(() => (
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: rand(2, 95),
      size: rand(15, 26),
      duration: rand(6, 11),
      delay: rand(0, 8),
      drift: rand(-30, 30),
      rot: rand(-45, 45),
      item: VETERAN_ICONS[i % VETERAN_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {items.map(item => (
        <span
          key={item.id}
          className="tier-veteran-medal"
          style={{
            position: 'absolute',
            left: `${item.x}%`,
            fontSize: item.size,
            color: item.item.color,
            animationDuration: `${item.duration}s`,
            animationDelay: `-${item.delay}s`,
            '--drift': `${item.drift}px`,
            '--rot': `${item.rot}deg`,
            filter: `drop-shadow(0 0 8px rgba(139,92,246,0.6))`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${item.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

// ── 11. Explorer Effect (Compass Winds & Safari Leaves) ──────────────────────
const EXPLORER_ICONS = [
  { icon: 'fa-compass', color: '#10B981' },
  { icon: 'fa-leaf', color: '#34D399' },
  { icon: 'fa-flag', color: '#059669' },
  { icon: 'fa-map-location-dot', color: '#6EE7B7' },
  { icon: 'fa-mountain-sun', color: '#047857' },
]

function ExplorerEffect() {
  const items = useMemo(() => (
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      x: rand(2, 95),
      size: rand(15, 26),
      duration: rand(5, 9),
      delay: rand(0, 7),
      drift: rand(-35, 35),
      rot: rand(-90, 90),
      item: EXPLORER_ICONS[i % EXPLORER_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {items.map(item => (
        <span
          key={item.id}
          className="tier-explorer-wind"
          style={{
            position: 'absolute',
            left: `${item.x}%`,
            fontSize: item.size,
            color: item.item.color,
            animationDuration: `${item.duration}s`,
            animationDelay: `-${item.delay}s`,
            '--drift': `${item.drift}px`,
            '--rot': `${item.rot}deg`,
            filter: `drop-shadow(0 2px 6px rgba(16,185,129,0.4))`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${item.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

// ── 12. PotterHead Effect (Magic Wands & Enchanted Stardust) ─────────────────
const POTTER_ICONS = [
  { icon: 'fa-wand-magic-sparkles', color: '#E11D48' },
  { icon: 'fa-hat-wizard', color: '#FB7185' },
  { icon: 'fa-broom', color: '#F43F5E' },
  { icon: 'fa-bolt', color: '#FDE047' },
  { icon: 'fa-feather-pointed', color: '#FDA4AF' },
]

function PotterEffect() {
  const items = useMemo(() => (
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: rand(2, 95),
      size: rand(14, 26),
      duration: rand(5, 10),
      delay: rand(0, 8),
      drift: rand(-40, 40),
      item: POTTER_ICONS[i % POTTER_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {items.map(item => (
        <span
          key={item.id}
          className="tier-potter-magic"
          style={{
            position: 'absolute',
            left: `${item.x}%`,
            fontSize: item.size,
            color: item.item.color,
            animationDuration: `${item.duration}s`,
            animationDelay: `-${item.delay}s`,
            '--drift': `${item.drift}px`,
            filter: `drop-shadow(0 0 10px rgba(225,29,72,0.65))`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${item.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

// ── 13. New Era Effect (Futuristic Cyber Matrix & Electric Pulses) ───────────
const NEW_ERA_ICONS = [
  { icon: 'fa-cube', color: '#06B6D4' },
  { icon: 'fa-microchip', color: '#22D3EE' },
  { icon: 'fa-bolt', color: '#67E8F9' },
  { icon: 'fa-circle-nodes', color: '#0891B2' },
]

function NewEraEffect() {
  const items = useMemo(() => (
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      x: rand(2, 95),
      size: rand(14, 25),
      duration: rand(4.5, 8),
      delay: rand(0, 6),
      drift: rand(-30, 30),
      item: NEW_ERA_ICONS[i % NEW_ERA_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {items.map(item => (
        <span
          key={item.id}
          className="tier-newera-pulse"
          style={{
            position: 'absolute',
            left: `${item.x}%`,
            fontSize: item.size,
            color: item.item.color,
            animationDuration: `${item.duration}s`,
            animationDelay: `-${item.delay}s`,
            '--drift': `${item.drift}px`,
            filter: `drop-shadow(0 0 8px rgba(6,182,212,0.7))`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${item.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

// ── 14. Manager Effect (Concierge Keys & Cafe Warmth) ────────────────────────
const MANAGER_ICONS = [
  { icon: 'fa-mug-hot', color: '#F59E0B' },
  { icon: 'fa-key', color: '#10B981' },
  { icon: 'fa-clipboard-check', color: '#34D399' },
  { icon: 'fa-bell-concierge', color: '#FBBF24' },
  { icon: 'fa-user-tie', color: '#059669' },
]

function ManagerEffect() {
  const items = useMemo(() => (
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: rand(2, 95),
      size: rand(15, 26),
      duration: rand(6, 11),
      delay: rand(0, 8),
      drift: rand(-30, 30),
      rot: rand(-40, 40),
      item: MANAGER_ICONS[i % MANAGER_ICONS.length],
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {items.map(item => (
        <span
          key={item.id}
          className="tier-manager-bob"
          style={{
            position: 'absolute',
            left: `${item.x}%`,
            fontSize: item.size,
            color: item.item.color,
            animationDuration: `${item.duration}s`,
            animationDelay: `-${item.delay}s`,
            '--drift': `${item.drift}px`,
            '--rot': `${item.rot}deg`,
            filter: `drop-shadow(0 2px 6px rgba(16,185,129,0.4))`,
            pointerEvents: 'none',
          }}
        >
          <i className={`fas ${item.item.icon}`} />
        </span>
      ))}
    </div>
  )
}

// ── Global Color Fallback ───────────────────────────────────────────────────
const TIER_COLOR = {
  golden:     '#D4AF37',
  golden_pass:'#EAB308',
  silver:     '#94A3B8',
  bronze:     '#CD7F32',
  sadness:    '#64748B',
  hunger:     '#F97316',
  food_garden:'#EA580C',
  billionaire:'#16A34A',
  charity:    '#BE185D',
  godfather:  '#8B0000',
  champion:   '#D97706',
  detective:  '#2563EB',
  villain:    '#DB2777',
  veteran:    '#7C3AED',
  explorer:   '#059669',
  potterhead: '#E11D48',
  new_era:    '#06B6D4',
  first_party: '#06B6D4',
  manager:    '#10B981',
}

// ── Master TierEffect Component ─────────────────────────────────────────────
export default function TierEffect({ tier }) {
  const [active, setActive] = useState(true)
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    if (!tier || tier === 'default' || tier === 'none') return
    setActive(true)
    setOpacity(1)

    // At 8.8s start 1.2s smooth fadeout
    const fadeTimer = setTimeout(() => {
      setOpacity(0)
    }, 8800)

    // At 10.0s completely unmount particles
    const dismissTimer = setTimeout(() => {
      setActive(false)
    }, 10000)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(dismissTimer)
    }
  }, [tier])

  // Listen for replay trigger events
  useEffect(() => {
    const handleReplay = () => {
      setActive(true)
      setOpacity(1)
    }
    window.addEventListener('sofun-replay-effect', handleReplay)
    return () => window.removeEventListener('sofun-replay-effect', handleReplay)
  }, [])

  if (!tier || tier === 'default' || tier === 'none' || !active) return null

  return (
    <div
      className="tier-effect-master-wrap"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
        opacity,
        transition: 'opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden'
      }}
    >
      <style>{`
        /* Godfather embers floating up */
        .tier-godfather-ember {
          position: absolute;
          bottom: -50px;
          user-select: none;
          line-height: 1;
          animation: godfather-float linear infinite;
        }
        @keyframes godfather-float {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 0; }
          12%  { opacity: 0.95; }
          85%  { opacity: 0.85; }
          100% { transform: translateY(-115vh) translateX(var(--drift)) rotate(var(--rot)); opacity: 0; }
        }

        /* Champion confetti falling down */
        .tier-champion-confetti {
          position: absolute;
          top: -50px;
          user-select: none;
          line-height: 1;
          animation: champion-fall linear infinite;
        }
        @keyframes champion-fall {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          85%  { opacity: 0.9; }
          100% { transform: translateY(115vh) translateX(var(--drift)) rotate(var(--rot)); opacity: 0; }
        }

        /* Detective clue drifting */
        .tier-detective-clue {
          position: absolute;
          bottom: -50px;
          user-select: none;
          line-height: 1;
          animation: detective-drift ease-in-out infinite;
        }
        @keyframes detective-drift {
          0%   { transform: translateY(0) translateX(0) scale(0.9); opacity: 0; }
          15%  { opacity: 0.85; transform: translateY(-20vh) scale(1); }
          50%  { transform: translateY(-60vh) translateX(var(--drift)) scale(1.05); }
          85%  { opacity: 0.85; }
          100% { transform: translateY(-115vh) translateX(calc(var(--drift) * 1.5)) scale(0.9); opacity: 0; }
        }

        /* Villain glitch drift */
        .tier-villain-glitch {
          position: absolute;
          top: -50px;
          user-select: none;
          line-height: 1;
          animation: villain-glitch linear infinite;
        }
        @keyframes villain-glitch {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 0; }
          12%  { opacity: 0.95; }
          50%  { transform: translateY(55vh) translateX(var(--drift)) rotate(var(--rot)); }
          88%  { opacity: 0.85; }
          100% { transform: translateY(115vh) translateX(calc(var(--drift) * 0.5)) rotate(calc(var(--rot) * 2)); opacity: 0; }
        }

        /* Veteran medal rise */
        .tier-veteran-medal {
          position: absolute;
          bottom: -50px;
          user-select: none;
          line-height: 1;
          animation: veteran-rise ease-in-out infinite;
        }
        @keyframes veteran-rise {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 0; }
          12%  { opacity: 0.9; }
          85%  { opacity: 0.85; }
          100% { transform: translateY(-115vh) translateX(var(--drift)) rotate(var(--rot)); opacity: 0; }
        }

        /* Explorer wind drift */
        .tier-explorer-wind {
          position: absolute;
          top: -50px;
          user-select: none;
          line-height: 1;
          animation: explorer-wind linear infinite;
        }
        @keyframes explorer-wind {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 0; }
          12%  { opacity: 0.9; }
          85%  { opacity: 0.85; }
          100% { transform: translateY(115vh) translateX(calc(60px + var(--drift))) rotate(var(--rot)); opacity: 0; }
        }

        /* Potterhead magic spiral */
        .tier-potter-magic {
          position: absolute;
          bottom: -50px;
          user-select: none;
          line-height: 1;
          animation: potter-spiral ease-in-out infinite;
        }
        @keyframes potter-spiral {
          0%   { transform: translateY(0) translateX(0) scale(0.8); opacity: 0; }
          15%  { opacity: 0.95; transform: translateY(-20vh) scale(1.1); }
          50%  { transform: translateY(-60vh) translateX(var(--drift)) scale(0.95); }
          85%  { opacity: 0.9; }
          100% { transform: translateY(-115vh) translateX(calc(var(--drift) * -1)) scale(0.8); opacity: 0; }
        }

        /* New Era cyber matrix */
        .tier-newera-pulse {
          position: absolute;
          top: -50px;
          user-select: none;
          line-height: 1;
          animation: newera-fall linear infinite;
        }
        @keyframes newera-fall {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          12%  { opacity: 0.95; }
          85%  { opacity: 0.85; }
          100% { transform: translateY(115vh) translateX(var(--drift)); opacity: 0; }
        }

        /* Manager gentle float */
        .tier-manager-bob {
          position: absolute;
          bottom: -50px;
          user-select: none;
          line-height: 1;
          animation: manager-bob ease-in-out infinite;
        }
        @keyframes manager-bob {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 0; }
          12%  { opacity: 0.9; }
          85%  { opacity: 0.85; }
          100% { transform: translateY(-115vh) translateX(var(--drift)) rotate(var(--rot)); opacity: 0; }
        }
      `}</style>

      {/* Render bespoke effect based on tier */}
      {tier === 'sadness' && <RainEffect />}
      {(tier === 'hunger' || tier === 'food_garden') && <FoodEffect />}
      {tier === 'billionaire' && <MoneyEffect />}
      {tier === 'charity' && <CharityEffect />}
      {tier === 'godfather' && <GodfatherEffect />}
      {tier === 'champion' && <ChampionEffect />}
      {tier === 'detective' && <DetectiveEffect />}
      {tier === 'villain' && <VillainEffect />}
      {tier === 'veteran' && <VeteranEffect />}
      {tier === 'explorer' && <ExplorerEffect />}
      {tier === 'potterhead' && <PotterEffect />}
      {(tier === 'new_era' || tier === 'first_party') && <NewEraEffect />}
      {tier === 'manager' && <ManagerEffect />}
      {SPARKLE_CONFIG[tier] && <SparkleEffect tier={tier} />}

      {/* Floating status dot */}
      {TIER_COLOR[tier] && (
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
            background: TIER_COLOR[tier],
            boxShadow: `0 0 10px ${TIER_COLOR[tier]}`,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
    </div>
  )
}
