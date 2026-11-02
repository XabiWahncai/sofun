import React, { useState, useEffect, useRef, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../firebase'

// ── 4 Depth Lanes Configuration (From farthest back to closest front) ──
// Strictly defined bottom Y, perspective scale, parallax speed, and z-index.
// Higher lane index = closer to camera = higher z-index (Lane 0 is farthest, Lane 3 is nearest foreground).
const LANE_CONFIG = [
  // Lane 0: ไกลสุด / Furthest back near river horizon
  { bottom: 205, scaleMult: 0.58, speedMult: 0.65, baseZIndex: 11 },
  // Lane 1: ไกลกลาง / Mid-far
  { bottom: 145, scaleMult: 0.74, speedMult: 0.85, baseZIndex: 13 },
  // Lane 2: ใกล้กลาง / Mid-near
  { bottom: 85,  scaleMult: 0.92, speedMult: 1.05, baseZIndex: 15 },
  // Lane 3: ใกล้สุด / Nearest foreground
  { bottom: 22,  scaleMult: 1.10, speedMult: 1.25, baseZIndex: 17 },
]

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
  const [sadhuCounts, setSadhuCounts] = useState({})

  // ── Increment Sadhu Count ──────────────────────────────────
  const handleSadhu = async (krathongId) => {
    setSadhuCounts((prev) => {
      const target = firestoreKrathongs.find((x) => x.id === krathongId)
      const cur = prev[krathongId] ?? target?.sadhuCount ?? target?.likes ?? 0
      return { ...prev, [krathongId]: cur + 1 }
    })

    try {
      const docRef = doc(db, 'krathongs', krathongId)
      await updateDoc(docRef, {
        sadhuCount: increment(1),
        likes: increment(1),
      })
    } catch (err) {
      console.warn('Sadhu update error:', err)
    }
  }

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
                x: containerW + 40 + Math.random() * 120,
                lane: Math.floor(Math.random() * 4),
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
            lane: d.lane !== undefined ? d.lane % 4 : idx % 4,
            speed: d.speed || (0.35 + ((idx % 5) * 0.08)),
            scale: d.scale || (0.8 + ((idx % 3) * 0.15)),
            bobFreq: d.bobFreq || (1.2 + (idx % 4) * 0.2),
            bobAmp: d.bobAmp || (3.5 + (idx % 3) * 1.5),
            sadhuCount: d.sadhuCount || d.likes || 0,
            likes: d.likes || d.sadhuCount || 0,
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
                lane: k.lane !== undefined ? k.lane % 4 : (idx % 4),
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

      // Move each Krathong smoothly along x-axis from right to left with perspective parallax
      firestoreKrathongs.forEach((k) => {
        const pos = krathongPositionsRef.current.get(k.id)
        if (pos) {
          const lane = pos.lane !== undefined ? pos.lane % 4 : (k.lane !== undefined ? k.lane % 4 : 1)
          const cfg = LANE_CONFIG[lane] || LANE_CONFIG[1]
          const moveSpeed = (k.speed || 0.4) * (cfg.speedMult || 1) * 48 * dt
          pos.x -= moveSpeed

          // Fast & fluid wrap-around: As soon as krathong floats past left edge (-240px),
          // immediately re-enter from the right edge with a newly randomized depth lane across 4 levels
          if (pos.x < -240) {
            pos.x = containerW + 40 + Math.random() * 160
            pos.lane = Math.floor(Math.random() * 4)
            pos.bobOffset = Math.random() * Math.PI * 2
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
        background: 'radial-gradient(90.84% 137.95% at 50% 97.73%, #57BAB8 0%, #F6FFB5 10.62%, #FBDA75 18.95%, #F9C963 29.65%, #FFA340 44.74%, #AF3F16 71.39%, #2b0b00 93.94%)',
        fontFamily: "'Sarabun', sans-serif",
        color: '#ffffff',
        userSelect: 'none',
      }}
    >
      {/* ── Layer 1: Night Sky, Stars & Floating Sky Lanterns ───────── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
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

      {/* ── Layer 2: Authentic Bangkok Temples & Full Moon Panoramic Backdrop ── */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: '340px',
        backgroundImage: "url('/loykrathong-bg.webp'), url('/loykrathong-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center bottom',
        backgroundRepeat: 'no-repeat',
        pointerEvents: 'none',
        zIndex: 2,
      }} />

      {/* ── Layer 3: Living Flowing River with Waves, Shimmer & Reflections ──────── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '340px',
        background: 'linear-gradient(180deg, #091e3e 0%, #0c2d5c 20%, #0a254e 45%, #061937 72%, #020a1c 100%)',
        overflow: 'hidden',
        zIndex: 3,
        pointerEvents: 'none',
      }}>
        {/* Far River Shore Horizon & Water Mist */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '45px',
          background: 'linear-gradient(180deg, rgba(254, 240, 138, 0.16) 0%, rgba(56, 189, 248, 0.08) 50%, transparent 100%)',
          borderTop: '1px solid rgba(254, 240, 138, 0.35)',
        }} />

        {/* Wat Arun Grand Prang Golden Water Reflection (Aligned to Wat Arun at left: 23%) */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '23%',
          transform: 'translateX(-50%)',
          width: '130px',
          height: '140px',
          background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.32) 0%, rgba(180, 83, 9, 0.16) 50%, transparent 100%)',
          filter: 'blur(10px)',
          animation: 'templeReflectionUndulate 4.5s ease-in-out infinite alternate',
        }} />

        {/* Grand Palace Royal Pavilion Golden Reflection (Aligned to Grand Palace at left: 52%) */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '52%',
          transform: 'translateX(-50%)',
          width: '190px',
          height: '125px',
          background: 'linear-gradient(180deg, rgba(217, 119, 6, 0.28) 0%, rgba(146, 64, 14, 0.12) 55%, transparent 100%)',
          filter: 'blur(10px)',
          animation: 'templeReflectionUndulate 5s ease-in-out infinite alternate 1s',
        }} />

        {/* Golden Chedi Stupa Reflection (Aligned to Chedi at left: 66%) */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '66%',
          transform: 'translateX(-50%)',
          width: '110px',
          height: '115px',
          background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.28) 0%, rgba(180, 83, 9, 0.12) 50%, transparent 100%)',
          filter: 'blur(9px)',
          animation: 'templeReflectionUndulate 4.8s ease-in-out infinite alternate 0.5s',
        }} />

        {/* Giant Swing Subtle Warm Red-Amber Reflection (Aligned to Giant Swing at left: 76%) */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '76%',
          transform: 'translateX(-50%)',
          width: '65px',
          height: '95px',
          background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.22) 0%, rgba(185, 28, 28, 0.08) 55%, transparent 100%)',
          filter: 'blur(8px)',
          animation: 'templeReflectionUndulate 5.5s ease-in-out infinite alternate 2s',
        }} />

        {/* Riverside Embankment Festival Lamps Water Light Reflections */}
        {[12, 23, 35, 47, 56, 66, 76, 88].map((pct, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              top: '4px',
              left: `${pct}%`,
              width: '14px',
              height: '35px',
              background: 'linear-gradient(180deg, rgba(254, 240, 138, 0.6) 0%, rgba(245, 158, 11, 0.2) 60%, transparent 100%)',
              filter: 'blur(3px)',
              animation: `moonShimmer 2.${idx + 2}s ease-in-out infinite alternate`,
            }}
          />
        ))}

        {/* ── Continuous Flowing Wave Band 1: Far Water (Slow, Deep Indigo) ── */}
        <div style={{
          position: 'absolute',
          top: '30px',
          left: 0,
          width: '2880px',
          height: '55px',
          animation: 'waveScrollLeft 24s linear infinite',
          opacity: 0.5,
        }}>
          <svg viewBox="0 0 2880 55" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
            <path
              d="M 0 20 Q 120 35 240 20 T 480 20 T 720 20 T 960 20 T 1200 20 T 1440 20 T 1680 20 T 1920 20 T 2160 20 T 2400 20 T 2640 20 T 2880 20 L 2880 55 L 0 55 Z"
              fill="#1e40af"
              fillOpacity="0.35"
            />
            <path
              d="M 0 20 Q 120 35 240 20 T 480 20 T 720 20 T 960 20 T 1200 20 T 1440 20 T 1680 20 T 1920 20 T 2160 20 T 2400 20 T 2640 20 T 2880 20"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeOpacity="0.6"
            />
          </svg>
        </div>

        {/* ── Continuous Flowing Wave Band 2: Mid Water (Medium Cerulean) ── */}
        <div style={{
          position: 'absolute',
          top: '145px',
          left: 0,
          width: '2880px',
          height: '65px',
          animation: 'waveScrollLeft 16s linear infinite',
          opacity: 0.55,
        }}>
          <svg viewBox="0 0 2880 65" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
            <path
              d="M 0 25 Q 180 45 360 25 T 720 25 T 1080 25 T 1440 25 T 1800 25 T 2160 25 T 2520 25 T 2880 25 L 2880 65 L 0 65 Z"
              fill="#0284c7"
              fillOpacity="0.32"
            />
            <path
              d="M 0 25 Q 180 45 360 25 T 720 25 T 1080 25 T 1440 25 T 1800 25 T 2160 25 T 2520 25 T 2880 25"
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="1.8"
              strokeOpacity="0.65"
            />
          </svg>
        </div>

        {/* ── Moonlight Specular Reflection Path down River (Aligned to Moon at left: 27%) ── */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '27%',
          transform: 'translateX(-50%)',
          width: '280px',
          pointerEvents: 'none',
        }}>
          {/* Radial Light Falloff */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 15%, rgba(254, 243, 199, 0.22) 0%, rgba(254, 240, 138, 0.05) 55%, transparent 80%)',
            filter: 'blur(14px)',
          }} />

          {/* Golden Glistening Water Shimmer Ripple Bars */}
          {[
            { w: 32, y: 12, d: '0s', dur: '2.4s' },
            { w: 48, y: 35, d: '0.6s', dur: '3.1s' },
            { w: 72, y: 65, d: '1.2s', dur: '2.8s' },
            { w: 96, y: 100, d: '0.4s', dur: '3.3s' },
            { w: 124, y: 140, d: '1.6s', dur: '2.7s' },
            { w: 155, y: 185, d: '0.9s', dur: '3.2s' },
            { w: 188, y: 235, d: '1.4s', dur: '2.9s' },
            { w: 220, y: 285, d: '0.5s', dur: '3.5s' },
          ].map((bar, idx) => (
            <div
              key={idx}
              style={{
                position: 'absolute',
                top: `${bar.y}px`,
                left: '50%',
                transform: 'translateX(-50%)',
                width: `${bar.w}px`,
                height: '3.5px',
                borderRadius: '50%',
                background: 'linear-gradient(90deg, transparent 0%, rgba(254, 243, 199, 0.3) 15%, rgba(254, 240, 138, 0.95) 50%, rgba(254, 243, 199, 0.3) 85%, transparent 100%)',
                boxShadow: '0 0 10px rgba(254, 240, 138, 0.75), 0 0 20px rgba(245, 158, 11, 0.35)',
                animation: `moonShimmer ${bar.dur} ease-in-out infinite alternate`,
                animationDelay: bar.d,
              }}
            />
          ))}
        </div>

        {/* ── Flowing Water Ripple Streaks Drifting with Current ── */}
        {[
          { top: '55px', left: '15%', w: '120px', dur: '9s', d: '0s' },
          { top: '85px', left: '60%', w: '160px', dur: '12s', d: '2s' },
          { top: '145px', left: '30%', w: '140px', dur: '8s', d: '1s' },
          { top: '195px', left: '75%', w: '180px', dur: '11s', d: '3s' },
          { top: '245px', left: '20%', w: '150px', dur: '7s', d: '1.5s' },
          { top: '290px', left: '50%', w: '190px', dur: '10s', d: '4s' },
        ].map((rip, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              top: rip.top,
              left: rip.left,
              width: rip.w,
              height: '2px',
              borderRadius: '50%',
              background: 'linear-gradient(90deg, transparent 0%, rgba(56, 189, 248, 0.45) 50%, transparent 100%)',
              filter: 'blur(0.5px)',
              animation: `waterCurrentDrift ${rip.dur} linear infinite`,
              animationDelay: rip.d,
            }}
          />
        ))}

        {/* ── Continuous Flowing Wave Band 3: Near Water (Faster, Crisp Azure Highlights) ── */}
        <div style={{
          position: 'absolute',
          top: '225px',
          left: 0,
          width: '2880px',
          height: '75px',
          animation: 'waveScrollLeft 10s linear infinite',
          opacity: 0.65,
        }}>
          <svg viewBox="0 0 2880 75" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
            <path
              d="M 0 30 Q 240 55 480 30 T 960 30 T 1440 30 T 1920 30 T 2400 30 T 2880 30 L 2880 75 L 0 75 Z"
              fill="#0369a1"
              fillOpacity="0.4"
            />
            <path
              d="M 0 30 Q 240 55 480 30 T 960 30 T 1440 30 T 1920 30 T 2400 30 T 2880 30"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.2"
              strokeOpacity="0.8"
            />
          </svg>
        </div>

        {/* ── Near Shore Water Foam & Foreground Embankment Edge ── */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50px',
          background: 'linear-gradient(0deg, rgba(2, 6, 18, 0.98) 0%, rgba(4, 15, 36, 0.6) 60%, transparent 100%)',
          borderBottom: '2px solid rgba(56, 189, 248, 0.25)',
        }} />

        {/* Left Shore Floating Lotus Lily Pads */}
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '20px',
          opacity: 0.8,
          animation: 'lotusBob 5s ease-in-out infinite alternate',
        }}>
          <svg width="84" height="42" viewBox="0 0 84 42">
            <ellipse cx="36" cy="22" rx="32" ry="14" fill="#064e3b" stroke="#059669" strokeWidth="1.5" />
            <path d="M 36 22 L 64 28" stroke="#022c22" strokeWidth="2" />
            <ellipse cx="64" cy="14" rx="16" ry="8" fill="#047857" opacity="0.85" />
          </svg>
        </div>

        {/* Right Shore Floating Lotus Lily Pads */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '25px',
          opacity: 0.75,
          animation: 'lotusBob 6s ease-in-out infinite alternate 1.2s',
        }}>
          <svg width="76" height="38" viewBox="0 0 76 38">
            <ellipse cx="38" cy="20" rx="30" ry="12" fill="#064e3b" stroke="#059669" strokeWidth="1.5" />
            <path d="M 38 20 L 60 14" stroke="#022c22" strokeWidth="2" />
          </svg>
        </div>
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
        height: '340px',
        zIndex: 10,
        pointerEvents: 'none',
      }}>
        {[...firestoreKrathongs]
          .sort((a, b) => {
            const laneA = (krathongPositionsRef.current.get(a.id)?.lane ?? (a.lane !== undefined ? a.lane % 4 : 1)) % 4
            const laneB = (krathongPositionsRef.current.get(b.id)?.lane ?? (b.lane !== undefined ? b.lane % 4 : 1)) % 4
            return laneA - laneB
          })
          .map((k) => {
            const pos = krathongPositionsRef.current.get(k.id) || { x: 500, lane: 1, bobOffset: 0 }
            const lane = pos.lane !== undefined ? pos.lane % 4 : (k.lane !== undefined ? k.lane % 4 : 1)
            const cfg = LANE_CONFIG[lane] || LANE_CONFIG[1]

            // 4 Depth Levels Configuration: Strictly separated bottom Y and perspective scale
            const laneBottom = cfg.bottom
            const laneScale = (k.scale || 0.85) * cfg.scaleMult * 1.5

            // Strict z-index discipline: Lane 0 (11-12) < Lane 1 (13-14) < Lane 2 (15-16) < Lane 3 (17-18)
            // Distant krathongs NEVER jump in front of foreground krathongs
            const isWishOpen = activeWishIds.has(k.id)
            const itemZIndex = isWishOpen ? cfg.baseZIndex + 1 : cfg.baseZIndex

            // Real-time gentle sinusoidal bobbing & tilting
            const timeSec = performance.now() / 1000
            const bobFreq = k.bobFreq || 1.4
            const bobAmp = k.bobAmp || 4
            const offsetY = Math.sin(timeSec * bobFreq + pos.bobOffset) * bobAmp
            const rotateDeg = Math.sin(timeSec * bobFreq + pos.bobOffset) * 2.2

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
                  zIndex: itemZIndex,
                  transition: 'filter 0.2s',
                  filter: isWishOpen ? 'drop-shadow(0 0 20px rgba(254, 240, 138, 0.95))' : 'none',
                }}
              >
              {/* Krathong Body (Exact User Drawing Canvas Image) with Water Effects Directly Underneath */}
              <div style={{
                width: '130px',
                height: '110px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}>
                {/* Floating Candle Light Water Halo (Directly at base of Krathong) */}
                <div style={{
                  position: 'absolute',
                  bottom: '2px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '110px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'radial-gradient(ellipse, rgba(245, 158, 11, 0.45) 0%, transparent 70%)',
                  filter: 'blur(6px)',
                  pointerEvents: 'none',
                  zIndex: 0,
                }} />

                {/* Concentric Water Wave Ring Expanding Underneath Krathong Base */}
                <div style={{
                  position: 'absolute',
                  bottom: '4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '120px',
                  height: '26px',
                  borderRadius: '50%',
                  border: '1px solid rgba(56, 189, 248, 0.45)',
                  background: 'radial-gradient(ellipse, rgba(245, 158, 11, 0.3) 0%, rgba(56, 189, 248, 0.1) 45%, transparent 75%)',
                  filter: 'blur(1px)',
                  pointerEvents: 'none',
                  animation: 'krathongWaterWake 2.6s ease-out infinite',
                  zIndex: 0,
                }} />

                {/* Water Candle Flame Reflection Beam Trailing Down Into River from Krathong */}
                <div style={{
                  position: 'absolute',
                  bottom: '-24px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '26px',
                  height: '38px',
                  background: 'linear-gradient(180deg, rgba(254, 240, 138, 0.6) 0%, rgba(245, 158, 11, 0.3) 45%, transparent 100%)',
                  filter: 'blur(3px)',
                  pointerEvents: 'none',
                  animation: 'candleFlicker 1.5s ease-in-out infinite alternate',
                  zIndex: 0,
                }} />

                {k.imageData && (
                  <img
                    src={k.imageData}
                    alt={k.name}
                    style={{
                      maxWidth: '120px',
                      maxHeight: '100px',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.65))',
                      position: 'relative',
                      zIndex: 1,
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
                  zIndex: 2,
                }} />
              </div>

              {/* Owner Name Tag directly below Krathong (Amber Glowing Capsule Pill) */}
              <div style={{
                marginTop: '6px',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                position: 'relative',
                zIndex: 3,
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#111827',
                  borderRadius: '9999px',
                  padding: '3px 12px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  boxShadow: isWishOpen
                    ? '0 0 20px rgba(245, 158, 11, 0.95), 0 2px 8px rgba(0, 0, 0, 0.6)'
                    : '0 0 14px rgba(245, 158, 11, 0.65), 0 2px 6px rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(254, 240, 138, 0.5)',
                  letterSpacing: '0.02em',
                }}>
                  <i className="fas fa-leaf" style={{ fontSize: '9.5px', color: '#111827' }} />
                  {k.name}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Layer 5: Wish Modal Cards (Centered above Krathong with Pointer Caret) ── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '340px',
        zIndex: 35,
        pointerEvents: 'none',
      }}>
        {Array.from(activeWishIds).map((id) => {
          const k = firestoreKrathongs.find((item) => item.id === id)
          if (!k) return null
          const pos = krathongPositionsRef.current.get(k.id)
          if (!pos) return null

          const lane = pos.lane !== undefined ? pos.lane % 4 : (k.lane !== undefined ? k.lane % 4 : 1)
          const cfg = LANE_CONFIG[lane] || LANE_CONFIG[1]
          const laneBottom = cfg.bottom
          const laneScale = (k.scale || 0.85) * cfg.scaleMult * 1.5

          const timeSec = performance.now() / 1000
          const bobFreq = k.bobFreq || 1.4
          const bobAmp = k.bobAmp || 4
          const offsetY = Math.sin(timeSec * bobFreq + pos.bobOffset) * bobAmp

          // Calculate real-time unscaled position over the Krathong:
          const bubbleX = pos.x + 65
          const bubbleBottom = laneBottom + offsetY + (105 * laneScale) + 12

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
                zIndex: 35,
                animation: 'bubbleAppear 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                cursor: 'pointer',
              }}
            >
              {/* Translucent Frosted Glass Card: Pure Wish Text Only, Fixed Readable Font */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1.5px solid rgba(254, 240, 138, 0.45)',
                borderRadius: '12px',
                padding: '10px 18px',
                width: 'max-content',
                maxWidth: 'min(280px, 85vw)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65), 0 0 16px rgba(245, 158, 11, 0.25)',
                position: 'relative',
                textAlign: 'center',
              }}>
                {/* Downward Pointer Triangle */}
                <div style={{
                  position: 'absolute',
                  bottom: '-6px',
                  left: '50%',
                  transform: 'translateX(-50%) rotate(45deg)',
                  width: '10px',
                  height: '10px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  borderRight: '1.5px solid rgba(254, 240, 138, 0.45)',
                  borderBottom: '1.5px solid rgba(254, 240, 138, 0.45)',
                }} />

                {/* Wish Text: Unscaled, Clear and Legible at any distance */}
                <div style={{
                  fontSize: '13.5px',
                  fontWeight: 700,
                  color: '#ffffff',
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.95)',
                  letterSpacing: '0.01em',
                }}>
                  {k.wish}
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
        background: 'linear-gradient(180deg, rgba(5, 8, 20, 0.6) 0%, transparent 100%)',
        pointerEvents: 'none',
      }}>
        {/* Left: Navigation Buttons (Back to /Krathong & Home) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
          <button
            type="button"
            onClick={() => showPage('krathong')}
            title="ย้อนกลับไปหน้าวาดกระทง (/Krathong)"
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
          >
            <i className="fas fa-arrow-left" /> กลับ
          </button>

          <button
            type="button"
            onClick={() => showPage('home')}
            title="กลับสู่หน้าหลัก SOFUN (Home)"
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
          >
            <i className="fas fa-house" /> หน้าแรก
          </button>
        </div>

        {/* Right: Sound Toggle Button Only */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
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
        @keyframes waveScrollLeft {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-1440px, 0, 0); }
        }
        @keyframes moonShimmer {
          0% { transform: translateX(-50%) scaleX(0.8); opacity: 0.55; }
          50% { transform: translateX(-50%) scaleX(1.15); opacity: 0.95; }
          100% { transform: translateX(-50%) scaleX(0.88); opacity: 0.65; }
        }
        @keyframes templeReflectionUndulate {
          0% { transform: translateX(-50%) scaleX(0.92) skewX(-2deg); opacity: 0.65; }
          100% { transform: translateX(-50%) scaleX(1.12) skewX(2.5deg); opacity: 0.95; }
        }
        @keyframes waterCurrentDrift {
          0% { transform: translate3d(80px, 0, 0); opacity: 0; }
          25% { opacity: 0.65; }
          75% { opacity: 0.65; }
          100% { transform: translate3d(-180px, 0, 0); opacity: 0; }
        }
        @keyframes lotusBob {
          0% { transform: translateY(0) rotate(-1.5deg); }
          100% { transform: translateY(-4px) rotate(2deg); }
        }
        @keyframes krathongWaterWake {
          0% { transform: translateX(-50%) scale(0.75); opacity: 0.8; }
          50% { transform: translateX(-50%) scale(1.08); opacity: 0.45; }
          100% { transform: translateX(-50%) scale(1.35); opacity: 0; }
        }
        @keyframes candleFlicker {
          0% { transform: translateX(-50%) scale(1); opacity: 0.9; }
          50% { transform: translateX(-48%) scale(1.15); opacity: 1; }
          100% { transform: translateX(-52%) scale(0.95); opacity: 0.85; }
        }
        @keyframes bubbleAppear {
          0% { transform: translateX(-50%) translateY(8px) scale(0.92); opacity: 0; }
          100% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
        }
        @keyframes fireworkBurst {
          0% { transform: scale(0.2); opacity: 0; }
          15% { transform: scale(0.85); opacity: 0.95; }
          30% { transform: scale(1.08); opacity: 0.85; }
          65% { transform: scale(1.18); opacity: 0; }
          100% { transform: scale(1.18); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
