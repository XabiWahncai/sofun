import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, getDoc
} from 'firebase/firestore'
import { verifySlipDirect, viewSlipImage } from '../utils/slipVerifier'
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
  'Chinese DM': 'var(--red, #e50914)', 'Thai DM': '#b45309',
}

const STATUS_LABELS = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  locked: 'ล็อกห้องแล้ว',
  collapsed: 'ปาร์ตี้ล่ม',
  cancelled: 'ปิดตี้แล้ว',
}

const STATUS_COLORS = {
  pending:   { bg: 'rgba(245, 158, 11, 0.08)', color: '#b45309', border: 'rgba(245, 158, 11, 0.25)' },
  confirmed: { bg: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',   color: 'var(--curtain-crimson, #e50914)', border: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.25)' },
  locked:    { bg: 'rgba(16, 185, 129, 0.08)', color: '#15803d', border: 'rgba(16, 185, 129, 0.25)' },
  collapsed: { bg: 'rgba(239, 68, 68, 0.08)',  color: '#dc2626', border: 'rgba(239, 68, 68, 0.25)' },
  cancelled: { bg: 'rgba(100, 116, 139, 0.08)',color: '#64748b', border: 'rgba(100, 116, 139, 0.2)' },
}

const TIME_SLOTS = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']

// ── Room Categories & Metadata ────────────────────────────────────────────────
const ROOM_CATEGORIES = [
  { id: 'all', label: 'ทั้งหมด (12 ห้อง)' },
  { id: 'theme', label: 'ห้องธีมพิเศษ (6)' },
  { id: 'dm', label: 'ห้อง DM (3)' },
  { id: 'lounge', label: 'โซนรับรอง (3)' },
]

const ROOM_METADATA = {
  'Japanese Room': { category: 'theme', icon: 'fas fa-torii-gate', desc: 'ห้องธีมญี่ปุ่นโบราณ ปูเสื่อทาทามิ', cap: '6-10 คน' },
  'Chinese Room':  { category: 'theme', icon: 'fas fa-dragon', desc: 'ห้องธีมโรงเตี๊ยมจีนโบราณ บรรยากาศลึกลับ', cap: '6-10 คน' },
  'Europe Room':   { category: 'theme', icon: 'fas fa-chess-rook', desc: 'ห้องคฤหาสน์ยุโรปคลาสสิก หรูหราโอ่อ่า', cap: '6-10 คน' },
  'Ghost Room':    { category: 'theme', icon: 'fas fa-ghost', desc: 'ห้องสืบคดีสยองขวัญ แสงเงาชวนขนลุก', cap: '6-8 คน' },
  'Projector Room':{ category: 'theme', icon: 'fas fa-film', desc: 'ห้องจอฉายโปรเจกเตอร์ เสียงสมจริงรอบทิศทาง', cap: '6-12 คน' },
  '404 Bar':       { category: 'theme', icon: 'fas fa-cocktail', desc: 'เคาน์เตอร์บาร์ลับ สไตล์ Cyberpunk Noir', cap: '6-10 คน' },
  'Chinese DM':    { category: 'dm',    icon: 'fas fa-scroll', desc: 'ห้องผู้ดำเนินเกมสายจีน พากย์สดเข้มข้น', cap: '5-8 คน' },
  'Thai DM':       { category: 'dm',    icon: 'fas fa-feather-alt', desc: 'ห้องผู้ดำเนินเกมภาษาไทย ถ่ายทอดอารมณ์สด', cap: '5-8 คน' },
  'Yang':          { category: 'dm',    icon: 'fas fa-yin-yang', desc: 'ห้องพิธีกรรมหยาง สืบสวนคดีปริศนา', cap: '6-8 คน' },
  'Waiting Area 1':{ category: 'lounge',icon: 'fas fa-couch', desc: 'โซฟานั่งเล่น บรีฟเนื้อเรื่องก่อนเริ่มเกม', cap: '4-8 คน' },
  'Waiting Area 2':{ category: 'lounge',icon: 'fas fa-users', desc: 'โซนพูดคุยแลกเปลี่ยนเบาะแสและพักผ่อน', cap: '4-8 คน' },
  '5 Floor':       { category: 'lounge',icon: 'fas fa-building', desc: 'ห้องโถงชั้น 5 กว้างขวาง รองรับตี้ใหญ่', cap: '8-14 คน' },
}

// ── Netflix Booking Design System & Keyframe Styles ───────────────────────────
const NETFLIX_BOOKING_CSS = `
  /* Keyframe Animations */
  @keyframes netflixFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes netflixSlideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Two-column calendar responsive grid */
  .booking-two-col-grid {
    display: grid;
    grid-template-columns: minmax(330px, 390px) 1fr;
    gap: 24px;
    align-items: start;
  }
  @media (max-width: 960px) {
    .booking-two-col-grid {
      grid-template-columns: 1fr !important;
      gap: 20px !important;
    }
  }

  .nfx-btn-primary {
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, background 0.16s ease !important;
  }
  .nfx-btn-primary:hover {
    transform: scale(1.02) translateY(-1px) !important;
    box-shadow: 0 8px 24px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.35) !important;
  }
  .nfx-btn-primary:active {
    transform: scale(0.97) !important;
  }

  .nfx-btn-secondary {
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.16s ease, border-color 0.16s ease !important;
  }
  .nfx-btn-secondary:hover {
    transform: scale(1.02) translateY(-1px) !important;
    border-color: rgba(0, 0, 0, 0.25) !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06) !important;
  }
  .nfx-btn-secondary:active {
    transform: scale(0.97) !important;
  }

  .nfx-script-card {
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  @media (hover: hover) {
    .nfx-script-card:not(.selected):not(.locked):hover {
      border-color: var(--curtain-crimson, #e50914) !important;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08) !important;
      transform: translateY(-2px) !important;
    }
  }
  .nfx-script-card.selected {
    border-color: var(--curtain-crimson, #e50914) !important;
    box-shadow: 0 8px 24px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.25) !important;
    transform: translateY(-2px) !important;
  }
`

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
export function fmtDate(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${parseInt(d)} ${MONTH_NAMES[parseInt(m) - 1]} ${parseInt(y) + 543}`
}
export function fmtDateTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  const day = d.getDate()
  const month = MONTH_NAMES[d.getMonth()]
  const year = d.getFullYear() + 543
  const hrs = pad2(d.getHours())
  const mins = pad2(d.getMinutes())
  return `${day} ${month} ${year} เวลา ${hrs}:${mins} น.`
}
export function formatCountdown(isoStr) {
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

export function calculateDepositDeadline(booking, paidCountOverride) {
  if (!booking) return ''
  const confirmedMs = booking.confirmedAt
    ? new Date(booking.confirmedAt).getTime()
    : booking.createdAt?.toMillis
      ? booking.createdAt.toMillis()
      : booking.createdAt
        ? new Date(booking.createdAt).getTime()
        : Date.now()

  const paidCount = paidCountOverride !== undefined
    ? paidCountOverride
    : (booking.members?.filter(m => m.paidDeposit).length || 0)

  // 3 days initial window, extends by +3 days per paid member (5 paid = 15 days)
  const days = Math.max(3, paidCount * 3)
  const rawDeadlineMs = confirmedMs + (days * 86400000)
  let targetMs = rawDeadlineMs

  // Cap: cannot exceed 1 day before play date ("และต้องจองก่อนเล่น 1 วัน")
  if (booking.date) {
    const playDateStr = `${booking.date}T${booking.time || '12:00'}:00`
    const playMs = new Date(playDateStr).getTime()
    if (!isNaN(playMs)) {
      const capMs = playMs - 24 * 3600000
      if (capMs > confirmedMs) {
        targetMs = Math.min(rawDeadlineMs, capMs)
      } else {
        targetMs = Math.max(confirmedMs + 3600000, capMs)
      }
    }
  }

  return new Date(targetMs).toISOString()
}

import { toOptimizedUrl as convertImg } from '../utils/imageUrl'

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

// ── Robust Member Avatar Component ─────────────────────────────────────────────
function MemberAvatar({
  src,
  name,
  size = 40,
  style = {},
  imgStyle = {},
  className = '',
  title = '',
  onClick = null,
  badge = null,
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  const initial = (name || '?')[0].toUpperCase()

  const resolvedSrc = useMemo(() => {
    if (!src || failed) return null
    return convertImg(src, size * 2)
  }, [src, failed, size])

  return (
    <div
      className={`relative shrink-0 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      title={title || name}
      style={{ width: size, height: size, ...style }}
    >
      {resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt={name || ''}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full rounded-full object-cover"
          style={imgStyle}
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center font-black"
          style={{
            background: '#f1f5f9',
            color: '#64748b',
            fontSize: Math.max(10, Math.round(size * 0.36)),
            ...imgStyle,
          }}
        >
          {initial}
        </div>
      )}
      {badge}
    </div>
  )
}

const DAY_NAMES_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์']

// ── Locked Room & Privacy Helpers ──────────────────────────────────────────────
export function isRoomLocked(b) {
  if (!b) return false
  if (b.status === 'locked') return true
  if (b.isMock) return true
  const max = b.maxMembers || 0
  const paid = b.members?.filter(m => m.paidDeposit).length || 0
  if (max > 0 && paid >= max) return true
  return false
}

export function canViewBookingDetail(b, user) {
  if (!b) return false
  const locked = isRoomLocked(b)
  if (!locked) return true // Open / pending / recruiting bookings can be viewed to join
  const isAdmin = user?.role === 'admin' || user?.isAdmin
  const isLeader = b.leaderId === user?.uid
  const isMember = b.members?.some(m => m.uid === user?.uid || m.id === user?.uid)
  return Boolean(isAdmin || isLeader || isMember)
}

export function getPublicGameName(b, user) {
  if (!b) return ''
  const canView = canViewBookingDetail(b, user)
  if (isRoomLocked(b) && !canView) {
    return 'ล็อกห้องแล้ว'
  }
  if (b.isMock) {
    if (b.gameName && b.gameName !== 'Mock Block' && !b.gameName.toLowerCase().includes('mock')) {
      return b.gameName
    }
    return (user?.role === 'admin' || user?.isAdmin) ? 'ปิดรอบส่วนตัว (Admin Block)' : 'ปิดรอบส่วนตัว'
  }
  if (b.gameName && b.gameName.toLowerCase().includes('mock')) {
    return 'ปิดรอบส่วนตัว'
  }
  return b.gameName || 'การจองห้อง'
}

export function getEventTitle(b, user) {
  if (!b) return ''
  const locked = isRoomLocked(b)
  const canView = canViewBookingDetail(b, user)
  const roomName = b.room || 'ห้องเล่น'
  const timeStr = b.time ? ` — ${b.time}` : ''

  if (locked && !canView) {
    return `${roomName}${timeStr} (ล็อกห้องแล้ว)`
  }

  const name = getPublicGameName(b, user)
  return `${name || roomName}${timeStr}`
}

// ── Google-Calendar-style Monthly Grid ────────────────────────────────────────
function BookingCalendar({ bookings, lineUser, onDayClick, selectedDate, onEventClick, onBookToday }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [viewModeOverride, setViewModeOverride] = useState('auto')
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

  const totalMonthBookings = Object.entries(bookingsByDate).reduce((acc, [d, list]) => {
    if (d.startsWith(`${viewYear}-${pad2(viewMonth + 1)}`)) return acc + list.length
    return acc
  }, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'Sarabun, sans-serif' }}>
      {/* ── Header: Month + Navigation Controls ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: '#ffffff',
          padding: '16px 20px',
          borderRadius: '16px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',
              border: '1px solid rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.2)',
              color: 'var(--curtain-crimson, #e50914)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '17px',
              flexShrink: 0,
            }}
          >
            <i className="far fa-calendar-alt" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <h2
                style={{
                  fontSize: '22px',
                  fontWeight: 900,
                  color: '#111827',
                  letterSpacing: '-0.01em',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                {MONTH_NAMES[viewMonth]}
              </h2>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: 'var(--curtain-crimson, #e50914)',
                  background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                }}
              >
                {viewYear + 543}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>ตารางจองรอบเล่นเดือนนี้</span>
              {totalMonthBookings > 0 && (
                <span
                  style={{
                    background: '#dcfce7',
                    color: '#15803d',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '11px',
                  }}
                >
                  {totalMonthBookings} รอบ
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Controls + View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setViewModeOverride(m => {
              if (m === 'auto') return useBarMode ? 'cards' : 'bars'
              return m === 'bars' ? 'cards' : 'bars'
            })}
            title={useBarMode ? 'สลับเป็นมุมมองแสดงการ์ดข้อความ' : 'สลับเป็นมุมมองแท่งสีห้อง'}
            style={{
              padding: '7px 12px',
              borderRadius: '10px',
              border: `1px solid ${useBarMode ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.3)' : 'rgba(0, 0, 0, 0.08)'}`,
              background: useBarMode ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)' : '#ffffff',
              color: useBarMode ? 'var(--curtain-crimson, #e50914)' : '#4b5563',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <i className={useBarMode ? 'fas fa-bars' : 'fas fa-th-large'} style={{ fontSize: '11px' }} />
            <span>{useBarMode ? 'แท่งสีห้อง' : 'การ์ดข้อความ'}</span>
          </button>

          <button
            type="button"
            onClick={goToday}
            style={{
              padding: '7px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              background: '#ffffff',
              color: '#4b5563',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--curtain-crimson, #e50914)'
              e.currentTarget.style.color = '#e50914'
              e.currentTarget.style.background = 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.04)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.08)'
              e.currentTarget.style.color = '#4b5563'
              e.currentTarget.style.background = '#ffffff'
            }}
          >
            <i className="fas fa-bullseye" style={{ fontSize: '11px', color: 'var(--curtain-crimson, #e50914)' }} />
            วันนี้
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#ffffff',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={prevMonth}
              title="เดือนก่อนหน้า"
              style={{
                width: '34px',
                height: '34px',
                border: 'none',
                background: 'transparent',
                color: '#4b5563',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <i className="fas fa-chevron-left" style={{ fontSize: '11px' }} />
            </button>
            <div style={{ width: '1px', height: '18px', background: 'rgba(0, 0, 0, 0.08)' }} />
            <button
              type="button"
              onClick={nextMonth}
              title="เดือนถัดไป"
              style={{
                width: '34px',
                height: '34px',
                border: 'none',
                background: 'transparent',
                color: '#4b5563',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <i className="fas fa-chevron-right" style={{ fontSize: '11px' }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Monthly Grid Card ── */}
      <div
        ref={calendarRef}
        style={{
          borderRadius: '18px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Day-of-week header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            background: '#f8fafc',
            borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          {DAY_NAMES_FULL.map((d, i) => {
            const isSun = i === 0
            const isSat = i === 6
            const headerColor = isSun ? 'var(--curtain-crimson, #e50914)' : isSat ? '#2563eb' : '#475569'
            return (
              <div
                key={d}
                style={{
                  padding: '10px 2px',
                  textAlign: 'center',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: headerColor,
                  letterSpacing: '0.02em',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1px',
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

        {/* Calendar cells: locked 108px height */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, idx) => {
            const col = idx % 7
            const isSun = col === 0
            const isSat = col === 6
            const isLastCol = col === 6
            const isLastRow = idx >= cells.length - 7

            const borderRight = isLastCol ? 'none' : '1px solid #f1f5f9'
            const borderBottom = isLastRow ? 'none' : '1px solid #f1f5f9'

            if (!day) {
              return (
                <div key={`e-${idx}`} style={{ height: '108px', background: '#f8fafc', borderRight, borderBottom }} />
              )
            }

            const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
            const dayBookings = bookingsByDate[dateStr] || []
            const dayBookingsSorted = dayBookings.slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''))
            const isToday = todayStr === dateStr
            const isSel = activeDateStr === dateStr
            const isPast = dateStr < todayStr

            const cellBg = isSel
              ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.03)'
              : isToday
                ? 'rgba(245, 158, 11, 0.02)'
                : isPast
                  ? '#fcfcfd'
                  : '#ffffff'

            return (
              <div
                key={day}
                onClick={() => onDayClick(dateStr)}
                style={{
                  height: '108px',
                  overflow: 'hidden',
                  padding: '8px 6px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  cursor: 'pointer',
                  background: cellBg,
                  borderRight,
                  borderBottom,
                  transition: 'background 0.12s',
                  position: 'relative',
                  boxShadow: isSel ? 'inset 0 0 0 2px var(--curtain-crimson, #e50914)' : 'none',
                }}
                onMouseEnter={e => { if (!isSel && !isToday) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.025)' }}
                onMouseLeave={e => e.currentTarget.style.background = cellBg}
              >
                {/* Cell Header: Date Number & Indicator */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '2px',
                    flexShrink: 0,
                  }}
                >
                  {isToday ? (
                    <span
                      style={{
                        fontSize: '8.5px',
                        fontWeight: 900,
                        color: 'var(--curtain-crimson, #e50914)',
                        letterSpacing: '0.02em',
                        textTransform: 'uppercase',
                      }}
                    >
                      วันนี้
                    </span>
                  ) : dayBookingsSorted.length > 0 ? (
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: 'var(--curtain-crimson, #e50914)',
                        opacity: 0.85,
                      }}
                    />
                  ) : <span />}

                  {/* Day Number badge */}
                  <span
                    style={{
                      width: '21px',
                      height: '21px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      flexShrink: 0,
                      color: isToday
                        ? '#ffffff'
                        : isSel
                          ? 'var(--curtain-crimson, #e50914)'
                          : isSun
                            ? 'var(--curtain-crimson, #e50914)'
                            : isSat
                              ? '#2563eb'
                              : isPast
                                ? '#94a3b8'
                                : '#1e293b',
                      background: isToday
                        ? 'var(--curtain-crimson, #e50914)'
                        : isSel
                          ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.12)'
                          : 'transparent',
                      boxShadow: isToday ? '0 2px 6px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.35)' : 'none',
                    }}
                  >
                    {day}
                  </span>
                </div>

                {/* Event items */}
                {useBarMode ? (
                  dayBookingsSorted.map(b => {
                    const rc = ROOM_COLORS[b.room] || '#64748b'
                    return (
                      <div
                        key={b.id}
                        onClick={e => { e.stopPropagation(); onEventClick?.(b) }}
                        title={getEventTitle(b, lineUser)}
                        style={{
                          height: '7px',
                          borderRadius: '99px',
                          background: rc,
                          cursor: 'pointer',
                          flexShrink: 0,
                          opacity: 0.88,
                          transition: 'opacity 0.12s, transform 0.12s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scaleY(1.3)' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scaleY(1)' }}
                      />
                    )
                  })
                ) : (
                  dayBookingsSorted.map(b => {
                    const rc = ROOM_COLORS[b.room] || '#64748b'
                    const locked = isRoomLocked(b)
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={e => { e.stopPropagation(); onEventClick?.(b) }}
                        title={getEventTitle(b, lineUser)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '3px 6px',
                          borderRadius: '6px',
                          border: 'none',
                          background: `${rc}18`,
                          borderLeft: `3px solid ${rc}`,
                          cursor: 'pointer',
                          transition: 'opacity 0.12s',
                          minWidth: 0,
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.room || 'ห้อง'}</span>
                          {locked && (
                            <i className="fas fa-lock" style={{ fontSize: '8px', opacity: 0.7, flexShrink: 0 }} />
                          )}
                        </div>
                        {b.time && (
                          <div style={{ fontSize: '9.5px', color: '#64748b', lineHeight: 1.2 }}>{b.time} น.</div>
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

      {/* ── Selected Day Action Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          padding: '16px 20px',
          borderRadius: '16px',
          background: '#ffffff',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: activeDateStr === todayStr ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)' : '#f1f5f9',
              color: activeDateStr === todayStr ? 'var(--curtain-crimson, #e50914)' : '#4b5563',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              flexShrink: 0,
              marginTop: '1px',
            }}
          >
            <i className={activeDateStr === todayStr ? 'fas fa-star' : 'far fa-calendar-check'} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '14.5px',
                fontWeight: 900,
                color: '#111827',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span>{activeDateStr === todayStr ? `วันนี้ · ${fmtDate(activeDateStr)}` : fmtDate(activeDateStr)}</span>
              {selectedDayBookings.length > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',
                    color: 'var(--curtain-crimson, #e50914)',
                    border: '1px solid rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.2)',
                  }}
                >
                  {selectedDayBookings.length} รอบเล่น
                </span>
              )}
            </div>

            {selectedDayBookings.length > 0 ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                {selectedDayBookings.map(b => {
                  const rc = ROOM_COLORS[b.room] || '#64748b'
                  const locked = isRoomLocked(b)
                  const canView = canViewBookingDetail(b, lineUser)
                  const publicName = getPublicGameName(b, lineUser)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onEventClick?.(b)}
                      title={getEventTitle(b, lineUser)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: `${rc}14`,
                        border: `1px solid ${rc}40`,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        fontFamily: 'Sarabun, sans-serif',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = `${rc}26`
                        e.currentTarget.style.borderColor = rc
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = `${rc}14`
                        e.currentTarget.style.borderColor = `${rc}40`
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: rc, flexShrink: 0 }} />
                      <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#111827' }}>{b.room || 'ห้องเล่น'}</span>
                      {locked && (
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                          <i className="fas fa-lock" style={{ fontSize: '8px' }} />ล็อก
                        </span>
                      )}
                      {b.time && <span style={{ fontSize: '11px', color: rc, fontWeight: 800 }}>{b.time} น.</span>}
                      {canView && publicName && <span style={{ fontSize: '10.5px', color: '#64748b' }}>({publicName})</span>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                ยังไม่มีรอบเล่นในวันนี้ — สามารถเปิดตี้แรกได้เลย
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onBookToday?.(activeDateStr)}
          className="nfx-btn-primary"
          style={{
            flexShrink: 0,
            padding: '10px 22px',
            borderRadius: '12px',
            background: 'var(--curtain-crimson, #e50914)',
            border: 'none',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.28)',
            whiteSpace: 'nowrap',
          }}
        >
          <i className="fas fa-plus" style={{ fontSize: '11px' }} />
          จองรอบวันนี้
        </button>
      </div>
    </div>
  )
}

// ── Netflix Clean White Booking Card Component ────────────────────────────────
function BookingCard({ booking, lineUser, onOpen, onCloseBooking }) {
  const paidCount = booking.members?.filter(m => m.paidDeposit).length || 0
  const total = booking.members?.length || 0
  const max = booking.maxMembers || total || 1
  const isLeader = booking.leaderId === lineUser?.uid
  const pendingRequests = booking.joinRequests?.length || 0
  const isLocked = isRoomLocked(booking)
  const canView = canViewBookingDetail(booking, lineUser)
  const publicGameName = getPublicGameName(booking, lineUser)
  const imgSrc = (!isLocked || canView) && booking.gameImage ? convertImg(booking.gameImage, 400) : null
  const countdown = booking.status === 'confirmed' && booking.depositDeadline ? formatCountdown(booking.depositDeadline) : null
  const isUrgent = countdown && new Date(booking.depositDeadline) - new Date() < 24 * 3600000
  const allPaid = paidCount >= max
  const paidPct = Math.min(100, Math.round((paidCount / max) * 100))
  const rc = ROOM_COLORS[booking.room] || '#64748b'
  const isCollapsed = booking.status === 'collapsed'

  return (
    <div
      onClick={() => onOpen(booking)}
      style={{
        position: 'relative',
        borderRadius: '16px',
        border: `1px solid ${isCollapsed ? '#fecaca' : 'rgba(0, 0, 0, 0.08)'}`,
        background: isCollapsed ? '#fef2f2' : '#ffffff',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onMouseEnter={e => {
        if (!isCollapsed) {
          e.currentTarget.style.borderColor = 'var(--curtain-crimson, #e50914)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.08)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = isCollapsed ? '#fecaca' : 'rgba(0, 0, 0, 0.08)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.02)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Left: 3D Poster Thumbnail */}
      <div
        style={{
          width: '84px',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
          background: '#111827',
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '22px',
            }}
          >
            <i className={isLocked && !canView ? 'fas fa-lock' : 'fas fa-scroll'} />
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: rc }} />
      </div>

      {/* Right: Content */}
      <div
        style={{
          flex: '1 1 0%',
          minWidth: 0,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        {/* Title + Status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div
            style={{
              fontSize: '14.5px',
              fontWeight: 800,
              color: '#111827',
              lineHeight: 1.3,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {publicGameName}
          </div>
          <StatusBadge
            status={isLocked ? 'locked' : booking.status}
            label={isLocked && !canView ? 'ล็อกห้องแล้ว' : (booking.status === 'cancelled' && booking.closedBy ? 'ปิดตี้แล้ว' : undefined)}
          />
        </div>

        {/* Meta chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11.5px', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <i className="fas fa-calendar text-[10px]" style={{ color: 'var(--curtain-crimson, #e50914)' }} />
            {fmtDate(booking.date)}
          </span>
          {booking.time && (
            <span style={{ fontSize: '11.5px', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fas fa-clock text-[10px]" style={{ color: '#f59e0b' }} />
              {booking.time} น.
            </span>
          )}
          {booking.room && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: rc, fontWeight: 700 }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: rc, flexShrink: 0 }} />
              {booking.room}
            </span>
          )}
          {isLeader && (
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 800,
                color: 'var(--curtain-crimson, #e50914)',
                background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',
                padding: '1px 6px',
                borderRadius: '6px',
                border: '1px solid rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.2)',
              }}
            >
              หัวหน้า
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px', borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}>
          {isLocked && !canView ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#15803d', fontWeight: 700 }}>
              <span><i className="fas fa-lock mr-1" />ห้องนี้ถูกล็อกแล้ว</span>
              <span>เฉพาะสมาชิกในตี้</span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>
              <span>สมาชิก {total}/{max} คน</span>
              <span style={{ color: isLocked || allPaid ? '#15803d' : 'var(--curtain-crimson, #e50914)', fontWeight: 700 }}>
                {isLocked ? 'ล็อกห้องแล้ว 100%' : `มัดจำ ${paidCount}/${max} คน`}
              </span>
            </div>
          )}

          <div style={{ height: '5px', borderRadius: '5px', background: '#f1f5f9', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: isLocked && !canView ? '100%' : `${paidPct}%`,
                background: isLocked || allPaid ? '#16a34a' : 'var(--curtain-crimson, #e50914)',
                borderRadius: '5px',
                transition: 'width 0.3s ease-out',
              }}
            />
          </div>
        </div>

        {/* Bottom row: Countdown / Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          {(!isLocked || canView) && countdown ? (
            <div
              style={{
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: isUrgent ? '#fee2e2' : '#fef3c7',
                color: isUrgent ? '#dc2626' : '#b45309',
                border: `1px solid ${isUrgent ? '#fecaca' : '#fde68a'}`,
              }}
            >
              <i className="fas fa-clock text-[9px]" />
              {countdown}
            </div>
          ) : <span />}

          {isLeader && booking.status === 'collapsed' && onCloseBooking ? (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onCloseBooking(booking) }}
              title="ปิดตี้ที่ล่ม"
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <i className="fas fa-times-circle" />
              ปิดตี้
            </button>
          ) : (
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--curtain-crimson, #e50914)', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
              ดูรายละเอียด <i className="fas fa-chevron-right text-[9px]" />
            </span>
          )}
        </div>
      </div>

      {/* Floating requests pill */}
      {isLeader && pendingRequests > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'var(--curtain-crimson, #e50914)',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 900,
            padding: '2px 8px',
            borderRadius: '20px',
            boxShadow: '0 2px 8px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.4)',
            pointerEvents: 'none',
          }}
        >
          {pendingRequests} คำขอ
        </div>
      )}
    </div>
  )
}
// ── Helper to calculate player range ──────────────────────────────────────────
function getGamePlayerRange(g) {
  if (Array.isArray(g.characters) && g.characters.length > 0) {
    return { min: g.characters.length, max: g.characters.length }
  }
  const s = String(g.players || '').trim()
  const nums = s.match(/\d+/g)?.map(Number) || []
  if (nums.length === 0) return { min: 6, max: 6 }
  if (nums.length === 1) return { min: nums[0], max: nums[0] }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

// ── Create Booking Modal ───────────────────────────────────────────────────────
function CreateBookingModal({
  allGames = [],
  bookings = [],
  lineUser,
  onLogin,
  onClose,
  showToast,
  defaultDate = '',
  defaultGameId = '',
  defaultTime = '',
  defaultRoom = '',
}) {
  const tomorrowStr = toDateStr(new Date(Date.now() + 86400000))
  const [selectedDate, setSelectedDate] = useState(() => {
    if (defaultDate && defaultDate >= tomorrowStr) return defaultDate
    return tomorrowStr
  })
  const [selectedTime, setSelectedTime] = useState(defaultTime || '')
  const [selectedRoom, setSelectedRoom] = useState(defaultRoom || '')
  const [step, setStep] = useState(defaultGameId ? 'datetime' : 'game')
  const [selectedGame, setSelectedGame] = useState(() => {
    if (defaultGameId && allGames.length > 0) {
      return allGames.find(g => g.id === defaultGameId) || null
    }
    return null
  })

  useEffect(() => {
    if (defaultGameId && allGames.length > 0 && !selectedGame) {
      const found = allGames.find(g => g.id === defaultGameId)
      if (found) setSelectedGame(found)
    }
  }, [defaultGameId, allGames, selectedGame])

  const [search, setSearch] = useState('')
  const [playerFilter, setPlayerFilter] = useState('all')
  const [submitting, setSubmitting] = useState(false)

  const finalTime = selectedTime

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

  const filteredGames = useMemo(() => {
    return allGames.filter(g => {
      if (search && !g.title?.toLowerCase().includes(search.toLowerCase())) return false
      const range = getGamePlayerRange(g)
      if (playerFilter === '2-4' && !(range.min <= 4)) return false
      if (playerFilter === '5-6' && !(range.min <= 6 && range.max >= 5)) return false
      if (playerFilter === '7-8' && !(range.min <= 8 && range.max >= 7)) return false
      if (playerFilter === '9+' && !(range.max >= 9)) return false
      return true
    })
  }, [allGames, search, playerFilter])

  const handleSubmit = async () => {
    if (!lineUser || !lineUser.uid) {
      showToast('กรุณาเข้าสู่ระบบ LINE ก่อนทำการจอง', 'warning')
      onLogin?.()
      return
    }
    if (!selectedGame) {
      setStep('game')
      showToast('กรุณาเลือกสคริปต์ที่ต้องการเล่น', 'error')
      return
    }
    if (!selectedDate || !finalTime) {
      setStep('datetime')
      showToast('กรุณาเลือกวันที่และเวลาที่ต้องการเล่น', 'warning')
      return
    }
    if (selectedDate < tomorrowStr) {
      showToast('ต้องจองล่วงหน้าก่อนวันเล่นอย่างน้อย 1 วัน', 'error')
      return
    }
    if (lockedSlotIds.has(selectedGame.id)) {
      showToast('เกมนี้ถูกล็อกในวันเวลานี้แล้ว กรุณาเลือกวันหรือเวลาอื่น', 'error')
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
        room: selectedRoom || '',
        status: 'pending',
        isMock: false,
        mockNote: '',
        leaderId: lineUser.uid,
        leaderName: lineUser.name || 'ไม่ระบุชื่อ',
        leaderAvatar: lineUser.avatar || '',
        members: [{
          uid: lineUser.uid,
          name: lineUser.name || 'ไม่ระบุชื่อ',
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

  const C = 'var(--curtain-crimson, #e50914)'
  const INK = '#111827'

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(20px, 4vh, 40px) 16px',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(10px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: 'min(88dvh, 780px)',
          background: '#ffffff',
          borderRadius: '24px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'Sarabun, sans-serif',
        }}
      >
        {/* ── Modal Header (Pinned Top) ──────────────────────────────── */}
        <div
          style={{
            padding: '20px clamp(18px, 3vw, 28px) 16px',
            background: '#ffffff',
            borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',
                  color: C,
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: C }} />
                {step === 'game' ? 'ขั้นตอน 1 / 2 : เลือกสคริปต์' : 'ขั้นตอน 2 / 2 : เลือกรอบและเวลา'}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setStep('game')}
                  title="ขั้นตอน 1 : เลือกสคริปต์"
                  style={{
                    width: step === 'game' ? '22px' : '7px',
                    height: '7px',
                    borderRadius: '10px',
                    background: step === 'game' ? C : 'rgba(0, 0, 0, 0.15)',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    transition: 'all 0.24s ease',
                  }}
                />
                <button
                  type="button"
                  onClick={() => selectedGame && setStep('datetime')}
                  title="ขั้นตอน 2 : เลือกรอบและเวลา"
                  style={{
                    width: step === 'datetime' ? '22px' : '7px',
                    height: '7px',
                    borderRadius: '10px',
                    background: step === 'datetime' ? C : 'rgba(0, 0, 0, 0.15)',
                    border: 'none',
                    padding: 0,
                    cursor: selectedGame ? 'pointer' : 'not-allowed',
                    transition: 'all 0.24s ease',
                  }}
                />
              </div>
            </div>

            <h3
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 'clamp(22px, 2.5vw, 28px)',
                fontWeight: 900,
                color: INK,
                letterSpacing: '0.02em',
                lineHeight: 1.1,
                margin: 0,
                textTransform: 'uppercase',
              }}
            >
              {step === 'game' ? 'เลือกสคริปต์ที่ต้องการเล่น' : 'เลือกรอบและเวลาจัดแสดง'}
            </h3>

            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.5 }}>
              {step === 'game'
                ? 'คลิกเลือกสคริปต์คดีที่ต้องการเล่น หรือกรองตามจำนวนผู้เล่น'
                : 'ระบุวันที่และรอบเวลาที่ต้องการเปิดห้องสืบคดี'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="ปิดหน้าต่าง"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#f3f4f6',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* ── Modal Body (Scrollable Middle) ─────────────────────────── */}
        <div
          style={{
            padding: '18px clamp(18px, 3vw, 28px)',
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* STEP 1: Script Selection */}
          {step === 'game' && (
            <>
              {/* Search + Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ position: 'relative' }}>
                  <i className="fas fa-search" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '13px' }} />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อสคริปต์สืบคดี..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                      width: '100%',
                      paddingLeft: '42px',
                      paddingRight: search ? '38px' : '16px',
                      height: '42px',
                      background: '#f8fafc',
                      border: '1px solid rgba(0, 0, 0, 0.08)',
                      borderRadius: '12px',
                      color: INK,
                      fontSize: '13.5px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                    >
                      <i className="fas fa-times-circle" />
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', padding: '2px 0' }}>
                  {[
                    { id: 'all', label: 'ทั้งหมด' },
                    { id: '2-4', label: '2-4 คน' },
                    { id: '5-6', label: '5-6 คน' },
                    { id: '7-8', label: '7-8 คน' },
                    { id: '9+',  label: '9+ คน' },
                  ].map(p => {
                    const isActive = playerFilter === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlayerFilter(p.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '20px',
                          border: `1.5px solid ${isActive ? C : 'rgba(0, 0, 0, 0.08)'}`,
                          background: isActive ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)' : '#ffffff',
                          color: isActive ? C : '#4b5563',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                  <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    พบ {filteredGames.length} เรื่อง
                  </span>
                </div>
              </div>

              {/* Posters Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
                  gap: '12px',
                  padding: '4px 2px 12px',
                }}
              >
                {filteredGames.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', padding: '40px 16px', textAlign: 'center', color: '#9ca3af' }}>
                    <i className="fas fa-search" style={{ fontSize: '24px', opacity: 0.5, marginBottom: '8px', display: 'block' }} />
                    <span style={{ fontSize: '13px' }}>ไม่พบสคริปต์ที่ตรงกับเงื่อนไข</span>
                  </div>
                )}
                {filteredGames.map(g => {
                  const isSel = selectedGame?.id === g.id
                  const isLocked = lockedSlotIds.has(g.id)
                  const gImg = g.image ? convertImg(g.image, 320) : null
                  const pRange = getGamePlayerRange(g)
                  const pLabel = pRange.min === pRange.max ? `${pRange.min} คน` : `${pRange.min}-${pRange.max} คน`

                  return (
                    <div
                      key={g.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSel}
                      onClick={() => {
                        if (!isLocked) {
                          setSelectedGame(g)
                        }
                      }}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ' ') && !isLocked) {
                          e.preventDefault()
                          setSelectedGame(g)
                        }
                      }}
                      className={`nfx-script-card ${isSel ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                      style={{
                        position: 'relative',
                        borderRadius: '14px',
                        overflow: 'hidden',
                        background: '#ffffff',
                        border: isSel ? `2px solid ${C}` : '1.5px solid rgba(0, 0, 0, 0.08)',
                        boxShadow: isSel ? '0 8px 24px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.25)' : '0 2px 6px rgba(0, 0, 0, 0.03)',
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        opacity: isLocked ? 0.5 : 1,
                        transform: isSel ? 'translateY(-2px)' : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        outline: 'none',
                      }}
                    >
                      <div style={{ position: 'relative', height: '140px', background: '#1e293b', overflow: 'hidden' }}>
                        {gImg ? (
                          <img
                            src={gImg}
                            alt={g.title}
                            loading="lazy"
                            draggable={false}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                            <i className="fas fa-theater-masks text-xl" />
                          </div>
                        )}

                        {isSel && (
                          <div style={{ position: 'absolute', top: 6, right: 6, width: '24px', height: '24px', borderRadius: '50%', background: C, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', boxShadow: '0 2px 8px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.5)' }}>
                            <i className="fas fa-check" />
                          </div>
                        )}

                        <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', color: '#ffffff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px' }}>
                          <i className="fas fa-users" style={{ marginRight: '3px', fontSize: '8px' }} />
                          {pLabel}
                        </div>
                      </div>

                      <div style={{ padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, justifyContent: 'space-between' }}>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25 }}>
                          {g.title}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: '#6b7280', marginTop: '2px' }}>
                          <span>{g.difficulty || 'สืบสวน'}</span>
                          {g.deposit > 0 && (
                            <span style={{ fontWeight: 700, color: '#047857' }}>฿{g.deposit}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* STEP 2: Showtimes & Date Selection */}
          {step === 'datetime' && (
            <>
              {selectedGame && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    background: '#f8fafc',
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <div style={{ width: '44px', height: '56px', borderRadius: '8px', overflow: 'hidden', background: '#1e293b', flexShrink: 0 }}>
                    {selectedGame.image ? (
                      <img src={convertImg(selectedGame.image, 160)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                        <i className="fas fa-theater-masks text-sm" />
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      สคริปต์ที่เลือก
                    </span>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedGame.title}
                    </h4>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>
                      {selectedGame.characters?.length || selectedGame.players || 6} คน · มัดจำ ฿{selectedGame.deposit || 0}/คน
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('game')}
                    style={{ fontSize: '11.5px', fontWeight: 700, color: C, background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)', border: 'none', padding: '6px 12px', borderRadius: '20px', cursor: 'pointer' }}
                  >
                    เปลี่ยนสคริปต์
                  </button>
                </div>
              )}

              {/* Date Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280' }}>
                    วันที่ต้องการเล่น
                  </label>
                  {selectedDate && (
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: C }}>
                      {fmtDate(selectedDate)}
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  min={tomorrowStr}
                  value={selectedDate}
                  onChange={e => { setSelectedDate(e.target.value); setSelectedTime('') }}
                  style={{
                    height: '46px',
                    padding: '0 16px',
                    borderRadius: '12px',
                    background: '#f8fafc',
                    border: `1.5px solid ${selectedDate ? C : 'rgba(0, 0, 0, 0.08)'}`,
                    color: selectedDate ? INK : '#9ca3af',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    colorScheme: 'light',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <i className="fas fa-info-circle" style={{ color: C }} />
                  กำหนดให้จองล่วงหน้าอย่างน้อย 1 วัน
                </div>
              </div>

              {/* Time Slots */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280' }}>
                    รอบเวลาเล่น (13:00 - 19:00 น.)
                  </label>
                  {selectedRoom && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb' }}>
                      ห้องที่ระบุ: {selectedRoom}
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {TIME_SLOTS.map(t => {
                    const isActive = selectedTime === t
                    const count = slotCounts[t] || 0
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedTime(t)}
                        style={{
                          height: '54px',
                          borderRadius: '12px',
                          background: isActive ? C : '#f8fafc',
                          color: isActive ? '#ffffff' : INK,
                          border: `1.5px solid ${isActive ? C : count > 0 ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.25)' : 'rgba(0, 0, 0, 0.08)'}`,
                          boxShadow: isActive ? '0 6px 16px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.3)' : 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: '14px', fontWeight: 800 }}>{t}</span>
                        {count > 0 && (
                          <span style={{ fontSize: '9.5px', fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.85)' : C, marginTop: '2px' }}>
                            {count} จอง
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Modal Footer (Pinned Bottom Action Bar) ────────────────── */}
        <div
          style={{
            padding: '14px clamp(18px, 3vw, 28px)',
            background: '#ffffff',
            borderTop: '1px solid rgba(0, 0, 0, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          {step === 'game' ? (
            <>
              <div style={{ minWidth: 0, flex: 1 }}>
                {selectedGame ? (
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: C, letterSpacing: '0.08em' }}>
                      สคริปต์ที่เลือก:
                    </span>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedGame.title}
                    </h4>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>
                      มัดจำ ฿{selectedGame.deposit || 0}/คน
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '12.5px', color: '#9ca3af' }}>
                    กรุณาคลิกเลือกสคริปต์ที่ต้องการเล่น
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={!selectedGame}
                onClick={() => setStep('datetime')}
                className="nfx-btn-primary"
                style={{
                  padding: '10px 22px',
                  borderRadius: '12px',
                  background: selectedGame ? C : '#e5e7eb',
                  color: selectedGame ? '#ffffff' : '#9ca3af',
                  fontWeight: 800,
                  fontSize: '13.5px',
                  border: 'none',
                  cursor: selectedGame ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: selectedGame ? '0 4px 14px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.3)' : 'none',
                  flexShrink: 0,
                }}
              >
                <span>ถัดไป: เลือกรอบ</span>
                <i className="fas fa-arrow-right text-xs" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('game')}
                style={{
                  height: '46px',
                  padding: '0 16px',
                  borderRadius: '12px',
                  background: '#f3f4f6',
                  color: '#4b5563',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  flexShrink: 0,
                }}
              >
                <i className="fas fa-arrow-left text-xs" />
                <span>ย้อนกลับ</span>
              </button>

              <button
                type="button"
                disabled={!selectedDate || !finalTime || submitting}
                onClick={handleSubmit}
                className="nfx-btn-primary"
                style={{
                  flex: 1,
                  maxWidth: '240px',
                  height: '46px',
                  borderRadius: '12px',
                  background: selectedDate && finalTime && !submitting ? C : '#e5e7eb',
                  color: selectedDate && finalTime && !submitting ? '#ffffff' : '#9ca3af',
                  fontWeight: 800,
                  fontSize: '13.5px',
                  border: 'none',
                  cursor: selectedDate && finalTime && !submitting ? 'pointer' : 'not-allowed',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: selectedDate && finalTime && !submitting ? '0 4px 14px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.3)' : 'none',
                  flexShrink: 0,
                }}
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                    <span>กำลังส่งคำขอ...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane text-xs" />
                    <span>ยืนยันการจอง</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}


// ── Deposit Payment & Slip Modal (Minimalist Netflix White & Red) ──────────────
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
      showToast('บันทึก QR แล้ว')
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
      // 1. Direct EasySlip check on client (bypasses Firebase Storage & Cloud Functions)
      const res = await verifySlipDirect(slipFile, amount, { isDeposit: true })

      if (res.code === 'WRONG_RECEIVER') {
        showToast(res.msg || 'สลิปโอนไปยังบัญชีอื่น — กรุณาตรวจสอบและโอนใหม่', 'error')
        return
      }

      const verified = !!res.success
      const slipUrl = res.slipThumbnail || ''
      const verifyData = res.verifyData ? {
        slipTransRef: res.verifyData.transRef || '',
        slipBank: res.verifyData.bank || '',
      } : {}

      // 2. Update booking member in Firestore
      const bRef = doc(db, 'bookings', booking.id)
      const snap = await getDoc(bRef)
      if (!snap.exists()) throw new Error('ไม่พบการจอง')
      const data = snap.data()
      const nowIso = new Date().toISOString()
      const updatedMembers = data.members.map(m =>
        m.uid === lineUser.uid
          ? {
              ...m,
              slipUrl,
              slipSubmittedAt: nowIso,
              ...(verified
                ? { paidDeposit: true, paidAt: nowIso, slipStatus: 'verified', ...verifyData }
                : { slipStatus: 'pending_verification' })
            }
          : m
      )
      const payload = { members: updatedMembers, updatedAt: serverTimestamp() }
      if (verified) {
        payload.depositDeadline = calculateDepositDeadline({
          ...data,
          members: updatedMembers,
        })
        const paidCount = updatedMembers.filter(m => m.paidDeposit).length
        const maxMembers = data.maxMembers || 6
        const isFullAndPaid = paidCount >= maxMembers
        if (isFullAndPaid && data.status === 'confirmed') payload.status = 'locked'
      }
      await updateDoc(bRef, payload)

      if (verified) showToast('EasySlip ยืนยันสำเร็จ')
      else if (res.code === 'QR_NOT_FOUND') showToast('บันทึกสลิปแล้ว — รอแอดมินยืนยัน (อ่าน QR ไม่สำเร็จ)')
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

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(12px, 3vh, 24px) 16px',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: 'min(90dvh, 740px)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 20,
          overflow: 'hidden',
          background: '#ffffff',
          color: '#111827',
          boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          fontFamily: "'Sarabun', sans-serif",
          boxSizing: 'border-box',
        }}
      >
        {/* Header (Minimalist White & Red Netflix Style) */}
        <div
          style={{
            padding: '20px 22px 14px',
            borderBottom: '1px solid #F3F4F6',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {/* Top Step Bar + Close Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  style={{
                    height: 3,
                    width: i === stepIndex ? 24 : 14,
                    borderRadius: 2,
                    background: i <= stepIndex ? '#E50914' : '#E5E7EB',
                    transition: 'all 0.25s',
                  }}
                />
              ))}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: '#E50914',
                  textTransform: 'uppercase',
                  marginLeft: 4,
                }}
              >
                ขั้นตอน {stepIndex + 1}/3
              </span>
            </div>

            {step !== 'done' && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: '#F3F4F6',
                  color: '#6B7280',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#E5E7EB'; e.currentTarget.style.color = '#111827' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F3F4F6'; e.currentTarget.style.color = '#6B7280' }}
                title="ปิด"
              >
                <i className="fas fa-times" style={{ fontSize: 12 }} />
              </button>
            )}
          </div>

          <div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
              {step === 'qr' ? 'ชำระเงินมัดจำ' : step === 'upload' ? 'ตรวจสอบสลิป' : 'ส่งสลิปสำเร็จ'}
            </h3>
            <p style={{ fontSize: 12, color: '#6B7280', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {step === 'qr' ? `สแกน QR แล้วโอน · ${booking.gameName || 'การจอง'}` : step === 'upload' ? 'ตรวจความถูกต้องก่อนส่งยืนยัน' : 'ระบบได้รับสลิปเรียบร้อยแล้ว'}
            </p>
          </div>
        </div>

        {/* ── STEP 1: QR Payment ── */}
        {step === 'qr' && (
          <div
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: 1,
              padding: '16px 22px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxSizing: 'border-box',
            }}
          >
            {promptPayPhone ? (
              <>
                {/* Summary Strip (Minimalist White & Red) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: '#FAFAFA',
                    border: '1px solid #E5E7EB',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {booking.gameName || 'การจอง'}
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                      {booking.date ? fmtDate(booking.date) : ''} {booking.time ? `· ${booking.time} น.` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>ยอดมัดจำ</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#E50914', lineHeight: 1.1 }}>
                      ฿{amount.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* QR Showcase Card */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '16px 14px',
                    borderRadius: 16,
                    background: '#ffffff',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.03)',
                    boxSizing: 'border-box',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: '#ffffff',
                      border: '1px solid #E5E7EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <QRCodeCanvas
                      id="dp-deposit-qr-canvas"
                      value={qrPayload}
                      size={170}
                      bgColor="#ffffff"
                      fgColor="#111827"
                      level="M"
                      includeMargin={false}
                    />
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        display: 'inline-block',
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: '#E50914',
                        background: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        padding: '1px 8px',
                        borderRadius: 12,
                        marginBottom: 4,
                      }}
                    >
                      บัญชีโอนมัดจำ (พร้อมเพย์)
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#111827',
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: '0.04em',
                      }}
                    >
                      {promptPayPhone}
                    </div>
                    {(accountName || bankName) && (
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                        {accountName} {bankName ? `(${bankName})` : ''}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={saveQR}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 32,
                      padding: '0 14px',
                      borderRadius: 20,
                      background: '#F3F4F6',
                      color: '#111827',
                      border: '1px solid #E5E7EB',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
                    onMouseLeave={e => e.currentTarget.style.background = '#F3F4F6'}
                  >
                    <i className="fas fa-download" style={{ fontSize: 10 }} />
                    <span>บันทึกรูป QR</span>
                  </button>
                </div>

                {/* Minimal 3 Steps Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: '#FAFAFA',
                    border: '1px solid #F3F4F6',
                    fontSize: 11,
                    color: '#6B7280',
                    gap: 6,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#FEF2F2', color: '#E50914', fontSize: 9, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
                    สแกน QR
                  </span>
                  <span style={{ color: '#D1D5DB' }}>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#FEF2F2', color: '#E50914', fontSize: 9, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>2</span>
                    โอน ฿{amount.toLocaleString()}
                  </span>
                  <span style={{ color: '#D1D5DB' }}>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#FEF2F2', color: '#E50914', fontSize: 9, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>3</span>
                    แนบสลิป
                  </span>
                </div>

                {/* Primary CTA Button (Netflix Red) */}
                <label
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 12,
                    background: '#E50914',
                    color: '#ffffff',
                    fontSize: 14,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(229, 9, 20, 0.35)',
                    transition: 'all 0.15s',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#B80710'}
                  onMouseLeave={e => e.currentTarget.style.background = '#E50914'}
                >
                  <i className="fas fa-receipt" style={{ fontSize: 15 }} />
                  <span>โอนแล้ว — แนบสลิปที่นี่</span>
                  <input type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                </label>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#6B7280' }}>
                <i className="fas fa-exclamation-circle" style={{ fontSize: 24, color: '#E50914', marginBottom: 8, display: 'block' }} />
                <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>ยังไม่ได้ตั้งค่าบัญชีรับเงิน</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>กรุณาติดต่อแอดมินเพื่อขอเลขที่บัญชี</div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Upload / Preview ── */}
        {step === 'upload' && (
          <div
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: 1,
              padding: '16px 22px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxSizing: 'border-box',
            }}
          >
            {/* Slip Preview Frame */}
            <div
              style={{
                borderRadius: 14,
                overflow: 'hidden',
                background: '#0F1012',
                border: '1px solid #E5E7EB',
                maxHeight: 260,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {slipPreview ? (
                <img
                  src={slipPreview}
                  alt="สลิปโอนเงิน"
                  style={{ maxHeight: 260, width: 'auto', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ padding: 40, color: '#9CA3AF', fontSize: 13 }}>
                  <i className="fas fa-image" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
                  ไม่พบรูปภาพสลิป
                </div>
              )}
            </div>

            {/* Change Slip Link */}
            <div style={{ textAlign: 'center' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#E50914',
                  cursor: 'pointer',
                }}
              >
                <i className="fas fa-sync-alt" style={{ fontSize: 10 }} />
                <span>เลือกรูปสลิปใหม่</span>
                <input type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
              </label>
            </div>

            {/* Amount Check Note */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 10,
                background: '#FAFAFA',
                border: '1px solid #E5E7EB',
                fontSize: 12,
              }}
            >
              <span style={{ color: '#6B7280', fontWeight: 600 }}>ยอดมัดจำที่ต้องตรวจสอบ</span>
              <strong style={{ color: '#E50914', fontSize: 15, fontWeight: 900 }}>
                ฿{amount.toLocaleString()}
              </strong>
            </div>

            {/* Action Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setStep('qr')}
                disabled={uploading}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: uploading ? 'wait' : 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
                title="ย้อนกลับ"
              >
                <i className="fas fa-arrow-left" style={{ fontSize: 13 }} />
              </button>

              <button
                type="button"
                disabled={uploading}
                onClick={handleSubmit}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  background: uploading ? '#9CA3AF' : '#E50914',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  border: 'none',
                  cursor: uploading ? 'wait' : 'pointer',
                  boxShadow: uploading ? 'none' : '0 4px 14px rgba(229, 9, 20, 0.35)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!uploading) e.currentTarget.style.background = '#B80710' }}
                onMouseLeave={e => { if (!uploading) e.currentTarget.style.background = '#E50914' }}
              >
                {uploading ? (
                  <span>กำลังส่งสลิป...</span>
                ) : (
                  <>
                    <i className="fas fa-paper-plane" style={{ fontSize: 12 }} />
                    <span>ยืนยันส่งสลิป</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Done Confirmation ── */}
        {step === 'done' && (
          <div
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: 1,
              padding: '24px 22px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 16,
              boxSizing: 'border-box',
            }}
          >
            {/* Success Icon */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#FEF2F2',
                border: '2px solid #FCA5A5',
                color: '#E50914',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                boxShadow: '0 8px 20px rgba(229, 9, 20, 0.2)',
              }}
            >
              <i className="fas fa-check" />
            </div>

            <div>
              <h4 style={{ fontSize: 20, fontWeight: 900, color: '#111827', margin: '0 0 6px' }}>
                ส่งสลิปมัดจำสำเร็จ
              </h4>
              <p style={{ fontSize: 12.5, color: '#6B7280', margin: 0, lineHeight: 1.55, maxWidth: 280 }}>
                ระบบ EasySlip และทีมงานจะตรวจสอบและยืนยันสถานะการจองให้คุณโดยเร็วที่สุด
              </p>
            </div>

            {/* Recap Card */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                textAlign: 'left',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 12,
                background: '#FAFAFA',
                border: '1px solid #E5E7EB',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: '#FEF2F2',
                  color: '#E50914',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 14,
                }}
              >
                <i className="fas fa-calendar-check" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {booking.gameName || 'การจอง'}
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                  {booking.date ? fmtDate(booking.date) : ''} {booking.time ? `· ${booking.time} น.` : ''} · ฿{amount.toLocaleString()}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%',
                height: 46,
                borderRadius: 12,
                background: '#111827',
                color: '#ffffff',
                fontSize: 13.5,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginTop: 6,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#000000'}
              onMouseLeave={e => e.currentTarget.style.background = '#111827'}
            >
              เสร็จสิ้น / ปิดหน้าต่าง
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

  const maxMembers = booking.maxMembers || 6
  const total = booking.members?.length || 0
  const paidCount = booking.members?.filter(m => m.paidDeposit).length || 0
  const isMember = booking.members?.some(m => m.uid === lineUser?.uid || m.id === lineUser?.uid)
  const isLeader = booking.leaderId === lineUser?.uid
  const isAdmin = lineUser?.role === 'admin' || lineUser?.isAdmin
  const isLocked = isRoomLocked(booking)
  const isLockedRestricted = isLocked && !canViewBookingDetail(booking, lineUser)
  const myMember = booking.members?.find(m => m.uid === lineUser?.uid || m.id === lineUser?.uid)
  const myRequest = booking.joinRequests?.some(r => r.uid === lineUser?.uid)
  const imgSrc = booking.gameImage ? convertImg(booking.gameImage, 800) : null
  const countdown = booking.status === 'confirmed' && booking.depositDeadline ? formatCountdown(booking.depositDeadline) : null
  const isUrgent = booking.depositDeadline && new Date(booking.depositDeadline) - new Date() < 24 * 3600000
  const remainingToLock = Math.max(0, maxMembers - paidCount)
  const paidPct = Math.min(100, Math.round((paidCount / maxMembers) * 100))
  const rc = ROOM_COLORS[booking.room] || '#64748b'

  const [memberProfiles, setMemberProfiles] = useState({})

  useEffect(() => {
    if (!booking?.members?.length && !booking?.joinRequests?.length && !booking?.leaderId) return
    const uids = [
      ...(booking.members || []).map(m => m.uid || m.id),
      ...(booking.joinRequests || []).map(r => r.uid),
      booking.leaderId,
    ].filter(Boolean)
    const uniqueUids = Array.from(new Set(uids))
    if (uniqueUids.length === 0) return

    let cancelled = false
    Promise.all(uniqueUids.map(uid => getDoc(doc(db, 'members', uid)).catch(() => null)))
      .then(snaps => {
        if (cancelled) return
        const map = {}
        snaps.forEach(snap => {
          if (snap && snap.exists()) {
            map[snap.id] = snap.data()
          }
        })
        setMemberProfiles(map)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [booking?.id, booking?.members, booking?.joinRequests, booking?.leaderId])

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

  // ── Restricted Locked View ────────────────────────────────────────────────
  if (isLockedRestricted) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          boxSizing: 'border-box',
        }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 400,
            borderRadius: 20,
            background: '#ffffff',
            border: '1px solid #E5E7EB',
            padding: '32px 24px',
            textAlign: 'center',
            boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.35)',
            fontFamily: "'Sarabun', sans-serif",
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              background: '#FEF2F2',
              color: '#E50914',
              border: '1px solid #FCA5A5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              margin: '0 auto 16px',
            }}
          >
            <i className="fas fa-lock" />
          </div>

          <span
            style={{
              display: 'inline-block',
              fontSize: 10.5,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#E50914',
              background: '#FEF2F2',
              padding: '3px 12px',
              borderRadius: 20,
              border: '1px solid #FECACA',
              marginBottom: 12,
            }}
          >
            LOCKED ROOM · ล็อกห้องแล้ว
          </span>

          <h3 style={{ fontSize: 18, fontWeight: 900, color: '#111827', margin: '0 0 8px' }}>
            ห้องนี้ถูกล็อกแล้ว
          </h3>

          <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.6, margin: '0 0 24px' }}>
            ปาร์ตี้นี้ได้รับการยืนยันและล็อกห้องเรียบร้อยแล้ว เฉพาะ<strong>สมาชิกในตี้</strong> หรือ <strong>แอดมิน</strong> เท่านั้นที่สามารถเข้าดูรายละเอียดได้
          </p>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: 12,
              background: '#111827',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#000000'}
            onMouseLeave={e => e.currentTarget.style.background = '#111827'}
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
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(12px, 3.5vh, 28px) 16px',
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          boxSizing: 'border-box',
        }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: 'min(90dvh, 820px)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 22,
            overflow: 'hidden',
            background: '#ffffff',
            boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.08)',
            fontFamily: "'Sarabun', sans-serif",
            boxSizing: 'border-box',
          }}
        >
          {/* ── 1. CINEMATIC NETFLIX BILLBOARD HEADER ── */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              minHeight: 220,
              background: '#141414',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {/* Ambient Backdrop Poster */}
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={booking.gameName}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center 20%',
                  filter: 'brightness(0.68) saturate(1.15)',
                }}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(135deg, #1f1f1f 0%, #0d0d0d 100%)',
                }}
              />
            )}

            {/* Room Accent Glow */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(ellipse 70% 60% at 85% 20%, ${rc}40 0%, transparent 70%)`,
              }}
            />

            {/* Netflix Dark Vignette Overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 35%, rgba(15,15,15,0.85) 85%, #141414 100%)',
              }}
            />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 14,
                right: 18,
                zIndex: 10,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title="ปิดหน้าต่าง"
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(229, 9, 20, 0.85)'
                e.currentTarget.style.borderColor = '#E50914'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.65)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <i className="fas fa-times" style={{ fontSize: 13 }} />
            </button>

            {/* Billboard Content: Title & Metadata Chips */}
            <div
              style={{
                position: 'absolute',
                left: 20,
                right: 20,
                bottom: 16,
                zIndex: 10,
              }}
            >


              <h2
                style={{
                  fontSize: 'clamp(20px, 4.2vw, 26px)',
                  fontWeight: 900,
                  color: '#ffffff',
                  lineHeight: 1.2,
                  margin: '0 0 8px',
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                  wordBreak: 'break-word',
                }}
              >
                {booking.gameName || 'การจองห้อง'}
              </h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.95)',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '3px 9px',
                    borderRadius: 6,
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                  }}
                >
                  <i className="fas fa-calendar-alt" style={{ color: '#E50914', fontSize: 10 }} />
                  {fmtDate(booking.date)}
                </span>

                {booking.time && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: 'rgba(255, 255, 255, 0.95)',
                      background: 'rgba(0, 0, 0, 0.5)',
                      padding: '3px 9px',
                      borderRadius: 6,
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                    }}
                  >
                    <i className="fas fa-clock" style={{ color: '#FBBF24', fontSize: 10 }} />
                    {booking.time} น.
                  </span>
                )}

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#34D399',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '3px 9px',
                    borderRadius: 6,
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                  }}
                >
                  <i className="fas fa-coins" style={{ fontSize: 10 }} />
                  มัดจำ ฿{booking.depositAmount || 0} / คน
                </span>
              </div>
            </div>
          </div>

          {/* ── 2. SCROLLABLE MINIMALIST WHITE BODY ── */}
          <div
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: 1,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              background: '#ffffff',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            {/* Status Case: Locked (100% Complete) */}
            {isLocked && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: '#059669',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 14,
                  }}
                >
                  <i className="fas fa-lock" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: '#065F46' }}>
                    ล็อกห้องสำเร็จแล้ว (สิทธิ์สมบูรณ์ 100%)
                  </div>
                  <div style={{ fontSize: 11.5, color: '#047857', marginTop: 2, lineHeight: 1.5 }}>
                    ชำระมัดจำครบ {paidCount}/{maxMembers} คนเรียบร้อยแล้ว ล็อกห้อง <strong>{booking.room || 'ที่เลือก'}</strong> สำหรับปาร์ตี้ของคุณ
                  </div>
                </div>
              </div>
            )}

            {/* Status Case: Confirmed (Active Payment Window) */}
            {!isLocked && booking.status === 'confirmed' && (
              <div
                style={{
                  background: '#ffffff',
                  border: isUrgent ? '1px solid #FCA5A5' : '1px solid #E5E7EB',
                  borderRadius: 14,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: isUrgent ? '#E50914' : '#F59E0B',
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 800, color: isUrgent ? '#E50914' : '#111827' }}>
                      {countdown ? `เหลือเวลาชำระอีก ${countdown}` : 'เปิดรับการชำระมัดจำ'}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: isUrgent ? '#FEF2F2' : '#F3F4F6',
                      color: isUrgent ? '#E50914' : '#4B5563',
                      border: isUrgent ? '1px solid #FECACA' : '1px solid #E5E7EB',
                    }}
                  >
                    {isUrgent ? 'ใกล้หมดเวลา' : `ยังขาดอีก ${remainingToLock} คน`}
                  </span>
                </div>

                {/* Netflix Red Scrubber Progress Bar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#4B5563', fontWeight: 600 }}>
                      ความคืบหน้าการล็อกห้อง: <strong style={{ color: '#E50914', fontWeight: 800 }}>{paidCount}</strong> / {maxMembers} คน
                    </span>
                    <span style={{ color: '#E50914', fontWeight: 800 }}>{paidPct}%</span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: 6,
                      borderRadius: 999,
                      background: '#F1F3F5',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${paidPct}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: '#E50914',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', flexWrap: 'wrap', gap: 4 }}>
                  <span>มัดจำ ฿{booking.depositAmount || 0} / คน</span>
                  <span>ชำระครบ {maxMembers} คน ล็อกห้องอัตโนมัติทันที</span>
                </div>
              </div>
            )}

            {/* Status Case: Collapsed */}
            {booking.status === 'collapsed' && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  color: '#991B1B',
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                  <i className="fas fa-exclamation-triangle" style={{ color: '#E50914', flexShrink: 0 }} />
                  <span>หมดเวลาชำระมัดจำ — ปาร์ตี้ล่มเนื่องจากชำระไม่ครบ</span>
                </div>
                {isLeader && (
                  <button
                    type="button"
                    onClick={handleCloseBooking}
                    disabled={closing}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: '#E50914',
                      color: '#ffffff',
                      fontSize: 11.5,
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {closing ? 'กำลังปิด...' : 'ปิดตี้'}
                  </button>
                )}
              </div>
            )}

            {/* Status Case: Pending Admin Confirmation */}
            {booking.status === 'pending' && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                <i className="fas fa-hourglass-half" style={{ color: '#D97706', fontSize: 16, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: '#92400E' }}>
                  <strong style={{ display: 'block', fontSize: 13, color: '#78350F' }}>รอแอดมินยืนยันรอบการจอง</strong>
                  เมื่อแอดมินยืนยันตี้แล้ว ระบบจะเริ่มเปิดรับการชำระมัดจำทันที
                </div>
              </div>
            )}

            {/* Join Requests (Leader View) */}
            {isLeader && (booking.joinRequests?.length > 0) && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-bell" style={{ color: '#E50914', fontSize: 11 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#E50914', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    คำขอเข้าร่วม ({booking.joinRequests.length})
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {booking.joinRequests.map(req => {
                    const reqProf = memberProfiles[req.uid]
                    const reqAvatar = req.avatar || reqProf?.pictureUrl || reqProf?.avatar || ''
                    const reqName = req.name || reqProf?.nickname || reqProf?.firstname || reqProf?.name || 'ผู้ขอเข้าร่วม'
                    return (
                      <div
                        key={req.uid}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '8px 12px',
                          borderRadius: 10,
                          background: '#ffffff',
                          border: '1px solid #E5E7EB',
                          boxSizing: 'border-box',
                          width: '100%',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <MemberAvatar src={reqAvatar} name={reqName} size={32} />
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {reqName}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleApproveRequest(req)}
                            disabled={approvingUid === req.uid}
                            style={{
                              padding: '5px 12px',
                              borderRadius: 6,
                              background: '#E50914',
                              color: '#ffffff',
                              fontSize: 11.5,
                              fontWeight: 700,
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            {approvingUid === req.uid ? '...' : 'รับ'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectRequest(req)}
                            disabled={rejectingUid === req.uid}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              background: '#F3F4F6',
                              color: '#4B5563',
                              fontSize: 11.5,
                              fontWeight: 600,
                              border: '1px solid #E5E7EB',
                              cursor: 'pointer',
                            }}
                          >
                            {rejectingUid === req.uid ? '...' : 'ปฏิเสธ'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Members / Cast Section (Single-Column, Full-Width, Never Clips) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>สมาชิกในตี้</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 12, background: '#F3F4F6', color: '#4B5563' }}>
                    {total} / {maxMembers} คน
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#6B7280' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} /> ชำระแล้ว
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D1D5DB' }} /> ยังไม่ชำระ
                  </span>
                </div>
              </div>

              {/* Active Member Cards */}
              {(booking.members || []).map((m, idx) => {
                const mProf = memberProfiles[m.uid || m.id]
                const mAvatar = m.avatar || mProf?.pictureUrl || mProf?.avatar || ''
                const mName = m.name || mProf?.nickname || mProf?.firstname || mProf?.name || 'สมาชิก'
                const isMemLeader = m.uid === booking.leaderId

                return (
                  <div
                    key={m.uid || m.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: '#ffffff',
                      border: '1px solid #E5E7EB',
                      boxSizing: 'border-box',
                      width: '100%',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, cursor: 'pointer' }}
                      onClick={() => openProfile(m.uid || m.id)}
                      title="ดูโปรไฟล์"
                    >
                      <MemberAvatar
                        src={mAvatar}
                        name={mName}
                        size={38}
                        imgStyle={
                          m.paidDeposit
                            ? { outline: '2px solid #10B981', outlineOffset: 1.5 }
                            : m.slipStatus === 'pending_verification'
                              ? { outline: '2px solid #F59E0B', outlineOffset: 1.5 }
                              : { outline: '1px solid #E5E7EB', outlineOffset: 1.5 }
                        }
                        badge={
                          isMemLeader ? (
                            <div
                              style={{
                                position: 'absolute',
                                top: -3,
                                right: -3,
                                width: 15,
                                height: 15,
                                borderRadius: '50%',
                                background: '#E50914',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1.5px solid #ffffff',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              }}
                              title="หัวหน้าปาร์ตี้"
                            >
                              <i className="fas fa-crown" style={{ fontSize: 6 }} />
                            </div>
                          ) : null
                        }
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {mName}
                          </span>
                          {isMemLeader && (
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 800,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: '#FEF2F2',
                                color: '#E50914',
                                border: '1px solid #FCA5A5',
                                letterSpacing: '0.02em',
                                flexShrink: 0,
                              }}
                            >
                              หัวหน้า
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                          {m.paidDeposit
                            ? 'ยืนยันมัดจำแล้ว'
                            : m.slipStatus === 'pending_verification'
                              ? 'รอตรวจสอบสลิป'
                              : 'รอชำระมัดจำ'}
                        </div>
                      </div>
                    </div>

                    {/* Status Pill on Right */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {m.slipUrl && (
                        <a
                          href={m.slipUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            overflow: 'hidden',
                            border: '1px solid #E5E7EB',
                            display: 'block',
                          }}
                          title="ดูสลิป"
                        >
                          <img src={m.slipUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                        </a>
                      )}
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: 20,
                          whiteSpace: 'nowrap',
                          background: m.paidDeposit
                            ? '#ECFDF5'
                            : m.slipStatus === 'pending_verification'
                              ? '#FFFBEB'
                              : '#F3F4F6',
                          color: m.paidDeposit
                            ? '#059669'
                            : m.slipStatus === 'pending_verification'
                              ? '#D97706'
                              : '#6B7280',
                          border: m.paidDeposit
                            ? '1px solid #A7F3D0'
                            : m.slipStatus === 'pending_verification'
                              ? '1px solid #FDE68A'
                              : '1px solid #E5E7EB',
                        }}
                      >
                        {m.paidDeposit ? (
                          <>
                            <i className="fas fa-check" style={{ marginRight: 4, fontSize: 9 }} />
                            จ่ายแล้ว
                          </>
                        ) : m.slipStatus === 'pending_verification' ? (
                          <>
                            <i className="fas fa-clock" style={{ marginRight: 4, fontSize: 9 }} />
                            รอตรวจ
                          </>
                        ) : (
                          'ยังไม่จ่าย'
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* Empty Seats */}
              {Array.from({ length: Math.max(0, maxMembers - total) }).map((_, i) => (
                <div
                  key={`empty-seat-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 14px',
                    borderRadius: 12,
                    background: '#FAFAFA',
                    border: '1px dashed #D1D5DB',
                    boxSizing: 'border-box',
                    width: '100%',
                    color: '#9CA3AF',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#ffffff',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        color: '#9CA3AF',
                      }}
                    >
                      <i className="fas fa-plus" />
                    </div>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
                        ที่นั่งว่าง #{total + i + 1}
                      </span>
                      <span style={{ fontSize: 10.5, color: '#9CA3AF', marginLeft: 6 }}>
                        เปิดรับผู้เล่น
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: '#ffffff',
                      color: '#9CA3AF',
                      border: '1px solid #E5E7EB',
                    }}
                  >
                    ว่าง
                  </span>
                </div>
              ))}
            </div>

            {/* ── Minimalist Booking Terms & Rules ── */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #E5E7EB',
                borderRadius: 14,
                padding: '14px 16px',
                boxSizing: 'border-box',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <i className="fas fa-shield-alt" style={{ color: '#E50914', fontSize: 12 }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  เงื่อนไขการจองและล็อกห้อง
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#4B5563', lineHeight: 1.5 }}>
                  <i className="fas fa-calendar-plus" style={{ color: '#E50914', fontSize: 11, marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#111827' }}>ขยายเวลา +3 วัน/คน:</strong> ทุกครั้งที่สมาชิกชำระมัดจำ ระบบจะขยายเวลาให้ตี้อัตโนมัติ
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#4B5563', lineHeight: 1.5 }}>
                  <i className="fas fa-lock" style={{ color: '#E50914', fontSize: 11, marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#111827' }}>ล็อกห้องอัตโนมัติ:</strong> เมื่อชำระมัดจำครบ {maxMembers} คน ระบบจะล็อกห้องถาวรทันที
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#4B5563', lineHeight: 1.5 }}>
                  <i className="fas fa-clock" style={{ color: '#E50914', fontSize: 11, marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#111827' }}>กำหนดปิดรับ:</strong> ปิดรับชำระมัดจำไม่เกิน 24 ชั่วโมงก่อนวันเริ่มเล่นจริง
                  </div>
                </div>
              </div>

              {booking.adminNote && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid #F3F4F6',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: 11.5,
                    color: '#4B5563',
                  }}
                >
                  <i className="fas fa-comment-alt" style={{ color: '#E50914', fontSize: 11, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#E50914', fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>
                      โน้ตจากแอดมิน
                    </strong>
                    <span>{booking.adminNote}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 3. PINNED NETFLIX ACTION FOOTER ── */}
          <div
            style={{
              background: '#ffffff',
              borderTop: '1px solid #E5E7EB',
              padding: '14px 20px max(14px, env(safe-area-inset-bottom, 14px))',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.04)',
              flexShrink: 0,
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            {/* Join CTA */}
            {!isMember && !myRequest && lineUser && ['confirmed', 'pending'].includes(booking.status) && total < (booking.maxMembers || 99) && (
              <button
                type="button"
                onClick={handleRequestJoin}
                disabled={joining}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 12,
                  background: '#E50914',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  border: 'none',
                  cursor: joining ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px rgba(229, 9, 20, 0.35)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!joining) e.currentTarget.style.background = '#B80710' }}
                onMouseLeave={e => { if (!joining) e.currentTarget.style.background = '#E50914' }}
              >
                {joining ? (
                  <span>กำลังส่งคำขอ...</span>
                ) : (
                  <>
                    <i className="fas fa-user-plus" />
                    <span>ขอเข้าร่วมปาร์ตี้</span>
                  </>
                )}
              </button>
            )}

            {/* Pending Request Badge */}
            {!isMember && myRequest && lineUser && (
              <div
                style={{
                  padding: '11px 16px',
                  borderRadius: 12,
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#DC2626',
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <i className="fas fa-clock" />
                <span>ส่งคำขอเข้าร่วมแล้ว — รอหัวปาร์ตี้อนุมัติ</span>
              </div>
            )}

            {/* Pay Deposit CTA */}
            {isMember && booking.status === 'confirmed' && !myMember?.paidDeposit && myMember?.slipStatus !== 'pending_verification' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowDepositPay(true)}
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 12,
                    background: '#E50914',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(229, 9, 20, 0.35)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#B80710'}
                  onMouseLeave={e => e.currentTarget.style.background = '#E50914'}
                >
                  <i className="fas fa-qrcode" style={{ fontSize: 16 }} />
                  <span>จ่ายมัดจำ ฿{booking.depositAmount || 0} / แนบสลิป</span>
                </button>
                <span style={{ fontSize: 10.5, textAlign: 'center', color: '#6B7280' }}>
                  ชำระแล้วจะช่วยขยายเวลาให้ตี้ +3 วัน และเมื่อครบ {maxMembers} คน ระบบจะล็อกห้องทันที
                </span>
              </div>
            )}

            {/* Paid Status */}
            {isMember && myMember?.paidDeposit && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  color: '#065F46',
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <i className="fas fa-check-circle" style={{ color: '#10B981' }} />
                <span>
                  {isLocked
                    ? 'คุณชำระมัดจำแล้ว — ล็อกห้องเรียบร้อย 100%'
                    : `คุณชำระมัดจำแล้ว (รอเพื่อนในตี้อีก ${remainingToLock} คน)`}
                </span>
              </div>
            )}

            {/* Slip Submitted Pending */}
            {isMember && myMember?.slipStatus === 'pending_verification' && !myMember?.paidDeposit && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  color: '#92400e',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <i className="fas fa-hourglass-half" style={{ color: '#D97706', fontSize: 14 }} />
                <div>
                  <div>ส่งสลิปแล้ว — รอแอดมินตรวจสอบ</div>
                  <div style={{ fontSize: 10.5, fontWeight: 500, color: '#B45309' }}>แอดมินจะแจ้งผลทาง LINE</div>
                </div>
              </div>
            )}

            {/* Secondary Action Row: Share, Leave, Close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={handleShare}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 40,
                  borderRadius: 10,
                  background: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  color: copied ? '#E50914' : '#111827',
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
                onMouseLeave={e => e.currentTarget.style.background = '#F3F4F6'}
              >
                <i className={`fas fa-${copied ? 'check' : 'share-alt'}`} style={{ color: copied ? '#10B981' : 'inherit' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {copied ? 'คัดลอกลิงก์แล้ว' : `แชร์ชวนเพื่อน (${total}/${maxMembers})`}
                </span>
              </button>

              {isMember && !isLeader && (
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={leaving}
                  style={{
                    height: 40,
                    padding: '0 14px',
                    borderRadius: 10,
                    background: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    color: '#DC2626',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: leaving ? 'wait' : 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
                  onMouseLeave={e => e.currentTarget.style.background = '#FEF2F2'}
                >
                  <i className="fas fa-sign-out-alt" />
                  <span>ออกจากตี้</span>
                </button>
              )}

              {isLeader && ['collapsed', 'pending'].includes(booking.status) && (
                <button
                  type="button"
                  onClick={handleCloseBooking}
                  disabled={closing}
                  style={{
                    height: 40,
                    padding: '0 14px',
                    borderRadius: 10,
                    background: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    color: '#DC2626',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: closing ? 'wait' : 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
                  onMouseLeave={e => e.currentTarget.style.background = '#FEF2F2'}
                >
                  <i className="fas fa-times-circle" />
                  <span>{closing ? 'กำลังปิด...' : 'ปิดตี้'}</span>
                </button>
              )}
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
export default function BookingPage({
  lineUser,
  allGames = [],
  showToast,
  onLogin = () => {},
  initialGameId = '',
}) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createBookingDate, setCreateBookingDate] = useState('')
  const [createBookingGameId, setCreateBookingGameId] = useState(initialGameId || '')
  const [createBookingTime, setCreateBookingTime] = useState('')
  const [createBookingRoom, setCreateBookingRoom] = useState('')
  const [detailBooking, setDetailBooking] = useState(null)
  const [calendarDate, setCalendarDate] = useState('')
  const [myBookingsTab, setMyBookingsTab] = useState('active')

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setBookings(all)
      setLoading(false)
      all.forEach(async b => {
        if (b.status === 'confirmed' && b.depositDeadline && new Date() > new Date(b.depositDeadline)) {
          try {
            await updateDoc(doc(db, 'bookings', b.id), {
              status: 'collapsed',
              updatedAt: serverTimestamp()
            })
          } catch {}
        } else if (b.status === 'confirmed') {
          const max = b.maxMembers || 6
          const paidCount = b.members?.filter(m => m.paidDeposit).length || 0
          if (max > 0 && paidCount >= max) {
            try {
              await updateDoc(doc(db, 'bookings', b.id), {
                status: 'locked',
                updatedAt: serverTimestamp()
              })
            } catch {}
          }
        }
      })
    }, () => setLoading(false))
    return unsub
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gid = params.get('gameId') || initialGameId
    if (gid) {
      setCreateBookingGameId(gid)
      setShowCreate(true)
    }
  }, [initialGameId])

  useEffect(() => {
    if (bookings.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const bid = params.get('booking')
    if (bid) {
      const found = bookings.find(b => b.id === bid)
      if (found) {
        if (!canViewBookingDetail(found, lineUser)) {
          showToast('ห้องนี้ถูกล็อกแล้ว เฉพาะสมาชิกในตี้หรือแอดมินเท่านั้นที่สามารถดูรายละเอียดได้', 'warning')
          window.history.replaceState({}, '', '/booking')
          return
        }
        setDetailBooking(found)
      }
    }
  }, [bookings, lineUser, showToast])

  useEffect(() => {
    if (detailBooking) {
      const fresh = bookings.find(b => b.id === detailBooking.id)
      if (fresh) setDetailBooking(fresh)
    }
  }, [bookings])

  const openDetail = useCallback((b) => {
    if (!b) return
    if (!canViewBookingDetail(b, lineUser)) {
      showToast('ห้องนี้ถูกล็อกแล้ว เฉพาะสมาชิกในตี้หรือแอดมินเท่านั้นที่สามารถดูรายละเอียดได้', 'warning')
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

  const handleStartBooking = (date = '', gameId = '', time = '', room = '') => {
    setCreateBookingDate(date || '')
    setCreateBookingGameId(gameId || '')
    setCreateBookingTime(time || '')
    setCreateBookingRoom(room || '')
    if (!lineUser) {
      onLogin()
    } else {
      setShowCreate(true)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12, color: '#64748b', fontFamily: 'Sarabun, sans-serif', background: '#f8fafc' }}>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--curtain-crimson, #e50914)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>กำลังโหลดระบบจองรอบเกม...</div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#111827',
        fontFamily: 'Sarabun, sans-serif',
        paddingTop: 56,
        paddingBottom: 80,
        '--surface-card': '#ffffff',
        '--surface-raised': '#ffffff',
        '--surface-sunken': '#f8fafc',
        '--border-default': 'rgba(0, 0, 0, 0.08)',
        '--text-primary': '#111827',
        '--text-secondary': '#4b5563',
        '--text-tertiary': '#9ca3af',
        '--line-green': '#06c755',
      }}
    >
      <style>{NETFLIX_BOOKING_CSS}</style>

      {/* ── Redesigned Clean White Header ──────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#ffffff',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          padding: '40px 24px 36px',
        }}
      >
        <div style={{ maxWidth: 1320, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>

              {/* Title + CTA row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h1
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontWeight: 900,
                      fontSize: 'clamp(32px, 4.5vw, 52px)',
                      color: '#111827',
                      letterSpacing: '0.02em',
                      lineHeight: 1.05,
                      margin: '0 0 10px',
                      textTransform: 'uppercase',
                    }}
                  >
                    จองรอบเกม <span style={{ color: 'var(--curtain-crimson, #e50914)' }}>& ตารางห้องสืบคดี</span>
                  </h1>
                  <p style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.7, margin: 0, maxWidth: 680 }}>
                    จองรอบเล่นเกม Script Murder ที่ Sofun Club Thailand เช็คตารางห้องว่างแบบเรียลไทม์ หรือเปิดปาร์ตี้ใหม่เพื่อชวนเพื่อนร่วมไขปริศนา
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleStartBooking(calendarDate || toDateStr(new Date()))}
                  className="nfx-btn-primary"
                  style={{
                    padding: '12px 24px',
                    borderRadius: 12,
                    background: 'var(--curtain-crimson, #e50914)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.28)',
                    flexShrink: 0,
                  }}
                >
                  <i className="fas fa-plus" style={{ fontSize: 12 }} />
                  สร้างการจองใหม่
                </button>
              </div>


            </div>
          </div>
        </div>
      </section>

      {/* ── Main Two-Column Calendar Layout ───────────────────────────────── */}
      <main
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          padding: '28px 20px 64px',
        }}
      >
        <div className="booking-two-col-grid">

          {/* ── Left Column: My Bookings or Guest VIP Pass ─────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {lineUser ? (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  borderRadius: 20,
                  padding: '20px',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 18, borderRadius: 2, background: 'var(--curtain-crimson, #e50914)' }} />
                    <h3 style={{ fontSize: 15, fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.01em' }}>
                      การจองของฉัน (MY LIST)
                    </h3>
                    {activeMyBookings.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 12, background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.1)', color: 'var(--curtain-crimson, #e50914)' }}>
                        {activeMyBookings.length}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStartBooking(calendarDate || toDateStr(new Date()))}
                    className="nfx-btn-primary"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      background: 'var(--curtain-crimson, #e50914)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <i className="fas fa-plus" style={{ fontSize: 9 }} />
                    จองเพิ่ม
                  </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', background: '#f8fafc', padding: 3, borderRadius: 10, border: '1px solid rgba(0, 0, 0, 0.06)' }}>
                  {[
                    { key: 'active', label: 'รอดำเนินการ', count: activeMyBookings.length },
                    { key: 'all', label: 'ทั้งหมด', count: myBookings.length },
                    { key: 'closed', label: 'ปิด/ยกเลิก', count: closedMyBookings.length },
                  ].map(t => {
                    const isActive = myBookingsTab === t.key
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setMyBookingsTab(t.key)}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          borderRadius: 8,
                          border: 'none',
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5,
                          background: isActive ? '#ffffff' : 'transparent',
                          color: isActive ? '#111827' : '#64748b',
                          boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.06)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>{t.label}</span>
                        {t.count > 0 && (
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 800,
                              padding: '0 5px',
                              borderRadius: 10,
                              background: isActive ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.1)' : '#e2e8f0',
                              color: isActive ? 'var(--curtain-crimson, #e50914)' : '#475569',
                            }}
                          >
                            {t.count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Booking List or Empty State */}
                {displayedMyBookings.length === 0 ? (
                  <div
                    style={{
                      padding: '36px 16px',
                      borderRadius: 14,
                      border: '1px dashed rgba(0, 0, 0, 0.12)',
                      textAlign: 'center',
                      background: '#f8fafc',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',
                        color: 'var(--curtain-crimson, #e50914)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 10px',
                        fontSize: 18,
                      }}
                    >
                      <i className="fas fa-calendar-plus" />
                    </div>
                    <h4 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 800, color: '#111827' }}>
                      {myBookingsTab === 'active' ? 'ไม่มีการจองที่รอดำเนินการ' : myBookingsTab === 'closed' ? 'ไม่มีการจองที่ปิดหรือยกเลิก' : 'ยังไม่มีประวัติการจอง'}
                    </h4>
                    <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                      เลือกรอบจากปฏิทินทางขวา หรือกดสร้างการจองใหม่เพื่อเปิดห้องสืบคดี
                    </p>
                    <button
                      type="button"
                      onClick={() => handleStartBooking(calendarDate || toDateStr(new Date()))}
                      className="nfx-btn-primary"
                      style={{
                        padding: '8px 18px',
                        borderRadius: 10,
                        background: 'var(--curtain-crimson, #e50914)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      + สร้างการจองใหม่
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {displayedMyBookings.map(b => (
                      <BookingCard
                        key={b.id}
                        booking={b}
                        lineUser={lineUser}
                        onOpen={openDetail}
                        onCloseBooking={handleCloseBookingFromList}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Guest VIP Pass Card */
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 20,
                  background: '#ffffff',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  padding: '26px 22px',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 12px',
                    borderRadius: 20,
                    background: 'rgba(6, 199, 85, 0.1)',
                    border: '1px solid rgba(6, 199, 85, 0.2)',
                    color: '#06c755',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginBottom: 14,
                  }}
                >
                  <i className="fas fa-crown" style={{ fontSize: 10 }} />
                  SOFUN VIP PASS
                </div>

                <h3 style={{ fontSize: 17, fontWeight: 900, color: '#111827', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
                  เข้าสู่ระบบเพื่อเริ่มจอง
                </h3>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 18px', lineHeight: 1.6, maxWidth: 280 }}>
                  เชื่อมต่อด้วย LINE เพื่อจัดการรอบเล่น ชวนเพื่อน และรับสิทธิพิเศษ Exclusive
                </p>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', marginBottom: 20 }}>
                  {[
                    { icon: 'fas fa-door-closed', col: '#d97706', text: 'ล็อคห้องส่วนตัว & เลือกรอบเวลาที่ต้องการ' },
                    { icon: 'fas fa-users', col: '#2563eb', text: 'สร้างปาร์ตี้ ส่งลิงก์ชวนเพื่อนร่วมตี้' },
                    { icon: 'fab fa-line', col: '#06c755', text: 'แจ้งเตือนสถานะการจองผ่าน LINE ทันที' },
                    { icon: 'fas fa-gem', col: 'var(--curtain-crimson, #e50914)', text: 'สะสมแต้มเล่นเกมเพื่อรับส่วนลดพิเศษ' },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: '#f8fafc',
                        border: '1px solid rgba(0, 0, 0, 0.06)',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: `${item.col}15`,
                          border: `1px solid ${item.col}30`,
                          color: item.col,
                          fontSize: 12,
                        }}
                      >
                        <i className={item.icon} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{item.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onLogin}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    borderRadius: 12,
                    background: '#06c755',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: 13.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(6, 199, 85, 0.25)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <i className="fab fa-line" style={{ fontSize: 17 }} />
                  เข้าสู่ระบบด้วย LINE เพื่อจองห้อง
                </button>
              </div>
            )}
          </div>

          {/* ── Right Column: Interactive Monthly Calendar ───────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: 20,
                padding: '20px 22px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                  paddingBottom: 14,
                  borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 18, borderRadius: 2, background: 'var(--curtain-crimson, #e50914)' }} />
                  <h3 style={{ fontSize: 15, fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.01em' }}>
                    ตารางห้อง & ปฏิทินรอบเล่น
                  </h3>
                </div>
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                  คลิกวันที่เพื่อดูรายละเอียดรอบเล่น
                </span>
              </div>

              <BookingCalendar
                bookings={bookings}
                lineUser={lineUser}
                onDayClick={date => setCalendarDate(d => d === date ? '' : date)}
                selectedDate={calendarDate}
                onEventClick={openDetail}
                onBookToday={date => handleStartBooking(date || calendarDate || toDateStr(new Date()))}
              />
            </div>
          </div>

        </div>
      </main>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateBookingModal
          allGames={allGames}
          bookings={bookings}
          lineUser={lineUser}
          onLogin={onLogin}
          defaultDate={createBookingDate || calendarDate || toDateStr(new Date())}
          defaultGameId={createBookingGameId}
          defaultTime={createBookingTime}
          defaultRoom={createBookingRoom}
          onClose={() => {
            setShowCreate(false)
            setCreateBookingDate('')
            setCreateBookingGameId('')
            setCreateBookingTime('')
            setCreateBookingRoom('')
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
