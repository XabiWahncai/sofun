import React, { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Canvas helper for rounded rectangles
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

// Canvas helper for text wrapping with Thai character support
function wrapTextThai(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  if (!text) return
  const chars = Array.from(text)
  let line = ''
  let currentY = y
  let linesCount = 0

  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i]
    const testWidth = ctx.measureText(testLine).width
    if (testWidth > maxWidth && line.length > 0) {
      linesCount++
      if (linesCount >= maxLines) {
        ctx.fillText(line.trim() + '...', x, currentY)
        return
      }
      ctx.fillText(line.trim(), x, currentY)
      line = chars[i]
      currentY += lineHeight
    } else {
      line = testLine
    }
  }
  if (line.trim().length > 0) {
    ctx.fillText(line.trim(), x, currentY)
  }
}

// High-resolution Souvenir Card Generator (800x1000px PNG)
export function generateKrathongCardDataUrl(krathong) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 1000
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return reject(new Error('Canvas 2D context not available'))
      }

      // 1. Twilight / Evening Night Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 1000)
      skyGrad.addColorStop(0, '#0a0d1e')
      skyGrad.addColorStop(0.32, '#1e1438')
      skyGrad.addColorStop(0.52, '#3b172a')
      skyGrad.addColorStop(0.68, '#211226')
      skyGrad.addColorStop(0.82, '#0c1830')
      skyGrad.addColorStop(1, '#050a17')
      ctx.fillStyle = skyGrad
      ctx.fillRect(0, 0, 800, 1000)

      // 2. Night Sky Stars
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      const stars = [
        [70, 75, 1.5], [140, 130, 2], [220, 55, 1.2], [310, 100, 1.8],
        [470, 85, 1.4], [570, 125, 2.2], [670, 65, 1.5], [730, 115, 1.8],
        [110, 210, 1.2], [270, 190, 1.6], [510, 200, 1.5], [650, 220, 1.4],
        [190, 270, 1.3], [380, 160, 1.2], [430, 230, 1.5], [760, 190, 1.4],
      ]
      stars.forEach(([x, y, r]) => {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      })

      // 3. Glowing Full Moon
      const moonX = 640
      const moonY = 160
      const moonHalo = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 140)
      moonHalo.addColorStop(0, 'rgba(254, 240, 138, 0.45)')
      moonHalo.addColorStop(0.45, 'rgba(245, 158, 11, 0.16)')
      moonHalo.addColorStop(1, 'transparent')
      ctx.fillStyle = moonHalo
      ctx.beginPath()
      ctx.arc(moonX, moonY, 140, 0, Math.PI * 2)
      ctx.fill()

      // Full Moon Disc
      ctx.fillStyle = '#fef3c7'
      ctx.shadowColor = '#fef08a'
      ctx.shadowBlur = 28
      ctx.beginPath()
      ctx.arc(moonX, moonY, 44, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // 4. River Horizon & Water Blend
      const riverGrad = ctx.createLinearGradient(0, 480, 0, 1000)
      riverGrad.addColorStop(0, 'rgba(24, 30, 60, 0.78)')
      riverGrad.addColorStop(0.3, 'rgba(12, 28, 54, 0.92)')
      riverGrad.addColorStop(0.7, 'rgba(8, 18, 38, 0.96)')
      riverGrad.addColorStop(1, '#050a17')
      ctx.fillStyle = riverGrad
      ctx.fillRect(0, 480, 800, 520)

      // Water Waves
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.22)'
      ctx.lineWidth = 1.4
      for (let y = 510; y <= 740; y += 40) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        for (let x = 0; x <= 800; x += 80) {
          ctx.quadraticCurveTo(x + 40, y + (Math.sin(x) * 5), x + 80, y)
        }
        ctx.stroke()
      }

      // Golden Moon Water Shimmer
      const shimmerGrad = ctx.createLinearGradient(moonX - 50, 480, moonX + 50, 750)
      shimmerGrad.addColorStop(0, 'rgba(254, 240, 138, 0.32)')
      shimmerGrad.addColorStop(0.6, 'rgba(245, 158, 11, 0.14)')
      shimmerGrad.addColorStop(1, 'transparent')
      ctx.fillStyle = shimmerGrad
      ctx.fillRect(moonX - 60, 480, 120, 270)

      // 5. Header Typography
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fef08a'
      ctx.font = 'bold 22px Sarabun, sans-serif'
      ctx.fillText('เทศกาลลอยกระทงดิจิทัล • SOFUN CLUB', 400, 68)

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.font = '14px Sarabun, sans-serif'
      ctx.fillText('แม่น้ำสายบุญใต้แสงจันทร์วันเพ็ญ เดือน 12', 400, 96)

      const finalizeCard = (img) => {
        // Water Halo beneath Krathong
        const haloGrad = ctx.createRadialGradient(400, 540, 15, 400, 540, 160)
        haloGrad.addColorStop(0, 'rgba(254, 240, 138, 0.42)')
        haloGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.18)')
        haloGrad.addColorStop(1, 'transparent')
        ctx.fillStyle = haloGrad
        ctx.beginPath()
        ctx.ellipse(400, 540, 160, 60, 0, 0, Math.PI * 2)
        ctx.fill()

        // Draw Krathong image
        if (img) {
          const kw = 260
          const kh = 260
          ctx.shadowColor = 'rgba(245, 158, 11, 0.65)'
          ctx.shadowBlur = 24
          ctx.drawImage(img, 400 - (kw / 2), 470 - (kh / 2), kw, kh)
          ctx.shadowBlur = 0
        }

        // Candle Flame Glow
        ctx.fillStyle = '#fef08a'
        ctx.shadowColor = '#f59e0b'
        ctx.shadowBlur = 18
        ctx.beginPath()
        ctx.arc(400, 375, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0

        // Info Card Container
        const cardX = 60
        const cardY = 645
        const cardW = 680
        const cardH = 275

        // Frosted Card Backdrop
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.5)'
        ctx.lineWidth = 1.8
        roundRect(ctx, cardX, cardY, cardW, cardH, 20)
        ctx.fill()
        ctx.stroke()

        // Owner Name
        ctx.fillStyle = '#f59e0b'
        ctx.font = 'bold 22px Sarabun, sans-serif'
        ctx.fillText(`คุณ ${krathong.name || 'ผู้ร่วมลอยกระทง'}`, 400, cardY + 44)

        // Wish Quote
        ctx.fillStyle = '#ffffff'
        ctx.font = 'italic 16.5px Sarabun, sans-serif'
        const wishText = krathong.wish ? `"${krathong.wish}"` : '"ขอพรพระแม่คงคา จงดลบันดาลให้มีความสุขความเจริญ"'
        wrapTextThai(ctx, wishText, 400, cardY + 86, 580, 26, 3)

        // Divider Line
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.25)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cardX + 40, cardY + 185)
        ctx.lineTo(cardX + cardW - 40, cardY + 185)
        ctx.stroke()

        // Date & Sadhu Counter
        ctx.fillStyle = 'rgba(254, 240, 138, 0.9)'
        ctx.font = '14px Sarabun, sans-serif'
        const dateStr = krathong.createdAtFormatted || 'เทศกาลลอยกระทง 2569'
        const likesCount = krathong.sadhuCount || krathong.likes || 0
        ctx.fillText(`${dateStr}   •   ยอดร่วมอนุโมทนาบุญ ${likesCount} สาธุ`, 400, cardY + 215)

        // Footer URL / Brand
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.font = '12.5px Sarabun, sans-serif'
        ctx.fillText('sofunclub.co/River   •   สายน้ำแห่งคำอธิษฐานใต้แสงจันทร์', 400, cardY + 248)

        // Outer Golden Frame
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.35)'
        ctx.lineWidth = 1.5
        roundRect(ctx, 16, 16, 768, 968, 14)
        ctx.stroke()

        resolve(canvas.toDataURL('image/png'))
      }

      if (krathong.imageData) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => finalizeCard(img)
        img.onerror = () => finalizeCard(null)
        img.src = krathong.imageData
      } else {
        finalizeCard(null)
      }
    } catch (err) {
      reject(err)
    }
  })
}

export default function MyKrathongsModal({
  isOpen,
  onClose,
  lineUser,
  showPage,
  onSelectKrathong,
  showToast,
}) {
  const [krathongs, setKrathongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState(null)
  const [filterQuery, setFilterQuery] = useState('')

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setLoading(true)

    async function loadMyKrathongs() {
      try {
        const mergedMap = new Map()

        // 1. Read from localStorage: sofun_my_krathongs (Full cached objects)
        try {
          const localItems = JSON.parse(localStorage.getItem('sofun_my_krathongs') || '[]')
          if (Array.isArray(localItems)) {
            localItems.forEach((item) => {
              if (item && item.id) {
                mergedMap.set(item.id, {
                  ...item,
                  source: 'local',
                })
              }
            })
          }
        } catch (e) {
          console.warn('Error reading sofun_my_krathongs from localStorage:', e)
        }

        // 2. Read from localStorage: sofun_my_krathong_ids (Array of doc IDs)
        let localIds = []
        try {
          localIds = JSON.parse(localStorage.getItem('sofun_my_krathong_ids') || '[]')
          if (!Array.isArray(localIds)) localIds = []
        } catch (e) {
          localIds = []
        }

        // 3. Query Firestore by userId if user is logged into LINE
        if (lineUser?.userId) {
          try {
            const q = query(
              collection(db, 'krathongs'),
              where('userId', '==', lineUser.userId)
            )
            const snap = await getDocs(q)
            snap.forEach((docSnap) => {
              const d = docSnap.data()
              mergedMap.set(docSnap.id, {
                id: docSnap.id,
                name: d.name || 'ผู้ร่วมลอยกระทง',
                wish: d.wish || 'ขอพรพระแม่คงคา',
                imageData: d.imageData || null,
                createdAt: d.createdAt,
                sadhuCount: d.sadhuCount || d.likes || 0,
                likes: d.likes || d.sadhuCount || 0,
                hidden: d.hidden === true || d.isVisible === false,
                source: 'firestore-user',
              })
            })
          } catch (e) {
            console.warn('Firestore userId query error:', e)
          }
        }

        // 4. Also fetch latest data for localIds to get live sadhu/like counts
        if (localIds.length > 0) {
          const fetchPromises = localIds.slice(0, 30).map(async (id) => {
            try {
              const docSnap = await getDoc(doc(db, 'krathongs', id))
              if (docSnap.exists()) {
                const d = docSnap.data()
                const existing = mergedMap.get(id) || {}
                mergedMap.set(id, {
                  ...existing,
                  id: docSnap.id,
                  name: d.name || existing.name || 'ผู้ร่วมลอยกระทง',
                  wish: d.wish || existing.wish || 'ขอพรพระแม่คงคา',
                  imageData: d.imageData || existing.imageData || null,
                  createdAt: d.createdAt || existing.createdAt,
                  sadhuCount: d.sadhuCount || d.likes || existing.sadhuCount || 0,
                  likes: d.likes || d.sadhuCount || existing.likes || 0,
                  hidden: d.hidden === true || d.isVisible === false,
                  source: 'firestore-id',
                })
              }
            } catch (err) {
              // Ignore single doc failure
            }
          })
          await Promise.all(fetchPromises)
        }

        // Filter out hidden krathongs and format dates
        const list = Array.from(mergedMap.values())
          .filter((k) => !k.hidden)
          .map((k) => {
            let formattedDate = 'เทศกาลลอยกระทง 2569'
            let dateObj = null
            if (k.createdAt) {
              if (k.createdAt.toDate && typeof k.createdAt.toDate === 'function') {
                dateObj = k.createdAt.toDate()
              } else if (typeof k.createdAt === 'string') {
                dateObj = new Date(k.createdAt)
              } else if (k.createdAt.seconds) {
                dateObj = new Date(k.createdAt.seconds * 1000)
              }
            }
            if (dateObj && !isNaN(dateObj.getTime())) {
              formattedDate = dateObj.toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            }
            return {
              ...k,
              createdAtFormatted: formattedDate,
              rawDateObj: dateObj,
            }
          })
          .sort((a, b) => {
            const timeA = a.rawDateObj ? a.rawDateObj.getTime() : 0
            const timeB = b.rawDateObj ? b.rawDateObj.getTime() : 0
            return timeB - timeA
          })

        if (isMounted) {
          setKrathongs(list)
          setLoading(false)
        }
      } catch (err) {
        console.error('Error loading my krathongs:', err)
        if (isMounted) setLoading(false)
      }
    }

    loadMyKrathongs()

    return () => {
      isMounted = false
    }
  }, [isOpen, lineUser?.userId])

  // Download Transparent Krathong PNG
  const handleDownloadRawPng = (krathong) => {
    if (!krathong.imageData) {
      if (showToast) showToast('ไม่พบข้อมูลรูปภาพกระทง')
      return
    }
    try {
      const link = document.createElement('a')
      link.href = krathong.imageData
      const safeName = (krathong.name || 'my-krathong').replace(/[^\w\u0E00-\u0E7F]/g, '_')
      link.download = `krathong-${safeName}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      if (showToast) showToast('บันทึกรูปกระทง PNG สำเร็จแล้ว')
    } catch (err) {
      console.error('Download raw PNG failed:', err)
      alert('บันทึกรูปภาพไม่สำเร็จ โปรดลองใหม่อีกครั้ง')
    }
  }

  // Download High-Resolution Souvenir Card PNG
  const handleDownloadCardPng = async (krathong) => {
    try {
      setDownloadingId(krathong.id)
      const dataUrl = await generateKrathongCardDataUrl(krathong)
      const link = document.createElement('a')
      link.href = dataUrl
      const safeName = (krathong.name || 'sofun').replace(/[^\w\u0E00-\u0E7F]/g, '_')
      link.download = `krathong-card-${safeName}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      if (showToast) showToast('บันทึกการ์ดที่ระลึก PNG สำเร็จแล้ว')
    } catch (err) {
      console.error('Download souvenir card failed:', err)
      alert('เกิดข้อผิดพลาดในการสร้างการ์ดที่ระลึก โปรดลองใหม่อีกครั้ง')
    } finally {
      setDownloadingId(null)
    }
  }

  // Filtered by search query
  const filteredKrathongs = useMemo(() => {
    if (!filterQuery.trim()) return krathongs
    const q = filterQuery.toLowerCase()
    return krathongs.filter((k) =>
      k.name.toLowerCase().includes(q) ||
      k.wish.toLowerCase().includes(q)
    )
  }, [krathongs, filterQuery])

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(3, 7, 18, 0.82)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      fontFamily: "'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Modal Container */}
      <div style={{
        background: 'linear-gradient(180deg, #0d1527 0%, #080d19 100%)',
        border: '1.5px solid rgba(254, 240, 138, 0.4)',
        borderRadius: '24px',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(245, 158, 11, 0.2)',
        maxWidth: '780px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        animation: 'modalSlideUp 0.25s ease-out',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.65)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.35) 100%)',
              border: '1px solid rgba(254, 240, 138, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fef08a',
              fontSize: '18px',
              boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)',
            }}>
              <i className="fas fa-layer-group" />
            </div>
            <div>
              <h2 style={{
                fontSize: '18px',
                fontWeight: 800,
                color: '#fef08a',
                margin: 0,
                letterSpacing: '0.01em',
              }}>
                กระทงของฉัน
              </h2>
              <p style={{
                fontSize: '12.5px',
                color: 'rgba(255, 255, 255, 0.7)',
                margin: '2px 0 0',
              }}>
                ตรวจดูกระทงย้อนหลังและบันทึกรูปภาพ PNG คุณภาพสูง
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="ปิดหน้าต่าง"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)'
              e.currentTarget.style.transform = 'scale(1.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <i className="fas fa-xmark" />
          </button>
        </div>

        {/* Search Bar / Controls */}
        {krathongs.length > 2 && (
          <div style={{
            padding: '12px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(10, 16, 30, 0.5)',
          }}>
            <div style={{ position: 'relative' }}>
              <i
                className="fas fa-search"
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255, 255, 255, 0.45)',
                  fontSize: '13px',
                }}
              />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="ค้นหากระทงตามชื่อ หรือคำอธิษฐาน..."
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(254, 240, 138, 0.25)',
                  borderRadius: '12px',
                  padding: '9px 14px 9px 38px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}

        {/* Content Body: Scrollable Krathongs List */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}>
          {loading ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'rgba(255, 255, 255, 0.7)',
            }}>
              <i
                className="fas fa-spinner fa-spin"
                style={{ fontSize: '28px', color: '#f59e0b', marginBottom: '14px' }}
              />
              <p style={{ fontSize: '14px', margin: 0 }}>กำลังค้นหากระทงของคุณในสายน้ำ...</p>
            </div>
          ) : filteredKrathongs.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '50px 24px',
              background: 'rgba(15, 23, 42, 0.45)',
              borderRadius: '20px',
              border: '1px dashed rgba(254, 240, 138, 0.25)',
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '20px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fef08a',
                fontSize: '28px',
                margin: '0 auto 16px',
              }}>
                <i className="fas fa-water" />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#fef08a', margin: '0 0 8px' }}>
                {filterQuery ? 'ไม่พบกระทงที่ตรงกับคำค้นหา' : 'ยังไม่พบประวัติกระทงของคุณ'}
              </h3>
              <p style={{
                fontSize: '13.5px',
                color: 'rgba(255, 255, 255, 0.65)',
                lineHeight: 1.6,
                maxWidth: '420px',
                margin: '0 auto 24px',
              }}>
                {filterQuery
                  ? 'โปรดลองค้นหาด้วยคำอื่น หรือล้างช่องค้นหาเพื่อดูกระทงทั้งหมด'
                  : 'ร่วมวาดกระทงใบแรกด้วยฝีมือคุณ แล้วปล่อยคำอธิษฐานลอยลงสู่แม่น้ำสายบุญใต้แสงจันทร์'}
              </p>
              {showPage && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    showPage('krathong')
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    border: 'none',
                    color: '#ffffff',
                    borderRadius: '12px',
                    padding: '10px 22px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(245, 158, 11, 0.35)',
                  }}
                >
                  <i className="fas fa-paint-brush" /> วาดกระทงเลย (/Krathong)
                </button>
              )}
            </div>
          ) : (
            filteredKrathongs.map((k) => (
              <div
                key={k.id}
                style={{
                  background: 'rgba(15, 23, 42, 0.72)',
                  border: '1.5px solid rgba(254, 240, 138, 0.35)',
                  borderRadius: '18px',
                  padding: '18px',
                  display: 'flex',
                  gap: '18px',
                  alignItems: 'center',
                  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
                  transition: 'border-color 0.2s ease, transform 0.2s ease',
                  flexWrap: 'wrap',
                }}
              >
                {/* Krathong Visual Thumbnail with Water Backdrop */}
                <div style={{
                  width: '130px',
                  height: '130px',
                  borderRadius: '14px',
                  background: 'radial-gradient(ellipse at 50% 65%, rgba(245, 158, 11, 0.25) 0%, rgba(15, 23, 42, 0.95) 70%)',
                  border: '1px solid rgba(254, 240, 138, 0.3)',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}>
                  {/* Subtle Candle Halo */}
                  <div style={{
                    position: 'absolute',
                    top: '25%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(254, 240, 138, 0.7) 0%, rgba(245, 158, 11, 0.2) 65%, transparent 100%)',
                    filter: 'blur(4px)',
                  }} />

                  {k.imageData ? (
                    <img
                      src={k.imageData}
                      alt={k.name}
                      style={{
                        maxWidth: '105px',
                        maxHeight: '95px',
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.5))',
                        position: 'relative',
                        zIndex: 1,
                      }}
                    />
                  ) : (
                    <i className="fas fa-water" style={{ fontSize: '32px', color: '#f59e0b' }} />
                  )}
                </div>

                {/* Krathong Meta Details */}
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '6px',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontSize: '16.5px',
                      fontWeight: 800,
                      color: '#fef08a',
                      letterSpacing: '0.01em',
                    }}>
                      คุณ {k.name}
                    </span>

                    {/* Sadhu Count Badge */}
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(245, 158, 11, 0.2)',
                      border: '1px solid rgba(245, 158, 11, 0.45)',
                      color: '#fef08a',
                      borderRadius: '9999px',
                      padding: '2px 10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                    }}>
                      <i className="fas fa-praying-hands" style={{ color: '#f59e0b' }} />
                      {k.sadhuCount || k.likes || 0} สาธุ
                    </span>

                    {/* Creation Date */}
                    <span style={{
                      fontSize: '11.5px',
                      color: 'rgba(255, 255, 255, 0.5)',
                      marginLeft: 'auto',
                    }}>
                      <i className="fas fa-calendar-alt" style={{ marginRight: '4px' }} />
                      {k.createdAtFormatted}
                    </span>
                  </div>

                  {/* Wish Text Box */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    fontStyle: 'italic',
                    marginBottom: '14px',
                    wordBreak: 'break-word',
                  }}>
                    "{k.wish}"
                  </div>

                  {/* Action Buttons */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}>
                    {/* Button 1: Download Souvenir Card PNG */}
                    <button
                      type="button"
                      disabled={downloadingId === k.id}
                      onClick={() => handleDownloadCardPng(k)}
                      title="บันทึกการ์ดที่ระลึกภาพสวยงามความละเอียดสูง (PNG)"
                      style={{
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '9999px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: downloadingId === k.id ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 10px rgba(245, 158, 11, 0.35)',
                        opacity: downloadingId === k.id ? 0.7 : 1,
                      }}
                    >
                      {downloadingId === k.id ? (
                        <>
                          <i className="fas fa-spinner fa-spin" /> กำลังสร้างการ์ด...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-id-card" /> บันทึกการ์ดที่ระลึก (PNG)
                        </>
                      )}
                    </button>

                    {/* Button 2: Download Transparent Krathong PNG */}
                    <button
                      type="button"
                      onClick={() => handleDownloadRawPng(k)}
                      title="บันทึกเฉพาะตัวกระทงโปร่งใส (PNG)"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.18)',
                        color: '#fef08a',
                        borderRadius: '9999px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <i className="fas fa-image" /> บันทึกรูปกระทง (PNG)
                    </button>

                    {/* Button 3: View on River (if supported) */}
                    {(onSelectKrathong || showPage) && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose()
                          if (onSelectKrathong) {
                            onSelectKrathong(k)
                          } else if (showPage) {
                            showPage('river')
                          }
                        }}
                        title="เปิดดูกระทงในแม่น้ำสายบุญ"
                        style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#38bdf8',
                          borderRadius: '9999px',
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginLeft: 'auto',
                        }}
                      >
                        <i className="fas fa-water" /> ดูในแม่น้ำ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.55)',
        }}>
          <div>
            ประวัติทั้งหมด: {krathongs.length} ใบ
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 600,
            }}
          >
            ปิด
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(18px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
