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
  'Chinese DM': '#e50914', 'Thai DM': '#b45309',
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
  confirmed: { bg: 'rgba(229, 9, 20, 0.08)',   color: '#e50914', border: 'rgba(229, 9, 20, 0.25)' },
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
    box-shadow: 0 8px 24px rgba(229, 9, 20, 0.35) !important;
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
      border-color: #e50914 !important;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08) !important;
      transform: translateY(-2px) !important;
    }
  }
  .nfx-script-card.selected {
    border-color: #e50914 !important;
    box-shadow: 0 8px 24px rgba(229, 9, 20, 0.25) !important;
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
              background: 'rgba(229, 9, 20, 0.08)',
              border: '1px solid rgba(229, 9, 20, 0.2)',
              color: '#e50914',
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
                  color: '#e50914',
                  background: 'rgba(229, 9, 20, 0.08)',
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
              border: `1px solid ${useBarMode ? 'rgba(229, 9, 20, 0.3)' : 'rgba(0, 0, 0, 0.08)'}`,
              background: useBarMode ? 'rgba(229, 9, 20, 0.08)' : '#ffffff',
              color: useBarMode ? '#e50914' : '#4b5563',
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
              e.currentTarget.style.borderColor = '#e50914'
              e.currentTarget.style.color = '#e50914'
              e.currentTarget.style.background = 'rgba(229, 9, 20, 0.04)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.08)'
              e.currentTarget.style.color = '#4b5563'
              e.currentTarget.style.background = '#ffffff'
            }}
          >
            <i className="fas fa-bullseye" style={{ fontSize: '11px', color: '#e50914' }} />
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
            const headerColor = isSun ? '#e50914' : isSat ? '#2563eb' : '#475569'
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
              ? 'rgba(229, 9, 20, 0.03)'
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
                  boxShadow: isSel ? 'inset 0 0 0 2px #e50914' : 'none',
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
                        color: '#e50914',
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
                        background: '#e50914',
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
                          ? '#e50914'
                          : isSun
                            ? '#e50914'
                            : isSat
                              ? '#2563eb'
                              : isPast
                                ? '#94a3b8'
                                : '#1e293b',
                      background: isToday
                        ? '#e50914'
                        : isSel
                          ? 'rgba(229, 9, 20, 0.12)'
                          : 'transparent',
                      boxShadow: isToday ? '0 2px 6px rgba(229, 9, 20, 0.35)' : 'none',
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
              background: activeDateStr === todayStr ? 'rgba(229, 9, 20, 0.08)' : '#f1f5f9',
              color: activeDateStr === todayStr ? '#e50914' : '#4b5563',
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
                    background: 'rgba(229, 9, 20, 0.08)',
                    color: '#e50914',
                    border: '1px solid rgba(229, 9, 20, 0.2)',
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
            background: '#e50914',
            border: 'none',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(229, 9, 20, 0.28)',
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
          e.currentTarget.style.borderColor = '#e50914'
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
            <i className="fas fa-calendar text-[10px]" style={{ color: '#e50914' }} />
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
                color: '#e50914',
                background: 'rgba(229, 9, 20, 0.08)',
                padding: '1px 6px',
                borderRadius: '6px',
                border: '1px solid rgba(229, 9, 20, 0.2)',
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
              <span style={{ color: isLocked || allPaid ? '#15803d' : '#e50914', fontWeight: 700 }}>
                {isLocked ? 'ล็อกห้องแล้ว 100%' : `มัดจำ ${paidCount}/${max} คน`}
              </span>
            </div>
          )}

          <div style={{ height: '5px', borderRadius: '5px', background: '#f1f5f9', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: isLocked && !canView ? '100%' : `${paidPct}%`,
                background: isLocked || allPaid ? '#16a34a' : '#e50914',
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
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#e50914', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
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
            background: '#e50914',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 900,
            padding: '2px 8px',
            borderRadius: '20px',
            boxShadow: '0 2px 8px rgba(229, 9, 20, 0.4)',
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

  const C = '#e50914'
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
                  background: 'rgba(229, 9, 20, 0.08)',
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
                          background: isActive ? 'rgba(229, 9, 20, 0.08)' : '#ffffff',
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
                        boxShadow: isSel ? '0 8px 24px rgba(229, 9, 20, 0.25)' : '0 2px 6px rgba(0, 0, 0, 0.03)',
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
                          <div style={{ position: 'absolute', top: 6, right: 6, width: '24px', height: '24px', borderRadius: '50%', background: C, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', boxShadow: '0 2px 8px rgba(229,9,20,0.5)' }}>
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
                    style={{ fontSize: '11.5px', fontWeight: 700, color: C, background: 'rgba(229, 9, 20, 0.08)', border: 'none', padding: '6px 12px', borderRadius: '20px', cursor: 'pointer' }}
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
                          border: `1.5px solid ${isActive ? C : count > 0 ? 'rgba(229,9,20,0.25)' : 'rgba(0, 0, 0, 0.08)'}`,
                          boxShadow: isActive ? '0 6px 16px rgba(229, 9, 20, 0.3)' : 'none',
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
                  boxShadow: selectedGame ? '0 4px 14px rgba(229,9,20,0.3)' : 'none',
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
                  boxShadow: selectedDate && finalTime && !submitting ? '0 4px 14px rgba(229,9,20,0.3)' : 'none',
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
  const C = '#e50914'
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
        padding: 'clamp(24px, 5vh, 48px) 16px',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(10px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="w-full sm:max-w-md flex flex-col overflow-hidden"
        style={{
          background: '#ffffff',
          color: INK,
          borderRadius: 24,
          maxHeight: 'min(86dvh, 760px)',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25)',
          fontFamily: "'Sarabun', sans-serif",
        }}
      >
        {/* Drag handle */}
        <div className="w-11 h-[5px] rounded-full mx-auto mt-4 mb-0 sm:hidden shrink-0" style={{ background: '#cbd5e1' }} />

        {/* Header */}
        <div className="flex items-start justify-between pt-7 pb-5 shrink-0" style={{ paddingLeft: 28, paddingRight: 28 }}>
          <div className="min-w-0 flex-1">
            {/* Step indicator eyebrow */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: C }}>
                ขั้นตอน {stepIndex + 1} / 3
              </span>
              <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="rounded-full"
                    style={{
                      width: i === stepIndex ? 20 : 6, height: 6,
                      background: i <= stepIndex ? C : '#cbd5e1',
                      transition: 'width 220ms',
                    }}
                  />
                ))}
              </div>
            </div>
            <h3 className="font-black leading-[1.15] tracking-tight" style={{ color: INK, fontSize: 24 }}>
              {step === 'qr' ? 'ชำระมัดจำ' : step === 'upload' ? 'ตรวจสอบสลิป' : 'ส่งสลิปสำเร็จ'}
            </h3>
            <p className="text-[13px] mt-1.5 leading-snug truncate" style={{ color: '#64748b' }}>
              {step === 'qr' ? `สแกน QR แล้วโอน · ${booking.gameName}` : step === 'upload' ? 'ตรวจความถูกต้องก่อนส่ง' : 'รอแอดมินยืนยัน'}
            </p>
          </div>
          {step !== 'done' && (
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ml-4"
              style={{ background: '#f5f1ef', color: '#64748b', marginTop: 2 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ebe4e1'; e.currentTarget.style.color = INK }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f5f1ef'; e.currentTarget.style.color = '#64748b' }}
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
                    <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: '#64748b', marginBottom: 4 }}>ยอดต่อคน</p>
                    <p className="font-black leading-none" style={{ color: C, fontSize: 36, letterSpacing: '-0.02em' }}>฿{amount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px]" style={{ color: '#64748b', lineHeight: 1.4 }}>
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
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 12px 32px #e2e8f0',
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
                      <p className="text-[12px] mt-1 font-medium" style={{ color: '#4b5563' }}>
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
                      border: '1px solid #cbd5e1',
                      fontSize: 12.5, fontFamily: "'Sarabun', sans-serif", cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f5f1ef'; e.currentTarget.style.borderColor = '#94a3b8' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#cbd5e1' }}
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
                    <li key={i} className="flex items-center" style={{ gap: 12, padding: '10px 14px', borderRadius: 12, background: '#ffffff', border: '1px solid #f1f5f9' }}>
                      <span className="flex items-center justify-center font-black shrink-0"
                        style={{ width: 24, height: 24, borderRadius: 999, background: `${C}10`, color: C, fontSize: 11 }}>
                        {i + 1}
                      </span>
                      <span className="text-[13px]" style={{ color: '#374151', lineHeight: 1.5 }}>{txt}</span>
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
                  <i className="fas fa-qrcode" style={{ fontSize: 30, color: '#94a3b8' }} />
                </div>
                <div>
                  <p className="font-black text-[15px]" style={{ color: INK }}>ยังไม่ได้ตั้งค่าบัญชี</p>
                  <p className="text-[13px] mt-1" style={{ color: '#64748b', maxWidth: 260 }}>ติดต่อแอดมินเพื่อรับข้อมูลการโอนเงิน</p>
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
                <div className="text-[11px] font-bold" style={{ color: '#64748b' }}>ยอดที่ต้องชำระ</div>
                <div className="font-black" style={{ fontSize: 18, color: C, lineHeight: 1.1 }}>฿{amount.toLocaleString()}</div>
              </div>
            </div>

            {/* Slip preview */}
            {slipPreview && (
              <div className="overflow-hidden flex items-center justify-center"
                style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#f5f1ef', maxHeight: 320 }}>
                <img src={slipPreview} alt="slip" className="w-full object-contain" style={{ maxHeight: 320 }} />
              </div>
            )}

            <p className="text-center text-[12px]" style={{ color: '#64748b' }}>
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
                  color: uploading ? '#94a3b8' : '#fff',
                  border: 'none', cursor: uploading ? 'wait' : 'pointer',
                  fontSize: 15, letterSpacing: '0.01em',
                  boxShadow: uploading ? 'none' : `0 10px 28px ${C}3f`,
                }}
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#94a3b8', borderTopColor: INK }} />
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
              style={{ gap: 14, padding: '14px 18px', borderRadius: 16, background: '#ffffff', border: '1px solid #e2e8f0' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${C}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fas fa-calendar-check" style={{ color: C, fontSize: 15 }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black truncate" style={{ fontSize: 14, color: INK }}>{booking.gameName}</p>
                <p className="mt-0.5 text-[12px]" style={{ color: '#64748b' }}>
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

  const addedDays = paidCount * 3
  const playDateObj = booking.date ? new Date(`${booking.date}T${booking.time || '12:00'}:00`) : null
  const maxCapDate = playDateObj ? new Date(playDateObj.getTime() - 24 * 3600000) : null
  const maxCapStr = maxCapDate ? fmtDateTime(maxCapDate.toISOString()) : ''
  const deadlineStr = booking.depositDeadline ? fmtDateTime(booking.depositDeadline) : ''

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

  const C = '#e50914'
  const INK = '#111827'

  if (isLockedRestricted) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(10px)' }}
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
            boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
            fontFamily: "'Sarabun', sans-serif",
            border: '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 20,
              background: 'rgba(229, 9, 20, 0.08)',
              color: C,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              margin: '0 auto 18px',
              border: '1px solid rgba(229, 9, 20, 0.2)',
            }}
          >
            <i className="fas fa-lock" />
          </div>

          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: C,
              background: 'rgba(229, 9, 20, 0.08)',
              padding: '3px 10px',
              borderRadius: 20,
              marginBottom: 12,
            }}
          >
            LOCKED ROOM · ล็อกห้องแล้ว
          </span>

          <h3 style={{ fontSize: 20, fontWeight: 900, color: INK, margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            ห้องนี้ถูกล็อกแล้ว
          </h3>

          <p style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
            ปาร์ตี้นี้ได้รับการยืนยันและล็อกห้องเรียบร้อยแล้ว เฉพาะ<strong>สมาชิกในตี้</strong> หรือ <strong>แอดมิน</strong> เท่านั้นที่สามารถเข้าดูรายละเอียดได้
          </p>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 12,
              background: INK,
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1f2937' }}
            onMouseLeave={e => { e.currentTarget.style.background = INK }}
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
          padding: 'clamp(16px, 3.5vh, 32px) 16px',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(10px)',
          boxSizing: 'border-box',
        }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div
          className="w-full sm:max-w-xl overflow-hidden flex flex-col"
          style={{
            background: '#ffffff',
            color: INK,
            borderRadius: 24,
            maxHeight: 'min(88dvh, 820px)',
            boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
            fontFamily: "'Sarabun', sans-serif",
          }}
        >
          {/* Mobile drag handle */}
          <div className="w-11 h-[5px] rounded-full mx-auto mt-2.5 mb-0 sm:hidden shrink-0 z-20 relative" style={{ background: 'rgba(255,255,255,0.35)' }} />

          {/* ── 1. CINEMATIC HERO HEADER (Pinned Shrink-0) ── */}
          <div
            className="relative overflow-hidden shrink-0 select-none"
            style={{
              background: '#0d1117',
              minHeight: 'clamp(195px, 28vw, 240px)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {/* Ambient game backdrop */}
            {imgSrc ? (
              <img
                src={imgSrc}
                aria-hidden
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  filter: 'blur(20px) brightness(0.4) saturate(1.4)',
                  transform: 'scale(1.18)',
                  opacity: 0.65,
                }}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(135deg, #111827 0%, #1e293b 100%)',
                }}
              />
            )}

            {/* Dynamic Room Accent Glow */}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(ellipse 65% 60% at 85% 15%, ${rc}44 0%, transparent 68%)`,
              }}
            />

            {/* Cinematic dark vignette & bottom shadow */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(13,17,23,0.3) 0%, rgba(13,17,23,0.65) 55%, #0d1117 100%)',
              }}
            />

            {/* Content Container */}
            <div
              className="relative z-10 h-full flex items-end gap-4 sm:gap-5 pt-11 pb-5 px-5 sm:px-6"
              style={{ minHeight: 'clamp(195px, 28vw, 240px)' }}
            >
              {/* Poster 3D thumbnail */}
              {imgSrc && (
                <div
                  className="shrink-0 self-end"
                  style={{ width: 'clamp(82px, 18vw, 104px)' }}
                >
                  <div
                    className="overflow-hidden"
                    style={{
                      aspectRatio: '2/3',
                      borderRadius: 14,
                      boxShadow: '0 18px 36px -8px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(255,255,255,0.18)',
                      background: '#161b22',
                    }}
                  >
                    <img
                      src={imgSrc}
                      alt={booking.gameName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Title & Metadata block */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <StatusBadge status={booking.status} />
                  {booking.room && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '2px 9px',
                        borderRadius: '20px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: `${rc}26`,
                        color: '#ffffff',
                        border: `1px solid ${rc}66`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          background: rc,
                          boxShadow: `0 0 6px ${rc}`,
                        }}
                      />
                      {booking.room}
                    </span>
                  )}
                </div>

                <h2
                  className="font-black leading-[1.15] tracking-tight text-white drop-shadow-md"
                  style={{ fontSize: 'clamp(20px, 4.6vw, 26px)', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
                >
                  {booking.gameName || 'การจองห้อง'}
                </h2>

                {/* Sleek meta pill tags */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '3px 9px',
                      borderRadius: '999px',
                      background: 'rgba(255, 255, 255, 0.12)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: 'rgba(255, 255, 255, 0.95)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <i className="fas fa-calendar-alt text-[10px]" style={{ color: '#ef4444' }} />
                    <span>{fmtDate(booking.date)}</span>
                  </div>

                  {booking.time && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 9px',
                        borderRadius: '999px',
                        background: 'rgba(255, 255, 255, 0.12)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: 'rgba(255, 255, 255, 0.95)',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        backdropFilter: 'blur(8px)',
                      }}
                    >
                      <i className="fas fa-clock text-[10px]" style={{ color: '#fbbf24' }} />
                      <span>{booking.time} น.</span>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '3px 9px',
                      borderRadius: '999px',
                      background: 'rgba(255, 255, 255, 0.12)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: 'rgba(255, 255, 255, 0.95)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <i className="fas fa-coins text-[10px]" style={{ color: '#10b981' }} />
                    <span>มัดจำ ฿{booking.depositAmount || 0} / คน</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(12px)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.75)'
                e.currentTarget.style.color = '#ffffff'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.45)'
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)'
              }}
              title="ปิด"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>

          {/* ── 2. SCROLLABLE BODY (Netflix Squad Experience) ── */}
          <div
            className="overflow-y-auto flex-1 flex flex-col"
            style={{ padding: '20px clamp(18px, 3.5vw, 26px)', gap: 16 }}
          >
            {/* Status Case: Locked (Room fully secured 100%) */}
            {isLocked && (
              <div
                className="p-4 rounded-2xl flex items-center gap-3.5 border"
                style={{
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                  borderColor: '#86efac',
                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.08)',
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: '#16a34a', color: '#ffffff', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}
                >
                  <i className="fas fa-lock text-base" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-[14.5px] text-emerald-950">ล็อกห้องสำเร็จแล้ว (สิทธิ์สมบูรณ์ 100%)</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white uppercase tracking-wider">
                      LOCKED
                    </span>
                  </div>
                  <p className="text-[12px] mt-1 text-emerald-800 leading-relaxed font-medium">
                    ชำระมัดจำครบ {paidCount}/{maxMembers} คนเรียบร้อยแล้ว ล็อกห้อง <strong>{booking.room || 'ที่เลือก'}</strong> วันที่ <strong>{fmtDate(booking.date)}</strong> เวลา <strong>{booking.time} น.</strong> สำหรับปาร์ตี้ของคุณ
                  </p>
                </div>
              </div>
            )}

            {/* Status Case: Confirmed (Active deposit window - Room NOT yet locked) */}
            {!isLocked && booking.status === 'confirmed' && (
              <div
                className="rounded-2xl border overflow-hidden"
                style={{
                  background: '#ffffff',
                  borderColor: isUrgent ? 'rgba(229, 9, 20, 0.35)' : 'rgba(0, 0, 0, 0.08)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                }}
              >
                {/* Top countdown bar */}
                <div
                  className="px-4 py-3 flex items-center justify-between gap-3 border-b"
                  style={{
                    background: isUrgent ? '#fef2f2' : '#f8fafc',
                    borderColor: 'rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0"
                      style={{ background: isUrgent ? C : '#f59e0b' }}
                    />
                    <span className="font-black text-[13px] truncate" style={{ color: isUrgent ? C : INK }}>
                      {countdown ? `เหลือเวลาชำระอีก ${countdown}` : 'เปิดรับการชำระมัดจำ'}
                    </span>
                  </div>
                  <span
                    className="text-[10.5px] font-black px-2.5 py-1 rounded-full shrink-0"
                    style={{
                      background: isUrgent ? 'rgba(229, 9, 20, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                      color: isUrgent ? C : '#4b5563',
                      border: `1px solid ${isUrgent ? 'rgba(229, 9, 20, 0.25)' : 'rgba(0, 0, 0, 0.08)'}`,
                    }}
                  >
                    {isUrgent ? 'ใกล้หมดเวลา' : `ยังขาดอีก ${remainingToLock} คน`}
                  </span>
                </div>

                {/* Progress details */}
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-bold" style={{ color: INK }}>
                      ความคืบหน้าการล็อกห้อง: <strong style={{ color: C }}>{paidCount}</strong> / {maxMembers} คน
                    </span>
                    <span className="font-black" style={{ color: C }}>
                      {paidPct}%
                    </span>
                  </div>

                  {/* Netflix Red high-contrast progress bar */}
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, Math.max(0, paidPct))}%`,
                        background: `linear-gradient(90deg, ${C} 0%, #ff3344 100%)`,
                        boxShadow: '0 0 10px rgba(229, 9, 20, 0.4)',
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-medium" style={{ color: '#64748b' }}>
                    <span>มัดจำ ฿{booking.depositAmount || 0} / คน</span>
                    <span>จ่ายครบ {maxMembers} คน ล็อกห้องอัตโนมัติทันที</span>
                  </div>
                </div>
              </div>
            )}

            {/* Status Case: Collapsed */}
            {booking.status === 'collapsed' && (
              <div
                className="p-4 rounded-2xl border flex items-center justify-between gap-3"
                style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' }}
              >
                <div className="flex items-center gap-3 text-[13px] font-bold">
                  <i className="fas fa-exclamation-triangle shrink-0" />
                  <span>หมดเวลาชำระมัดจำ — ปาร์ตี้ล่มเนื่องจากชำระไม่ครบตามกำหนด</span>
                </div>
                {isLeader && (
                  <button
                    type="button"
                    onClick={handleCloseBooking}
                    disabled={closing}
                    className="font-bold text-xs shrink-0 transition-opacity hover:opacity-85"
                    style={{ padding: '7px 14px', borderRadius: 999, background: C, color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    {closing ? 'กำลังปิด...' : 'ปิดตี้'}
                  </button>
                )}
              </div>
            )}

            {/* Status Case: Pending Admin Confirmation */}
            {booking.status === 'pending' && (
              <div
                className="p-4 rounded-2xl border flex items-center gap-3.5"
                style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}
                >
                  <i className="fas fa-hourglass-half text-sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-[13.5px]">รอแอดมินยืนยันรอบการจอง</div>
                  <div className="text-[11.5px] mt-0.5 text-amber-700 leading-relaxed font-medium">
                    เมื่อแอดมินยืนยันตี้แล้ว ระบบจะเริ่มเปิดรับการชำระมัดจำและนับเวลา 3 วันแรกทันที
                  </div>
                </div>
              </div>
            )}

            {/* Join requests (Leader view) */}
            {isLeader && (booking.joinRequests?.length > 0) && (
              <div
                className="p-4 rounded-2xl border"
                style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <i className="fas fa-bell text-[11px]" style={{ color: C }} />
                  <span className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: C }}>
                    คำขอเข้าร่วม ({booking.joinRequests.length})
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {booking.joinRequests.map(req => {
                    const reqProf = memberProfiles[req.uid]
                    const reqAvatar = req.avatar || reqProf?.pictureUrl || reqProf?.avatar || ''
                    const reqName = req.name || reqProf?.nickname || reqProf?.firstname || reqProf?.name || 'ผู้ขอเข้าร่วม'

                    return (
                      <div
                        key={req.uid}
                        className="flex items-center justify-between gap-3"
                        style={{ padding: '10px 12px', borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0' }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <MemberAvatar src={reqAvatar} name={reqName} size={36} />
                          <span className="text-sm font-bold truncate" style={{ color: INK }}>{reqName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleApproveRequest(req)}
                            disabled={approvingUid === req.uid}
                            className="font-bold text-xs transition-opacity hover:opacity-90"
                            style={{ padding: '6px 14px', borderRadius: 999, background: C, color: '#fff', border: 'none', cursor: 'pointer' }}
                          >
                            {approvingUid === req.uid ? '...' : 'รับ'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectRequest(req)}
                            disabled={rejectingUid === req.uid}
                            className="font-bold text-xs transition-colors"
                            style={{ padding: '6px 14px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Squad Roster (Netflix Cast Grid) ── */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: INK }}>
                    ผู้เล่นในตี้
                  </span>
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(0, 0, 0, 0.06)', color: '#4b5563' }}
                  >
                    {total}/{maxMembers} คน
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-medium" style={{ color: '#64748b' }}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: '#16a34a' }} /> ชำระแล้ว
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: '#cbd5e1' }} /> ยังไม่ชำระ
                  </span>
                </div>
              </div>

              {/* 2-Column Responsive Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Active Member Cards */}
                {(booking.members || []).map((m, idx) => {
                  const mProf = memberProfiles[m.uid || m.id]
                  const mAvatar = m.avatar || mProf?.pictureUrl || mProf?.avatar || ''
                  const mName = m.name || mProf?.nickname || mProf?.firstname || mProf?.name || 'สมาชิก'
                  const isMemLeader = m.uid === booking.leaderId

                  return (
                    <div
                      key={m.uid || m.id || idx}
                      className="group flex items-center justify-between gap-2.5 transition-all"
                      style={{
                        padding: '10px 12px',
                        borderRadius: 14,
                        background: '#ffffff',
                        border: '1px solid rgba(0, 0, 0, 0.08)',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
                      }}
                    >
                      <div
                        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                        onClick={() => openProfile(m.uid || m.id)}
                        title="ดูโปรไฟล์"
                      >
                        <MemberAvatar
                          src={mAvatar}
                          name={mName}
                          size={38}
                          imgStyle={
                            m.paidDeposit
                              ? { outline: '2px solid #16a34a', outlineOffset: 1.5 }
                              : m.slipStatus === 'pending_verification'
                                ? { outline: '2px solid #f59e0b', outlineOffset: 1.5 }
                                : { outline: '1.5px solid rgba(0, 0, 0, 0.08)', outlineOffset: 1.5 }
                          }
                          badge={
                            isMemLeader ? (
                              <div
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center shadow-sm"
                                style={{ background: C, border: '1.5px solid #ffffff' }}
                                title="หัวหน้าปาร์ตี้"
                              >
                                <i className="fas fa-crown text-[6px] text-white" />
                              </div>
                            ) : null
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-bold truncate leading-tight" style={{ color: INK }}>
                              {mName}
                            </span>
                            {isMemLeader && (
                              <span
                                className="text-[9px] font-black uppercase tracking-wider shrink-0"
                                style={{
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  background: 'rgba(229, 9, 20, 0.08)',
                                  color: C,
                                }}
                              >
                                หัวหน้า
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] mt-0.5 truncate font-medium" style={{ color: '#64748b' }}>
                            {m.paidDeposit
                              ? 'ยืนยันมัดจำแล้ว'
                              : m.slipStatus === 'pending_verification'
                                ? 'รอตรวจสอบสลิป'
                                : 'รอชำระมัดจำ'}
                          </div>
                        </div>
                      </div>

                      {/* Right side status badge & slip */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.slipUrl && (
                          <a
                            href={m.slipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-7 h-7 overflow-hidden block rounded-lg border border-slate-200 transition-opacity hover:opacity-80"
                            title="ดูสลิป"
                          >
                            <img src={m.slipUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </a>
                        )}
                        <span
                          className="text-[10px] font-black tracking-tight"
                          style={{
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: m.paidDeposit
                              ? '#dcfce7'
                              : m.slipStatus === 'pending_verification'
                                ? '#fef3c7'
                                : '#f1f5f9',
                            color: m.paidDeposit
                              ? '#15803d'
                              : m.slipStatus === 'pending_verification'
                                ? '#b45309'
                                : '#64748b',
                            border: `1px solid ${
                              m.paidDeposit
                                ? '#bbf7d0'
                                : m.slipStatus === 'pending_verification'
                                  ? '#fde68a'
                                  : '#e2e8f0'
                            }`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.paidDeposit ? (
                            <>
                              <i className="fas fa-check mr-1 text-[8px]" />
                              จ่ายแล้ว
                            </>
                          ) : m.slipStatus === 'pending_verification' ? (
                            <>
                              <i className="fas fa-clock mr-1 text-[8px]" />
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

                {/* Compact Empty Seats in same grid */}
                {Array.from({ length: Math.max(0, maxMembers - total) }).map((_, i) => (
                  <div
                    key={`empty-seat-${i}`}
                    className="flex items-center justify-between gap-2.5 transition-all select-none"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 14,
                      background: 'rgba(248, 250, 252, 0.7)',
                      border: '1.5px dashed rgba(203, 213, 225, 0.85)',
                      minHeight: 58,
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: '#f1f5f9',
                          border: '1px dashed #cbd5e1',
                          color: '#94a3b8',
                        }}
                      >
                        <i className="fas fa-user-plus text-[11px]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-bold truncate" style={{ color: '#64748b' }}>
                          ที่นั่งว่าง #{total + i + 1}
                        </div>
                        <div className="text-[10px] font-medium" style={{ color: '#94a3b8' }}>
                          เปิดรับผู้เล่น
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-[9.5px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        background: '#f1f5f9',
                        color: '#94a3b8',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      ว่าง
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Compact 2x2 Rules Brief ── */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: '#64748b' }}>
                <i className="fas fa-shield-alt text-[10px]" style={{ color: C }} />
                <span>เงื่อนไขการจอง &amp; กติกาการล็อกห้อง</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  className="p-3 rounded-xl border flex items-start gap-2.5"
                  style={{ background: '#f8fafc', borderColor: 'rgba(0, 0, 0, 0.06)' }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(229, 9, 20, 0.08)', color: C }}
                  >
                    <i className="fas fa-lock text-xs" />
                  </div>
                  <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
                    <strong className="block text-[12px] font-bold" style={{ color: INK }}>ล็อกห้อง 100%</strong>
                    <span style={{ color: '#4b5563' }}>เมื่อชำระมัดจำครบ {maxMembers} คน ระบบล็อกห้องทันที</span>
                  </div>
                </div>

                <div
                  className="p-3 rounded-xl border flex items-start gap-2.5"
                  style={{ background: '#f8fafc', borderColor: 'rgba(0, 0, 0, 0.06)' }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(229, 9, 20, 0.08)', color: C }}
                  >
                    <i className="fas fa-user-clock text-xs" />
                  </div>
                  <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
                    <strong className="block text-[12px] font-bold" style={{ color: INK }}>ขยายเวลา +3 วัน</strong>
                    <span style={{ color: '#4b5563' }}>ทุก 1 คนที่ชำระสำเร็จ ระบบขยายเวลาให้ทั้งตี้อีก +3 วัน</span>
                  </div>
                </div>

                <div
                  className="p-3 rounded-xl border flex items-start gap-2.5"
                  style={{ background: '#f8fafc', borderColor: 'rgba(0, 0, 0, 0.06)' }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(229, 9, 20, 0.08)', color: C }}
                  >
                    <i className="fas fa-calendar-check text-xs" />
                  </div>
                  <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
                    <strong className="block text-[12px] font-bold" style={{ color: INK }}>กำหนดรอบแรก 3 วัน</strong>
                    <span style={{ color: '#4b5563' }}>เริ่มนับเวลาชำระมัดจำทันทีหลังจากแอดมินยืนยันตี้</span>
                  </div>
                </div>

                <div
                  className="p-3 rounded-xl border flex items-start gap-2.5"
                  style={{ background: '#f8fafc', borderColor: 'rgba(0, 0, 0, 0.06)' }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(229, 9, 20, 0.08)', color: C }}
                  >
                    <i className="fas fa-hourglass-end text-xs" />
                  </div>
                  <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
                    <strong className="block text-[12px] font-bold" style={{ color: INK }}>ปิดรับก่อนเล่น 1 วัน</strong>
                    <span style={{ color: '#4b5563' }}>เดดไลน์สิ้นสุดไม่เกิน 24 ชม. ก่อนวันเริ่มเล่นจริง</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin note */}
            {booking.adminNote && (
              <div
                className="p-3 rounded-xl border flex items-start gap-2.5"
                style={{ background: '#f8fafc', borderColor: '#e2e8f0', color: '#334155', fontSize: '12px' }}
              >
                <i className="fas fa-comment-alt text-xs mt-0.5 shrink-0" style={{ color: C }} />
                <div className="min-w-0 flex-1">
                  <span className="font-black text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: C }}>
                    โน้ตจากแอดมิน
                  </span>
                  <span>{booking.adminNote}</span>
                </div>
              </div>
            )}
          </div>


          {/* ── 3. PINNED ACTION BAR FOOTER (Shrink-0) ── */}
          <div
            className="shrink-0 flex flex-col"
            style={{
              background: '#ffffff',
              borderTop: '1px solid rgba(0, 0, 0, 0.08)',
              padding: '14px clamp(18px, 3.5vw, 26px) max(14px, env(safe-area-inset-bottom, 14px))',
              gap: 10,
              boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.04)',
            }}
          >
            {/* Join */}
            {!isMember && !myRequest && lineUser && ['confirmed', 'pending'].includes(booking.status) && total < (booking.maxMembers || 99) && (
              <button
                type="button"
                onClick={handleRequestJoin}
                disabled={joining}
                className="w-full font-black flex items-center justify-center gap-2.5 transition-all"
                style={{
                  height: 50,
                  borderRadius: 14,
                  fontSize: 15,
                  letterSpacing: '0.01em',
                  background: C,
                  color: '#ffffff',
                  border: 'none',
                  cursor: joining ? 'wait' : 'pointer',
                  boxShadow: '0 8px 24px rgba(229, 9, 20, 0.3)',
                }}
                onMouseEnter={e => { if (!joining) e.currentTarget.style.background = '#b80710' }}
                onMouseLeave={e => { if (!joining) e.currentTarget.style.background = C }}
              >
                {joining ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>กำลังส่งคำขอ...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-user-plus text-sm" />
                    <span>ขอเข้าร่วมปาร์ตี้</span>
                  </>
                )}
              </button>
            )}

            {/* Pending join badge */}
            {!isMember && myRequest && lineUser && (
              <div
                className="font-bold text-center text-[13px] flex items-center justify-center gap-2"
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: 'rgba(229, 9, 20, 0.06)',
                  border: '1px solid rgba(229, 9, 20, 0.2)',
                  color: C,
                }}
              >
                <i className="fas fa-clock text-xs" />
                <span>คุณได้ส่งคำขอแล้ว — รอหัวปาร์ตี้อนุมัติ</span>
              </div>
            )}

            {/* Pay deposit button */}
            {isMember && booking.status === 'confirmed' && !myMember?.paidDeposit && myMember?.slipStatus !== 'pending_verification' && (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowDepositPay(true)}
                  className="w-full font-black flex items-center justify-center gap-2.5 transition-all"
                  style={{
                    height: 52,
                    borderRadius: 14,
                    fontSize: 15,
                    letterSpacing: '0.01em',
                    background: C,
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(229, 9, 20, 0.3)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#b80710'}
                  onMouseLeave={e => e.currentTarget.style.background = C}
                >
                  <i className="fas fa-qrcode text-base" />
                  <span>จ่ายมัดจำ ฿{booking.depositAmount || 0} / แนบสลิป</span>
                </button>
                <div className="text-[11px] text-center font-medium" style={{ color: '#64748b' }}>
                  ชำระแล้วจะช่วยขยายเวลาให้ตี้ +3 วัน และเมื่อครบ {maxMembers} คน ระบบจะล็อกห้องทันที
                </div>
              </div>
            )}

            {/* Already paid deposit confirmation */}
            {isMember && myMember?.paidDeposit && (
              <div
                className="flex items-center justify-center gap-2"
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#15803d',
                }}
              >
                <i className="fas fa-check-circle" />
                <span className="text-[13px] font-black">
                  {isLocked
                    ? 'คุณชำระมัดจำแล้ว — ล็อกห้องเรียบร้อย 100%'
                    : `คุณชำระมัดจำแล้ว (รอเพื่อนในตี้อีก ${remainingToLock} คนเพื่อล็อกห้อง)`}
                </span>
              </div>
            )}

            {/* Slip submitted */}
            {isMember && myMember?.slipStatus === 'pending_verification' && !myMember?.paidDeposit && (
              <div
                className="flex items-center gap-3"
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                }}
              >
                <i className="fas fa-hourglass-half text-sm text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-black text-[13.5px]">ส่งสลิปแล้ว — รอแอดมินตรวจสอบ</div>
                  <div className="text-[11.5px] text-amber-700">แอดมินจะแจ้งผลทาง LINE</div>
                </div>
              </div>
            )}

            {/* Secondary row */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleShare}
                className="flex-1 font-bold flex items-center justify-center gap-2 transition-all"
                style={{
                  height: 44,
                  borderRadius: 12,
                  fontSize: 13,
                  background: '#f1f5f9',
                  color: copied ? C : INK,
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
              >
                <i className={`fas fa-${copied ? 'check' : 'share-alt'}`} />
                <span>{copied ? 'คัดลอกลิงก์แล้ว' : `แชร์ชวนเพื่อน (${total}/${maxMembers})`}</span>
              </button>

              {isMember && !isLeader && (
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={leaving}
                  className="font-bold flex items-center justify-center gap-2 transition-all"
                  style={{
                    height: 44,
                    padding: '0 16px',
                    borderRadius: 12,
                    fontSize: 13,
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    cursor: leaving ? 'wait' : 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fef2f2'}
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
                  className="font-bold flex items-center justify-center gap-2 transition-all"
                  style={{
                    height: 44,
                    padding: '0 16px',
                    borderRadius: 12,
                    fontSize: 13,
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    cursor: closing ? 'wait' : 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fef2f2'}
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
        <div style={{ width: 36, height: 36, border: '3px solid rgba(0,0,0,0.1)', borderTopColor: '#e50914', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
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
        '--crimson-500': '#e50914',
        '--crimson-400': '#ef4444',
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
            {/* Tag */}
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: 'rgba(229, 9, 20, 0.08)',
                  border: '1px solid rgba(229, 9, 20, 0.2)',
                  color: '#e50914',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e50914' }} />
                SOFUN CLUB THAILAND · SCRIPT MURDER BOOKING
              </div>

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
                    จองรอบเกม <span style={{ color: '#e50914' }}>& ตารางห้องสืบคดี</span>
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
                    background: '#e50914',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(229, 9, 20, 0.28)',
                    flexShrink: 0,
                  }}
                >
                  <i className="fas fa-plus" style={{ fontSize: 12 }} />
                  สร้างการจองใหม่
                </button>
              </div>

              {/* Stats pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                {[
                  { icon: 'fas fa-door-open', label: '4 ห้องมาตรฐานพร้อมระบบเสียง & แสง' },
                  { icon: 'fas fa-scroll', label: '40+ แฟ้มคดี Script Murder ลิขสิทธิ์แปลไทย' },
                  { icon: 'fas fa-calendar-check', label: `${upcomingCount} รอบเล่นในระบบ` },
                ].map((stat, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '5px 12px',
                      borderRadius: 10,
                      background: '#f8fafc',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#4b5563',
                    }}
                  >
                    <i className={stat.icon} style={{ color: '#e50914', fontSize: 11 }} />
                    <span>{stat.label}</span>
                  </div>
                ))}
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
                    <div style={{ width: 4, height: 18, borderRadius: 2, background: '#e50914' }} />
                    <h3 style={{ fontSize: 15, fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.01em' }}>
                      การจองของฉัน (MY LIST)
                    </h3>
                    {activeMyBookings.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 12, background: 'rgba(229, 9, 20, 0.1)', color: '#e50914' }}>
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
                      background: '#e50914',
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
                              background: isActive ? 'rgba(229, 9, 20, 0.1)' : '#e2e8f0',
                              color: isActive ? '#e50914' : '#475569',
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
                        background: 'rgba(229, 9, 20, 0.08)',
                        color: '#e50914',
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
                        background: '#e50914',
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
                    { icon: 'fas fa-gem', col: '#e50914', text: 'สะสมแต้มเล่นเกมเพื่อรับส่วนลดพิเศษ' },
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
                  <div style={{ width: 4, height: 18, borderRadius: 2, background: '#e50914' }} />
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
