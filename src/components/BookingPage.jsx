import { useState, useEffect, useCallback } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, getDoc
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { QRCodeSVG } from 'qrcode.react'
import { db, storage } from '../firebase'

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

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  locked: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  collapsed: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
}

const TIME_SLOTS = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']

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
  const target = phoneOrId.replace(/[-\s]/g, '').replace(/^0/, '66')
  const acct = f('00', 'A000000677010111') + f('01', target)
  let s = f('00', '01') + f('01', '12') + f('29', acct) + f('53', '764')
  if (amount > 0) s += f('54', amount.toFixed(2))
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
function StatusBadge({ status, size = 'text-[11px]', label }) {
  const style = STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold border ${size} ${style}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label || STATUS_LABELS[status] || status}
    </span>
  )
}

// ── Interactive Room Calendar with Selected Day Panel ─────────────────────────
function BookingCalendar({ bookings, onDayClick, selectedDate, onEventClick, onBookToday }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedRoomFilter, setSelectedRoomFilter] = useState('all')

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

  // Group active bookings by date
  const bookingsByDate = {}
  bookings.forEach(b => {
    if (!b.date || b.status === 'cancelled' || b.status === 'collapsed') return
    if (!bookingsByDate[b.date]) bookingsByDate[b.date] = []
    bookingsByDate[b.date].push(b)
  })

  // Selected day bookings sorted by time
  const selectedDayBookings = (bookingsByDate[activeDateStr] || [])
    .slice()
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-800">
      {/* Calendar Header: Month/Year + Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-100">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {MONTH_NAMES[viewMonth]}
          </h2>
          <span className="text-sm sm:text-base font-bold text-slate-500">
            {viewYear + 543}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-white transition-all shadow-xs flex items-center gap-1.5"
          >
            <i className="fas fa-calendar-day text-[#c62419] text-[10px]" />
            <span>วันนี้</span>
          </button>
          <div className="w-px h-4 bg-slate-200" />
          <button
            onClick={prevMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
            title="เดือนก่อนหน้า"
          >
            <i className="fas fa-chevron-left text-xs" />
          </button>
          <button
            onClick={nextMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
            title="เดือนถัดไป"
          >
            <i className="fas fa-chevron-right text-xs" />
          </button>
        </div>
      </div>

      {/* Room Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedRoomFilter('all')}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
            selectedRoomFilter === 'all'
              ? 'bg-[#c62419] text-white border-[#c62419] shadow-sm'
              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          ทุกห้อง ({ALL_ROOMS.length})
        </button>
        {ALL_ROOMS.map(r => {
          const isSel = selectedRoomFilter === r
          const rc = ROOM_COLORS[r] || '#64748b'
          return (
            <button
              key={r}
              onClick={() => setSelectedRoomFilter(curr => curr === r ? 'all' : r)}
              className={`shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                isSel
                  ? 'border-current shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              style={{
                color: isSel ? rc : undefined,
                backgroundColor: isSel ? `${rc}14` : undefined,
                borderColor: isSel ? rc : undefined,
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rc }} />
              <span>{r}</span>
            </button>
          )
        })}
      </div>

      {/* Monthly Grid Container */}
      <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-xs">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center py-2 text-[11px] font-bold tracking-wider uppercase">
          {DAY_NAMES.map((d, i) => (
            <div key={d} className={i === 0 ? 'text-[#c62419]' : 'text-slate-500'}>
              {d}
            </div>
          ))}
        </div>

        {/* Days Matrix */}
        <div className="grid grid-cols-7 gap-px bg-slate-200/80">
          {cells.map((day, idx) => {
            const col = idx % 7
            const isSun = col === 0

            if (!day) {
              return (
                <div key={`empty-${idx}`} className="bg-slate-50/40 min-h-[76px] sm:min-h-[88px]" />
              )
            }

            const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
            let dayBookings = bookingsByDate[dateStr] || []
            if (selectedRoomFilter !== 'all') {
              dayBookings = dayBookings.filter(b => b.room === selectedRoomFilter)
            }
            const isToday = todayStr === dateStr
            const isSel = activeDateStr === dateStr
            const isPast = dateStr < todayStr

            return (
              <div
                key={day}
                onClick={() => onDayClick(dateStr)}
                className={`group relative p-1.5 sm:p-2 min-h-[76px] sm:min-h-[88px] transition-all flex flex-col justify-between cursor-pointer ${
                  isSel
                    ? 'bg-red-50/70 ring-2 ring-inset ring-[#c62419] z-10'
                    : isToday
                      ? 'bg-amber-50/40 hover:bg-slate-50'
                      : isPast
                        ? 'bg-slate-50/70 text-slate-400 hover:bg-white'
                        : 'bg-white hover:bg-slate-50'
                }`}
              >
                {/* Cell Header: Count Badge + Day Number */}
                <div className="flex items-center justify-between mb-1">
                  {dayBookings.length > 0 ? (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-red-100 text-[#c62419]">
                      {dayBookings.length}
                    </span>
                  ) : <span />}

                  <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold leading-none ${
                    isToday
                      ? 'bg-[#c62419] text-white shadow-xs'
                      : isSel
                        ? 'text-[#c62419] font-black'
                        : isSun
                          ? 'text-[#c62419]'
                          : isPast
                            ? 'text-slate-400'
                            : 'text-slate-800'
                  }`}>
                    {day}
                  </span>
                </div>

                {/* Event Pills */}
                <div className="flex flex-col gap-1 w-full">
                  {dayBookings.slice(0, 2).map(b => {
                    const rc = ROOM_COLORS[b.room] || '#64748b'
                    return (
                      <button
                        key={b.id}
                        title={`${b.gameName || b.room} — ${b.time || ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick?.(b)
                        }}
                        className="w-full text-left truncate rounded px-1.5 py-0.5 text-[10px] font-bold tracking-tight transition-transform hover:scale-[1.02] border"
                        style={{
                          backgroundColor: `${rc}12`,
                          borderColor: `${rc}30`,
                          color: rc,
                        }}
                      >
                        {b.time && <span className="opacity-80 mr-1">{b.time}</span>}
                        <span>{b.room || b.gameName || 'รอบเล่น'}</span>
                      </button>
                    )
                  })}
                  {dayBookings.length > 2 && (
                    <div className="text-[9px] font-bold text-slate-500 px-1 leading-tight">
                      +{dayBookings.length - 2} อื่นๆ
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Day Schedule Panel */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[#c62419] text-base">✦</span>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                {activeDateStr === todayStr ? 'รอบการเล่นวันนี้' : `รอบการเล่นวันที่ ${fmtDate(activeDateStr)}`}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedDayBookings.length > 0
                ? `พบการจอง ${selectedDayBookings.length} รายการสำหรับวันที่เลือก`
                : 'ยังไม่มีคิวการจองในวันนี้ — เปิดห้องเป็นตี้แรกได้เลย!'}
            </p>
          </div>

          <button
            onClick={() => onBookToday?.(activeDateStr)}
            className="px-4 py-2 rounded-xl bg-[#c62419] hover:bg-[#9a1c13] text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
          >
            <i className="fas fa-plus text-[10px]" />
            <span>+ จองรอบวันนี้</span>
          </button>
        </div>

        {/* Sessions List or Empty State */}
        {selectedDayBookings.length === 0 ? (
          <div className="py-8 px-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-center my-2">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#c62419] flex items-center justify-center mx-auto mb-2.5 text-lg">
              <i className="fas fa-door-open" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">
              วันนี้ทุกห้องยังว่างอยู่
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-3.5 leading-relaxed">
              คุณสามารถเป็นคนแรกที่เปิดห้อง นัดหมายเวลา และชวนเพื่อนมาร่วมสืบคดีได้ทันที
            </p>
            <button
              onClick={() => onBookToday?.(activeDateStr)}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-[#c62419] border border-red-200 text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              + เปิดตี้จองวันนี้
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
            {selectedDayBookings.map(b => {
              const rc = ROOM_COLORS[b.room] || '#64748b'
              const bImg = b.gameImage ? convertImg(b.gameImage, 300) : null
              const totalM = b.members?.length || 0
              return (
                <div
                  key={b.id}
                  onClick={() => onEventClick?.(b)}
                  className="group flex gap-3 p-3 rounded-xl bg-white border border-slate-200/90 hover:border-[#c62419] hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                >
                  {/* Poster Thumbnail */}
                  <div className="w-16 h-20 rounded-lg overflow-hidden shrink-0 bg-slate-100 relative">
                    {bImg ? (
                      <img
                        src={bImg}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <i className="fas fa-dice-d20 text-lg" />
                      </div>
                    )}
                    {b.time && (
                      <div className="absolute bottom-0 inset-x-0 bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-mono font-bold text-center py-0.5">
                        {b.time}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{
                            color: rc,
                            borderColor: `${rc}35`,
                            backgroundColor: `${rc}10`,
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rc }} />
                          {b.room || 'ไม่ระบุห้อง'}
                        </span>
                        <StatusBadge status={b.status} size="text-[10px]" />
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#c62419] transition-colors truncate">
                        {b.gameName || 'การจองห้อง'}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                      <span className="flex items-center gap-1.5">
                        <i className="fas fa-users text-[#c62419] text-[10px]" />
                        <span>{totalM}/{b.maxMembers || 6} คน</span>
                      </span>
                      <span className="text-xs font-bold text-[#c62419] group-hover:translate-x-0.5 transition-transform">
                        ดูรายละเอียด ›
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
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

  return (
    <div
      onClick={() => onOpen(booking)}
      className="group relative flex rounded-2xl bg-white border border-slate-200/90 hover:border-[#c62419] hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer"
    >
      {/* Left: Image Strip */}
      <div className="w-20 sm:w-24 shrink-0 relative overflow-hidden bg-slate-100">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <i className="fas fa-scroll text-2xl" />
          </div>
        )}
      </div>

      {/* Right: Content */}
      <div className="flex-1 min-w-0 p-3.5 sm:p-4 flex flex-col justify-between gap-2">
        <div>
          {/* Top Title & Status */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h4 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#c62419] transition-colors truncate">
              {booking.gameName || 'การจองห้อง'}
            </h4>
            <StatusBadge
              status={booking.status}
              size="text-[10px]"
              label={booking.status === 'cancelled' && booking.closedBy ? 'ปิดตี้แล้ว' : undefined}
            />
          </div>

          {/* Metadata Chips */}
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-medium">
              <i className="fas fa-calendar text-[10px] text-slate-400" />
              {fmtDate(booking.date)}
            </span>
            {booking.time && (
              <span className="inline-flex items-center gap-1 font-mono text-slate-700 font-semibold">
                <i className="fas fa-clock text-[10px] text-slate-400" />
                {booking.time} น.
              </span>
            )}
            {booking.room && (
              <span
                className="inline-flex items-center gap-1 font-bold text-[11px]"
                style={{ color: rc }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rc }} />
                {booking.room}
              </span>
            )}
            {isLeader && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-50 text-[#c62419] border border-red-200">
                หัวหน้า
              </span>
            )}
          </div>
        </div>

        {/* Progress & Actions Footer */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
          {/* Members & Deposit Bar */}
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-slate-500 font-medium">
              <span>สมาชิก {total}/{booking.maxMembers || '?'}</span>
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

          {/* Countdown Pill */}
          {countdown && (
            <div className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border ${
              isUrgent
                ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              <i className="fas fa-clock text-[9px]" />
              <span>{countdown}</span>
            </div>
          )}

          {/* Leader Action to Close Collapsed Party */}
          {isLeader && booking.status === 'collapsed' && onCloseBooking && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCloseBooking(booking)
              }}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-[#c62419] text-[#c62419] hover:text-white border border-red-200 text-xs font-bold transition-all flex items-center gap-1"
              title="ปิดตี้ที่ล่ม"
            >
              <i className="fas fa-times-circle" />
              <span>ปิดตี้</span>
            </button>
          )}
        </div>
      </div>

      {/* Leader Notification Badge */}
      {isLeader && pendingRequests > 0 && (
        <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
          {pendingRequests} คำขอรออนุมัติ
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
  const [customTime, setCustomTime] = useState('')
  const [selectedGame, setSelectedGame] = useState(null)
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const finalTime = customTime || selectedTime

  // Active bookings on the selected date
  const activeDateBookings = selectedDate
    ? bookings.filter(b => b.date === selectedDate && !['cancelled', 'collapsed'].includes(b.status))
    : []

  const slotCounts = {}
  activeDateBookings.forEach(b => { if (b.time) slotCounts[b.time] = (slotCounts[b.time] || 0) + 1 })

  const exactSlotBookedIds = new Set(
    activeDateBookings.filter(b => finalTime && b.time === finalTime).map(b => b.gameId)
  )

  const filteredGames = allGames.filter(g =>
    !search || g.title?.toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!selectedGame || !selectedDate || !finalTime) return
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col font-sans text-slate-800 animate-in slide-in-from-bottom duration-200">
        {/* Mobile Swipe Bar */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 sm:hidden" />

        {/* Modal Header */}
        <div className="p-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              จองรอบเกม & เปิดตี้ใหม่
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === 'datetime' ? 'ขั้นตอนที่ 1 / 2 — ระบุวันและเวลาที่ต้องการ' : 'ขั้นตอนที่ 2 / 2 — เลือกบทละครสืบสวน'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times text-xs" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="flex gap-2 px-5 pt-3">
          <div className={`h-1 flex-1 rounded-full transition-all ${
            step === 'datetime' || step === 'game' ? 'bg-[#c62419]' : 'bg-slate-100'
          }`} />
          <div className={`h-1 flex-1 rounded-full transition-all ${
            step === 'game' ? 'bg-[#c62419]' : 'bg-slate-100'
          }`} />
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* STEP 1: Date & Time */}
          {step === 'datetime' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  วันที่ต้องการจอง *
                </label>
                <input
                  type="date"
                  min={toDateStr(new Date())}
                  value={selectedDate}
                  onChange={e => {
                    setSelectedDate(e.target.value)
                    setSelectedTime('')
                    setCustomTime('')
                  }}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-red-100 focus:border-[#c62419] outline-none transition-all"
                />
              </div>

              {/* Active Bookings Notice */}
              {selectedDate && activeDateBookings.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2.5">
                  <i className="fas fa-calendar-check text-sm shrink-0 text-amber-600" />
                  <span>วันนี้มีการจองแล้ว {activeDateBookings.length} รายการ — เลือกรอบเวลาเพื่อเช็คความพร้อม</span>
                </div>
              )}

              {/* Time Slots Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  รอบเวลาเริ่มต้น *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {TIME_SLOTS.map(t => {
                    const isActive = selectedTime === t && !customTime
                    const count = slotCounts[t] || 0
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setSelectedTime(t); setCustomTime('') }}
                        className={`relative py-2.5 px-2 rounded-xl text-xs font-bold transition-all border ${
                          isActive
                            ? 'bg-[#c62419] text-white border-[#c62419] shadow-sm'
                            : count > 0
                              ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {t}
                        {count > 0 && !isActive && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-amber-500 text-white text-[9px] font-black px-1 flex items-center justify-center">
                            {count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Custom Time Option */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  หรือระบุเวลาเอง (ถ้าต้องการ)
                </label>
                <input
                  type="time"
                  value={customTime}
                  onChange={e => {
                    setCustomTime(e.target.value)
                    setSelectedTime('')
                  }}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-sm focus:ring-2 focus:ring-red-100 focus:border-[#c62419] outline-none"
                />
              </div>

              {/* Next Step CTA */}
              <button
                disabled={!selectedDate || !finalTime}
                onClick={() => setStep('game')}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 mt-2 ${
                  selectedDate && finalTime
                    ? 'bg-[#c62419] hover:bg-[#9a1c13] text-white shadow-md shadow-red-900/20 cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>ขั้นตอนถัดไป: เลือกบทละคร</span>
                <i className="fas fa-arrow-right text-xs" />
              </button>
            </div>
          )}

          {/* STEP 2: Select Game */}
          {step === 'game' && (
            <div className="flex flex-col gap-4">
              {/* Selected Slot Recap */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <span>
                  🗓️ วันที่: <strong className="text-slate-900">{fmtDate(selectedDate)}</strong> · เวลา: <strong className="text-[#c62419]">{finalTime} น.</strong>
                </span>
                <button
                  onClick={() => setStep('datetime')}
                  className="text-xs text-[#c62419] hover:underline font-bold"
                >
                  แก้ไข
                </button>
              </div>

              {/* Search Box */}
              <div className="relative">
                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อเกม / สคริปต์..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs placeholder-slate-400 focus:ring-2 focus:ring-red-100 focus:border-[#c62419] outline-none"
                />
              </div>

              {/* Game List Selector */}
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                {filteredGames.map(g => {
                  const isSel = selectedGame?.id === g.id
                  const isExact = exactSlotBookedIds.has(g.id)
                  const gImg = g.image ? convertImg(g.image, 200) : null

                  return (
                    <div
                      key={g.id}
                      onClick={() => setSelectedGame(g)}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSel
                          ? 'bg-red-50/60 border-[#c62419] shadow-xs ring-1 ring-[#c62419]'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-12 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                        {gImg ? (
                          <img src={gImg} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                            <i className="fas fa-dice-d20" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {g.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 flex-wrap">
                          <span>👥 {g.players || (g.characters ? `${g.characters.length} คน` : '6-8 คน')}</span>
                          {g.difficulty && <span>· ความยาก: {g.difficulty}</span>}
                          {isExact && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                              จองเวลานี้แล้ว
                            </span>
                          )}
                        </div>
                      </div>

                      {isSel && (
                        <i className="fas fa-check-circle text-[#c62419] text-base shrink-0 mr-1" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Conflict Note */}
              {selectedGame && exactSlotBookedIds.has(selectedGame.id) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <i className="fas fa-exclamation-triangle shrink-0 text-amber-600" />
                  <span>เกมนี้มีการจองเวลา {finalTime} แล้ว — ยังสามารถส่งคำขอได้ โดยแอดมินจะเป็นผู้พิจารณา</span>
                </div>
              )}

              {/* Deposit Info */}
              {selectedGame && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                  <i className="fas fa-info-circle text-[#c62419]" />
                  <span>หลังแอดมินยืนยันห้อง มีเวลา 3 วันในการชำระมัดจำ ฿{selectedGame.deposit || 0}/คน</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep('datetime')}
                  className="flex-1 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  disabled={!selectedGame || submitting}
                  onClick={handleSubmit}
                  className={`flex-2 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                    selectedGame && !submitting
                      ? 'bg-[#c62419] hover:bg-[#9a1c13] text-white shadow-md shadow-red-900/20 cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>กำลังส่งคำขอ...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane text-[10px]" />
                      <span>ยืนยันการจอง</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Deposit Payment & Slip Modal ──────────────────────────────────────────────
function DepositPaymentModal({ booking, lineUser, onClose, showToast, onUpdated }) {
  const [promptPayPhone, setPromptPayPhone] = useState('')
  const [step, setStep] = useState('qr') // 'qr' | 'upload' | 'done'
  const [slipFile, setSlipFile] = useState(null)
  const [slipPreview, setSlipPreview] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'payment')).then(snap => {
      if (snap.exists()) setPromptPayPhone(snap.data().promptPayPhone || '')
    })
  }, [])

  const amount = booking.depositAmount || 0
  const qrPayload = promptPayPhone ? buildPromptPayQR(promptPayPhone, amount) : ''

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
      const path = `slips/deposits/${booking.id}/${lineUser.uid}_${Date.now()}`
      const fileRef = storageRef(storage, path)
      await uploadBytes(fileRef, slipFile)
      const slipUrl = await getDownloadURL(fileRef)

      const ref = doc(db, 'bookings', booking.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) throw new Error('ไม่พบการจอง')
      const updatedMembers = snap.data().members.map(m =>
        m.uid === lineUser.uid
          ? { ...m, slipUrl, slipStatus: 'pending_verification', slipSubmittedAt: new Date().toISOString() }
          : m
      )
      await updateDoc(ref, { members: updatedMembers, updatedAt: serverTimestamp() })
      showToast('อัปโหลดสลิปสำเร็จ รอแอดมินตรวจสอบ')
      setStep('done')
      onUpdated()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden font-sans text-slate-800 animate-in slide-in-from-bottom duration-200">
        <div className="p-5 flex items-center justify-between border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">ชำระเงินมัดจำ</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{booking.gameName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times text-xs" />
          </button>
        </div>

        <div className="p-6">
          {step === 'done' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl">
                <i className="fas fa-check" />
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">ส่งสลิปสำเร็จแล้ว</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto mb-6 leading-relaxed">
                แอดมินจะตรวจสอบสลิปและยืนยันการชำระเงินโดยเร็วที่สุด (ปกติภายใน 24 ชม.)
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-[#c62419] hover:bg-[#9a1c13] text-white font-bold text-xs transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          )}

          {step === 'upload' && (
            <div className="flex flex-col gap-4 text-center">
              <div className="text-xs text-slate-600 font-medium">ตรวจสอบความถูกต้องของสลิป</div>
              {slipPreview && (
                <div className="max-h-64 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
                  <img src={slipPreview} alt="slip preview" className="max-h-64 object-contain" />
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => { setSlipFile(null); setSlipPreview(''); setStep('qr') }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
                >
                  เลือกใหม่
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleSubmit}
                  className="flex-1 py-3 rounded-xl bg-[#06c755] hover:bg-[#05a848] text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>กำลังอัปโหลด...</span>
                    </>
                  ) : (
                    <span>ยืนยันส่งสลิป</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'qr' && (
            <div className="flex flex-col items-center">
              {promptPayPhone ? (
                <>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-md mb-3">
                    <QRCodeSVG value={qrPayload} size={190} bgColor="#fff" fgColor="#0f172a" level="M" />
                  </div>
                  <div className="text-sm font-mono font-bold text-slate-800 mb-1">
                    PromptPay: {promptPayPhone}
                  </div>
                  <div className="text-xs text-slate-500 mb-6">
                    ยอดชำระ: <strong className="text-emerald-600 font-bold">฿{amount}</strong> ต่อคน
                  </div>

                  <label className="w-full py-3.5 px-4 rounded-xl bg-[#06c755] hover:bg-[#05a848] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer transition-all">
                    <i className="fas fa-upload text-sm" />
                    <span>โอนเงินแล้ว — แนบสลิปที่นี่</span>
                    <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                  </label>
                </>
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs">
                  <i className="fas fa-exclamation-circle text-2xl mb-2 block opacity-40" />
                  <span>ยังไม่ได้ตั้งค่าบัญชี PromptPay ของร้าน</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Booking Detail & Party Lounge Modal ───────────────────────────────────────
function BookingDetailModal({ booking, lineUser, onClose, showToast, onUpdated }) {
  const [joining, setJoining] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [approvingUid, setApprovingUid] = useState(null)
  const [rejectingUid, setRejectingUid] = useState(null)
  const [showDepositPay, setShowDepositPay] = useState(false)

  const isMember = booking.members?.some(m => m.uid === lineUser?.uid)
  const isLeader = booking.leaderId === lineUser?.uid
  const myMember = booking.members?.find(m => m.uid === lineUser?.uid)
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

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div className="w-full max-w-xl bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col font-sans text-slate-800 animate-in slide-in-from-bottom duration-200">
          {/* Hero Cover Header */}
          <div className="relative h-48 sm:h-52 overflow-hidden shrink-0">
            {imgSrc ? (
              <img src={imgSrc} alt="" className="w-full h-full object-cover filter brightness-75" />
            ) : (
              <div className="w-full h-full bg-slate-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

            {/* Room Chip in Hero */}
            {booking.room && (
              <div className="absolute top-4 left-4">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md border shadow-sm text-white"
                  style={{
                    backgroundColor: `${rc}40`,
                    borderColor: `${rc}80`,
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rc }} />
                  {booking.room}
                </span>
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center border border-white/20 backdrop-blur-xs transition-colors"
            >
              <i className="fas fa-times text-xs" />
            </button>

            {/* Bottom Title & Date */}
            <div className="absolute bottom-4 left-5 right-5">
              <StatusBadge status={booking.status} size="text-[10px]" />
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1.5 tracking-tight truncate">
                {booking.gameName || 'การจองห้อง'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-200 mt-1">
                <span>{fmtDate(booking.date)}</span>
                {booking.time && (
                  <span className="flex items-center gap-1 font-mono">
                    <span className="opacity-40">·</span>
                    <i className="fas fa-clock text-[10px] text-slate-300" />
                    {booking.time} น.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4">
            {/* Urgent Countdown Banner */}
            {countdown && booking.status === 'confirmed' && (
              <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${
                isUrgent
                  ? 'bg-rose-50 border-rose-200 text-rose-800 animate-pulse'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <i className="fas fa-clock text-base shrink-0" />
                <div className="flex-1 text-xs">
                  <div className="font-bold">ต้องชำระมัดจำภายใน {countdown}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">เมื่อสมาชิกจ่ายครบทุกคน ระบบจะยืนยันล็อกห้องให้ทันที</div>
                </div>
              </div>
            )}

            {/* Collapsed Warning */}
            {booking.status === 'collapsed' && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <i className="fas fa-exclamation-triangle shrink-0 text-rose-600" />
                  <span>ปาร์ตี้นี้ล่มเนื่องจากหมดเวลาชำระมัดจำ</span>
                </div>
                {isLeader && (
                  <button
                    onClick={handleCloseBooking}
                    disabled={closing}
                    className="px-3 py-1 rounded-lg bg-[#c62419] hover:bg-[#9a1c13] text-white font-bold text-xs shrink-0 transition-colors"
                  >
                    {closing ? 'กำลังปิดตี้...' : 'ปิดตี้'}
                  </button>
                )}
              </div>
            )}

            {/* Pending Requests for Leader */}
            {isLeader && (booking.joinRequests?.length > 0) && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <i className="fas fa-bell text-[11px] text-amber-600" />
                  <span>คำขอเข้าร่วมปาร์ตี้ ({booking.joinRequests.length})</span>
                </div>
                <div className="flex flex-col gap-2">
                  {booking.joinRequests.map(req => (
                    <div
                      key={req.uid}
                      className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white border border-slate-200"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {req.avatar ? (
                          <img src={req.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {(req.name || '?')[0]}
                          </div>
                        )}
                        <span className="text-xs font-bold text-slate-800 truncate">{req.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleApproveRequest(req)}
                          disabled={approvingUid === req.uid}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors"
                        >
                          รับ
                        </button>
                        <button
                          onClick={() => handleRejectRequest(req)}
                          disabled={rejectingUid === req.uid}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-[#c62419] text-[11px] font-bold transition-colors"
                        >
                          ปฏิเสธ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Members Section */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-700 uppercase tracking-wider">
                  สมาชิก ({total}/{booking.maxMembers || 6})
                </span>
                <span className={allPaid ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                  จ่ายมัดจำแล้ว {paidCount}/{total}
                </span>
              </div>

              {/* Progress */}
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    allPaid ? 'bg-emerald-500' : 'bg-[#c62419]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, paidPct))}%` }}
                />
              </div>

              {/* Members List */}
              <div className="flex flex-col gap-2">
                {(booking.members || []).map(m => (
                  <div
                    key={m.uid}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/90"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        {m.avatar ? (
                          <img
                            src={m.avatar}
                            alt=""
                            className={`w-9 h-9 rounded-full object-cover ${
                              m.paidDeposit ? 'ring-2 ring-emerald-500' : ''
                            }`}
                          />
                        ) : (
                          <div className={`w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 ${
                            m.paidDeposit ? 'ring-2 ring-emerald-500' : ''
                          }`}>
                            {(m.name || '?')[0]}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 truncate">
                          <span>{m.name}</span>
                          {m.uid === booking.leaderId && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-red-100 text-[#c62419]">
                              หัวหน้า
                            </span>
                          )}
                        </div>
                        {m.slipStatus === 'pending_verification' && !m.paidDeposit && (
                          <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                            รอแอดมินตรวจสลิป
                          </div>
                        )}
                        {m.paidDeposit && (
                          <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
                            ชำระมัดจำเรียบร้อย
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {m.slipUrl && (
                        <a
                          href={m.slipUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7 h-7 rounded-lg overflow-hidden border border-slate-300 block shadow-xs"
                          title="ดูสลิป"
                        >
                          <img src={m.slipUrl} alt="" className="w-full h-full object-cover" />
                        </a>
                      )}
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        m.paidDeposit
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : m.slipStatus === 'pending_verification'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {m.paidDeposit ? 'จ่ายแล้ว' : m.slipStatus === 'pending_verification' ? 'รอตรวจ' : 'ยังไม่จ่าย'}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Empty Slots */}
                {Array.from({ length: Math.max(0, (booking.maxMembers || 0) - total) }).map((_, i) => (
                  <div
                    key={`slot-${i}`}
                    className="p-2.5 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 font-medium bg-white"
                  >
                    ว่าง — รอสมาชิกเข้าร่วม
                  </div>
                ))}
              </div>
            </div>

            {/* Admin Note if any */}
            {booking.adminNote && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <span className="font-bold text-amber-700 mr-1.5">[โน้ตจากแอดมิน]</span>
                {booking.adminNote}
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              {/* Join Request Button */}
              {!isMember && !myRequest && lineUser && ['confirmed', 'pending'].includes(booking.status) && total < (booking.maxMembers || 99) && (
                <button
                  onClick={handleRequestJoin}
                  disabled={joining}
                  className="w-full py-3.5 rounded-xl bg-[#c62419] hover:bg-[#9a1c13] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-red-900/15 transition-all cursor-pointer"
                >
                  {joining ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>กำลังส่งคำขอ...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-user-plus" />
                      <span>ขอเข้าร่วมปาร์ตี้นี้</span>
                    </>
                  )}
                </button>
              )}

              {/* Pending Request Badge */}
              {!isMember && myRequest && lineUser && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold text-center">
                  คุณได้ส่งคำขอเข้าร่วมแล้ว — รอหัวปาร์ตี้อนุมัติ
                </div>
              )}

              {/* Pay Deposit Button */}
              {isMember && booking.status === 'confirmed' && !myMember?.paidDeposit && myMember?.slipStatus !== 'pending_verification' && (
                <button
                  onClick={() => setShowDepositPay(true)}
                  className="w-full py-3.5 rounded-xl bg-[#06c755] hover:bg-[#05a848] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <i className="fas fa-qrcode text-sm" />
                  <span>จ่ายมัดจำ ฿{booking.depositAmount} / แนบสลิป</span>
                </button>
              )}

              {/* Secondary Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleShare}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <i className={`fas fa-${copied ? 'check text-emerald-600' : 'share-alt'}`} />
                  <span>{copied ? 'คัดลอกแล้ว' : 'แชร์ชวนเพื่อน'}</span>
                </button>

                {isMember && !isLeader && (
                  <button
                    onClick={handleLeave}
                    disabled={leaving}
                    className="flex-1 py-2.5 rounded-xl bg-red-50 hover:bg-[#c62419] text-[#c62419] hover:text-white border border-red-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <i className="fas fa-sign-out-alt" />
                    <span>ออกจากปาร์ตี้</span>
                  </button>
                )}

                {isLeader && ['collapsed', 'pending'].includes(booking.status) && (
                  <button
                    onClick={handleCloseBooking}
                    disabled={closing}
                    className="flex-1 py-2.5 rounded-xl bg-red-50 hover:bg-[#c62419] text-[#c62419] hover:text-white border border-red-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <i className="fas fa-times-circle" />
                    <span>{closing ? 'กำลังปิด...' : 'ปิดตี้'}</span>
                  </button>
                )}
              </div>
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
      if (found) setDetailBooking(found)
    }
  }, [bookings])

  // Keep detail modal updated with Firestore changes
  useEffect(() => {
    if (detailBooking) {
      const fresh = bookings.find(b => b.id === detailBooking.id)
      if (fresh) setDetailBooking(fresh)
    }
  }, [bookings])

  const openDetail = useCallback((b) => setDetailBooking(b), [])
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500 font-sans">
        <div className="w-10 h-10 border-3 border-slate-200 border-t-[#c62419] rounded-full animate-spin" />
        <div className="text-xs font-semibold tracking-wide">กำลังโหลดระบบจองห้อง...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 font-sans pt-14 pb-20">
      {/* ── Editorial Header Section ────────────────────────────────────────── */}
      <section className="bg-white border-b border-slate-200/90 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl">
              {/* Category Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-100 text-[#c62419] text-xs font-bold uppercase tracking-wider mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c62419]" />
                <span>SOFUN MYSTERY LOUNGE · BOOKING SYSTEM</span>
              </div>

              {/* Title & Description */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight mb-2.5">
                จองรอบเกม & ตารางห้อง
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-5">
                เลือกวันเวลา เช็คตารางห้องว่างแบบเรียลไทม์ หรือสร้างปาร์ตี้เพื่อเปิดห้องสืบคดีได้ทันที
              </p>

              {/* Live Metric Badges */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium">
                  <i className="fas fa-theater-masks text-[#c62419]" />
                  <span><strong className="text-slate-900 font-bold">{allGames.length || '50+'}</strong> สคริปต์เกม</span>
                </div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium">
                  <i className="fas fa-door-open text-amber-600" />
                  <span><strong className="text-slate-900 font-bold">12</strong> ห้องธีมเสมือนจริง</span>
                </div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium">
                  <i className="fas fa-calendar-check text-emerald-600" />
                  <span><strong className="text-slate-900 font-bold">{upcomingCount}</strong> รอบที่ยืนยันแล้ว</span>
                </div>
              </div>
            </div>

            {/* Header Primary Action */}
            <div className="shrink-0 flex items-center">
              {lineUser ? (
                <button
                  onClick={() => handleStartBooking()}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#c62419] hover:bg-[#9a1c13] text-white font-bold text-sm shadow-md shadow-red-900/15 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <i className="fas fa-plus text-xs" />
                  <span>+ จองเกมใหม่</span>
                </button>
              ) : (
                <button
                  onClick={onLogin}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#06c755] hover:bg-[#05a848] text-white font-bold text-sm shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <i className="fab fa-line text-lg" />
                  <span>เข้าสู่ระบบด้วย LINE</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Two-Column Layout ─────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: My Bookings or VIP Pass Card */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {lineUser ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm">
              {/* Header & New Party Button */}
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    การจองของฉัน
                  </h3>
                  {activeMyBookings.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-[#c62419]">
                      {activeMyBookings.length}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleStartBooking()}
                  className="text-xs font-bold text-[#c62419] hover:text-[#9a1c13] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <i className="fas fa-plus text-[10px]" />
                  <span>สร้างตี้</span>
                </button>
              </div>

              {/* Segmented Tab Switcher */}
              <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-100 text-xs font-semibold mb-4">
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
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        isActive
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
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
                <div className="py-12 px-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-3 text-lg shadow-xs">
                    <i className="fas fa-calendar-plus" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 mb-1">
                    {myBookingsTab === 'active'
                      ? 'ไม่มีการจองที่กำลังดำเนินอยู่'
                      : myBookingsTab === 'closed'
                        ? 'ไม่มีการจองที่ปิดหรือยกเลิก'
                        : 'ยังไม่มีประวัติการจอง'}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4 leading-relaxed">
                    เลือกบทละครที่สนใจ แล้วกดจองเพื่อสร้างห้องและชวนเพื่อนร่วมตี้
                  </p>
                  <button
                    onClick={() => handleStartBooking()}
                    className="px-4 py-2 rounded-xl bg-[#c62419] hover:bg-[#9a1c13] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    + สร้างการจองใหม่
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
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
            /* Guest / Not logged-in: VIP Lounge Access Pass Card */
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-amber-50/30 to-red-50/20 border border-amber-200/80 p-6 sm:p-7 shadow-sm">
              <div className="relative z-10 flex flex-col items-center text-center">
                {/* Crown VIP Badge */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-xs font-black uppercase tracking-wider mb-3.5">
                  <i className="fas fa-crown text-[10px] text-amber-600" />
                  <span>SOFUN VIP MEMBER PASS</span>
                </div>

                <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight mb-1.5">
                  เข้าสู่ระบบเพื่อเริ่มจอง
                </h3>
                <p className="text-xs text-slate-600 max-w-xs mb-5 leading-relaxed">
                  เชื่อมต่อด้วย LINE เพื่อจัดการรอบเล่น ชวนเพื่อน และรับสิทธิพิเศษสุด Exclusive
                </p>

                {/* VIP Benefits List */}
                <div className="w-full flex flex-col gap-2 text-left mb-6">
                  {[
                    { icon: 'fas fa-door-closed', color: 'text-amber-700 bg-amber-50 border-amber-200', text: 'ล็อคห้องส่วนตัว & เลือกรอบเวลาที่ต้องการ' },
                    { icon: 'fas fa-users', color: 'text-blue-700 bg-blue-50 border-blue-200', text: 'สร้างปาร์ตี้ ส่งลิงก์ชวนเพื่อนร่วมตี้' },
                    { icon: 'fab fa-line', color: 'text-[#06c755] bg-emerald-50 border-emerald-200', text: 'แจ้งเตือนสถานะการจองผ่าน LINE ทันที' },
                    { icon: 'fas fa-gem', color: 'text-[#c62419] bg-red-50 border-red-200', text: 'สะสมแต้มเล่นเกมเพื่อรับส่วนลดพิเศษ' },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs"
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${item.color}`}>
                        <i className={`${item.icon} text-xs`} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700">
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* High-conversion LINE Login Button */}
                <button
                  onClick={onLogin}
                  className="w-full py-3.5 px-6 rounded-xl bg-[#06c755] hover:bg-[#05a848] text-white font-bold text-sm shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <i className="fab fa-line text-lg" />
                  <span>เข้าสู่ระบบด้วย LINE เพื่อจองห้อง</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Schedule & Room Calendar */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4 rounded-full bg-[#c62419]" />
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  ตารางห้อง & ปฏิทินรอบเล่น
                </h3>
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">
                คลิกวันที่เพื่อดูรายละเอียดรอบ
              </span>
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
