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
        lane: Math.floor(Math.random() * 4),
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
      background: 'radial-gradient(ellipse at 50% -10%, #1a1a24 0%, #08080c 60%, #000000 100%)',
      color: '#f5f5f7',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Sukhumvit Set', 'Sarabun', sans-serif",
      paddingBottom: '96px',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
    }}>
      {/* Apple-style Minimal Glass Navigation Bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: '52px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <button
          type="button"
          onClick={() => showPage('loykrathong')}
          style={{
            background: 'none',
            border: 'none',
            color: '#86868b',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 0',
            transition: 'color 0.16s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#86868b' }}
        >
          <i className="fas fa-chevron-left" style={{ fontSize: '11px' }} /> หน้าหลัก
        </button>

        <div style={{
          fontSize: '13.5px',
          fontWeight: 600,
          color: '#f5f5f7',
          letterSpacing: '-0.01em',
        }}>
          สตูดิโอกระทงทำมือ
        </div>

        <button
          type="button"
          onClick={() => showPage('river')}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#f5f5f7',
            borderRadius: '9999px',
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backdropFilter: 'blur(12px)',
            transition: 'background 0.16s ease, border-color 0.16s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)'
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
          }}
        >
          ชมแม่น้ำ <i className="fas fa-arrow-up-right-from-square" style={{ fontSize: '9px' }} />
        </button>
      </header>

      {/* Apple-style Hero Typography Header */}
      <section style={{
        textAlign: 'center',
        padding: '44px 20px 32px',
        maxWidth: '680px',
        margin: '0 auto',
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: '#f5a623',
          marginBottom: '10px',
        }}>
          เทศกาลลอยกระทง 2026
        </div>
        <h1 style={{
          fontSize: 'clamp(28px, 4.2vw, 40px)',
          fontWeight: 700,
          letterSpacing: '-0.025em',
          color: '#f5f5f7',
          margin: '0 0 10px',
          lineHeight: 1.15,
        }}>
          สร้างสรรค์กระทงของคุณ.
        </h1>
        <p style={{
          fontSize: '15px',
          color: '#86868b',
          lineHeight: 1.55,
          margin: '0 auto',
          fontWeight: 400,
          maxWidth: '480px',
        }}>
          วาดกระทงด้วยพู่กันดิจิทัล เขียนคำอธิษฐาน และปล่อยลอยสู่สายน้ำร่วมกับผู้เล่นทุกคนในคืนวันเพ็ญ
        </p>
      </section>

      {/* Studio Workspace Layout */}
      <main style={{
        maxWidth: '1040px',
        margin: '0 auto',
        padding: '0 20px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '28px',
          alignItems: 'start',
        }}>
          {/* Left Column: Digital Art Canvas & Floating Tool Dock */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '20px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(20px)',
          }}>
            {/* Top Canvas Utility Bar (Minimal Icon Pills) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
              gap: '8px',
              flexWrap: 'wrap',
            }}>
              {/* History & Clear */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={handleUndo}
                  title="ย้อนกลับ (Undo)"
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#f5f5f7',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'background 0.14s ease',
                  }}
                >
                  <i className="fas fa-rotate-left" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  title="ทำซ้ำ (Redo)"
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#f5f5f7',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'background 0.14s ease',
                  }}
                >
                  <i className="fas fa-rotate-right" />
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  title="ล้างภาพวาด"
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#86868b',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'color 0.14s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#86868b' }}
                >
                  <i className="fas fa-trash-can" />
                </button>
              </div>

              {/* Guide Toggle, Quick Stamps & Download */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  style={{
                    background: showGuide ? 'rgba(245, 166, 35, 0.18)' : 'rgba(255, 255, 255, 0.06)',
                    border: showGuide ? '1px solid rgba(245, 166, 35, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: showGuide ? '#f5a623' : '#86868b',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <i className="fas fa-shapes" style={{ fontSize: '10px' }} />
                  เส้นร่าง {showGuide ? 'เปิด' : 'ปิด'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  title="บันทึกรูปภาพ"
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#86868b',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f5f5f7' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#86868b' }}
                >
                  <i className="fas fa-arrow-down-to-line" />
                </button>
              </div>
            </div>

            {/* Apple Gallery-Style Canvas Frame */}
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: '20px',
              overflow: 'hidden',
              background: '#09090b',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.9), 0 16px 36px rgba(0, 0, 0, 0.6)',
              touchAction: 'none',
            }}>
              {/* Subtle ambient gradient */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at 50% 50%, rgba(30, 41, 59, 0.4) 0%, rgba(9, 9, 11, 0.95) 100%)',
                pointerEvents: 'none',
              }} />

              {/* Guide Canvas */}
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
                  cursor: tool === 'eraser' ? 'cell' : 'crosshair',
                  zIndex: 3,
                  touchAction: 'none',
                }}
              />
            </div>

            {/* Quick Stamps (Candle & Lotus) */}
            <div style={{
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}>
              <span style={{ fontSize: '11.5px', color: '#86868b' }}>
                ตราประทับสำเร็จรูป:
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => stampItem('candle')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.09)',
                    color: '#f5a623',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <i className="fas fa-fire" /> ธูปเทียน
                </button>
                <button
                  type="button"
                  onClick={() => stampItem('lotus')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.09)',
                    color: '#f43f5e',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <i className="fas fa-spa" /> ฐานบัว
                </button>
              </div>
            </div>

            {/* iPadOS-Style Floating Brush Segmented Dock */}
            <div style={{
              marginTop: '16px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '6px',
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '4px',
            }}>
              {[
                { id: 'glow', label: 'เรืองแสง', icon: 'fa-wand-magic-sparkles' },
                { id: 'brush', label: 'พู่กัน', icon: 'fa-paintbrush' },
                { id: 'pen', label: 'ปากกา', icon: 'fa-pen-nib' },
                { id: 'sparkle', label: 'ประกาย', icon: 'fa-star' },
                { id: 'bucket', label: 'เทสี', icon: 'fa-fill-drip' },
                { id: 'eraser', label: 'ยางลบ', icon: 'fa-eraser' },
              ].map((item) => {
                const isActive = tool === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTool(item.id)}
                    style={{
                      background: isActive ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                      border: 'none',
                      color: isActive ? '#ffffff' : '#86868b',
                      borderRadius: '10px',
                      padding: '8px 2px',
                      fontSize: '11px',
                      fontWeight: isActive ? 600 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.16s ease',
                      boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.25)' : 'none',
                    }}
                  >
                    <i className={`fas ${item.icon}`} style={{ fontSize: '13px' }} />
                    <span style={{ fontSize: '10px' }}>{item.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Apple Minimal Sliders: Size & Opacity */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginTop: '16px',
              padding: '12px 14px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '14px',
            }}>
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11.5px',
                  color: '#86868b',
                  marginBottom: '6px',
                }}>
                  <span>ขนาดหัวแปรง</span>
                  <span style={{ color: '#f5f5f7', fontWeight: 600 }}>{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="48"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#f5a623', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11.5px',
                  color: '#86868b',
                  marginBottom: '6px',
                }}>
                  <span>ความทึบแสง</span>
                  <span style={{ color: '#f5f5f7', fontWeight: 600 }}>{opacity}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#f5a623', cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Apple Color Selection Section */}
            <div style={{
              marginTop: '16px',
              padding: '14px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '14px',
            }}>
              {/* Color Header with Preview and Native Picker */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: currentColorHex,
                    boxShadow: `0 0 10px ${currentColorHex}`,
                    border: '2px solid rgba(255, 255, 255, 0.8)',
                  }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f5f5f7' }}>
                    สีระบบ RGB ({colorR}, {colorG}, {colorB})
                  </span>
                </div>

                <label style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: '#86868b',
                  cursor: 'pointer',
                }}>
                  <span>เลือกสีอิสระ</span>
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
                      width: '22px',
                      height: '22px',
                      padding: 0,
                      border: 'none',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                  />
                </label>
              </div>

              {/* Minimalist Circular Color Swatches */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '14px',
              }}>
                {PRESET_COLORS.map((item, idx) => {
                  const isSelected = currentColorHex.toLowerCase() === item.hex.toLowerCase()
                  return (
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
                        borderRadius: '50%',
                        background: item.hex,
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        outline: isSelected ? '2px solid #ffffff' : 'none',
                        outlineOffset: '2px',
                        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  )
                })}
              </div>

              {/* Slim RGB Track Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '12px', fontSize: '10.5px', fontWeight: 700, color: '#ef4444' }}>R</span>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={colorR}
                    onChange={(e) => setColorR(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#ef4444', cursor: 'pointer', height: '4px' }}
                  />
                  <span style={{ width: '24px', textAlign: 'right', fontSize: '11px', color: '#86868b' }}>{colorR}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '12px', fontSize: '10.5px', fontWeight: 700, color: '#22c55e' }}>G</span>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={colorG}
                    onChange={(e) => setColorG(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#22c55e', cursor: 'pointer', height: '4px' }}
                  />
                  <span style={{ width: '24px', textAlign: 'right', fontSize: '11px', color: '#86868b' }}>{colorG}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '12px', fontSize: '10.5px', fontWeight: 700, color: '#38bdf8' }}>B</span>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={colorB}
                    onChange={(e) => setColorB(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#38bdf8', cursor: 'pointer', height: '4px' }}
                  />
                  <span style={{ width: '24px', textAlign: 'right', fontSize: '11px', color: '#86868b' }}>{colorB}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Apple-Style Details & Release Form */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '28px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(20px)',
          }}>
            <form onSubmit={handleReleaseKrathong}>
              <div style={{ marginBottom: '22px' }}>
                <h2 style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: '#f5f5f7',
                  margin: '0 0 6px',
                }}>
                  คำอธิษฐานและข้อมูล
                </h2>
                <p style={{ fontSize: '13px', color: '#86868b', margin: 0, lineHeight: 1.45 }}>
                  ระบุชื่อและพรที่ปรารถนาเพื่อส่งต่อลงสู่สายน้ำ
                </p>
              </div>

              {/* Owner Name Input */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#86868b',
                  marginBottom: '6px',
                  letterSpacing: '-0.01em',
                }}>
                  ชื่อของคุณ
                </label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="เช่น พี่ว่าน หรือ ทีมงาน Sofun"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: '#ffffff',
                    fontSize: '14.5px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.16s ease, background 0.16s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#f5a623'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                  }}
                />
              </div>

              {/* Wish Textarea */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#86868b',
                  marginBottom: '6px',
                  letterSpacing: '-0.01em',
                }}>
                  คำอธิษฐาน
                </label>
                <textarea
                  required
                  rows={4}
                  maxLength={240}
                  value={wish}
                  onChange={(e) => setWish(e.target.value)}
                  placeholder="ขอให้พบเจอแต่ความสุข ความเจริญในหน้าที่การงาน และสุขภาพร่างกายแข็งแรง..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: '#ffffff',
                    fontSize: '14.5px',
                    outline: 'none',
                    lineHeight: 1.5,
                    resize: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.16s ease, background 0.16s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#f5a623'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                  }}
                />
              </div>

              {/* Apple Signature CTA Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  height: '50px',
                  background: 'linear-gradient(180deg, #f5a623 0%, #d97706 100%)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 8px 24px rgba(245, 166, 35, 0.35)',
                  transition: 'opacity 0.18s ease, transform 0.18s ease',
                  opacity: isSubmitting ? 0.6 : 1,
                  letterSpacing: '-0.01em',
                }}
              >
                {isSubmitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin" /> กำลังส่งกระทงลงแม่น้ำ...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane" /> ปล่อยกระทงลงสู่แม่น้ำ
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Apple Dialog Sheet: Celebration Modal */}
      {releasedKrathong && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 100,
          animation: 'appleModalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={{
            background: 'rgba(28, 28, 30, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '24px',
            padding: '36px 28px',
            maxWidth: '420px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 30px 80px rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
          }}>
            {/* Krathong Preview Badge */}
            <div style={{
              width: '140px',
              height: '140px',
              margin: '0 auto 20px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(245, 166, 35, 0.15) 0%, rgba(0, 0, 0, 0.4) 70%)',
              border: '1px solid rgba(245, 166, 35, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(245, 166, 35, 0.2)',
            }}>
              <img
                src={releasedKrathong.imageData}
                alt="กระทงที่ปล่อย"
                style={{
                  maxWidth: '100px',
                  maxHeight: '100px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 12px rgba(245, 166, 35, 0.5))',
                  animation: 'gentleBob 3s ease-in-out infinite alternate',
                }}
              />
            </div>

            <h2 style={{
              fontSize: '21px',
              fontWeight: 700,
              color: '#f5f5f7',
              margin: '0 0 6px',
              letterSpacing: '-0.02em',
            }}>
              กระทงของคุณลอยสู่แม่น้ำแล้ว
            </h2>

            <p style={{
              fontSize: '13.5px',
              color: '#86868b',
              margin: '0 0 18px',
              lineHeight: 1.55,
            }}>
              คำอธิษฐานของ <strong>{releasedKrathong.name}</strong> ลอยส่องแสงเคียงคู่ผู้เล่นทุกคนใต้แสงจันทร์เต็มดวง
            </p>

            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '12px 16px',
              fontSize: '13px',
              color: '#fde68a',
              fontStyle: 'italic',
              marginBottom: '24px',
              lineHeight: 1.5,
            }}>
              "{releasedKrathong.wish}"
            </div>

            {/* Apple Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => showPage('river')}
                style={{
                  width: '100%',
                  height: '46px',
                  background: 'linear-gradient(180deg, #f5a623 0%, #d97706 100%)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  fontSize: '14.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 6px 20px rgba(245, 166, 35, 0.35)',
                }}
              >
                ดูแม่น้ำทันที (/River) <i className="fas fa-arrow-right" style={{ fontSize: '11px' }} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setReleasedKrathong(null)
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
                  height: '44px',
                  background: 'transparent',
                  border: 'none',
                  color: '#86868b',
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  transition: 'color 0.14s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#86868b' }}
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
        @keyframes appleModalFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
