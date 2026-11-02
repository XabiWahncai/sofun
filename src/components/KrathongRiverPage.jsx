import React, { useState, useEffect, useRef, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../firebase'

export default function KrathongRiverPage({ showPage, lineUser, showToast }) {
  const containerRef = useRef(null)

  // Firestore Krathongs state (Real data only, zero mockups)
  const [firestoreKrathongs, setFirestoreKrathongs] = useState([])
  const [activeWishIds, setActiveWishIds] = useState(() => new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [newArrivalNotice, setNewArrivalNotice] = useState(null)
  const isInitialLoadRef = useRef(true)

  // Sky Lanterns particle animation state
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

  // ── Toggle wish bubble for a specific krathong ─────────────
  const toggleWish = (id) => {
    setActiveWishIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ── Auto-highlight newly released Krathong if user just floated one ──
  useEffect(() => {
    try {
      const recentId = sessionStorage.getItem('sofun_recent_krathong')
      if (recentId) {
        setActiveWishIds(new Set([recentId]))
        sessionStorage.removeItem('sofun_recent_krathong')
      }
    } catch {
      // Ignored
    }
  }, [])

  // ── Real-time Firestore Subscription (Real Data Only) ───────
  useEffect(() => {
    try {
      const q = query(collection(db, 'krathongs'), orderBy('createdAt', 'desc'), limit(150))
      const unsub = onSnapshot(q, (snapshot) => {
        const containerW = containerRef.current ? containerRef.current.clientWidth : (window.innerWidth || 1000)

        // Check for new Krathongs added after initial load
        if (!isInitialLoadRef.current) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const d = change.doc.data()
              // Put new arrival starting on right edge to float across
              krathongPositionsRef.current.set(change.doc.id, {
                x: containerW + 40,
                bobOffset: Math.random() * Math.PI * 2,
              })
              setNewArrivalNotice(d.name || 'มีผู้ร่วมลอยกระทงใหม่')
              setTimeout(() => setNewArrivalNotice(null), 5000)
            }
          })
        }

        const items = snapshot.docs.map((docSnap, idx) => {
          const d = docSnap.data()
          return {
            id: docSnap.id,
            name: d.name || 'ผู้ร่วมลอยกระทง',
            wish: d.wish || 'ขอพรพระแม่คงคา',
            imageData: d.imageData || null,
            lane: d.lane !== undefined ? d.lane % 3 : idx % 3,
            speed: d.speed || (0.35 + ((idx % 5) * 0.08)),
            scale: d.scale || (0.8 + ((idx % 3) * 0.15)),
            bobFreq: d.bobFreq || (1.2 + (idx % 4) * 0.2),
            bobAmp: d.bobAmp || (3.5 + (idx % 3) * 1.5),
            likes: d.likes || 0,
            createdAt: d.createdAt,
          }
        })

        // On initial load, spread all real krathongs across the visible river
        if (isInitialLoadRef.current && items.length > 0) {
          const total = items.length
          const slot = (containerW + 160) / total
          items.forEach((k, idx) => {
            if (!krathongPositionsRef.current.has(k.id)) {
              // Stagger positions across the visible river from center to right
              const startX = total === 1 ? containerW * 0.55 : (idx * slot + 60) % (containerW + 160)
              krathongPositionsRef.current.set(k.id, {
                x: startX,
                bobOffset: Math.random() * Math.PI * 2,
              })
            }
          })

          // If user didn't specify a recent one, open the first krathong's wish so river is immediately interactive
          setActiveWishIds((prev) => {
            if (prev.size === 0 && items.length > 0) {
              return new Set([items[0].id])
            }
            return prev
          })

          isInitialLoadRef.current = false
        }

        setFirestoreKrathongs(items)
      }, (err) => {
        console.warn('Firestore subscription error:', err)
      })

      return () => unsub()
    } catch {
      // Fallback
    }
  }, [])

  // ── 60 FPS Animation Loop for River & Parallax ─────────────
  useEffect(() => {
    let animId
    let lastTime = performance.now()

    const animate = (currentTime) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1)
      lastTime = currentTime

      const containerW = containerRef.current ? containerRef.current.clientWidth : (window.innerWidth || 1000)

      // Move each Krathong smoothly along x-axis from right to left
      firestoreKrathongs.forEach((k) => {
        const pos = krathongPositionsRef.current.get(k.id)
        if (pos) {
          const moveSpeed = (k.speed || 0.4) * 48 * dt
          pos.x -= moveSpeed

          // Fast & fluid wrap-around: As soon as krathong floats past left edge (-160px),
          // immediately re-enter from the right edge so the river never stays empty!
          if (pos.x < -160) {
            pos.x = containerW + 40 + Math.random() * 80
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
  }, [firestoreKrathongs])

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

  // Filtered search
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return []
    return firestoreKrathongs.filter((k) =>
      k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.wish.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [firestoreKrathongs, searchQuery])

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
        {/* Animated Water Waves Layers */}
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

      {/* ── Real-time Notification Banner for Newly Arrived Krathong ── */}
      {newArrivalNotice && (
        <div style={{
          position: 'absolute',
          top: '76px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(245, 158, 11, 0.92)',
          color: '#111827',
          padding: '6px 18px',
          borderRadius: '20px',
          fontSize: '12.5px',
          fontWeight: 800,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 20px rgba(245, 158, 11, 0.5)',
          zIndex: 45,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'bubbleAppear 0.3s ease-out',
        }}>
          <i className="fas fa-water" /> มีกระทงใหม่จาก คุณ {newArrivalNotice} ลอยลงสู่แม่น้ำแล้ว
        </div>
      )}

      {/* ── Empty River State (If 0 real krathongs in database) ── */}
      {firestoreKrathongs.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          background: 'rgba(5, 12, 28, 0.88)',
          border: '1.5px solid rgba(245, 158, 11, 0.45)',
          borderRadius: '20px',
          padding: '28px 32px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7), 0 0 30px rgba(245, 158, 11, 0.15)',
          backdropFilter: 'blur(10px)',
          zIndex: 25,
          maxWidth: '380px',
          width: '90%',
        }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fef08a',
            fontSize: '24px',
            margin: '0 auto 14px',
          }}>
            <i className="fas fa-water" />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fef08a', margin: '0 0 8px' }}>
            ยังไม่มีกระทงในสายน้ำ
          </h3>
          <p style={{ fontSize: '13.5px', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.55, margin: '0 0 20px' }}>
            ร่วมเป็นคนแรกที่วาดกระทงและส่งคำอธิษฐานลงสู่แม่น้ำสายบุญใต้แสงจันทร์
          </p>
          <button
            type="button"
            onClick={() => showPage('krathong')}
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              border: 'none',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '11px 22px',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.35)',
            }}
          >
            <i className="fas fa-paint-brush" /> วาดกระทงใบแรก (/Krathong)
          </button>
        </div>
      )}

      {/* ── Layer 4: Real-time Floating Krathongs on River ────── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '380px',
        zIndex: 10,
        pointerEvents: 'none',
      }}>
        {firestoreKrathongs.map((k) => {
          const pos = krathongPositionsRef.current.get(k.id) || { x: 500, bobOffset: 0 }
          const lane = k.lane || 0

          // Depth Configuration per Lane
          const laneBottom = lane === 0 ? 230 : lane === 1 ? 130 : 35
          const laneScale = (k.scale || 0.85) * (lane === 0 ? 0.68 : lane === 1 ? 0.88 : 1.05)
          const laneZIndex = lane === 0 ? 11 : lane === 1 ? 12 : 13

          // Real-time gentle sinusoidal bobbing & tilting
          const timeSec = performance.now() / 1000
          const bobFreq = k.bobFreq || 1.4
          const bobAmp = k.bobAmp || 4
          const offsetY = Math.sin(timeSec * bobFreq + pos.bobOffset) * bobAmp
          const rotateDeg = Math.sin(timeSec * bobFreq + pos.bobOffset) * 2.2

          const isWishOpen = activeWishIds.has(k.id)

          return (
            <div
              key={k.id}
              onClick={() => toggleWish(k.id)}
              style={{
                position: 'absolute',
                left: `${pos.x}px`,
                bottom: `${laneBottom + offsetY}px`,
                transform: `rotate(${rotateDeg}deg) scale(${laneScale})`,
                transformOrigin: '50% 85%',
                cursor: 'pointer',
                pointerEvents: 'auto',
                zIndex: isWishOpen ? 30 : laneZIndex,
                transition: 'filter 0.2s',
                filter: isWishOpen ? 'drop-shadow(0 0 16px rgba(254, 240, 138, 0.95))' : 'none',
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

              {/* Krathong Body (Exact User Drawing Canvas Image) */}
              <div style={{
                width: '130px',
                height: '110px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}>
                {k.imageData && (
                  <img
                    src={k.imageData}
                    alt={k.name}
                    style={{
                      maxWidth: '120px',
                      maxHeight: '100px',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.65))',
                    }}
                  />
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
                  background: isWishOpen ? 'rgba(245, 158, 11, 0.95)' : 'rgba(5, 10, 25, 0.85)',
                  border: isWishOpen ? '1px solid #fef08a' : '1px solid rgba(254, 240, 138, 0.35)',
                  color: isWishOpen ? '#111827' : '#fef08a',
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
            </div>
          )
        })}
      </div>

      {/* ── Layer 5: Unscaled Translucent Wish Bubbles (Constant Readable Font on Near & Far Lanes) ── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '380px',
        zIndex: 35,
        pointerEvents: 'none',
      }}>
        {Array.from(activeWishIds).map((id) => {
          const k = firestoreKrathongs.find((item) => item.id === id)
          if (!k) return null
          const pos = krathongPositionsRef.current.get(k.id)
          if (!pos) return null

          const lane = k.lane || 0
          const laneBottom = lane === 0 ? 230 : lane === 1 ? 130 : 35
          const laneScale = (k.scale || 0.85) * (lane === 0 ? 0.68 : lane === 1 ? 0.88 : 1.05)

          const timeSec = performance.now() / 1000
          const bobFreq = k.bobFreq || 1.4
          const bobAmp = k.bobAmp || 4
          const offsetY = Math.sin(timeSec * bobFreq + pos.bobOffset) * bobAmp

          // Calculate real-time unscaled position over the Krathong:
          const bubbleX = pos.x + 65
          const bubbleBottom = laneBottom + offsetY + (100 * laneScale) + 12

          return (
            <div
              key={`wish-${k.id}`}
              onClick={(e) => {
                e.stopPropagation()
                toggleWish(k.id)
              }}
              style={{
                position: 'absolute',
                left: `${bubbleX}px`,
                bottom: `${bubbleBottom}px`,
                transform: 'translateX(-50%)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                zIndex: 35,
                animation: 'bubbleAppear 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              title="คลิกเพื่อปิดคำอธิษฐาน"
            >
              {/* Translucent Frosted Glass Card - Clean Wish Text Only */}
              <div style={{
                background: 'rgba(6, 14, 30, 0.65)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1.5px solid rgba(254, 240, 138, 0.45)',
                borderRadius: '16px',
                padding: '9px 16px',
                maxWidth: 'min(300px, 80vw)',
                minWidth: '120px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45), 0 0 16px rgba(245, 158, 11, 0.2)',
                textAlign: 'center',
                position: 'relative',
              }}>
                {/* Downward Pointer Triangle */}
                <div style={{
                  position: 'absolute',
                  bottom: '-6px',
                  left: '50%',
                  transform: 'translateX(-50%) rotate(45deg)',
                  width: '10px',
                  height: '10px',
                  background: 'rgba(6, 14, 30, 0.7)',
                  borderRight: '1.5px solid rgba(254, 240, 138, 0.45)',
                  borderBottom: '1.5px solid rgba(254, 240, 138, 0.45)',
                }} />

                {/* Only Wish Text - Constant readable 14.5px font */}
                <div style={{
                  fontSize: '14.5px',
                  fontWeight: 600,
                  color: '#ffffff',
                  lineHeight: 1.5,
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.95)',
                  wordBreak: 'break-word',
                  letterSpacing: '0.01em',
                }}>
                  "{k.wish}"
                </div>
              </div>
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
          <i className="fas fa-water" /> กระทงจริงในสายน้ำ {firestoreKrathongs.length} ใบ
        </div>

        {/* Search Krathong by Name */}
        {firestoreKrathongs.length > 0 && (
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
                      setActiveWishIds(new Set([item.id]))
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
        )}
      </div>

      <style>{`
        @keyframes candleFlicker {
          0% { transform: translateX(-50%) scale(1); opacity: 0.9; }
          50% { transform: translateX(-48%) scale(1.15); opacity: 1; }
          100% { transform: translateX(-52%) scale(0.95); opacity: 0.85; }
        }
        @keyframes bubbleAppear {
          0% { transform: translateX(-50%) translateY(8px) scale(0.92); opacity: 0; }
          100% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
