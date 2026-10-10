import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, getDoc
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { db, storage, appFunctions } from '../firebase'
import { useOpenProfile } from '../UserProfileContext'

// ── Room Constants & Palette ───────────────────────────────────────────────────
const ALL_ROOMS = [
  'Waiting Area 1', 'Waiting Area 2', '404 Bar', 'Japanese Room',
  'Chinese Room', 'Europe Room', 'Ghost Room', 'Projector Room',
  '5 Floor', 'Yang', 'Chinese DM', 'Thai DM',
]

const ROOM_COLORS = {
  'Waiting Area 1': '#64748b', 'Waiting Area 2': '#475569',
  '404 Bar': '#d97706', 'Japanese Room': '#dc2626',
  'Chinese Room': '#ea580c', 'Europe Room': '#2563eb',
  'Ghost Room': '#7c3aed', 'Projector Room': '#0891b2',
  '5 Floor': '#16a34a', 'Yang': '#db2777',
  'Chinese DM': '#c62419', 'Thai DM': '#b45309',
}

const STATUS_LABELS = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  locked: 'ล็อกห้องแล้ว',
  collapsed: 'ปาร์ตี้ล่ม',
  cancelled: 'ปิดตี้แล้ว',
}

const STATUS_COLORS = {
  pending:   { bg: 'rgba(0,0,0,0.05)',       color: '#555555', border: 'rgba(0,0,0,0.14)'     },
  confirmed: { bg: 'rgba(200,160,80,0.12)',   color: '#1a1a1a', border: 'rgba(200,160,80,0.35)'},
  locked:    { bg: 'rgba(200,160,80,0.18)',   color: '#1a1a1a', border: 'rgba(200,160,80,0.45)'},
  collapsed: { bg: 'rgba(198,36,25,0.07)',    color: '#c62419', border: 'rgba(198,36,25,0.2)' },
  cancelled: { bg: 'rgba(0,0,0,0.05)',        color: '#555555', border: 'rgba(0,0,0,0.14)'    },
}

const TIME_SLOTS = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']

// ── PromptPay QR Generation (EMVCo standard) ──────────────────────────────────
function crc16(str) {
  let crc = 0xFFFF
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
  }
  return crc & 0xFFFF
}

function buildPromptPayQR(phoneOrId, amount) {
  if (!phoneOrId) return ''
  const f = (tag, val) => { const v = String(val); return `${tag}${v.length.toString().padStart(2, '0')}${v}` }
  const clean = String(phoneOrId).replace(/[^0-9]/g, '')
  let targetTag = '01'
  let targetVal = ''
  if (clean.length >= 13) {
    targetTag = '02'
    targetVal = clean.slice(0, 13)
  } else {
    let p = clean
    if (p.startsWith('0')) p = '66' + p.slice(1)
    if (!p.startsWith('00')) p = '00' + p
    targetVal = p.padStart(13, '0')
    targetTag = '01'
  }
  const acct = f('00', 'A000000677010111') + f(targetTag, targetVal)
  let s = f('00', '01') + f('01', amount > 0 ? '12' : '11') + f('29', acct) + f('53', '764')
  if (amount > 0) s += f('54', Number(amount).toFixed(2))
  s += f('58', 'TH') + '6304'
  return s + crc16(s).toString(16).toUpperCase().padStart(4, '0')
}

// ── Date & Image Helpers ───────────────────────────────────────────────────────
const MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]
const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

function pad2(n) { return String(n).padStart(2, '0') }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function fmtDate(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${parseInt(d)} ${MONTH_NAMES[parseInt(m) - 1]} ${parseInt(y) + 543}`
}
function formatCountdown(isoStr) {
  if (!isoStr) return ''
  const diff = new Date(isoStr) - new Date()
  if (diff <= 0) return 'หมดเวลา'
  const days = Math.floor(diff / 86400000)
  const hrs = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `${days}ว ${hrs}ชม`
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hrs > 0) return `${hrs}ชม ${mins}น`
  return `${mins}น`
}

const toWsrv = (id, w = 400) =>
  `https://wsrv.nl/?url=https://drive.usercontent.google.com/download?id=${id}%26export%3Dview&w=${w}&output=webp`

function convertImg(url, w = 400) {
  if (!url) return url
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^=?/]+)/)
  if (lh3) return toWsrv(lh3[1], w)
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (m1) return toWsrv(m1[1], w)
  const m2 = url.match(/[?&]id=([^&]+)/)
  if (m2) return toWsrv(m2[1], w)
  return url
}

// ── Status Badge Component ─────────────────────────────────────────────────────
function StatusBadge({ status, label }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.cancelled
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '2px 9px', borderRadius: '20px',
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.03em',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      flexShrink: 0, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor' }} />
      {label || STATUS_LABELS[status] || status}
    </span>
  )
}

const DAY_NAMES_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์']

// ── Google-Calendar-style Monthly Grid ────────────────────────────────────────
function BookingCalendar({ bookings, onDayClick, selectedDate, onEventClick, onBookToday }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedRoomFilter, setSelectedRoomFilter] = useState('all')
  const [viewModeOverride, setViewModeOverride] = useState('auto') // 'auto' | 'bars' | 'cards'
  const calendarRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(700)

  useEffect(() => {
    if (!calendarRef.current) return
    const updateWidth = () => {
      if (calendarRef.current) {
        setContainerWidth(calendarRef.current.offsetWidth)
      }
    }
    updateWidth()

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setContainerWidth(entry.contentRect.width)
          }
        }
      })
      ro.observe(calendarRef.current)
      return () => ro.disconnect()
    }
  }, [])

  const cellWidth = (containerWidth - 2) / 7
  const isNarrow = cellWidth < 85 || containerWidth < 580
  const useBarMode = viewModeOverride === 'bars' || (viewModeOverride === 'auto' && isNarrow)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const todayStr = toDateStr(today)
  const activeDateStr = selectedDate || todayStr

  const bookingsByDate = {}
  bookings.forEach(b => {
    if (!b.date || b.status === 'cancelled' || b.status === 'collapsed') return
    if (!bookingsByDate[b.date]) bookingsByDate[b.date] = []
    bookingsByDate[b.date].push(b)
  })

  const selectedDayBookings = (bookingsByDate[activeDateStr] || [])
    .slice()
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // Total bookings in this month for stats
  const totalMonthBookings = Object.entries(bookingsByDate).reduce((acc, [d, list]) => {
    if (d.startsWith(`${viewYear}-${pad2(viewMonth + 1)}`)) return acc + list.length
    return acc
  }, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'Sarabun, sans-serif' }}>

      {/* ── Header: Month + Navigation ─────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        padding: '14px 18px',
        borderRadius: '16px',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 2px 8px -2px rgba(0,0,0,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(198,36,25,0.12), rgba(198,36,25,0.04))',
            border: '1px solid rgba(198,36,25,0.2)',
            color: 'var(--crimson-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '17px', flexShrink: 0,
          }}>
            <i className="far fa-calendar-alt" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <h2 style={{
                fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)',
                letterSpacing: '-0.01em', margin: 0,
              }}>
                {MONTH_NAMES[viewMonth]}
              </h2>
              <span style={{
                fontSize: '15px', fontWeight: 800, color: 'var(--crimson-500)',
                background: 'rgba(198,36,25,0.08)', padding: '1px 8px', borderRadius: '6px',
              }}>
                {viewYear + 543}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>ตารางจองเดือนนี้</span>
              {totalMonthBookings > 0 && (
                <span style={{
                  background: 'rgba(34,197,94,0.1)', color: '#16a34a',
                  padding: '0 6px', borderRadius: '10px', fontWeight: 700, fontSize: '10px',
                }}>
                  {totalMonthBookings} รอบ
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Controls + View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Toggle View Mode: Bars vs Detail Cards */}
          <button
            type="button"
            onClick={() => setViewModeOverride(m => {
              if (m === 'auto') return useBarMode ? 'cards' : 'bars'
              return m === 'bars' ? 'cards' : 'bars'
            })}
            title={useBarMode ? 'สลับเป็นมุมมองแสดงการ์ดข้อความ' : 'สลับเป็นมุมมองแท่งสีห้อง'}
            style={{
              padding: '7px 12px', borderRadius: '10px',
              border: '1px solid rgba(0,0,0,0.08)',
              background: useBarMode ? 'rgba(198,36,25,0.08)' : '#fff',
              color: useBarMode ? 'var(--crimson-500)' : 'var(--text-secondary)',
              fontSize: '12px', fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <i className={useBarMode ? "fas fa-bars" : "fas fa-th-large"} style={{ fontSize: '11px' }} />
            <span>{useBarMode ? 'แท่งสีห้อง' : 'การ์ดข้อความ'}</span>
          </button>

          <button
            onClick={goToday}
            style={{
              padding: '7px 14px', borderRadius: '10px',
              border: '1px solid rgba(0,0,0,0.08)',
              background: '#fff', color: 'var(--text-secondary)',
              fontSize: '12px', fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--crimson-500)'
              e.currentTarget.style.color = 'var(--crimson-500)'
              e.currentTarget.style.background = 'rgba(198,36,25,0.04)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.background = '#fff'
            }}
          >
            <i className="fas fa-bullseye" style={{ fontSize: '11px', color: 'var(--crimson-500)' }} />
            วันนี้
          </button>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: '10px', overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}>
            <button
              onClick={prevMonth}
              title="เดือนก่อนหน้า"
              style={{
                width: '34px', height: '34px', border: 'none', background: 'transparent',
                color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <i className="fas fa-chevron-left" style={{ fontSize: '11px' }} />
            </button>
            <div style={{ width: '1px', height: '18px', background: 'rgba(0,0,0,0.08)' }} />
            <button
              onClick={nextMonth}
              title="เดือนถัดไป"
              style={{
                width: '34px', height: '34px', border: 'none', background: 'transparent',
                color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <i className="fas fa-chevron-right" style={{ fontSize: '11px' }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Room Filter Chips ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        overflowX: 'auto', paddingBottom: '4px',
        scrollbarWidth: 'none',
      }}>
        <button
          onClick={() => setSelectedRoomFilter('all')}
          style={{
            flexShrink: 0, padding: '5px 14px', borderRadius: '20px',
            fontSize: '11px', fontWeight: 800, cursor: 'pointer',
            border: selectedRoomFilter === 'all' ? '1px solid var(--crimson-500)' : '1px solid rgba(0,0,0,0.08)',
            background: selectedRoomFilter === 'all' ? 'var(--crimson-500)' : '#fff',
            color: selectedRoomFilter === 'all' ? '#fff' : 'var(--text-secondary)',
            boxShadow: selectedRoomFilter === 'all' ? '0 2px 8px rgba(198,36,25,0.25)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          ทั้งหมด
        </button>
        {ALL_ROOMS.map(r => {
          const isSel = selectedRoomFilter === r
          const rc = ROOM_COLORS[r] || '#64748b'
          return (
            <button
              key={r}
              onClick={() => setSelectedRoomFilter(curr => curr === r ? 'all' : r)}
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                cursor: 'pointer',
                border: `1px solid ${isSel ? rc : 'rgba(0,0,0,0.08)'}`,
                background: isSel ? `${rc}18` : '#fff',
                color: isSel ? rc : 'var(--text-secondary)',
                boxShadow: isSel ? `0 2px 8px ${rc}30` : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: rc, flexShrink: 0,
                boxShadow: isSel ? `0 0 6px ${rc}` : 'none',
              }} />
              {r}
            </button>
          )
        })}
      </div>

      {/* ── Monthly Grid Card (Locked Cell Dimensions) ───────────────── */}
      <div
        ref={calendarRef}
        style={{
          borderRadius: '18px',
          border: '1px solid rgba(0,0,0,0.08)',
          overflow: 'hidden',
          background: '#fff',
          boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05), 0 2px 6px -1px rgba(0,0,0,0.02)',
        }}
      >
        {/* Day-of-week header */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7,1fr)',
          background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
        }}>
          {DAY_NAMES_FULL.map((d, i) => {
            const isSun = i === 0
            const isSat = i === 6
            const headerColor = isSun ? 'var(--crimson-500)' : isSat ? '#2563eb' : '#475569'
            return (
              <div
                key={d}
                style={{
                  padding: '10px 2px', textAlign: 'center',
                  fontSize: '11px', fontWeight: 800,
                  color: headerColor,
                  letterSpacing: '0.02em',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                }}
              >
                <span>{d}</span>
                <span style={{ fontSize: '9px', opacity: 0.65, fontWeight: 700 }}>
                  {DAY_NAMES[i]}
                </span>
              </div>
            )
          })}
        </div>

        {/* Calendar cells: STRICTLY LOCKED 92px HEIGHT */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {cells.map((day, idx) => {
            const col = idx % 7
            const isSun = col === 0
            const isSat = col === 6
            const isLastCol = col === 6
            const isLastRow = idx >= cells.length - 7

            const borderRight = isLastCol ? 'none' : '1px solid rgba(0,0,0,0.05)'
            const borderBottom = isLastRow ? 'none' : '1px solid rgba(0,0,0,0.05)'

            if (!day) {
              return (
                <div key={`e-${idx}`} style={{ height: '110px', background: 'rgba(0,0,0,0.018)', borderRight, borderBottom }} />
              )
            }

            const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
            let dayBookings = bookingsByDate[dateStr] || []
            if (selectedRoomFilter !== 'all') dayBookings = dayBookings.filter(b => b.room === selectedRoomFilter)
            const dayBookingsSorted = dayBookings.slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''))
            const isToday = todayStr === dateStr
            const isSel = activeDateStr === dateStr
            const isPast = dateStr < todayStr

            const cellBg = isSel
              ? 'rgba(198,36,25,0.04)'
              : isToday
              ? 'rgba(245,158,11,0.03)'
              : isPast
              ? '#fcfcfd'
              : '#ffffff'

            return (
              <div
                key={day}
                onClick={() => onDayClick(dateStr)}
                style={{ height: '110px', overflow: 'hidden', padding: '8px 6px 6px', display: 'flex', flexDirection: 'column', gap: '3px', cursor: 'pointer', background: cellBg, borderRight, borderBottom, transition: 'background 0.12s', position: 'relative', boxShadow: isSel ? 'inset 0 0 0 2px var(--crimson-500)' : 'none' }}
                onMouseEnter={e => { if (!isSel && !isToday) e.currentTarget.style.background = 'rgba(0,0,0,0.025)' }}
                onMouseLeave={e => e.currentTarget.style.background = cellBg}
              >
                {/* Cell Header: Date Number & Indicator */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '2px', flexShrink: 0,
                }}>
                  {/* Left tag if today */}
                  {isToday ? (
                    <span style={{
                      fontSize: '8.5px', fontWeight: 900,
                      color: 'var(--crimson-500)',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                    }}>
                      วันนี้
                    </span>
                  ) : dayBookingsSorted.length > 0 ? (
                    <span style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: 'var(--crimson-500)', opacity: 0.8,
                    }} />
                  ) : <span />}

                  {/* Day Number badge */}
                  <span style={{
                    width: '21px', height: '21px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11.5px', fontWeight: 800, flexShrink: 0,
                    color: isToday
                      ? '#fff'
                      : isSel
                      ? 'var(--crimson-500)'
                      : isSun
                      ? 'var(--crimson-500)'
                      : isSat
                      ? '#2563eb'
                      : isPast
                      ? '#94a3b8'
                      : '#1e293b',
                    background: isToday
                      ? 'linear-gradient(135deg, var(--crimson-500), #e11d48)'
                      : isSel
                      ? 'rgba(198,36,25,0.14)'
                      : 'transparent',
                    boxShadow: isToday ? '0 2px 5px rgba(198,36,25,0.35)' : 'none',
                  }}>
                    {day}
                  </span>
                </div>

                {/* Event bars */}
                {dayBookingsSorted.length > 2 ? (
                  dayBookingsSorted.map(b => {
                    const rc = ROOM_COLORS[b.room] || '#64748b'
                    return (
                      <div
                        key={b.id}
                        onClick={e => { e.stopPropagation(); onEventClick?.(b) }}
                        title={`${b.gameName || b.room} — ${b.time || ''}`}
                        style={{ height: '7px', borderRadius: '99px', background: rc, cursor: 'pointer', flexShrink: 0, opacity: 0.85, transition: 'opacity 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.85'}
                      />
                    )
                  })
                ) : (
                  dayBookingsSorted.map(b => {
                    const rc = ROOM_COLORS[b.room] || '#64748b'
                    return (
                      <button
                        key={b.id}
                        onClick={e => { e.stopPropagation(); onEventClick?.(b) }}
                        title={`${b.gameName || b.room} — ${b.time || ''}`}
                        style={{ width: '100%', textAlign: 'left', padding: '4px 7px', borderRadius: '6px', border: 'none', background: `${rc}18`, borderLeft: `3px solid ${rc}`, cursor: 'pointer', transition: 'opacity 0.12s', minWidth: 0 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                          {b.room || b.gameName || 'รอบ'}
                        </div>
                        {b.time && (
                          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', lineHeight: 1.2 }}>{b.time}</div>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Selected Day Action Bar (Clicking any day shows full details) ─ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '14px',
        padding: '14px 18px', borderRadius: '16px',
        background: 'linear-gradient(135deg, #ffffff 0%, #fbfbfd 100%)',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 4px 16px -2px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, flex: 1 }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: activeDateStr === todayStr ? 'rgba(198,36,25,0.1)' : 'rgba(0,0,0,0.04)',
            color: activeDateStr === todayStr ? 'var(--crimson-500)' : 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '15px', flexShrink: 0, marginTop: '2px',
          }}>
            <i className={activeDateStr === todayStr ? 'fas fa-star' : 'far fa-calendar-check'} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '14px', fontWeight: 900, color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
            }}>
              <span>{activeDateStr === todayStr ? 'วันนี้ · ' + fmtDate(activeDateStr) : fmtDate(activeDateStr)}</span>
              {selectedDayBookings.length > 0 && (
                <span style={{ fontSize: '11px', fontWeight: 800, padding: '1px 8px', borderRadius: '20px', background: 'rgba(198,36,25,0.08)', color: 'var(--crimson-500)' }}>
                  {selectedDayBookings.length} รอบเล่น
                </span>
              )}
            </div>

            {selectedDayBookings.length > 0 ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                {selectedDayBookings.map(b => {
                  const rc = ROOM_COLORS[b.room] || '#64748b'
                  return (
                    <button
                      key={b.id}
                      onClick={() => onEventClick?.(b)}
                      title={`คลิกเพื่อดูรายละเอียดรอบ ${b.room || ''}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px', borderRadius: '8px',
                        background: `${rc}12`, border: `1px solid ${rc}35`,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                        fontFamily: 'Sarabun, sans-serif',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = `${rc}24`
                        e.currentTarget.style.borderColor = rc
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = `${rc}12`
                        e.currentTarget.style.borderColor = `${rc}35`
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: rc, flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a' }}>{b.room || 'ห้องเล่น'}</span>
                      {b.status === 'locked' && (
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                          <i className="fas fa-lock" style={{ fontSize: '8px' }} />ล็อก
                        </span>
                      )}
                      {b.time && <span style={{ fontSize: '10.5px', color: rc, fontWeight: 800 }}>{b.time}</span>}
                      {b.gameName && <span style={{ fontSize: '10px', color: '#64748b' }}>({b.gameName})</span>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                ยังไม่มีรอบเล่นในวันนี้ — สามารถเปิดตี้แรกได้เลย
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => onBookToday?.(activeDateStr)}
          style={{
            flexShrink: 0, padding: '10px 22px', borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--crimson-500), #e11d48)',
            border: 'none', color: '#fff', fontSize: '13px', fontWeight: 800,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 14px rgba(198,36,25,0.3)',
            transition: 'all 0.15s ease', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(198,36,25,0.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(198,36,25,0.3)'
          }}
        >
          <i className="fas fa-plus" style={{ fontSize: '11px' }} />
          จองรอบวันนี้
        </button>
      </div>
    </div>
  )
}

// ── Booking Card Component ────────────────────────────────────────────────────
function BookingCard({ booking, lineUser, onOpen, onCloseBooking }) {
  const paidCount = booking.members?.filter(m => m.paidDeposit).length || 0
  const total = booking.members?.length || 0
  const isLeader = booking.leaderId === lineUser?.uid
  const pendingRequests = booking.joinRequests?.length || 0
  const imgSrc = booking.gameImage ? convertImg(booking.gameImage, 400) : null
  const countdown = booking.status === 'confirmed' && booking.depositDeadline ? formatCountdown(booking.depositDeadline) : null
  const isUrgent = countdown && new Date(booking.depositDeadline) - new Date() < 24 * 3600000
  const paidPct = total > 0 ? (paidCount / total) * 100 : 0
  const allPaid = paidCount === total && total > 0
  const rc = ROOM_COLORS[booking.room] || '#64748b'
  const isCollapsed = booking.status === 'collapsed'

  return (
    <div
      onClick={() => onOpen(booking)}
      style={{
        position: 'relative', borderRadius: '14px',
        border: `1px solid ${isCollapsed ? 'rgba(185,28,28,0.2)' : 'var(--border-default)'}`,
        background: isCollapsed ? 'rgba(185,28,28,0.04)' : 'var(--surface-card)',
        cursor: 'pointer', overflow: 'hidden', display: 'flex',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={e => { if (!isCollapsed) e.currentTarget.style.borderColor='var(--crimson-500)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor=isCollapsed?'rgba(185,28,28,0.25)':'var(--border-default)'; e.currentTarget.style.boxShadow='none' }}
    >
      {/* Left: Image Strip */}
      <div style={{ width: '72px', flexShrink: 0, position: 'relative', overflow: 'hidden', background: 'var(--surface-sunken)' }}>
        {imgSrc
          ? <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.75) contrast(1.1)', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '22px' }}><i className="fas fa-scroll" /></div>
        }
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: rc }} />
      </div>

      {/* Right: Content */}
      <div style={{ flex: '1 1 0%', minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px' }}>
        {/* Title + Status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '5px' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
            {booking.gameName || 'การจองห้อง'}
          </div>
          <StatusBadge status={booking.status} label={booking.status === 'cancelled' && booking.closedBy ? 'ปิดตี้แล้ว' : undefined} />
        </div>

        {/* Meta chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <i className="fas fa-calendar" style={{ fontSize: '10px', opacity: 0.55 }} />{fmtDate(booking.date)}
          </span>
          {booking.time && (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fas fa-clock" style={{ fontSize: '10px', opacity: 0.55 }} />{booking.time}
            </span>
          )}
          {booking.room && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: rc, fontWeight: 700 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: rc, flexShrink: 0 }} />{booking.room}
            </span>
          )}
          {isLeader && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--crimson-500)', background: 'rgba(198,36,25,0.12)', padding: '2px 8px', borderRadius: '10px' }}>หัวหน้า</span>
          )}
        </div>

        {/* Progress footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-default)' }}>
          <div style={{ flex: '1 1 0%', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
              <span>สมาชิก {total}/{booking.maxMembers || '?'}</span>
              <span style={{ color: allPaid ? '#047857' : 'var(--text-tertiary)' }}>มัดจำ {paidCount}/{total}</span>
            </div>
            <div style={{ height: '6px', borderRadius: '6px', background: 'var(--border-default)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, Math.max(5, paidPct))}%`, background: allPaid ? '#10b981' : 'var(--crimson-500)', borderRadius: '6px', transition: 'width 0.3s ease-out' }} />
            </div>
          </div>

          {countdown && (
            <div style={{ flexShrink: 0, padding: '4px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', background: isUrgent ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: isUrgent ? '#ef4444' : '#d97706', border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.25)'}` }}>
              <i className="fas fa-clock" style={{ fontSize: '9px' }} />{countdown}
            </div>
          )}

          {isLeader && booking.status === 'collapsed' && onCloseBooking && (
            <button
              onClick={e => { e.stopPropagation(); onCloseBooking(booking) }}
              title="ปิดตี้ที่ล่ม"
              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: '8px', background: 'rgba(198,36,25,0.15)', border: '1px solid rgba(198,36,25,0.35)', color: 'var(--crimson-500)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'background 0.15s, color 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--crimson-500)'; e.currentTarget.style.color='#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(198,36,25,0.15)'; e.currentTarget.style.color='var(--crimson-500)' }}
            >
              <i className="fas fa-times-circle" />ปิดตี้
            </button>
          )}
        </div>
      </div>

      {isLeader && pendingRequests > 0 && (
        <div style={{ position: 'absolute', top: '8px', right: '8px', background: '#f59e0b', color: '#000', fontSize: '10px', fontWeight: 900, padding: '2px 8px', borderRadius: '20px', pointerEvents: 'none' }}>
          {pendingRequests} คำขอ
        </div>
      )}
    </div>
  )
}

// ── Create Booking Modal ───────────────────────────────────────────────────────
function CreateBookingModal({ allGames, bookings = [], lineUser, onClose, showToast, defaultDate = '' }) {
  const [step, setStep] = useState('datetime') // 'datetime' | 'game'
  const [selectedDate, setSelectedDate] = useState(defaultDate || '')
  const [selectedTime, setSelectedTime] = useState('')
  const [selectedGame, setSelectedGame] = useState(null)
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const finalTime = selectedTime

  // Active bookings on the selected date
  const activeDateBookings = selectedDate
    ? bookings.filter(b => b.date === selectedDate && !['cancelled', 'collapsed'].includes(b.status))
    : []

  const slotCounts = {}
  activeDateBookings.forEach(b => { if (b.time) slotCounts[b.time] = (slotCounts[b.time] || 0) + 1 })

  const exactSlotBookedIds = new Set(
    activeDateBookings.filter(b => finalTime && b.time === finalTime).map(b => b.gameId)
  )
  const lockedSlotIds = new Set(
    activeDateBookings.filter(b => finalTime && b.time === finalTime && b.status === 'locked').map(b => b.gameId)
  )

  const filteredGames = allGames.filter(g =>
    !search || g.title?.toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!selectedGame || !selectedDate || !finalTime) return
    if (lockedSlotIds.has(selectedGame.id)) {
      showToast('เกมนี้ถูกล็อกในวันเวลานี้แล้ว — กรุณาเลือกวันหรือเวลาอื่น', 'error')
      return
    }
    setSubmitting(true)
    try {
      const maxMembers = selectedGame.characters?.length || parseInt(selectedGame.players) || 6
      await addDoc(collection(db, 'bookings'), {
        gameId: selectedGame.id,
        gameName: selectedGame.title || '',
        gameImage: selectedGame.image || '',
        date: selectedDate,
        time: finalTime,
        room: '',
        status: 'pending',
        isMock: false,
        mockNote: '',
        leaderId: lineUser.uid,
        leaderName: lineUser.name,
        leaderAvatar: lineUser.avatar || '',
        members: [{
          uid: lineUser.uid,
          name: lineUser.name,
          avatar: lineUser.avatar || '',
          paidDeposit: false,
          paidAt: ''
        }],
        maxMembers,
        depositAmount: selectedGame.deposit || 0,
        depositDeadline: '',
        adminNote: '',
        confirmedAt: '',
        confirmedBy: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      showToast('สร้างการจองสำเร็จ รอแอดมินยืนยัน')
      onClose()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const C   = '#c62419'
  const INK = '#1a1a1a'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(26,26,26,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full sm:max-w-lg flex flex-col overflow-hidden"
        style={{
          background: '#ffffff',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderBottomLeftRadius: window.matchMedia('(min-width:640px)').matches ? 28 : 0,
          borderBottomRightRadius: window.matchMedia('(min-width:640px)').matches ? 28 : 0,
          maxHeight: '94dvh',
          boxShadow: '0 40px 100px rgba(26,26,26,0.22)',
        }}
      >
        {/* Drag handle */}
        <div className="w-11 h-[5px] rounded-full mx-auto mt-4 mb-0 sm:hidden" style={{ background: 'rgba(26,26,26,0.12)' }} />

        {/* Header */}
        <div className="flex items-start justify-between pt-7 pb-6" style={{ paddingLeft: 32, paddingRight: 32 }}>
          <div className="min-w-0 flex-1">
            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: C }}>
                ขั้นตอน {step === 'datetime' ? '1' : '2'} / 2
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(26,26,26,0.08)' }} />
              {/* Step dots */}
              <div className="flex items-center gap-1.5">
                <div className="rounded-full" style={{ width: step === 'datetime' ? 20 : 6, height: 6, background: C, transition: 'width 240ms' }} />
                <div className="rounded-full" style={{ width: step === 'game' ? 20 : 6, height: 6, background: step === 'game' ? C : 'rgba(26,26,26,0.14)', transition: 'width 240ms' }} />
              </div>
            </div>
            <h3 className="font-black leading-[1.15] tracking-tight" style={{ color: INK, fontSize: 24 }}>จองรอบเกม</h3>
            <p className="text-[13px] mt-1.5 leading-snug" style={{ color: 'rgba(26,26,26,0.55)' }}>
              {step === 'datetime' ? 'เลือกวันที่และเวลาที่คุณต้องการเล่น' : 'เลือกสคริปต์ที่ต้องการเล่นในรอบนี้'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ml-4"
            style={{ background: '#f5f1ef', color: 'rgba(26,26,26,0.5)', marginTop: 2 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ebe4e1'; e.currentTarget.style.color = INK }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f5f1ef'; e.currentTarget.style.color = 'rgba(26,26,26,0.5)' }}
          >
            <i className="fas fa-times text-sm" />
          </button>
        </div>

        {/* Body */}
        <div
          className="overflow-y-auto flex-1 flex flex-col"
          style={{ paddingLeft: 32, paddingRight: 32, paddingBottom: 32, gap: 36 }}
        >

          {/* ── STEP 1: Date & Time ── */}
          {step === 'datetime' && (
            <>
              {/* Date picker */}
              <div className="flex flex-col gap-3.5">
                <div className="flex items-baseline justify-between">
                  <label className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: 'rgba(26,26,26,0.45)' }}>
                    วันที่จอง
                  </label>
                  {selectedDate && (
                    <span className="text-[11px] font-semibold" style={{ color: C }}>
                      {fmtDate(selectedDate)}
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  min={toDateStr(new Date())}
                  value={selectedDate}
                  onChange={e => { setSelectedDate(e.target.value); setSelectedTime('') }}
                  className="w-full px-5 text-[15px] font-semibold outline-none transition-all"
                  style={{
                    height: 56,
                    background: '#faf7f5',
                    border: `1.5px solid ${selectedDate ? C : 'rgba(26,26,26,0.08)'}`,
                    borderRadius: 14,
                    color: selectedDate ? INK : 'rgba(26,26,26,0.4)',
                    colorScheme: 'light',
                  }}
                  onFocus={e => { e.target.style.borderColor = C; e.target.style.boxShadow = `0 0 0 4px ${C}14` }}
                  onBlur={e => { e.target.style.borderColor = selectedDate ? C : 'rgba(26,26,26,0.08)'; e.target.style.boxShadow = 'none' }}
                />
                {selectedDate && activeDateBookings.length > 0 && (
                  <div className="flex items-start gap-3 px-4 py-3 text-[12px]" style={{ background: '#faf7f5', borderRadius: 12 }}>
                    <i className="fas fa-info-circle mt-0.5 shrink-0 text-[13px]" style={{ color: C }} />
                    <span style={{ color: 'rgba(26,26,26,0.65)', lineHeight: 1.55 }}>
                      วันนี้มี <strong style={{ color: INK }}>{activeDateBookings.length} การจอง</strong> อยู่แล้ว — เลขที่ปรากฏบนรอบคือจำนวนที่ถูกจอง
                    </span>
                  </div>
                )}
              </div>

              {/* Time slots */}
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline justify-between">
                  <label className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: 'rgba(26,26,26,0.45)' }}>
                    รอบเวลา
                  </label>
                  <span className="text-[11px]" style={{ color: 'rgba(26,26,26,0.4)' }}>
                    13:00 – 19:00
                  </span>
                </div>
                <div className="grid grid-cols-4" style={{ gap: 10 }}>
                  {TIME_SLOTS.map(t => {
                    const isActive = selectedTime === t
                    const count = slotCounts[t] || 0
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedTime(t)}
                        className="relative flex flex-col items-center justify-center font-black transition-all"
                        style={{
                          height: 66,
                          background: isActive ? C : '#faf7f5',
                          border: `1.5px solid ${isActive ? C : count > 0 ? `${C}30` : 'transparent'}`,
                          borderRadius: 14,
                          boxShadow: isActive ? `0 8px 24px ${C}35` : 'none',
                          color: isActive ? '#fff' : INK,
                          transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
                        }}
                      >
                        <span className="text-[15px] leading-none">{t}</span>
                        {count > 0 && (
                          <span className="text-[10px] font-bold mt-1.5" style={{ color: isActive ? 'rgba(255,255,255,0.8)' : C, letterSpacing: '0.02em' }}>
                            {count} จอง
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* CTA */}
              <button
                disabled={!selectedDate || !finalTime}
                onClick={() => setStep('game')}
                className="w-full font-black transition-all flex items-center justify-center gap-3"
                style={{
                  height: 56,
                  background: selectedDate && finalTime ? C : '#f0ebe9',
                  color: selectedDate && finalTime ? '#fff' : 'rgba(26,26,26,0.3)',
                  boxShadow: selectedDate && finalTime ? `0 10px 28px ${C}35` : 'none',
                  cursor: selectedDate && finalTime ? 'pointer' : 'not-allowed',
                  borderRadius: 14,
                  fontSize: 15,
                  letterSpacing: '0.01em',
                  marginTop: 4,
                }}
              >
                {selectedDate && finalTime ? (
                  <>
                    <span>ถัดไป — เลือกสคริปต์</span>
                    <i className="fas fa-arrow-right text-xs" />
                  </>
                ) : (
                  <span>เลือกวันและเวลาก่อน</span>
                )}
              </button>
            </>
          )}

          {/* ── STEP 2: Select Game ── */}
          {step === 'game' && (
            <>
              {/* Slot recap */}
              <div className="flex items-center justify-between" style={{ padding: '14px 18px', background: '#faf7f5', borderRadius: 14 }}>
                <div className="flex items-center gap-3 text-[13px]">
                  <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: `${C}10`, borderRadius: 10 }}>
                    <i className="fas fa-calendar-check text-xs" style={{ color: C }} />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-[12px] font-medium" style={{ color: 'rgba(26,26,26,0.55)' }}>{fmtDate(selectedDate)}</span>
                    <span className="font-black text-[14px]" style={{ color: INK }}>{finalTime} น.</span>
                  </div>
                </div>
                <button
                  onClick={() => setStep('datetime')}
                  className="font-bold transition-colors"
                  style={{ color: C, fontSize: 12, padding: '6px 12px', background: `${C}10`, borderRadius: 999 }}
                >
                  เปลี่ยน
                </button>
              </div>

              {/* Search */}
              <div className="relative" style={{ marginTop: -8 }}>
                <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none" style={{ color: 'rgba(26,26,26,0.35)' }} />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อสคริปต์..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full outline-none transition-all"
                  style={{
                    paddingLeft: 46, paddingRight: 20,
                    height: 52,
                    background: '#faf7f5',
                    border: '1.5px solid transparent',
                    borderRadius: 14,
                    color: INK,
                    fontSize: 14,
                  }}
                  onFocus={e => { e.target.style.borderColor = C; e.target.style.background = '#fff'; e.target.style.boxShadow = `0 0 0 4px ${C}14` }}
                  onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = '#faf7f5'; e.target.style.boxShadow = 'none' }}
                />
              </div>

              {/* Game list */}
              <div className="flex flex-col overflow-y-auto" style={{ gap: 10, maxHeight: 280, margin: '-4px -4px 0', padding: '4px 4px 0' }}>
                {filteredGames.length === 0 && (
                  <div className="text-center flex flex-col items-center gap-3" style={{ color: 'rgba(26,26,26,0.35)', padding: '48px 0' }}>
                    <i className="fas fa-search text-2xl" style={{ opacity: 0.5 }} />
                    <span className="text-sm">ไม่พบสคริปต์ที่ค้นหา</span>
                  </div>
                )}
                {filteredGames.map(g => {
                  const isSel = selectedGame?.id === g.id
                  const isExact = exactSlotBookedIds.has(g.id)
                  const isLocked = lockedSlotIds.has(g.id)
                  const gImg = g.image ? convertImg(g.image, 200) : null

                  return (
                    <div
                      key={g.id}
                      onClick={() => !isLocked && setSelectedGame(g)}
                      className="flex items-center transition-all"
                      style={{
                        gap: 14,
                        padding: 12,
                        background: isSel ? `${C}08` : '#fff',
                        border: `1.5px solid ${isSel ? C : 'rgba(26,26,26,0.06)'}`,
                        borderRadius: 14,
                        boxShadow: isSel ? `0 8px 20px ${C}1a` : '0 1px 2px rgba(26,26,26,0.02)',
                        transform: isSel ? 'translateY(-1px)' : 'none',
                        opacity: isLocked ? 0.52 : 1,
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <div className="shrink-0 overflow-hidden" style={{ width: 48, height: 60, borderRadius: 10, background: '#f5f1ef' }}>
                        {gImg ? (
                          <img src={gImg} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <i className="fas fa-theater-masks text-base" style={{ color: 'rgba(26,26,26,0.25)' }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold leading-[1.3] line-clamp-2" style={{ color: INK, fontSize: 14 }}>{g.title}</h4>
                          {isSel && (
                            <div className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, background: C, borderRadius: 999 }}>
                              <i className="fas fa-check text-[10px]" style={{ color: '#fff' }} />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="flex items-center gap-1" style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)' }}>
                            <i className="fas fa-users text-[9px]" />
                            {g.players || (g.characters ? `${g.characters.length} คน` : '6–8 คน')}
                          </span>
                          {g.difficulty && (
                            <>
                              <span style={{ color: 'rgba(26,26,26,0.2)' }}>·</span>
                              <span style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)' }}>{g.difficulty}</span>
                            </>
                          )}
                          {isLocked ? (
                            <span style={{ padding: '2px 8px', background: INK, color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                              <i className="fas fa-lock mr-1" style={{ fontSize: 8 }} />ล็อกแล้ว
                            </span>
                          ) : isExact && (
                            <span style={{ padding: '2px 8px', background: C, color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                              จองแล้ว
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Notices */}
              {selectedGame && exactSlotBookedIds.has(selectedGame.id) && (
                <div className="flex items-start gap-3 text-[12px]" style={{ padding: '14px 16px', background: `${C}08`, border: `1px solid ${C}22`, borderRadius: 12 }}>
                  <i className="fas fa-exclamation-circle mt-0.5 shrink-0 text-[13px]" style={{ color: C }} />
                  <span style={{ color: 'rgba(26,26,26,0.75)', lineHeight: 1.55 }}>เกมนี้มีการจองรอบ <strong style={{ color: INK }}>{finalTime}</strong> แล้ว — ส่งคำขอได้ แอดมินจะพิจารณาให้</span>
                </div>
              )}
              {selectedGame && !exactSlotBookedIds.has(selectedGame.id) && (
                <div className="flex items-start gap-3 text-[12px]" style={{ padding: '14px 16px', background: '#faf7f5', borderRadius: 12 }}>
                  <i className="fas fa-info-circle mt-0.5 shrink-0 text-[13px]" style={{ color: C }} />
                  <span style={{ color: 'rgba(26,26,26,0.7)', lineHeight: 1.55 }}>หลังแอดมินยืนยัน มีเวลา 3 วันชำระมัดจำ <strong style={{ color: INK }}>฿{selectedGame.deposit || 0}/คน</strong></span>
                </div>
              )}

              {/* Back + Confirm */}
              <div className="flex gap-3" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setStep('datetime')}
                  className="flex items-center justify-center transition-all shrink-0"
                  style={{
                    width: 56, height: 56,
                    background: '#faf7f5',
                    color: 'rgba(26,26,26,0.6)',
                    borderRadius: 14,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ebe4e1'; e.currentTarget.style.color = INK }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#faf7f5'; e.currentTarget.style.color = 'rgba(26,26,26,0.6)' }}
                >
                  <i className="fas fa-arrow-left text-sm" />
                </button>
                <button
                  type="button"
                  disabled={!selectedGame || submitting}
                  onClick={handleSubmit}
                  className="flex-1 font-black transition-all flex items-center justify-center gap-3"
                  style={{
                    height: 56,
                    background: selectedGame && !submitting ? C : '#f0ebe9',
                    color: selectedGame && !submitting ? '#fff' : 'rgba(26,26,26,0.3)',
                    boxShadow: selectedGame && !submitting ? `0 10px 28px ${C}35` : 'none',
                    cursor: selectedGame && !submitting ? 'pointer' : 'not-allowed',
                    borderRadius: 14,
                    fontSize: 15,
                    letterSpacing: '0.01em',
                  }}
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                      <span>กำลังส่ง...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane text-xs" />
                      <span>ยืนยันการจอง</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  )
}

// ── Deposit Payment & Slip Modal ──────────────────────────────────────────────
function DepositPaymentModal({ booking, lineUser, onClose, showToast, onUpdated }) {
  const [promptPayPhone, setPromptPayPhone] = useState('')
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [step, setStep] = useState('qr') // 'qr' | 'upload' | 'done'
  const [slipFile, setSlipFile] = useState(null)
  const [slipPreview, setSlipPreview] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'payment')).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        setPromptPayPhone(d.depositPromptPayPhone || d.promptPayPhone || '')
        setAccountName(d.depositAccountName || d.paymentAccountName || '')
        setBankName(d.depositBankName || d.paymentBankName || '')
      }
    })
  }, [])

  const amount = booking.depositAmount || 0
  const qrPayload = promptPayPhone ? buildPromptPayQR(promptPayPhone, amount) : ''

  const saveQR = () => {
    const canvas = document.getElementById('dp-deposit-qr-canvas')
    if (!canvas) { showToast('ไม่พบรูป QR', 'error'); return }
    try {
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `promptpay-${amount}-${booking.id}.png`
      a.click()
      showToast('บันทึก QR แล้ว ✓')
    } catch (e) {
      showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error')
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('กรุณาเลือกไฟล์รูปภาพ', 'error')
      return
    }
    setSlipFile(file)
    const reader = new FileReader()
    reader.onload = ev => setSlipPreview(ev.target.result)
    reader.readAsDataURL(file)
    setStep('upload')
  }

  const handleSubmit = async () => {
    if (!slipFile) return
    setUploading(true)
    try {
      // 1. Upload to Storage
      const path = `slips/deposits/${booking.id}/${lineUser.uid}_${Date.now()}`
      const fileRef = storageRef(storage, path)
      await uploadBytes(fileRef, slipFile)
      const slipUrl = await getDownloadURL(fileRef)

      // 2. Try EasySlip verification via Cloud Function
      let verified = false
      let verifyData = {}
      let slipCode = null
      try {
        const verifySlip = httpsCallable(appFunctions, 'verifySlip')
        const result = await verifySlip({
          slipUrl,
          amount,
          orderId: `booking_${booking.id}`,
          uid: lineUser.uid,
          name: lineUser.name,
          isDeposit: true,
        })
        const json = result.data
        slipCode = json?.code || null
        if (json?.success) {
          verified = true
          const slip = json.data?.rawSlip || {}
          verifyData = {
            slipTransRef: slip.transRef || '',
            slipBank: slip.sender?.bank?.short || '',
          }
        } else if (json?.code === 'WRONG_RECEIVER') {
          showToast('สลิปโอนไปยังบัญชีอื่น — กรุณาตรวจสอบและโอนใหม่', 'error')
          return
        }
      } catch (e) {
        console.warn('EasySlip verify failed:', e.message)
      }

      // 3. Update booking member
      const ref = doc(db, 'bookings', booking.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) throw new Error('ไม่พบการจอง')
      const data = snap.data()
      const nowIso = new Date().toISOString()
      const updatedMembers = data.members.map(m =>
        m.uid === lineUser.uid
          ? {
              ...m,
              slipUrl, slipSubmittedAt: nowIso,
              ...(verified
                ? { paidDeposit: true, paidAt: nowIso, slipStatus: 'verified', ...verifyData }
                : { slipStatus: 'pending_verification' })
            }
          : m
      )
      const payload = { members: updatedMembers, updatedAt: serverTimestamp() }
      // If verified → extend deadline +3 days & lock when full
      if (verified) {
        const baseMs = Math.max(new Date(data.depositDeadline || 0).getTime(), Date.now())
        payload.depositDeadline = new Date(baseMs + 3 * 86400000).toISOString()
        const allPaid = updatedMembers.every(m => m.paidDeposit)
        const isFull = updatedMembers.length >= (data.maxMembers || 1)
        if (allPaid && isFull && data.status === 'confirmed') payload.status = 'locked'
      }
      await updateDoc(ref, payload)

      if (verified) showToast('EasySlip ยืนยันแล้ว ✓')
      else if (slipCode === 'QR_NOT_FOUND' || slipCode === 'IMAGE_ERROR') showToast('บันทึกสลิปแล้ว — รอแอดมินยืนยัน (อ่าน QR ไม่สำเร็จ)')
      else if (slipCode === 'SERVICE_EXPIRED') showToast('EasySlip หมดอายุ — รอแอดมินยืนยัน')
      else if (slipCode === 'NO_API_KEY') showToast('บันทึกสลิปแล้ว — รอแอดมินยืนยัน')
      else showToast('ส่งสลิปสำเร็จ — รอแอดมินตรวจสอบ')

      setStep('done')
      onUpdated()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const stepIndex = step === 'qr' ? 0 : step === 'upload' ? 1 : 2
  const C = '#c62419'
  const INK = '#1a1a1a'

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(26,26,26,0.5)', backdropFilter: 'blur(10px)' }}
    >
      <div
        className="w-full sm:max-w-md flex flex-col overflow-hidden"
        style={{
          background: '#ffffff',
          color: INK,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: '94dvh',
          boxShadow: '0 40px 100px rgba(26,26,26,0.22)',
          fontFamily: "'Sarabun', sans-serif",
        }}
      >
        {/* Drag handle */}
        <div className="w-11 h-[5px] rounded-full mx-auto mt-4 mb-0 sm:hidden shrink-0" style={{ background: 'rgba(26,26,26,0.12)' }} />

        {/* Header */}
        <div className="flex items-start justify-between pt-7 pb-5 shrink-0" style={{ paddingLeft: 28, paddingRight: 28 }}>
          <div className="min-w-0 flex-1">
            {/* Step indicator eyebrow */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: C }}>
                ขั้นตอน {stepIndex + 1} / 3
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(26,26,26,0.08)' }} />
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="rounded-full"
                    style={{
                      width: i === stepIndex ? 20 : 6, height: 6,
                      background: i <= stepIndex ? C : 'rgba(26,26,26,0.14)',
                      transition: 'width 220ms',
                    }}
                  />
                ))}
              </div>
            </div>
            <h3 className="font-black leading-[1.15] tracking-tight" style={{ color: INK, fontSize: 24 }}>
              {step === 'qr' ? 'ชำระมัดจำ' : step === 'upload' ? 'ตรวจสอบสลิป' : 'ส่งสลิปสำเร็จ'}
            </h3>
            <p className="text-[13px] mt-1.5 leading-snug truncate" style={{ color: 'rgba(26,26,26,0.55)' }}>
              {step === 'qr' ? `สแกน QR แล้วโอน · ${booking.gameName}` : step === 'upload' ? 'ตรวจความถูกต้องก่อนส่ง' : 'รอแอดมินยืนยัน'}
            </p>
          </div>
          {step !== 'done' && (
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ml-4"
              style={{ background: '#f5f1ef', color: 'rgba(26,26,26,0.5)', marginTop: 2 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ebe4e1'; e.currentTarget.style.color = INK }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f5f1ef'; e.currentTarget.style.color = 'rgba(26,26,26,0.5)' }}
            >
              <i className="fas fa-times text-sm" />
            </button>
          )}
        </div>

        {/* ── QR Step ── */}
        {step === 'qr' && (
          <div className="overflow-y-auto flex-1 flex flex-col" style={{ paddingLeft: 28, paddingRight: 28, paddingBottom: 28, gap: 24, background: '#fdfbfa' }}>
            {promptPayPhone ? (
              <>
                {/* Amount hero */}
                <div className="flex items-end justify-between" style={{ padding: '18px 20px', borderRadius: 16, background: `${C}0a`, border: `1px solid ${C}22` }}>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'rgba(26,26,26,0.5)', marginBottom: 4 }}>ยอดต่อคน</p>
                    <p className="font-black leading-none" style={{ color: C, fontSize: 36, letterSpacing: '-0.02em' }}>฿{amount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px]" style={{ color: 'rgba(26,26,26,0.5)', lineHeight: 1.4 }}>
                      {booking.date ? fmtDate(booking.date) : ''}
                    </p>
                    {booking.time && (
                      <p className="font-black mt-1" style={{ fontSize: 15, color: INK, fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '0.02em' }}>{booking.time} น.</p>
                    )}
                  </div>
                </div>

                {/* QR code card */}
                <div className="flex flex-col items-center" style={{ gap: 14 }}>
                  <div style={{
                    padding: 20, borderRadius: 20,
                    background: '#ffffff',
                    border: '1px solid rgba(26,26,26,0.08)',
                    boxShadow: '0 12px 32px rgba(26,26,26,0.08)',
                  }}>
                    <QRCodeCanvas id="dp-deposit-qr-canvas" value={qrPayload} size={200} bgColor="#ffffff" fgColor={INK} level="M" includeMargin={true} />
                  </div>
                  <div className="text-center">
                    <span className="inline-block text-[10px] font-black uppercase tracking-[0.16em] px-2.5 py-0.5 rounded-full mb-1.5" style={{ background: `${C}12`, color: C }}>
                      บัญชีโอนมัดจำ
                    </span>
                    <p className="font-black tracking-wider" style={{ fontSize: 17, color: INK, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                      {promptPayPhone}
                    </p>
                    {(accountName || bankName) && (
                      <p className="text-[12px] mt-1 font-medium" style={{ color: 'rgba(26,26,26,0.65)' }}>
                        {accountName}{bankName ? ` (${bankName})` : ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={saveQR}
                    className="flex items-center justify-center font-bold transition-all"
                    style={{
                      gap: 8, height: 40, padding: '0 18px', borderRadius: 999,
                      background: '#ffffff', color: INK,
                      border: '1px solid rgba(26,26,26,0.12)',
                      fontSize: 12.5, fontFamily: "'Sarabun', sans-serif", cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f5f1ef'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.12)' }}
                  >
                    <i className="fas fa-download" style={{ fontSize: 11 }} />
                    <span>บันทึกรูป QR</span>
                  </button>
                </div>

                {/* Instructions */}
                <ol className="flex flex-col" style={{ gap: 10 }}>
                  {[
                    'สแกน QR ผ่านแอปธนาคาร',
                    `โอน ฿${amount.toLocaleString()} แล้วบันทึกสลิป`,
                    'กดปุ่มด้านล่างเพื่อแนบสลิป',
                  ].map((txt, i) => (
                    <li key={i} className="flex items-center" style={{ gap: 12, padding: '10px 14px', borderRadius: 12, background: '#ffffff', border: '1px solid rgba(26,26,26,0.06)' }}>
                      <span className="flex items-center justify-center font-black shrink-0"
                        style={{ width: 24, height: 24, borderRadius: 999, background: `${C}10`, color: C, fontSize: 11 }}>
                        {i + 1}
                      </span>
                      <span className="text-[13px]" style={{ color: 'rgba(26,26,26,0.75)', lineHeight: 1.5 }}>{txt}</span>
                    </li>
                  ))}
                </ol>

                {/* Upload CTA */}
                <label
                  className="w-full font-black flex items-center justify-center transition-all cursor-pointer"
                  style={{
                    gap: 10, height: 56, borderRadius: 16,
                    background: C, color: '#fff',
                    fontSize: 15, letterSpacing: '0.01em',
                    boxShadow: `0 10px 28px ${C}3f`,
                  }}
                >
                  <i className="fas fa-image" />
                  <span>โอนแล้ว — แนบสลิปที่นี่</span>
                  <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                </label>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#f5f1ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fas fa-qrcode" style={{ fontSize: 30, color: 'rgba(26,26,26,0.35)' }} />
                </div>
                <div>
                  <p className="font-black text-[15px]" style={{ color: INK }}>ยังไม่ได้ตั้งค่าบัญชี</p>
                  <p className="text-[13px] mt-1" style={{ color: 'rgba(26,26,26,0.55)', maxWidth: 260 }}>ติดต่อแอดมินเพื่อรับข้อมูลการโอนเงิน</p>
                </div>
                <button onClick={onClose} className="font-bold" style={{ marginTop: 6, height: 44, padding: '0 24px', borderRadius: 12, background: '#f5f1ef', color: INK, border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: "'Sarabun', sans-serif" }}>
                  ปิด
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Upload / Preview Step ── */}
        {step === 'upload' && (
          <div className="overflow-y-auto flex-1 flex flex-col" style={{ paddingLeft: 28, paddingRight: 28, paddingBottom: 28, gap: 18, background: '#fdfbfa' }}>
            {/* Amount reminder */}
            <div className="flex items-center" style={{ gap: 12, padding: '14px 18px', borderRadius: 16, background: `${C}0a`, border: `1px solid ${C}22` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fas fa-receipt" style={{ color: C, fontSize: 14 }} />
              </div>
              <div>
                <div className="text-[11px] font-bold" style={{ color: 'rgba(26,26,26,0.5)' }}>ยอดที่ต้องชำระ</div>
                <div className="font-black" style={{ fontSize: 18, color: C, lineHeight: 1.1 }}>฿{amount.toLocaleString()}</div>
              </div>
            </div>

            {/* Slip preview */}
            {slipPreview && (
              <div className="overflow-hidden flex items-center justify-center"
                style={{ borderRadius: 16, border: '1px solid rgba(26,26,26,0.08)', background: '#f5f1ef', maxHeight: 320 }}>
                <img src={slipPreview} alt="slip" className="w-full object-contain" style={{ maxHeight: 320 }} />
              </div>
            )}

            <p className="text-center text-[12px]" style={{ color: 'rgba(26,26,26,0.5)' }}>
              ตรวจสอบความถูกต้องของสลิปก่อนกดยืนยัน
            </p>

            {/* Action row */}
            <div className="flex" style={{ gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => { setSlipFile(null); setSlipPreview(''); setStep('qr') }}
                className="flex items-center justify-center shrink-0 transition-all"
                style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: '#faf7f5', color: 'rgba(26,26,26,0.6)',
                  border: 'none', cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#ebe4e1'; e.currentTarget.style.color = INK }}
                onMouseLeave={e => { e.currentTarget.style.background = '#faf7f5'; e.currentTarget.style.color = 'rgba(26,26,26,0.6)' }}
              >
                <i className="fas fa-arrow-left text-sm" />
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={handleSubmit}
                className="flex-1 font-black flex items-center justify-center transition-all"
                style={{
                  gap: 10, height: 56, borderRadius: 14,
                  background: uploading ? '#f0ebe9' : C,
                  color: uploading ? 'rgba(26,26,26,0.3)' : '#fff',
                  border: 'none', cursor: uploading ? 'wait' : 'pointer',
                  fontSize: 15, letterSpacing: '0.01em',
                  boxShadow: uploading ? 'none' : `0 10px 28px ${C}3f`,
                }}
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(26,26,26,0.2)', borderTopColor: INK }} />
                    <span>กำลังส่ง...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane text-xs" />
                    <span>ยืนยันส่งสลิป</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Done Step ── */}
        {step === 'done' && (
          <div className="overflow-y-auto flex-1 flex flex-col items-center text-center" style={{ padding: '12px 28px 32px', gap: 20, background: '#fdfbfa' }}>
            {/* Check circle */}
            <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `${C}0c` }} />
              <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: `${C}1a` }} />
              <div style={{ position: 'absolute', inset: 22, borderRadius: '50%', background: C, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 12px 28px ${C}48` }}>
                <i className="fas fa-check" style={{ color: '#fff', fontSize: 22 }} />
              </div>
            </div>

            <div>
              <h4 className="font-black" style={{ fontSize: 22, color: INK, letterSpacing: '-0.02em' }}>ส่งสลิปสำเร็จ</h4>
              <p className="text-[13px] mt-2" style={{ color: 'rgba(26,26,26,0.6)', maxWidth: 280, lineHeight: 1.55 }}>
                แอดมินจะตรวจสอบและยืนยันภายใน 24 ชม. ระบบจะแจ้งผลทาง LINE
              </p>
            </div>

            {/* Booking recap */}
            <div className="w-full flex items-center text-left"
              style={{ gap: 14, padding: '14px 18px', borderRadius: 16, background: '#ffffff', border: '1px solid rgba(26,26,26,0.08)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${C}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fas fa-calendar-check" style={{ color: C, fontSize: 15 }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black truncate" style={{ fontSize: 14, color: INK }}>{booking.gameName}</p>
                <p className="mt-0.5 text-[12px]" style={{ color: 'rgba(26,26,26,0.55)' }}>
                  {booking.date ? fmtDate(booking.date) : ''}{booking.time ? ` · ${booking.time} น.` : ''}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full font-black transition-all"
              style={{
                height: 56, borderRadius: 16,
                background: C, color: '#fff', border: 'none', cursor: 'pointer',
                fontSize: 15, letterSpacing: '0.01em',
                boxShadow: `0 10px 28px ${C}3f`,
                marginTop: 4,
              }}
            >
              เสร็จสิ้น
            </button>
          </div>
        )}

        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  )
}

// ── Booking Detail & Party Lounge Modal ───────────────────────────────────────
export function BookingDetailModal({ booking, lineUser, onClose, showToast, onUpdated }) {
  const openProfile = useOpenProfile()
  const [joining, setJoining] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [approvingUid, setApprovingUid] = useState(null)
  const [rejectingUid, setRejectingUid] = useState(null)
  const [showDepositPay, setShowDepositPay] = useState(false)

  const isMember = booking.members?.some(m => m.uid === lineUser?.uid || m.id === lineUser?.uid)
  const isLeader = booking.leaderId === lineUser?.uid
  const isAdmin = lineUser?.role === 'admin' || lineUser?.isAdmin
  const isLockedRestricted = booking.status === 'locked' && !isMember && !isLeader && !isAdmin
  const myMember = booking.members?.find(m => m.uid === lineUser?.uid || m.id === lineUser?.uid)
  const myRequest = booking.joinRequests?.some(r => r.uid === lineUser?.uid)
  const paidCount = booking.members?.filter(m => m.paidDeposit).length || 0
  const total = booking.members?.length || 0
  const imgSrc = booking.gameImage ? convertImg(booking.gameImage, 800) : null
  const countdown = booking.status === 'confirmed' && booking.depositDeadline ? formatCountdown(booking.depositDeadline) : null
  const isUrgent = booking.depositDeadline && new Date(booking.depositDeadline) - new Date() < 24 * 3600000
  const paidPct = total > 0 ? (paidCount / total) * 100 : 0
  const allPaid = paidCount === total && total > 0
  const rc = ROOM_COLORS[booking.room] || '#64748b'

  const handleRequestJoin = async () => {
    if (!lineUser) { showToast('กรุณาเข้าสู่ระบบก่อน', 'error'); return }
    if (isMember) { showToast('คุณอยู่ในปาร์ตี้นี้แล้ว'); return }
    if (myRequest) { showToast('คุณส่งคำขอไปแล้ว'); return }
    if (booking.members?.length >= booking.maxMembers) { showToast('ปาร์ตี้เต็มแล้ว', 'error'); return }
    setJoining(true)
    try {
      const ref = doc(db, 'bookings', booking.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) { showToast('ไม่พบการจองนี้', 'error'); return }
      const latest = snap.data()
      const updatedRequests = [...(latest.joinRequests || []), {
        uid: lineUser.uid,
        name: lineUser.name,
        avatar: lineUser.avatar || '',
        requestedAt: new Date().toISOString()
      }]
      await updateDoc(ref, { joinRequests: updatedRequests, updatedAt: serverTimestamp() })
      showToast('ส่งคำขอเข้าร่วมแล้ว รอหัวปาร์ตี้อนุมัติ')
      onUpdated()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setJoining(false)
    }
  }

  const handleApproveRequest = async (req) => {
    setApprovingUid(req.uid)
    try {
      const ref = doc(db, 'bookings', booking.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) { showToast('ไม่พบการจองนี้', 'error'); return }
      const latest = snap.data()
      const updatedRequests = (latest.joinRequests || []).filter(r => r.uid !== req.uid)
      const updatedMembers = [...(latest.members || []), {
        uid: req.uid,
        name: req.name,
        avatar: req.avatar || '',
        paidDeposit: false,
        paidAt: ''
      }]
      await updateDoc(ref, { joinRequests: updatedRequests, members: updatedMembers, updatedAt: serverTimestamp() })
      showToast(`${req.name} ได้รับการอนุมัติ`)
      onUpdated()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setApprovingUid(null)
    }
  }

  const handleRejectRequest = async (req) => {
    setRejectingUid(req.uid)
    try {
      const ref = doc(db, 'bookings', booking.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) { showToast('ไม่พบการจองนี้', 'error'); return }
      const latest = snap.data()
      const updatedRequests = (latest.joinRequests || []).filter(r => r.uid !== req.uid)
      await updateDoc(ref, { joinRequests: updatedRequests, updatedAt: serverTimestamp() })
      showToast(`ปฏิเสธคำขอของ ${req.name} แล้ว`)
      onUpdated()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setRejectingUid(null)
    }
  }

  const handleCloseBooking = async () => {
    if (!isLeader && lineUser?.role !== 'admin') {
      showToast('เฉพาะหัวหน้าเท่านั้นที่สามารถปิดตี้ได้', 'error')
      return
    }
    if (!window.confirm('คุณต้องการปิดตี้และยกเลิกการจองนี้ใช่หรือไม่?')) return
    setClosing(true)
    try {
      const ref = doc(db, 'bookings', booking.id)
      await updateDoc(ref, {
        status: 'cancelled',
        closedAt: new Date().toISOString(),
        closedBy: lineUser?.uid || '',
        updatedAt: serverTimestamp(),
      })
      showToast('ปิดตี้เรียบร้อยแล้ว')
      onClose()
      onUpdated?.()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setClosing(false)
    }
  }

  const handleLeave = async () => {
    if (isLeader) {
      showToast('หัวหน้าไม่สามารถออกจากปาร์ตี้ได้ หากต้องการยกเลิกให้กด "ปิดตี้"', 'error')
      return
    }
    if (!window.confirm('ยืนยันออกจากปาร์ตี้?')) return
    setLeaving(true)
    try {
      const ref = doc(db, 'bookings', booking.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) { showToast('ไม่พบการจองนี้', 'error'); return }
      const latest = snap.data()
      await updateDoc(ref, {
        members: latest.members.filter(m => m.uid !== lineUser.uid),
        updatedAt: serverTimestamp()
      })
      showToast('ออกจากปาร์ตี้แล้ว')
      onClose()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setLeaving(false)
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/booking?booking=${booking.id}`
    const text = `ชวนมาเล่น ${booking.gameName} วันที่ ${fmtDate(booking.date)}`
    if (navigator.share) {
      try {
        await navigator.share({ title: booking.gameName, text, url })
        return
      } catch (e) {
        if (e.name === 'AbortError') return
      }
    }
    navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('คัดลอกลิงก์แล้ว')
  }

  const C = '#c62419'
  const INK = '#1a1a1a'

  if (isLockedRestricted) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(26,26,26,0.65)', backdropFilter: 'blur(10px)' }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: 24,
            padding: '36px 28px',
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            fontFamily: "'Sarabun', sans-serif",
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{
            width: 60, height: 60, borderRadius: 20,
            background: 'rgba(198,36,25,0.08)', color: 'var(--crimson-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, margin: '0 auto 18px',
            border: '1px solid rgba(198,36,25,0.2)',
          }}>
            <i className="fas fa-lock" />
          </div>

          <span style={{
            display: 'inline-block',
            fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--crimson-500)', background: 'rgba(198,36,25,0.08)',
            padding: '3px 10px', borderRadius: 20, marginBottom: 12,
          }}>
            LOCKED ROOM · ล็อกห้องแล้ว
          </span>

          <h3 style={{ fontSize: 19, fontWeight: 900, color: '#0f172a', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            ห้องนี้ถูกล็อกแล้ว
          </h3>

          <p style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
            ตตี้นี้ได้รับการยืนยันและล็อกห้องเรียบร้อยแล้ว เฉพาะ<strong>สมาชิกในตี้</strong> หรือ <strong>แอดมิน</strong> เท่านั้นที่สามารถเข้าดูรายละเอียดได้
          </p>

          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '12px', borderRadius: 12,
              background: '#0f172a', color: '#ffffff',
              fontSize: 13.5, fontWeight: 700, border: 'none',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1e293b' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#0f172a' }}
          >
            เข้าใจแล้ว / ปิดหน้าต่าง
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-6 pt-10 sm:pt-6 pb-0 sm:pb-6"
        style={{ background: 'rgba(26,26,26,0.5)', backdropFilter: 'blur(10px)' }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div
          className="w-full sm:max-w-xl overflow-hidden max-h-[94dvh] flex flex-col"
          style={{
            background: '#ffffff',
            color: INK,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderBottomLeftRadius: 'env(safe-area-inset-bottom)' ? 0 : 28,
            boxShadow: '0 50px 120px rgba(26,26,26,0.25)',
          }}
        >

          {/* Drag handle */}
          <div className="w-11 h-[5px] rounded-full mx-auto mt-4 mb-0 sm:hidden shrink-0" style={{ background: 'rgba(26,26,26,0.12)' }} />

          {/* ── HERO (white editorial) ── */}
          <div className="relative overflow-hidden shrink-0" style={{ minHeight: 'clamp(180px,26vw,230px)', background: '#faf7f5' }}>
            {/* Blurred bg (subtle color wash) */}
            {imgSrc && (
              <img src={imgSrc} aria-hidden alt="" className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(32px) brightness(1.15) saturate(0.55) opacity(0.28)', transform: 'scale(1.18)' }} />
            )}

            {/* Soft crimson glow */}
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 60% 55% at 78% 18%, ${C}10 0%, transparent 65%)` }} />

            {/* Bottom fade to card bg */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.6) 55%, #ffffff 100%)' }} />

            {/* Content */}
            <div className="absolute inset-0 flex items-end gap-5 pt-14" style={{ paddingLeft: 28, paddingRight: 28, paddingBottom: 22 }}>

              {/* Poster thumbnail */}
              {imgSrc && (
                <div className="shrink-0 self-end" style={{ width: 'clamp(76px,17vw,100px)' }}>
                  <div className="overflow-hidden" style={{ aspectRatio: '2/3', borderRadius: 14, boxShadow: '0 18px 44px rgba(26,26,26,0.22), 0 0 0 1px rgba(26,26,26,0.06)' }}>
                    <img src={imgSrc} alt={booking.gameName} className="w-full h-full object-cover" />
                  </div>
                </div>
              )}

              {/* Title block */}
              <div className="flex-1 min-w-0 pb-1">
                <StatusBadge status={booking.status} />
                <h2 className="font-black mt-2.5 leading-[1.1] tracking-tight" style={{ color: INK, fontSize: 'clamp(22px,5.2vw,30px)' }}>
                  {booking.gameName || 'การจองห้อง'}
                </h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap" style={{ fontSize: 12.5, color: 'rgba(26,26,26,0.55)' }}>
                  <i className="fas fa-calendar-alt text-[10px]" style={{ color: C }} />
                  <span className="font-medium">{fmtDate(booking.date)}</span>
                  {booking.time && (
                    <>
                      <span style={{ color: 'rgba(26,26,26,0.2)' }}>·</span>
                      <span className="font-mono font-bold" style={{ color: INK }}>{booking.time} น.</span>
                    </>
                  )}
                  {booking.room && (
                    <>
                      <span style={{ color: 'rgba(26,26,26,0.2)' }}>·</span>
                      <span style={{ color: rc, fontWeight: 700 }}>{booking.room}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Close */}
            <button onClick={onClose} className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center transition-all"
              style={{ background: '#ffffff', border: '1px solid rgba(26,26,26,0.08)', color: 'rgba(26,26,26,0.55)', boxShadow: '0 4px 12px rgba(26,26,26,0.08)' }}
              onMouseEnter={e => { e.currentTarget.style.color = INK; e.currentTarget.style.background = '#f5f1ef' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(26,26,26,0.55)'; e.currentTarget.style.background = '#ffffff' }}
            >
              <i className="fas fa-times text-sm" />
            </button>
          </div>

          {/* ── BODY ── */}
          <div className="overflow-y-auto flex-1 flex flex-col" style={{ gap: 0 }}>

            {/* Countdown / warning */}
            {countdown && booking.status === 'confirmed' && (
              <div className={`mt-5 flex items-center gap-3.5 ${isUrgent ? 'animate-pulse' : ''}`}
                style={{
                  marginLeft: 28, marginRight: 28,
                  padding: '16px 18px', borderRadius: 16,
                  background: isUrgent ? `${C}0c` : '#faf7f5',
                  border: `1px solid ${isUrgent ? `${C}38` : 'rgba(26,26,26,0.07)'}`,
                  color: isUrgent ? C : INK,
                }}>
                <i className={`fas fa-${isUrgent ? 'exclamation-triangle' : 'clock'} shrink-0`} style={{ fontSize: 15, color: C }} />
                <div className="min-w-0">
                  <div className="font-black text-[14px]">ต้องชำระมัดจำภายใน {countdown}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'rgba(26,26,26,0.5)' }}>เมื่อจ่ายครบ ระบบล็อกห้องทันที</div>
                </div>
              </div>
            )}

            {booking.status === 'collapsed' && (
              <div className="mt-5 flex items-center justify-between gap-3"
                style={{
                  marginLeft: 28, marginRight: 28,
                  padding: '14px 18px', borderRadius: 16,
                  background: `${C}0c`, border: `1px solid ${C}30`, color: C,
                }}>
                <div className="flex items-center gap-2.5 text-[13px] font-semibold">
                  <i className="fas fa-exclamation-triangle shrink-0" />
                  <span>หมดเวลาชำระมัดจำ — ปาร์ตี้ล่ม</span>
                </div>
                {isLeader && (
                  <button onClick={handleCloseBooking} disabled={closing}
                    className="font-bold text-xs shrink-0 transition-opacity hover:opacity-85"
                    style={{ padding: '7px 14px', borderRadius: 999, background: C, color: '#fff' }}>
                    {closing ? 'กำลังปิด...' : 'ปิดตี้'}
                  </button>
                )}
              </div>
            )}

            {/* Join requests */}
            {isLeader && (booking.joinRequests?.length > 0) && (
              <div className="mt-5" style={{ marginLeft: 28, marginRight: 28, padding: '18px 20px', borderRadius: 18, background: '#faf7f5', border: `1px solid ${C}22` }}>
                <div className="flex items-center gap-2 mb-3.5">
                  <i className="fas fa-bell text-[11px]" style={{ color: C }} />
                  <span className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: C }}>คำขอเข้าร่วม ({booking.joinRequests.length})</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {booking.joinRequests.map(req => (
                    <div key={req.uid} className="flex items-center justify-between gap-3"
                      style={{ padding: '10px 12px', borderRadius: 12, background: '#ffffff', border: '1px solid rgba(26,26,26,0.06)' }}>
                      <div className="flex items-center gap-3 min-w-0">
                        {req.avatar
                          ? <img src={req.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                          : <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0" style={{ background: '#f5f1ef', color: 'rgba(26,26,26,0.55)' }}>{(req.name || '?')[0]}</div>
                        }
                        <span className="text-sm font-bold truncate" style={{ color: INK }}>{req.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleApproveRequest(req)} disabled={approvingUid === req.uid}
                          className="font-bold text-xs transition-opacity hover:opacity-85"
                          style={{ padding: '7px 14px', borderRadius: 999, background: C, color: '#fff' }}>
                          {approvingUid === req.uid ? '...' : 'รับ'}
                        </button>
                        <button onClick={() => handleRejectRequest(req)} disabled={rejectingUid === req.uid}
                          className="font-bold text-xs transition-colors"
                          style={{ padding: '7px 14px', borderRadius: 999, background: '#f5f1ef', color: 'rgba(26,26,26,0.6)' }}>
                          ปฏิเสธ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Members section */}
            <div className="flex flex-col" style={{ padding: '24px 28px', gap: 16 }}>

              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: 'rgba(26,26,26,0.45)' }}>สมาชิก</span>
                  <span className="text-[11px] font-black" style={{ padding: '3px 10px', borderRadius: 999, background: '#f5f1ef', color: INK }}>{total}/{booking.maxMembers || 6}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-bold" style={{ color: allPaid && total > 0 ? C : 'rgba(26,26,26,0.4)' }}>มัดจำ {paidCount}/{total}</span>
                  {allPaid && total > 0 && <i className="fas fa-check-circle text-xs" style={{ color: C }} />}
                </div>
              </div>

              {/* Avatar overview row */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {(booking.members || []).map(m => (
                  <div key={m.uid} className="relative shrink-0" title={m.name}
                    onClick={() => openProfile(m.uid)}
                    style={{ cursor: 'pointer' }}
                  >
                    {m.avatar
                      ? <img src={m.avatar} alt={m.name} className="w-11 h-11 rounded-full object-cover"
                          style={m.paidDeposit
                            ? { outline: `2.5px solid ${C}`, outlineOffset: 2 }
                            : m.slipStatus === 'pending_verification'
                              ? { outline: `2.5px solid ${C}45`, outlineOffset: 2 }
                              : { outline: '2px solid rgba(26,26,26,0.08)', outlineOffset: 2 }} />
                      : <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-sm"
                          style={m.paidDeposit
                            ? { background: `${C}14`, color: C, outline: `2.5px solid ${C}`, outlineOffset: 2 }
                            : { background: '#f5f1ef', color: 'rgba(26,26,26,0.5)', outline: '2px solid rgba(26,26,26,0.06)', outlineOffset: 2 }}>
                          {(m.name || '?')[0]}
                        </div>
                    }
                    {m.paidDeposit && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: C, border: '1.5px solid #ffffff' }}>
                        <i className="fas fa-check" style={{ fontSize: 7, color: '#fff' }} />
                      </div>
                    )}
                    {m.uid === booking.leaderId && !m.paidDeposit && (
                      <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: C, border: '1.5px solid #ffffff' }}>
                        <i className="fas fa-crown" style={{ fontSize: 6, color: '#fff' }} />
                      </div>
                    )}
                  </div>
                ))}
                {Array.from({ length: Math.max(0, (booking.maxMembers || 0) - total) }).map((_, i) => (
                  <div key={`ea-${i}`} className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                    style={{ border: '1.5px dashed rgba(26,26,26,0.14)', color: 'rgba(26,26,26,0.22)' }}>
                    <i className="fas fa-plus" style={{ fontSize: 10 }} />
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f0ebe9' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, Math.max(0, paidPct))}%`,
                    background: C,
                    boxShadow: `0 0 10px ${C}55`,
                  }} />
              </div>

              {/* Member detail list */}
              <div className="flex flex-col gap-2.5">
                {(booking.members || []).map(m => (
                  <div key={m.uid} className="flex items-center justify-between gap-3"
                    style={{
                      padding: '12px 14px', borderRadius: 16,
                      background: m.paidDeposit ? `${C}08` : m.slipStatus === 'pending_verification' ? `${C}05` : '#faf7f5',
                      border: `1px solid ${m.paidDeposit ? `${C}22` : m.slipStatus === 'pending_verification' ? `${C}14` : 'rgba(26,26,26,0.06)'}`,
                    }}>
                    <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => openProfile(m.uid)}>
                      <div className="shrink-0">
                        {m.avatar
                          ? <img src={m.avatar} alt="" className="w-10 h-10 rounded-full object-cover"
                              style={m.paidDeposit ? { outline: `2px solid ${C}`, outlineOffset: 1.5 } : {}} />
                          : <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm"
                              style={{ background: '#f5f1ef', color: 'rgba(26,26,26,0.5)' }}>
                              {(m.name || '?')[0]}
                            </div>
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-bold truncate" style={{ color: INK }}>{m.name}</span>
                          {m.uid === booking.leaderId && (
                            <span className="text-[9px] font-black uppercase tracking-wider"
                              style={{ padding: '2px 8px', borderRadius: 999, background: `${C}10`, color: C, border: `1px solid ${C}24` }}>
                              <i className="fas fa-crown mr-1" style={{ fontSize: 7 }} />หัวหน้า
                            </span>
                          )}
                        </div>
                        {m.slipStatus === 'pending_verification' && !m.paidDeposit && (
                          <div className="text-[11px] mt-0.5 font-medium" style={{ color: 'rgba(26,26,26,0.55)' }}>
                            <i className="fas fa-hourglass-half mr-1 text-[9px]" style={{ color: C }} />รอแอดมินตรวจสลิป
                          </div>
                        )}
                        {m.paidDeposit && (
                          <div className="text-[11px] mt-0.5 font-bold" style={{ color: C }}>
                            <i className="fas fa-check-circle mr-1 text-[9px]" />ชำระมัดจำแล้ว
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.slipUrl && (
                        <a href={m.slipUrl} target="_blank" rel="noopener noreferrer"
                          className="w-8 h-8 overflow-hidden block"
                          style={{ borderRadius: 8, border: '1px solid rgba(26,26,26,0.1)' }} title="ดูสลิป">
                          <img src={m.slipUrl} alt="" className="w-full h-full object-cover" />
                        </a>
                      )}
                      <span className="text-[11px] font-bold"
                        style={{
                          padding: '5px 11px', borderRadius: 999,
                          background: m.paidDeposit ? C : m.slipStatus === 'pending_verification' ? `${C}0c` : '#ffffff',
                          color: m.paidDeposit ? '#fff' : m.slipStatus === 'pending_verification' ? C : 'rgba(26,26,26,0.4)',
                          border: m.paidDeposit ? 'none' : `1px solid ${m.slipStatus === 'pending_verification' ? `${C}2c` : 'rgba(26,26,26,0.1)'}`,
                        }}>
                        {m.paidDeposit ? 'จ่ายแล้ว' : m.slipStatus === 'pending_verification' ? 'รอตรวจ' : 'ยังไม่จ่าย'}
                      </span>
                    </div>
                  </div>
                ))}

                {Array.from({ length: Math.max(0, (booking.maxMembers || 0) - total) }).map((_, i) => (
                  <div key={`es-${i}`} className="text-center text-[12px] font-medium"
                    style={{ padding: '14px 12px', borderRadius: 16, background: '#faf7f5', border: '1px dashed rgba(26,26,26,0.1)', color: 'rgba(26,26,26,0.35)' }}>
                    ที่ว่าง — รอสมาชิกเข้าร่วม
                  </div>
                ))}
              </div>
            </div>

            {/* Admin note */}
            {booking.adminNote && (
              <div style={{ marginLeft: 28, marginRight: 28, marginBottom: 20, padding: '16px 18px', borderRadius: 16, background: '#faf7f5', border: `1px solid ${C}22`, color: 'rgba(26,26,26,0.78)', fontSize: 13.5, lineHeight: 1.55 }}>
                <div className="font-black text-[10px] uppercase tracking-[0.15em] mb-1.5" style={{ color: C }}>โน้ตจากแอดมิน</div>
                {booking.adminNote}
              </div>
            )}

            {/* ── ACTION BAR ── */}
            <div className="flex flex-col mt-auto" style={{ padding: '0 28px 24px', gap: 12 }}>
              <div style={{ height: 1, background: 'rgba(26,26,26,0.07)', marginBottom: 4 }} />

              {/* Join */}
              {!isMember && !myRequest && lineUser && ['confirmed', 'pending'].includes(booking.status) && total < (booking.maxMembers || 99) && (
                <button onClick={handleRequestJoin} disabled={joining}
                  className="w-full font-black flex items-center justify-center gap-2.5 transition-all"
                  style={{
                    padding: '18px 20px', borderRadius: 16, fontSize: 15, letterSpacing: '0.01em',
                    background: C, color: '#fff',
                    boxShadow: `0 10px 28px ${C}3f`,
                  }}>
                  {joining
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>กำลังส่งคำขอ...</span></>
                    : <><i className="fas fa-user-plus" /><span>ขอเข้าร่วมปาร์ตี้</span></>
                  }
                </button>
              )}

              {/* Pending join badge */}
              {!isMember && myRequest && lineUser && (
                <div className="font-bold text-center text-[13px]"
                  style={{ padding: '14px 16px', borderRadius: 16, background: '#faf7f5', border: `1px solid ${C}22`, color: C }}>
                  <i className="fas fa-clock mr-2 text-xs" />คุณได้ส่งคำขอแล้ว — รอหัวปาร์ตี้อนุมัติ
                </div>
              )}

              {/* Pay deposit */}
              {isMember && booking.status === 'confirmed' && !myMember?.paidDeposit && myMember?.slipStatus !== 'pending_verification' && (
                <button onClick={() => setShowDepositPay(true)}
                  className="w-full font-black flex items-center justify-center gap-3 transition-all"
                  style={{
                    padding: '18px 20px', borderRadius: 16, fontSize: 15, letterSpacing: '0.01em',
                    background: C, color: '#fff',
                    boxShadow: `0 10px 28px ${C}3f`,
                  }}>
                  <i className="fas fa-qrcode text-base" />
                  <span>จ่ายมัดจำ ฿{booking.depositAmount} / แนบสลิป</span>
                </button>
              )}

              {/* Slip submitted */}
              {isMember && myMember?.slipStatus === 'pending_verification' && !myMember?.paidDeposit && (
                <div className="flex items-center gap-3.5"
                  style={{ padding: '14px 16px', borderRadius: 16, background: '#faf7f5', border: `1px solid ${C}22`, color: INK }}>
                  <i className="fas fa-hourglass-half shrink-0" style={{ fontSize: 15, color: C }} />
                  <div>
                    <div className="font-black text-[14px]">ส่งสลิปแล้ว — รอแอดมินตรวจสอบ</div>
                    <div className="text-[12px] mt-0.5" style={{ color: 'rgba(26,26,26,0.55)' }}>แอดมินจะแจ้งผลทาง LINE</div>
                  </div>
                </div>
              )}

              {/* Secondary row */}
              <div className="flex gap-2.5">
                <button onClick={handleShare}
                  className="flex-1 font-bold flex items-center justify-center gap-2 transition-all"
                  style={{
                    padding: '14px 16px', borderRadius: 14, fontSize: 13.5,
                    background: '#f5f1ef', color: copied ? C : INK,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#ebe4e1'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f5f1ef'}
                >
                  <i className={`fas fa-${copied ? 'check' : 'share-alt'}`} />
                  <span>{copied ? 'คัดลอกแล้ว' : 'แชร์ชวนเพื่อน'}</span>
                </button>

                {isMember && !isLeader && (
                  <button onClick={handleLeave} disabled={leaving}
                    className="flex-1 font-bold flex items-center justify-center gap-2 transition-all"
                    style={{
                      padding: '14px 16px', borderRadius: 14, fontSize: 13.5,
                      background: `${C}0c`, color: C, border: `1px solid ${C}26`,
                    }}>
                    <i className="fas fa-sign-out-alt" />
                    <span>ออกจากปาร์ตี้</span>
                  </button>
                )}

                {isLeader && ['collapsed', 'pending'].includes(booking.status) && (
                  <button onClick={handleCloseBooking} disabled={closing}
                    className="flex-1 font-bold flex items-center justify-center gap-2 transition-all"
                    style={{
                      padding: '14px 16px', borderRadius: 14, fontSize: 13.5,
                      background: `${C}0c`, color: C, border: `1px solid ${C}26`,
                    }}>
                    <i className="fas fa-times-circle" />
                    <span>{closing ? 'กำลังปิดตี้...' : 'ปิดตี้'}</span>
                  </button>
                )}
              </div>

              <div className="sm:hidden" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
            </div>
          </div>
        </div>
      </div>

      {showDepositPay && (
        <DepositPaymentModal
          booking={booking}
          lineUser={lineUser}
          onClose={() => setShowDepositPay(false)}
          showToast={showToast}
          onUpdated={onUpdated}
        />
      )}
    </>
  )
}

// ── Main BookingPage Component ────────────────────────────────────────────────
export default function BookingPage({ lineUser, allGames = [], showToast, onLogin = () => {} }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createBookingDate, setCreateBookingDate] = useState('')
  const [detailBooking, setDetailBooking] = useState(null)
  const [calendarDate, setCalendarDate] = useState('')
  const [myBookingsTab, setMyBookingsTab] = useState('active') // 'active' | 'all' | 'closed'

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setBookings(all)
      setLoading(false)
      // Auto-collapse check for expired confirmed bookings
      all.forEach(async b => {
        if (b.status === 'confirmed' && b.depositDeadline && new Date() > new Date(b.depositDeadline)) {
          try {
            await updateDoc(doc(db, 'bookings', b.id), {
              status: 'collapsed',
              updatedAt: serverTimestamp()
            })
          } catch {}
        }
      })
    }, () => setLoading(false))
    return unsub
  }, [])

  // Handle ?booking=id URL param
  useEffect(() => {
    if (bookings.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const bid = params.get('booking')
    if (bid) {
      const found = bookings.find(b => b.id === bid)
      if (found) {
        const isAdmin = lineUser?.role === 'admin' || lineUser?.isAdmin
        const isMember = found.members?.some(m => m.uid === lineUser?.uid || m.id === lineUser?.uid)
        const isLeader = found.leaderId === lineUser?.uid
        if (found.status === 'locked' && !isAdmin && !isMember && !isLeader) {
          showToast('ตี้ห้องนี้ถูกล็อกแล้ว เฉพาะสมาชิกในตี้หรือแอดมินเท่านั้นที่สามารถดูรายละเอียดได้', 'warning')
          window.history.replaceState({}, '', '/booking')
          return
        }
        setDetailBooking(found)
      }
    }
  }, [bookings, lineUser, showToast])

  // Keep detail modal updated with Firestore changes
  useEffect(() => {
    if (detailBooking) {
      const fresh = bookings.find(b => b.id === detailBooking.id)
      if (fresh) setDetailBooking(fresh)
    }
  }, [bookings])

  const openDetail = useCallback((b) => {
    if (!b) return
    const isAdmin = lineUser?.role === 'admin' || lineUser?.isAdmin
    const isMember = b.members?.some(m => m.uid === lineUser?.uid || m.id === lineUser?.uid)
    const isLeader = b.leaderId === lineUser?.uid
    if (b.status === 'locked' && !isAdmin && !isMember && !isLeader) {
      showToast('ตี้ห้องนี้ถูกล็อกแล้ว เฉพาะสมาชิกในตี้หรือแอดมินเท่านั้นที่สามารถดูรายละเอียดได้', 'warning')
      return
    }
    setDetailBooking(b)
  }, [lineUser, showToast])
  const closeDetail = useCallback(() => {
    setDetailBooking(null)
    const params = new URLSearchParams(window.location.search)
    if (params.has('booking')) window.history.replaceState({}, '', '/booking')
  }, [])

  const myBookings = lineUser
    ? bookings.filter(b => b.members?.some(m => m.uid === lineUser.uid))
    : []

  const activeMyBookings = myBookings.filter(b => b.status !== 'cancelled' && b.status !== 'collapsed')
  const closedMyBookings = myBookings.filter(b => b.status === 'cancelled' || b.status === 'collapsed')

  const displayedMyBookings = myBookingsTab === 'active'
    ? activeMyBookings
    : myBookingsTab === 'closed'
      ? closedMyBookings
      : myBookings

  const handleCloseBookingFromList = async (b) => {
    const isLeader = b.leaderId === lineUser?.uid
    if (!isLeader && lineUser?.role !== 'admin') {
      showToast('เฉพาะหัวหน้าเท่านั้นที่สามารถปิดตี้ได้', 'error')
      return
    }
    if (!window.confirm(`ยืนยันปิดตี้ "${b.gameName || 'การจอง'}" และยกเลิกการจองนี้?`)) return
    try {
      await updateDoc(doc(db, 'bookings', b.id), {
        status: 'cancelled',
        closedAt: new Date().toISOString(),
        closedBy: lineUser?.uid || '',
        updatedAt: serverTimestamp(),
      })
      showToast('ปิดตี้เรียบร้อยแล้ว')
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  const upcomingCount = bookings.filter(b => b.status === 'locked' || b.status === 'confirmed').length

  const handleStartBooking = (date = '') => {
    if (date) setCreateBookingDate(date)
    if (!lineUser) {
      onLogin()
    } else {
      setShowCreate(true)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '12px', color: 'var(--text-tertiary)', fontFamily: 'Sarabun, sans-serif', background: '#f5f5f7' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--crimson-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em' }}>กำลังโหลดระบบจองห้อง...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: 'Sarabun, sans-serif', paddingTop: '56px', paddingBottom: '80px' }}>
      {/* ── Hero Header ───────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', background: '#fff', borderBottom: '1px solid var(--border-default)', padding: '48px 24px 40px' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 100% at 0% 50%, rgba(198,36,25,0.06) 0%, transparent 60%), radial-gradient(ellipse 40% 80% at 100% 0%, rgba(198,36,25,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Tag + Title */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(198,36,25,0.1)', border: '1px solid rgba(198,36,25,0.3)', color: 'var(--crimson-500)', fontSize: '11px', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '14px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--crimson-400)' }} />
                SOFUN MYSTERY LOUNGE · BOOKING SYSTEM
              </div>
              <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 'clamp(28px,5vw,48px)', color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.15, margin: '0 0 10px', textTransform: 'uppercase' }}>
                จองรอบเกม & ตารางห้อง
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 20px', maxWidth: '560px' }}>
                เลือกวันเวลา เช็คตารางห้องว่างแบบเรียลไทม์ หรือสร้างปาร์ตี้เพื่อเปิดห้องสืบคดีได้ทันที
              </p>
              {/* Stats row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {[
                  { icon: 'fas fa-theater-masks', text: `${allGames.length || '50+'} สคริปต์` },
                  { icon: 'fas fa-door-open', text: '12 ห้อง' },
                  { icon: 'fas fa-calendar-check', text: `${upcomingCount} รอบยืนยัน` },
                ].map(s => (
                  <div key={s.text} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '6px 14px', borderRadius: '10px', background: 'var(--surface-card)', border: '1px solid var(--border-default)', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <i className={s.icon} style={{ color: 'var(--crimson-500)', fontSize: '11px' }} />
                    <span>{s.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div>
              {lineUser ? (
                <button onClick={() => handleStartBooking()} style={{ padding: '12px 28px', borderRadius: '12px', background: 'var(--crimson-500)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'background 0.15s, transform 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--crimson-600)'; e.currentTarget.style.transform='translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--crimson-500)'; e.currentTarget.style.transform='translateY(0)' }}>
                  <i className="fas fa-plus" style={{ fontSize: '11px' }} /> จองเกมใหม่
                </button>
              ) : (
                <button onClick={onLogin} style={{ padding: '12px 28px', borderRadius: '12px', background: 'var(--line-green)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '10px', transition: 'opacity 0.15s, transform 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity='0.88'; e.currentTarget.style.transform='translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)' }}>
                  <i className="fab fa-line" style={{ fontSize: '18px' }} />เข้าสู่ระบบด้วย LINE
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Two-Column Layout ─────────────────────────────────────────── */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: My Bookings or Guest Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {lineUser ? (
            <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)', borderRadius: '20px', padding: '20px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>การจองของฉัน</h3>
                  {activeMyBookings.length > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 8px', borderRadius: '20px', background: 'rgba(198,36,25,0.18)', color: 'var(--crimson-500)' }}>{activeMyBookings.length}</span>
                  )}
                </div>
                <button onClick={() => handleStartBooking()} style={{ fontSize: '12px', fontWeight: 700, color: 'var(--crimson-500)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color='var(--crimson-600)'}
                  onMouseLeave={e => e.currentTarget.style.color='var(--crimson-500)'}>
                  <i className="fas fa-plus" style={{ fontSize: '10px' }} /> สร้างตี้
                </button>
              </div>

              {/* Segmented tabs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', padding: '4px', borderRadius: '12px', background: 'var(--surface-sunken)', fontSize: '12px', marginBottom: '16px' }}>
                {[
                  { key: 'active', label: 'รอดำเนินการ', count: activeMyBookings.length },
                  { key: 'all', label: 'ทั้งหมด', count: myBookings.length },
                  { key: 'closed', label: 'ปิด/ยกเลิก', count: closedMyBookings.length },
                ].map(t => {
                  const isActive = myBookingsTab === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => setMyBookingsTab(t.key)}
                      style={{ padding: '7px 4px', borderRadius: '9px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'all 0.15s', background: isActive ? 'var(--surface-raised)' : 'transparent', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      <span>{t.label}</span>
                      {t.count > 0 && (
                        <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                          isActive ? 'bg-slate-100 text-slate-700' : 'bg-slate-200/80 text-slate-600'
                        }`}>
                          {t.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Booking List or Empty State */}
              {displayedMyBookings.length === 0 ? (
                <div style={{ padding: '28px 16px', borderRadius: '12px', border: '1px dashed var(--border-default)', textAlign: 'center', background: 'var(--surface-card)' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', color: 'var(--text-tertiary)', fontSize: '18px' }}>
                    <i className="fas fa-calendar-plus" />
                  </div>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                    {myBookingsTab === 'active' ? 'ไม่มีการจองที่กำลังดำเนินอยู่' : myBookingsTab === 'closed' ? 'ไม่มีการจองที่ปิดหรือยกเลิก' : 'ยังไม่มีประวัติการจอง'}
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>เลือกบทละครที่สนใจ แล้วกดจองเพื่อสร้างห้องและชวนเพื่อนร่วมตี้</p>
                  <button onClick={() => handleStartBooking()} style={{ padding: '8px 20px', borderRadius: '10px', background: 'var(--crimson-500)', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--crimson-600)'}
                    onMouseLeave={e => e.currentTarget.style.background='var(--crimson-500)'}>
                    + สร้างการจองใหม่
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {displayedMyBookings.map(b => (
                    <BookingCard key={b.id} booking={b} lineUser={lineUser} onOpen={openDetail} onCloseBooking={handleCloseBookingFromList} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Guest card — dark cinematic */
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '20px', background: 'var(--surface-raised)', border: '1px solid var(--border-default)', padding: '28px 24px' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(6,199,85,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(6,199,85,0.1)', border: '1px solid rgba(6,199,85,0.2)', color: 'var(--line-green)', fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>
                  <i className="fas fa-crown" style={{ fontSize: '10px' }} />SOFUN VIP PASS
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.01em' }}>เข้าสู่ระบบเพื่อเริ่มจอง</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6, maxWidth: '280px' }}>เชื่อมต่อด้วย LINE เพื่อจัดการรอบเล่น ชวนเพื่อน และรับสิทธิพิเศษ Exclusive</p>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left', marginBottom: '20px' }}>
                  {[
                    { icon: 'fas fa-door-closed', col: '#d97706', text: 'ล็อคห้องส่วนตัว & เลือกรอบเวลาที่ต้องการ' },
                    { icon: 'fas fa-users', col: '#2563eb', text: 'สร้างปาร์ตี้ ส่งลิงก์ชวนเพื่อนร่วมตี้' },
                    { icon: 'fab fa-line', col: 'var(--line-green)', text: 'แจ้งเตือนสถานะการจองผ่าน LINE ทันที' },
                    { icon: 'fas fa-gem', col: 'var(--crimson-400)', text: 'สะสมแต้มเล่นเกมเพื่อรับส่วนลดพิเศษ' },
                  ].map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', background: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${item.col}18`, border: `1px solid ${item.col}30`, color: item.col, fontSize: '12px' }}>
                        <i className={item.icon} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{item.text}</span>
                    </div>
                  ))}
                </div>
                <button onClick={onLogin} style={{ width: '100%', padding: '14px 24px', borderRadius: '12px', background: 'var(--line-green)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity='0.88'}
                  onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                  <i className="fab fa-line" style={{ fontSize: '18px' }} />เข้าสู่ระบบด้วย LINE เพื่อจองห้อง
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Calendar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)', borderRadius: '20px', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '4px', height: '18px', borderRadius: '4px', background: 'var(--crimson-500)' }} />
                <h3 style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>ตารางห้อง & ปฏิทินรอบเล่น</h3>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>คลิกวันที่เพื่อดูรายละเอียด</span>
            </div>
            <BookingCalendar
              bookings={bookings}
              onDayClick={date => setCalendarDate(d => d === date ? '' : date)}
              selectedDate={calendarDate}
              onEventClick={openDetail}
              onBookToday={handleStartBooking}
            />
          </div>
        </div>
      </main>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateBookingModal
          allGames={allGames}
          bookings={bookings}
          lineUser={lineUser}
          defaultDate={createBookingDate || calendarDate}
          onClose={() => {
            setShowCreate(false)
            setCreateBookingDate('')
          }}
          showToast={showToast}
        />
      )}

      {detailBooking && (
        <BookingDetailModal
          booking={detailBooking}
          lineUser={lineUser}
          onClose={closeDetail}
          showToast={showToast}
          onUpdated={() => {}}
        />
      )}
    </div>
  )
}
