import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  collection, doc, onSnapshot, getDocs, updateDoc,
  setDoc, addDoc, serverTimestamp, query, orderBy, limit
} from 'firebase/firestore'
import { db } from '../firebase'

// ── Vibrant slice color palette ──────────────────────────────────────────────
const SLICE_COLORS = [
  '#c62419', '#d97706', '#059669', '#2563eb', '#7c3aed',
  '#db2777', '#0891b2', '#ea580c', '#16a34a', '#4f46e5',
  '#9333ea', '#c026d3', '#0284c7', '#ca8a04', '#e11d48',
  '#10b981', '#6366f1', '#f59e0b', '#8b5cf6', '#ec4899',
]

// ── Web Audio Synthesizer (No external assets required) ──────────────────────
class WheelAudio {
  constructor() {
    this.ctx = null
    this.muted = false
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) this.ctx = new AudioCtx()
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
  }

  playTick(pitchRatio = 1) {
    if (this.muted) return
    this.init()
    if (!this.ctx) return
    try {
      const t = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'triangle'
      const freq = Math.min(1200, Math.max(350, 650 * pitchRatio))
      osc.frequency.setValueAtTime(freq, t)
      osc.frequency.exponentialRampToValueAtTime(250, t + 0.025)
      gain.gain.setValueAtTime(0.22, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(t)
      osc.stop(t + 0.03)
    } catch {}
  }

  playFanfare() {
    if (this.muted) return
    this.init()
    if (!this.ctx) return
    try {
      // Triumph fanfare: C5, E5, G5, C6 arpeggio with shimmer
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]
      notes.forEach((freq, i) => {
        const t = this.ctx.currentTime + i * 0.11
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = i === notes.length - 1 ? 'sine' : 'triangle'
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.35, t + 0.04)
        gain.gain.exponentialRampToValueAtTime(0.001, t + (i === notes.length - 1 ? 1.2 : 0.45))
        osc.connect(gain)
        gain.connect(this.ctx.destination)
        osc.start(t)
        osc.stop(t + 1.25)
      })
    } catch {}
  }
}

const wheelAudio = new WheelAudio()

export default function RandomWheelPage({ lineUser, showToast, showPage }) {
  // ── Firestore live states ──────────────────────────────────────────────────
  const [playHistory, setPlayHistory] = useState([])
  const [membersMap, setMembersMap] = useState({})
  const [config, setConfig] = useState({
    lockedWinnerId: null,
    removedUserIds: [],
    oneShotLock: true,
    removeWinnerMode: 'ask', // 'ask' | 'auto_remove' | 'auto_keep'
    dateFilter: 'all',
  })
  const [manualParticipants, setManualParticipants] = useState([])
  const [winnerHistory, setWinnerHistory] = useState([])
  const [loading, setLoading] = useState(true)

  // ── Animation & wheel physics states ───────────────────────────────────────
  const [isSpinning, setIsSpinning] = useState(false)
  const [currentWinner, setCurrentWinner] = useState(null)
  const [showWinnerModal, setShowWinnerModal] = useState(false)
  const [needleTick, setNeedleTick] = useState(false)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [activeTab, setActiveTab] = useState('candidates') // candidates | removed | history | settings

  // Manual entry form
  const [newManualName, setNewManualName] = useState('')
  const [newManualTickets, setNewManualTickets] = useState(1)

  // Canvas refs
  const canvasRef = useRef(null)
  const confettiCanvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const confettiFrameRef = useRef(null)

  // Physical angle tracking
  const rotationRef = useRef(0)
  const lastSliceIndexRef = useRef(-1)
  const lastProcessedSpinCommand = useRef(null)

  const isAdmin = lineUser?.role === 'admin' || lineUser?.role === 'super_admin'

  // ── Toggle Audio ───────────────────────────────────────────────────────────
  const toggleMute = () => {
    wheelAudio.muted = !wheelAudio.muted
    setMuted(wheelAudio.muted)
  }

  // ── Toggle Fullscreen ──────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // ── Sync with Firestore ────────────────────────────────────────────────────
  useEffect(() => {
    // 1. Wheel Config
    const unsubConfig = onSnapshot(doc(db, 'wheelSettings', 'config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setConfig(prev => ({ ...prev, ...data }))

        // Check remote spin command from Admin
        if (data.spinCommand && data.spinCommand.trigger) {
          const cmdTime = data.spinCommand.timestamp
          const now = Date.now()
          if (
            cmdTime &&
            now - cmdTime < 10000 &&
            lastProcessedSpinCommand.current !== data.spinCommand.id
          ) {
            lastProcessedSpinCommand.current = data.spinCommand.id
            if (!isSpinning) {
              startSpin(data.spinCommand.targetWinnerId || data.lockedWinnerId)
            }
          }
        }
      } else {
        // initialize default config doc if not present
        setDoc(doc(db, 'wheelSettings', 'config'), {
          lockedWinnerId: null,
          removedUserIds: [],
          oneShotLock: true,
          removeWinnerMode: 'ask',
          dateFilter: 'all',
          updatedAt: serverTimestamp(),
        }).catch(() => {})
      }
    })

    // 2. Play History
    const unsubHistory = onSnapshot(collection(db, 'playHistory'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setPlayHistory(list)
      setLoading(false)
    })

    // 3. Members lookup
    const unsubMembers = onSnapshot(collection(db, 'members'), (snap) => {
      const map = {}
      snap.docs.forEach(d => {
        map[d.id] = { id: d.id, ...d.data() }
      })
      setMembersMap(map)
    })

    // 4. Winner History
    const qWin = query(collection(db, 'wheelHistory'), orderBy('wonAt', 'desc'), limit(30))
    const unsubWin = onSnapshot(qWin, (snap) => {
      setWinnerHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return () => {
      unsubConfig()
      unsubHistory()
      unsubMembers()
      unsubWin()
    }
  }, [isSpinning])

  // ── Aggregate Candidates ───────────────────────────────────────────────────
  const candidates = useMemo(() => {
    // Count plays per customer
    const userPlays = {}
    const userDetails = {}

    // 1. From playHistory
    playHistory.forEach(ph => {
      // Filter by date if configured
      if (config.dateFilter === 'today') {
        if (!ph.playedAt) return
        const pDate = ph.playedAt.toDate ? ph.playedAt.toDate() : new Date(ph.playedAt)
        const today = new Date()
        if (pDate.toDateString() !== today.toDateString()) return
      } else if (config.dateFilter === 'month') {
        if (!ph.playedAt) return
        const pDate = ph.playedAt.toDate ? ph.playedAt.toDate() : new Date(ph.playedAt)
        const today = new Date()
        if (pDate.getMonth() !== today.getMonth() || pDate.getFullYear() !== today.getFullYear()) return
      }

      const uid = ph.userId || ph.userName || 'unknown'
      userPlays[uid] = (userPlays[uid] || 0) + 1
      if (!userDetails[uid]) {
        userDetails[uid] = {
          id: uid,
          name: ph.userName || 'ลูกค้า',
          avatar: ph.userAvatar || '',
        }
      }
    })

    // Merge with members profile info for accurate photo / nickname
    Object.keys(userPlays).forEach(uid => {
      const mem = membersMap[uid]
      if (mem) {
        userDetails[uid] = {
          ...userDetails[uid],
          name: mem.nickname || mem.firstname || mem.name || userDetails[uid].name,
          fullName: [mem.firstname, mem.lastname].filter(Boolean).join(' ') || mem.name || '',
          avatar: mem.pictureUrl || userDetails[uid].avatar,
          tel_no: mem.tel_no || '',
          role: mem.role || 'member',
        }
      }
    })

    // 2. Add manual participants
    manualParticipants.forEach(mp => {
      userPlays[mp.id] = (userPlays[mp.id] || 0) + (mp.tickets || 1)
      userDetails[mp.id] = {
        id: mp.id,
        name: mp.name,
        fullName: mp.name,
        avatar: mp.avatar || '',
        isManual: true,
      }
    })

    const removedSet = new Set(config.removedUserIds || [])

    // Transform into candidates list
    const list = Object.keys(userPlays)
      .map(uid => {
        const tickets = userPlays[uid]
        const details = userDetails[uid] || { id: uid, name: uid, avatar: '' }
        return {
          id: uid,
          name: details.name || uid,
          fullName: details.fullName || details.name || uid,
          avatar: details.avatar || '',
          tel_no: details.tel_no || '',
          tickets,
          isRemoved: removedSet.has(uid),
          isManual: !!details.isManual,
        }
      })
      .filter(c => !c.isRemoved && c.tickets > 0)
      .sort((a, b) => b.tickets - a.tickets)

    const totalTickets = list.reduce((sum, c) => sum + c.tickets, 0)

    // Assign color, slice angles and percentages
    let currentAngle = 0
    return list.map((c, index) => {
      const weight = c.tickets
      const sliceAngle = totalTickets > 0 ? (weight / totalTickets) * 360 : 360 / Math.max(1, list.length)
      const startAngle = currentAngle
      const endAngle = currentAngle + sliceAngle
      currentAngle = endAngle

      return {
        ...c,
        color: SLICE_COLORS[index % SLICE_COLORS.length],
        sliceAngle,
        startAngle,
        endAngle,
        midAngle: (startAngle + endAngle) / 2,
        chance: totalTickets > 0 ? ((weight / totalTickets) * 100).toFixed(1) : 0,
      }
    })
  }, [playHistory, membersMap, manualParticipants, config.removedUserIds, config.dateFilter])

  const totalActiveTickets = useMemo(() => candidates.reduce((s, c) => s + c.tickets, 0), [candidates])

  // ── Removed candidates list ────────────────────────────────────────────────
  const removedCandidates = useMemo(() => {
    const removedSet = new Set(config.removedUserIds || [])
    if (removedSet.size === 0) return []

    const list = []
    removedSet.forEach(uid => {
      const mem = membersMap[uid]
      const manual = manualParticipants.find(m => m.id === uid)
      const ph = playHistory.find(p => p.userId === uid || p.userName === uid)
      const name = mem?.nickname || mem?.firstname || manual?.name || ph?.userName || uid
      const avatar = mem?.pictureUrl || manual?.avatar || ph?.userAvatar || ''
      list.push({ id: uid, name, avatar })
    })
    return list
  }, [config.removedUserIds, membersMap, manualParticipants, playHistory])

  // ── Draw Wheel on Canvas ───────────────────────────────────────────────────
  const drawWheel = useCallback((rotationDeg = rotationRef.current) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = canvas.width
    const center = size / 2
    const radius = center - 24

    ctx.clearRect(0, 0, size, size)

    // Draw background shadow
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 32
    ctx.beginPath()
    ctx.arc(center, center, radius + 12, 0, Math.PI * 2)
    ctx.fillStyle = '#09090f'
    ctx.fill()
    ctx.restore()

    // Outer Rim with Gold Border & Metallic Sheen
    ctx.save()
    const rimGrad = ctx.createLinearGradient(0, 0, size, size)
    rimGrad.addColorStop(0, '#c8a050')
    rimGrad.addColorStop(0.3, '#f5d77f')
    rimGrad.addColorStop(0.5, '#c62419')
    rimGrad.addColorStop(0.7, '#f5d77f')
    rimGrad.addColorStop(1, '#9a1c13')
    ctx.beginPath()
    ctx.arc(center, center, radius + 10, 0, Math.PI * 2)
    ctx.lineWidth = 12
    ctx.strokeStyle = rimGrad
    ctx.stroke()
    ctx.restore()

    // Outer decorative studs (36 LEDs / pegs around the rim)
    const numStuds = 36
    for (let i = 0; i < numStuds; i++) {
      const a = (i * (360 / numStuds) * Math.PI) / 180
      const sx = center + (radius + 10) * Math.cos(a)
      const sy = center + (radius + 10) * Math.sin(a)
      ctx.save()
      ctx.beginPath()
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = i % 2 === 0 ? '#fff' : '#fbbf24'
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 6
      ctx.fill()
      ctx.restore()
    }

    if (candidates.length === 0) {
      // Empty wheel message
      ctx.save()
      ctx.beginPath()
      ctx.arc(center, center, radius, 0, Math.PI * 2)
      ctx.fillStyle = '#141420'
      ctx.fill()
      ctx.fillStyle = '#888'
      ctx.font = "bold 20px 'Sarabun', sans-serif"
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('ยังไม่มีรายชื่อผู้เล่น', center, center - 12)
      ctx.font = "14px 'Sarabun', sans-serif"
      ctx.fillStyle = '#555'
      ctx.fillText('สแกน QR หรือเพิ่มชื่อเพื่อเริ่มสุ่ม', center, center + 18)
      ctx.restore()
      return
    }

    // ── Rotate Wheel Context ─────────────────────────────────────────────────
    ctx.save()
    ctx.translate(center, center)
    ctx.rotate((rotationDeg * Math.PI) / 180)

    // Draw Slices
    candidates.forEach((cand) => {
      const startRad = (cand.startAngle * Math.PI) / 180
      const endRad = (cand.endAngle * Math.PI) / 180

      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, radius, startRad, endRad)
      ctx.closePath()

      // Gradient slice for depth
      const sliceGrad = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius)
      sliceGrad.addColorStop(0, cand.color)
      sliceGrad.addColorStop(0.85, cand.color)
      sliceGrad.addColorStop(1, '#00000035')
      ctx.fillStyle = sliceGrad
      ctx.fill()

      // Slice border
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.stroke()

      // ── Slice Text & Badge ─────────────────────────────────────────────────
      ctx.save()
      const midRad = (cand.midAngle * Math.PI) / 180
      ctx.rotate(midRad)

      // Position text outwards
      const textDist = radius * 0.68
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.85)'
      ctx.shadowBlur = 4

      // Dynamic font size based on slice count
      const isNarrow = cand.sliceAngle < 18
      const fontSize = isNarrow ? 12 : Math.min(18, Math.max(13, cand.sliceAngle * 0.75))
      ctx.font = `bold ${fontSize}px 'Sarabun', sans-serif`

      // Name label
      let label = cand.name
      if (label.length > (isNarrow ? 8 : 13)) {
        label = label.slice(0, isNarrow ? 7 : 12) + '…'
      }

      ctx.fillText(label, textDist, 0)

      // Tickets pill / chance text
      if (!isNarrow && cand.sliceAngle >= 24) {
        ctx.font = `800 11px 'Barlow Condensed', sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(`🎟️ x${cand.tickets} (${cand.chance}%)`, textDist, fontSize + 3)
      }

      ctx.restore()
    })

    ctx.restore() // End of rotated wheel

    // ── Center Hub / Medallion ───────────────────────────────────────────────
    ctx.save()
    // Hub outer shadow
    ctx.shadowColor = 'rgba(0,0,0,0.65)'
    ctx.shadowBlur = 18
    ctx.beginPath()
    ctx.arc(center, center, 48, 0, Math.PI * 2)
    ctx.fillStyle = '#09090f'
    ctx.fill()

    // Hub gold border
    const hubGold = ctx.createLinearGradient(center - 48, center - 48, center + 48, center + 48)
    hubGold.addColorStop(0, '#c8a050')
    hubGold.addColorStop(0.5, '#f5d77f')
    hubGold.addColorStop(1, '#9a1c13')
    ctx.lineWidth = 4
    ctx.strokeStyle = hubGold
    ctx.stroke()

    // Hub crimson core
    ctx.beginPath()
    ctx.arc(center, center, 42, 0, Math.PI * 2)
    ctx.fillStyle = '#c62419'
    ctx.fill()

    // Hub text / Logo
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = "900 19px 'Barlow Condensed', sans-serif"
    ctx.fillText('SOFUN', center, center - 7)
    ctx.font = "800 10px 'Sarabun', sans-serif"
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText('LUCKY', center, center + 9)
    ctx.restore()

    // ── Top Needle / Pointer Indicator (at 12 o'clock / angle 270°) ───────────
    ctx.save()
    const pointerSize = 28
    const topY = 12

    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = 8

    ctx.beginPath()
    // Triangular needle pointing down towards the rim
    ctx.moveTo(center - 14, topY)
    ctx.lineTo(center + 14, topY)
    ctx.lineTo(center, topY + pointerSize + (needleTick ? 4 : 0))
    ctx.closePath()

    const ptrGrad = ctx.createLinearGradient(center - 14, topY, center + 14, topY + pointerSize)
    ptrGrad.addColorStop(0, '#f5d77f')
    ptrGrad.addColorStop(0.5, '#c8a050')
    ptrGrad.addColorStop(1, '#b45309')
    ctx.fillStyle = ptrGrad
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()

    // Pin circle at needle base
    ctx.beginPath()
    ctx.arc(center, topY + 4, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#c62419'
    ctx.fill()
    ctx.strokeStyle = '#f5d77f'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }, [candidates, needleTick])

  // Redraw whenever candidates change or tick changes
  useEffect(() => {
    drawWheel()
  }, [drawWheel])

  // ── Find Slice under Top Needle (at 270° / 12 o'clock) ──────────────────────
  const getSliceUnderNeedle = useCallback((rotationDeg) => {
    if (candidates.length === 0) return null
    // In Canvas, 0 deg is 3 o'clock. Top pointer is at 270° (or -90°).
    // As wheel rotates clockwise by R degrees, a point originally at angle theta is now at (theta + R).
    // Therefore, the slice currently at top pointer has original angle theta = (270 - R) mod 360.
    const normalizedAngle = ((270 - (rotationDeg % 360)) + 360) % 360
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]
      if (normalizedAngle >= c.startAngle && normalizedAngle < c.endAngle) {
        return { candidate: c, index: i }
      }
    }
    return { candidate: candidates[0], index: 0 }
  }, [candidates])

  // ── Start Spin Function (Supports Locked Winner Rigging) ───────────────────
  const startSpin = useCallback(async (forcedWinnerId = null) => {
    if (isSpinning || candidates.length === 0) return
    setIsSpinning(true)
    setShowWinnerModal(false)
    wheelAudio.init()

    // 1. Determine Winner
    const targetLockedId = forcedWinnerId || config.lockedWinnerId
    let winner = null

    if (targetLockedId) {
      winner = candidates.find(c => c.id === targetLockedId)
    }

    if (!winner) {
      // Fair weighted random draw based on tickets count
      const totalTickets = candidates.reduce((s, c) => s + c.tickets, 0)
      let rand = Math.random() * totalTickets
      for (const c of candidates) {
        if (rand < c.tickets) {
          winner = c
          break
        }
        rand -= c.tickets
      }
      if (!winner) winner = candidates[0]
    }

    // 2. Calculate Target Rotation to land squarely inside winner's slice
    // Random jitter within the slice: ±35% of half-angle
    const halfSpan = winner.sliceAngle / 2
    const jitter = (Math.random() - 0.5) * (halfSpan * 0.7)
    const targetSliceAngle = winner.midAngle + jitter

    // To place targetSliceAngle under 270° pointer:
    // (270 - R) mod 360 = targetSliceAngle => R mod 360 = (270 - targetSliceAngle) mod 360
    const desiredFinalMod = ((270 - targetSliceAngle) % 360 + 360) % 360

    const currentRot = rotationRef.current
    const currentMod = ((currentRot % 360) + 360) % 360
    let delta = (desiredFinalMod - currentMod + 360) % 360

    // Add 6 to 9 full spins for suspense and speed
    const fullSpins = (6 + Math.floor(Math.random() * 3)) * 360
    const totalRotationDelta = fullSpins + delta
    const targetRotation = currentRot + totalRotationDelta

    // 3. Realistic Ease-Out Physics (6.5 seconds duration)
    const duration = 6500
    const startTime = performance.now()
    const startRot = currentRot

    // Ease-out cubic function with smooth deceleration
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4)

    lastSliceIndexRef.current = -1

    const animate = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / duration)
      const easedProgress = easeOutQuart(progress)

      const curRot = startRot + totalRotationDelta * easedProgress
      rotationRef.current = curRot

      // Check peg crossing for needle audio tick & visual bounce
      const sliceInfo = getSliceUnderNeedle(curRot)
      if (sliceInfo && sliceInfo.index !== lastSliceIndexRef.current) {
        lastSliceIndexRef.current = sliceInfo.index
        setNeedleTick(true)
        setTimeout(() => setNeedleTick(false), 30)

        // Pitch gets lower as the wheel slows down
        const speedRatio = 1 - progress
        wheelAudio.playTick(0.6 + speedRatio * 0.7)
      }

      drawWheel(curRot)

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate)
      } else {
        // Spin finished!
        setIsSpinning(false)
        setCurrentWinner(winner)
        setShowWinnerModal(true)
        wheelAudio.playFanfare()
        launchConfetti()

        // Record winner in wheelHistory
        addDoc(collection(db, 'wheelHistory'), {
          winnerId: winner.id,
          winnerName: winner.name,
          winnerAvatar: winner.avatar || '',
          tickets: winner.tickets,
          chance: winner.chance,
          wonAt: serverTimestamp(),
          keptInWheel: true,
        }).catch(() => {})

        // Handle one-shot lock reset
        if (config.oneShotLock && config.lockedWinnerId) {
          updateDoc(doc(db, 'wheelSettings', 'config'), {
            lockedWinnerId: null,
            updatedAt: serverTimestamp(),
          }).catch(() => {})
        }

        // Handle auto-remove if configured
        if (config.removeWinnerMode === 'auto_remove') {
          handleRemoveFromWheel(winner.id, false)
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(animate)
  }, [isSpinning, candidates, config, getSliceUnderNeedle, drawWheel])

  // ── Confetti Particle Celebration Effect ───────────────────────────────────
  const launchConfetti = () => {
    const canvas = confettiCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles = []
    const colors = ['#c62419', '#fbbf24', '#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#ffffff']

    for (let i = 0; i < 180; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 60,
        y: canvas.height / 2 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 22,
        vy: (Math.random() - 0.75) * 26,
        size: Math.random() * 9 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 14,
        alpha: 1,
        shape: Math.random() > 0.4 ? 'rect' : 'circle',
      })
    }

    const startTime = performance.now()
    const renderConfetti = (now) => {
      const elapsed = now - startTime
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      let alive = false
      particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.48 // gravity
        p.vx *= 0.985 // drag
        p.rotation += p.vr
        if (elapsed > 2000) {
          p.alpha -= 0.012
        }

        if (p.alpha > 0.01 && p.y < canvas.height + 50) {
          alive = true
          ctx.save()
          ctx.globalAlpha = Math.max(0, p.alpha)
          ctx.translate(p.x, p.y)
          ctx.rotate((p.rotation * Math.PI) / 180)
          ctx.fillStyle = p.color
          if (p.shape === 'rect') {
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
          } else {
            ctx.beginPath()
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.restore()
        }
      })

      if (alive && elapsed < 6000) {
        confettiFrameRef.current = requestAnimationFrame(renderConfetti)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    if (confettiFrameRef.current) cancelAnimationFrame(confettiFrameRef.current)
    confettiFrameRef.current = requestAnimationFrame(renderConfetti)
  }

  // ── Remove from Wheel Action ───────────────────────────────────────────────
  const handleRemoveFromWheel = async (userId, notify = true) => {
    try {
      const currentRemoved = Array.isArray(config.removedUserIds) ? config.removedUserIds : []
      if (!currentRemoved.includes(userId)) {
        const nextRemoved = [...currentRemoved, userId]
        await updateDoc(doc(db, 'wheelSettings', 'config'), {
          removedUserIds: nextRemoved,
          updatedAt: serverTimestamp(),
        })
        if (notify) showToast('นำรายชื่อออกจากวงล้อเรียบร้อยแล้ว')
      }
      setShowWinnerModal(false)
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  // ── Restore to Wheel Action ────────────────────────────────────────────────
  const handleRestoreToWheel = async (userId) => {
    try {
      const currentRemoved = Array.isArray(config.removedUserIds) ? config.removedUserIds : []
      const nextRemoved = currentRemoved.filter(id => id !== userId)
      await updateDoc(doc(db, 'wheelSettings', 'config'), {
        removedUserIds: nextRemoved,
        updatedAt: serverTimestamp(),
      })
      showToast('คืนสิทธิ์กลับเข้าวงล้อแล้ว')
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  // ── Update Rigged / Locked Winner ──────────────────────────────────────────
  const handleSetLockedWinner = async (targetId) => {
    try {
      await updateDoc(doc(db, 'wheelSettings', 'config'), {
        lockedWinnerId: targetId || null,
        updatedAt: serverTimestamp(),
      })
      showToast(targetId ? '🔒 ตั้งค่าล็อคผลเรียบร้อยแล้ว' : 'ปลดล็อคการสุ่มเรียบร้อยแล้ว')
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    }
  }

  // ── Add Manual Participant ─────────────────────────────────────────────────
  const handleAddManual = (e) => {
    e.preventDefault()
    if (!newManualName.trim()) return
    const id = 'manual_' + Date.now()
    setManualParticipants(prev => [
      ...prev,
      { id, name: newManualName.trim(), tickets: Math.max(1, parseInt(newManualTickets) || 1) }
    ])
    setNewManualName('')
    setNewManualTickets(1)
    showToast(`เพิ่ม ${newManualName} เรียบร้อยแล้ว`)
  }

  // ── Keyboard shortcut: Spacebar to spin ────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !isSpinning && e.target.tagName !== 'INPUT') {
        e.preventDefault()
        startSpin()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [startSpin, isSpinning])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 30%, #171727 0%, #09090f 100%)',
      color: '#fff',
      fontFamily: "'Sarabun', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflowX: 'hidden',
    }}>
      {/* ── TOP NAV BAR ── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(9,9,15,0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => showPage('home')}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', borderRadius: 8, padding: '6px 12px',
              fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <i className="fas fa-chevron-left" /> หน้าหลัก
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: 'var(--crimson-500)', color: '#fff',
              fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 6,
              letterSpacing: '0.05em',
            }}>SOFUN</span>
            <h1 style={{
              fontSize: 18, fontWeight: 900, margin: 0,
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em',
            }}>
              LUCKY WHEEL · วงล้อสุ่มผู้โชคดี
            </h1>
          </div>
        </div>

        {/* Top actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Locked Badge (If active and user is admin) */}
          {isAdmin && config.lockedWinnerId && (
            <div style={{
              background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)',
              color: '#ef4444', fontSize: 11, fontWeight: 800,
              padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <i className="fas fa-lock" /> ล็อคผลรอบนี้
            </div>
          )}

          {/* Sound Toggle */}
          <button
            onClick={toggleMute}
            title={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: muted ? '#888' : '#fbbf24', width: 36, height: 36, borderRadius: 8,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i className={`fas ${muted ? 'fa-volume-mute' : 'fa-volume-up'}`} />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            title="เปิดเต็มจอ (Fullscreen)"
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff', width: 36, height: 36, borderRadius: 8,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}`} />
          </button>

          {/* Toggle Sidebar */}
          <button
            onClick={() => setShowSidebar(o => !o)}
            style={{
              background: showSidebar ? 'var(--crimson-500)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${showSidebar ? 'var(--crimson-500)' : 'rgba(255,255,255,0.15)'}`,
              color: '#fff', padding: '7px 14px', borderRadius: 8,
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <i className="fas fa-list-ul" />
            <span>รายชื่อ ({candidates.length})</span>
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT AREA ── */}
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px 40px',
        position: 'relative',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: 700,
          width: '100%',
        }}>
          {/* Wheel Container */}
          <div style={{
            position: 'relative',
            width: 'min(90vw, 540px)',
            height: 'min(90vw, 540px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <canvas
              ref={canvasRef}
              width={700}
              height={700}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                cursor: isSpinning ? 'default' : 'pointer',
              }}
              onClick={() => !isSpinning && startSpin()}
            />

            {/* Floating Center Spin Touch Area */}
            <button
              onClick={() => !isSpinning && startSpin()}
              disabled={isSpinning || candidates.length === 0}
              style={{
                position: 'absolute',
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                background: 'transparent',
                border: 'none',
                cursor: isSpinning ? 'default' : 'pointer',
                zIndex: 5,
              }}
              title="กดเพื่อหมุนวงล้อ"
            />
          </div>

          {/* Bottom Spin Control Card */}
          <div style={{
            marginTop: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            maxWidth: 440,
          }}>
            <button
              onClick={() => !isSpinning && startSpin()}
              disabled={isSpinning || candidates.length === 0}
              style={{
                width: '100%',
                padding: '16px 28px',
                borderRadius: 16,
                border: 'none',
                background: isSpinning
                  ? '#333'
                  : 'linear-gradient(135deg, #c62419 0%, #e02d20 50%, #9a1c13 100%)',
                color: '#fff',
                fontSize: 20,
                fontWeight: 900,
                fontFamily: "'Barlow Condensed', sans-serif",
                letterSpacing: '0.06em',
                cursor: isSpinning || candidates.length === 0 ? 'default' : 'pointer',
                boxShadow: isSpinning ? 'none' : '0 8px 32px rgba(198,36,25,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                transition: 'all 0.2s',
              }}
            >
              <i className={`fas ${isSpinning ? 'fa-spinner fa-spin' : 'fa-play'}`} />
              <span>{isSpinning ? 'กำลังหมุนวงล้อ...' : 'หมุนวงล้อ (SPIN)'}</span>
            </button>

            {/* Quick Stats Pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 12,
              color: 'rgba(255,255,255,0.65)',
            }}>
              <span>
                <i className="fas fa-users" style={{ marginRight: 5, color: '#fbbf24' }} />
                ผู้เข้าร่วม: <strong style={{ color: '#fff' }}>{candidates.length}</strong> คน
              </span>
              <span>•</span>
              <span>
                <i className="fas fa-ticket-alt" style={{ marginRight: 5, color: '#fbbf24' }} />
                สิทธิ์ทั้งหมด: <strong style={{ color: '#fff' }}>{totalActiveTickets}</strong> สิทธิ์
              </span>
            </div>

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
              เคล็ดลับ: สามารถกดปุ่ม <kbd style={{ background: '#222', padding: '2px 6px', borderRadius: 4, border: '1px solid #444' }}>Spacebar</kbd> เพื่อหมุนวงล้อได้
            </div>
          </div>
        </div>
      </main>

      {/* ── SIDEBAR DRAWER ── */}
      {showSidebar && (
        <aside style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(90vw, 380px)',
          background: '#12121e',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.8)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Sidebar Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>จัดการผู้เข้าร่วมสุ่ม</div>
            <button
              onClick={() => setShowSidebar(false)}
              style={{
                background: 'none', border: 'none', color: '#888',
                fontSize: 18, cursor: 'pointer', padding: 4,
              }}
            >
              <i className="fas fa-times" />
            </button>
          </div>

          {/* Tabs in Sidebar */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.2)',
          }}>
            {[
              { key: 'candidates', label: `รายชื่อ (${candidates.length})` },
              { key: 'removed', label: `ลบออก (${removedCandidates.length})` },
              { key: 'history', label: 'ประวัติ' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, padding: '10px 6px', border: 'none',
                  background: activeTab === tab.key ? 'rgba(198,36,25,0.15)' : 'none',
                  color: activeTab === tab.key ? 'var(--crimson-500)' : '#888',
                  borderBottom: activeTab === tab.key ? '2px solid var(--crimson-500)' : 'none',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sidebar Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {/* ── TAB 1: CANDIDATES ── */}
            {activeTab === 'candidates' && (
              <div>
                {/* Admin Quick Lock Section */}
                {isAdmin && (
                  <div style={{
                    marginBottom: 16, padding: '12px 14px', borderRadius: 10,
                    background: config.lockedWinnerId ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${config.lockedWinnerId ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: config.lockedWinnerId ? '#ef4444' : '#fbbf24', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <i className="fas fa-lock" /> ล็อคผลรอบถัดไป (Admin)
                    </div>
                    <select
                      value={config.lockedWinnerId || ''}
                      onChange={e => handleSetLockedWinner(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 8,
                        background: '#09090f', border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff', fontSize: 13, fontFamily: "'Sarabun', sans-serif",
                      }}
                    >
                      <option value="">-- สุ่มตามธรรมชาติ (Fair) --</option>
                      {candidates.map(c => (
                        <option key={c.id} value={c.id}>
                          🔒 ล็อคให้: {c.name} ({c.tickets} สิทธิ์)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Candidate list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {candidates.map(c => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${config.lockedWinnerId === c.id ? '#ef4444' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: c.color, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 900, overflow: 'hidden',
                        }}>
                          {c.avatar ? (
                            <img src={c.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            c.name[0]
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 700,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {c.name}
                            {config.lockedWinnerId === c.id && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: '#ef4444' }}>[ล็อค]</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                            {c.tickets} ครั้ง · {c.chance}%
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => handleRemoveFromWheel(c.id)}
                          title="ลบออกจากวงล้อ"
                          style={{
                            background: 'rgba(239,68,68,0.15)', border: 'none',
                            color: '#ef4444', width: 28, height: 28, borderRadius: 6,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <i className="fas fa-trash-alt" style={{ fontSize: 11 }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Manual Candidate Form */}
                <form onSubmit={handleAddManual} style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#888', marginBottom: 8 }}>
                    + เพิ่มรายชื่อเสริม / ทดสอบ
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input
                      type="text"
                      placeholder="ชื่อผู้เล่น"
                      value={newManualName}
                      onChange={e => setNewManualName(e.target.value)}
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: 8,
                        background: '#09090f', border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff', fontSize: 12,
                      }}
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="สิทธิ์"
                      value={newManualTickets}
                      onChange={e => setNewManualTickets(e.target.value)}
                      style={{
                        width: 60, padding: '8px 8px', borderRadius: 8,
                        background: '#09090f', border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff', fontSize: 12, textAlign: 'center',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    style={{
                      width: '100%', padding: '8px', borderRadius: 8,
                      border: 'none', background: 'rgba(255,255,255,0.1)',
                      color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    เพิ่มเข้าวงล้อ
                  </button>
                </form>
              </div>
            )}

            {/* ── TAB 2: REMOVED CANDIDATES ── */}
            {activeTab === 'removed' && (
              <div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
                  รายชื่อที่ถูกลบออกจากวงล้อจะไม่ถูกสุ่ม สามารถกดคืนสิทธิ์ได้
                </div>
                {removedCandidates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#666', fontSize: 13 }}>
                    ยังไม่มีรายชื่อที่ถูกลบออก
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {removedCandidates.map(c => (
                      <div
                        key={c.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</span>
                        <button
                          onClick={() => handleRestoreToWheel(c.id)}
                          style={{
                            padding: '4px 10px', borderRadius: 6,
                            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                            color: '#22c55e', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          <i className="fas fa-undo" style={{ marginRight: 4 }} /> คืนสิทธิ์
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 3: WINNER HISTORY ── */}
            {activeTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {winnerHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#666', fontSize: 13 }}>
                    ยังไม่มีประวัติการสุ่ม
                  </div>
                ) : (
                  winnerHistory.map(w => {
                    const timeStr = w.wonAt?.toDate ? w.wonAt.toDate().toLocaleTimeString('th-TH') : ''
                    return (
                      <div
                        key={w.id}
                        style={{
                          padding: '10px 12px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>
                            🎉 {w.winnerName}
                          </span>
                          <span style={{ fontSize: 11, color: '#888' }}>{timeStr}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                          สิทธิ์: {w.tickets} ครั้ง ({w.chance}%)
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ── WINNER CELEBRATION MODAL ── */}
      {showWinnerModal && currentWinner && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #1e1e30 0%, #12121e 100%)',
            border: '2px solid #c8a050',
            borderRadius: 24,
            padding: '32px 28px',
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
            position: 'relative',
            boxShadow: '0 16px 64px rgba(200,160,80,0.3)',
            animation: 'modalPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}>
            <style>{`
              @keyframes modalPop {
                from { transform: scale(0.7); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
              }
            `}</style>

            {/* Glowing Crown Icon */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, #fbbf24, #b45309)',
              margin: '-68px auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, color: '#fff',
              boxShadow: '0 8px 24px rgba(251,191,36,0.5)',
              border: '3px solid #fff',
            }}>
              👑
            </div>

            <div style={{
              fontSize: 12, fontWeight: 900, color: '#fbbf24',
              letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4,
            }}>
              CONGRATULATIONS!
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 16px', color: '#fff' }}>
              ผู้โชคดีได้รับรางวัล!
            </h2>

            {/* Winner Card */}
            <div style={{
              background: 'rgba(0,0,0,0.4)', borderRadius: 16,
              padding: '18px 16px', marginBottom: 20,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {currentWinner.avatar ? (
                <img
                  src={currentWinner.avatar}
                  alt=""
                  style={{
                    width: 76, height: 76, borderRadius: '50%',
                    objectFit: 'cover', margin: '0 auto 12px',
                    border: '3px solid var(--crimson-500)',
                  }}
                />
              ) : (
                <div style={{
                  width: 76, height: 76, borderRadius: '50%',
                  background: currentWinner.color || 'var(--crimson-500)',
                  margin: '0 auto 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 900, color: '#fff',
                  border: '3px solid #fff',
                }}>
                  {currentWinner.name[0]}
                </div>
              )}

              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                {currentWinner.name}
              </div>
              {currentWinner.fullName && currentWinner.fullName !== currentWinner.name && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                  {currentWinner.fullName}
                </div>
              )}
              {currentWinner.tel_no && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                  <i className="fas fa-phone-alt" style={{ marginRight: 5 }} />
                  {currentWinner.tel_no}
                </div>
              )}

              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 20,
                background: 'rgba(200,160,80,0.15)', border: '1px solid rgba(200,160,80,0.3)',
                fontSize: 12, fontWeight: 700, color: '#fbbf24', marginTop: 4,
              }}>
                <i className="fas fa-ticket-alt" />
                มาเล่นทั้งหมด {currentWinner.tickets} ครั้ง (โอกาส {currentWinner.chance}%)
              </div>
            </div>

            {/* Requirement: "ชื่อไหนที่ถูกสุ่มได้ไปแล้วจะเลือกได้ว่าจะเก็บจะลบออกจากวงไหม" */}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 12 }}>
              ต้องการจัดการรายชื่อผู้ชนะนี้ในรอบถัดไปอย่างไร?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Option 1: Keep in Wheel */}
              <button
                onClick={() => setShowWinnerModal(false)}
                style={{
                  width: '100%', padding: '12px 18px', borderRadius: 12,
                  border: '1px solid rgba(34,197,94,0.4)',
                  background: 'rgba(34,197,94,0.15)', color: '#4ade80',
                  fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <i className="fas fa-check-circle" />
                <span>เก็บชื่อไว้ในวงล้อต่อไป</span>
              </button>

              {/* Option 2: Remove from Wheel */}
              <button
                onClick={() => handleRemoveFromWheel(currentWinner.id)}
                style={{
                  width: '100%', padding: '12px 18px', borderRadius: 12,
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.15)', color: '#f87171',
                  fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <i className="fas fa-user-minus" />
                <span>ลบชื่อออกจากวงล้อ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFETTI FULLSCREEN CANVAS ── */}
      <canvas
        ref={confettiCanvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 110,
        }}
      />
    </div>
  )
}
