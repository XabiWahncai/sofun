import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, query, orderBy, getDoc
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { QRCodeSVG } from 'qrcode.react'
import { db, storage } from '../firebase'

// ── Rooms Configuration & Metadata ─────────────────────────────────────────────
const ROOMS_DATA = [
  {
    name: 'Japanese Room',
    theme: 'ห้องญี่ปุ่นโบราณ',
    desc: 'เสื่อทาทามิ บรรยากาศสืบสวนคดีสไตล์ญี่ปุ่นดั้งเดิม',
    capacity: '4-8 คน',
    color: '#dc2626',
    icon: 'fas fa-torii-gate',
    badge: 'ยอดนิยม'
  },
  {
    name: 'Europe Room',
    theme: 'คฤหาสน์วิกตอเรียน',
    desc: 'คฤหาสน์ยุโรปคลาสสิก โต๊ะยาวทรงเกียรติยศ',
    capacity: '6-10 คน',
    color: '#2563eb',
    icon: 'fas fa-chess-rook',
    badge: 'คฤหาสน์'
  },
  {
    name: 'Chinese Room',
    theme: 'โรงเตี๊ยม & วังโบราณ',
    desc: 'บรรยากาศยุทธภพและคดีราชสำนักจีนเข้มข้น',
    capacity: '6-10 คน',
    color: '#ea580c',
    icon: 'fas fa-dragon',
    badge: 'คดีประวัติศาสตร์'
  },
  {
    name: 'Ghost Room',
    theme: 'ห้องสยองขวัญ / อาถรรพ์',
    desc: 'ห้องมืดสลัว แสงไฟจำลอง และปริศนาสุดหลอน',
    capacity: '4-8 คน',
    color: '#7c3aed',
    icon: 'fas fa-ghost',
    badge: 'ระทึกขวัญ'
  },
  {
    name: '404 Bar',
    theme: 'บาร์ลับนีออน & สตรีท',
    desc: 'บาร์ลับใต้ดิน คดีย้อนยุคและอาชญากรรมในเงามืด',
    capacity: '4-8 คน',
    color: '#d97706',
    icon: 'fas fa-cocktail',
    badge: 'บาร์ลับ'
  },
  {
    name: 'Projector Room',
    theme: 'ห้องมัลติมีเดียเต็มจอ',
    desc: 'ระบบภาพจอโปรเจกเตอร์และเสียงรอบทิศทาง',
    capacity: '6-12 คน',
    color: '#0891b2',
    icon: 'fas fa-film',
    badge: 'มัลติมีเดีย'
  },
  {
    name: '5 Floor',
    theme: 'ห้องโถงใหญ่ชั้น 5',
    desc: 'พื้นที่กว้างขวาง เหมาะสำหรับตี้ใหญ่และการเจรจาลับ',
    capacity: '8-16 คน',
    color: '#16a34a',
    icon: 'fas fa-building',
    badge: 'ตี้ใหญ่'
  },
  {
    name: 'Yang',
    theme: 'โมเดิร์นเลานจ์',
    desc: 'ห้องส่วนตัวหรูหรา บรรยากาศเงียบสงบเป็นกันเอง',
    capacity: '6-10 คน',
    color: '#db2777',
    icon: 'fas fa-yin-yang',
    badge: 'ส่วนตัว VIP'
  },
  {
    name: 'Chinese DM',
    theme: 'ห้องสืบสวนพร้อม DM จีน',
    desc: 'เล่นบทละครจีนพร้อม DM มืออาชีพบรรยายสด',
    capacity: '6-8 คน',
    color: '#c62419',
    icon: 'fas fa-scroll',
    badge: 'พร้อม DM'
  },
  {
    name: 'Thai DM',
    theme: 'ห้องสืบสวนพร้อม Story Master',
    desc: 'ดำเนินเรื่องอย่างเข้มข้น ดำดิ่งสู่บทละครเต็มอารมณ์',
    capacity: '6-8 คน',
    color: '#b45309',
    icon: 'fas fa-feather-alt',
    badge: 'พร้อม DM'
  },
  {
    name: 'Waiting Area 1',
    theme: 'โถงรับรอง 1',
    desc: 'โซนรับรองและเตรียมตัวสืบคดีก่อนเริ่มเกม',
    capacity: '4-10 คน',
    color: '#64748b',
    icon: 'fas fa-couch',
    badge: 'โถงรับรอง'
  },
  {
    name: 'Waiting Area 2',
    theme: 'โถงรับรอง 2',
    desc: 'พื้นที่พักผ่อน พูดคุยสรุปเบาะแสหลังจบเกม',
    capacity: '4-10 คน',
    color: '#475569',
    icon: 'fas fa-couch',
    badge: 'โถงรับรอง'
  },
]

const ALL_ROOMS = ROOMS_DATA.map(r => r.name)
const ROOM_MAP = Object.fromEntries(ROOMS_DATA.map(r => [r.name, r]))

const DEFAULT_TIME_SLOTS = ['13:00', '15:30', '18:00', '20:30']

const STATUS_CONFIG = {
  pending:   { label: 'รอยืนยัน',   style: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { label: 'ยืนยันแล้ว', style: 'bg-blue-50 text-blue-700 border-blue-200' },
  locked:    { label: 'ล็อกห้องแล้ว', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  collapsed: { label: 'ปาร์ตี้ล่ม',  style: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'ปิดตี้แล้ว',  style: 'bg-slate-100 text-slate-600 border-slate-200' },
}

// ── PromptPay QR Generation ───────────────────────────────────────────────────
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
  const target = phoneOrId.replace(/[-\s]/g, '').replace(/^0/, '66')
  const acct = f('00', 'A000000677010111') + f('01', target)
  let s = f('00', '01') + f('01', '12') + f('29', acct) + f('53', '764')
  if (amount > 0) s += f('54', amount.toFixed(2))
  s += f('58', 'TH') + '6304'
  return s + crc16(s).toString(16).toUpperCase().padStart(4, '0')
}

// ── Date and Formatting Helpers ────────────────────────────────────────────────
const MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]
const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const DAY_NAMES_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

function pad2(n) { return String(n).padStart(2, '0') }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function fmtDate(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${parseInt(d)} ${MONTH_NAMES[parseInt(m) - 1]} ${parseInt(y) + 543}`
}
function fmtDateShort(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${parseInt(d)} ${MONTH_NAMES[parseInt(m) - 1].slice(0, 3)}`
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

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, size = 'text-[11px]', label }) {
  const config = STATUS_CONFIG[status] || { label: status, style: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold border ${size} ${config.style}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      <span>{label || config.label}</span>
    </span>
  )
}

// ── Component: Horizontal Date Ribbon ──────────────────────────────────────────
function DateRibbon({ selectedDate, onSelectDate }) {
  const today = useMemo(() => new Date(), [])

  // Generate next 14 days
  const dateList = useMemo(() => {
    const list = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const dateStr = toDateStr(d)
      list.push({
        dateStr,
        dayOfWeek: DAY_NAMES_FULL[d.getDay()],
        dayNum: d.getDate(),
        monthName: MONTH_NAMES[d.getMonth()].slice(0, 3),
        isToday: i === 0,
        isTomorrow: i === 1,
      })
    }
    return list
  }, [today])

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1 scrollbar-none">
      {dateList.map(item => {
        const isSelected = selectedDate === item.dateStr
        return (
          <button
            key={item.dateStr}
            onClick={() => onSelectDate(item.dateStr)}
            className={`shrink-0 flex flex-col items-center justify-center min-w-[76px] py-2.5 px-3 rounded-2xl border transition-all cursor-pointer ${
              isSelected
                ? 'bg-[#c62419] text-white border-[#c62419] shadow-md shadow-red-950/20 scale-[1.02]'
                : item.isToday
                  ? 'bg-red-50/60 text-slate-800 border-red-200 hover:border-red-300 hover:bg-red-50'
                  : 'bg-white text-slate-700 border-slate-200/90 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span className={`text-[10px] font-bold tracking-wider uppercase mb-0.5 ${
              isSelected ? 'text-red-100' : item.isToday ? 'text-[#c62419]' : 'text-slate-400'
            }`}>
              {item.isToday ? 'วันนี้' : item.isTomorrow ? 'พรุ่งนี้' : item.dayOfWeek}
            </span>
            <span className="text-xl font-black leading-none font-display">
              {item.dayNum}
            </span>
            <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-red-100' : 'text-slate-500'}`}>
              {item.monthName}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Component: Room Showtimes Card (Day View) ──────────────────────────────────
function RoomShowtimeCard({ room, selectedDate, dateBookings, onSelectSlot, onOpenBooking }) {
  const roomBookings = dateBookings.filter(b => b.room === room.name)

  // Map showtime slots
  const slots = DEFAULT_TIME_SLOTS.map(time => {
    const booking = roomBookings.find(b => b.time === time)
    return { time, booking }
  })

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-md transition-all duration-200 p-4 sm:p-5 flex flex-col justify-between">
      <div>
        {/* Room Header */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
              style={{ backgroundColor: room.color }}
            >
              <i className={`${room.icon} text-base`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 leading-snug">
                  {room.name}
                </h3>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-md border"
                  style={{
                    backgroundColor: `${room.color}12`,
                    borderColor: `${room.color}35`,
                    color: room.color,
                  }}
                >
                  {room.badge}
                </span>
              </div>
              <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                {room.desc}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xs text-slate-500 font-medium">
              <i className="fas fa-users text-slate-400 mr-1 text-[11px]" />
              {room.capacity}
            </span>
          </div>
        </div>

        {/* Time Slots Showtimes Grid */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            รอบเวลาประจำวัน
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {slots.map(({ time, booking }) => {
              if (booking) {
                const totalM = booking.members?.length || 0
                return (
                  <button
                    key={time}
                    onClick={() => onOpenBooking(booking)}
                    className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 text-left transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-mono text-xs font-bold text-blue-900">
                        {time} น.
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    </div>
                    <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700 truncate">
                      {booking.gameName || 'มีรอบเล่น'}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                      <span>👥 {totalM}/{booking.maxMembers || 6}</span>
                      <span className="font-bold text-blue-600">ดูตี้ ›</span>
                    </div>
                  </button>
                )
              }

              // Available Slot
              return (
                <button
                  key={time}
                  onClick={() => onSelectSlot({ date: selectedDate, time, room: room.name })}
                  className="p-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 text-slate-700 transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-xs font-bold group-hover:text-white text-emerald-800">
                      {time} น.
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:bg-white" />
                  </div>
                  <div className="text-xs font-bold text-emerald-700 group-hover:text-white">
                    ห้องว่าง
                  </div>
                  <div className="text-[10px] text-emerald-600 group-hover:text-emerald-100 mt-1 flex items-center gap-1">
                    <i className="fas fa-plus text-[8px]" />
                    <span>กดเพื่อจอง</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Component: Monthly Calendar Grid View ──────────────────────────────────────
function MonthlyCalendarView({ bookings, onDayClick, selectedDate, onEventClick }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const todayStr = toDateStr(today)

  // Group active bookings by date
  const bookingsByDate = {}
  bookings.forEach(b => {
    if (!b.date || b.status === 'cancelled' || b.status === 'collapsed') return
    if (!bookingsByDate[b.date]) bookingsByDate[b.date] = []
    bookingsByDate[b.date].push(b)
  })

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-4 sm:p-6">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
        <h3 className="text-xl font-black text-slate-900">
          {MONTH_NAMES[viewMonth]} {viewYear + 543}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            วันนี้
          </button>
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <i className="fas fa-chevron-left text-xs" />
          </button>
          <button
            onClick={nextMonth}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <i className="fas fa-chevron-right text-xs" />
          </button>
        </div>
      </div>

      {/* Grid Header */}
      <div className="grid grid-cols-7 text-center text-xs font-bold uppercase tracking-wider text-slate-500 py-2 border-b border-slate-200 bg-slate-50 rounded-t-xl">
        {DAY_NAMES.map((d, i) => (
          <div key={d} className={i === 0 ? 'text-[#c62419]' : ''}>{d}</div>
        ))}
      </div>

      {/* Grid Days */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200 rounded-b-xl overflow-hidden">
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} className="bg-slate-50/50 min-h-[84px]" />
          const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
          const dayBookings = bookingsByDate[dateStr] || []
          const isToday = todayStr === dateStr
          const isSelected = selectedDate === dateStr
          return (
            <div
              key={day}
              onClick={() => onDayClick(dateStr)}
              className={`p-1.5 sm:p-2 min-h-[84px] flex flex-col justify-between transition-all cursor-pointer ${
                isSelected
                  ? 'bg-red-50/90 ring-2 ring-inset ring-[#c62419] z-10'
                  : isToday
                    ? 'bg-amber-50/50'
                    : 'bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                {dayBookings.length > 0 ? (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-red-100 text-[#c62419]">
                    {dayBookings.length} รอบ
                  </span>
                ) : <span />}
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isToday ? 'bg-[#c62419] text-white shadow-xs' : 'text-slate-700'
                }`}>
                  {day}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                {dayBookings.slice(0, 2).map(b => (
                  <button
                    key={b.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(b) }}
                    className="text-left truncate rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800"
                  >
                    {b.time} {b.room || b.gameName}
                  </button>
                ))}
                {dayBookings.length > 2 && (
                  <span className="text-[9px] text-slate-400 font-bold px-1">
                    +{dayBookings.length - 2} เพิ่มเติม
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Component: Ticket-Style Booking Pass (My Bookings) ─────────────────────────
function BookingTicketCard({ booking, lineUser, onOpen, onCloseBooking }) {
  const paidCount = booking.members?.filter(m => m.paidDeposit).length || 0
  const total = booking.members?.length || 0
  const isLeader = booking.leaderId === lineUser?.uid
  const pendingRequests = booking.joinRequests?.length || 0
  const imgSrc = booking.gameImage ? convertImg(booking.gameImage, 400) : null
  const countdown = booking.status === 'confirmed' && booking.depositDeadline ? formatCountdown(booking.depositDeadline) : null
  const isUrgent = countdown && new Date(booking.depositDeadline) - new Date() < 24 * 3600000
  const paidPct = total > 0 ? (paidCount / total) * 100 : 0
  const allPaid = paidCount === total && total > 0
  const roomMeta = ROOM_MAP[booking.room] || {}

  return (
    <div
      onClick={() => onOpen(booking)}
      className="group relative bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer flex flex-col sm:flex-row"
    >
      {/* Left Ticket Header / Game Cover */}
      <div className="sm:w-48 h-36 sm:h-auto shrink-0 relative bg-slate-900 overflow-hidden">
        {imgSrc ? (
          <img src={imgSrc} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 filter brightness-90" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500">
            <i className="fas fa-theater-masks text-3xl" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black/80 via-black/20 to-transparent" />
        <div className="absolute top-3 left-3">
          <StatusBadge status={booking.status} size="text-[10px]" />
        </div>
      </div>

      {/* Ticket Details */}
      <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h4 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-[#c62419] transition-colors truncate">
              {booking.gameName || 'การจองห้อง'}
            </h4>
            {isLeader && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-[#c62419] border border-red-200 shrink-0">
                หัวหน้าตี้
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              <i className="fas fa-calendar-day text-[#c62419] mr-1.5" />
              {fmtDate(booking.date)}
            </span>
            {booking.time && (
              <span className="font-mono font-bold text-slate-800">
                <i className="fas fa-clock text-slate-400 mr-1" />
                {booking.time} น.
              </span>
            )}
            {booking.room && (
              <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: roomMeta.color || '#64748b' }} />
                {booking.room}
              </span>
            )}
          </div>
        </div>

        {/* Deposit and Members Progress */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-xs">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500 font-medium">สมาชิก {total}/{booking.maxMembers || '?'} คน</span>
              <span className={allPaid ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                มัดจำ {paidCount}/{total}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  allPaid ? 'bg-emerald-500' : 'bg-[#c62419]'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, paidPct))}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {countdown && (
              <div className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
                isUrgent ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <i className="fas fa-hourglass-half text-[10px]" />
                <span>มัดจำ {countdown}</span>
              </div>
            )}
            <span className="text-xs font-bold text-[#c62419] group-hover:translate-x-0.5 transition-transform">
              จัดการตี้ ›
            </span>
          </div>
        </div>
      </div>

      {isLeader && pendingRequests > 0 && (
        <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
          {pendingRequests} คำขอรออนุมัติ
        </div>
      )}
    </div>
  )
}

// ── Component: Create Booking Modal ───────────────────────────────────────────
function CreateBookingModal({ allGames, bookings = [], lineUser, onClose, showToast, initialData = {} }) {
  const [step, setStep] = useState('datetime') // 'datetime' | 'game'
  const [selectedDate, setSelectedDate] = useState(initialData.date || toDateStr(new Date()))
  const [selectedTime, setSelectedTime] = useState(initialData.time || '15:30')
  const [selectedRoom, setSelectedRoom] = useState(initialData.room || '')
  const [selectedGame, setSelectedGame] = useState(null)
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const activeDateBookings = selectedDate
    ? bookings.filter(b => b.date === selectedDate && !['cancelled', 'collapsed'].includes(b.status))
    : []

  const handleSubmit = async () => {
    if (!selectedGame || !selectedDate || !selectedTime) return
    setSubmitting(true)
    try {
      const maxMembers = selectedGame.characters?.length || parseInt(selectedGame.players) || 6
      await addDoc(collection(db, 'bookings'), {
        gameId: selectedGame.id,
        gameName: selectedGame.title || '',
        gameImage: selectedGame.image || selectedGame.coverUrl || '',
        date: selectedDate,
        time: selectedTime,
        room: selectedRoom,
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
      showToast('ส่งคำขอจองสำเร็จ รอแอดมินยืนยันห้อง')
      onClose()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredGames = allGames.filter(g =>
    !search || g.title?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col font-sans animate-in slide-in-from-bottom duration-200">
        <div className="p-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              จองรอบเกม & เปิดตี้ใหม่
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 'datetime' ? 'ขั้นตอนที่ 1 / 2 — วันที่ เวลา และห้องเล่น' : 'ขั้นตอนที่ 2 / 2 — เลือกบทละครสืบสวน'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times text-xs" />
          </button>
        </div>

        <div className="flex gap-2 px-5 pt-3">
          <div className={`h-1 flex-1 rounded-full ${step === 'datetime' || step === 'game' ? 'bg-[#c62419]' : 'bg-slate-100'}`} />
          <div className={`h-1 flex-1 rounded-full ${step === 'game' ? 'bg-[#c62419]' : 'bg-slate-100'}`} />
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === 'datetime' ? (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  วันที่ต้องการเล่น *
                </label>
                <input
                  type="date"
                  min={toDateStr(new Date())}
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:border-[#c62419] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  รอบเวลาเริ่มต้น *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DEFAULT_TIME_SLOTS.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTime(t)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                        selectedTime === t
                          ? 'bg-[#c62419] text-white border-[#c62419] shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {t} น.
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  ห้องที่ต้องการ (ระบุหรือไม่ระบุก็ได้)
                </label>
                <select
                  value={selectedRoom}
                  onChange={e => setSelectedRoom(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-medium focus:border-[#c62419] outline-none"
                >
                  <option value="">-- ให้แอดมินจัดสรรห้องให้ตามความเหมาะสม --</option>
                  {ROOMS_DATA.map(r => (
                    <option key={r.name} value={r.name}>{r.name} ({r.theme} · {r.capacity})</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setStep('game')}
                className="w-full py-3.5 rounded-xl bg-[#c62419] hover:bg-[#9a1c13] text-white font-bold text-sm shadow-md shadow-red-950/20 cursor-pointer mt-2"
              >
                ขั้นตอนต่อไป: เลือกบทละครสืบสวน ›
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <span>
                  🗓️ วันที่: <strong className="text-slate-900">{fmtDate(selectedDate)}</strong> เวลา: <strong className="text-[#c62419]">{selectedTime} น.</strong>
                  {selectedRoom && <> · ห้อง: <strong className="text-slate-900">{selectedRoom}</strong></>}
                </span>
                <button onClick={() => setStep('datetime')} className="text-xs text-[#c62419] font-bold hover:underline">แก้ไข</button>
              </div>

              <div className="relative">
                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อเกม / สคริปต์..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:border-[#c62419] outline-none"
                />
              </div>

              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                {filteredGames.map(g => {
                  const isSel = selectedGame?.id === g.id
                  const gImg = g.image || g.coverUrl ? convertImg(g.image || g.coverUrl, 200) : null
                  return (
                    <div
                      key={g.id}
                      onClick={() => setSelectedGame(g)}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSel
                          ? 'bg-red-50/60 border-[#c62419] ring-1 ring-[#c62419]'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="w-12 h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                        {gImg ? <img src={gImg} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><i className="fas fa-dice-d20" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs sm:text-sm text-slate-900 truncate">{g.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">👥 {g.players || '6-8 คน'} {g.difficulty && `· ${g.difficulty}`}</div>
                      </div>
                      {isSel && <i className="fas fa-check-circle text-[#c62419] text-base" />}
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep('datetime')}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  disabled={!selectedGame || submitting}
                  onClick={handleSubmit}
                  className={`flex-2 py-3 rounded-xl font-bold text-xs text-white ${
                    selectedGame && !submitting ? 'bg-[#c62419] hover:bg-[#9a1c13] shadow-md shadow-red-950/20' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {submitting ? 'กำลังส่งคำขอ...' : 'ยืนยันและส่งการจอง'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Component: Booking Detail & Party Lounge Modal ────────────────────────────
function BookingDetailModal({ booking, lineUser, onClose, showToast, onUpdated }) {
  const [joining, setJoining] = useState(false)
  const [closing, setClosing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showDepositPay, setShowDepositPay] = useState(false)

  const isMember = booking.members?.some(m => m.uid === lineUser?.uid)
  const isLeader = booking.leaderId === lineUser?.uid
  const myMember = booking.members?.find(m => m.uid === lineUser?.uid)
  const myRequest = booking.joinRequests?.some(r => r.uid === lineUser?.uid)
  const paidCount = booking.members?.filter(m => m.paidDeposit).length || 0
  const total = booking.members?.length || 0
  const imgSrc = booking.gameImage ? convertImg(booking.gameImage, 800) : null
  const countdown = booking.status === 'confirmed' && booking.depositDeadline ? formatCountdown(booking.depositDeadline) : null

  const handleRequestJoin = async () => {
    if (!lineUser) { showToast('กรุณาเข้าสู่ระบบก่อน', 'error'); return }
    if (isMember) { showToast('คุณอยู่ในปาร์ตี้นี้แล้ว'); return }
    if (myRequest) { showToast('คุณส่งคำขอไปแล้ว'); return }
    setJoining(true)
    try {
      const ref = doc(db, 'bookings', booking.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) return
      const latest = snap.data()
      await updateDoc(ref, {
        joinRequests: [...(latest.joinRequests || []), {
          uid: lineUser.uid,
          name: lineUser.name,
          avatar: lineUser.avatar || '',
          requestedAt: new Date().toISOString()
        }],
        updatedAt: serverTimestamp()
      })
      showToast('ส่งคำขอเข้าร่วมแล้ว รอหัวปาร์ตี้อนุมัติ')
      onUpdated()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setJoining(false)
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
    showToast('คัดลอกลิงก์เรียบร้อยแล้ว')
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div className="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col font-sans animate-in slide-in-from-bottom duration-200">
          {/* Header Cover */}
          <div className="relative h-44 sm:h-52 bg-slate-900 shrink-0 overflow-hidden">
            {imgSrc ? (
              <img src={imgSrc} alt="" className="w-full h-full object-cover filter brightness-75" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600"><i className="fas fa-theater-masks text-4xl" /></div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center border border-white/20 transition-colors"
            >
              <i className="fas fa-times text-xs" />
            </button>
            <div className="absolute bottom-4 left-5 right-5 text-white">
              <StatusBadge status={booking.status} size="text-[10px]" />
              <h2 className="text-xl sm:text-2xl font-black mt-1.5 truncate">{booking.gameName}</h2>
              <div className="text-xs text-slate-200 mt-1">
                🗓️ {fmtDate(booking.date)} {booking.time && `· เวลา ${booking.time} น.`} {booking.room && `· ห้อง ${booking.room}`}
              </div>
            </div>
          </div>

          {/* Details Body */}
          <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4">
            {countdown && booking.status === 'confirmed' && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2.5">
                <i className="fas fa-clock text-base text-amber-600 shrink-0" />
                <div>
                  <strong className="block">กำหนดชำระมัดจำภายใน {countdown}</strong>
                  <span className="opacity-80">เมื่อสมาชิกชำระครบทุกคน ระบบจะยืนยันล็อกห้องอัตโนมัติ</span>
                </div>
              </div>
            )}

            {/* Members Roster */}
            <div>
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="font-bold text-slate-700 uppercase tracking-wider">สมาชิก ({total}/{booking.maxMembers || 6})</span>
                <span className="text-slate-500 font-medium">จ่ายมัดจำแล้ว {paidCount}/{total}</span>
              </div>
              <div className="flex flex-col gap-2">
                {(booking.members || []).map(m => (
                  <div key={m.uid} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center font-bold text-xs text-slate-700">
                        {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : (m.name || '?')[0]}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{m.name} {m.uid === booking.leaderId && <span className="text-[10px] text-[#c62419] font-bold ml-1">(หัวหน้า)</span>}</div>
                        <div className="text-[10px] text-slate-400">{m.paidDeposit ? 'จ่ายมัดจำแล้ว' : 'ยังไม่จ่ายมัดจำ'}</div>
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${m.paidDeposit ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {m.paidDeposit ? 'จ่ายแล้ว' : 'รอชำระ'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              {!isMember && !myRequest && (
                <button
                  onClick={handleRequestJoin}
                  disabled={joining}
                  className="w-full py-3.5 rounded-xl bg-[#c62419] hover:bg-[#9a1c13] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-red-950/20"
                >
                  <i className="fas fa-user-plus" />
                  <span>ขอเข้าร่วมปาร์ตี้นี้</span>
                </button>
              )}

              {isMember && booking.status === 'confirmed' && !myMember?.paidDeposit && (
                <button
                  onClick={() => setShowDepositPay(true)}
                  className="w-full py-3.5 rounded-xl bg-[#06c755] hover:bg-[#05a848] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20"
                >
                  <i className="fas fa-qrcode" />
                  <span>ชำระมัดจำ ฿{booking.depositAmount} / แนบสลิป</span>
                </button>
              )}

              <button
                onClick={handleShare}
                className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2"
              >
                <i className={`fas fa-${copied ? 'check text-emerald-600' : 'share-alt'}`} />
                <span>{copied ? 'คัดลอกลิงก์แล้ว' : 'แชร์ชวนเพื่อน'}</span>
              </button>
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

// ── Component: PromptPay Slip Upload Modal ─────────────────────────────────────
function DepositPaymentModal({ booking, lineUser, onClose, showToast, onUpdated }) {
  const [promptPayPhone, setPromptPayPhone] = useState('')
  const [slipFile, setSlipFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'payment')).then(snap => {
      if (snap.exists()) setPromptPayPhone(snap.data().promptPayPhone || '')
    })
  }, [])

  const qrPayload = promptPayPhone ? buildPromptPayQR(promptPayPhone, booking.depositAmount || 0) : ''

  const handleUpload = async () => {
    if (!slipFile) return
    setUploading(true)
    try {
      const path = `slips/deposits/${booking.id}/${lineUser.uid}_${Date.now()}`
      const fileRef = storageRef(storage, path)
      await uploadBytes(fileRef, slipFile)
      const slipUrl = await getDownloadURL(fileRef)

      const ref = doc(db, 'bookings', booking.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) return
      const updatedMembers = snap.data().members.map(m =>
        m.uid === lineUser.uid ? { ...m, slipUrl, slipStatus: 'pending_verification', slipSubmittedAt: new Date().toISOString() } : m
      )
      await updateDoc(ref, { members: updatedMembers, updatedAt: serverTimestamp() })
      showToast('อัปโหลดสลิปเรียบร้อย รอแอดมินตรวจสอบ')
      onClose()
      onUpdated()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl text-center">
        <h3 className="text-base font-black text-slate-900 mb-1">สแกนชำระมัดจำ</h3>
        <p className="text-xs text-slate-500 mb-4">{booking.gameName}</p>

        {promptPayPhone ? (
          <div className="flex flex-col items-center mb-4">
            <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm mb-2">
              <QRCodeSVG value={qrPayload} size={180} />
            </div>
            <div className="text-sm font-mono font-bold text-slate-800">PromptPay: {promptPayPhone}</div>
            <div className="text-xs text-emerald-600 font-bold mt-0.5">ยอดโอน: ฿{booking.depositAmount} / คน</div>
          </div>
        ) : (
          <div className="py-8 text-xs text-slate-400">ยังไม่ได้ระบุเบอร์ PromptPay</div>
        )}

        <label className="w-full py-3 px-4 rounded-xl bg-[#06c755] hover:bg-[#05a848] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors mb-2">
          <i className="fas fa-upload" />
          <span>{slipFile ? slipFile.name : 'แนบรูปภาพสลิปการโอน'}</span>
          <input type="file" accept="image/*" onChange={e => setSlipFile(e.target.files[0])} className="hidden" />
        </label>

        {slipFile && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full py-2.5 rounded-xl bg-[#c62419] text-white text-xs font-bold transition-all"
          >
            {uploading ? 'กำลังส่งสลิป...' : 'ยืนยันส่งสลิป'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main BookingPage ──────────────────────────────────────────────────────────
export default function BookingPage({ lineUser, allGames = [], showToast, onLogin = () => {} }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState('showtimes') // 'showtimes' | 'calendar' | 'my-bookings'
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [selectedRoomFilter, setSelectedRoomFilter] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createInitialData, setCreateInitialData] = useState({})
  const [detailBooking, setDetailBooking] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setBookings(all)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  // Handle URL deep link ?booking=id
  useEffect(() => {
    if (bookings.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const bid = params.get('booking')
    if (bid) {
      const found = bookings.find(b => b.id === bid)
      if (found) setDetailBooking(found)
    }
  }, [bookings])

  const myBookings = useMemo(() => {
    if (!lineUser) return []
    return bookings.filter(b => b.members?.some(m => m.uid === lineUser.uid))
  }, [bookings, lineUser])

  const dateBookings = useMemo(() => {
    return bookings.filter(b => b.date === selectedDate && !['cancelled', 'collapsed'].includes(b.status))
  }, [bookings, selectedDate])

  const filteredRooms = useMemo(() => {
    if (selectedRoomFilter === 'all') return ROOMS_DATA
    return ROOMS_DATA.filter(r => r.name === selectedRoomFilter)
  }, [selectedRoomFilter])

  const handleStartBooking = (initialParams = {}) => {
    if (!lineUser) {
      onLogin()
      return
    }
    setCreateInitialData(initialParams)
    setShowCreateModal(true)
  }

  const upcomingCount = useMemo(() => {
    return bookings.filter(b => b.status === 'locked' || b.status === 'confirmed').length
  }, [bookings])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500 font-sans">
        <div className="w-10 h-10 border-3 border-slate-200 border-t-[#c62419] rounded-full animate-spin" />
        <div className="text-xs font-semibold">กำลังโหลดระบบจองห้อง SoFun Club...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 font-sans pt-16 pb-24">
      {/* ── Editorial Theatrical Header ───────────────────────────────────────── */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-100 text-[#c62419] text-xs font-bold uppercase tracking-wider mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c62419]" />
                <span>SOFUN MYSTERY LOUNGE · SHOWTIMES & BOOKING</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight mb-2">
                ตารางห้อง & จองรอบเล่นเกม
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                เช็คสถานะห้องว่างแบบเรียลไทม์ เลือกรอบเวลา หรือเปิดห้องสร้างปาร์ตี้เพื่อเริ่มต้นคดีสืบสวน
              </p>
            </div>

            {/* Quick Metrics Bar */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200/90 flex items-center gap-2.5 text-xs text-slate-700">
                <i className="fas fa-theater-masks text-[#c62419] text-base" />
                <div>
                  <div className="font-black text-slate-900">{allGames.length || '50+'} เรื่อง</div>
                  <div className="text-[10px] text-slate-500">บทละครพร้อมเล่น</div>
                </div>
              </div>

              <div className="px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200/90 flex items-center gap-2.5 text-xs text-slate-700">
                <i className="fas fa-door-open text-amber-600 text-base" />
                <div>
                  <div className="font-black text-slate-900">12 ห้องธีม</div>
                  <div className="text-[10px] text-slate-500">บรรยากาศเสมือนจริง</div>
                </div>
              </div>

              <button
                onClick={() => handleStartBooking({ date: selectedDate })}
                className="px-5 py-3 rounded-2xl bg-[#c62419] hover:bg-[#9a1c13] text-white font-bold text-xs sm:text-sm shadow-md shadow-red-950/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                <i className="fas fa-plus text-xs" />
                <span>+ จองรอบเล่นใหม่</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main View Nav Mode Switcher ─────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-slate-200/80">
          {/* 3 Main Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-2xl">
            <button
              onClick={() => setCurrentView('showtimes')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                currentView === 'showtimes'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fas fa-clock text-[#c62419]" />
              <span>รอบเวลา & ห้องว่าง</span>
            </button>

            <button
              onClick={() => setCurrentView('calendar')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                currentView === 'calendar'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fas fa-calendar-alt text-amber-600" />
              <span>ปฏิทินรายเดือน</span>
            </button>

            <button
              onClick={() => setCurrentView('my-bookings')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                currentView === 'my-bookings'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fas fa-ticket-alt text-blue-600" />
              <span>การจองของฉัน</span>
              {myBookings.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#c62419] text-white text-[10px] font-black flex items-center justify-center">
                  {myBookings.length}
                </span>
              )}
            </button>
          </div>

          {/* Quick Date Indicator */}
          {currentView === 'showtimes' && (
            <div className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <span>วันที่เลือก:</span>
              <span className="text-slate-900 bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-xs">
                🗓️ {fmtDate(selectedDate)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Content View Rendering ─────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* VIEW 1: Showtimes & Rooms (Default High-Converting Experience) */}
        {currentView === 'showtimes' && (
          <div className="flex flex-col gap-6">
            {/* Horizontal Date Ribbon */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                1. เลือกวันที่ต้องการเล่น
              </div>
              <DateRibbon
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </div>

            {/* Room Filter Bar */}
            <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. เลือกห้องธีมและรอบเวลา ({filteredRooms.length} ห้อง)
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                <button
                  onClick={() => setSelectedRoomFilter('all')}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    selectedRoomFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ทุกห้อง
                </button>
                {ROOMS_DATA.slice(0, 6).map(r => (
                  <button
                    key={r.name}
                    onClick={() => setSelectedRoomFilter(curr => curr === r.name ? 'all' : r.name)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all shrink-0 ${
                      selectedRoomFilter === r.name
                        ? 'border-current shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                    style={{
                      color: selectedRoomFilter === r.name ? r.color : undefined,
                      borderColor: selectedRoomFilter === r.name ? r.color : undefined,
                      backgroundColor: selectedRoomFilter === r.name ? `${r.color}15` : undefined,
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Room Showtimes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRooms.map(room => (
                <RoomShowtimeCard
                  key={room.name}
                  room={room}
                  selectedDate={selectedDate}
                  dateBookings={dateBookings}
                  onSelectSlot={(slotInfo) => handleStartBooking(slotInfo)}
                  onOpenBooking={(b) => setDetailBooking(b)}
                />
              ))}
            </div>
          </div>
        )}

        {/* VIEW 2: Monthly Calendar Grid */}
        {currentView === 'calendar' && (
          <MonthlyCalendarView
            bookings={bookings}
            selectedDate={selectedDate}
            onDayClick={(dateStr) => {
              setSelectedDate(dateStr)
              setCurrentView('showtimes')
            }}
            onEventClick={(b) => setDetailBooking(b)}
          />
        )}

        {/* VIEW 3: My Bookings & Tickets */}
        {currentView === 'my-bookings' && (
          <div>
            {lineUser ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-black text-slate-900">
                    รายการการจองของฉัน ({myBookings.length})
                  </h3>
                  <button
                    onClick={() => handleStartBooking()}
                    className="px-4 py-2 rounded-xl bg-[#c62419] text-white text-xs font-bold shadow-xs hover:bg-[#9a1c13] transition-colors"
                  >
                    + จองเกมใหม่
                  </button>
                </div>

                {myBookings.length === 0 ? (
                  <div className="py-16 px-4 rounded-3xl bg-white border border-slate-200 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-2xl">
                      <i className="fas fa-ticket-alt" />
                    </div>
                    <h4 className="text-base font-bold text-slate-900 mb-1">ยังไม่มีประวัติการจอง</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
                      เลือกรอบเวลาและห้องที่คุณสนใจ แล้วเปิดตี้เพื่อชวนเพื่อนๆ มาร่วมสืบคดีได้เลย
                    </p>
                    <button
                      onClick={() => setCurrentView('showtimes')}
                      className="px-5 py-2.5 rounded-xl bg-[#c62419] text-white text-xs font-bold shadow-xs hover:bg-[#9a1c13] transition-colors"
                    >
                      ดูตารางรอบห้องว่าง
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {myBookings.map(b => (
                      <BookingTicketCard
                        key={b.id}
                        booking={b}
                        lineUser={lineUser}
                        onOpen={(booking) => setDetailBooking(booking)}
                        onCloseBooking={() => {}}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* VIP Club Guest Card */
              <div className="max-w-xl mx-auto rounded-3xl bg-white border border-slate-200/90 p-8 shadow-sm text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-4 text-2xl shadow-xs">
                  <i className="fas fa-crown" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-1.5">
                  เข้าสู่ระบบด้วย LINE เพื่อดูการจอง
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6 leading-relaxed">
                  เชื่อมต่อบัญชี LINE เพื่อดูตั๋วการจอง ชวนเพื่อนเข้าตี้ และรับการแจ้งเตือนสถานะห้องแบบเรียลไทม์
                </p>

                <button
                  onClick={onLogin}
                  className="w-full py-4 rounded-2xl bg-[#06c755] hover:bg-[#05a848] text-white font-bold text-sm shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <i className="fab fa-line text-xl" />
                  <span>เข้าสู่ระบบด้วย LINE ทันที</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showCreateModal && (
        <CreateBookingModal
          allGames={allGames}
          bookings={bookings}
          lineUser={lineUser}
          initialData={createInitialData}
          onClose={() => setShowCreateModal(false)}
          showToast={showToast}
        />
      )}

      {detailBooking && (
        <BookingDetailModal
          booking={detailBooking}
          lineUser={lineUser}
          onClose={() => {
            setDetailBooking(null)
            const params = new URLSearchParams(window.location.search)
            if (params.has('booking')) window.history.replaceState({}, '', '/booking')
          }}
          showToast={showToast}
          onUpdated={() => {}}
        />
      )}
    </div>
  )
}
