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

// ── 4. Banana Effect (Monkey Achievement) ────────────────────────────────────
function BananaItem({ size = 26, spin = 0 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: `rotate(${spin}deg)`,
        filter: 'drop-shadow(0 2px 4px rgba(161, 98, 7, 0.45))',
        display: 'block'
      }}
    >
      <path
        d="M 8 10 C 13 9 24 12 30 21 C 35 28 34 34 29 36 C 24 38 22 32 18 25 C 14 18 10 13 7 11 Z"
        fill="#FACC15"
        stroke="#CA8A04"
        strokeWidth="1.2"
      />
      <path
        d="M 11 11 C 16 11 25 15 28 23 C 30 27 29 31 27 33"
        stroke="#FEF08A"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="30" cy="35" r="1.8" fill="#713F12" />
      <path
        d="M 8 10 L 6 7 C 5.5 6.2 6.2 5.8 6.8 6.2 L 8.5 8.5"
        stroke="#582C0E"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PeeledBananaItem({ size = 28, spin = 0 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: `rotate(${spin}deg)`,
        filter: 'drop-shadow(0 2px 4px rgba(161, 98, 7, 0.45))',
        display: 'block'
      }}
    >
      <path
        d="M 14 10 C 18 9 25 14 27 22 C 29 28 26 33 22 34 C 18 35 16 30 14 24 C 12 18 12 13 14 10 Z"
        fill="#FEF9C3"
        stroke="#EAB308"
        strokeWidth="1"
      />
      <path
        d="M 15 20 C 11 20 6 22 5 28 C 7 28 12 25 15 23 Z"
        fill="#FACC15"
        stroke="#CA8A04"
        strokeWidth="1"
      />
      <path
        d="M 23 22 C 28 23 34 26 35 32 C 33 32 28 28 24 25 Z"
        fill="#FACC15"
        stroke="#CA8A04"
        strokeWidth="1"
      />
      <path
        d="M 19 32 C 20 35 21 38 20 40 C 19 39 18 35 19 32 Z"
        fill="#CA8A04"
      />
    </svg>
  )
}

function BananaEffect() {
  const items = useMemo(() => (
    Array.from({ length: 26 }, (_, i) => ({
      id: i,
      x: rand(2, 96),
      size: rand(24, 38),
      duration: rand(5, 9.5),
      delay: rand(0, 8),
      wobble: rand(-40, 40),
      spin: rand(-45, 45),
      isPeeled: i % 3 === 0,
    }))
  ), [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {items.map(b => (
        <span
          key={b.id}
          className="banana-item"
          style={{
            position: 'absolute',
            left: `${b.x}%`,
            animationDuration: `${b.duration}s`,
            animationDelay: `-${b.delay}s`,
            '--wobble': `${b.wobble}px`,
            pointerEvents: 'none',
          }}
        >
          {b.isPeeled ? (
            <PeeledBananaItem size={b.size} spin={b.spin} />
          ) : (
            <BananaItem size={b.size} spin={b.spin} />
          )}
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

// ── 6. Veteran Effect (Royal Violet Sleuth Medals & Wisdom) ─────────────────
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

// ── Bespoke WaterEffect (Water Man / กำเนิดจากน้ำ) ──────────────────────────
function WaterEffect() {
  const [drops, setDrops] = useState([])

  useEffect(() => {
    const items = Array.from({ length: 22 }, (_, i) => ({
      id: i,
      left: Math.random() * 94 + 3,
      delay: Math.random() * 6,
      duration: 5 + Math.random() * 5,
      size: 14 + Math.random() * 16,
      drift: (Math.random() - 0.5) * 80,
      opacity: 0.35 + Math.random() * 0.45,
      type: i % 2 === 0 ? 'bubble' : 'droplet'
    }))
    setDrops(items)
  }, [])

  return (
    <div className="water-effect-overlay" aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      <style>{`
        .water-particle {
          position: absolute;
          bottom: -40px;
          animation: water-float-up ease-in-out infinite;
          filter: drop-shadow(0 2px 8px rgba(14, 165, 233, 0.35));
        }
        @keyframes water-float-up {
          0% {
            transform: translateY(0) translateX(0) scale(0.85);
            opacity: 0;
          }
          15% {
            opacity: var(--op);
          }
          85% {
            opacity: var(--op);
          }
          100% {
            transform: translateY(-112vh) translateX(var(--drift)) scale(1.1);
            opacity: 0;
          }
        }
      `}</style>
      {drops.map(d => (
        <div
          key={d.id}
          className="water-particle"
          style={{
            left: `${d.left}%`,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
            '--drift': `${d.drift}px`,
            '--op': d.opacity
          }}
        >
          {d.type === 'bubble' ? (
            <svg width={d.size} height={d.size} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#38bdf8" strokeWidth="1.5" fill="rgba(56, 189, 248, 0.12)" />
              <circle cx="8" cy="8" r="2.5" fill="rgba(255, 255, 255, 0.7)" />
            </svg>
          ) : (
            <svg width={d.size * 0.9} height={d.size * 1.2} viewBox="0 0 24 32" fill="none">
              <path
                d="M12 2 C12 2, 3 14, 3 21 C3 26 7 30 12 30 C17 30 21 26 21 21 C21 14, 12 2, 12 2 Z"
                fill="url(#water-grad)"
                stroke="#38bdf8"
                strokeWidth="1.2"
              />
              <ellipse cx="8.5" cy="19" rx="2" ry="4" fill="rgba(255,255,255,0.6)" transform="rotate(-20 8.5 19)" />
              <defs>
                <linearGradient id="water-grad" x1="12" y1="2" x2="12" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38bdf8" stopOpacity="0.45" />
                  <stop offset="1" stopColor="#0ea5e9" stopOpacity="0.75" />
                </linearGradient>
              </defs>
            </svg>
          )}
        </div>
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
  monkey:     '#EAB308',
  water_man:  '#0EA5E9',
  warter_man: '#0EA5E9',
  charity:    '#BE185D',
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
        /* Monkey banana drift */
        .banana-item {
          position: absolute;
          top: -50px;
          user-select: none;
          line-height: 1;
          animation: banana-fall ease-in-out infinite;
        }
        @keyframes banana-fall {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          10%  { opacity: 0.95; }
          50%  { transform: translateY(55vh) translateX(var(--wobble)); }
          85%  { opacity: 0.9; }
          100% { transform: translateY(115vh) translateX(calc(var(--wobble) * -0.5)); opacity: 0; }
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
      {tier === 'monkey' && <BananaEffect />}
      {(tier === 'water_man' || tier === 'warter_man') && <WaterEffect />}
      {tier === 'charity' && <CharityEffect />}
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
