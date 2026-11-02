import React, { useState, useRef, useEffect, useCallback } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const PRESET_COLORS = [
  { name: 'เขียวตองอ่อน', hex: '#22c55e' },
  { name: 'เขียวตองเข้ม', hex: '#15803d' },
  { name: 'ชมพูกลีบบัว', hex: '#f43f5e' },
  { name: 'บัวหลวงชมพูเข้ม', hex: '#be123c' },
  { name: 'เหลืองเทียน', hex: '#facc15' },
  { name: 'ทองคำสุก', hex: '#d97706' },
  { name: 'ส้มเปลวไฟ', hex: '#f97316' },
  { name: 'ม่วงบัวเผื่อน', hex: '#a855f7' },
  { name: 'ขาวบริสุทธิ์', hex: '#ffffff' },
  { name: 'ฟ้าคราม', hex: '#38bdf8' },
  { name: 'น้ำตาลธูป', hex: '#78350f' },
  { name: 'ดำคราม', hex: '#1e293b' },
]

const QUICK_WISHES = [
  'ขอให้พบแต่ความสุข สุขภาพร่างกายแข็งแรง ไร้โรคภัยเบียดเบียน',
  'ขอให้การงานเจริญก้าวหน้า การเงินคล่องตัว มั่งคั่งร่ำรวย',
  'ขอให้ความรักมั่นคง สมหวังในสิ่งที่ปรารถนาทุกประการ',
  'ลอยเคราะห์ ลอยโศก ลอยสิ่งไม่ดีทั้งหมดออกจากชีวิต',
  'ขอให้ครอบครัวสงบสุข ร่มเย็น แคล้วคลาดปลอดภัยทุกการเดินทาง',
]

function hexToRgb(hex) {
  let c = hex.replace('#', '')
  if (c.length === 3) c = c.split('').map(x => x + x).join('')
  const num = parseInt(c, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

function rgbToHex(r, g, b) {
  const toHex = (n) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)))
    return clamped.toString(16).padStart(2, '0')
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export default function KrathongDrawPage({ showPage, lineUser, showToast }) {
  // Canvas refs
  const drawCanvasRef = useRef(null)
  const guideCanvasRef = useRef(null)

  // Drawing state
  const [tool, setTool] = useState('glow') // 'pen' | 'brush' | 'glow' | 'marker' | 'eraser' | 'bucket'
  const [colorR, setColorR] = useState(250)
  const [colorG, setColorG] = useState(204)
  const [colorB, setColorB] = useState(21)
  const [brushSize, setBrushSize] = useState(12)
  const [opacity, setOpacity] = useState(100)
  const [showGuide, setShowGuide] = useState(true)

  // History for undo/redo
  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef(null)

  // Form state
  const [ownerName, setOwnerName] = useState(() => lineUser?.displayName || '')
  const [wish, setWish] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [releasedKrathong, setReleasedKrathong] = useState(null)

  const currentColorHex = rgbToHex(colorR, colorG, colorB)
  const currentRgbaString = `rgba(${colorR}, ${colorG}, ${colorB}, ${opacity / 100})`

  // ── Push Canvas State to History ─────────────────────────
  const saveState = useCallback(() => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
    newHistory.push(imgData)
    if (newHistory.length > 25) newHistory.shift()
    historyRef.current = newHistory
    historyIndexRef.current = newHistory.length - 1
  }, [])

  // ── Initialize Canvas & Guide ────────────────────────────
  useEffect(() => {
    const canvas = drawCanvasRef.current
    const guideCanvas = guideCanvasRef.current
    if (!canvas || !guideCanvas) return

    canvas.width = 600
    canvas.height = 600
    guideCanvas.width = 600
    guideCanvas.height = 600

    // Initial blank state
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    saveState()

    drawGuideOutline()
  }, [saveState])

  // ── Redraw Guide Canvas when showGuide changes ───────────
  const drawGuideOutline = useCallback(() => {
    const guideCanvas = guideCanvasRef.current
    if (!guideCanvas) return
    const gctx = guideCanvas.getContext('2d')
    gctx.clearRect(0, 0, guideCanvas.width, guideCanvas.height)

    if (!showGuide) return

    gctx.save()
    gctx.strokeStyle = 'rgba(254, 240, 138, 0.35)'
    gctx.lineWidth = 2.5
    gctx.setLineDash([6, 6])

    // Draw traditional Krathong template silhouette
    // 1. Base banana leaf disc / bowl
    gctx.beginPath()
    gctx.ellipse(300, 440, 190, 75, 0, 0, Math.PI * 2)
    gctx.stroke()

    // 2. Lotus petals around base
    const petalCount = 8
    for (let i = 0; i < petalCount; i++) {
      const angle = (Math.PI / (petalCount - 1)) * i
      const x = 300 - Math.cos(angle) * 180
      const y = 430 - Math.sin(angle) * 55
      gctx.beginPath()
      gctx.moveTo(x - 22, y)
      gctx.quadraticCurveTo(x, y - 55, x + 22, y)
      gctx.stroke()
    }

    // 3. Candle in center
    gctx.beginPath()
    gctx.roundRect(290, 240, 20, 150, 4)
    gctx.stroke()

    // 4. Candle Flame
    gctx.beginPath()
    gctx.moveTo(300, 240)
    gctx.bezierCurveTo(285, 215, 285, 175, 300, 155)
    gctx.bezierCurveTo(315, 175, 315, 215, 300, 240)
    gctx.stroke()

    // 5. 3 Incense sticks
    gctx.beginPath()
    gctx.moveTo(270, 390); gctx.lineTo(255, 180)
    gctx.moveTo(330, 390); gctx.lineTo(345, 180)
    gctx.stroke()

    // Guide Text
    gctx.setLineDash([])
    gctx.fillStyle = 'rgba(254, 240, 138, 0.45)'
    gctx.font = '600 16px Sarabun'
    gctx.textAlign = 'center'
    gctx.fillText('เส้นร่างแนะนำ: วาดกระทง ดอกไม้ ธูป และเทียนตามจินตนาการ', 300, 560)
    gctx.restore()
  }, [showGuide])

  useEffect(() => {
    drawGuideOutline()
  }, [showGuide, drawGuideOutline])

  // ── Coordinates Helper ───────────────────────────────────
  const getCoordinates = (e) => {
    const canvas = drawCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0
    const clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  // ── Flood Fill Algorithm ─────────────────────────────────
  const floodFill = (startX, startY, fillR, fillG, fillB, fillA) => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const w = canvas.width
    const h = canvas.height
    const imgData = ctx.getImageData(0, 0, w, h)
    const data = imgData.data

    const x = Math.floor(startX)
    const y = Math.floor(startY)
    if (x < 0 || x >= w || y < 0 || y >= h) return

    const startIndex = (y * w + x) * 4
    const startR = data[startIndex]
    const startG = data[startIndex + 1]
    const startB = data[startIndex + 2]
    const startA = data[startIndex + 3]

    // Color match threshold
    const match = (idx) => {
      const dr = Math.abs(data[idx] - startR)
      const dg = Math.abs(data[idx + 1] - startG)
      const db = Math.abs(data[idx + 2] - startB)
      const da = Math.abs(data[idx + 3] - startA)
      return dr < 32 && dg < 32 && db < 32 && da < 32
    }

    if (
      Math.abs(startR - fillR) < 5 &&
      Math.abs(startG - fillG) < 5 &&
      Math.abs(startB - fillB) < 5 &&
      Math.abs(startA - fillA) < 5
    ) {
      return
    }

    const queue = [startIndex]
    const visited = new Uint8Array(w * h)
    visited[y * w + x] = 1

    while (queue.length > 0) {
      const cur = queue.pop()
      data[cur] = fillR
      data[cur + 1] = fillG
      data[cur + 2] = fillB
      data[cur + 3] = fillA

      const curPixel = cur / 4
      const cx = curPixel % w
      const cy = Math.floor(curPixel / w)

      const neighbors = [
        cx > 0 ? cur - 4 : null,
        cx < w - 1 ? cur + 4 : null,
        cy > 0 ? cur - w * 4 : null,
        cy < h - 1 ? cur + w * 4 : null,
      ]

      for (const n of neighbors) {
        if (n !== null) {
          const np = n / 4
          if (!visited[np] && match(n)) {
            visited[np] = 1
            queue.push(n)
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0)
    saveState()
  }

  // ── Drawing Event Handlers ───────────────────────────────
  const startDrawing = (e) => {
    e.preventDefault()
    const { x, y } = getCoordinates(e)

    if (tool === 'bucket') {
      floodFill(x, y, colorR, colorG, colorB, Math.round((opacity / 100) * 255))
      return
    }

    isDrawingRef.current = true
    lastPointRef.current = { x, y }

    const canvas = drawCanvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.save()

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = brushSize * 1.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = currentRgbaString
      ctx.fillStyle = currentRgbaString
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (tool === 'glow') {
        ctx.shadowColor = currentColorHex
        ctx.shadowBlur = brushSize * 1.6
      } else if (tool === 'brush') {
        ctx.shadowColor = 'rgba(0,0,0,0.1)'
        ctx.shadowBlur = 4
      } else {
        ctx.shadowBlur = 0
      }

      ctx.beginPath()
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  const draw = (e) => {
    if (!isDrawingRef.current) return
    e.preventDefault()

    const { x, y } = getCoordinates(e)
    const prev = lastPointRef.current || { x, y }
    const canvas = drawCanvasRef.current
    const ctx = canvas.getContext('2d')

    ctx.save()

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = brushSize * 1.8
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(x, y)
      ctx.stroke()
    } else if (tool === 'sparkle') {
      // Draw star particle trail
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = currentRgbaString
      ctx.shadowColor = currentColorHex
      ctx.shadowBlur = 10
      for (let i = 0; i < 3; i++) {
        const sx = x + (Math.random() - 0.5) * brushSize * 2
        const sy = y + (Math.random() - 0.5) * brushSize * 2
        const r = 2 + Math.random() * (brushSize / 3)
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = currentRgbaString
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (tool === 'glow') {
        ctx.shadowColor = currentColorHex
        ctx.shadowBlur = brushSize * 1.8
      } else if (tool === 'brush') {
        ctx.shadowColor = 'rgba(0,0,0,0.15)'
        ctx.shadowBlur = 4
      } else {
        ctx.shadowBlur = 0
      }

      const midX = (prev.x + x) / 2
      const midY = (prev.y + y) / 2
      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY)
      ctx.lineTo(x, y)
      ctx.stroke()
    }

    ctx.restore()
    lastPointRef.current = { x, y }
  }

  const stopDrawing = () => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    lastPointRef.current = null
    saveState()
  }

  // ── Stamp Tools ──────────────────────────────────────────
  const stampItem = (type) => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.save()

    if (type === 'candle') {
      // Golden Candle & Incense in center
      ctx.fillStyle = '#f59e0b'
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 24
      // Candle body
      ctx.fillRect(290, 240, 20, 160)
      // Flame
      ctx.fillStyle = '#fef08a'
      ctx.beginPath()
      ctx.moveTo(300, 240)
      ctx.bezierCurveTo(285, 215, 285, 175, 300, 150)
      ctx.bezierCurveTo(315, 175, 315, 215, 300, 240)
      ctx.fill()

      // Incense sticks
      ctx.strokeStyle = '#78350f'
      ctx.lineWidth = 4
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.moveTo(270, 400); ctx.lineTo(255, 180)
      ctx.moveTo(330, 400); ctx.lineTo(345, 180)
      ctx.stroke()

      // Incense glowing tip
      ctx.fillStyle = '#ef4444'
      ctx.shadowColor = '#f87171'
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(255, 180, 4, 0, Math.PI * 2)
      ctx.arc(345, 180, 4, 0, Math.PI * 2)
      ctx.fill()
    } else if (type === 'lotus') {
      // Stamped lotus base
      ctx.fillStyle = '#10b981'
      ctx.shadowColor = '#059669'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.ellipse(300, 440, 190, 70, 0, 0, Math.PI * 2)
      ctx.fill()

      // Petals
      ctx.fillStyle = '#f43f5e'
      ctx.shadowColor = '#fb7185'
      ctx.shadowBlur = 10
      const count = 9
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI / (count - 1)) * i
        const x = 300 - Math.cos(angle) * 175
        const y = 430 - Math.sin(angle) * 55
        ctx.beginPath()
        ctx.moveTo(x - 24, y)
        ctx.quadraticCurveTo(x, y - 65, x + 24, y)
        ctx.fill()
      }
    }
    ctx.restore()
    saveState()
    if (showToast) showToast('เพิ่มตราประทับตกแต่งเรียบร้อย')
  }

  // ── Undo / Redo ──────────────────────────────────────────
  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1
      const imgData = historyRef.current[historyIndexRef.current]
      const ctx = drawCanvasRef.current.getContext('2d')
      ctx.putImageData(imgData, 0, 0)
    }
  }

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1
      const imgData = historyRef.current[historyIndexRef.current]
      const ctx = drawCanvasRef.current.getContext('2d')
      ctx.putImageData(imgData, 0, 0)
    }
  }

  // ── Clear Canvas ─────────────────────────────────────────
  const handleClear = () => {
    if (!window.confirm('ต้องการล้างภาพวาดทั้งหมดและเริ่มต้นใหม่ใช่หรือไม่?')) return
    const canvas = drawCanvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    saveState()
  }

  // ── Download PNG ─────────────────────────────────────────
  const handleDownload = () => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.download = `krathong-${Date.now()}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  // ── Check if Canvas Has Any Content ──────────────────────
  const checkCanvasHasContent = () => {
    const canvas = drawCanvasRef.current
    if (!canvas) return false
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imgData.data
    let filledPixels = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 10) {
        filledPixels++
        if (filledPixels > 250) return true
      }
    }
    return false
  }

  // ── Release Krathong (Submit to Firestore) ───────────────
  const handleReleaseKrathong = async (e) => {
    e.preventDefault()

    if (!ownerName.trim()) {
      alert('โปรดระบุชื่อเจ้าของกระทง')
      return
    }

    if (!wish.trim()) {
      alert('โปรดเขียนคำอธิษฐานของคุณ')
      return
    }

    if (!checkCanvasHasContent()) {
      alert('โปรดวาดกระทงของคุณลงบนผืนผ้าใบก่อนทำการปล่อยลงแม่น้ำ')
      return
    }

    setIsSubmitting(true)
    try {
      const canvas = drawCanvasRef.current

      // Crop or resize to optimized 320x320 for performance
      const optCanvas = document.createElement('canvas')
      optCanvas.width = 360
      optCanvas.height = 360
      const optCtx = optCanvas.getContext('2d')
      optCtx.drawImage(canvas, 0, 0, 360, 360)
      const dataUrl = optCanvas.toDataURL('image/png')

      const newDoc = {
        name: ownerName.trim(),
        wish: wish.trim(),
        imageData: dataUrl,
        createdAt: serverTimestamp(),
        userId: lineUser?.userId || null,
        userPicture: lineUser?.pictureUrl || null,
        lane: Math.floor(Math.random() * 5),
        speed: 0.35 + Math.random() * 0.45,
        scale: 0.75 + Math.random() * 0.35,
        bobFreq: 1.2 + Math.random() * 1.5,
        bobAmp: 3 + Math.random() * 5,
        likes: 0,
      }

      const docRef = await addDoc(collection(db, 'krathongs'), newDoc)

      try {
        sessionStorage.setItem('sofun_recent_krathong', docRef.id)
      } catch {}

      setReleasedKrathong({
        id: docRef.id,
        name: ownerName.trim(),
        wish: wish.trim(),
        imageData: dataUrl,
      })

      if (showToast) showToast('ปล่อยกระทงลงสู่แม่น้ำสายบุญสำเร็จแล้ว')
    } catch (err) {
      console.error('Error releasing krathong:', err)
      alert('เกิดข้อผิดพลาดในการปล่อยกระทง โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #050814 0%, #0a1329 45%, #0d1e3d 100%)',
      color: '#ffffff',
      fontFamily: "'Sarabun', sans-serif",
      paddingBottom: '80px',
    }}>
      {/* Top Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(5, 8, 20, 0.88)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => showPage('loykrathong')}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="fas fa-arrow-left" /> กลับ
          </button>
          <div>
            <h1 style={{
              fontSize: '16px',
              fontWeight: 800,
              margin: 0,
              color: '#fef08a',
            }}>
              สตูดิโอวาดกระทงทำมือ
            </h1>
            <p style={{
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.65)',
              margin: 0,
            }}>
              /Krathong — วาด ใส่ชื่อ และส่งคำอธิษฐาน
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => showPage('river')}
          style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            border: 'none',
            color: '#ffffff',
            borderRadius: '10px',
            padding: '7px 14px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
          }}
        >
          <i className="fas fa-water" /> ดูแม่น้ำ (/River)
        </button>
      </header>

      {/* Main Container */}
      <main style={{
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '24px 16px',
      }}>
        {/* Prominent Guidance Banner */}
        <div style={{
          background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.08) 100%)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '16px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fef08a',
            fontSize: '20px',
            flexShrink: 0,
          }}>
            <i className="fas fa-palette" />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#fef08a' }}>
              คำแนะนำ: ออกแบบกระทงของคุณให้งดงามตามจินตนาการ
            </div>
            <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.5 }}>
              ใช้แปรงเรืองแสงหรือพู่กันระบายกลีบดอกบัว เทียน และธูป เมื่อวาดเสร็จให้เขียนชื่อและคำอธิษฐาน จากนั้นกดปุ่ม "ปล่อยกระทง" เพื่อส่งกระทงของคุณไปลอยที่หน้า /River
            </div>
          </div>
        </div>

        {/* Studio Workspace Layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}>
          {/* Left Column: Canvas Studio */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1.5px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '20px',
            padding: '20px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
          }}>
            {/* Action Bar on top of canvas */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={handleUndo}
                  title="ย้อนกลับ (Undo)"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <i className="fas fa-undo" /> ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  title="ทำซ้ำ (Redo)"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <i className="fas fa-redo" /> ทำซ้ำ
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  title="ล้างผ้าใบ"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <i className="fas fa-trash-can" /> ล้าง
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  style={{
                    background: showGuide ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    border: showGuide ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
                    color: showGuide ? '#fef08a' : 'rgba(255, 255, 255, 0.7)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <i className="fas fa-shapes" /> เส้นไกด์ร่าง {showGuide ? 'เปิด' : 'ปิด'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  title="ดาวน์โหลดรูปภาพกระทง"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <i className="fas fa-download" />
                </button>
              </div>
            </div>

            {/* Canvas Box (Checkerboard transparency preview) */}
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.8), 0 8px 24px rgba(0, 0, 0, 0.5)',
              background: '#0a0f1d',
              border: '2px solid rgba(245, 158, 11, 0.25)',
              touchAction: 'none',
            }}>
              {/* Water background aesthetic inside canvas */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at 50% 50%, rgba(15, 30, 66, 0.6) 0%, rgba(5, 10, 25, 0.95) 100%)',
                pointerEvents: 'none',
              }} />

              {/* Guide Canvas Overlay */}
              <canvas
                ref={guideCanvasRef}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />

              {/* Main Drawing Canvas */}
              <canvas
                ref={drawCanvasRef}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
                onPointerCancel={stopDrawing}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  cursor: tool === 'eraser' ? 'cell' : tool === 'bucket' ? 'crosshair' : 'crosshair',
                  zIndex: 3,
                  touchAction: 'none',
                }}
              />
            </div>

            {/* Quick Stamps for Easy Krathong Decorating */}
            <div style={{
              marginTop: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>
                ตราประทับด่วน:
              </span>
              <button
                type="button"
                onClick={() => stampItem('candle')}
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  color: '#fef08a',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <i className="fas fa-fire" /> จุดธูปเทียนทอง
              </button>
              <button
                type="button"
                onClick={() => stampItem('lotus')}
                style={{
                  background: 'rgba(244, 63, 94, 0.15)',
                  border: '1px solid rgba(244, 63, 94, 0.35)',
                  color: '#fbcfe8',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <i className="fas fa-spa" /> ฐานกระทงบัวหลวง
              </button>
            </div>
          </div>

          {/* Right Column: Complete Drawing Tools & Details Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Tool Selection Box */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1.5px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
            }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#fef08a',
                margin: '0 0 12px',
                letterSpacing: '0.02em',
              }}>
                เครื่องมือและหัวแปรงพู่กัน
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginBottom: '16px',
              }}>
                {[
                  { id: 'glow', label: 'แปรงเรืองแสง', icon: 'fa-wand-magic-sparkles' },
                  { id: 'brush', label: 'พู่กันสีน้ำ', icon: 'fa-paintbrush' },
                  { id: 'pen', label: 'ปากกาเส้นคม', icon: 'fa-pen-nib' },
                  { id: 'sparkle', label: 'ประกายดาว', icon: 'fa-star' },
                  { id: 'bucket', label: 'ถังเทสี', icon: 'fa-fill-drip' },
                  { id: 'eraser', label: 'ยางลบ', icon: 'fa-eraser' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTool(item.id)}
                    style={{
                      background: tool === item.id ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      border: tool === item.id ? '1.5px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: tool === item.id ? '#fef08a' : 'rgba(255, 255, 255, 0.85)',
                      borderRadius: '10px',
                      padding: '10px 6px',
                      fontSize: '12px',
                      fontWeight: tool === item.id ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.18s',
                    }}
                  >
                    <i className={`fas ${item.icon}`} style={{ fontSize: '15px' }} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Stroke Size & Opacity Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    marginBottom: '4px',
                  }}>
                    <span>ขนาดแปรง</span>
                    <span style={{ color: '#fef08a', fontWeight: 700 }}>{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="48"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    marginBottom: '4px',
                  }}>
                    <span>ความโปร่งใส</span>
                    <span style={{ color: '#fef08a', fontWeight: 700 }}>{opacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* RGB Color System */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '14px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      background: currentColorHex,
                      border: '2px solid #ffffff',
                      boxShadow: `0 0 10px ${currentColorHex}`,
                    }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                      สีระบบ RGB ({colorR}, {colorG}, {colorB})
                    </span>
                  </div>

                  <input
                    type="color"
                    value={currentColorHex}
                    onChange={(e) => {
                      const { r, g, b } = hexToRgb(e.target.value)
                      setColorR(r)
                      setColorG(g)
                      setColorB(b)
                    }}
                    style={{
                      width: '32px',
                      height: '28px',
                      padding: 0,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                    title="เปิดกล่องเลือกสีอิสระ"
                  />
                </div>

                {/* Individual R, G, B Sliders */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Red Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>R</span>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={colorR}
                      onChange={(e) => setColorR(Number(e.target.value))}
                      style={{ flex: 1, accentColor: '#ef4444', cursor: 'pointer' }}
                    />
                    <span style={{ width: '28px', textAlign: 'right', fontSize: '11px', color: '#ef4444', fontWeight: 700 }}>
                      {colorR}
                    </span>
                  </div>

                  {/* Green Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '14px', fontSize: '11px', fontWeight: 800, color: '#22c55e' }}>G</span>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={colorG}
                      onChange={(e) => setColorG(Number(e.target.value))}
                      style={{ flex: 1, accentColor: '#22c55e', cursor: 'pointer' }}
                    />
                    <span style={{ width: '28px', textAlign: 'right', fontSize: '11px', color: '#22c55e', fontWeight: 700 }}>
                      {colorG}
                    </span>
                  </div>

                  {/* Blue Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '14px', fontSize: '11px', fontWeight: 800, color: '#3b82f6' }}>B</span>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={colorB}
                      onChange={(e) => setColorB(Number(e.target.value))}
                      style={{ flex: 1, accentColor: '#3b82f6', cursor: 'pointer' }}
                    />
                    <span style={{ width: '28px', textAlign: 'right', fontSize: '11px', color: '#3b82f6', fontWeight: 700 }}>
                      {colorB}
                    </span>
                  </div>
                </div>

                {/* Preset Palette Chips */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                  marginTop: '12px',
                }}>
                  {PRESET_COLORS.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      title={item.name}
                      onClick={() => {
                        const { r, g, b } = hexToRgb(item.hex)
                        setColorR(r)
                        setColorG(g)
                        setColorB(b)
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        background: item.hex,
                        border: currentColorHex.toLowerCase() === item.hex.toLowerCase() ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.25)',
                        cursor: 'pointer',
                        padding: 0,
                        transform: currentColorHex.toLowerCase() === item.hex.toLowerCase() ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.15s',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Form: Owner Name & Wish Textarea */}
            <form onSubmit={handleReleaseKrathong} style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1.5px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
            }}>
              <h3 style={{
                fontSize: '15px',
                fontWeight: 700,
                color: '#fef08a',
                margin: '0 0 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <i className="fas fa-scroll" /> ข้อมูลเจ้าของกระทงและคำอธิษฐาน
              </h3>

              {/* Owner Name */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'rgba(255, 255, 255, 0.9)',
                }}>
                  ชื่อเจ้าของกระทง <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="เช่น พี่วาฬ หรือ แก๊งเด็ก RCA"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'rgba(0, 0, 0, 0.35)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Wish Textarea */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'rgba(255, 255, 255, 0.9)',
                }}>
                  เขียนคำอธิษฐาน <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={240}
                  value={wish}
                  onChange={(e) => setWish(e.target.value)}
                  placeholder="ขอให้พบเจอแต่ความสุข สมหวังในหน้าที่การงาน ความรักราบรื่น สุขภาพแข็งแรง..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'rgba(0, 0, 0, 0.35)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    lineHeight: 1.5,
                    resize: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Quick Wish Buttons */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>
                  คำอธิษฐานแนะนำ (คลิกเพื่อใส่ข้อความ):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {QUICK_WISHES.map((w, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setWish(w)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: 'rgba(255, 255, 255, 0.8)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                      }}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Release Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '12px',
                  padding: '14px',
                  fontSize: '16px',
                  fontWeight: 800,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 6px 20px rgba(245, 158, 11, 0.35)',
                  transition: 'transform 0.18s, box-shadow 0.18s',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin" /> กำลังส่งกระทงลงแม่น้ำ...
                  </>
                ) : (
                  <>
                    <i className="fas fa-fire" /> จุดเทียนและปล่อยกระทงลงแม่น้ำ
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Celebration Modal when Krathong is Released */}
      {releasedKrathong && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 100,
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #0d1e3d 0%, #081122 100%)',
            border: '2px solid rgba(245, 158, 11, 0.6)',
            borderRadius: '24px',
            padding: '32px 24px',
            maxWidth: '440px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 50px rgba(245, 158, 11, 0.25)',
          }}>
            {/* Animated Krathong Preview on Water Ripple */}
            <div style={{
              width: '160px',
              height: '160px',
              margin: '0 auto 20px',
              position: 'relative',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(14, 165, 233, 0.2) 0%, rgba(5, 8, 20, 0.8) 70%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(245, 158, 11, 0.3)',
            }}>
              <img
                src={releasedKrathong.imageData}
                alt="กระทงที่ปล่อย"
                style={{
                  maxWidth: '120px',
                  maxHeight: '120px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 12px rgba(254, 240, 138, 0.6))',
                  animation: 'gentleBob 3s ease-in-out infinite alternate',
                }}
              />
            </div>

            <div style={{
              display: 'inline-block',
              fontSize: '11px',
              fontWeight: 800,
              color: '#fef08a',
              background: 'rgba(245, 158, 11, 0.2)',
              padding: '4px 12px',
              borderRadius: '12px',
              marginBottom: '10px',
            }}>
              ขอขมาพระแม่คงคาสำเร็จแล้ว
            </div>

            <h2 style={{
              fontSize: '22px',
              fontWeight: 800,
              color: '#ffffff',
              margin: '0 0 8px',
            }}>
              กระทงของคุณลอยสู่แม่น้ำแล้ว
            </h2>

            <p style={{
              fontSize: '13.5px',
              color: 'rgba(255, 255, 255, 0.75)',
              margin: '0 0 20px',
              lineHeight: 1.6,
            }}>
              คำอธิษฐานของ <strong>{releasedKrathong.name}</strong> ได้ลอยสู่สายนทีใต้แสงจันทร์ ร่วมกับผู้เล่นทุกคนในคืนวันเพ็ญ
            </p>

            <div style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '12px',
              fontSize: '13px',
              color: '#fde68a',
              fontStyle: 'italic',
              marginBottom: '24px',
            }}>
              "{releasedKrathong.wish}"
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={() => showPage('river')}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '12px',
                  padding: '13px',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 6px 20px rgba(2, 132, 199, 0.4)',
                }}
              >
                <i className="fas fa-water" /> เปิดดูแม่น้ำทันที (/River)
              </button>

              <button
                type="button"
                onClick={() => {
                  setReleasedKrathong(null)
                  // Reset canvas for a new one
                  const canvas = drawCanvasRef.current
                  if (canvas) {
                    const ctx = canvas.getContext('2d')
                    ctx.clearRect(0, 0, canvas.width, canvas.height)
                    saveState()
                  }
                  setWish('')
                }}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  borderRadius: '12px',
                  padding: '11px',
                  fontSize: '13.5px',
                  cursor: 'pointer',
                }}
              >
                วาดกระทงเพิ่มอีกหนึ่งใบ
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes gentleBob {
          0% { transform: translateY(0) rotate(-2deg); }
          100% { transform: translateY(-8px) rotate(2deg); }
        }
      `}</style>
    </div>
  )
}
