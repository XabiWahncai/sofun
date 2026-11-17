import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, getDoc
} from 'firebase/firestore'
import { verifySlipDirect, viewSlipImage } from '../utils/slipVerifier'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { db, storage, appFunctions } from '../firebase'
import { useOpenProfile } from '../UserProfileContext'
import { parseGamePlayerCount } from '../utils/bookingHelper'

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
  .booking-mobile-nav {
    display: none;
  }
  .booking-hero-section {
    padding: 36px 24px 28px;
  }
  .booking-hero-title {
    font-family: 'Bebas Neue', 'Sarabun', sans-serif;
    font-weight: 900;
    font-size: clamp(24px, 4.2vw, 48px);
    color: #111827;
    letter-spacing: 0.01em;
    line-height: 1.15;
    margin: 0 0 10px;
    text-transform: uppercase;
    text-wrap: balance;
  }
  .booking-hero-desc {
    font-size: 13.5px;
    color: #4b5563;
    line-height: 1.7;
    margin: 0;
    max-width: 680px;
    text-wrap: pretty;
  }
  .booking-main-container {
    max-width: 1320px;
    margin: 0 auto;
    padding: 24px 20px 64px;
  }

  @media (max-width: 960px) {
    .booking-mobile-nav {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 14px;
      padding: 4px;
      margin-bottom: 16px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
      gap: 6px;
      position: sticky;
      top: 64px;
      z-index: 25;
    }
    .booking-mobile-tab-btn {
      flex: 1;
      height: 42px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      background: transparent;
      color: #64748b;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      -webkit-tap-highlight-color: transparent;
    }
    .booking-mobile-tab-btn.active {
      background: var(--curtain-crimson, #e50914);
      color: #ffffff;
      box-shadow: 0 3px 12px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.28);
    }
    .booking-two-col-grid {
      grid-template-columns: 1fr !important;
      gap: 20px !important;
    }
    .booking-col-left.mobile-hidden,
    .booking-col-right.mobile-hidden {
      display: none !important;
    }
  }

  @media (max-width: 640px) {
    .booking-hero-section {
      padding: 20px 16px 16px !important;
    }
    .booking-hero-title {
      font-size: clamp(18px, 5.2vw, 24px) !important;
      line-height: 1.25 !important;
      margin-bottom: 6px !important;
    }
    .booking-hero-desc {
      font-size: 12px !important;
      line-height: 1.55 !important;
    }
    .booking-main-container {
      padding: 14px 12px 56px !important;
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
const THAI_DAY_NAMES_LONG = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์']
export const LINE_ADMIN_URL = 'https://line.me/R/ti/p/@sofunclub'

function pad2(n) { return String(n).padStart(2, '0') }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

export function getGameDurationHours(game) {
  if (!game) return 4
  if (typeof game.duration === 'number' && game.duration > 0) return game.duration
  const timeStr = String(game.time || game.duration || '')
  if (timeStr) {
    const rangeMatch = timeStr.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/)
    if (rangeMatch) {
      return parseFloat(rangeMatch[2]) || parseFloat(rangeMatch[1]) || 4
    }
    const singleMatch = timeStr.match(/(\d+(?:\.\d+)?)/)
    if (singleMatch) {
      return parseFloat(singleMatch[1]) || 4
    }
  }
  return 4
}

export function getBookingTimeRange(booking, matchedGame) {
  if (!booking?.time) {
    return {
      startTime: '',
      endTime: '',
      display: 'รอระบุเวลา',
      durationText: ''
    }
  }

  const startTime = String(booking.time).trim()
  const [hStr, mStr] = startTime.split(':')
  const startH = parseInt(hStr, 10)
  const startM = parseInt(mStr || '0', 10)

  if (isNaN(startH)) {
    return {
      startTime,
      endTime: '',
      display: `${startTime} น.`,
      durationText: ''
    }
  }

  let durationHours = 4
  let durationLabel = '4 ชม.'

  const gameTimeStr = matchedGame?.time || matchedGame?.duration || ''
  if (booking.duration && typeof booking.duration === 'number') {
    durationHours = booking.duration
    durationLabel = `${durationHours} ชม.`
  } else if (gameTimeStr) {
    const rangeMatch = String(gameTimeStr).match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/)
    if (rangeMatch) {
      const minH = parseFloat(rangeMatch[1])
      const maxH = parseFloat(rangeMatch[2])
      durationHours = maxH || minH || 4
      durationLabel = `${rangeMatch[1]}-${rangeMatch[2]} ชม.`
    } else {
      const singleMatch = String(gameTimeStr).match(/(\d+(?:\.\d+)?)/)
      if (singleMatch) {
        durationHours = parseFloat(singleMatch[1])
        durationLabel = `${durationHours} ชม.`
      }
    }
  }

  const totalStartMinutes = startH * 60 + startM
  const totalEndMinutes = Math.round(totalStartMinutes + durationHours * 60)
  const endH = Math.floor(totalEndMinutes / 60) % 24
  const endM = totalEndMinutes % 60
  const endTime = `${pad2(endH)}:${pad2(endM)}`

  return {
    startTime,
    endTime,
    display: `${startTime} - ${endTime} น.`,
    durationText: durationLabel ? `(ประมาณ ${durationLabel})` : ''
  }
}
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
    : ((booking.members?.filter(m => m.paidDeposit).length || 0) + (booking.paidEmptySeats?.length || 0))

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
  const paid = (b.members?.filter(m => m.paidDeposit).length || 0) + (b.paidEmptySeats?.length || 0)
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
  const timeStr = b.time ? ` - ${b.time}` : ''

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
          {!isNarrow && (
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
          )}

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
                  padding: isNarrow ? '8px 2px' : '10px 2px',
                  textAlign: 'center',
                  fontSize: isNarrow ? '11.5px' : '11px',
                  fontWeight: 800,
                  color: headerColor,
                  letterSpacing: '0.02em',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '1px',
                }}
              >
                <span>{isNarrow ? DAY_NAMES[i] : d}</span>
                {!isNarrow && (
                  <span style={{ fontSize: '9px', opacity: 0.65, fontWeight: 700 }}>
                    {DAY_NAMES[i]}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Calendar cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, idx) => {
            const cellHeight = isNarrow ? (useBarMode ? '56px' : '88px') : (useBarMode ? '72px' : '108px')
            const col = idx % 7
            const isSun = col === 0
            const isSat = col === 6
            const isLastCol = col === 6
            const isLastRow = idx >= cells.length - 7

            const borderRight = isLastCol ? 'none' : '1px solid #f1f5f9'
            const borderBottom = isLastRow ? 'none' : '1px solid #f1f5f9'

            if (!day) {
              return (
                <div key={`e-${idx}`} style={{ height: cellHeight, background: '#f8fafc', borderRight, borderBottom }} />
              )
            }

            const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
            const dayBookings = bookingsByDate[dateStr] || []
            const dayBookingsSorted = dayBookings.slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''))
            const isToday = todayStr === dateStr
            const isSel = activeDateStr === dateStr
            const isPast = dateStr < todayStr

            const cellBg = isSel
              ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.05)'
              : isToday
                ? 'rgba(245, 158, 11, 0.03)'
                : isPast
                  ? '#fcfcfd'
                  : '#ffffff'

            return (
              <div
                key={day}
                onClick={() => onDayClick(dateStr)}
                style={{
                  height: cellHeight,
                  overflow: 'hidden',
                  padding: isNarrow ? '5px 2px 3px' : '8px 6px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isNarrow ? 'center' : 'stretch',
                  justifyContent: 'flex-start',
                  gap: isNarrow ? '2px' : '3px',
                  cursor: 'pointer',
                  background: cellBg,
                  borderRight,
                  borderBottom,
                  transition: 'background 0.12s',
                  position: 'relative',
                  boxShadow: 'none',
                }}
                onMouseEnter={e => { if (!isSel && !isToday) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.025)' }}
                onMouseLeave={e => e.currentTarget.style.background = cellBg}
              >
                {isNarrow ? (
                  <>
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 800,
                        flexShrink: 0,
                        color: isToday
                          ? '#ffffff'
                          : isSel
                            ? '#ffffff'
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
                            ? 'var(--curtain-crimson, #e50914)'
                            : 'transparent',
                        boxShadow: (isToday || isSel) ? '0 2px 6px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.35)' : 'none',
                      }}
                    >
                      {day}
                    </span>

                    {/* Booking indicator dots on mobile */}
                    {dayBookingsSorted.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '2.5px',
                          marginTop: '2px',
                        }}
                      >
                        {dayBookingsSorted.slice(0, 3).map(b => {
                          const rc = ROOM_COLORS[b.room] || '#64748b'
                          return (
                            <span
                              key={b.id}
                              style={{
                                width: '4.5px',
                                height: '4.5px',
                                borderRadius: '50%',
                                background: rc,
                                flexShrink: 0,
                                display: 'inline-block',
                              }}
                            />
                          )
                        })}
                        {dayBookingsSorted.length > 3 && (
                          <span style={{ fontSize: '8px', fontWeight: 800, color: '#64748b', lineHeight: 1 }}>
                            +
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
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
                          color: (isToday || isSel)
                            ? '#ffffff'
                            : isSun
                              ? 'var(--curtain-crimson, #e50914)'
                              : isSat
                                ? '#2563eb'
                                : isPast
                                  ? '#94a3b8'
                                  : '#1e293b',
                          background: (isToday || isSel)
                            ? 'var(--curtain-crimson, #e50914)'
                            : 'transparent',
                          boxShadow: (isToday || isSel) ? '0 2px 6px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.35)' : 'none',
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
                  </>
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
          flexDirection: 'column',
          gap: '12px',
          padding: isNarrow ? '14px 16px' : '16px 20px',
          borderRadius: '16px',
          background: '#ffffff',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: activeDateStr === todayStr ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)' : '#f1f5f9',
                color: activeDateStr === todayStr ? 'var(--curtain-crimson, #e50914)' : '#4b5563',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                flexShrink: 0,
              }}
            >
              <i className={activeDateStr === todayStr ? 'fas fa-star' : 'far fa-calendar-check'} />
            </div>
            <div style={{ minWidth: 0 }}>
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
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {selectedDayBookings.length > 0 ? 'แตะรอบเล่นเพื่อดูรายละเอียด' : 'ยังไม่มีรอบเล่นในวันนี้ - สามารถเปิดตี้แรกได้เลย'}
              </div>
            </div>
          </div>
        </div>

        {selectedDayBookings.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
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
                    padding: '6px 12px',
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
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#111827' }}>{b.room || 'ห้องเล่น'}</span>
                  {locked && (
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      <i className="fas fa-lock" style={{ fontSize: '8px' }} />ล็อก
                    </span>
                  )}
                  {b.time && <span style={{ fontSize: '11.5px', color: rc, fontWeight: 800 }}>{b.time} น.</span>}
                  {canView && publicName && <span style={{ fontSize: '11px', color: '#64748b' }}>({publicName})</span>}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          {selectedDayBookings.length > 0 && (
            <button
              type="button"
              onClick={() => onDayClick?.(activeDateStr)}
              style={{
                flex: '1 1 160px',
                height: '42px',
                borderRadius: '12px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#1e293b',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
              onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
            >
              <i className="fas fa-list-ul" style={{ fontSize: '11.5px', color: 'var(--curtain-crimson, #e50914)' }} />
              <span>ดูตารางรอบวันนี้ ({selectedDayBookings.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onBookToday?.(activeDateStr)}
            className="nfx-btn-primary"
            style={{
              flex: '1 1 160px',
              height: '42px',
              borderRadius: '12px',
              background: 'var(--curtain-crimson, #e50914)',
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.28)',
            }}
          >
            <i className="fas fa-plus" style={{ fontSize: '11px' }} />
            <span>{selectedDayBookings.length > 0 ? 'จองรอบเพิ่ม' : `จองรอบวันที่ ${fmtDate(activeDateStr)}`}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Day Schedule Detail Modal (Calendar Date Click Popup) ──────────────────────
function DayScheduleModal({
  date,
  bookings = [],
  allGames = [],
  lineUser,
  onClose,
  onOpenBooking,
  onStartBooking,
  showToast,
}) {
  if (!date) return null

  const dayBookings = bookings
    .filter(b => b.date === date && b.status !== 'cancelled' && b.status !== 'collapsed')
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  const dateObj = new Date(date + 'T00:00:00')
  const dow = !isNaN(dateObj.getTime()) ? THAI_DAY_NAMES_LONG[dateObj.getDay()] : ''
  const thaiFullDate = dow ? `${dow}ที่ ${fmtDate(date)}` : fmtDate(date)

  const todayStr = toDateStr(new Date())
  const twoDaysLaterStr = toDateStr(new Date(Date.now() + 2 * 86400000))
  const isToday = date === todayStr
  const isPast = date < todayStr
  const isLessThan2Days = date < twoDaysLaterStr

  return (
    <div
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(10px, 3vh, 24px) 14px',
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(8px)',
        boxSizing: 'border-box',
        overscrollBehavior: 'contain',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: 'min(90dvh, 760px)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '22px',
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          fontFamily: 'Sarabun, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px 14px',
            borderBottom: '1px solid #f1f5f9',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: isToday ? '#ffffff' : 'var(--curtain-crimson, #e50914)',
                  background: isToday ? 'var(--curtain-crimson, #e50914)' : 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                }}
              >
                <i className="far fa-calendar-alt" style={{ fontSize: '10px' }} />
                {isToday ? 'วันนี้' : dow || 'รอบเล่น'}
              </span>
              {dayBookings.length > 0 ? (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#15803d',
                    background: '#dcfce7',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {dayBookings.length} รอบเล่น
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#64748b',
                    background: '#f1f5f9',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                >
                  ยังไม่มีการจอง
                </span>
              )}
            </div>

            <h2
              style={{
                fontSize: 'clamp(17px, 4vw, 21px)',
                fontWeight: 900,
                color: '#111827',
                lineHeight: 1.25,
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              {thaiFullDate}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
              {dayBookings.length > 0
                ? 'ตารางเกมที่จองและรอบเวลาการเล่นในวันนี้'
                : 'ห้องเล่นทุกห้องยังว่าง สามารถเปิดตี้แรกได้เลย'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="ปิดหน้าต่าง"
            style={{
              width: '34px',
              height: '34px',
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

        {/* Scrollable Body */}
        <div
          style={{
            overflowY: 'auto',
            flex: '1 1 0%',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: '#fafafa',
            boxSizing: 'border-box',
          }}
        >
          {dayBookings.length > 0 ? (
            dayBookings.map(b => {
              const matchedGame = allGames.find(g => g.id === b.gameId || g._id === b.gameId)
              const timeInfo = getBookingTimeRange(b, matchedGame)
              const rc = ROOM_COLORS[b.room] || '#64748b'
              const locked = isRoomLocked(b)
              const canView = canViewBookingDetail(b, lineUser)
              const publicName = getPublicGameName(b, lineUser)
              const maxMembers = matchedGame ? parseGamePlayerCount(matchedGame) : (b.maxMembers || 6)
              const currentMembers = b.members?.length || 0
              const isLeader = b.leaderId === lineUser?.uid
              const isMember = b.members?.some(m => m.uid === lineUser?.uid || m.id === lineUser?.uid)
              const imgSrc = (!locked || canView) && b.gameImage ? convertImg(b.gameImage, 300) : null

              return (
                <div
                  key={b.id}
                  onClick={() => {
                    if (!canView) {
                      showToast?.('ห้องนี้ถูกล็อกแล้ว เฉพาะสมาชิกในตี้หรือแอดมินเท่านั้นที่สามารถดูรายละเอียดได้', 'warning')
                      return
                    }
                    onOpenBooking(b)
                  }}
                  style={{
                    background: '#ffffff',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    cursor: canView ? 'pointer' : 'default',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                    transition: 'all 0.18s ease',
                  }}
                >
                  {/* Top bar inside card */}
                  <div
                    style={{
                      padding: '8px 12px',
                      background: '#f8fafc',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: rc, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#111827' }}>
                        {b.room || 'ห้องเล่น'}
                      </span>
                      {locked && (
                        <span
                          style={{
                            fontSize: '9.5px',
                            fontWeight: 700,
                            color: '#b91c1c',
                            background: '#fee2e2',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <i className="fas fa-lock" style={{ fontSize: '8px' }} />
                          ล็อกห้อง
                        </span>
                      )}
                    </div>

                    <StatusBadge
                      status={locked ? 'locked' : b.status}
                      label={locked && !canView ? 'ล็อกห้องแล้ว' : undefined}
                    />
                  </div>

                  {/* Middle content row */}
                  <div style={{ padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {/* Thumbnail */}
                    <div
                      style={{
                        width: '64px',
                        height: '80px',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        background: '#111827',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
                      }}
                    >
                      {imgSrc ? (
                        <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <i className={locked && !canView ? 'fas fa-lock' : 'fas fa-scroll'} style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '18px' }} />
                      )}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: rc }} />
                    </div>

                    {/* Details */}
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ fontSize: '14.5px', fontWeight: 900, color: '#111827', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {publicName}
                      </div>

                      {/* Play Time: Start to End */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          width: 'fit-content',
                          maxWidth: '100%',
                        }}
                      >
                        <i className="fas fa-clock" style={{ color: '#d97706', fontSize: '11px', flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#92400e', whiteSpace: 'nowrap' }}>
                          {timeInfo.display}
                        </span>
                        {timeInfo.durationText && (
                          <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#b45309', whiteSpace: 'nowrap' }}>
                            {timeInfo.durationText}
                          </span>
                        )}
                      </div>

                      {/* Members count & Role */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11.5px', color: '#4b5563', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <i className="fas fa-users" style={{ fontSize: '10px', color: '#64748b' }} />
                          สมาชิก {currentMembers} / {maxMembers} คน
                        </span>
                        {isLeader && (
                          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#e50914', background: 'rgba(229, 9, 20, 0.08)', padding: '1px 6px', borderRadius: '4px' }}>
                            หัวหน้าตี้
                          </span>
                        )}
                        {isMember && !isLeader && (
                          <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#2563eb', background: 'rgba(37, 99, 235, 0.08)', padding: '1px 6px', borderRadius: '4px' }}>
                            สมาชิก
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action inside card */}
                  <div
                    style={{
                      padding: '8px 12px',
                      background: '#f8fafc',
                      borderTop: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {canView ? 'แตะการ์ดเพื่อดูรายละเอียดและสมาชิก' : 'ห้องถูกล็อก เฉพาะสมาชิกในตี้'}
                    </span>

                    {canView ? (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          onOpenBooking(b)
                        }}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '8px',
                          background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',
                          border: '1px solid rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.2)',
                          color: 'var(--curtain-crimson, #e50914)',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>ดูรายละเอียดตี้</span>
                        <i className="fas fa-arrow-right" style={{ fontSize: '9.5px' }} />
                      </button>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                        <i className="fas fa-lock" style={{ marginRight: '4px' }} />ล็อกแล้ว
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div
              style={{
                padding: '36px 16px',
                textAlign: 'center',
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px dashed #cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.08)',
                  color: 'var(--curtain-crimson, #e50914)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  marginBottom: '4px',
                }}
              >
                <i className="far fa-calendar-check" />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#111827' }}>
                ยังไม่มีการจองรอบเล่นในวันนี้
              </div>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', maxWidth: '300px', lineHeight: 1.6 }}>
                ห้องเล่นทุกห้องยังว่าง สามารถเปิดตี้แรกเพื่อชวนเพื่อนๆ หรือสมาชิกคนอื่นมาร่วมไขปริศนาได้เลย
              </p>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div
          style={{
            padding: '12px 18px',
            background: '#ffffff',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {isPast ? (
            <div
              style={{
                textAlign: 'center',
                fontSize: '12px',
                color: '#94a3b8',
                fontWeight: 700,
                padding: '6px',
              }}
            >
              <i className="fas fa-history" style={{ marginRight: '4px' }} />
              วันที่ผ่านมาแล้ว ไม่สามารถจองรอบย้อนหลังได้
            </div>
          ) : isLessThan2Days ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  fontSize: '11.5px',
                  color: '#991b1b',
                  background: '#fef2f2',
                  border: '1px solid #fee2e2',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fas fa-info-circle" style={{ color: 'var(--curtain-crimson, #e50914)', fontSize: '12px', flexShrink: 0 }} />
                <span>กำหนดให้จองล่วงหน้าอย่างน้อย 2 วัน (หากต้องการจองด่วน หรือเล่นรอบดึก กรุณาติดต่อแอดมิน)</span>
              </div>
              <a
                href={LINE_ADMIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: '100%',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#06c755',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 3px 10px rgba(6, 199, 85, 0.25)',
                }}
              >
                <i className="fab fa-line" style={{ fontSize: '15px' }} />
                <span>ติดต่อแอดมินทาง LINE เพื่อจองด่วน / รอบดึก</span>
              </a>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onStartBooking(date)}
              className="nfx-btn-primary"
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '12px',
                background: 'var(--curtain-crimson, #e50914)',
                border: 'none',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.28)',
              }}
            >
              <i className="fas fa-plus" style={{ fontSize: '11.5px' }} />
              <span>
                {dayBookings.length > 0 ? 'จองรอบเพิ่มในวันนี้' : 'เปิดตี้ / จองรอบวันนี้'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Netflix Clean White Booking Card Component ────────────────────────────────
function BookingCard({ booking, allGames = [], lineUser, onOpen, onCloseBooking }) {
  const matchedGame = allGames?.find(g => g.id === booking.gameId || g._id === booking.gameId)
  const paidCount = booking.members?.filter(m => m.paidDeposit).length || 0
  const total = booking.members?.length || 0
  const max = matchedGame ? parseGamePlayerCount(matchedGame) : (booking.maxMembers || total || 1)
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
export function getGamePlayerRange(g) {
  if (!g) return { min: 6, max: 6 }
  const s = String(g.players || '').trim()
  if (s) {
    const nums = s.match(/\d+/g)?.map(Number) || []
    if (nums.length === 1) return { min: nums[0], max: nums[0] }
    if (nums.length > 1) return { min: Math.min(...nums), max: Math.max(...nums) }
  }
  if (Array.isArray(g.characters) && g.characters.length > 0) {
    return { min: g.characters.length, max: g.characters.length }
  }
  return { min: 6, max: 6 }
}

// ── Create Booking Modal ───────────────────────────────────────────────────────
function CreateBookingModal({
  allGames = [],
  bookings = [],
  lineUser,
  onLogin,
  onClose,
  onSuccess,
  showToast,
  defaultDate = '',
  defaultGameId = '',
  defaultTime = '',
  defaultRoom = '',
}) {
  const twoDaysLaterStr = toDateStr(new Date(Date.now() + 2 * 86400000))
  const [selectedDate, setSelectedDate] = useState(() => {
    if (defaultDate && defaultDate >= twoDaysLaterStr) return defaultDate
    return twoDaysLaterStr
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

  const [showTermsModal, setShowTermsModal] = useState(false)
  const [showConfirmRulesModal, setShowConfirmRulesModal] = useState(false)

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

  const selectedGameDuration = getGameDurationHours(selectedGame)

  const sameGameBookings = activeDateBookings.filter(b =>
    (selectedGame?.id && (b.gameId === selectedGame.id || b.gameId === selectedGame._id)) ||
    (selectedGame?.title && b.gameName === selectedGame.title)
  )

  const checkSlotGameConflict = (slotTime) => {
    if (!slotTime || !sameGameBookings.length) return null
    const [sh, sm] = slotTime.split(':').map(Number)
    const slotStartMin = sh * 60 + (sm || 0)
    const slotEndMin = slotStartMin + selectedGameDuration * 60

    for (const b of sameGameBookings) {
      if (!b.time) continue
      const [bh, bm] = b.time.split(':').map(Number)
      const bStartMin = bh * 60 + (bm || 0)
      const bMatched = allGames.find(g => g.id === b.gameId || g._id === b.gameId) || selectedGame
      const bDuration = getGameDurationHours(bMatched)
      const bEndMin = bStartMin + bDuration * 60

      if (slotStartMin < bEndMin && bStartMin < slotEndMin) {
        const endH = Math.floor(bEndMin / 60) % 24
        const endM = bEndMin % 60
        const bEndTimeStr = `${pad2(endH)}:${pad2(endM)}`
        return {
          booking: b,
          timeRange: `${b.time} - ${bEndTimeStr} น.`,
          start: b.time,
          end: bEndTimeStr,
        }
      }
    }
    return null
  }

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

  const handleSubmit = () => {
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
    if (selectedDate < twoDaysLaterStr) {
      showToast('กำหนดให้จองล่วงหน้าอย่างน้อย 2 วัน หากต้องการจองด่วนหรือเล่นรอบดึก กรุณาติดต่อแอดมิน', 'error')
      return
    }
    const conflict = checkSlotGameConflict(finalTime)
    if (conflict) {
      showToast(`เกม "${selectedGame.title}" มีรอบเล่นอยู่แล้วช่วง ${conflict.timeRange} กรุณาเลือกรอบเวลาอื่น`, 'error')
      return
    }
    if (lockedSlotIds.has(selectedGame.id)) {
      showToast('เกมนี้ถูกล็อกในวันเวลานี้แล้ว กรุณาเลือกวันหรือเวลาอื่น', 'error')
      return
    }

    setShowTermsModal(true)
  }

  const executeBookingSubmit = async () => {
    setShowConfirmRulesModal(false)
    setShowTermsModal(false)
    setSubmitting(true)
    try {
      const maxMembers = parseGamePlayerCount(selectedGame)
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
          isLeader: true,
          role: 'leader',
          joinedAt: new Date().toISOString(),
        }],
        maxMembers,
        depositAmount: selectedGame.deposit || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      showToast('สร้างการจองสำเร็จ! รอแอดมินยืนยันรอบ', 'success')
      onSuccess?.()
      onClose?.()
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
                      {parseGamePlayerCount(selectedGame)} คน · มัดจำ ฿{selectedGame.deposit || 0}/คน
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
                  min={twoDaysLaterStr}
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: '#fef2f2',
                    border: '1px solid #fee2e2',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#991b1b', fontWeight: 600 }}>
                    <i className="fas fa-info-circle" style={{ color: C, fontSize: '12px', flexShrink: 0 }} />
                    <span>กำหนดให้จองล่วงหน้าอย่างน้อย 2 วัน (หากต้องการจองด่วน หรือเล่นรอบดึก กรุณาติดต่อแอดมิน)</span>
                  </div>
                  <a
                    href={LINE_ADMIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 12px',
                      borderRadius: '8px',
                      background: '#06c755',
                      color: '#ffffff',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      textDecoration: 'none',
                      flexShrink: 0,
                      boxShadow: '0 2px 6px rgba(6, 199, 85, 0.25)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <i className="fab fa-line" style={{ fontSize: '13px' }} />
                    <span>ติดต่อแอดมินทาง LINE</span>
                  </a>
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
                    const conflict = checkSlotGameConflict(t)
                    const isBlocked = !!conflict

                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={isBlocked}
                        onClick={() => {
                          if (isBlocked) {
                            showToast(`เกม "${selectedGame?.title}" มีรอบเล่นอยู่แล้วช่วง ${conflict.timeRange} กรุณาเลือกรอบเวลาอื่น`, 'warning')
                            return
                          }
                          setSelectedTime(t)
                        }}
                        title={isBlocked ? `เกม "${selectedGame?.title}" มีรอบเล่นอยู่ช่วง ${conflict.timeRange}` : undefined}
                        style={{
                          height: '56px',
                          borderRadius: '12px',
                          background: isBlocked ? '#f1f5f9' : isActive ? C : '#f8fafc',
                          color: isBlocked ? '#94a3b8' : isActive ? '#ffffff' : INK,
                          border: `1.5px solid ${isBlocked ? '#e2e8f0' : isActive ? C : count > 0 ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.25)' : 'rgba(0, 0, 0, 0.08)'}`,
                          boxShadow: isActive && !isBlocked ? '0 6px 16px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.3)' : 'none',
                          cursor: isBlocked ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                          opacity: isBlocked ? 0.65 : 1,
                          padding: '2px 4px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span style={{ fontSize: '13.5px', fontWeight: 800 }}>{t}</span>
                        {isBlocked ? (
                          <span style={{ fontSize: '8.5px', fontWeight: 700, color: '#dc2626', marginTop: '1px', textAlign: 'center', lineHeight: 1.1 }}>
                            เล่นอยู่ ({conflict.start}-{conflict.end})
                          </span>
                        ) : count > 0 ? (
                          <span style={{ fontSize: '9.5px', fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.85)' : C, marginTop: '2px' }}>
                            {count} จอง
                          </span>
                        ) : null}
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

        {/* Terms Modal (Step 1) */}
        {showTermsModal && (
          <div
            onClick={e => e.target === e.currentTarget && setShowTermsModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
              background: 'rgba(0, 0, 0, 0.72)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '460px',
                maxHeight: 'min(90dvh, 680px)',
                background: '#ffffff',
                borderRadius: '20px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.35)',
                fontFamily: 'Sarabun, sans-serif',
              }}
            >
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.1)', color: 'var(--curtain-crimson, #e50914)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                    <i className="fas fa-shield-alt" />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#111827' }}>
                    เงื่อนไขและกติกาการจอง
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#f3f4f6', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '10px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#111827' }}>{selectedGame?.title}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{fmtDate(selectedDate)} เวลา {finalTime} น.</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>มัดจำ</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--curtain-crimson, #e50914)' }}>฿{selectedGame?.deposit || 0}/คน</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', lineHeight: 1.55, color: '#334155' }}>
                    <i className="fas fa-money-bill-wave" style={{ color: 'var(--curtain-crimson, #e50914)', fontSize: '13px', marginTop: '3px', flexShrink: 0 }} />
                    <div>
                      <strong style={{ color: '#111827' }}>1. การยืนยันและการโอนมัดจำ:</strong> หลังกดส่งคำขอ เมื่อแอดมินตรวจสอบตารางห้องและอนุมัติรอบแล้ว สมาชิกทุกคนจะต้องโอนเงินมัดจำภายในเวลาที่กำหนด เพื่อรักษาสิทธิ์และล็อกห้องถาวร
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', lineHeight: 1.55, color: '#334155' }}>
                    <i className="fas fa-ban" style={{ color: '#dc2626', fontSize: '13px', marginTop: '3px', flexShrink: 0 }} />
                    <div>
                      <strong style={{ color: '#991b1b' }}>2. นโยบายเงินมัดจำ:</strong> เงินมัดจำไม่สามารถขอรับเงินคืนหรือโอนสิทธิ์ได้ทุกกรณี หากยกเลิกการเล่นหรือไม่มาตามวันเวลานัดหมาย
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', lineHeight: 1.55, color: '#334155' }}>
                    <i className="fas fa-clock" style={{ color: '#f59e0b', fontSize: '13px', marginTop: '3px', flexShrink: 0 }} />
                    <div>
                      <strong style={{ color: '#111827' }}>3. เวลาการมาถึง:</strong> กรุณาเดินทางมาถึงก่อนเวลาเริ่มเล่นอย่างน้อย 10 - 15 นาที เพื่อรับฟังคำแนะนำ สวมบทบาท และรับเอกสารคดี
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', lineHeight: 1.55, color: '#334155' }}>
                    <i className="fas fa-users-slash" style={{ color: '#64748b', fontSize: '13px', marginTop: '3px', flexShrink: 0 }} />
                    <div>
                      <strong style={{ color: '#111827' }}>4. การยุบตี้:</strong> หากสมาชิกไม่ครบตามขั้นต่ำและไม่มีการชำระมัดจำภายในเวลาที่กำหนด ระบบจะทำการยกเลิกตี้โดยอัตโนมัติ
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  style={{ flex: 1, height: '42px', borderRadius: '10px', background: '#f3f4f6', border: 'none', color: '#4b5563', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTermsModal(false)
                    setShowConfirmRulesModal(true)
                  }}
                  className="nfx-btn-primary"
                  style={{ flex: 2, height: '42px', borderRadius: '10px', background: 'var(--curtain-crimson, #e50914)', border: 'none', color: '#ffffff', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                >
                  ยอมรับเงื่อนไขและดำเนินการต่อ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Rules Double Check Modal (Step 2) */}
        {showConfirmRulesModal && (
          <div
            onClick={e => e.target === e.currentTarget && setShowConfirmRulesModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1250,
              background: 'rgba(0, 0, 0, 0.72)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '420px',
                background: '#ffffff',
                borderRadius: '20px',
                padding: '24px 22px 20px',
                boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '14px',
                fontFamily: 'Sarabun, sans-serif',
              }}
            >
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  background: 'rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.1)',
                  color: 'var(--curtain-crimson, #e50914)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                }}
              >
                <i className="fas fa-clipboard-check" />
              </div>

              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 900, color: '#111827' }}>
                  ทบทวนความเข้าใจในกฎการจอง
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#4b5563', lineHeight: 1.6 }}>
                  คุณได้อ่านและเข้าใจกฎระเบียบครบถ้วนเรียบร้อยแล้วใช่หรือไม่? หากมีข้อสงสัยหรือติดปัญหาเรื่องเวลา สามารถทักแอดมินก่อนได้เลยครับ
                </p>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                <a
                  href={LINE_ADMIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: '100%',
                    height: '44px',
                    borderRadius: '12px',
                    background: '#06c755',
                    color: '#ffffff',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 3px 10px rgba(6, 199, 85, 0.25)',
                  }}
                >
                  <i className="fab fa-line" style={{ fontSize: '16px' }} />
                  <span>ทักสอบถามแอดมินทาง LINE</span>
                </a>

                <button
                  type="button"
                  onClick={executeBookingSubmit}
                  disabled={submitting}
                  className="nfx-btn-primary"
                  style={{
                    width: '100%',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'var(--curtain-crimson, #e50914)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    cursor: submitting ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(var(--curtain-crimson-rgb, 229, 9, 20), 0.28)',
                  }}
                >
                  {submitting ? (
                    <span>กำลังบันทึกการจอง...</span>
                  ) : (
                    <>
                      <i className="fas fa-check" />
                      <span>อ่านครบถ้วนแล้ว ยืนยันการจอง</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmRulesModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    padding: '6px',
                  }}
                >
                  ย้อนกลับ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


// ── Deposit Payment & Slip Modal (Minimalist Netflix White & Red) ──────────────
function DepositPaymentModal({ booking, allGames = [], lineUser, onClose, showToast, onUpdated, memberProfiles = {} }) {
  const [internalProfiles, setInternalProfiles] = useState({})

  useEffect(() => {
    if (Object.keys(memberProfiles).length > 0) return
    let cancelled = false
    const uids = (booking?.members || []).map(m => m.uid || m.id).filter(Boolean)
    if (uids.length === 0) return
    Promise.all(
      uids.map(async uid => {
        try {
          const snap = await getDoc(doc(db, 'users', uid))
          return { uid, data: snap.exists() ? snap.data() : null }
        } catch {
          return { uid, data: null }
        }
      })
    ).then(res => {
      if (cancelled) return
      const map = {}
      res.forEach(r => { if (r.data) map[r.uid] = r.data })
      setInternalProfiles(map)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [booking?.members, memberProfiles])

  const profilesMap = Object.keys(memberProfiles).length > 0 ? memberProfiles : internalProfiles

  const [promptPayPhone, setPromptPayPhone] = useState('')
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [step, setStep] = useState('select') // 'select' | 'terms' | 'qr' | 'upload' | 'done'
  const [showTermsConfirm, setShowTermsConfirm] = useState(false)
  const [slipFile, setSlipFile] = useState(null)
  const [slipPreview, setSlipPreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)

  // Dynamically resolve current game to guarantee maxMembers & posterSrc are always accurate
  const [matchedGame, setMatchedGame] = useState(() => {
    if (booking?.gameId && Array.isArray(allGames) && allGames.length > 0) {
      return allGames.find(g => g.id === booking.gameId || g._id === booking.gameId) || null
    }
    return null
  })

  useEffect(() => {
    if (matchedGame || !booking?.gameId) return
    getDoc(doc(db, 'scripts', booking.gameId)).then(snap => {
      if (snap.exists()) {
        setMatchedGame({ id: snap.id, ...snap.data() })
      }
    }).catch(() => {})
  }, [booking?.gameId, matchedGame])

  const maxMembers = matchedGame ? parseGamePlayerCount(matchedGame) : (booking.maxMembers || 6)
  const depositPerPerson = booking.depositAmount || 0

  const myMember = booking.members?.find(m => m.uid === lineUser?.uid || m.id === lineUser?.uid)
  const isMyMemberFullyPaid = myMember?.paidDeposit && (!myMember?.depositOwed || myMember?.depositOwed <= 0)
  const isMyMemberPaid = isMyMemberFullyPaid
  const myMemberUid = lineUser?.uid || ''

  const totalMembers = booking.members?.length || 0
  const emptySeatCount = Math.max(0, maxMembers - totalMembers)

  // Unpaid or owing deposit delta from game change
  const unpaidMembers = (booking.members || []).filter(m => {
    const isFullyPaid = m.paidDeposit && (!m.depositOwed || m.depositOwed <= 0)
    return !isFullyPaid && m.slipStatus !== 'pending_verification'
  })
  const availableEmptySeats = []
  for (let i = 0; i < emptySeatCount; i++) {
    const seatNum = totalMembers + i + 1
    const alreadyPaid = booking.paidEmptySeats?.some(s => s.seatIndex === seatNum)
    if (!alreadyPaid) {
      availableEmptySeats.push(seatNum)
    }
  }

  // สุ่มเศษสตางค์ระหว่าง .01 ถึง .49 เพื่อป้องกันการใช้สลิปเดิมหลอกระบบ
  const generateRandomSatang = () => (Math.floor(Math.random() * 49) + 1) / 100
  const [randomSatang, setRandomSatang] = useState(generateRandomSatang)

  // Pre-select current user by default if unpaid or owes difference
  const [selectedMembers, setSelectedMembers] = useState(() => {
    if (!isMyMemberPaid && myMemberUid) {
      return [myMemberUid]
    }
    return []
  })
  const [selectedEmptySeats, setSelectedEmptySeats] = useState([])

  const getMemberAmountDue = useCallback((m) => {
    if (m && m.depositOwed && m.depositOwed > 0) {
      return Number(m.depositOwed)
    }
    return depositPerPerson
  }, [depositPerPerson])

  const selectedCount = selectedMembers.length + selectedEmptySeats.length
  const baseDepositAmount = [
    ...selectedMembers.map(uid => {
      const m = (booking.members || []).find(x => (x.uid || x.id) === uid)
      return getMemberAmountDue(m)
    }),
    ...selectedEmptySeats.map(() => depositPerPerson)
  ].reduce((sum, v) => sum + v, 0)
  const totalAmount = baseDepositAmount
  // ยอดโอนจริงที่สุ่มเศษสตางค์ (.01 - .49) เพื่อป้องกันการใช้สลิปเดิมหลอกระบบ
  const totalPayAmount = baseDepositAmount > 0 ? Number((baseDepositAmount + randomSatang).toFixed(2)) : 0
  const amount = totalPayAmount

  // Prevent background scrolling / rubber-banding on mobile while modal is open
  useEffect(() => {
    const origOverflow = document.body.style.overflow
    const origTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    return () => {
      document.body.style.overflow = origOverflow
      document.body.style.touchAction = origTouchAction
    }
  }, [])

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

  const qrPayload = promptPayPhone && totalPayAmount > 0 ? buildPromptPayQR(promptPayPhone, totalPayAmount) : ''

  const toggleMember = (uid) => {
    setSelectedMembers(prev =>
      prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]
    )
  }

  const toggleEmptySeat = (seatNum) => {
    setSelectedEmptySeats(prev =>
      prev.includes(seatNum) ? prev.filter(x => x !== seatNum) : [...prev, seatNum]
    )
  }

  const selectSelfOnly = () => {
    if (!isMyMemberPaid && myMemberUid) {
      setSelectedMembers([myMemberUid])
    } else {
      setSelectedMembers([])
    }
    setSelectedEmptySeats([])
  }

  const selectAllParty = () => {
    const allUnpaidUids = unpaidMembers.map(m => m.uid || m.id)
    setSelectedMembers(allUnpaidUids)
    setSelectedEmptySeats([])
  }

  const selectAllToLock = () => {
    const allUnpaidUids = unpaidMembers.map(m => m.uid || m.id)
    setSelectedMembers(allUnpaidUids)
    setSelectedEmptySeats([...availableEmptySeats])
  }

  const saveQR = () => {
    const canvas = document.getElementById('dp-deposit-qr-canvas')
    if (!canvas) { showToast('ไม่พบรูป QR', 'error'); return }
    try {
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `promptpay-${totalPayAmount.toFixed(2)}-${booking.id}.png`
      a.click()
      showToast('บันทึก QR แล้ว')
    } catch (e) {
      showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error')
    }
  }

  const copyPhone = () => {
    if (!promptPayPhone) return
    try {
      navigator.clipboard.writeText(promptPayPhone)
      setCopiedPhone(true)
      showToast('คัดลอกหมายเลขพร้อมเพย์แล้ว')
      setTimeout(() => setCopiedPhone(false), 2000)
    } catch {
      showToast('คัดลอกหมายเลขพร้อมเพย์แล้ว')
    }
  }

  const formattedPhone = promptPayPhone.length === 10
    ? promptPayPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
    : (promptPayPhone.length === 13 ? promptPayPhone.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5') : promptPayPhone)

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
    if (totalPayAmount <= 0) {
      showToast('กรุณาเลือกที่นั่งอย่างน้อย 1 ที่นั่งเพื่อชำระมัดจำ', 'error')
      return
    }
    setUploading(true)
    try {
      // 1. Direct EasySlip check on client (bypasses Firebase Storage & Cloud Functions)
      const res = await verifySlipDirect(slipFile, totalPayAmount, { isDeposit: true })

      if (res.code === 'WRONG_RECEIVER') {
        showToast(res.msg || 'สลิปโอนไปยังบัญชีอื่น - กรุณาตรวจสอบและโอนใหม่', 'error')
        return
      }

      if (res.code === 'AMOUNT_MISMATCH' || res.data?.error?.code === 'AMOUNT_MISMATCH') {
        showToast(`ยอดเงินในสลิปไม่ตรงกับยอดที่ระบบกำหนด (ต้องโอน ฿${totalPayAmount.toFixed(2)})`, 'error')
        return
      }

      const verified = !!res.success
      const slipUrl = res.slipThumbnail || ''
      const verifyData = res.verifyData ? {
        slipTransRef: res.verifyData.transRef || '',
        slipBank: res.verifyData.bank || '',
        slipAmount: totalPayAmount,
      } : { slipAmount: totalPayAmount }

      // 2. Update booking in Firestore
      const bRef = doc(db, 'bookings', booking.id)
      const snap = await getDoc(bRef)
      if (!snap.exists()) throw new Error('ไม่พบการจอง')
      const data = snap.data()
      const nowIso = new Date().toISOString()
      const payerName = lineUser?.displayName || lineUser?.name || 'สมาชิก'

      const updatedMembers = (data.members || []).map(m => {
        const uid = m.uid || m.id
        if (selectedMembers.includes(uid)) {
          const owed = Number(m.depositOwed) || 0
          const currentPaid = Number(m.depositPaidAmount) || (m.paidDeposit ? (data.depositAmount || 0) : 0)
          const newPaidAmount = owed > 0 ? (currentPaid + owed) : (Number(data.depositAmount) || currentPaid || 0)
          return {
            ...m,
            slipUrl,
            slipSubmittedAt: nowIso,
            paidBy: payerName,
            paidByUid: lineUser?.uid || '',
            ...(verified
              ? {
                  paidDeposit: true,
                  depositPaidAmount: newPaidAmount,
                  depositOwed: 0,
                  depositOverpaid: 0,
                  cashierDiscount: 0,
                  paidAt: nowIso,
                  slipStatus: 'verified',
                  ...verifyData
                }
              : { slipStatus: 'pending_verification' })
          }
        }
        return m
      })

      const existingPaidEmpty = data.paidEmptySeats || []
      const newPaidEmptySeats = [
        ...existingPaidEmpty.filter(s => !selectedEmptySeats.includes(s.seatIndex)),
        ...selectedEmptySeats.map(seatIndex => ({
          seatIndex,
          paidBy: payerName,
          paidByUid: lineUser?.uid || '',
          paidAt: nowIso,
          slipUrl,
          verified: !!verified,
          slipStatus: verified ? 'verified' : 'pending_verification',
          ...verifyData,
        }))
      ]

      const payload = {
        members: updatedMembers,
        paidEmptySeats: newPaidEmptySeats,
        updatedAt: serverTimestamp(),
      }

      if (verified) {
        payload.depositDeadline = calculateDepositDeadline({
          ...data,
          members: updatedMembers,
          paidEmptySeats: newPaidEmptySeats,
        })
        const totalPaidCount = updatedMembers.filter(m => m.paidDeposit).length + newPaidEmptySeats.filter(s => s.verified !== false).length
        const max = data.maxMembers || 6
        if (totalPaidCount >= max && data.status === 'confirmed') {
          payload.status = 'locked'
        }
      }

      await updateDoc(bRef, payload)

      if (verified) showToast('EasySlip ยืนยันสำเร็จ ยอดมัดจำถูกบันทึกแล้ว')
      else if (res.code === 'QR_NOT_FOUND') showToast('บันทึกสลิปแล้ว - รอแอดมินยืนยัน (อ่าน QR ไม่สำเร็จ)')
      else showToast('ส่งสลิปสำเร็จ - รอแอดมินตรวจสอบ')

      setStep('done')
      onUpdated?.()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const STEPS = ['select', 'terms', 'qr', 'upload', 'done']
  const stepIndex = Math.max(0, STEPS.indexOf(step))

  const getStepTitle = () => {
    switch (step) {
      case 'select': return 'เลือกรายการชำระมัดจำ'
      case 'terms': return 'เงื่อนไขการชำระมัดจำ'
      case 'qr': return 'ชำระเงินมัดจำ'
      case 'upload': return 'ตรวจสอบสลิป'
      case 'done': return 'ส่งสลิปสำเร็จ'
      default: return 'ชำระเงินมัดจำ'
    }
  }
  const getStepDesc = () => {
    switch (step) {
      case 'select': return 'เลือกจ่ายเฉพาะของตัวเอง จ่ายให้เพื่อน หรือเหมาจ่ายล็อกห้อง'
      case 'terms': return 'โปรดอ่านข้อตกลงและเงื่อนไขการตรวจสอบสลิป'
      case 'qr': return 'สแกน QR PromptPay เพื่อยืนยันการจอง'
      case 'upload': return 'ตรวจความถูกต้องก่อนส่งยืนยัน'
      case 'done': return 'ระบบได้รับสลิปเรียบร้อยแล้ว'
      default: return ''
    }
  }

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
        padding: 'clamp(8px, 2.5vh, 20px) 12px',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        overscrollBehavior: 'contain',
        touchAction: 'none',
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
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          position: 'relative',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {step !== 'select' && step !== 'done' && (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 'terms') setStep('select')
                    else if (step === 'qr') setStep('terms')
                    else if (step === 'upload') setStep('qr')
                  }}
                  style={{
                    height: 26,
                    padding: '0 8px',
                    borderRadius: 7,
                    background: '#F1F5F9',
                    color: '#475569',
                    border: '1px solid #E2E8F0',
                    fontSize: 10.5,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#E2E8F0'; e.currentTarget.style.color = '#0F172A' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#475569' }}
                  title="ย้อนกลับ"
                >
                  <i className="fas fa-chevron-left" style={{ fontSize: 9 }} />
                  <span>{step === 'terms' ? 'เลือกที่นั่ง' : (step === 'qr' ? 'เงื่อนไข' : 'QR Code')}</span>
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    style={{
                      height: 4,
                      width: i === stepIndex ? 22 : 10,
                      borderRadius: 2,
                      background: i <= stepIndex ? '#E50914' : '#E2E8F0',
                      transition: 'all 0.25s',
                    }}
                  />
                ))}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  color: '#E50914',
                  textTransform: 'uppercase',
                  marginLeft: 2,
                }}
              >
                ขั้นตอน {stepIndex + 1}/5
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
              {getStepTitle()}
            </h3>
            <p style={{ fontSize: 12, color: '#6B7280', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {getStepDesc()}
            </p>
          </div>
        </div>

        {/* ── STEP 0: Select Seats (จ่ายเฉพาะของตัวเอง / จ่ายให้เพื่อน / เหมาจ่ายล็อกห้อง) ── */}
        {step === 'select' && (() => {
          const hasMultipleUnpaid = unpaidMembers.length > 1
          const isSelfActive = !isMyMemberPaid && selectedMembers.length === 1 && selectedMembers[0] === myMemberUid && selectedEmptySeats.length === 0
          const isPartyActive = unpaidMembers.length > 0 && selectedMembers.length === unpaidMembers.length && selectedEmptySeats.length === 0 && !isSelfActive
          const isLockActive = availableEmptySeats.length > 0 && selectedMembers.length === unpaidMembers.length && selectedEmptySeats.length === availableEmptySeats.length
          const posterSrc = convertImg(matchedGame?.image || booking.gameImage, 140)

          return (
            <div
              style={{
                overflowY: 'auto',
                overflowX: 'hidden',
                flex: 1,
                padding: '16px 20px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                boxSizing: 'border-box',
              }}
            >
              {/* Cinematic Game Ticket Card */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  boxSizing: 'border-box',
                }}
              >
                {posterSrc ? (
                  <img
                    src={posterSrc}
                    alt={booking.gameName || ''}
                    referrerPolicy="no-referrer"
                    style={{
                      width: 48,
                      height: 60,
                      borderRadius: 8,
                      objectFit: 'cover',
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 60,
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #1E293B, #0F172A)',
                      color: '#94A3B8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    <i className="fas fa-masks-theater" />
                  </div>
                )}

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 800,
                      color: '#0F172A',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {booking.gameName || 'การจองสคริปต์'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    {booking.date && (
                      <span style={{ fontSize: 11, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <i className="fas fa-calendar-day" style={{ fontSize: 10, color: '#E50914' }} />
                        {fmtDate(booking.date)}
                      </span>
                    )}
                    {booking.time && (
                      <span style={{ fontSize: 11, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <i className="fas fa-clock" style={{ fontSize: 10, color: '#E50914' }} />
                        {booking.time} น.
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <i className="fas fa-users" style={{ fontSize: 10, color: '#64748B' }} />
                      {totalMembers}/{maxMembers} คน
                    </span>
                    <span style={{ fontSize: 11, color: '#0F172A', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <i className="fas fa-coins" style={{ fontSize: 10, color: '#E50914' }} />
                      มัดจำ ฿{depositPerPerson}/คน
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Action Preset Pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    ทางเลือกลัด
                  </span>
                  {selectedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => { setSelectedMembers([]); setSelectedEmptySeats([]) }}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 11,
                        color: '#64748B',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      ล้างที่เลือก
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!isMyMemberPaid && myMemberUid && (
                    <button
                      type="button"
                      onClick={selectSelfOnly}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: isSelfActive ? '#0F172A' : '#F1F5F9',
                        color: isSelfActive ? '#FFFFFF' : '#475569',
                        border: '1px solid ' + (isSelfActive ? '#0F172A' : '#E2E8F0'),
                        cursor: 'pointer',
                        boxShadow: isSelfActive ? '0 2px 6px rgba(15, 23, 42, 0.2)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      เฉพาะของฉัน (1 ที่)
                    </button>
                  )}

                  {hasMultipleUnpaid && (
                    <button
                      type="button"
                      onClick={selectAllParty}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: isPartyActive ? '#0F172A' : '#F1F5F9',
                        color: isPartyActive ? '#FFFFFF' : '#475569',
                        border: '1px solid ' + (isPartyActive ? '#0F172A' : '#E2E8F0'),
                        cursor: 'pointer',
                        boxShadow: isPartyActive ? '0 2px 6px rgba(15, 23, 42, 0.2)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isMyMemberPaid ? `เพื่อนในตี้ (${unpaidMembers.length} คน)` : `ทั้งตี้ (${unpaidMembers.length} คน)`}
                    </button>
                  )}

                  {availableEmptySeats.length > 0 && (
                    <button
                      type="button"
                      onClick={selectAllToLock}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: isLockActive ? '#059669' : '#ECFDF5',
                        color: isLockActive ? '#FFFFFF' : '#065F46',
                        border: '1px solid ' + (isLockActive ? '#059669' : '#A7F3D0'),
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        boxShadow: isLockActive ? '0 2px 6px rgba(5, 150, 105, 0.25)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <i className="fas fa-lock" style={{ fontSize: 9.5 }} />
                      <span>เหมาล็อกห้อง ({maxMembers} ที่)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Section 1: Members in Party */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A' }}>
                    สมาชิกในตี้
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '1px 7px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                    {booking.members?.length || 0} คน
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(booking.members || []).map((m, idx) => {
                    const mUid = m.uid || m.id
                    const isMe = mUid === myMemberUid
                    const isLeader = mUid === booking.leaderId
                    const isPaid = !!m.paidDeposit && (!m.depositOwed || m.depositOwed <= 0)
                    const owesDelta = !!m.paidDeposit && Number(m.depositOwed) > 0
                    const isPending = m.slipStatus === 'pending_verification' && !isPaid && !owesDelta
                    const isChecked = selectedMembers.includes(mUid)
                    const mProf = profilesMap[mUid]
                    const mAvatar = m.avatar || mProf?.pictureUrl || mProf?.avatar || ''
                    const mName = m.name || mProf?.nickname || mProf?.firstname || mProf?.name || 'สมาชิก'
                    const memDue = owesDelta ? Number(m.depositOwed) : depositPerPerson

                    if (isPaid) {
                      return (
                        <div
                          key={mUid || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 14,
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <MemberAvatar src={mAvatar} name={mName} size={36} />
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: -2,
                                  right: -2,
                                  width: 14,
                                  height: 14,
                                  borderRadius: '50%',
                                  background: '#10B981',
                                  color: '#ffffff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 7.5,
                                  border: '1.5px solid #ffffff',
                                }}
                              >
                                <i className="fas fa-check" />
                              </div>
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {mName}
                                </span>
                                {isMe && (
                                  <span style={{ fontSize: 9.5, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '1px 5px', borderRadius: 4, border: '1px solid #DBEAFE' }}>
                                    ตัวคุณ
                                  </span>
                                )}
                                {isLeader && (
                                  <span style={{ fontSize: 9, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '1px 5px', borderRadius: 4, border: '1px solid #FDE68A' }}>
                                    <i className="fas fa-crown" style={{ fontSize: 8, marginRight: 2 }} />หัวหน้า
                                  </span>
                                )}
                              </div>
                              {m.paidBy && (
                                <div style={{ fontSize: 10.5, color: '#059669', fontWeight: 600, marginTop: 1 }}>
                                  ชำระโดย {m.paidBy}
                                </div>
                              )}
                            </div>
                          </div>
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: '#DCFCE7', color: '#15803d', flexShrink: 0 }}>
                            จ่ายแล้ว
                          </span>
                        </div>
                      )
                    }

                    if (isPending) {
                      return (
                        <div
                          key={mUid || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 14,
                            background: '#FFFBEB',
                            border: '1px solid #FDE68A',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <MemberAvatar src={mAvatar} name={mName} size={36} />
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: -2,
                                  right: -2,
                                  width: 14,
                                  height: 14,
                                  borderRadius: '50%',
                                  background: '#F59E0B',
                                  color: '#ffffff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 7.5,
                                  border: '1.5px solid #ffffff',
                                }}
                              >
                                <i className="fas fa-clock" />
                              </div>
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {mName}
                                </span>
                                {isMe && (
                                  <span style={{ fontSize: 9.5, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '1px 5px', borderRadius: 4, border: '1px solid #DBEAFE' }}>
                                    ตัวคุณ
                                  </span>
                                )}
                                {isLeader && (
                                  <span style={{ fontSize: 9, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '1px 5px', borderRadius: 4, border: '1px solid #FDE68A' }}>
                                    <i className="fas fa-crown" style={{ fontSize: 8, marginRight: 2 }} />หัวหน้า
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: '#FEF3C7', color: '#B45309', flexShrink: 0 }}>
                            รอตรวจสลิป
                          </span>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={mUid || idx}
                        onClick={() => toggleMember(mUid)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 14,
                          background: isChecked ? '#FFF5F5' : '#FFFFFF',
                          border: isChecked ? '1.5px solid #E50914' : '1px solid #E2E8F0',
                          boxShadow: isChecked ? '0 2px 8px rgba(229, 9, 20, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          {/* iOS Circular Checkbox */}
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: isChecked ? '#E50914' : '#F8FAFC',
                              border: isChecked ? 'none' : '2px solid #CBD5E1',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 10,
                              flexShrink: 0,
                              transition: 'all 0.15s ease',
                              boxShadow: isChecked ? '0 2px 6px rgba(229, 9, 20, 0.3)' : 'none',
                            }}
                          >
                            {isChecked && <i className="fas fa-check" />}
                          </div>

                          <MemberAvatar src={mAvatar} name={mName} size={36} />

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {mName}
                              </span>
                              {isMe && (
                                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '1px 6px', borderRadius: 4, border: '1px solid #DBEAFE' }}>
                                  ตัวคุณ
                                </span>
                              )}
                              {isLeader && (
                                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '1px 6px', borderRadius: 4, border: '1px solid #FDE68A' }}>
                                  <i className="fas fa-crown" style={{ fontSize: 8.5, marginRight: 2 }} />หัวหน้า
                                </span>
                              )}
                              {owesDelta && (
                                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '1px 6px', borderRadius: 4, border: '1px solid #FECACA' }}>
                                  <i className="fas fa-exclamation-circle" style={{ fontSize: 8.5, marginRight: 2 }} />
                                  ค้างส่วนต่างมัดจำ
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: isChecked ? '#E50914' : '#334155' }}>
                            ฿{memDue.toLocaleString()}
                          </span>
                          {owesDelta && (
                            <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 600 }}>
                              (ส่วนต่างเกมใหม่)
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Section 2: Empty Seats (จ่ายเพิ่มเพื่อล็อกห้อง) */}
              {emptySeatCount > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A' }}>
                      ที่นั่งว่างเพื่อล็อกห้อง
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '1px 7px', borderRadius: 10, border: '1px solid #A7F3D0' }}>
                      ว่าง {emptySeatCount} ที่
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Array.from({ length: emptySeatCount }).map((_, i) => {
                      const seatNum = totalMembers + i + 1
                      const paidSeat = booking.paidEmptySeats?.find(s => s.seatIndex === seatNum)
                      const isChecked = selectedEmptySeats.includes(seatNum)

                      if (paidSeat) {
                        return (
                          <div
                            key={`empty-seat-paid-${seatNum}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              borderRadius: 14,
                              background: '#F0FDF4',
                              border: '1px solid #BBF7D0',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                                <i className="fas fa-lock" />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>
                                  ที่นั่งว่าง #{seatNum} <span style={{ fontSize: 11, fontWeight: 500 }}>(เหมาจ่ายล็อกห้องแล้ว)</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                                  ชำระโดย {paidSeat.paidBy || 'สมาชิก'}
                                </div>
                              </div>
                            </div>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: '#DCFCE7', color: '#15803d', flexShrink: 0 }}>
                              จ่ายแล้ว
                            </span>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={`empty-seat-select-${seatNum}`}
                          onClick={() => toggleEmptySeat(seatNum)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 14,
                            background: isChecked ? '#ECFDF5' : '#FFFFFF',
                            border: isChecked ? '1.5px solid #10B981' : '1px solid #E2E8F0',
                            boxShadow: isChecked ? '0 2px 8px rgba(16, 185, 129, 0.1)' : '0 1px 3px rgba(0,0,0,0.02)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            {/* iOS Circular Checkbox */}
                            <div
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                background: isChecked ? '#10B981' : '#F8FAFC',
                                border: isChecked ? 'none' : '2px solid #CBD5E1',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 10,
                                flexShrink: 0,
                                transition: 'all 0.15s ease',
                                boxShadow: isChecked ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                              }}
                            >
                              {isChecked && <i className="fas fa-check" />}
                            </div>

                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: isChecked ? '#D1FAE5' : '#F1F5F9',
                                color: isChecked ? '#059669' : '#64748B',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 13,
                                flexShrink: 0,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <i className="fas fa-chair" />
                            </div>

                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                                ที่นั่งว่าง #{seatNum}
                              </div>
                              <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <i className="fas fa-clock" style={{ fontSize: 9.5 }} />
                                + ขยายเวลาตี้ 3 วัน
                              </div>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: isChecked ? '#059669' : '#334155' }}>
                              ฿{depositPerPerson.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Summary & Continue Button */}
              <div
                style={{
                  marginTop: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  paddingTop: 12,
                  borderTop: '1px solid #F1F5F9',
                  background: '#FFFFFF',
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#F8FAFC',
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#64748B' }}>ที่นั่งที่เลือก:</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                      {selectedCount} ที่นั่ง
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: '#64748B', marginRight: 6 }}>ยอดมัดจำรวม:</span>
                    <strong style={{ fontSize: 18, color: '#E50914', fontWeight: 900 }}>
                      ฿{totalAmount.toLocaleString()}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={selectedCount === 0}
                  onClick={() => setStep('terms')}
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 14,
                    background: selectedCount > 0 ? 'linear-gradient(135deg, #E50914 0%, #B80710 100%)' : '#E2E8F0',
                    color: selectedCount > 0 ? '#FFFFFF' : '#94A3B8',
                    fontSize: 14,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    border: 'none',
                    cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
                    boxShadow: selectedCount > 0 ? '0 4px 14px rgba(229, 9, 20, 0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { if (selectedCount > 0) e.currentTarget.style.background = '#B80710' }}
                  onMouseLeave={e => { if (selectedCount > 0) e.currentTarget.style.background = 'linear-gradient(135deg, #E50914 0%, #B80710 100%)' }}
                >
                  <span>ดำเนินการต่อไปหน้าเงื่อนไข</span>
                  <i className="fas fa-arrow-right" style={{ fontSize: 12 }} />
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── STEP 1: Terms & Conditions ── */}
        {step === 'terms' && (
          <div
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: 1,
              padding: '16px 20px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxSizing: 'border-box',
            }}
          >
            {/* Cinematic Game Ticket Card */}
            {(() => {
              const posterSrc = convertImg(matchedGame?.image || booking.gameImage, 140)
              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 16,
                    background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    boxSizing: 'border-box',
                  }}
                >
                  {posterSrc ? (
                    <img
                      src={posterSrc}
                      alt={booking.gameName || ''}
                      referrerPolicy="no-referrer"
                      style={{
                        width: 50,
                        height: 66,
                        borderRadius: 10,
                        objectFit: 'cover',
                        flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 50,
                        height: 66,
                        borderRadius: 10,
                        background: 'linear-gradient(135deg, #1E293B, #0F172A)',
                        color: '#94A3B8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                        flexShrink: 0,
                      }}
                    >
                      <i className="fas fa-masks-theater" />
                    </div>
                  )}

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14.5,
                        fontWeight: 800,
                        color: '#0F172A',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {booking.gameName || 'การจองสคริปต์'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {booking.date && (
                        <span style={{ fontSize: 11, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <i className="fas fa-calendar-day" style={{ fontSize: 10, color: '#E50914' }} />
                          {fmtDate(booking.date)}
                        </span>
                      )}
                      {booking.time && (
                        <span style={{ fontSize: 11, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <i className="fas fa-clock" style={{ fontSize: 10, color: '#E50914' }} />
                          {booking.time} น.
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 3 }}>
                      ผู้ชำระ: <strong style={{ color: '#475569' }}>{lineUser?.displayName || lineUser?.name || 'คุณ'}</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                      flexShrink: 0,
                      background: '#FFFFFF',
                      padding: '7px 12px',
                      borderRadius: 12,
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      ยอดมัดจำรวม ({selectedCount} ที่)
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 900, color: '#E50914', lineHeight: 1.1, marginTop: 2 }}>
                      ฿{totalAmount.toLocaleString()}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* General Booking & Lock Rules */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 16,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800, color: '#0F172A' }}>
                <i className="fas fa-file-contract" style={{ color: '#E50914' }} />
                <span>เงื่อนไขการจองและล็อกห้อง</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                  <i className="fas fa-ban" style={{ color: '#E50914', fontSize: 11, marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#991B1B' }}>ไม่คืนเงินมัดจำ:</strong> เงินมัดจำไม่สามารถขอรับเงินคืนหรือโอนสิทธิ์ได้ทุกกรณี หากยกเลิกการเล่นหรือไม่มาตามนัดหมาย
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                  <i className="fas fa-calendar-plus" style={{ color: '#E50914', fontSize: 11, marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#0F172A' }}>ขยายเวลา +3 วัน/คน:</strong> ทุกครั้งที่สมาชิกชำระมัดจำ ระบบจะขยายเวลาให้ตี้อัตโนมัติ
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                  <i className="fas fa-lock" style={{ color: '#E50914', fontSize: 11, marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#0F172A' }}>ล็อกห้องอัตโนมัติ:</strong> เมื่อชำระมัดจำครบ {maxMembers} คน ระบบจะล็อกห้องถาวรทันที
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                  <i className="fas fa-clock" style={{ color: '#E50914', fontSize: 11, marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#0F172A' }}>กำหนดปิดรับ:</strong> ปิดรับชำระมัดจำไม่เกิน 24 ชั่วโมงก่อนวันเริ่มเล่นจริง
                  </div>
                </div>
              </div>
            </div>

            {/* CRITICAL SLIP UPLOAD EMPHASIS (ย้ำชัดเจนว่าต้องอัพสลิปเข้าเว็บนี้) */}
            <div
              style={{
                background: '#FFF5F5',
                border: '1.5px solid #FCA5A5',
                borderRadius: 16,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxShadow: '0 2px 10px rgba(220, 38, 38, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#DC2626', fontWeight: 900, fontSize: 12.5 }}>
                <i className="fas fa-triangle-exclamation" style={{ fontSize: 14, flexShrink: 0 }} />
                <span>ข้อควรระวัง: ต้องอัปโหลดสลิปเข้าเว็บนี้เพื่อตรวจยอด</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: '#7F1D1D', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <li>
                  <strong>ต้องนำสลิปมาแนบในเว็บนี้เท่านั้น:</strong> เมื่อโอนเงินผ่าน QR Code แล้ว ท่านต้องกดปุ่ม <em>"แนบสลิปที่นี่"</em> ในเว็บไซต์นี้ทันที เพื่อให้ระบบอัตโนมัติ (EasySlip) ตรวจสอบและยืนยันยอดเงิน
                </li>
                <li>
                  <strong>หากไม่แนบสลิปในเว็บ:</strong> ระบบจะไม่ทราบว่ามีการโอนเงิน จะไม่นับว่าจ่ายมัดจำ และจะไม่ล็อกห้องให้
                </li>
                <li>
                  <strong>รูปสลิปต้องชัดเจน:</strong> มี QR Code คมชัด ไม่ถูกครอบตัด เพื่อให้ระบบยืนยันได้รวดเร็ว
                </li>
              </ul>
            </div>

            {/* Bottom Agree Button */}
            <button
              type="button"
              onClick={() => setShowTermsConfirm(true)}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #E50914 0%, #B80710 100%)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(229, 9, 20, 0.35)',
                transition: 'all 0.15s',
                marginTop: 'auto',
                boxSizing: 'border-box',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 6px 22px rgba(229, 9, 20, 0.45)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.boxShadow = '0 4px 18px rgba(229, 9, 20, 0.35)'
              }}
            >
              <span>ตกลง / ยอมรับเงื่อนไข</span>
              <i className="fas fa-arrow-right" style={{ fontSize: 12, opacity: 0.85 }} />
            </button>
          </div>
        )}

        {/* Terms Confirmation Dialog (ย้ำว่าอ่านเงื่อนไขเรียบร้อยนะตกลงอีกครั้งเพื่อไปหน้า qrcode) */}
        {showTermsConfirm && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 50,
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 350,
                background: '#FFFFFF',
                borderRadius: 20,
                padding: '24px 22px',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 12,
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#FEF2F2',
                  border: '1.5px solid #FCA5A5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#E50914',
                  fontSize: 22,
                }}
              >
                <i className="fas fa-shield-alt" />
              </div>

              <div>
                <h4 style={{ fontSize: 16.5, fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
                  อ่านเงื่อนไขเรียบร้อยแล้วใช่ไหม?
                </h4>
                <p style={{ fontSize: 12, color: '#475569', margin: '8px 0 0', lineHeight: 1.55 }}>
                  ย้ำชัดเจนอีกครั้ง: เมื่อสแกนโอนเงินแล้ว <strong style={{ color: '#E50914' }}>ต้องอัปโหลดสลิปเข้าสู่เว็บไซต์นี้</strong> เพื่อให้ระบบตรวจสอบและยืนยันยอดเงิน หากไม่แนบสลิปจะไม่ถือว่าชำระมัดจำ
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    setRandomSatang(generateRandomSatang())
                    setShowTermsConfirm(false)
                    setStep('qr')
                  }}
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, #E50914 0%, #B80710 100%)',
                    color: '#ffffff',
                    fontSize: 13.5,
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 18px rgba(229, 9, 20, 0.35)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 6px 22px rgba(229, 9, 20, 0.45)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = '0 4px 18px rgba(229, 9, 20, 0.35)'
                  }}
                >
                  <i className="fas fa-qrcode" />
                  <span>ตกลงเพื่อไปหน้า QR Code</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTermsConfirm(false)}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 12,
                    background: '#F1F5F9',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 700,
                    border: '1px solid #E2E8F0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#F1F5F9'}
                >
                  <i className="fas fa-arrow-left" style={{ fontSize: 10 }} />
                  <span>กลับไปอ่านเงื่อนไข</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 1: QR Payment (Netflix Clean White VIP PromptPay Slip) ── */}
        {step === 'qr' && (
          <div
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: 1,
              padding: '16px 20px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxSizing: 'border-box',
            }}
          >
            {promptPayPhone ? (
              <>
                {/* Cinematic Game Ticket Card */}
                {(() => {
                  const posterSrc = convertImg(matchedGame?.image || booking.gameImage, 140)
                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 16,
                        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        boxSizing: 'border-box',
                      }}
                    >
                      {posterSrc ? (
                        <img
                          src={posterSrc}
                          alt={booking.gameName || ''}
                          referrerPolicy="no-referrer"
                          style={{
                            width: 50,
                            height: 66,
                            borderRadius: 10,
                            objectFit: 'cover',
                            flexShrink: 0,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 50,
                            height: 66,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #1E293B, #0F172A)',
                            color: '#94A3B8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 22,
                            flexShrink: 0,
                          }}
                        >
                          <i className="fas fa-masks-theater" />
                        </div>
                      )}

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14.5,
                            fontWeight: 800,
                            color: '#0F172A',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {booking.gameName || 'การจองสคริปต์'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          {booking.date && (
                            <span style={{ fontSize: 11, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <i className="fas fa-calendar-day" style={{ fontSize: 10, color: '#E50914' }} />
                              {fmtDate(booking.date)}
                            </span>
                          )}
                          {booking.time && (
                            <span style={{ fontSize: 11, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <i className="fas fa-clock" style={{ fontSize: 10, color: '#E50914' }} />
                              {booking.time} น.
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 3 }}>
                          ผู้ชำระ: <strong style={{ color: '#475569' }}>{lineUser?.displayName || lineUser?.name || 'คุณ'}</strong>
                        </div>
                      </div>

                      <div
                        style={{
                          textAlign: 'right',
                          flexShrink: 0,
                          background: '#FFFFFF',
                          padding: '7px 12px',
                          borderRadius: 12,
                          border: '1px solid #E2E8F0',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        }}
                      >
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                          ยอดมัดจำรวม ({selectedCount} ที่)
                        </div>
                        <div style={{ fontSize: 19, fontWeight: 900, color: '#E50914', lineHeight: 1.1, marginTop: 2 }}>
                          ฿{totalPayAmount.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 9.5, color: '#059669', fontWeight: 700, marginTop: 2 }}>
                          สุ่มเศษสตางค์ป้องกันสลิปซ้ำ
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* QR Showcase Card (PromptPay Clean VIP Card) */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '16px 14px',
                    borderRadius: 18,
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 18px rgba(0, 0, 0, 0.04)',
                    boxSizing: 'border-box',
                    gap: 12,
                  }}
                >
                  {/* Official PromptPay Header Badge */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '5px 16px',
                      borderRadius: 20,
                      background: 'linear-gradient(135deg, #003D6B 0%, #002244 100%)',
                      color: '#FFFFFF',
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      boxShadow: '0 2px 8px rgba(0, 61, 107, 0.25)',
                    }}
                  >
                    <i className="fas fa-qrcode" style={{ fontSize: 11, color: '#38BDF8' }} />
                    <span>PROMPTPAY · พร้อมเพย์</span>
                  </div>

                  {/* QR Canvas Box */}
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: '#FFFFFF',
                      border: '1.5px solid #F1F5F9',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.02)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <QRCodeCanvas
                      id="dp-deposit-qr-canvas"
                      value={qrPayload}
                      size={180}
                      bgColor="#ffffff"
                      fgColor="#0F172A"
                      level="M"
                      includeMargin={false}
                    />
                  </div>

                  {/* Account Name and Copyable PromptPay ID */}
                  <div style={{ textAlign: 'center', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14.5, fontWeight: 800, color: '#0F172A' }}>
                      <span>{accountName || 'กิตติพร กล้าหาญ'}</span>
                      <i className="fas fa-check-circle" style={{ color: '#10B981', fontSize: 12 }} title="บัญชีได้รับการยืนยัน" />
                    </div>

                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      {bankName ? bankName : 'บัญชีรับโอนมัดจำ SOFUN Club (สำหรับเทสระบบ)'}
                    </div>

                    {/* Copyable Phone Pill */}
                    <div
                      style={{
                        marginTop: 8,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '4px 6px 4px 12px',
                        borderRadius: 10,
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: '#0F172A',
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: '0.04em',
                        }}
                      >
                        {formattedPhone}
                      </span>

                      <button
                        type="button"
                        onClick={copyPhone}
                        style={{
                          height: 28,
                          padding: '0 9px',
                          borderRadius: 7,
                          border: '1px solid #CBD5E1',
                          background: copiedPhone ? '#DCFCE7' : '#FFFFFF',
                          color: copiedPhone ? '#166534' : '#334155',
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'all 0.15s',
                        }}
                        title="คัดลอกหมายเลขพร้อมเพย์"
                      >
                        <i className={copiedPhone ? "fas fa-check" : "fas fa-copy"} style={{ fontSize: 10, color: copiedPhone ? '#16A34A' : '#64748B' }} />
                        <span>{copiedPhone ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Save QR & Re-roll satang Button Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={saveQR}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        height: 34,
                        padding: '0 14px',
                        borderRadius: 10,
                        background: '#0F172A',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.12)',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#1E293B'}
                      onMouseLeave={e => e.currentTarget.style.background = '#0F172A'}
                    >
                      <i className="fas fa-arrow-down-to-line" style={{ fontSize: 11 }} />
                      <span>บันทึกรูป QR Code</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRandomSatang(generateRandomSatang())
                        showToast('สุ่มเศษสตางค์ใหม่เรียบร้อย')
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 10,
                        background: '#F8FAFC',
                        color: '#475569',
                        border: '1px solid #CBD5E1',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'}
                      onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}
                      title="สุ่มเศษสตางค์ใหม่เพื่อป้องกันสลิปซ้ำ"
                    >
                      <i className="fas fa-sync-alt" style={{ fontSize: 10.5 }} />
                      <span>สุ่มยอดใหม่</span>
                    </button>
                  </div>
                </div>

                {/* Minimal 3 Steps Flow Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 14px',
                    borderRadius: 12,
                    background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#FEF2F2', border: '1px solid #FECACA', color: '#E50914', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      1
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1E293B' }}>สแกน QR</span>
                  </div>

                  <i className="fas fa-chevron-right" style={{ fontSize: 9, color: '#CBD5E1' }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#FEF2F2', border: '1px solid #FECACA', color: '#E50914', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      2
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1E293B' }}>โอน ฿{totalPayAmount.toFixed(2)}</span>
                  </div>

                  <i className="fas fa-chevron-right" style={{ fontSize: 9, color: '#CBD5E1' }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#FEF2F2', border: '1px solid #FECACA', color: '#E50914', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      3
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1E293B' }}>แนบสลิป</span>
                  </div>
                </div>

                {/* Reassurance Notice */}
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      background: '#FEF3C7',
                      color: '#D97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 12,
                    }}
                  >
                    <i className="fas fa-shield-alt" />
                  </div>
                  <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.45 }}>
                    <strong style={{ color: '#78350F' }}>สำคัญมาก:</strong> โอนยอดตรงตามจุดทศนิยม <strong>฿{totalPayAmount.toFixed(2)}</strong> เพื่อให้ระบบ EasySlip ตรวจสอบและบันทึกยอดให้อัตโนมัติทันที
                  </div>
                </div>

                {/* Primary CTA Button (Netflix Red) */}
                <label
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, #E50914 0%, #B80710 100%)',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    boxShadow: '0 4px 18px rgba(229, 9, 20, 0.35)',
                    transition: 'all 0.15s',
                    boxSizing: 'border-box',
                    border: 'none',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 6px 22px rgba(229, 9, 20, 0.45)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = '0 4px 18px rgba(229, 9, 20, 0.35)'
                  }}
                >
                  <i className="fas fa-file-invoice-dollar" style={{ fontSize: 16 }} />
                  <span>โอนแล้ว · กดแนบสลิปที่นี่</span>
                  <i className="fas fa-arrow-right" style={{ fontSize: 11, opacity: 0.85 }} />
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
              padding: '16px 20px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxSizing: 'border-box',
            }}
          >
            {/* Slip Preview Frame */}
            <div
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                background: '#0F172A',
                border: '1px solid #E2E8F0',
                maxHeight: 280,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
              }}
            >
              {slipPreview ? (
                <img
                  src={slipPreview}
                  alt="สลิปโอนเงิน"
                  style={{ maxHeight: 280, width: 'auto', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ padding: 40, color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
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
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  transition: 'all 0.15s',
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
                padding: '12px 16px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                border: '1px solid #E2E8F0',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF2F2', color: '#E50914', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                  <i className="fas fa-receipt" />
                </div>
                <div>
                  <div style={{ color: '#0F172A', fontWeight: 800, fontSize: 13 }}>ยอดมัดจำที่ต้องตรวจสอบ</div>
                  <div style={{ color: '#64748B', fontSize: 11 }}>ตรวจสอบความถูกต้องก่อนกดส่งยืนยัน</div>
                </div>
              </div>
              <strong style={{ color: '#E50914', fontSize: 18, fontWeight: 900 }}>
                ฿{totalPayAmount.toFixed(2)}
              </strong>
            </div>

            {/* Action Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setStep('qr')}
                disabled={uploading}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  color: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: uploading ? 'wait' : 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
                title="ย้อนกลับไปดู QR Code"
              >
                <i className="fas fa-chevron-left" style={{ fontSize: 13 }} />
              </button>

              <button
                type="button"
                disabled={uploading}
                onClick={handleSubmit}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  background: uploading ? '#94A3B8' : 'linear-gradient(135deg, #E50914 0%, #B80710 100%)',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  border: 'none',
                  cursor: uploading ? 'wait' : 'pointer',
                  boxShadow: uploading ? 'none' : '0 4px 18px rgba(229, 9, 20, 0.35)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!uploading) e.currentTarget.style.background = '#B80710' }}
                onMouseLeave={e => { if (!uploading) e.currentTarget.style.background = 'linear-gradient(135deg, #E50914 0%, #B80710 100%)' }}
              >
                {uploading ? (
                  <span>กำลังส่งและตรวจสอบสลิป...</span>
                ) : (
                  <>
                    <i className="fas fa-paper-plane" style={{ fontSize: 13 }} />
                    <span>ยืนยันส่งสลิปเพื่อตรวจยอด</span>
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
              padding: '28px 22px 24px',
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
                width: 68,
                height: 68,
                borderRadius: '50%',
                background: '#F0FDF4',
                border: '2px solid #86EFAC',
                color: '#16A34A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                boxShadow: '0 8px 24px rgba(22, 163, 74, 0.2)',
              }}
            >
              <i className="fas fa-check" />
            </div>

            <div>
              <h4 style={{ fontSize: 20, fontWeight: 900, color: '#0F172A', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                ส่งสลิปมัดจำสำเร็จ
              </h4>
              <p style={{ fontSize: 12.5, color: '#64748B', margin: 0, lineHeight: 1.55, maxWidth: 300 }}>
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
                padding: '14px 16px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                border: '1px solid #E2E8F0',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: '#FEF2F2',
                  color: '#E50914',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 16,
                }}
              >
                <i className="fas fa-calendar-check" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {booking.gameName || 'การจอง'} ({selectedCount} ที่นั่ง)
                </div>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
                  {booking.date ? fmtDate(booking.date) : ''} {booking.time ? `· ${booking.time} น.` : ''} · ยอดรวม ฿{totalPayAmount.toFixed(2)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 14,
                background: '#0F172A',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginTop: 6,
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#1E293B'}
              onMouseLeave={e => e.currentTarget.style.background = '#0F172A'}
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


// ── Admin Manage Booking & Party Controller Modal (Netflix Cinema Style) ─────
export function AdminManageBookingModal({ booking, allGames = [], onClose, showToast, onUpdated, lineUser }) {
  const [activeTab, setActiveTab] = useState('game') // 'game' | 'members' | 'room' | 'status'
  const [status, setStatus] = useState(booking.status || 'confirmed')
  const [leaderId, setLeaderId] = useState(booking.leaderId || (booking.members?.[0]?.uid || booking.members?.[0]?.id || ''))
  const [selectedGameId, setSelectedGameId] = useState(booking.gameId || '')
  const [gameSearch, setGameSearch] = useState('')
  const [room, setRoom] = useState(booking.room || 'Chinese Room')
  const [date, setDate] = useState(booking.date || '')
  const [time, setTime] = useState(booking.time || '13:00')
  const [adminNote, setAdminNote] = useState(booking.adminNote || '')
  const [saving, setSaving] = useState(false)

  const originalOldDeposit = Number(booking.depositAmount) || 0

  // Matched new game
  const matchedNewGame = useMemo(() => {
    if (!selectedGameId || !Array.isArray(allGames)) return null
    return allGames.find(g => g.id === selectedGameId || g._id === selectedGameId) || null
  }, [selectedGameId, allGames])

  const newGameDeposit = matchedNewGame ? (Number(matchedNewGame.deposit) || 0) : originalOldDeposit
  const [customDeposit, setCustomDeposit] = useState(String(newGameDeposit))

  const effectiveDeposit = customDeposit !== '' && !isNaN(Number(customDeposit))
    ? Number(customDeposit)
    : newGameDeposit

  const resolvedMaxMembers = matchedNewGame ? parseGamePlayerCount(matchedNewGame) : (booking.maxMembers || 6)
  const [maxMembers, setMaxMembers] = useState(String(resolvedMaxMembers))

  // Members mutable state
  const [membersState, setMembersState] = useState(() => {
    return (booking.members || []).map(m => {
      const isPaid = !!m.paidDeposit
      const paidAmt = Number(m.depositPaidAmount) || (isPaid ? originalOldDeposit : 0)
      return {
        ...m,
        paidDeposit: isPaid,
        depositPaidAmount: paidAmt,
        depositOwed: Number(m.depositOwed) || 0,
        depositOverpaid: Number(m.depositOverpaid) || 0,
        cashierDiscount: Number(m.cashierDiscount) || 0,
        isLeader: (m.uid || m.id) === booking.leaderId,
      }
    })
  })

  // Prevent background scrolling while modal is open
  useEffect(() => {
    const origOverflow = document.body.style.overflow
    const origTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    return () => {
      document.body.style.overflow = origOverflow
      document.body.style.touchAction = origTouchAction
    }
  }, [])

  // Filtered games list for search
  const filteredGames = useMemo(() => {
    if (!Array.isArray(allGames)) return []
    if (!gameSearch.trim()) return allGames.slice(0, 30)
    const q = gameSearch.trim().toLowerCase()
    return allGames.filter(g =>
      (g.title || g.name || '').toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q)
    ).slice(0, 30)
  }, [allGames, gameSearch])

  // Recalculate financial impact for all members based on target deposit vs original paid amount
  const applyRecalculation = useCallback((targetDeposit) => {
    setMembersState(prev => prev.map(m => {
      if (m.paidDeposit) {
        const prevPaid = Number(m.depositPaidAmount) > 0 ? Number(m.depositPaidAmount) : originalOldDeposit
        if (targetDeposit > prevPaid) {
          const diff = targetDeposit - prevPaid
          return {
            ...m,
            depositPaidAmount: prevPaid,
            depositOwed: diff,
            depositOverpaid: 0,
            cashierDiscount: 0,
          }
        } else if (targetDeposit < prevPaid) {
          const over = prevPaid - targetDeposit
          return {
            ...m,
            depositPaidAmount: prevPaid,
            depositOwed: 0,
            depositOverpaid: over,
            cashierDiscount: over,
          }
        } else {
          return {
            ...m,
            depositPaidAmount: prevPaid,
            depositOwed: 0,
            depositOverpaid: 0,
            cashierDiscount: 0,
          }
        }
      } else {
        return {
          ...m,
          depositPaidAmount: 0,
          depositOwed: 0,
          depositOverpaid: 0,
          cashierDiscount: 0,
        }
      }
    }))
  }, [originalOldDeposit])

  // When game selection changes, auto-recalculate prices and update maxMembers
  const handleSelectGame = (game) => {
    setSelectedGameId(game.id)
    const gDep = Number(game.deposit) || 0
    setCustomDeposit(String(gDep))
    const gMax = parseGamePlayerCount(game)
    if (gMax) setMaxMembers(String(gMax))
    applyRecalculation(gDep)
  }

  // Toggle member paid
  const toggleMemberPaid = (uid) => {
    setMembersState(prev => prev.map(m => {
      if ((m.uid || m.id) === uid) {
        const nextPaid = !m.paidDeposit
        return {
          ...m,
          paidDeposit: nextPaid,
          depositPaidAmount: nextPaid ? effectiveDeposit : 0,
          depositOwed: 0,
          depositOverpaid: 0,
          cashierDiscount: 0,
        }
      }
      return m
    }))
  }

  // Clear owed difference (admin received cash/outside)
  const clearMemberOwed = (uid) => {
    setMembersState(prev => prev.map(m => {
      if ((m.uid || m.id) === uid) {
        return {
          ...m,
          paidDeposit: true,
          depositPaidAmount: (Number(m.depositPaidAmount) || 0) + (Number(m.depositOwed) || 0),
          depositOwed: 0,
        }
      }
      return m
    }))
    showToast('เคลียร์ยอดค้างชำระของสมาชิกแล้ว')
  }

  // Remove member from party
  const removeMember = (uid, name) => {
    if (!window.confirm(`ยืนยันการนำคุณ "${name}" ออกจากปาร์ตี้นี้หรือไม่?`)) return
    setMembersState(prev => prev.filter(m => (m.uid || m.id) !== uid))
    if (leaderId === uid) {
      const remaining = membersState.filter(m => (m.uid || m.id) !== uid)
      if (remaining.length > 0) setLeaderId(remaining[0].uid || remaining[0].id)
    }
    showToast(`นำ ${name} ออกจากตี้แล้ว`)
  }

  const priceDelta = effectiveDeposit - originalOldDeposit
  const paidCount = membersState.filter(m => m.paidDeposit).length
  const unpaidCount = membersState.filter(m => !m.paidDeposit).length
  const totalOwed = membersState.reduce((sum, m) => sum + (Number(m.depositOwed) || 0), 0)
  const totalDiscount = membersState.reduce((sum, m) => sum + (Number(m.cashierDiscount) || 0), 0)

  const handleSave = async () => {
    setSaving(true)
    try {
      const finalDeposit = Number(effectiveDeposit) || 0
      const finalMax = Number(maxMembers) || (matchedNewGame ? parseGamePlayerCount(matchedNewGame) : 6)
      const finalMembers = membersState.map(m => ({
        ...m,
        isLeader: (m.uid || m.id) === leaderId,
      }))

      const payload = {
        status,
        room,
        date,
        time,
        adminNote,
        leaderId,
        depositAmount: finalDeposit,
        maxMembers: finalMax,
        members: finalMembers,
        updatedAt: serverTimestamp(),
      }

      if (matchedNewGame) {
        payload.gameId = matchedNewGame.id
        payload.gameName = matchedNewGame.title || matchedNewGame.name || booking.gameName
        payload.gameImage = matchedNewGame.image || booking.gameImage || ''
      }

      if (status === 'confirmed') {
        payload.depositDeadline = calculateDepositDeadline({
          ...booking,
          ...payload,
          members: finalMembers,
        })
      }

      const bRef = doc(db, 'bookings', booking.id)
      await updateDoc(bRef, payload)
      showToast('บันทึกการจัดการปาร์ตี้เรียบร้อยแล้ว')
      if (onUpdated) onUpdated()
      onClose()
    } catch (err) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const STATUS_CONFIGS = [
    { id: 'confirmed', label: 'เปิดรับสมัคร (เปิดตี้)', icon: 'fa-door-open', bg: 'rgba(16, 185, 129, 0.15)', color: '#34D399', border: 'rgba(16, 185, 129, 0.4)' },
    { id: 'locked', label: 'ล็อกห้อง (ปิดรับคน)', icon: 'fa-lock', bg: 'rgba(37, 99, 235, 0.15)', color: '#60A5FA', border: 'rgba(37, 99, 235, 0.4)' },
    { id: 'collapsed', label: 'ปิดตี้ / ปาร์ตี้ล่ม', icon: 'fa-ban', bg: 'rgba(239, 68, 68, 0.15)', color: '#F87171', border: 'rgba(239, 68, 68, 0.4)' },
    { id: 'pending', label: 'รอยืนยัน', icon: 'fa-clock', bg: 'rgba(245, 158, 11, 0.15)', color: '#FBBF24', border: 'rgba(245, 158, 11, 0.4)' },
    { id: 'cancelled', label: 'ยกเลิกการจอง', icon: 'fa-times', bg: 'rgba(107, 114, 128, 0.15)', color: '#9CA3AF', border: 'rgba(107, 114, 128, 0.4)' },
  ]

  const heroPoster = convertImg(matchedNewGame?.image || booking.gameImage, 600)
  const roomColor = ROOM_COLORS[room] || '#E50914'

  const TABS = [
    { id: 'game', label: 'เปลี่ยนเกม & มัดจำ', icon: 'fa-film', badge: priceDelta !== 0 ? (priceDelta > 0 ? `+฿${priceDelta}` : `-฿${Math.abs(priceDelta)}`) : null },
    { id: 'members', label: 'สมาชิก & หัวหน้า', icon: 'fa-users', badge: `${membersState.length} คน` },
    { id: 'room', label: 'ห้อง & วันเวลา', icon: 'fa-door-open', badge: room ? room.split(' ')[0] : null },
    { id: 'status', label: 'สถานะปาร์ตี้', icon: 'fa-toggle-on', badge: status === 'confirmed' ? 'เปิด' : (status === 'locked' ? 'ล็อก' : 'ปิด') },
  ]

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(8px, 2.5vh, 20px) 12px',
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        overscrollBehavior: 'contain',
        touchAction: 'none',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: 'min(94dvh, 860px)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 22,
          overflow: 'hidden',
          background: '#141414',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          fontFamily: "'Sarabun', sans-serif",
          boxSizing: 'border-box',
          color: '#ffffff',
        }}
      >
        {/* ── 1. CINEMATIC NETFLIX BILLBOARD HEADER ── */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 125,
            background: '#111111',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Backdrop Image */}
          {heroPoster ? (
            <img
              src={heroPoster}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 25%',
                filter: 'brightness(0.45) saturate(1.2) blur(1px)',
                transform: 'scale(1.05)',
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

          {/* Ambient Room Glow */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(ellipse 70% 60% at 85% 20%, ${roomColor}40 0%, transparent 70%)`,
            }}
          />

          {/* Netflix Dark Vignette Overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(20,20,20,0.7) 40%, rgba(20,20,20,0.95) 85%, #141414 100%)',
            }}
          />

          {/* Top Bar: Admin Badge & Close Button */}
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 16,
              right: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  background: '#E50914',
                  color: '#ffffff',
                  padding: '3px 8px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                  boxShadow: '0 2px 8px rgba(229, 9, 20, 0.5)',
                }}
              >
                ADMIN CONTROLLER
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: 'rgba(255, 255, 255, 0.75)',
                  background: 'rgba(0, 0, 0, 0.55)',
                  backdropFilter: 'blur(6px)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                ID: {booking.id ? booking.id.slice(0, 8) : ''}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#E50914'
                e.currentTarget.style.borderColor = '#E50914'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.65)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
              }}
              title="ปิด"
            >
              <i className="fas fa-times" style={{ fontSize: 12 }} />
            </button>
          </div>

          {/* Billboard Title & Quick Tags */}
          <div
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 10,
              zIndex: 10,
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(17px, 3.8vw, 21px)',
                fontWeight: 900,
                color: '#ffffff',
                margin: '0 0 5px',
                lineHeight: 1.2,
                textShadow: '0 2px 10px rgba(0,0,0,0.9)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {matchedNewGame?.title || matchedNewGame?.name || booking.gameName || 'การจองห้อง'}
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: '#FFFFFF',
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: roomColor }} />
                {room}
              </span>

              {date && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: '#D1D5DB',
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <i className="fas fa-calendar-alt" style={{ color: '#E50914', fontSize: 9.5 }} />
                  {fmtDate(date)} · {time} น.
                </span>
              )}

              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: '#34D399',
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <i className="fas fa-coins" style={{ fontSize: 9.5 }} />
                มัดจำ ฿{effectiveDeposit}/คน
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. NETFLIX SEGMENTED TABS (EASY TO READ & SWITCH) ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            background: '#111111',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 13px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: isActive ? 800 : 600,
                  background: isActive ? '#E50914' : 'rgba(255, 255, 255, 0.06)',
                  color: isActive ? '#FFFFFF' : '#9CA3AF',
                  border: isActive ? '1px solid #E50914' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  boxShadow: isActive ? '0 2px 10px rgba(229, 9, 20, 0.45)' : 'none',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                <i className={`fas ${tab.icon}`} style={{ fontSize: 11 }} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: isActive ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.12)',
                      color: isActive ? '#FFFFFF' : '#D1D5DB',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── 3. TAB CONTENT BODY (NETFLIX DARK CINEMA) ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxSizing: 'border-box',
            background: '#141414',
          }}
        >
          {/* ═════ TAB 1: CHANGE GAME & PRICE RECALCULATION ═════ */}
          {activeTab === 'game' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Cinematic Game Comparison Banner */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#1A1A1A',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  การเปรียบเทียบราคา & มัดจำรอบนี้
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center' }}>
                  {/* Old Game */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 40,
                        height: 52,
                        borderRadius: 8,
                        background: '#262626',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {booking.gameImage ? (
                        <img src={convertImg(booking.gameImage, 100)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
                          <i className="fas fa-film" />
                        </div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>เกมเดิม</div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {booking.gameName || 'เกมเดิม'}
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                        มัดจำ <strong style={{ color: '#FFFFFF' }}>฿{originalOldDeposit}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Transition Arrow */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#E50914',
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    <i className="fas fa-arrow-right" />
                  </div>

                  {/* New Game */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 40,
                        height: 52,
                        borderRadius: 8,
                        background: '#262626',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: '1.5px solid #E50914',
                        boxShadow: '0 0 10px rgba(229, 9, 20, 0.3)',
                      }}
                    >
                      {matchedNewGame?.image ? (
                        <img src={convertImg(matchedNewGame.image, 100)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E50914' }}>
                          <i className="fas fa-dice" />
                        </div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: '#E50914', fontWeight: 700 }}>เกมใหม่</div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {matchedNewGame?.title || matchedNewGame?.name || booking.gameName}
                      </div>
                      <div style={{ fontSize: 11, color: '#34D399', marginTop: 1 }}>
                        มัดจำ <strong>฿{effectiveDeposit}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Delta Alert Card */}
                {priceDelta > 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      color: '#FDE68A',
                      fontSize: 11.5,
                      lineHeight: 1.5,
                      display: 'flex',
                      gap: 8,
                    }}
                  >
                    <i className="fas fa-exclamation-triangle" style={{ color: '#F59E0B', fontSize: 14, flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <strong style={{ color: '#FBBF24' }}>มัดจำเพิ่มขึ้น +฿{priceDelta} / คน:</strong> สมาชิกที่ชำระเกมเดิมแล้ว ({paidCount} คน) ต้องชำระเพิ่มคนละ <strong>฿{priceDelta}</strong> (รวมค้าง ฿{totalOwed}) ระบบตั้งยอดค้างชำระให้อัตโนมัติ ส่วนคนที่ยังไม่จ่าย ({unpaidCount} คน) จ่ายราคาใหม่ ฿{effectiveDeposit}
                    </div>
                  </div>
                )}

                {priceDelta < 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#A7F3D0',
                      fontSize: 11.5,
                      lineHeight: 1.5,
                      display: 'flex',
                      gap: 8,
                    }}
                  >
                    <i className="fas fa-gift" style={{ color: '#10B981', fontSize: 14, flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <strong style={{ color: '#34D399' }}>มัดจำลดลง -฿{Math.abs(priceDelta)} / คน:</strong> สมาชิกที่ชำระมัดจำเดิมแล้ว ({paidCount} คน) จะได้รับสิทธิ์เป็น <strong>ส่วนลดจากครึ่งหลังหน้าแคชเชียร์ ฿{Math.abs(priceDelta)}</strong> (รวมส่วนลด ฿{totalDiscount}) เมื่อเช็คบิลที่ร้าน ส่วนคนที่ยังไม่จ่าย ({unpaidCount} คน) จ่ายราคาใหม่ ฿{effectiveDeposit} ปกติ
                    </div>
                  </div>
                )}

                {priceDelta === 0 && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#9CA3AF',
                      fontSize: 11.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <i className="fas fa-check-circle" style={{ color: '#34D399' }} />
                    <span>ราคามัดจำเท่าเดิม (฿{effectiveDeposit} / คน) ไม่มียอดส่วนต่างเพิ่มเติม</span>
                  </div>
                )}
              </div>

              {/* Netflix Game Search Bar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#D1D5DB' }}>
                    เลือกเกมที่ต้องการเปลี่ยน (สคริปต์สืบคดี)
                  </span>
                  <span style={{ fontSize: 11, color: '#6B7280' }}>
                    แสดง {filteredGames.length} เกม
                  </span>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="พิมพ์ชื่อเกมเพื่อค้นหา..."
                    value={gameSearch}
                    onChange={e => setGameSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 36px 10px 14px',
                      borderRadius: 12,
                      background: '#1F1F1F',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#FFFFFF',
                      fontSize: 13,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = '#E50914'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'}
                  />
                  {gameSearch ? (
                    <button
                      type="button"
                      onClick={() => setGameSearch('')}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#9CA3AF',
                        cursor: 'pointer',
                        padding: 4,
                      }}
                    >
                      <i className="fas fa-times" />
                    </button>
                  ) : (
                    <i className="fas fa-search" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#6B7280', fontSize: 13 }} />
                  )}
                </div>
              </div>

              {/* Netflix Game Poster Carousel / List */}
              <div
                style={{
                  maxHeight: 250,
                  overflowY: 'auto',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 14,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  background: '#121212',
                }}
              >
                {filteredGames.map(g => {
                  const isCurrent = g.id === selectedGameId
                  const gDep = Number(g.deposit) || 0
                  const gPlayers = parseGamePlayerCount(g)
                  const gPoster = convertImg(g.image, 140)

                  return (
                    <div
                      key={g.id}
                      onClick={() => handleSelectGame(g)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 10,
                        background: isCurrent ? 'rgba(229, 9, 20, 0.15)' : '#1A1A1A',
                        border: isCurrent ? '1.5px solid #E50914' : '1px solid rgba(255, 255, 255, 0.06)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isCurrent ? '0 0 12px rgba(229, 9, 20, 0.3)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        {/* Poster Thumbnail */}
                        <div
                          style={{
                            width: 38,
                            height: 48,
                            borderRadius: 6,
                            background: '#262626',
                            overflow: 'hidden',
                            flexShrink: 0,
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                          }}
                        >
                          {gPoster ? (
                            <img src={gPoster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 12 }}>
                              <i className="fas fa-masks-theater" />
                            </div>
                          )}
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: isCurrent ? 800 : 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {g.title || g.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                            <span style={{ fontSize: 10.5, color: '#9CA3AF' }}>
                              <i className="fas fa-users" style={{ marginRight: 3, fontSize: 9.5 }} />
                              {gPlayers} คน
                            </span>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#F87171' }}>
                              มัดจำ ฿{gDep}/คน
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {isCurrent ? (
                          <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: '#E50914', color: '#ffffff' }}>
                            <i className="fas fa-check" style={{ marginRight: 3 }} /> เลือกอยู่
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#6B7280', padding: '3px 8px' }}>
                            แตะเพื่อเลือก
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Fine-Tuning Controls (Deposit & Max Members) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: '#1A1A1A',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9CA3AF', marginBottom: 4 }}>
                    ปรับยอดมัดจำต่อคน (฿)
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="number"
                      value={customDeposit}
                      onChange={e => {
                        setCustomDeposit(e.target.value)
                        if (!isNaN(Number(e.target.value))) {
                          applyRecalculation(Number(e.target.value))
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 8,
                        background: '#262626',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#FFFFFF',
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => applyRecalculation(effectiveDeposit)}
                      style={{
                        padding: '0 10px',
                        borderRadius: 8,
                        background: '#E50914',
                        border: 'none',
                        color: '#FFFFFF',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title="คำนวณส่วนต่างใหม่"
                    >
                      <i className="fas fa-calculator" />
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9CA3AF', marginBottom: 4 }}>
                    จำนวนผู้เล่นสูงสุด (คน)
                  </label>
                  <input
                    type="number"
                    value={maxMembers}
                    onChange={e => setMaxMembers(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: '#262626',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#FFFFFF',
                      fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ═════ TAB 2: TRANSFER LEADER & MANAGE MEMBERS ═════ */}
          {activeTab === 'members' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Leader Transfer Section */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#1A1A1A',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-crown" />
                    <span>ย้ายหัวหน้าปาร์ตี้ (Transfer Party Leader)</span>
                  </div>
                  <span style={{ fontSize: 10.5, color: '#9CA3AF' }}>แตะเพื่อแต่งตั้ง</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  {membersState.map((m, idx) => {
                    const mUid = m.uid || m.id
                    const isLead = mUid === leaderId
                    return (
                      <div
                        key={mUid || idx}
                        onClick={() => setLeaderId(mUid)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 10,
                          background: isLead ? 'rgba(245, 158, 11, 0.15)' : '#262626',
                          border: isLead ? '1.5px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.08)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isLead ? '0 0 10px rgba(245, 158, 11, 0.3)' : 'none',
                        }}
                      >
                        <MemberAvatar src={m.avatar || ''} name={m.name || 'สมาชิก'} size={32} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.name || 'สมาชิก'}
                          </div>
                          {isLead ? (
                            <span style={{ fontSize: 9.5, fontWeight: 800, color: '#FBBF24', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <i className="fas fa-crown" style={{ fontSize: 8 }} /> หัวหน้าตี้
                            </span>
                          ) : (
                            <span style={{ fontSize: 9.5, color: '#6B7280' }}>สมาชิก</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Members Financial & Removal List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#D1D5DB' }}>
                    สมาชิก & สถานะการเงิน ({membersState.length} คน)
                  </span>
                  <span style={{ fontSize: 11, color: '#34D399' }}>
                    ชำระแล้ว {paidCount} · ค้างชำระ {unpaidCount}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {membersState.map((m, idx) => {
                    const mUid = m.uid || m.id
                    const isLead = mUid === leaderId
                    const owes = Number(m.depositOwed) || 0
                    const over = Number(m.cashierDiscount) || Number(m.depositOverpaid) || 0

                    return (
                      <div
                        key={mUid || idx}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: '#1A1A1A',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <MemberAvatar src={m.avatar || ''} name={m.name || 'สมาชิก'} size={34} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {m.name || 'สมาชิก'}
                                </span>
                                {isLead && (
                                  <span style={{ fontSize: 9.5, fontWeight: 800, color: '#FBBF24', background: 'rgba(245, 158, 11, 0.2)', padding: '1px 5px', borderRadius: 4, border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                                    หัวหน้า
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                                ยอดชำระแล้ว: <strong style={{ color: '#FFFFFF' }}>฿{m.depositPaidAmount || 0}</strong>
                              </div>
                            </div>
                          </div>

                          {/* Financial Badges */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {owes > 0 && (
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#F87171', background: 'rgba(239, 68, 68, 0.15)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                                ค้างเพิ่ม ฿{owes}
                              </span>
                            )}
                            {over > 0 && (
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#34D399', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                                ลดแคชเชียร์ ฿{over}
                              </span>
                            )}
                            {m.paidDeposit && owes === 0 && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#34D399', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                                จ่ายครบแล้ว
                              </span>
                            )}
                            {!m.paidDeposit && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                ยังไม่จ่าย (฿{effectiveDeposit})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6, borderTop: '1px dashed rgba(255, 255, 255, 0.08)' }}>
                          <button
                            type="button"
                            onClick={() => toggleMemberPaid(mUid)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: m.paidDeposit ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                              color: m.paidDeposit ? '#F87171' : '#34D399',
                              border: m.paidDeposit ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {m.paidDeposit ? 'ปรับเป็นยังไม่จ่าย' : 'ปรับเป็นชำระแล้ว'}
                          </button>

                          {owes > 0 && (
                            <button
                              type="button"
                              onClick={() => clearMemberOwed(mUid)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: 'rgba(37, 99, 235, 0.15)',
                                color: '#60A5FA',
                                border: '1px solid rgba(37, 99, 235, 0.4)',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="เคลียร์ยอดค้างเมื่อรับเงินสดนอกระบบ"
                            >
                              <i className="fas fa-check" style={{ marginRight: 4 }} />
                              เคลียร์ยอดค้าง (รับเงินแล้ว)
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => removeMember(mUid, m.name || 'สมาชิก')}
                            style={{
                              marginLeft: 'auto',
                              padding: '4px 8px',
                              borderRadius: 6,
                              background: 'none',
                              border: 'none',
                              color: '#6B7280',
                              fontSize: 11,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#F87171'}
                            onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                            title="นำออกจากปาร์ตี้"
                          >
                            <i className="fas fa-trash-alt" />
                            <span>ลบ</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ═════ TAB 3: ROOM & SCHEDULE ═════ */}
          {activeTab === 'room' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Room Selection */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#1A1A1A',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: '#D1D5DB', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-door-open" style={{ color: '#E50914' }} />
                  <span>ห้องที่ต้องเล่น ({ALL_ROOMS.length} ห้อง)</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                  {ALL_ROOMS.map(r => {
                    const isSelected = room === r
                    const rCol = ROOM_COLORS[r] || '#64748B'
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRoom(r)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 10,
                          background: isSelected ? 'rgba(229, 9, 20, 0.18)' : '#262626',
                          border: isSelected ? '1.5px solid #E50914' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: '#FFFFFF',
                          fontSize: 11.5,
                          fontWeight: isSelected ? 800 : 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.15s ease',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: rCol, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Date & Time Slot Selection */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#1A1A1A',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#9CA3AF', marginBottom: 6 }}>
                    <i className="fas fa-calendar-day" style={{ marginRight: 6, color: '#E50914' }} />
                    วันที่เล่น
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      background: '#262626',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#FFFFFF',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#9CA3AF', marginBottom: 6 }}>
                    <i className="fas fa-clock" style={{ marginRight: 6, color: '#F59E0B' }} />
                    รอบเวลาเล่น
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {TIME_SLOTS.map(t => {
                      const isSelected = time === t
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTime(t)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 16,
                            fontSize: 11.5,
                            fontWeight: isSelected ? 800 : 600,
                            background: isSelected ? '#E50914' : '#262626',
                            color: '#FFFFFF',
                            border: isSelected ? '1px solid #E50914' : '1px solid rgba(255, 255, 255, 0.08)',
                            cursor: 'pointer',
                            boxShadow: isSelected ? '0 2px 8px rgba(229, 9, 20, 0.4)' : 'none',
                          }}
                        >
                          {t} น.
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═════ TAB 4: PARTY STATUS & ADMIN NOTE ═════ */}
          {activeTab === 'status' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Status Radio Cards */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#1A1A1A',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: '#D1D5DB' }}>
                  ปรับสถานะการจอง (เปิดตี้ / ปิดตี้ / ล็อกห้อง)
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {STATUS_CONFIGS.map(sc => {
                    const isSelected = status === sc.id
                    return (
                      <div
                        key={sc.id}
                        onClick={() => setStatus(sc.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 12,
                          background: isSelected ? sc.bg : '#262626',
                          border: isSelected ? `1.5px solid ${sc.color}` : '1px solid rgba(255, 255, 255, 0.06)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? `0 0 12px ${sc.color}30` : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 8,
                              background: isSelected ? sc.color : 'rgba(255, 255, 255, 0.08)',
                              color: isSelected ? '#FFFFFF' : '#9CA3AF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                            }}
                          >
                            <i className={`fas ${sc.icon}`} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: isSelected ? 800 : 700, color: isSelected ? sc.color : '#FFFFFF' }}>
                              {sc.label}
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <i className="fas fa-check-circle" style={{ color: sc.color, fontSize: 14 }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Admin Note Textarea */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#1A1A1A',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#D1D5DB' }}>
                  <i className="fas fa-sticky-note" style={{ marginRight: 6, color: '#A78BFA' }} />
                  โน้ตบันทึกจากแอดมิน (Admin Note)
                </label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="ระบุเหตุผล เช่น เปลี่ยนเกมตามคำขอผู้เล่น หรือโน้ตช่วยจำ..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#262626',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    fontSize: 12.5,
                    boxSizing: 'border-box',
                    fontFamily: "'Sarabun', sans-serif",
                    resize: 'none',
                    outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = '#E50914'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── 4. PINNED NETFLIX ACTION FOOTER ── */}
        <div
          style={{
            padding: '12px 20px',
            background: '#111111',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            สถานะ: <strong style={{ color: '#FFFFFF' }}>{STATUS_CONFIGS.find(s => s.id === status)?.label?.split(' ')[0]}</strong> · {matchedNewGame?.title || booking.gameName}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '9px 16px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#D1D5DB',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            >
              ยกเลิก
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '9px 22px',
                borderRadius: 10,
                background: '#E50914',
                color: '#FFFFFF',
                border: 'none',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: saving ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 16px rgba(229, 9, 20, 0.45)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#B80710'}
              onMouseLeave={e => e.currentTarget.style.background = '#E50914'}
            >
              {saving ? (
                <>
                  <i className="fas fa-spinner fa-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-save" />
                  <span>บันทึกการเปลี่ยนแปลง</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ── Booking Detail & Party Lounge Modal ───────────────────────────────────────
export function BookingDetailModal({ booking, allGames = [], lineUser, onClose, showToast, onUpdated }) {
  const openProfile = useOpenProfile()
  const [joining, setJoining] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [approvingUid, setApprovingUid] = useState(null)
  const [rejectingUid, setRejectingUid] = useState(null)
  const [showDepositPay, setShowDepositPay] = useState(false)
  const [showAdminManage, setShowAdminManage] = useState(false)

  // Dynamically resolve current game to guarantee maxMembers reflects latest game settings
  const [matchedGame, setMatchedGame] = useState(() => {
    if (booking?.gameId && Array.isArray(allGames) && allGames.length > 0) {
      return allGames.find(g => g.id === booking.gameId || g._id === booking.gameId) || null
    }
    return null
  })

  useEffect(() => {
    if (matchedGame || !booking?.gameId) return
    getDoc(doc(db, 'scripts', booking.gameId)).then(snap => {
      if (snap.exists()) {
        setMatchedGame({ id: snap.id, ...snap.data() })
      }
    }).catch(() => {})
  }, [booking?.gameId, matchedGame])

  const resolvedMaxMembers = matchedGame ? parseGamePlayerCount(matchedGame) : (booking.maxMembers || 6)
  const maxMembers = resolvedMaxMembers || 6

  // Auto-sync booking document in Firestore if game's player count was updated
  useEffect(() => {
    if (!booking?.id || !resolvedMaxMembers || booking.maxMembers === resolvedMaxMembers) return
    const bRef = doc(db, 'bookings', booking.id)
    const payload = { maxMembers: resolvedMaxMembers, updatedAt: serverTimestamp() }
    const paid = booking.members?.filter(m => m.paidDeposit).length || 0
    if (paid >= resolvedMaxMembers && booking.status === 'confirmed') {
      payload.status = 'locked'
    }
    updateDoc(bRef, payload).then(() => {
      if (onUpdated) onUpdated()
    }).catch(err => {
      console.warn('Auto-sync booking maxMembers failed:', err)
    })
  }, [booking?.id, booking?.maxMembers, resolvedMaxMembers, booking?.members, booking?.status, onUpdated])

  const total = booking.members?.length || 0
  const paidMembersCount = booking.members?.filter(m => m.paidDeposit).length || 0
  const paidEmptySeatsCount = booking.paidEmptySeats?.length || 0
  const paidCount = paidMembersCount + paidEmptySeatsCount
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

  // Lock body scroll while modal is active to prevent background shifting
  useEffect(() => {
    const origOverflow = document.body.style.overflow
    const origTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    return () => {
      document.body.style.overflow = origOverflow
      document.body.style.touchAction = origTouchAction
    }
  }, [])

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
          padding: 'clamp(8px, 2.5vh, 20px) 12px',
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          overscrollBehavior: 'contain',
          touchAction: 'none',
          boxSizing: 'border-box',
        }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: 'min(92dvh, 780px)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 20,
            overflow: 'hidden',
            background: '#ffffff',
            boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.08)',
            fontFamily: "'Sarabun', sans-serif",
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            boxSizing: 'border-box',
          }}
        >
          {/* ── 1. CINEMATIC NETFLIX BILLBOARD HEADER ── */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 'clamp(115px, 18vh, 150px)',
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

            {/* Admin Control Trigger (Top Left) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdminManage(true)}
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 12,
                  zIndex: 10,
                  height: 30,
                  padding: '0 12px',
                  borderRadius: 20,
                  background: 'rgba(229, 9, 20, 0.9)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#B80710'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(229, 9, 20, 0.9)'}
                title="จัดการปาร์ตี้อิสระสำหรับแอดมิน"
              >
                <i className="fas fa-user-shield" style={{ fontSize: 11 }} />
                <span>จัดการปาร์ตี้ (แอดมิน)</span>
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 10,
                right: 12,
                zIndex: 10,
                width: 30,
                height: 30,
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
              <i className="fas fa-times" style={{ fontSize: 12 }} />
            </button>

            {/* Billboard Content: Title & Metadata Chips */}
            <div
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: 12,
                zIndex: 10,
              }}
            >
              <h2
                style={{
                  fontSize: 'clamp(16px, 3.8vw, 20px)',
                  fontWeight: 900,
                  color: '#ffffff',
                  lineHeight: 1.2,
                  margin: '0 0 6px',
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                  wordBreak: 'break-word',
                }}
              >
                {booking.gameName || 'การจองห้อง'}
              </h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.95)',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                  }}
                >
                  <i className="fas fa-calendar-alt" style={{ color: '#E50914', fontSize: 9.5 }} />
                  {fmtDate(booking.date)}
                </span>

                {booking.time && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'rgba(255, 255, 255, 0.95)',
                      background: 'rgba(0, 0, 0, 0.5)',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                    }}
                  >
                    <i className="fas fa-clock" style={{ color: '#FBBF24', fontSize: 9.5 }} />
                    {booking.time} น.
                  </span>
                )}

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: '#34D399',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                  }}
                >
                  <i className="fas fa-coins" style={{ fontSize: 9.5 }} />
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
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: '#ffffff',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            {/* Admin Control Banner (Quick Entry) */}
            {isAdmin && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #18181B 0%, #0F172A 100%)',
                  border: '1px solid rgba(229, 9, 20, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: '#E50914',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    <i className="fas fa-user-shield" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>แผงควบคุมแอดมิน</div>
                    <div style={{ fontSize: 10.5, color: '#9CA3AF' }}>ย้ายหัวหน้าตี้, เปลี่ยนเกม, เปลี่ยนห้อง, คำนวณมัดจำ</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdminManage(true)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    background: '#E50914',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 11.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(229, 9, 20, 0.4)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#B80710'}
                  onMouseLeave={e => e.currentTarget.style.background = '#E50914'}
                >
                  <i className="fas fa-sliders-h" style={{ fontSize: 10 }} />
                  <span>จัดการตี้</span>
                </button>
              </div>
            )}

            {/* Alert: Cashier Discount From Game Change */}
            {booking.members?.some(m => Number(m.depositOverpaid) > 0 || Number(m.cashierDiscount) > 0) && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                <i className="fas fa-gift" style={{ color: '#059669', fontSize: 15, marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: 11.5, color: '#065F46', lineHeight: 1.5 }}>
                  <strong>สิทธิ์ส่วนลดหน้าแคชเชียร์:</strong> ปาร์ตี้นี้มีการปรับเปลี่ยนเกม สมาชิกที่ชำระมัดจำรอบเดิมไว้แล้วจะได้รับส่วนลดจากครึ่งหลังหน้าแคชเชียร์อัตโนมัติเมื่อเช็คบิลที่ร้าน
                </div>
              </div>
            )}

            {/* Alert: Current User Owes Extra Deposit From Game Change */}
            {myMember && Number(myMember.depositOwed) > 0 && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                <i className="fas fa-exclamation-triangle" style={{ color: '#DC2626', fontSize: 15, marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: 11.5, color: '#991B1B', lineHeight: 1.5 }}>
                  <strong>มีการเปลี่ยนแปลงเกม:</strong> มัดจำเกมใหม่สูงกว่าเดิม กรุณาชำระส่วนต่างมัดจำเพิ่ม <strong>฿{myMember.depositOwed}</strong> เพื่อรักษาสิทธิ์ของปาร์ตี้
                </div>
              </div>
            )}

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
                  background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
                  border: isUrgent ? '1.5px solid #FCA5A5' : '1px solid #E2E8F0',
                  borderRadius: 16,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                {/* Header row: Countdown chip on left, Remaining on right */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: isUrgent ? '#FEF2F2' : '#FFFBEB',
                        color: isUrgent ? '#E50914' : '#D97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      <i className="fas fa-hourglass-half" />
                    </div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', display: 'block' }}>
                        {countdown ? `เหลือเวลาชำระอีก ${countdown}` : 'เปิดรับชำระมัดจำ'}
                      </span>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 20,
                      background: isUrgent ? '#FEF2F2' : '#FFFFFF',
                      color: isUrgent ? '#DC2626' : '#475569',
                      border: isUrgent ? '1px solid #FECACA' : '1px solid #E2E8F0',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    }}
                  >
                    {isUrgent ? 'ใกล้หมดเวลา' : `ยังขาดอีก ${remainingToLock} คน`}
                  </span>
                </div>

                {/* Progress bar container */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#FFFFFF', padding: '10px 12px', borderRadius: 12, border: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>
                      ความคืบหน้าการล็อกห้อง: <strong style={{ color: '#0F172A', fontWeight: 800 }}>{paidCount}</strong> / {maxMembers} คน
                    </span>
                    <span style={{ color: paidPct >= 100 ? '#10B981' : '#E50914', fontWeight: 900 }}>
                      {paidPct}%
                    </span>
                  </div>

                  <div
                    style={{
                      width: '100%',
                      height: 7,
                      borderRadius: 999,
                      background: '#F1F5F9',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${paidPct}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: paidPct >= 100 ? '#10B981' : 'linear-gradient(90deg, #E50914 0%, #FF4D4F 100%)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
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
                  <span>หมดเวลาชำระมัดจำ - ปาร์ตี้ล่มเนื่องจากชำระไม่ครบ</span>
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
                        {m.paidDeposit && m.paidBy && m.paidByUid !== (m.uid || m.id) && (
                          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 1 }}>
                            <i className="fas fa-hand-holding-usd" style={{ marginRight: 4, fontSize: 10 }} />
                            ชำระโดย {m.paidBy}
                          </div>
                        )}
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
                            ? (Number(m.depositOwed) > 0 ? '#FEF2F2' : '#ECFDF5')
                            : m.slipStatus === 'pending_verification'
                              ? '#FFFBEB'
                              : '#F3F4F6',
                          color: m.paidDeposit
                            ? (Number(m.depositOwed) > 0 ? '#DC2626' : '#059669')
                            : m.slipStatus === 'pending_verification'
                              ? '#D97706'
                              : '#6B7280',
                          border: m.paidDeposit
                            ? (Number(m.depositOwed) > 0 ? '1px solid #FECACA' : '1px solid #A7F3D0')
                            : m.slipStatus === 'pending_verification'
                              ? '1px solid #FDE68A'
                              : '1px solid #E5E7EB',
                        }}
                      >
                        {m.paidDeposit ? (
                          Number(m.depositOwed) > 0 ? (
                            <>
                              <i className="fas fa-exclamation-circle" style={{ marginRight: 4, fontSize: 9, color: '#DC2626' }} />
                              ชำระแล้ว (ค้างเพิ่ม ฿{m.depositOwed})
                            </>
                          ) : Number(m.depositOverpaid || m.cashierDiscount) > 0 ? (
                            <>
                              <i className="fas fa-tag" style={{ marginRight: 4, fontSize: 9, color: '#059669' }} />
                              ชำระแล้ว (ลดแคชเชียร์ ฿{m.depositOverpaid || m.cashierDiscount})
                            </>
                          ) : (
                            <>
                              <i className="fas fa-check" style={{ marginRight: 4, fontSize: 9 }} />
                              จ่ายแล้ว
                            </>
                          )
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
              {Array.from({ length: Math.max(0, maxMembers - total) }).map((_, i) => {
                const seatNum = total + i + 1
                const paidSeat = booking.paidEmptySeats?.find(s => s.seatIndex === seatNum)

                if (paidSeat) {
                  return (
                    <div
                      key={`empty-seat-paid-${seatNum}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        boxSizing: 'border-box',
                        width: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: '#10B981',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                          }}
                        >
                          <i className="fas fa-lock" />
                        </div>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#065F46' }}>
                            ที่นั่งว่าง #{seatNum} (เหมาจ่ายล็อกห้องแล้ว)
                          </div>
                          <div style={{ fontSize: 10.5, color: '#059669', fontWeight: 600 }}>
                            ชำระโดย {paidSeat.paidBy || 'สมาชิก'}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: '#DCFCE7',
                          color: '#15803d',
                          border: '1px solid #86EFAC',
                        }}
                      >
                        จ่ายแล้ว
                      </span>
                    </div>
                  )
                }

                return (
                  <div
                    key={`empty-seat-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 14,
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      boxSizing: 'border-box',
                      width: '100%',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          color: '#94A3B8',
                          flexShrink: 0,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                        }}
                      >
                        <i className="fas fa-chair" />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                          ที่นั่งว่าง #{seatNum}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 20,
                        background: '#FFFFFF',
                        color: '#94A3B8',
                        border: '1px solid #E2E8F0',
                      }}
                    >
                      ว่าง
                    </span>
                  </div>
                )
              })}
            </div>

            {/* ── Collapsible Booking Terms & Rules ── */}
            <details
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 14,
                overflow: 'hidden',
                boxSizing: 'border-box',
                width: '100%',
              }}
            >
              <summary
                style={{
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none',
                  listStyle: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: '#FEF2F2',
                      color: '#E50914',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    <i className="fas fa-shield-alt" />
                  </div>
                  <div>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A', display: 'block' }}>
                      เงื่อนไขการจองและล็อกห้อง
                    </span>
                    <span style={{ fontSize: 11, color: '#64748B', display: 'block' }}>
                      ขยายเวลา +3 วัน/คน · ชำระครบ {maxMembers} คนล็อกห้องทันที
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>กติกา</span>
                  <i className="fas fa-chevron-down" style={{ fontSize: 10 }} />
                </span>
              </summary>

              <div
                style={{
                  padding: '0 14px 14px',
                  borderTop: '1px solid #F1F5F9',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  paddingTop: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                  <i className="fas fa-ban" style={{ color: '#E50914', fontSize: 11, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#991B1B' }}>ไม่คืนเงินมัดจำ:</strong> เงินมัดจำไม่สามารถขอรับเงินคืนหรือโอนสิทธิ์ได้ทุกกรณี หากยกเลิกการเล่นหรือไม่มาตามนัดหมาย
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                  <i className="fas fa-calendar-plus" style={{ color: '#E50914', fontSize: 11, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#0F172A' }}>ขยายเวลา +3 วัน/คน:</strong> ทุกครั้งที่สมาชิกชำระมัดจำ ระบบจะขยายเวลาให้ตี้อัตโนมัติ
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                  <i className="fas fa-lock" style={{ color: '#E50914', fontSize: 11, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#0F172A' }}>ล็อกห้องอัตโนมัติ:</strong> เมื่อชำระมัดจำครบ {maxMembers} คน ระบบจะล็อกห้องถาวรทันที
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                  <i className="fas fa-clock" style={{ color: '#E50914', fontSize: 11, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#0F172A' }}>กำหนดปิดรับ:</strong> ปิดรับชำระมัดจำไม่เกิน 24 ชั่วโมงก่อนวันเริ่มเล่นจริง
                  </div>
                </div>

                {booking.adminNote && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '8px 10px',
                      background: '#FEF2F2',
                      borderRadius: 8,
                      border: '1px solid #FECACA',
                      fontSize: 11,
                      color: '#991B1B',
                    }}
                  >
                    <strong>โน้ตจากแอดมิน:</strong> {booking.adminNote}
                  </div>
                )}
              </div>
            </details>
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
                <span>ส่งคำขอเข้าร่วมแล้ว - รอหัวปาร์ตี้อนุมัติ</span>
              </div>
            )}

            {/* Pay Deposit CTA for member who has not paid */}
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
                  <span>จ่ายมัดจำ / แนบสลิป</span>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  <i className="fas fa-shield-alt" style={{ color: '#10B981', fontSize: 10 }} />
                  <span>โอนผ่าน QR และแนบสลิปในเว็บนี้เพื่อยืนยันยอดอัตโนมัติ</span>
                </div>
              </div>
            )}

            {/* Pay Extra Deposit CTA for member who paid earlier but owes difference from game change */}
            {isMember && booking.status === 'confirmed' && myMember?.paidDeposit && Number(myMember.depositOwed) > 0 && myMember?.slipStatus !== 'pending_verification' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowDepositPay(true)}
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #E50914, #B80710)',
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
                  onMouseEnter={e => e.currentTarget.style.background = '#991B1B'}
                  onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg, #E50914, #B80710)'}
                >
                  <i className="fas fa-coins" style={{ fontSize: 16 }} />
                  <span>จ่ายส่วนต่างมัดจำ (฿{myMember.depositOwed})</span>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: '#DC2626', marginTop: 2 }}>
                  <i className="fas fa-exclamation-circle" style={{ fontSize: 10 }} />
                  <span>มีการเปลี่ยนเกม: ชำระเพิ่มเฉพาะส่วนต่าง ฿{myMember.depositOwed} เพื่อรักษาสิทธิ์</span>
                </div>
              </div>
            )}

            {/* Paid Status (Fully paid, no owed delta) */}
            {isMember && myMember?.paidDeposit && (!myMember?.depositOwed || myMember?.depositOwed <= 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                      ? 'คุณชำระมัดจำแล้ว - ล็อกห้องเรียบร้อย 100%'
                      : `คุณชำระมัดจำแล้ว (รอเพื่อนในตี้อีก ${remainingToLock} คน)`}
                  </span>
                </div>

                {Number(myMember?.depositOverpaid || myMember?.cashierDiscount) > 0 && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      color: '#15803D',
                      fontSize: 11.5,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <i className="fas fa-gift" style={{ color: '#16A34A' }} />
                    <span>คุณได้รับส่วนลดจากครึ่งหลังหน้าแคชเชียร์ ฿{myMember.depositOverpaid || myMember.cashierDiscount}</span>
                  </div>
                )}

                {!isLocked && remainingToLock > 0 && booking.status === 'confirmed' && (
                  <button
                    type="button"
                    onClick={() => setShowDepositPay(true)}
                    style={{
                      width: '100%',
                      height: 42,
                      borderRadius: 12,
                      background: '#10B981',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 3px 10px rgba(16, 185, 129, 0.25)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                    onMouseLeave={e => e.currentTarget.style.background = '#10B981'}
                  >
                    <i className="fas fa-lock" style={{ fontSize: 13 }} />
                    <span>ชำระมัดจำแทนเพื่อน / เหมาจ่ายล็อกห้อง</span>
                  </button>
                )}
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
                  <div>ส่งสลิปแล้ว - รอแอดมินตรวจสอบ</div>
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
          allGames={allGames}
          lineUser={lineUser}
          memberProfiles={memberProfiles}
          onClose={() => setShowDepositPay(false)}
          showToast={showToast}
          onUpdated={onUpdated}
        />
      )}

      {showAdminManage && (
        <AdminManageBookingModal
          booking={booking}
          allGames={allGames}
          lineUser={lineUser}
          onClose={() => setShowAdminManage(false)}
          showToast={showToast}
          onUpdated={() => {
            setShowAdminManage(false)
            if (onUpdated) onUpdated()
          }}
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
  const [dayModalDate, setDayModalDate] = useState('')
  const [myBookingsTab, setMyBookingsTab] = useState('active')
  const [mobileSection, setMobileSection] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      if (p.get('tab') === 'mylist') return 'mylist'
    } catch {}
    return 'calendar'
  })

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
        className="booking-hero-section"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#ffffff',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        <div style={{ maxWidth: 1320, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>

              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ width: '100%', maxWidth: 780 }}>
                  <h1 className="booking-hero-title">
                    <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>จองรอบเกม</span>{' '}
                    <span style={{ color: 'var(--curtain-crimson, #e50914)', whiteSpace: 'nowrap', display: 'inline-block' }}>& ตารางห้องสืบคดี</span>
                  </h1>
                  <p
                    className="booking-hero-desc"
                  >
                    จองรอบเล่นเกม Script Murder ที่ Sofun Club Thailand เช็คตารางห้องว่างแบบเรียลไทม์ หรือเปิดปาร์ตี้ใหม่เพื่อชวนเพื่อนร่วมไขปริศนา
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ── Main Two-Column Calendar Layout ───────────────────────────────── */}
      <main
        className="booking-main-container"
      >
        {/* ── Mobile Tab Navigation Bar ───────────────────────────────── */}
        <div className="booking-mobile-nav" role="tablist" aria-label="แถบสลับหน้าจองรอบเกม">
          <button
            type="button"
            role="tab"
            aria-selected={mobileSection === 'calendar'}
            className={`booking-mobile-tab-btn ${mobileSection === 'calendar' ? 'active' : ''}`}
            onClick={() => setMobileSection('calendar')}
          >
            <i className="fas fa-calendar-alt" style={{ fontSize: 13 }} />
            <span>ตารางห้อง & ปฏิทิน</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mobileSection === 'mylist'}
            className={`booking-mobile-tab-btn ${mobileSection === 'mylist' ? 'active' : ''}`}
            onClick={() => setMobileSection('mylist')}
          >
            <i className="fas fa-bookmark" style={{ fontSize: 13 }} />
            <span>การจองของฉัน (MY LIST)</span>
            {activeMyBookings.length > 0 && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: mobileSection === 'mylist' ? '#ffffff' : 'var(--curtain-crimson, #e50914)',
                  color: mobileSection === 'mylist' ? 'var(--curtain-crimson, #e50914)' : '#ffffff',
                  minWidth: 16,
                  textAlign: 'center',
                  lineHeight: '14px',
                }}
              >
                {activeMyBookings.length}
              </span>
            )}
          </button>
        </div>

        <div className="booking-two-col-grid">

          {/* ── Left Column: My Bookings or Guest VIP Pass ─────────────────── */}
          <div className={`booking-col-left ${mobileSection !== 'mylist' ? 'mobile-hidden' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                        allGames={allGames}
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
          <div className={`booking-col-right ${mobileSection !== 'calendar' ? 'mobile-hidden' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
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
                onDayClick={date => {
                  setCalendarDate(date)
                  setDayModalDate(date)
                }}
                selectedDate={calendarDate}
                onEventClick={openDetail}
                onBookToday={date => handleStartBooking(date || calendarDate || toDateStr(new Date()))}
              />
            </div>
          </div>

        </div>
      </main>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {dayModalDate && (
        <DayScheduleModal
          date={dayModalDate}
          bookings={bookings}
          allGames={allGames}
          lineUser={lineUser}
          onClose={() => setDayModalDate('')}
          onOpenBooking={b => {
            setDayModalDate('')
            openDetail(b)
          }}
          onStartBooking={date => {
            setDayModalDate('')
            handleStartBooking(date)
          }}
          showToast={showToast}
        />
      )}

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
          onSuccess={() => setMobileSection('mylist')}
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
          allGames={allGames}
          lineUser={lineUser}
          onClose={closeDetail}
          showToast={showToast}
          onUpdated={() => {}}
        />
      )}
    </div>
  )
}
