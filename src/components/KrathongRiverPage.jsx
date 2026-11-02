import React, { useState, useEffect, useRef, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../firebase'

// Fallback seed Krathongs to ensure the river is lively even before many user submissions
const SEED_KRATHONGS = [
  {
    id: 'seed-1',
    name: 'น้องเนย & แก๊งเพื่อน',
    wish: 'ขอให้ปีนี้สอบติดคณะที่หวัง สุขภาพแข็งแรง มีความสุขในทุกๆ วัน',
    lane: 0,
    speed: 0.38,
    scale: 0.7,
    x: 120,
    likes: 18,
    isSeed: true,
  },
  {
    id: 'seed-2',
    name: 'พี่วาฬ Sofun',
    wish: 'ขอให้คอมมูนิตี้ Sofun Club อบอุ่น มีคนมาเล่นเกมสืบสวน Script Murder กันเยอะๆ',
    lane: 2,
    speed: 0.55,
    scale: 1.0,
    x: 480,
    likes: 42,
    isSeed: true,
  },
  {
    id: 'seed-3',
    name: 'ต้นกล้า & พลอย',
    wish: 'ขอให้ความรักมั่นคง อยู่เคียงข้างกันตลอดไป มีแต่รอยยิ้มและเสียงหัวเราะ',
    lane: 1,
    speed: 0.44,
    scale: 0.85,
    x: 820,
    likes: 29,
    isSeed: true,
  },
  {
    id: 'seed-4',
    name: 'ครอบครัวสุขสันต์',
    wish: 'ขอขมาพระแม่คงคา ขอให้ครอบครัวร่มเย็นเป็นสุข ปราศจากโรคภัยไข้เจ็บทั้งปวง',
    lane: 0,
    speed: 0.35,
    scale: 0.68,
    x: 1150,
    likes: 35,
    isSeed: true,
  },
  {
    id: 'seed-5',
    name: 'เกมเมอร์สายสืบ',
    wish: 'ขอให้เล่นคดีไหนก็จับฆาตกรได้ ไม่โดนหลอกตาแตก และพบเพื่อนเล่นดีๆ เสมอ',
    lane: 2,
    speed: 0.58,
    scale: 0.98,
    x: 1480,
    likes: 51,
    isSeed: true,
  },
]

// Default Krathong SVG graphics for seeds or rendering fallback
function DefaultKrathongSvg({ scale = 1, glowColor = '#f59e0b' }) {
  return (
    <svg width={140 * scale} height={110 * scale} viewBox="0 0 140 110" style={{ overflow: 'visible' }}>
      {/* Water reflection glow */}
      <ellipse cx="70" cy="98" rx="60" ry="12" fill={glowColor} opacity="0.3" filter="blur(8px)" />

      {/* Krathong Banana Leaf Base */}
      <ellipse cx="70" cy="85" rx="55" ry="18" fill="#15803d" />
      <ellipse cx="70" cy="82" rx="50" ry="15" fill="#16a34a" />

      {/* Lotus Petals Layer 1 (Dark pink) */}
      <path d="M 20 80 Q 25 55 35 70" stroke="#be123c" strokeWidth="2" fill="#e11d48" />
      <path d="M 35 72 Q 45 48 55 68" stroke="#be123c" strokeWidth="2" fill="#f43f5e" />
      <path d="M 55 70 Q 70 42 85 70" stroke="#be123c" strokeWidth="2" fill="#fb7185" />
      <path d="M 85 68 Q 95 48 105 72" stroke="#be123c" strokeWidth="2" fill="#f43f5e" />
      <path d="M 105 70 Q 115 55 120 80" stroke="#be123c" strokeWidth="2" fill="#e11d48" />

      {/* Lotus Petals Layer 2 (Front) */}
      <path d="M 30 84 Q 45 62 60 82" fill="#fda4af" />
      <path d="M 60 82 Q 70 58 80 82" fill="#fecdd3" />
      <path d="M 80 82 Q 95 62 110 84" fill="#fda4af" />

      {/* Incense sticks */}
      <line x1="62" y1="76" x2="58" y2="28" stroke="#78350f" strokeWidth="2.5" />
      <line x1="78" y1="76" x2="82" y2="28" stroke="#78350f" strokeWidth="2.5" />
      {/* Incense embers glowing */}
      <circle cx="58" cy="28" r="2.5" fill="#ef4444" filter="drop-shadow(0 0 4px #f87171)" />
      <circle cx="82" cy="28" r="2.5" fill="#ef4444" filter="drop-shadow(0 0 4px #f87171)" />

      {/* Yellow Candle in Center */}
      <rect x="66" y="44" width="8" height="34" rx="2" fill="#f59e0b" />
      {/* Candle Flame with intense pulsing flicker */}
      <path d="M 70 44 C 65 36 65 24 70 18 C 75 24 75 36 70 44 Z" fill="#fef08a" filter="drop-shadow(0 0 8px #f59e0b)" />
      <circle cx="70" cy="30" r="14" fill="#fbbf24" opacity="0.35" filter="blur(6px)" />
    </svg>
  )
}

export default function KrathongRiverPage({ showPage, lineUser, showToast }) {
  const containerRef = useRef(null)

  // Krathongs state
  const [firestoreKrathongs, setFirestoreKrathongs] = useState([])
  const [activeWishId, setActiveWishId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [skyLanterns, setSkyLanterns] = useState([
    { id: 'lan-1', x: 15, y: 35, size: 16, speed: 0.15 },
    { id: 'lan-2', x: 38, y: 22, size: 22, speed: 0.22 },
    { id: 'lan-3', x: 62, y: 48, size: 14, speed: 0.12 },
    { id: 'lan-4', x: 82, y: 18, size: 26, speed: 0.25 },
    { id: 'lan-5', x: 92, y: 42, size: 18, speed: 0.18 },
  ])
  const [soundEnabled, setSoundEnabled] = useState(false)
  const audioCtxRef = useRef(null)

  // Real-time animation positions
  const krathongPositionsRef = useRef(new Map())
  const [, setTick] = useState(0)

  // ── Firestore Subscription ─────────────────────────────────
  useEffect(() => {
    try {
      const q = query(collection(db, 'krathongs'), orderBy('createdAt', 'desc'), limit(120))
      const unsub = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map((docSnap, idx) => {
          const d = docSnap.data()
          return {
            id: docSnap.id,
            name: d.name || 'ผู้ร่วมลอยกระทง',
            wish: d.wish || 'ขอพรพระแม่คงคา',
            imageData: d.imageData || null,
            lane: d.lane !== undefined ? d.lane % 3 : idx % 3,
            speed: d.speed || (0.35 + ((idx % 5) * 0.08)),
            scale: d.scale || (0.75 + ((idx % 3) * 0.15)),
            bobFreq: d.bobFreq || (1.2 + Math.random()),
            bobAmp: d.bobAmp || (3 + Math.random() * 4),
            likes: d.likes || 0,
            createdAt: d.createdAt,
            // Assign staggered initial X positions across a wide virtual river (0 to 3200px)
            initialX: (idx * 280 + 100) % 3200,
          }
        })
        setFirestoreKrathongs(items)
      }, (err) => {
        console.warn('Firestore error in KrathongRiverPage:', err)
      })
      return () => unsub()
    } catch {
      // Fallback
    }
  }, [])

  // ── Combined Krathong List ────────────────────────────────
  const allKrathongs = useMemo(() => {
    if (firestoreKrathongs.length === 0) {
      return SEED_KRATHONGS
    }
    // Merge real ones with seed ones if real count is less than 5
    if (firestoreKrathongs.length < 5) {
      return [...firestoreKrathongs, ...SEED_KRATHONGS.slice(0, 5 - firestoreKrathongs.length)]
    }
    return firestoreKrathongs
  }, [firestoreKrathongs])

  // Initialize positions map
  useEffect(() => {
    allKrathongs.forEach((k, idx) => {
      if (!krathongPositionsRef.current.has(k.id)) {
        const startX = k.initialX !== undefined ? k.initialX : ((idx * 260 + 60) % 2400)
        krathongPositionsRef.current.set(k.id, {
          x: startX,
          bobOffset: Math.random() * Math.PI * 2,
        })
      }
    })
  }, [allKrathongs])

  // ── 60 FPS Animation Loop for River & Parallax ─────────────
  useEffect(() => {
    let animId
    let lastTime = performance.now()

    const animate = (currentTime) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1)
      lastTime = currentTime

      const containerW = containerRef.current ? containerRef.current.clientWidth : window.innerWidth
      const riverVirtualWidth = Math.max(containerW + 600, 2400)

      // Move each Krathong smoothly along x-axis from right to left
      allKrathongs.forEach((k) => {
        const pos = krathongPositionsRef.current.get(k.id)
        if (pos) {
          const moveSpeed = (k.speed || 0.4) * 55 * dt
          pos.x -= moveSpeed
          // Wrap around to right side when floating past left edge
          if (pos.x < -220) {
            pos.x = riverVirtualWidth + Math.random() * 200
          }
        }
      })

      // Move sky lanterns gently upward and drifting slightly
      setSkyLanterns((prev) =>
        prev.map((lan) => {
          let newY = lan.y - lan.speed * dt * 4
          let newX = lan.x + Math.sin(currentTime * 0.001 + lan.size) * 0.03
          if (newY < -10) {
            newY = 105
            newX = Math.random() * 95
          }
          return { ...lan, x: newX, y: newY }
        })
      )

      setTick(currentTime)
      animId = requestAnimationFrame(animate)
    }

    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [allKrathongs])

  // ── Send Blessing / Like ("สาธุ") ────────────────────────
  const handleSendBlessing = async (krathong) => {
    if (!krathong.isSeed) {
      try {
        const krathongRef = doc(db, 'krathongs', krathong.id)
        await updateDoc(krathongRef, {
          likes: increment(1),
        })
      } catch (err) {
        console.warn('Could not increment likes:', err)
      }
    }
    if (showToast) showToast('ร่วมอนุโมทนาสาธุกับคำอธิษฐานแล้ว')
  }

  // ── Release a Sky Lantern ────────────────────────────────
  const handleReleaseSkyLantern = () => {
    const newLan = {
      id: 'custom-' + Date.now(),
      x: 35 + Math.random() * 30,
      y: 95,
      size: 20 + Math.random() * 8,
      speed: 0.35 + Math.random() * 0.2,
    }
    setSkyLanterns((prev) => [...prev, newLan])
    if (showToast) showToast('ปล่อยโคมลอยขึ้นสู่ฟากฟ้าแล้ว')
  }

  // ── Web Audio Ambient Sound ──────────────────────────────
  const toggleSound = () => {
    if (soundEnabled) {
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
      setSoundEnabled(false)
    } else {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        const ctx = new AudioContext()
        audioCtxRef.current = ctx

        // Create pink noise for gentle river wave sound
        const bufferSize = ctx.sampleRate * 2
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const output = noiseBuffer.getChannelData(0)
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1
          b0 = 0.99886 * b0 + white * 0.0555179
          b1 = 0.99332 * b1 + white * 0.0750759
          b2 = 0.96900 * b2 + white * 0.1538520
          b3 = 0.86650 * b3 + white * 0.3104856
          b4 = 0.55000 * b4 + white * 0.5329522
          b5 = -0.7616 * b5 - white * 0.0168980
          output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.02
          b6 = white * 0.115926
        }

        const whiteNoise = ctx.createBufferSource()
        whiteNoise.buffer = noiseBuffer
        whiteNoise.loop = true

        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(320, ctx.currentTime)

        const gainNode = ctx.createGain()
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime)

        whiteNoise.connect(filter)
        filter.connect(gainNode)
        gainNode.connect(ctx.destination)
        whiteNoise.start()

        setSoundEnabled(true)
      } catch (err) {
        console.warn('Audio context init failed:', err)
      }
    }
  }

  // ── Active Krathong details for floating wish bubble ──────
  const activeKrathong = useMemo(() => {
    return allKrathongs.find((k) => k.id === activeWishId) || null
  }, [allKrathongs, activeWishId])

  // Filtered search
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return []
    return allKrathongs.filter((k) =>
      k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.wish.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [allKrathongs, searchQuery])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        background: 'linear-gradient(180deg, #040714 0%, #081228 35%, #0e2246 65%, #081734 100%)',
        fontFamily: "'Sarabun', sans-serif",
        color: '#ffffff',
        userSelect: 'none',
      }}
    >
      {/* ── Layer 1: Night Sky, Stars & Glowing Moon ───────── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
        {/* Full Moon */}
        <div style={{
          position: 'absolute',
          top: '40px',
          right: '12%',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #fffbeb 25%, #fef3c7 60%, #fde68a 100%)',
          boxShadow: '0 0 70px 20px rgba(254, 243, 199, 0.4)',
        }}>
          {/* Subtle lunar maria texture */}
          <div style={{
            position: 'absolute',
            top: '25px',
            left: '30px',
            width: '35px',
            height: '25px',
            borderRadius: '50%',
            background: 'rgba(217, 119, 6, 0.08)',
          }} />
        </div>

        {/* Floating Sky Lanterns (โคมลอย) */}
        {skyLanterns.map((lan) => (
          <div
            key={lan.id}
            style={{
              position: 'absolute',
              left: `${lan.x}%`,
              top: `${lan.y}%`,
              width: `${lan.size}px`,
              height: `${lan.size * 1.3}px`,
              borderRadius: '3px 3px 6px 6px',
              background: 'linear-gradient(180deg, #fef08a 0%, #f59e0b 60%, #b45309 100%)',
              boxShadow: `0 0 20px ${lan.size * 0.8}px rgba(245, 158, 11, 0.35)`,
              opacity: 0.85,
              transition: 'top 0.1s linear, left 0.1s linear',
            }}
          />
        ))}
      </div>

      {/* ── Layer 2: Temple & City Skyline Silhouette ──────── */}
      <div style={{
        position: 'absolute',
        bottom: '360px',
        left: 0,
        right: 0,
        height: '260px',
        pointerEvents: 'none',
        zIndex: 2,
        opacity: 0.9,
      }}>
        {/* SVG Detailed Wat Arun & Thai Temple Silhouette with Golden Warm Illumination */}
        <svg
          viewBox="0 0 1440 260"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <linearGradient id="templeGoldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="40%" stopColor="#b45309" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#08142b" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="templeDark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a1a36" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#050e1f" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Far Distant Shore / Trees */}
          <path d="M 0 220 Q 180 200 360 215 T 720 210 T 1080 215 T 1440 210 L 1440 260 L 0 260 Z" fill="url(#templeDark)" />

          {/* Thai Temple 1: Small Pavilion on Left */}
          <path d="M 140 220 L 140 180 L 130 180 L 150 145 L 170 180 L 160 180 L 160 220 Z" fill="url(#templeDark)" />

          {/* Wat Arun Grand Prang (Central Stupa) in Center */}
          <g transform="translate(640, 20)">
            {/* Illuminated Golden Spire */}
            <path d="M 80 0 L 82 45 L 86 90 L 92 135 L 98 180 L 108 220 L 52 220 L 62 180 L 68 135 L 74 90 L 78 45 Z" fill="url(#templeGoldGrad)" />
            {/* Stepped Prang Base */}
            <rect x="40" y="200" width="80" height="20" fill="url(#templeGoldGrad)" rx="2" />
            <rect x="25" y="215" width="110" height="15" fill="url(#templeDark)" rx="2" />
            {/* Small flanker stupas */}
            <path d="M 20 120 L 22 170 L 26 215 L 14 215 L 18 170 Z" fill="url(#templeGoldGrad)" />
            <path d="M 140 120 L 142 170 L 146 215 L 134 215 L 138 170 Z" fill="url(#templeGoldGrad)" />
            {/* Spire Top Glowing Crystal */}
            <circle cx="80" cy="0" r="4" fill="#fef08a" filter="drop-shadow(0 0 10px #f59e0b)" />
          </g>

          {/* Thai Traditional Tiered Roof Temple on Right */}
          <g transform="translate(980, 70)">
            {/* Tier 1 Spire */}
            <polygon points="70,0 72,50 68,50" fill="#f59e0b" />
            {/* Tier 1 Roof */}
            <path d="M 40 50 Q 70 35 100 50 L 105 60 L 35 60 Z" fill="#b45309" />
            {/* Tier 2 Roof */}
            <path d="M 25 65 Q 70 45 115 65 L 122 80 L 18 80 Z" fill="#b45309" />
            {/* Tier 3 Main Roof with Chofah tips */}
            <path d="M 10 85 Q 70 60 130 85 L 140 105 L 0 105 Z" fill="#92400e" />
            {/* Temple Pillars & Base */}
            <rect x="25" y="105" width="90" height="65" fill="url(#templeDark)" />
            {/* Window warm light */}
            <rect x="45" y="120" width="14" height="26" fill="#fef08a" opacity="0.6" rx="2" />
            <rect x="80" y="120" width="14" height="26" fill="#fef08a" opacity="0.6" rx="2" />
          </g>

          {/* Riverside Festival Lamps */}
          {[120, 260, 480, 880, 1180, 1340].map((rx, idx) => (
            <circle key={idx} cx={rx} cy="216" r="3" fill="#fef08a" filter="drop-shadow(0 0 8px #f59e0b)" />
          ))}
        </svg>
      </div>

      {/* ── Layer 3: Flowing Water & Moonlight Shimmer ──────── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '380px',
        background: 'linear-gradient(180deg, rgba(8, 20, 45, 0.95) 0%, #061126 50%, #030814 100%)',
        zIndex: 3,
      }}>
        {/* Animated Water Waves Layers (Canvas or SVG) */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '40px',
          background: 'linear-gradient(180deg, rgba(254, 240, 138, 0.12) 0%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        {/* Water Ripple Ripples */}
        <svg viewBox="0 0 1200 80" style={{ width: '100%', height: '80px', position: 'absolute', top: 0, left: 0, opacity: 0.35 }}>
          <path d="M 0 20 Q 300 35 600 20 T 1200 20 L 1200 0 L 0 0 Z" fill="#38bdf8" />
          <path d="M 0 45 Q 300 25 600 45 T 1200 45 L 1200 0 L 0 0 Z" fill="#0284c7" opacity="0.5" />
        </svg>

        {/* Moonlight Path Reflection down the River */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: '12%',
          width: '180px',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(254, 243, 199, 0.18) 0%, rgba(254, 240, 138, 0.04) 60%, transparent 100%)',
          pointerEvents: 'none',
          filter: 'blur(10px)',
        }} />
      </div>

      {/* ── Layer 4: Floating Krathongs on River Lanes ──────── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '380px',
        zIndex: 10,
        pointerEvents: 'none',
      }}>
        {allKrathongs.map((k) => {
          const pos = krathongPositionsRef.current.get(k.id) || { x: 500, bobOffset: 0 }
          const lane = k.lane || 0

          // Depth Configuration per Lane
          // Lane 0: Distant (higher up, smaller, slower)
          // Lane 1: Mid
          // Lane 2: Foreground (lower down, larger, faster)
          const laneBottom = lane === 0 ? 230 : lane === 1 ? 130 : 35
          const laneScale = (k.scale || 0.85) * (lane === 0 ? 0.68 : lane === 1 ? 0.88 : 1.05)
          const laneZIndex = lane === 0 ? 11 : lane === 1 ? 12 : 13

          // Real-time gentle sinusoidal bobbing & tilting
          const timeSec = performance.now() / 1000
          const bobFreq = k.bobFreq || 1.4
          const bobAmp = k.bobAmp || 4
          const offsetY = Math.sin(timeSec * bobFreq + pos.bobOffset) * bobAmp
          const rotateDeg = Math.sin(timeSec * bobFreq + pos.bobOffset) * 2.2

          const isSelected = activeWishId === k.id

          return (
            <div
              key={k.id}
              onClick={() => setActiveWishId(isSelected ? null : k.id)}
              style={{
                position: 'absolute',
                left: `${pos.x}px`,
                bottom: `${laneBottom + offsetY}px`,
                transform: `rotate(${rotateDeg}deg) scale(${laneScale})`,
                transformOrigin: '50% 85%',
                cursor: 'pointer',
                pointerEvents: 'auto',
                zIndex: isSelected ? 30 : laneZIndex,
                transition: 'filter 0.2s',
                filter: isSelected ? 'drop-shadow(0 0 16px rgba(254, 240, 138, 0.9))' : 'none',
              }}
            >
              {/* Floating Candle Light Water Halo */}
              <div style={{
                position: 'absolute',
                bottom: '-8px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '110px',
                height: '24px',
                borderRadius: '50%',
                background: 'radial-gradient(ellipse, rgba(245, 158, 11, 0.45) 0%, transparent 70%)',
                filter: 'blur(6px)',
                pointerEvents: 'none',
              }} />

              {/* Krathong Body (Custom User Canvas Image OR Default SVG) */}
              <div style={{
                width: '130px',
                height: '110px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}>
                {k.imageData ? (
                  <img
                    src={k.imageData}
                    alt={k.name}
                    style={{
                      maxWidth: '120px',
                      maxHeight: '100px',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.6))',
                    }}
                  />
                ) : (
                  <DefaultKrathongSvg scale={1} glowColor="#f59e0b" />
                )}

                {/* Flickering Flame Particle above Krathong */}
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#fef08a',
                  boxShadow: '0 0 14px 6px rgba(245, 158, 11, 0.75)',
                  pointerEvents: 'none',
                  animation: 'candleFlicker 1.5s ease-in-out infinite alternate',
                }} />
              </div>

              {/* Owner Name Tag directly below Krathong */}
              <div style={{
                marginTop: '2px',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isSelected ? 'rgba(245, 158, 11, 0.95)' : 'rgba(5, 10, 25, 0.82)',
                  border: isSelected ? '1px solid #fef08a' : '1px solid rgba(254, 240, 138, 0.35)',
                  color: isSelected ? '#111827' : '#fef08a',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
                  backdropFilter: 'blur(4px)',
                }}>
                  <i className="fas fa-feather-pointed" style={{ fontSize: '9px' }} />
                  {k.name}
                </span>
              </div>

              {/* ── Active Wish Bubble (Floats in Lockstep with Krathong!) ── */}
              {isSelected && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    bottom: '120px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '240px',
                    background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.95) 0%, rgba(8, 15, 30, 0.98) 100%)',
                    border: '1.5px solid rgba(245, 158, 11, 0.8)',
                    borderRadius: '16px',
                    padding: '14px',
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75), 0 0 20px rgba(245, 158, 11, 0.3)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 50,
                    pointerEvents: 'auto',
                    textAlign: 'left',
                    animation: 'bubbleAppear 0.25s ease-out',
                  }}
                >
                  {/* Bubble Pointer Arrow at bottom */}
                  <div style={{
                    position: 'absolute',
                    bottom: '-8px',
                    left: '50%',
                    transform: 'translateX(-50%) rotate(45deg)',
                    width: '14px',
                    height: '14px',
                    background: 'rgba(8, 15, 30, 0.98)',
                    borderRight: '1.5px solid rgba(245, 158, 11, 0.8)',
                    borderBottom: '1.5px solid rgba(245, 158, 11, 0.8)',
                  }} />

                  {/* Header: Name and Close button */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    paddingBottom: '6px',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#fef08a' }}>
                      คุณ {k.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveWishId(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.6)',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        fontSize: '12px',
                      }}
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>

                  {/* Wish Text */}
                  <div style={{
                    fontSize: '12.5px',
                    color: '#ffffff',
                    lineHeight: 1.55,
                    marginBottom: '12px',
                    fontStyle: 'normal',
                  }}>
                    "{k.wish}"
                  </div>

                  {/* Footer: Blessing / Sadhu button */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '6px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  }}>
                    <button
                      type="button"
                      onClick={() => handleSendBlessing(k)}
                      style={{
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '8px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <i className="fas fa-hands-praying" /> สาธุ ({k.likes || 0})
                    </button>

                    <span style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.5)' }}>
                      ลอยอยู่ในสายนที
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Top Navigation & HUD Controls ──────────────────── */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 40,
        background: 'linear-gradient(180deg, rgba(5, 8, 20, 0.85) 0%, transparent 100%)',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        {/* Left: Back & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => showPage('loykrathong')}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backdropFilter: 'blur(8px)',
            }}
          >
            <i className="fas fa-arrow-left" /> กลับ
          </button>

          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fef08a' }}>
              แม่น้ำสายบุญ 2D Parallax
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>
              คลิกที่กระทงเพื่ออ่านคำอธิษฐานที่ลอยไปพร้อมกระทง
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? 'ปิดเสียงสายน้ำ' : 'เปิดเสียงสายน้ำ'}
            style={{
              background: soundEnabled ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              border: soundEnabled ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.18)',
              color: soundEnabled ? '#38bdf8' : '#ffffff',
              borderRadius: '8px',
              padding: '7px 11px',
              cursor: 'pointer',
              fontSize: '13px',
              backdropFilter: 'blur(8px)',
            }}
          >
            <i className={`fas ${soundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`} />
          </button>

          {/* Release Sky Lantern Button */}
          <button
            type="button"
            onClick={handleReleaseSkyLantern}
            style={{
              background: 'rgba(245, 158, 11, 0.18)',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              color: '#fef08a',
              borderRadius: '8px',
              padding: '7px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backdropFilter: 'blur(8px)',
            }}
          >
            <i className="fas fa-fire-flame-curved" /> ปล่อยโคมลอย
          </button>

          {/* Go Draw Krathong Button */}
          <button
            type="button"
            onClick={() => showPage('krathong')}
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              border: 'none',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '7px 14px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
            }}
          >
            <i className="fas fa-paint-brush" /> วาดกระทงของคุณ
          </button>
        </div>
      </div>

      {/* ── Bottom Floating HUD (Stats & Search Krathong) ───── */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '20px',
        right: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 40,
        pointerEvents: 'none',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        {/* Total Krathong Count Pill */}
        <div style={{
          background: 'rgba(5, 10, 25, 0.85)',
          border: '1px solid rgba(254, 240, 138, 0.3)',
          borderRadius: '20px',
          padding: '6px 14px',
          fontSize: '12px',
          color: '#fef08a',
          fontWeight: 700,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <i className="fas fa-water" /> กระทงทั้งหมด {allKrathongs.length} ใบในสายน้ำ
        </div>

        {/* Search Krathong by Name */}
        <div style={{
          position: 'relative',
          pointerEvents: 'auto',
          maxWidth: '280px',
          width: '100%',
        }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหากระทงตามชื่อ..."
            style={{
              width: '100%',
              padding: '7px 12px 7px 32px',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(5, 10, 25, 0.85)',
              color: '#ffffff',
              fontSize: '12px',
              outline: 'none',
              backdropFilter: 'blur(8px)',
              boxSizing: 'border-box',
            }}
          />
          <i
            className="fas fa-search"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.5)',
            }}
          />

          {/* Search Results Dropdown */}
          {filteredList.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: '36px',
              left: 0,
              right: 0,
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '12px',
              padding: '6px',
              maxHeight: '180px',
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(8px)',
            }}>
              {filteredList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setActiveWishId(item.id)
                    setSearchQuery('')
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#fef08a',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(245, 158, 11, 0.2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontWeight: 700 }}>คุณ {item.name}</div>
                  <div style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.wish}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes candleFlicker {
          0% { transform: translateX(-50%) scale(1); opacity: 0.9; }
          50% { transform: translateX(-48%) scale(1.15); opacity: 1; }
          100% { transform: translateX(-52%) scale(0.95); opacity: 0.85; }
        }
        @keyframes bubbleAppear {
          0% { transform: translateX(-50%) translateY(10px) scale(0.9); opacity: 0; }
          100% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
