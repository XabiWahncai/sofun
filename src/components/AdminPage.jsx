import { useState, useEffect, useMemo } from 'react'
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_RARITY, RARITY } from '../constants/achievements'
import {
  DEFAULT_RECEIPT_SETTINGS, AVAILABLE_FONTS, SEPARATOR_STYLES,
  PAPER_WIDTHS, FONT_WEIGHTS, buildSlipHTML, buildKitchenTicketHTML, fmtSlipDT
} from '../constants/receipt'
import { auth, db } from '../firebase'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, doc, getDoc, deleteDoc, updateDoc, setDoc, serverTimestamp, addDoc, query, orderBy, limit, getDocs, where, Timestamp, writeBatch } from 'firebase/firestore'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import HistoryTab, { MemberHistoryModal, ThermalSlipModal, EditPaymentModal } from './HistoryTab'

/* ds-allow-hardcode: chart SVG attributes — CSS custom properties do not resolve in SVG fill/stroke attributes */
const CHART_COLORS  = ['#c62419', '#4ade80', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#34d399'] /* ds-allow-hardcode */
const CHART_AXIS    = '#888888' /* ds-allow-hardcode */
const CHART_AXIS_LG = '#444444' /* ds-allow-hardcode */
const CHART_GRID    = '#f0f0f0' /* ds-allow-hardcode */
const CHART_BAR_FOOD    = '#60a5fa' /* ds-allow-hardcode */
const CHART_BAR_PLAYERS = '#fbbf24' /* ds-allow-hardcode */
const CHART_LINE_PLAYER = '#a78bfa' /* ds-allow-hardcode */
const CHART_LINE_PARTY  = '#fbbf24' /* ds-allow-hardcode */

function fmtMoney(n) { return n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(Math.round(n)) }
function fmtDate(d) { return `${d.getDate()}/${d.getMonth()+1}` }

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({ allGames, members, onGoTab }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(14) // days
  const [evalList, setEvalList] = useState([])

  useEffect(() => {
    return onSnapshot(collection(db, 'evaluations'), snap => {
      setEvalList(snap.docs.map(d => d.data()))
    }, () => {})
  }, [])

  // ── Report ────────────────────────────────────────────────────────────────
  const [reportOpen, setReportOpen] = useState(false)
  const nowR = new Date()
  const [reportMonth, setReportMonth] = useState(nowR.getMonth())
  const [reportYear,  setReportYear]  = useState(nowR.getFullYear())
  const [reportLoading, setReportLoading] = useState(false)

  const generateReport = async () => {
    setReportLoading(true)
    try {
      const start = new Date(reportYear, reportMonth, 1)
      const end   = new Date(reportYear, reportMonth + 1, 1)
      const q = query(
        collection(db, 'payments'),
        where('paidAt', '>=', Timestamp.fromDate(start)),
        where('paidAt', '<',  Timestamp.fromDate(end)),
        orderBy('paidAt', 'asc')
      )
      const snap = await getDocs(q)
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Fetch linked order docs for personalDiscount per member
      const orderResults = await Promise.all(records.map(async r => {
        if (!r.orderId) return null
        try {
          const os = await getDoc(doc(db, 'orders', r.orderId))
          return os.exists() ? { id: r.id, members: os.data().members || [] } : null
        } catch { return null }
      }))
      const orderMap = {}
      orderResults.forEach(o => { if (o) orderMap[o.id] = o.members })

      // CSV rows
      const h1 = [
        'DATE','TIME','DM','NPC','ROOM','GAMES','จำนวนผู้เล่น',
        'มัดจำรอบแรก','เก็บหน้าแคชเชียร์','ส่วนลดหน้าแคชเชียร์',
        'ส่วนลด/โปรฯ/หมายเหตุอื่น ๆ','','','','','','','','',
      ]
      const h2 = [
        '','','','','','','','','','',
        'ส่วนลดเล่นฟรี','ชื่อ','ส่วนลด',
        'โปรโมชัน','ชื่อโปรโมชัน','ส่วนลด',
        'ส่วนลด Voucher','โค้ด Voucher','ส่วนลด',
      ]

      const rows = records.map(p => {
        const dt = p.openAt?.toDate?.() || p.paidAt?.toDate?.() || null
        const date = dt ? `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}` : ''
        const time = dt ? `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}` : ''
        const orderMembers  = orderMap[p.id] || []
        const freeMembers   = orderMembers.filter(m => (m.personalDiscount || 0) > 0)
        const freeNames     = freeMembers.map(m => m.name || '').join('; ')
        const freeTotal     = freeMembers.reduce((s, m) => s + (m.personalDiscount || 0), 0)
        const promoDisc     = p.discount?.applied || 0
        const hasPromo      = !!(p.promoName) || promoDisc > 0
        const totalDiscount = promoDisc + freeTotal
        return [
          date, time,
          p.dm || '', p.npc || '', p.room || '', p.scriptTitle || '',
          p.members?.length || 0,
          '',                                          // มัดจำรอบแรก
          p.grandTotal || 0,                           // เก็บหน้าแคชเชียร์
          totalDiscount || '',                         // ส่วนลดหน้าแคชเชียร์
          freeMembers.length > 0 ? 'มี' : '',          // ส่วนลดเล่นฟรี
          freeNames,                                   // ชื่อ
          freeTotal || '',                             // ส่วนลด (เล่นฟรี)
          hasPromo ? 'มี' : '',                        // โปรโมชัน
          p.promoName || '',                           // ชื่อโปรโมชัน
          promoDisc || '',                             // ส่วนลด (โปรโมชัน)
          '', '', '',                                  // Voucher (ยังไม่มีข้อมูล)
        ]
      })

      const esc = v => `"${String(v).replace(/"/g, '""')}"`
      const csvRow = arr => arr.map(esc).join(',')
      const csv = '﻿' + [h1, h2, ...rows].map(csvRow).join('\r\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `SoFun_Report_${reportYear}_${String(reportMonth + 1).padStart(2, '0')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setReportOpen(false)
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setReportLoading(false)
    }
  }

  const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

  useEffect(() => {
    const q = query(collection(db, 'payments'), orderBy('paidAt', 'desc'), limit(500))
    const unsub = onSnapshot(q,
      snap => { setPayments(snap.docs.map(d => ({ ...d.data(), id: d.id }))); setLoading(false) },
      () => setLoading(false)
    )
    return unsub
  }, [])

  // ── derived stats ─────────────────────────────────────────────────────────
  const now = new Date()
  const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1)

  const paidDate = p => p.paidAt?.toDate?.() || null

  const todayPay   = payments.filter(p => { const d = paidDate(p); return d && d >= todayStart })
  const weekPay    = payments.filter(p => { const d = paidDate(p); return d && d >= weekStart })
  const monthPay   = payments.filter(p => { const d = paidDate(p); return d && d >= monthStart })

  const sum = arr => arr.reduce((s, p) => s + (p.grandTotal || 0), 0)
  const players = arr => arr.reduce((s, p) => s + (p.members?.length || 0), 0)

  // ── daily chart data ──────────────────────────────────────────────────────
  const days = Array.from({ length: range }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range - 1 - i))
    return d
  })
  const dailyData = days.map(d => {
    const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const de = new Date(ds.getTime() + 86400000)
    const dp = payments.filter(p => { const pd = paidDate(p); return pd && pd >= ds && pd < de })
    return {
      date: fmtDate(d),
      'ค่าเกม': dp.reduce((s, p) => s + (p.gameTotal || 0), 0),
      'ค่าอาหาร': dp.reduce((s, p) => s + (p.foodTotal || 0), 0),
      ปาร์ตี้: dp.length,
      ผู้เล่น: dp.reduce((s, p) => s + (p.members?.length || 0), 0),
    }
  })

  // ── top food items ────────────────────────────────────────────────────────
  const foodMap = {}
  payments.forEach(p => {
    p.foodItems?.forEach(f => {
      if (!foodMap[f.name]) foodMap[f.name] = { name: f.name, qty: 0, revenue: 0 }
      foodMap[f.name].qty += f.qty || 1
      foodMap[f.name].revenue += (f.price || 0) * (f.qty || 1)
    })
  })
  const topFoods = Object.values(foodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8)

  // ── top games ─────────────────────────────────────────────────────────────
  const gameMap = {}
  payments.forEach(p => {
    const k = p.scriptTitle || 'ไม่ระบุ'
    if (!gameMap[k]) gameMap[k] = { name: k, รอบ: 0, ผู้เล่น: 0, revenue: 0 }
    gameMap[k].รอบ++
    gameMap[k].ผู้เล่น += p.members?.length || 0
    gameMap[k].revenue += p.gameTotal || 0
  })
  const topGames = Object.values(gameMap).sort((a, b) => b.รอบ - a.รอบ).slice(0, 6)

  // ── pie data ──────────────────────────────────────────────────────────────
  const totalGame = payments.reduce((s, p) => s + (p.gameTotal || 0), 0)
  const totalFood = payments.reduce((s, p) => s + (p.foodTotal || 0), 0)
  const pieData = [
    { name: 'ค่าเกม', value: totalGame },
    { name: 'ค่าอาหาร', value: totalFood },
  ]

  // ── new members this month ────────────────────────────────────────────────
  const newMembers = members.filter(m => m.createdAt?.seconds && new Date(m.createdAt.seconds*1000) >= monthStart)

  const KpiCard = ({ icon, color, label, value, sub }) => (
    <div className="dash-kpi">
      <div className="dash-kpi-icon" style={{ background: color + '20', color }}>
        <i className={`fas ${icon}`} />
      </div>
      <div className="dash-kpi-body">
        <div className="dash-kpi-label">{label}</div>
        <div className="dash-kpi-value" style={{ color }}>{value}</div>
        {sub && <div className="dash-kpi-sub">{sub}</div>}
      </div>
    </div>
  )

  if (loading) return <div className="adm-loading"><div className="spinner" /></div>

  return (
    <div className="dash-root">

      {/* ── Report modal ── */}
      {reportOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => e.target === e.currentTarget && setReportOpen(false)}>
          <div style={{ background:'var(--surface-card)', borderRadius:16, padding:'32px 28px', width:'100%', maxWidth:420, boxShadow:'0 24px 64px rgba(0,0,0,0.22)', border:'1px solid var(--border-default)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
              <div>
                <h3 style={{ margin:0, fontSize:18, fontWeight:800, color:'var(--text-primary)' }}>
                  <i className="fas fa-file-excel" style={{ color:'var(--crimson-500)', marginRight:10 }} />
                  Export Report
                </h3>
                <p style={{ margin:'4px 0 0', fontSize:12, color:'var(--text-tertiary)' }}>ดาวน์โหลด CSV สำหรับนำเข้า Google Sheets</p>
              </div>
              <button onClick={() => setReportOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--text-tertiary)', padding:4 }}>
                <i className="fas fa-times" />
              </button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em' }}>เดือน</label>
                <select value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border-default)', background:'var(--surface-page)', color:'var(--text-primary)', fontSize:14, fontFamily:"'Sarabun',sans-serif" }}>
                  {MONTHS_TH.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em' }}>ปี</label>
                <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border-default)', background:'var(--surface-page)', color:'var(--text-primary)', fontSize:14, fontFamily:"'Sarabun',sans-serif" }}>
                  {[nowR.getFullYear()-1, nowR.getFullYear(), nowR.getFullYear()+1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div style={{ background:'var(--surface-page)', borderRadius:10, padding:'12px 14px', marginBottom:20, border:'1px solid var(--border-default)' }}>
              <p style={{ margin:0, fontSize:11, color:'var(--text-tertiary)', lineHeight:1.7 }}>
                <i className="fas fa-info-circle" style={{ marginRight:6, color:'var(--crimson-500)' }} />
                ไฟล์ CSV จะมี 19 คอลัมน์ตามรูปแบบที่กำหนด<br />
                เปิดใน Google Sheets: <strong>File → Import → Upload</strong>
              </p>
            </div>

            <button onClick={generateReport} disabled={reportLoading}
              style={{ width:'100%', padding:'14px', borderRadius:10, background:'var(--crimson-500)', color:'#fff', border:'none', cursor: reportLoading ? 'not-allowed' : 'pointer', fontSize:14, fontWeight:800, fontFamily:"'Sarabun',sans-serif", opacity: reportLoading ? 0.7 : 1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {reportLoading
                ? <><div style={{ width:16, height:16, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> กำลังสร้าง Report...</>
                : <><i className="fas fa-download" /> ดาวน์โหลด {MONTHS_TH[reportMonth]} {reportYear}</>
              }
            </button>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      )}

      {/* ── KPI row ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text-tertiary)' }}>ภาพรวมธุรกิจ</span>
        <button onClick={() => setReportOpen(true)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 18px', borderRadius:8, background:'var(--surface-card)', border:'1px solid var(--border-default)', color:'var(--text-primary)', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Sarabun',sans-serif", transition:'border-color 0.18s, color 0.18s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='var(--crimson-500)'; e.currentTarget.style.color='var(--crimson-500)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border-default)'; e.currentTarget.style.color='var(--text-primary)' }}>
          <i className="fas fa-file-export" />
          Report รายเดือน
        </button>
      </div>
      <div className="dash-kpi-grid">
        <KpiCard icon="fa-calendar-day" color="var(--crimson-500)" label="วันนี้"
          value={`฿${sum(todayPay).toLocaleString()}`}
          sub={`${todayPay.length} ปาร์ตี้ · ${players(todayPay)} ผู้เล่น`} />
        <KpiCard icon="fa-calendar-week" color="#60a5fa" /* ds-allow-hardcode */ label="สัปดาห์นี้"
          value={`฿${sum(weekPay).toLocaleString()}`}
          sub={`${weekPay.length} ปาร์ตี้`} />
        <KpiCard icon="fa-calendar-alt" color="#4ade80" /* ds-allow-hardcode */ label="เดือนนี้"
          value={`฿${sum(monthPay).toLocaleString()}`}
          sub={`${monthPay.length} ปาร์ตี้ · ${players(monthPay)} ผู้เล่น`} />
        <KpiCard icon="fa-users" color="#a78bfa" /* ds-allow-hardcode */ label="สมาชิก"
          value={members.length}
          sub={`+${newMembers.length} เดือนนี้`} />
        <KpiCard icon="fa-scroll" color="#fbbf24" /* ds-allow-hardcode */ label="สคริปต์"
          value={allGames.length}
          sub={`${topGames.length} เกมที่เคยเล่น`} />
        <KpiCard icon="fa-coins" color="#fb923c" /* ds-allow-hardcode */ label="รายได้รวม"
          value={`฿${(totalGame+totalFood).toLocaleString()}`}
          sub={`เกม ฿${totalGame.toLocaleString()} · อาหาร ฿${totalFood.toLocaleString()}`} />
      </div>

      {/* ── Evaluations KPI Row ── */}
      <div style={{ marginTop: 14, background: 'var(--surface-card)', borderRadius: 14, border: '1px solid var(--border-default)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            <i className="fas fa-star" />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ความพึงพอใจลูกค้า ({evalList.length} รีวิว)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                เกม: <strong style={{ color: '#f59e0b' }}>⭐ {evalList.length > 0 ? (evalList.reduce((s, e) => s + (Number(e.gameRating) || 0), 0) / evalList.length).toFixed(1) : '—'}</strong>/5
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                DM: <strong style={{ color: '#ec4899' }}><i className="fas fa-crown" style={{ fontSize: 11, marginRight: 4 }} />{evalList.length > 0 ? (evalList.reduce((s, e) => s + (Number(e.dmRating) || 0), 0) / evalList.length).toFixed(1) : '—'}</strong>/5
              </span>
            </div>
          </div>
        </div>
        {onGoTab && (
          <button
            onClick={() => onGoTab('evaluations')}
            style={{
              padding: '8px 16px', borderRadius: 8, background: 'var(--surface-page)',
              border: '1px solid var(--border-default)', color: 'var(--text-primary)',
              cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: "'Sarabun',sans-serif"
            }}
          >
            ดูแบบประเมินทั้งหมด <i className="fas fa-arrow-right" style={{ fontSize: 11 }} />
          </button>
        )}
      </div>

      {/* ── Range selector ── */}
      <div className="dash-range-row">
        <span className="dash-section-title"><i className="fas fa-chart-bar" /> ยอดขายรายวัน</span>
        <div className="dash-range-btns">
          {[7,14,30].map(d => (
            <button key={d} className={`dash-range-btn${range===d?' active':''}`} onClick={()=>setRange(d)}>
              {d} วัน
            </button>
          ))}
        </div>
      </div>

      {/* ── Daily revenue bar chart ── */}
      <div className="dash-chart-card">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_AXIS }} />
            <YAxis tickFormatter={fmtMoney} tick={{ fontSize: 11, fill: CHART_AXIS }} width={40} />
            <Tooltip formatter={(v) => `฿${v.toLocaleString()}`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="ค่าเกม" fill={CHART_COLORS[0]} radius={[3,3,0,0]} />
            <Bar dataKey="ค่าอาหาร" fill={CHART_BAR_FOOD} radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Second row: Party trend + Pie ── */}
      <div className="dash-row2">
        {/* Party & player trend */}
        <div className="dash-chart-card">
          <div className="dash-chart-title">ผู้เล่นต่อวัน</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: CHART_AXIS }} />
              <YAxis tick={{ fontSize: 10, fill: CHART_AXIS }} width={25} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="ผู้เล่น" stroke={CHART_LINE_PLAYER} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="ปาร์ตี้" stroke={CHART_LINE_PARTY} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pie: game vs food */}
        <div className="dash-chart-card">
          <div className="dash-chart-title">สัดส่วนรายได้</div>
          {(totalGame + totalFood) > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72}
                  dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                  labelLine={false} fontSize={11}>
                  {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={v => `฿${v.toLocaleString()}`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="adm-empty" style={{height:180,display:'flex',alignItems:'center',justifyContent:'center'}}>ยังไม่มีข้อมูล</div>
          )}
        </div>
      </div>

      {/* ── Third row: Top food + Top games ── */}
      <div className="dash-row2">
        {/* Top food */}
        <div className="dash-chart-card">
          <div className="dash-chart-title"><i className="fas fa-utensils" /> เมนูยอดนิยม (รายได้)</div>
          {topFoods.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(160, topFoods.length*34)}>
              <BarChart data={topFoods} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
                <XAxis type="number" tickFormatter={fmtMoney} tick={{ fontSize: 10, fill: CHART_AXIS }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: CHART_AXIS_LG }} width={80} />
                <Tooltip formatter={(v, n) => n === 'revenue' ? `฿${v.toLocaleString()}` : `${v} ชิ้น`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="revenue" name="รายได้" fill={CHART_BAR_FOOD} radius={[0,4,4,0]}
                  label={{ position: 'right', formatter: v => `฿${fmtMoney(v)}`, fontSize: 10, fill: CHART_AXIS }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="adm-empty">ยังไม่มีข้อมูล</div>
          )}
        </div>

        {/* Top games */}
        <div className="dash-chart-card">
          <div className="dash-chart-title"><i className="fas fa-scroll" /> เกมยอดนิยม (รอบ)</div>
          {topGames.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(160, topGames.length*34)}>
              <BarChart data={topGames} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: CHART_AXIS }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: CHART_AXIS_LG }} width={90} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="รอบ" fill={CHART_COLORS[0]} radius={[0,4,4,0]}
                  label={{ position: 'right', fontSize: 10, fill: CHART_AXIS }} />
                <Bar dataKey="ผู้เล่น" fill={CHART_BAR_PLAYERS} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="adm-empty">ยังไม่มีข้อมูล</div>
          )}
        </div>
      </div>

      {/* ── Recent payments ── */}
      <div className="dash-chart-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="dash-chart-title" style={{ margin: 0 }}><i className="fas fa-receipt" /> ออเดอร์ล่าสุด</div>
          {onGoTab && (
            <button
              onClick={() => onGoTab('history')}
              style={{
                padding: '6px 14px', borderRadius: 8, background: 'var(--surface-page)',
                border: '1px solid var(--border-default)', color: 'var(--text-primary)',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: "'Sarabun',sans-serif", transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--crimson-500)'; e.currentTarget.style.color='var(--crimson-500)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border-default)'; e.currentTarget.style.color='var(--text-primary)' }}
            >
              ดูประวัติ & บิลทั้งหมด <i className="fas fa-arrow-right" style={{ fontSize: 10 }} />
            </button>
          )}
        </div>
        {payments.slice(0, 10).map(p => {
          const d = paidDate(p)
          return (
            <div
              key={p.id}
              className="dash-pay-row"
              style={{ cursor: onGoTab ? 'pointer' : 'default', transition: 'background 0.15s ease' }}
              onClick={() => onGoTab && onGoTab('history')}
              title="คลิกเพื่อดูรายละเอียดในหน้าประวัติ & บิล"
            >
              <div className="dash-pay-left">
                <div className="dash-pay-game">{p.scriptTitle || 'ไม่ระบุ'}</div>
                <div className="dash-pay-meta">
                  {p.members?.length || 0} คน
                  {p.dm && ` · DM: ${p.dm}`}
                  {p.room && ` · ${p.room}`}
                  {d && ` · ${d.toLocaleDateString('th-TH', {day:'numeric',month:'short'})} ${d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`}
                </div>
              </div>
              <div className="dash-pay-total">฿{(p.grandTotal||0).toLocaleString()}</div>
            </div>
          )
        })}
        {payments.length === 0 && <div className="adm-empty">ยังไม่มีออเดอร์</div>}
      </div>

    </div>
  )
}

// ─── Scripts Tab ──────────────────────────────────────────────────────────────
const matchPlayersCount = (playersStr, filterVal) => {
  if (filterVal === 'ALL') return true
  if (!playersStr) return false
  const s = String(playersStr).trim()
  if (filterVal === '9+') {
    const nums = s.match(/\d+/g)?.map(Number) || []
    return nums.some(n => n >= 9)
  }
  const target = parseInt(filterVal, 10)
  if (isNaN(target)) return true
  const parts = s.split(/[-–—]/).map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n))
  if (parts.length === 1) return parts[0] === target
  if (parts.length >= 2) return target >= parts[0] && target <= parts[1]
  return s.includes(String(target))
}

const getDiffBadgeStyle = (diff) => {
  const d = (diff || '').toLowerCase()
  if (d.includes('beginner') || d.includes('ง่าย')) {
    return { background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }
  }
  if (d.includes('normal') || d.includes('ปานกลาง')) {
    return { background: 'rgba(59,130,246,0.1)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.25)' }
  }
  if (d.includes('hard') || d.includes('ยาก')) {
    return { background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)' }
  }
  if (d.includes('expert') || d.includes('เซียน')) {
    return { background: 'rgba(239,68,68,0.12)', color: 'var(--crimson-500)', border: '1px solid rgba(239,68,68,0.3)' }
  }
  return { background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }
}

function ScriptsTab({ allGames = [], showToast, openModal, openEdit }) {
  const [search, setSearch] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('ALL')
  const [playerFilter, setPlayerFilter] = useState('ALL')
  const [tagFilter, setTagFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('default')

  const handleDelete = async (id, title) => {
    if (!confirm(`ลบ "${title}" ออกจากระบบ?`)) return
    try {
      await deleteDoc(doc(db, 'scripts', id))
      showToast('ลบสำเร็จ')
    } catch { showToast('ลบล้มเหลว', 'error') }
  }

  const handleEdit = async (id) => {
    try {
      const snap = await getDoc(doc(db, 'scripts', id))
      if (snap.exists()) openEdit({ id: snap.id, ...snap.data() })
    } catch { showToast('โหลดข้อมูลล้มเหลว', 'error') }
  }

  // Collect unique tags
  const allTags = useMemo(() => {
    const set = new Set()
    allGames.forEach(g => {
      if (Array.isArray(g.tags)) {
        g.tags.forEach(t => { if (t?.trim()) set.add(t.trim()) })
      }
    })
    return Array.from(set).sort()
  }, [allGames])

  // Filter games
  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allGames.filter(g => {
      if (q) {
        const matchTitle = (g.title || '').toLowerCase().includes(q)
        const matchPlayers = String(g.players || '').toLowerCase().includes(q)
        const matchDiff = (g.difficulty || '').toLowerCase().includes(q)
        const matchPrice = String(g.price || g.payPrice || '').includes(q)
        const matchTime = (g.time || '').toLowerCase().includes(q)
        const matchSynopsis = (g.synopsis || '').toLowerCase().includes(q)
        const matchTags = Array.isArray(g.tags) && g.tags.some(t => t.toLowerCase().includes(q))
        const matchRooms = (Array.isArray(g.selectedRooms) && g.selectedRooms.some(r => r.toLowerCase().includes(q))) ||
          (g.mainRoom && g.mainRoom.toLowerCase().includes(q))
        if (!matchTitle && !matchPlayers && !matchDiff && !matchPrice && !matchTime && !matchSynopsis && !matchTags && !matchRooms) {
          return false
        }
      }
      if (difficultyFilter !== 'ALL') {
        if ((g.difficulty || '').toLowerCase() !== difficultyFilter.toLowerCase()) return false
      }
      if (playerFilter !== 'ALL') {
        if (!matchPlayersCount(g.players, playerFilter)) return false
      }
      if (tagFilter !== 'ALL') {
        if (!Array.isArray(g.tags) || !g.tags.includes(tagFilter)) return false
      }
      return true
    })
  }, [allGames, search, difficultyFilter, playerFilter, tagFilter])

  // Sort games
  const sortedGames = useMemo(() => {
    return [...filteredGames].sort((a, b) => {
      if (sortBy === 'name_asc') return (a.title || '').localeCompare(b.title || '', 'th')
      if (sortBy === 'name_desc') return (b.title || '').localeCompare(a.title || '', 'th')
      if (sortBy === 'price_asc') {
        const pa = Number(a.payPrice || a.price || 0)
        const pb = Number(b.payPrice || b.price || 0)
        return pa - pb
      }
      if (sortBy === 'price_desc') {
        const pa = Number(a.payPrice || a.price || 0)
        const pb = Number(b.payPrice || b.price || 0)
        return pb - pa
      }
      if (sortBy === 'players_asc') {
        const pa = parseInt(a.players || '0', 10) || 0
        const pb = parseInt(b.players || '0', 10) || 0
        return pa - pb
      }
      if (sortBy === 'players_desc') {
        const pa = parseInt(a.players || '0', 10) || 0
        const pb = parseInt(b.players || '0', 10) || 0
        return pb - pa
      }
      return 0
    })
  }, [filteredGames, sortBy])

  const hasActiveFilters = search || difficultyFilter !== 'ALL' || playerFilter !== 'ALL' || tagFilter !== 'ALL' || sortBy !== 'default'

  const handleResetFilters = () => {
    setSearch('')
    setDifficultyFilter('ALL')
    setPlayerFilter('ALL')
    setTagFilter('ALL')
    setSortBy('default')
  }

  return (
    <div className="adm-card">
      <div className="adm-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="adm-card-title">
          <i className="fas fa-scroll" style={{ color: 'var(--crimson-500)' }} /> สคริปต์ ({allGames.length})
        </div>
        <button className="adm-btn-red" onClick={openModal}>
          <i className="fas fa-plus" /> เพิ่มใหม่
        </button>
      </div>

      {/* ── Search & Filter Controls Bar ── */}
      <div style={{ padding: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Row 1: Search + Dropdown filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {/* Search box */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: 13 }} />
            <input
              type="text"
              className="adm-input"
              placeholder="ค้นหาชื่อสคริปต์, จำนวนคน, แท็ก, ราคา..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34, paddingRight: search ? 32 : 12, width: '100%', boxSizing: 'border-box', height: 38 }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                title="ล้างข้อความค้นหา"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}
              >
                <i className="fas fa-times" />
              </button>
            )}
          </div>

          {/* Difficulty Dropdown */}
          <select
            className="adm-input"
            style={{ width: 'auto', minWidth: 140, height: 38, fontSize: 13, cursor: 'pointer' }}
            value={difficultyFilter}
            onChange={e => setDifficultyFilter(e.target.value)}
          >
            <option value="ALL">ทุกความยาก</option>
            <option value="Beginner">Beginner</option>
            <option value="Normal">Normal</option>
            <option value="Hard">Hard</option>
            <option value="Expert">Expert</option>
          </select>

          {/* Player Count Dropdown */}
          <select
            className="adm-input"
            style={{ width: 'auto', minWidth: 130, height: 38, fontSize: 13, cursor: 'pointer' }}
            value={playerFilter}
            onChange={e => setPlayerFilter(e.target.value)}
          >
            <option value="ALL">ทุกจำนวนคน</option>
            <option value="2">2 คน</option>
            <option value="4">4 คน</option>
            <option value="5">5 คน</option>
            <option value="6">6 คน</option>
            <option value="7">7 คน</option>
            <option value="8">8 คน</option>
            <option value="9+">9+ คนขึ้นไป</option>
          </select>

          {/* Tag Dropdown */}
          {allTags.length > 0 && (
            <select
              className="adm-input"
              style={{ width: 'auto', minWidth: 130, height: 38, fontSize: 13, cursor: 'pointer' }}
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
            >
              <option value="ALL">ทุกแนวเกม ({allTags.length})</option>
              {allTags.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          {/* Sort Dropdown */}
          <select
            className="adm-input"
            style={{ width: 'auto', minWidth: 140, height: 38, fontSize: 13, cursor: 'pointer' }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="default">เรียง: ค่าเริ่มต้น</option>
            <option value="name_asc">ชื่อ (A-Z / ก-ฮ)</option>
            <option value="name_desc">ชื่อ (Z-A / ฮ-ก)</option>
            <option value="price_asc">ราคา (น้อย ไป มาก)</option>
            <option value="price_desc">ราคา (มาก ไป น้อย)</option>
            <option value="players_asc">จำนวนคน (น้อย ไป มาก)</option>
            <option value="players_desc">จำนวนคน (มาก ไป น้อย)</option>
          </select>
        </div>

        {/* Row 2: Quick filter pills & Result stats */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '8px 12px', background: 'var(--surface-page)', borderRadius: 10, border: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>ทางลัด:</span>
            {['ALL', 'Beginner', 'Normal', 'Hard', 'Expert'].map(d => {
              const isSel = difficultyFilter === d
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficultyFilter(d)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 16,
                    fontSize: 11,
                    fontWeight: isSel ? 800 : 600,
                    cursor: 'pointer',
                    border: isSel ? '1px solid var(--crimson-500)' : '1px solid var(--border-default)',
                    background: isSel ? 'var(--crimson-500)' : 'var(--surface-elevated)',
                    color: isSel ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {d === 'ALL' ? 'ทั้งหมด' : d}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 }}>
              แสดง <strong style={{ color: 'var(--crimson-500)' }}>{sortedGames.length}</strong> จาก {allGames.length} สคริปต์
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--crimson-500)',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: 0,
                }}
              >
                <i className="fas fa-undo" /> ล้างตัวกรอง
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Scripts List ── */}
      <div className="adm-scripts-list">
        {sortedGames.length === 0 ? (
          <div className="adm-empty" style={{ padding: '36px 0', textAlign: 'center' }}>
            <i className="fas fa-search" style={{ fontSize: 28, opacity: 0.3, marginBottom: 8, display: 'block' }} />
            <div>{allGames.length === 0 ? 'ยังไม่มีสคริปต์ในระบบ' : `ไม่พบสคริปต์ที่ตรงกับเงื่อนไขการค้นหา ${search ? `"${search}"` : ''}`}</div>
            {hasActiveFilters && (
              <button
                type="button"
                className="adm-btn-outline"
                style={{ marginTop: 12, padding: '6px 14px', fontSize: 12 }}
                onClick={handleResetFilters}
              >
                <i className="fas fa-undo" style={{ marginRight: 6 }} /> ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        ) : (
          sortedGames.map(g => (
            <div key={g.id} className="adm-script-row">
              <div className="adm-script-img">
                {g.image || g.coverUrl ? <img src={g.image || g.coverUrl} alt="" /> : <i className="fas fa-scroll" style={{ color: '#888' }} />}
              </div>
              <div className="adm-list-info">
                <div className="adm-list-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{g.title || 'ไม่มีชื่อ'}</span>
                  {g.difficulty && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '1px 7px',
                      borderRadius: 12,
                      ...getDiffBadgeStyle(g.difficulty)
                    }}>
                      {g.difficulty}
                    </span>
                  )}
                  {Array.isArray(g.tags) && g.tags.slice(0, 2).map((tg, tIdx) => (
                    <span key={tIdx} style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--surface-page)', padding: '1px 6px', borderRadius: 6, border: '1px solid var(--border-default)' }}>
                      #{tg}
                    </span>
                  ))}
                </div>
                <div className="adm-list-sub">
                  <span><i className="fas fa-users" style={{ marginRight: 4, fontSize: 10 }} />{g.players || '-'} คน</span>
                  <span> · </span>
                  <span><i className="fas fa-clock" style={{ marginRight: 4, fontSize: 10 }} />{g.time || '-'}</span>
                  <span> · </span>
                  <span style={{ fontWeight: 800, color: 'var(--crimson-500)' }}>฿{(g.payPrice || g.price || 0).toLocaleString()}</span>
                  {g.mainRoom && (
                    <>
                      <span> · </span>
                      <span style={{ color: 'var(--text-tertiary)' }}><i className="fas fa-door-open" style={{ marginRight: 3, fontSize: 10 }} />{g.mainRoom}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="adm-row-actions">
                <button className="adm-icon-btn adm-edit" onClick={() => handleEdit(g.id)} title="แก้ไขสคริปต์"><i className="fas fa-edit" /></button>
                <button className="adm-icon-btn adm-del" onClick={() => handleDelete(g.id, g.title || '')} title="ลบสคริปต์"><i className="fas fa-trash" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Edit Member Modal ────────────────────────────────────────────────────────
const getMemberAchievements = (m) =>
  Array.isArray(m.achievements) ? m.achievements
  : m.achievement && m.achievement !== 'none' ? [m.achievement]
  : []

function MemberField({ label, value, onChange, placeholder, type = 'text', icon }) {
  return (
    <div className="adm-mem-field">
      <label className="adm-mem-label">{label}</label>
      <div className="adm-mem-input-wrap">
        {icon && <i className={`fas ${icon} adm-mem-input-icon`} />}
        <input
          className={`adm-mem-input ${icon ? 'with-icon' : ''}`}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

function EditMemberModal({ member, onClose, showToast }) {
  const [activeTab, setActiveTab] = useState('info') // 'info' | 'achievements'
  const [rarityFilter, setRarityFilter] = useState('ALL')
  const [form, setForm] = useState({
    nickname:    member.nickname   || '',
    firstname:   member.firstname  || '',
    lastname:    member.lastname   || '',
    email:       member.email      || '',
    tel_no:      member.tel_no     || '',
    role:        member.role       || 'member',
    position:    member.position   || '',
    pictureUrl:  member.pictureUrl || '',
    achievements: getMemberAchievements(member),
  })
  const [saving, setSaving] = useState(false)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleAchievement = (id) => {
    setForm(f => ({
      ...f,
      achievements: f.achievements.includes(id)
        ? f.achievements.filter(a => a !== id)
        : [...f.achievements, id],
    }))
  }

  const selectAllAchievements = () => {
    const all = Object.keys(ACHIEVEMENTS)
    setForm(f => ({ ...f, achievements: all }))
  }

  const clearAchievements = () => {
    setForm(f => ({ ...f, achievements: [] }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'members', member.id), {
        nickname:     form.nickname.trim(),
        firstname:    form.firstname.trim(),
        lastname:     form.lastname.trim(),
        email:        form.email.trim(),
        tel_no:       form.tel_no.trim(),
        role:         form.role,
        position:     form.position.trim(),
        pictureUrl:   form.pictureUrl.trim(),
        achievements: form.achievements,
        achievement:  form.achievements.includes('golden') ? 'golden' : null,
        updatedAt:    serverTimestamp(),
      })
      showToast('บันทึกข้อมูลสำเร็จ')
      onClose()
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const name = form.nickname || `${form.firstname || ''} ${form.lastname || ''}`.trim() || member.nickname || 'ไม่มีชื่อ'
  const totalAchievements = Object.keys(ACHIEVEMENTS).length

  const visibleRarities = useMemo(() => {
    if (rarityFilter === 'ALL') return ACHIEVEMENTS_BY_RARITY
    return ACHIEVEMENTS_BY_RARITY.filter(r => r.rarity.id === rarityFilter)
  }, [rarityFilter])

  return (
    <div className="adm-mem-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-mem-modal">
        <style>{`
          .adm-mem-backdrop {
            position: fixed;
            inset: 0;
            z-index: 3100;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            animation: scFadeIn 0.2s ease-out;
          }
          .adm-mem-modal {
            background: #ffffff;
            color: #0f172a;
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 20px;
            width: 100%;
            max-width: 780px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.25);
            animation: scSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: 'Google Sans', 'Sarabun', sans-serif;
          }
          .adm-mem-header {
            padding: 18px 24px 14px;
            background: #ffffff;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-shrink: 0;
          }
          .adm-mem-title-box {
            display: flex;
            align-items: center;
            gap: 14px;
            min-width: 0;
          }
          .adm-mem-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: #f1f5f9;
            border: 2px solid #e2e8f0;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 18px;
            color: #64748b;
            flex-shrink: 0;
          }
          .adm-mem-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .adm-mem-name {
            font-size: 17px;
            font-weight: 800;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .adm-mem-role-badge {
            font-size: 10.5px;
            font-weight: 800;
            text-transform: uppercase;
            padding: 2px 8px;
            border-radius: 999px;
            letter-spacing: 0.04em;
          }
          .adm-mem-role-badge.admin {
            background: #fef2f2;
            color: #dc2626;
            border: 1px solid #fecaca;
          }
          .adm-mem-role-badge.member {
            background: #f0f9ff;
            color: #0284c7;
            border: 1px solid #bae6fd;
          }
          .adm-mem-subtitle {
            font-size: 12px;
            color: #64748b;
            margin-top: 2px;
          }
          .adm-mem-close-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            color: #64748b;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.15s;
          }
          .adm-mem-close-btn:hover {
            background: #fee2e2;
            border-color: #fca5a5;
            color: #dc2626;
            transform: rotate(90deg);
          }
          .adm-mem-tab-bar {
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            padding: 4px 16px;
            gap: 6px;
            flex-shrink: 0;
          }
          .adm-mem-tab-btn {
            background: transparent;
            border: 1px solid transparent;
            color: #64748b;
            font-size: 13px;
            font-weight: 700;
            font-family: inherit;
            padding: 9px 16px;
            border-radius: 10px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.15s;
          }
          .adm-mem-tab-btn:hover {
            color: #0f172a;
            background: rgba(0, 0, 0, 0.04);
          }
          .adm-mem-tab-btn.active {
            color: #b91c1c;
            background: #ffffff;
            border-color: #e2e8f0;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
          }
          .adm-mem-tab-btn.active i {
            color: #dc2626;
          }
          .adm-mem-tab-count {
            background: #e2e8f0;
            color: #475569;
            font-size: 10.5px;
            font-weight: 800;
            padding: 2px 7px;
            border-radius: 999px;
          }
          .adm-mem-tab-btn.active .adm-mem-tab-count {
            background: var(--crimson-500);
            color: #ffffff;
          }
          .adm-mem-body {
            flex: 1;
            overflow-y: auto;
            padding: 22px 24px;
            background: #f8fafc;
            display: flex;
            flex-direction: column;
            gap: 18px;
          }
          .adm-mem-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 18px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          }
          .adm-mem-card-title {
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #334155;
            margin-bottom: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .adm-mem-card-title i {
            color: #dc2626;
          }
          .adm-mem-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
          }
          @media (max-width: 640px) {
            .adm-mem-grid-2 { grid-template-columns: 1fr; }
          }
          .adm-mem-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 12px;
          }
          .adm-mem-field:last-child {
            margin-bottom: 0;
          }
          .adm-mem-label {
            font-size: 12px;
            font-weight: 700;
            color: #0f172a;
          }
          .adm-mem-input-wrap {
            position: relative;
            display: flex;
            align-items: center;
          }
          .adm-mem-input-icon {
            position: absolute;
            left: 12px;
            color: #94a3b8;
            font-size: 13px;
            pointer-events: none;
          }
          .adm-mem-input {
            width: 100%;
            background: #ffffff;
            border: 1.5px solid #cbd5e1;
            color: #0f172a;
            font-family: inherit;
            font-size: 13.5px;
            font-weight: 500;
            padding: 9px 12px;
            border-radius: 9px;
            outline: none;
            transition: all 0.15s;
          }
          .adm-mem-input::placeholder {
            color: #94a3b8;
          }
          .adm-mem-input.with-icon {
            padding-left: 36px;
          }
          .adm-mem-input:focus {
            border-color: #dc2626;
            box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
          }
          .adm-mem-select {
            width: 100%;
            background: #ffffff;
            border: 1.5px solid #cbd5e1;
            color: #0f172a;
            font-family: inherit;
            font-size: 13.5px;
            font-weight: 600;
            padding: 9px 12px;
            border-radius: 9px;
            outline: none;
            cursor: pointer;
          }
          .adm-mem-select:focus {
            border-color: #dc2626;
            box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
          }
          .adm-mem-chip {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            color: #475569;
            font-size: 11px;
            font-weight: 700;
            padding: 3px 9px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
          }
          .adm-mem-chip:hover {
            background: #fee2e2;
            border-color: #fca5a5;
            color: #b91c1c;
          }
          .adm-mem-chip.active {
            background: #dc2626;
            border-color: #dc2626;
            color: #ffffff;
          }
          .adm-mem-ach-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
          @media (max-width: 640px) {
            .adm-mem-ach-grid { grid-template-columns: 1fr; }
          }
          .adm-mem-ach-card {
            position: relative;
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1.5px solid #e2e8f0;
            background: #ffffff;
            cursor: pointer;
            transition: all 0.15s;
            text-align: left;
            width: 100%;
          }
          .adm-mem-ach-card:hover {
            border-color: #cbd5e1;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          }
          .adm-mem-ach-card.on {
            border-color: var(--abr);
            background: var(--ab);
          }
          .adm-mem-ach-icon {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ab, #f1f5f9);
            color: var(--ac, #64748b);
            font-size: 15px;
          }
          .adm-mem-ach-card.on .adm-mem-ach-icon {
            background: var(--ac);
            color: #ffffff;
          }
          .adm-mem-ach-body {
            flex: 1;
            min-width: 0;
          }
          .adm-mem-ach-name {
            font-size: 12.5px;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.3;
          }
          .adm-mem-ach-card.on .adm-mem-ach-name {
            color: var(--ac);
          }
          .adm-mem-ach-th {
            font-size: 11px;
            font-weight: 600;
            color: #64748b;
          }
          .adm-mem-ach-desc {
            font-size: 10px;
            color: #64748b;
            margin-top: 3px;
            line-height: 1.4;
          }
          .adm-mem-ach-check {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--ac);
            color: #ffffff;
            font-size: 9px;
          }
          .adm-mem-footer {
            padding: 14px 24px;
            background: #ffffff;
            border-top: 1px solid #e5e7eb;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-shrink: 0;
          }
        `}</style>

        {/* ── HEADER ── */}
        <div className="adm-mem-header">
          <div className="adm-mem-title-box">
            <div className="adm-mem-avatar">
              {form.pictureUrl ? (
                <img src={form.pictureUrl} alt="" onError={e => e.currentTarget.style.display = 'none'} />
              ) : (
                <span>{name[0]}</span>
              )}
            </div>
            <div>
              <div className="adm-mem-name">
                {name}
                <span className={`adm-mem-role-badge ${form.role}`}>
                  {form.role.toUpperCase()}
                </span>
              </div>
              <div className="adm-mem-subtitle">
                ID: {member.id?.slice(0, 8)} · {form.email || 'ไม่มีอีเมล'}
              </div>
            </div>
          </div>
          <button className="adm-mem-close-btn" onClick={onClose} title="ปิดหน้าต่าง (Esc)">
            <i className="fas fa-times" />
          </button>
        </div>

        {/* ── TAB BAR ── */}
        <div className="adm-mem-tab-bar">
          <button
            type="button"
            className={`adm-mem-tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            <i className="fas fa-user" /> ข้อมูลทั่วไป
          </button>
          <button
            type="button"
            className={`adm-mem-tab-btn ${activeTab === 'achievements' ? 'active' : ''}`}
            onClick={() => setActiveTab('achievements')}
          >
            <i className="fas fa-trophy" /> ความสำเร็จ
            <span className="adm-mem-tab-count">{form.achievements.length}</span>
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="adm-mem-body">

          {/* ═════════ TAB 1: PROFILE INFO ═════════ */}
          {activeTab === 'info' && (
            <>
              {/* Account & Role */}
              <div className="adm-mem-card">
                <div className="adm-mem-card-title">
                  <i className="fas fa-id-badge" /> บัญชีและบทบาท
                </div>
                <div className="adm-mem-grid-2">
                  <MemberField
                    label="ชื่อเล่น / Display Name"
                    value={form.nickname}
                    onChange={v => set('nickname', v)}
                    placeholder="เช่น นิค, Karinaa"
                    icon="fa-user-tag"
                  />
                  <div className="adm-mem-field">
                    <label className="adm-mem-label">บทบาทในระบบ (Role)</label>
                    <select
                      className="adm-mem-select"
                      value={form.role}
                      onChange={e => set('role', e.target.value)}
                    >
                      <option value="member">Member (ผู้เล่นทั่วไป)</option>
                      <option value="admin">Admin (ผู้ดูแลระบบ)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Personal Details */}
              <div className="adm-mem-card">
                <div className="adm-mem-card-title">
                  <i className="fas fa-address-card" /> ข้อมูลส่วนตัว
                </div>
                <div className="adm-mem-grid-2">
                  <MemberField
                    label="ชื่อจริง"
                    value={form.firstname}
                    onChange={v => set('firstname', v)}
                    placeholder="ชื่อจริง"
                    icon="fa-user"
                  />
                  <MemberField
                    label="นามสกุล"
                    value={form.lastname}
                    onChange={v => set('lastname', v)}
                    placeholder="นามสกุล"
                    icon="fa-user"
                  />
                </div>
                <div className="adm-mem-grid-2">
                  <MemberField
                    label="อีเมล"
                    value={form.email}
                    onChange={v => set('email', v)}
                    placeholder="email@example.com"
                    type="email"
                    icon="fa-envelope"
                  />
                  <MemberField
                    label="เบอร์โทรศัพท์"
                    value={form.tel_no}
                    onChange={v => set('tel_no', v)}
                    placeholder="08x-xxx-xxxx"
                    icon="fa-phone"
                  />
                </div>
                <MemberField
                  label="ตำแหน่ง (แสดงในหน้า Team)"
                  value={form.position}
                  onChange={v => set('position', v)}
                  placeholder="เช่น Game Master, Story Designer, DM"
                  icon="fa-briefcase"
                />
              </div>

              {/* Avatar Picture */}
              <div className="adm-mem-card">
                <div className="adm-mem-card-title">
                  <i className="fas fa-camera" /> รูปโปรไฟล์
                </div>
                <MemberField
                  label="URL รูปโปรไฟล์ (Image URL)"
                  value={form.pictureUrl}
                  onChange={v => set('pictureUrl', v)}
                  placeholder="https://profile.line-scdn.net/..."
                  icon="fa-link"
                />
                {form.pictureUrl && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                    <img
                      src={form.pictureUrl}
                      alt="Avatar Preview"
                      style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid #cbd5e1' }}
                      onError={e => e.currentTarget.style.display = 'none'}
                    />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>พรีวิวรูปโปรไฟล์</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>รูปภาพแสดงบนหน้าเว็บ บิล และโปรไฟล์ผู้เล่น</div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═════════ TAB 2: ACHIEVEMENTS ═════════ */}
          {activeTab === 'achievements' && (
            <div className="adm-mem-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div className="adm-mem-card-title" style={{ margin: 0 }}>
                    <i className="fas fa-medal" /> รายการความสำเร็จ ({form.achievements.length}/{totalAchievements})
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
                    คลิกเพื่อเปิด/ปิดเหรียญรางวัลให้กับสมาชิกท่านนี้
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="adm-mem-chip" onClick={selectAllAchievements}>
                    เลือกทั้งหมด
                  </button>
                  <button type="button" className="adm-mem-chip" onClick={clearAchievements}>
                    ล้างทั้งหมด
                  </button>
                </div>
              </div>

              {/* Rarity Filter */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className={`adm-mem-chip ${rarityFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setRarityFilter('ALL')}
                >
                  ทั้งหมด ({totalAchievements})
                </button>
                {Object.values(RARITY).map(r => (
                  <button
                    key={r.id}
                    type="button"
                    className={`adm-mem-chip ${rarityFilter === r.id ? 'active' : ''}`}
                    onClick={() => setRarityFilter(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Achievements grouped by rarity */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {visibleRarities.map(({ rarity: rar, items }) => (
                  <div key={rar.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: rar.color, marginBottom: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: rar.color }} />
                      {rar.label} ({items.length})
                    </div>
                    <div className="adm-mem-ach-grid">
                      {items.map(ach => {
                        const on = form.achievements.includes(ach.id)
                        return (
                          <button
                            key={ach.id}
                            type="button"
                            className={`adm-mem-ach-card ${on ? 'on' : ''}`}
                            style={{
                              '--ac': ach.color,
                              '--ab': ach.bg,
                              '--abr': ach.border
                            }}
                            onClick={() => toggleAchievement(ach.id)}
                          >
                            <div className="adm-mem-ach-icon">
                              <i className={`fas ${ach.icon}`} />
                            </div>
                            <div className="adm-mem-ach-body">
                              <div className="adm-mem-ach-name">{ach.label}</div>
                              <div className="adm-mem-ach-th">{ach.labelTH}</div>
                              <div className="adm-mem-ach-desc">{ach.descTH}</div>
                            </div>
                            {on && (
                              <div className="adm-mem-ach-check">
                                <i className="fas fa-check" />
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── FOOTER ── */}
        <div className="adm-mem-footer">
          <div style={{ fontSize: 12, color: '#64748b' }}>
            สถานะ: <strong style={{ color: '#0f172a' }}>{form.role.toUpperCase()}</strong> · ปลดล็อค <strong>{form.achievements.length}</strong> รางวัล
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
              style={{ padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="adm-btn-red"
              onClick={save}
              disabled={saving}
              style={{ minWidth: 120, padding: '9px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700 }}
            >
              {saving ? (
                <>
                  <i className="fas fa-spinner fa-spin" /> กำลังบันทึก...
                </>
              ) : (
                <>
                  <i className="fas fa-save" /> บันทึกข้อมูล
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Members Tab ──────────────────────────────────────────────────────────────
function MembersTab({ members, allGames = [], showToast, onViewMemberHistory }) {
  const [search, setSearch]           = useState('')
  const [editMember, setEditMember]   = useState(null)
  const [historyMember, setHistoryMember] = useState(null)
  const [allPayments, setAllPayments] = useState([])
  const [receiptSettings, setReceiptSettings] = useState(DEFAULT_RECEIPT_SETTINGS)
  const [slipModalPayment, setSlipModalPayment] = useState(null)
  const [editingPayment, setEditingPayment] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'payments'), orderBy('paidAt', 'desc')), snap => {
      setAllPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    getDoc(doc(db, 'settings', 'receipt')).then(snap => {
      if (snap.exists()) {
        setReceiptSettings({
          ...DEFAULT_RECEIPT_SETTINGS,
          ...snap.data(),
          paymentSlip: { ...DEFAULT_RECEIPT_SETTINGS.paymentSlip, ...(snap.data().paymentSlip || {}) },
        })
      }
    }).catch(e => console.warn(e))
    return unsub
  }, [])

  const filtered = members.filter(m => {
    const name  = (m.nickname || m.firstname || '').toLowerCase()
    const email = (m.email || '').toLowerCase()
    return name.includes(search.toLowerCase()) || email.includes(search.toLowerCase())
  })

  return (
    <>
      <div className="adm-card">
        <div className="adm-card-header">
          <div className="adm-card-title"><i className="fas fa-users" style={{ color: '#4ade80' /* ds-allow-hardcode */ }} /> สมาชิก ({members.length})</div>
        </div>
        <input
          className="adm-search"
          placeholder="ค้นหาชื่อหรืออีเมล..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="adm-members-hint"><i className="fas fa-receipt" style={{ marginRight: 4 }} /> ดูประวัติการเล่นและบิลย้อนหลัง · <i className="fas fa-edit" style={{ margin: '0 4px' }} /> แก้ไขข้อมูล</div>

        {filtered.map(m => {
          const name  = m.nickname || `${m.firstname || ''} ${m.lastname || ''}`.trim() || 'ไม่มีชื่อ'
          const isAdm = m.role === 'admin'
          return (
            <div key={m.id} className={`adm-member-row${isAdm ? ' is-admin' : ''}`}>
              <div className="adm-member-ava large">
                {m.pictureUrl
                  ? <img src={m.pictureUrl} alt="" onError={e => e.currentTarget.style.display = 'none'} />
                  : <span>{name[0]}</span>
                }
                {isAdm && <div className="adm-crown"><i className="fas fa-crown" /></div>}
              </div>
              <div className="adm-list-info">
                <div className="adm-list-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {name}
                  {getMemberAchievements(m).map(id => {
                    const ach = ACHIEVEMENTS[id]
                    if (!ach) return null
                    return (
                      <span key={id} className="adm-ach-inline"
                        style={{ color: ach.color, background: ach.bg, border: `1px solid ${ach.border}` }}>
                        <i className={`fas ${ach.icon}`} /> {ach.label}
                      </span>
                    )
                  })}
                </div>
                <div className="adm-list-sub">
                  {m.email && <span>{m.email}</span>}
                  {m.tel_no && <span> · {m.tel_no}</span>}
                  {m.position && <span> · {m.position}</span>}
                </div>
                {isAdm && <span className="adm-badge" style={{ background: '#fbbf2422' /* ds-allow-hardcode */, color: '#fbbf24' /* ds-allow-hardcode */, border: '1px solid #fbbf2444' /* ds-allow-hardcode */, fontSize: 10, padding: '1px 7px', borderRadius: 4 }}>Admin</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="adm-icon-btn"
                  style={{ color: 'var(--crimson-500)', borderColor: 'rgba(239,68,68,0.2)' }}
                  onClick={() => setHistoryMember(m)}
                  title="ดูประวัติการเล่น & บิลย้อนหลังของสมาชิกคนนี้"
                >
                  <i className="fas fa-receipt" />
                </button>
                <button className="adm-icon-btn adm-edit" onClick={() => setEditMember(m)} title="แก้ไขข้อมูล">
                  <i className="fas fa-edit" />
                </button>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && <p className="adm-empty">{search ? 'ไม่พบสมาชิก' : 'ยังไม่มีสมาชิก'}</p>}
      </div>

      {editMember && (
        <EditMemberModal
          member={editMember}
          onClose={() => setEditMember(null)}
          showToast={showToast}
        />
      )}

      {historyMember && (
        <MemberHistoryModal
          member={historyMember}
          payments={allPayments}
          receiptSettings={receiptSettings}
          onClose={() => setHistoryMember(null)}
          onOpenSlip={(p) => setSlipModalPayment(p)}
          onEditPayment={(p) => setEditingPayment(p)}
          showToast={showToast}
        />
      )}

      {slipModalPayment && (
        <ThermalSlipModal
          payment={slipModalPayment}
          receiptSettings={receiptSettings}
          onClose={() => setSlipModalPayment(null)}
          showToast={showToast}
        />
      )}

      {editingPayment && (
        <EditPaymentModal
          payment={editingPayment}
          allGames={allGames}
          availableMembers={members}
          onClose={() => setEditingPayment(null)}
          showToast={showToast}
        />
      )}
    </>
  )
}

// ─── Menu Edit Modal ──────────────────────────────────────────────────────────
function MenuEditModal({ item, onClose, showToast }) {
  const [name, setName] = useState(item?.name || '')
  const [price, setPrice] = useState(item?.price ?? '')
  const [category, setCategory] = useState(item?.category || '')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(item?.imageUrl || item?.image || '')
  const [addons, setAddons] = useState(item?.addons || [])
  const [addonName, setAddonName] = useState('')
  const [addonPrice, setAddonPrice] = useState('')
  const [saving, setSaving] = useState(false)

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { showToast('ไฟล์ใหญ่เกินไป', 'error'); return }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const addAddon = () => {
    if (!addonName.trim()) return
    setAddons(prev => [...prev, { name: addonName.trim(), price: parseFloat(addonPrice) || 0 }])
    setAddonName(''); setAddonPrice('')
  }

  const removeAddon = (i) => setAddons(prev => prev.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!name.trim()) { showToast('กรุณากรอกชื่อเมนู', 'error'); return }
    setSaving(true)
    try {
      let imageUrl = item?.imageUrl || item?.image || ''
      if (imageFile) {
        const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage')
        const { storage } = await import('../firebase')
        const r = storageRef(storage, `menuImages/${Date.now()}_${imageFile.name}`)
        const snap = await uploadBytes(r, imageFile)
        imageUrl = await getDownloadURL(snap.ref)
      }
      const data = {
        name: name.trim(),
        price: parseFloat(price) || 0,
        category: category.trim() || 'อื่นๆ',
        imageUrl,
        addons,
        updatedAt: serverTimestamp(),
      }
      if (item?.id) {
        await updateDoc(doc(db, 'menuItems', item.id), data)
        showToast('อัปเดตเมนูสำเร็จ')
      } else {
        await addDoc(collection(db, 'menuItems'), { ...data, available: true, createdAt: serverTimestamp() })
        showToast('เพิ่มเมนูสำเร็จ')
      }
      onClose()
    } catch (e) { showToast('บันทึกล้มเหลว: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title">{item?.id ? 'แก้ไขเมนู' : 'เพิ่มเมนูใหม่'}</div>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        <div className="modal-body">
          {/* Image */}
          <div className="form-group">
            <label className="form-label">รูปภาพเมนู</label>
            <label className="menu-img-upload">
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
              {imagePreview
                ? <img src={imagePreview} alt="" className="menu-img-preview" />
                : <div className="menu-img-placeholder"><i className="fas fa-camera" /><span>เพิ่มรูป</span></div>
              }
              <div className="menu-img-overlay"><i className="fas fa-camera" /></div>
            </label>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ชื่อเมนู *</label>
              <input className="form-input" placeholder="เช่น กระเพราหมูข้าว" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group" style={{ maxWidth: 110 }}>
              <label className="form-label">ราคา (฿)</label>
              <input className="form-input" type="number" placeholder="0" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">หมวดหมู่</label>
            <input className="form-input" placeholder="เช่น อาหาร, เครื่องดื่ม" value={category} onChange={e => setCategory(e.target.value)} />
          </div>

          {/* Add-ons */}
          <div className="form-group">
            <label className="form-label">Add-on (ตัวเลือกเพิ่มเติม)</label>
            <div className="menu-addon-list">
              {addons.map((a, i) => (
                <div key={i} className="menu-addon-chip">
                  <span>{a.name}{a.price > 0 ? ` +฿${a.price}` : ' ฟรี'}</span>
                  <button onClick={() => removeAddon(i)}><i className="fas fa-times" /></button>
                </div>
              ))}
            </div>
            <div className="menu-addon-input-row">
              <input
                className="form-input"
                placeholder="ชื่อ add-on เช่น ไข่ดาว"
                value={addonName}
                onChange={e => setAddonName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAddon()}
              />
              <input
                className="form-input"
                type="number" placeholder="ราคา (฿)"
                style={{ maxWidth: 100 }}
                value={addonPrice}
                onChange={e => setAddonPrice(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAddon()}
              />
              <button className="menu-addon-add-btn" onClick={addAddon}>
                <i className="fas fa-plus" />
              </button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline-red" onClick={onClose}>ยกเลิก</button>
          <button className="btn-full-red" onClick={handleSave} disabled={saving}>
            {saving ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</> : <><i className="fas fa-save" /> บันทึก</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Menu Tab ────────────────────────────────────────────────────────────────
function MenuTab({ showToast }) {
  const [menuItems, setMenuItems] = useState([])
  const [editItem, setEditItem] = useState(null) // null=closed, {}=new, item=edit

  useEffect(() => {
    const q = query(collection(db, 'menuItems'), orderBy('category'), orderBy('name'))
    const unsub = onSnapshot(q,
      snap => setMenuItems(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      () => {
        // composite index not ready yet — fall back to unordered query
        const q2 = collection(db, 'menuItems')
        onSnapshot(q2, snap => setMenuItems(snap.docs.map(d => ({ ...d.data(), id: d.id }))))
      }
    )
    return unsub
  }, [])

  const toggleAvailable = (item) =>
    updateDoc(doc(db, 'menuItems', item.id), { available: !item.available }).catch(() => {})

  const handleDelete = async (id) => {
    if (!confirm('ลบเมนูนี้?')) return
    await deleteDoc(doc(db, 'menuItems', id)).catch(() => {})
    showToast('ลบแล้ว')
  }

  const grouped = menuItems.reduce((g, item) => {
    const cat = item.category || 'อื่นๆ'
    if (!g[cat]) g[cat] = []
    g[cat].push(item); return g
  }, {})

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="adm-btn-red" onClick={() => setEditItem({})}>
          <i className="fas fa-plus" /> เพิ่มเมนูใหม่
        </button>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="adm-card" style={{ marginBottom: 16 }}>
          <div className="adm-card-title"><i className="fas fa-tag" /> {cat}</div>
          {items.map(item => (
            <div key={item.id} className="adm-list-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                {(item.imageUrl || item.image)
                  ? <img src={item.imageUrl || item.image} alt="" className="menu-list-img" />
                  : <div className="menu-list-img-ph"><i className="fas fa-utensils" /></div>
                }
                <div className="adm-list-info" style={{ flex: 1 }}>
                  <div className="adm-list-name" style={{ opacity: item.available ? 1 : 0.45, textDecoration: item.available ? 'none' : 'line-through' }}>
                    {item.name}
                  </div>
                  <div className="adm-list-sub">
                    ฿{item.price}
                    {item.addons?.length > 0 && <span style={{ marginLeft: 8, color: '#a78bfa' /* ds-allow-hardcode */ }}>+{item.addons.length} add-on</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="adm-btn-sm" onClick={() => setEditItem(item)}>
                  <i className="fas fa-pen" />
                </button>
                <button className="adm-btn-sm" style={{ background: item.available ? 'rgba(var(--feedback-success-rgb), 0.13)' : 'rgba(var(--void-500-rgb), 0.13)', color: item.available ? 'var(--feedback-success-icon)' : 'var(--void-500)' }} onClick={() => toggleAvailable(item)}>
                  <i className={`fas ${item.available ? 'fa-eye' : 'fa-eye-slash'}`} />
                </button>
                <button className="adm-btn-sm" style={{ background: 'rgba(var(--crimson-500-rgb), 0.13)', color: 'var(--crimson-500)' }} onClick={() => handleDelete(item.id)}>
                  <i className="fas fa-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
      {menuItems.length === 0 && <div className="adm-empty">ยังไม่มีเมนู กด "เพิ่มเมนูใหม่" เพื่อเริ่ม</div>}

      {editItem !== null && (
        <MenuEditModal item={editItem?.id ? editItem : null} onClose={() => setEditItem(null)} showToast={showToast} />
      )}
    </div>
  )
}

// ─── Payment Settings Tab ────────────────────────────────────────────────────
function PaymentTab({ showToast }) {
  const [phone, setPhone] = useState('')
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')

  const [depositPhone, setDepositPhone] = useState('')
  const [depositAccountName, setDepositAccountName] = useState('')
  const [depositBankName, setDepositBankName] = useState('')

  const [easySlipApiKey, setEasySlipApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'payment')).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        setPhone(d.promptPayPhone || '')
        setAccountName(d.paymentAccountName || '')
        setBankName(d.paymentBankName || '')
        setDepositPhone(d.depositPromptPayPhone || '')
        setDepositAccountName(d.depositAccountName || '')
        setDepositBankName(d.depositBankName || '')
        setEasySlipApiKey(d.easySlipApiKey || '')
      }
      setLoaded(true)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'payment'), {
        promptPayPhone: phone.trim(),
        paymentAccountName: accountName.trim(),
        paymentBankName: bankName.trim(),
        depositPromptPayPhone: depositPhone.trim(),
        depositAccountName: depositAccountName.trim(),
        depositBankName: depositBankName.trim(),
        easySlipApiKey: easySlipApiKey.trim(),
        updatedAt: serverTimestamp(),
      })
      showToast('บันทึกสำเร็จ')
    } catch { showToast('บันทึกล้มเหลว', 'error') }
    finally { setSaving(false) }
  }

  if (!loaded) return <div className="adm-loading"><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── บัญชีจ่ายเงินหน้าร้าน / ค่าบิล (POS & สั่งอาหาร) ── */}
      <div className="adm-card">
        <div className="adm-card-title">
          <i className="fas fa-cash-register" style={{ color: '#06c755' }} /> บัญชีจ่ายเงิน / ชำระบิล (POS & สั่งอาหารที่ร้าน)
        </div>
        <div className="adm-hint" style={{ marginTop: 4, marginBottom: 12 }}>
          ใช้สำหรับสร้าง QR Code ในหน้า POS และหน้าสั่งอาหารของลูกค้าสำหรับชำระเงินค่าอาหาร/เกม/ปิดบิล
        </div>

        <div className="adm-field">
          <label className="adm-label">เบอร์โทรศัพท์ หรือ เลขบัตร/เลขนิติบุคคล (PromptPay)</label>
          <input
            className="adm-input"
            placeholder="เช่น 0812345678 หรือ 01055xxxxxxxx"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
          <div className="adm-field">
            <label className="adm-label">ชื่อบัญชี (แสดงใต้ QR Code)</label>
            <input
              className="adm-input"
              placeholder="เช่น บจก. โซฟัน คลับ"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
            />
          </div>
          <div className="adm-field">
            <label className="adm-label">ธนาคาร (แสดงใต้ QR Code)</label>
            <input
              className="adm-input"
              placeholder="เช่น ธ.กสิกรไทย / พร้อมเพย์"
              value={bankName}
              onChange={e => setBankName(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── บัญชีโอนมัดจำ (ระบบจองห้อง Booking) ── */}
      <div className="adm-card">
        <div className="adm-card-title">
          <i className="fas fa-calendar-check" style={{ color: '#c62419' }} /> บัญชีโอนมัดจำ (สำหรับระบบจองห้องสืบคดี)
        </div>
        <div className="adm-hint" style={{ marginTop: 4, marginBottom: 12 }}>
          ใช้สำหรับสร้าง QR Code ในหน้าระบบจองห้อง (Booking) ให้ลูกค้าสแกนโอนเงินมัดจำเปิดตี้ (หากเว้นว่างไว้ จะใช้บัญชีจ่ายเงินหลักด้านบน)
        </div>

        <div className="adm-field">
          <label className="adm-label">เบอร์โทรศัพท์ หรือ เลขบัตร/เลขนิติบุคคล สำหรับมัดจำ (PromptPay)</label>
          <input
            className="adm-input"
            placeholder="เช่น 0898765432 (เว้นว่างเพื่อใช้บัญชีเดียวกับข้างบน)"
            value={depositPhone}
            onChange={e => setDepositPhone(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
          <div className="adm-field">
            <label className="adm-label">ชื่อบัญชีมัดจำ (แสดงใต้ QR Code)</label>
            <input
              className="adm-input"
              placeholder="เช่น บจก. โซฟัน มัดจำ"
              value={depositAccountName}
              onChange={e => setDepositAccountName(e.target.value)}
            />
          </div>
          <div className="adm-field">
            <label className="adm-label">ธนาคารมัดจำ (แสดงใต้ QR Code)</label>
            <input
              className="adm-input"
              placeholder="เช่น ธ.ไทยพาณิชย์ / พร้อมเพย์"
              value={depositBankName}
              onChange={e => setDepositBankName(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── EasySlip ตรวจสลิปอัตโนมัติ ── */}
      <div className="adm-card">
        <div className="adm-card-title">
          <i className="fas fa-bolt" style={{ color: '#f59e0b' }} /> ตรวจสลิปอัตโนมัติ (EasySlip API)
        </div>
        <div className="adm-field" style={{ marginTop: 12 }}>
          <label className="adm-label">EasySlip API Key</label>
          <input
            className="adm-input"
            type="password"
            placeholder="ใส่ API Key จาก developer.easyslip.com"
            value={easySlipApiKey}
            onChange={e => setEasySlipApiKey(e.target.value)}
          />
          <div className="adm-hint" style={{ marginTop: 6 }}>
            ถ้าใส่ API Key ระบบจะตรวจสลิปอัตโนมัติสำหรับทั้งสองบัญชี (ทั้งมัดจำและชำระเงิน) — ถ้าไม่ใส่ ลูกค้าส่งสลิปแล้วรอแอดมินยืนยันเอง
          </div>
        </div>
      </div>

      <button className="adm-btn-red" style={{ width: '100%', padding: 14 }} onClick={save} disabled={saving}>
        {saving ? <span className="spinner-sm" /> : <><i className="fas fa-save" /> บันทึกการตั้งค่าทั้งหมด</>}
      </button>
    </div>
  )
}

// ─── Receipt & Slip Settings Tab ("แก้ไขบิล") ──────────────────────────────────
function ReceiptSettingsTab({ showToast }) {
  const [settings, setSettings] = useState(DEFAULT_RECEIPT_SETTINGS)
  const [activeSubTab, setActiveSubTab] = useState('payment') // 'payment' | 'orderIn' | 'company'
  const [previewMode, setPreviewMode] = useState('payment')   // 'payment' | 'orderIn'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'receipt'))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data()
          setSettings({
            ...DEFAULT_RECEIPT_SETTINGS,
            ...data,
            paymentSlip: { ...DEFAULT_RECEIPT_SETTINGS.paymentSlip, ...(data.paymentSlip || {}) },
            orderIn: { ...DEFAULT_RECEIPT_SETTINGS.orderIn, ...(data.orderIn || {}) },
          })
        }
      })
      .catch(e => console.warn('Load receipt settings error:', e))
      .finally(() => setLoading(false))
  }, [])

  const updatePayment = (k, v) => {
    setSettings(prev => ({
      ...prev,
      paymentSlip: { ...prev.paymentSlip, [k]: v }
    }))
  }

  const updateOrderIn = (k, v) => {
    setSettings(prev => ({
      ...prev,
      orderIn: { ...prev.orderIn, [k]: v }
    }))
  }

  const updateCompany = (k, v) => {
    setSettings(prev => ({
      ...prev,
      [k]: v
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'receipt'), {
        ...settings,
        updatedAt: serverTimestamp(),
      })
      showToast('บันทึกการตั้งค่าบิลสำเร็จ')
    } catch (err) {
      console.error('Save receipt settings error:', err)
      showToast('บันทึกล้มเหลว: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!window.confirm('คุณต้องการรีเซ็ตการตั้งค่าบิลและสลีปทั้งหมดกลับเป็นค่าเริ่มต้นใช่หรือไม่?')) return
    setSettings(DEFAULT_RECEIPT_SETTINGS)
    showToast('รีเซ็ตเป็นค่าเริ่มต้นแล้ว (อย่าลืมกดบันทึก)')
  }

  const handlePrintTest = () => {
    const now = new Date()
    let html = ''
    if (previewMode === 'payment') {
      html = buildSlipHTML({
        serial: 42,
        members: [{ name: 'คุณวิน' }, { name: 'คุณเต้ย' }, { name: 'คุณพลอย' }, { name: 'คุณนก' }],
        room: 'VIP 2',
        scriptTitle: 'พันธสัญญาปีศาจ',
        gameUnitPrice: 400,
        gameTotal: 1600,
        foodItems: [
          { name: 'เกี๊ยวซ่าทอด', qty: 2, price: 99, addons: [{ name: 'ชีส' }] },
          { name: 'โค้กซีโร่', qty: 4, price: 35 },
          { name: 'เฟรนช์ฟรายส์', qty: 1, price: 89, addons: [{ name: 'ซอสทรัฟเฟิล' }] },
        ],
        discount: { applied: 100, type: 'baht', value: 100 },
        grandTotal: 1827,
        openAt: new Date(now.getTime() - 7200000),
        printAt: now,
        printCount: 1,
      }, settings)
    } else {
      html = buildKitchenTicketHTML([
        { name: 'เกี๊ยวซ่าทอด', qty: 2, price: 99, totalPrice: 198, orderedBy: { name: 'คุณวิน' }, addons: [{ name: 'ชีส', price: 20 }] },
        { name: 'เฟรนช์ฟรายส์', qty: 1, price: 89, totalPrice: 89, orderedBy: { name: 'คุณเต้ย' }, addons: [{ name: 'ซอสทรัฟเฟิล', price: 25 }] },
        { name: 'โค้กซีโร่', qty: 4, price: 35, totalPrice: 140, orderedBy: { name: 'คุณพลอย' } },
      ], {
        room: 'VIP 2',
        members: [1, 2, 3, 4],
      }, now, false, settings)
    }

    const win = window.open('', '_blank', 'width=420,height=800,scrollbars=yes')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 300)
    }
  }

  if (loading) return <div className="adm-loading"><div className="spinner" /></div>

  const ps = settings.paymentSlip || DEFAULT_RECEIPT_SETTINGS.paymentSlip
  const oi = settings.orderIn || DEFAULT_RECEIPT_SETTINGS.orderIn

  return (
    <div className="adm-bill-editor-root">
      {/* ── Top Bar with Actions ── */}
      <div className="adm-bill-topbar">
        <div>
          <h3 className="adm-bill-top-title">
            <i className="fas fa-file-invoice-dollar" style={{ color: 'var(--crimson-500)', marginRight: 8 }} />
            ตั้งค่าแก้ไขบิล & สลีป (Receipt & Slip Editor)
          </h3>
          <p className="adm-bill-top-sub">
            ปรับแต่งฟอนต์ ขนาดตัวอักษร ความหนา รูปแบบกระดาษ และรายละเอียดในบิลชำระเงิน หรือ Order In เข้าครัว
          </p>
        </div>
        <div className="adm-bill-top-actions">
          <button className="adm-btn-outline" onClick={handlePrintTest} title="ทดสอบพิมพ์ออกทางเครื่องพิมพ์จริง">
            <i className="fas fa-print" /> ทดสอบพิมพ์
          </button>
          <button className="adm-btn-outline" onClick={handleReset} title="คืนค่าเริ่มต้น">
            <i className="fas fa-undo" /> ค่าเริ่มต้น
          </button>
          <button className="adm-btn-red" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner-sm" /> : <><i className="fas fa-save" /> บันทึกการตั้งค่า</>}
          </button>
        </div>
      </div>

      {/* ── Main Two-Column Layout ── */}
      <div className="adm-bill-layout">

        {/* ── LEFT COLUMN: Configuration Controls ── */}
        <div className="adm-bill-controls-col">
          {/* Sub Tab Switcher */}
          <div className="adm-bill-tabs">
            <button
              className={`adm-bill-tab${activeSubTab === 'payment' ? ' active' : ''}`}
              onClick={() => { setActiveSubTab('payment'); setPreviewMode('payment') }}
            >
              <i className="fas fa-receipt" /> ใบสลีปชำระเงิน
            </button>
            <button
              className={`adm-bill-tab${activeSubTab === 'orderIn' ? ' active' : ''}`}
              onClick={() => { setActiveSubTab('orderIn'); setPreviewMode('orderIn') }}
            >
              <i className="fas fa-utensils" /> Order In (ครัว/บาร์)
            </button>
            <button
              className={`adm-bill-tab${activeSubTab === 'company' ? ' active' : ''}`}
              onClick={() => setActiveSubTab('company')}
            >
              <i className="fas fa-store" /> ข้อมูลร้าน & ท้ายบิล
            </button>
          </div>

          {/* TAB 1: Payment Slip Settings */}
          {activeSubTab === 'payment' && (
            <div className="adm-card">
              <div className="adm-card-header">
                <div className="adm-card-title"><i className="fas fa-font" style={{ color: '#f59e0b' }} /> รูปแบบตัวอักษร & กระดาษ (Payment Slip)</div>
              </div>

              {/* Paper Width */}
              <div className="adm-field">
                <label className="adm-label">ขนาดหน้ากระดาษ (Paper Width)</label>
                <div className="adm-pills-row">
                  {PAPER_WIDTHS.map(pw => (
                    <button
                      key={pw.id}
                      type="button"
                      className={`adm-pill-btn${ps.paperWidth === pw.id ? ' active' : ''}`}
                      onClick={() => updatePayment('paperWidth', pw.id)}
                    >
                      {pw.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Family */}
              <div className="adm-field">
                <label className="adm-label">ฟอนต์ตัวอักษร (Font Family)</label>
                <select
                  className="adm-input"
                  value={ps.fontFamily}
                  onChange={e => updatePayment('fontFamily', e.target.value)}
                >
                  {AVAILABLE_FONTS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              {/* Font Sizes */}
              <div className="adm-grid-2">
                <div className="adm-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="adm-label">ขนาดตัวอักษรทั่วไป</label>
                    <span className="adm-badge-num">{ps.fontSize} px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="18"
                    step="1"
                    className="adm-range-slider"
                    value={ps.fontSize}
                    onChange={e => updatePayment('fontSize', Number(e.target.value))}
                  />
                  <div className="adm-slider-hints"><span>10px</span><span>14px</span><span>18px</span></div>
                </div>

                <div className="adm-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="adm-label">ขนาดตัวอักษรหัวบิล</label>
                    <span className="adm-badge-num">{ps.headerFontSize} px</span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="24"
                    step="1"
                    className="adm-range-slider"
                    value={ps.headerFontSize}
                    onChange={e => updatePayment('headerFontSize', Number(e.target.value))}
                  />
                  <div className="adm-slider-hints"><span>12px</span><span>18px</span><span>24px</span></div>
                </div>
              </div>

              {/* Font Weight */}
              <div className="adm-field">
                <label className="adm-label">ความหนาตัวอักษร (Font Weight)</label>
                <div className="adm-pills-row">
                  {FONT_WEIGHTS.map(fw => (
                    <button
                      key={fw.id}
                      type="button"
                      className={`adm-pill-btn${ps.fontWeight === fw.id ? ' active' : ''}`}
                      onClick={() => updatePayment('fontWeight', fw.id)}
                    >
                      {fw.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Spacing & Header Alignment */}
              <div className="adm-grid-2">
                <div className="adm-field">
                  <label className="adm-label">ระยะห่างบรรทัด (Line Height)</label>
                  <div className="adm-pills-row">
                    {[
                      { id: 1.15, label: 'กระชับ (1.15)' },
                      { id: 1.3, label: 'ปกติ (1.3)' },
                      { id: 1.5, label: 'โปร่ง (1.5)' },
                    ].map(lh => (
                      <button
                        key={lh.id}
                        type="button"
                        className={`adm-pill-btn${ps.lineHeight === lh.id ? ' active' : ''}`}
                        onClick={() => updatePayment('lineHeight', lh.id)}
                      >
                        {lh.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="adm-field">
                  <label className="adm-label">จัดกึ่งกลางหัวบิล (Header Align)</label>
                  <div className="adm-pills-row">
                    <button
                      type="button"
                      className={`adm-pill-btn${ps.headerAlign === 'center' ? ' active' : ''}`}
                      onClick={() => updatePayment('headerAlign', 'center')}
                    >
                      <i className="fas fa-align-center" /> กึ่งกลาง
                    </button>
                    <button
                      type="button"
                      className={`adm-pill-btn${ps.headerAlign === 'left' ? ' active' : ''}`}
                      onClick={() => updatePayment('headerAlign', 'left')}
                    >
                      <i className="fas fa-align-left" /> ชิดซ้าย
                    </button>
                  </div>
                </div>
              </div>

              {/* Separator Style */}
              <div className="adm-field">
                <label className="adm-label">รูปแบบเส้นคั่น (Separator Style)</label>
                <select
                  className="adm-input"
                  value={ps.separatorStyle}
                  onChange={e => updatePayment('separatorStyle', e.target.value)}
                >
                  {SEPARATOR_STYLES.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Header Title */}
              <div className="adm-field">
                <label className="adm-label">หัวข้อรายการ (Section Title)</label>
                <input
                  type="text"
                  className="adm-input"
                  value={ps.title || 'ORDER'}
                  onChange={e => updatePayment('title', e.target.value)}
                  placeholder="เช่น ORDER หรือ รายการออเดอร์"
                />
              </div>

              {/* Section: Elements Toggle */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
                <div className="adm-card-title" style={{ fontSize: 14, marginBottom: 12 }}>
                  <i className="fas fa-toggle-on" style={{ color: '#3b82f6' }} /> แสดง / ซ่อน รายละเอียดในใบสลีป
                </div>

                <div className="adm-toggles-grid">
                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showCompanyEn} onChange={e => updatePayment('showCompanyEn', e.target.checked)} />
                    <span>ชื่อร้านภาษาอังกฤษ</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showCompanyTh} onChange={e => updatePayment('showCompanyTh', e.target.checked)} />
                    <span>ชื่อร้านภาษาไทย</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showBranch} onChange={e => updatePayment('showBranch', e.target.checked)} />
                    <span>ชื่อสาขา</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showTaxId} onChange={e => updatePayment('showTaxId', e.target.checked)} />
                    <span>เลขประจำตัวผู้เสียภาษี (Tax ID)</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showAddress} onChange={e => updatePayment('showAddress', e.target.checked)} />
                    <span>ที่อยู่ร้าน</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showPhone} onChange={e => updatePayment('showPhone', e.target.checked)} />
                    <span>เบอร์โทรศัพท์</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showWebsite} onChange={e => updatePayment('showWebsite', e.target.checked)} />
                    <span>เว็บไซต์</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showSlogan} onChange={e => updatePayment('showSlogan', e.target.checked)} />
                    <span>สโลแกน & คำขอบคุณท้ายบิล</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showVat} onChange={e => updatePayment('showVat', e.target.checked)} />
                    <span>แสดงคำนวณภาษี VAT ({ps.vatRate}%)</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showRoomGst} onChange={e => updatePayment('showRoomGst', e.target.checked)} />
                    <span>แสดง ROOM & GST</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showPaidBadge} onChange={e => updatePayment('showPaidBadge', e.target.checked)} />
                    <span>แสดงป้าย [PAID]</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showSerialChk} onChange={e => updatePayment('showSerialChk', e.target.checked)} />
                    <span>แสดง Serial และ CHK</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={ps.showPrintTimes} onChange={e => updatePayment('showPrintTimes', e.target.checked)} />
                    <span>แสดงจำนวนครั้งที่พิมพ์ (Times of Printing)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Order In (Kitchen / Bar) Settings */}
          {activeSubTab === 'orderIn' && (
            <div className="adm-card">
              <div className="adm-card-header">
                <div className="adm-card-title"><i className="fas fa-utensils" style={{ color: '#ef4444' }} /> ตั้งค่าใบแจ้งออเดอร์เข้าครัว/บาร์ (Order In)</div>
              </div>

              {/* Header Title Inputs */}
              <div className="adm-grid-2">
                <div className="adm-field">
                  <label className="adm-label">ข้อความหัวบิล (Header Title)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={oi.headerTitle || 'ORDER IN'}
                    onChange={e => updateOrderIn('headerTitle', e.target.value)}
                    placeholder="เช่น ORDER IN หรือ ใบสั่งอาหาร"
                  />
                </div>

                <div className="adm-field">
                  <label className="adm-label">ข้อความบรรทัดย่อย (Sub Header)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={oi.subHeader || ''}
                    onChange={e => updateOrderIn('subHeader', e.target.value)}
                    placeholder="เช่น ครัว & บาร์ หรือ สาขา RCA"
                  />
                </div>
              </div>

              {/* Kitchen Note */}
              <div className="adm-field">
                <label className="adm-label">หมายเหตุพิเศษท้ายบิลครัว (Kitchen Note)</label>
                <input
                  type="text"
                  className="adm-input"
                  value={oi.kitchenNote || ''}
                  onChange={e => updateOrderIn('kitchenNote', e.target.value)}
                  placeholder="เช่น กรุณาทำตามคิว / เสิร์ฟพร้อมกัน"
                />
              </div>

              {/* Paper Width */}
              <div className="adm-field">
                <label className="adm-label">ขนาดหน้ากระดาษ (Paper Width)</label>
                <div className="adm-pills-row">
                  {PAPER_WIDTHS.map(pw => (
                    <button
                      key={pw.id}
                      type="button"
                      className={`adm-pill-btn${oi.paperWidth === pw.id ? ' active' : ''}`}
                      onClick={() => updateOrderIn('paperWidth', pw.id)}
                    >
                      {pw.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Family */}
              <div className="adm-field">
                <label className="adm-label">ฟอนต์ตัวอักษร (Font Family)</label>
                <select
                  className="adm-input"
                  value={oi.fontFamily}
                  onChange={e => updateOrderIn('fontFamily', e.target.value)}
                >
                  {AVAILABLE_FONTS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              {/* Font Sizes: Base, Header, and Item (Big for kitchen!) */}
              <div className="adm-grid-3">
                <div className="adm-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="adm-label">ขนาดเนื้อหา</label>
                    <span className="adm-badge-num">{oi.fontSize} px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="18"
                    step="1"
                    className="adm-range-slider"
                    value={oi.fontSize}
                    onChange={e => updateOrderIn('fontSize', Number(e.target.value))}
                  />
                  <div className="adm-slider-hints"><span>10px</span><span>18px</span></div>
                </div>

                <div className="adm-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="adm-label">ขนาดหัวบิล</label>
                    <span className="adm-badge-num">{oi.headerFontSize} px</span>
                  </div>
                  <input
                    type="range"
                    min="14"
                    max="26"
                    step="1"
                    className="adm-range-slider"
                    value={oi.headerFontSize}
                    onChange={e => updateOrderIn('headerFontSize', Number(e.target.value))}
                  />
                  <div className="adm-slider-hints"><span>14px</span><span>26px</span></div>
                </div>

                <div className="adm-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="adm-label" style={{ color: 'var(--crimson-500)', fontWeight: 800 }}>ขนาดชื่อเมนู (ครัว)</label>
                    <span className="adm-badge-num" style={{ background: 'var(--crimson-500)', color: '#fff' }}>{oi.itemFontSize} px</span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="22"
                    step="1"
                    className="adm-range-slider"
                    value={oi.itemFontSize}
                    onChange={e => updateOrderIn('itemFontSize', Number(e.target.value))}
                  />
                  <div className="adm-slider-hints"><span>12px</span><span>22px</span></div>
                </div>
              </div>

              {/* Font Weight */}
              <div className="adm-field">
                <label className="adm-label">ความหนาตัวอักษร (Font Weight)</label>
                <div className="adm-pills-row">
                  {FONT_WEIGHTS.map(fw => (
                    <button
                      key={fw.id}
                      type="button"
                      className={`adm-pill-btn${oi.fontWeight === fw.id ? ' active' : ''}`}
                      onClick={() => updateOrderIn('fontWeight', fw.id)}
                    >
                      {fw.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Separator Style */}
              <div className="adm-field">
                <label className="adm-label">รูปแบบเส้นคั่น (Separator Style)</label>
                <select
                  className="adm-input"
                  value={oi.separatorStyle}
                  onChange={e => updateOrderIn('separatorStyle', e.target.value)}
                >
                  {SEPARATOR_STYLES.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Toggles for Order In */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
                <div className="adm-card-title" style={{ fontSize: 14, marginBottom: 12 }}>
                  <i className="fas fa-toggle-on" style={{ color: '#3b82f6' }} /> แสดง / ซ่อน รายละเอียดใน Order In
                </div>

                <div className="adm-toggles-grid">
                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={oi.showCompanyHeader} onChange={e => updateOrderIn('showCompanyHeader', e.target.checked)} />
                    <span>แสดงชื่อร้านด้านบน</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={oi.showRoomGst} onChange={e => updateOrderIn('showRoomGst', e.target.checked)} />
                    <span>แสดง ROOM & GST</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={oi.showTime} onChange={e => updateOrderIn('showTime', e.target.checked)} />
                    <span>แสดงวันเวลาที่สั่ง</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={oi.showOrderedBy} onChange={e => updateOrderIn('showOrderedBy', e.target.checked)} />
                    <span>แสดงชื่อผู้สั่งแต่ละเมนู (เช่น วิน, เต้ย)</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={oi.showItemPrice} onChange={e => updateOrderIn('showItemPrice', e.target.checked)} />
                    <span>แสดงราคาอาหาร</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={oi.showAddons} onChange={e => updateOrderIn('showAddons', e.target.checked)} />
                    <span>แสดงรายการ Add-on แยกบรรทัด</span>
                  </label>

                  <label className="adm-toggle-label">
                    <input type="checkbox" checked={oi.showStatusBadge} onChange={e => updateOrderIn('showStatusBadge', e.target.checked)} />
                    <span>แสดงสถานะโต๊ะ [OPEN] / [PAID]</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Store & Contact Info */}
          {activeSubTab === 'company' && (
            <div className="adm-card">
              <div className="adm-card-header">
                <div className="adm-card-title"><i className="fas fa-store" style={{ color: '#10b981' }} /> ข้อมูลร้าน / บริษัท & ท้ายบิล</div>
              </div>

              <div className="adm-grid-2">
                <div className="adm-field">
                  <label className="adm-label">ชื่อบริษัท / ร้าน (ภาษาอังกฤษ)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={settings.companyNameEn || ''}
                    onChange={e => updateCompany('companyNameEn', e.target.value)}
                    placeholder="เช่น Sofun Club Co., Ltd."
                  />
                </div>

                <div className="adm-field">
                  <label className="adm-label">ชื่อบริษัท / ร้าน (ภาษาไทย)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={settings.companyNameTh || ''}
                    onChange={e => updateCompany('companyNameTh', e.target.value)}
                    placeholder="เช่น บริษัท โซฟัน จำกัด"
                  />
                </div>
              </div>

              <div className="adm-grid-2">
                <div className="adm-field">
                  <label className="adm-label">สาขา (Branch)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={settings.branch || ''}
                    onChange={e => updateCompany('branch', e.target.value)}
                    placeholder="เช่น สาขาอาร์ซีเอ (RCA)"
                  />
                </div>

                <div className="adm-field">
                  <label className="adm-label">เลขประจำตัวผู้เสียภาษี (Tax ID No.)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={settings.taxId || ''}
                    onChange={e => updateCompany('taxId', e.target.value)}
                    placeholder="เช่น 0105565117207"
                  />
                </div>
              </div>

              <div className="adm-field">
                <label className="adm-label">ที่อยู่บรรทัดที่ 1</label>
                <input
                  type="text"
                  className="adm-input"
                  value={settings.addressLine1 || ''}
                  onChange={e => updateCompany('addressLine1', e.target.value)}
                  placeholder="เช่น 21/81 ซอยศูนย์วิจัย แขวงบางกะปิ เขตห้วยขวาง"
                />
              </div>

              <div className="adm-field">
                <label className="adm-label">ที่อยู่บรรทัดที่ 2 (แขวง/เขต/จังหวัด/รหัสไปรษณีย์)</label>
                <input
                  type="text"
                  className="adm-input"
                  value={settings.addressLine2 || ''}
                  onChange={e => updateCompany('addressLine2', e.target.value)}
                  placeholder="เช่น กรุงเทพ 10310"
                />
              </div>

              <div className="adm-grid-2">
                <div className="adm-field">
                  <label className="adm-label">เบอร์โทรศัพท์ (Phone)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={settings.phone || ''}
                    onChange={e => updateCompany('phone', e.target.value)}
                    placeholder="เช่น +66 0814661166"
                  />
                </div>

                <div className="adm-field">
                  <label className="adm-label">เว็บไซต์ (Website URL)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={settings.website || ''}
                    onChange={e => updateCompany('website', e.target.value)}
                    placeholder="เช่น www.sofunclub.com"
                  />
                </div>
              </div>

              <div className="adm-grid-2">
                <div className="adm-field">
                  <label className="adm-label">สโลแกนท้ายบิล (Footer Slogan 1)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={settings.footerSlogan || ''}
                    onChange={e => updateCompany('footerSlogan', e.target.value)}
                    placeholder="เช่น Just so fun!"
                  />
                </div>

                <div className="adm-field">
                  <label className="adm-label">คำขอบคุณท้ายบิล (Footer Slogan 2)</label>
                  <input
                    type="text"
                    className="adm-input"
                    value={settings.footerThankYou || ''}
                    onChange={e => updateCompany('footerThankYou', e.target.value)}
                    placeholder="เช่น Thank you very much"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: Interactive Live Thermal Slip Preview ── */}
        <div className="adm-bill-preview-col">
          <div className="adm-card adm-bill-preview-card">
            <div className="adm-bill-preview-header">
              <span className="adm-bill-preview-title">
                <i className="fas fa-eye" /> ตัวอย่างสลีปแบบเรียลไทม์
              </span>
              <div className="adm-bill-preview-mode-btns">
                <button
                  type="button"
                  className={`adm-pill-btn sm${previewMode === 'payment' ? ' active' : ''}`}
                  onClick={() => setPreviewMode('payment')}
                >
                  สลีปชำระเงิน
                </button>
                <button
                  type="button"
                  className={`adm-pill-btn sm${previewMode === 'orderIn' ? ' active' : ''}`}
                  onClick={() => setPreviewMode('orderIn')}
                >
                  Order In
                </button>
              </div>
            </div>

            <div className="adm-bill-paper-wrap">
              {/* Paper display matching exact thermal style */}
              <div
                className="adm-slip-paper"
                style={{
                  width: (previewMode === 'payment' ? ps.paperWidth : oi.paperWidth) === '58mm' ? '215px' : '302px',
                  fontFamily: previewMode === 'payment' ? ps.fontFamily : oi.fontFamily,
                  fontSize: `${previewMode === 'payment' ? ps.fontSize : oi.fontSize}px`,
                  fontWeight: previewMode === 'payment' ? ps.fontWeight : oi.fontWeight,
                  lineHeight: previewMode === 'payment' ? ps.lineHeight : oi.lineHeight,
                }}
              >
                {/* ── PREVIEW: PAYMENT SLIP ── */}
                {previewMode === 'payment' ? (
                  <>
                    {ps.showCompanyEn && settings.companyNameEn && (
                      <div className="c b" style={{ fontSize: `${ps.headerFontSize}px`, textAlign: ps.headerAlign }}>
                        {settings.companyNameEn}
                      </div>
                    )}
                    {ps.showCompanyTh && settings.companyNameTh && (
                      <div className="c" style={{ textAlign: ps.headerAlign }}>{settings.companyNameTh}</div>
                    )}
                    {ps.showBranch && settings.branch && (
                      <div className="c" style={{ textAlign: ps.headerAlign }}>{settings.branch}</div>
                    )}

                    {ps.showSerialChk && (
                      <>
                        <div>Serial: 0000000042</div>
                        <div>CHK: 00042/4</div>
                      </>
                    )}
                    <div>Open at: {fmtSlipDT(new Date(Date.now() - 7200000))}</div>

                    <div className={`adm-slip-sep ${ps.separatorStyle}`} />

                    {ps.showRoomGst && (
                      <>
                        <div className="c">ROOM: VIP 2 | GST: 4</div>
                        <div className={`adm-slip-sep ${ps.separatorStyle}`} />
                      </>
                    )}

                    <div className="c b" style={{ textAlign: ps.headerAlign }}>{ps.title || 'ORDER'}</div>

                    <table className="adm-slip-table">
                      <tbody>
                        <tr><td>พันธสัญญาปีศาจ ×4</td><td className="r">1,600.00</td></tr>
                        <tr><td>เกี๊ยวซ่าทอด (ชีส) ×2</td><td className="r">198.00</td></tr>
                        <tr><td>โค้กซีโร่ ×4</td><td className="r">140.00</td></tr>
                        <tr><td>Discount (฿100)</td><td className="r">-100.00</td></tr>
                      </tbody>
                    </table>

                    <div className={`adm-slip-sep ${ps.separatorStyle}`} />

                    <table className="adm-slip-table">
                      <tbody>
                        <tr><td>Subtotal:</td><td className="r">1,717.76</td></tr>
                        {ps.showVat && <tr><td>Tax ({ps.vatRate}%):</td><td className="r">120.24</td></tr>}
                        <tr className="b"><td>Total:</td><td className="r">1,838.00</td></tr>
                        <tr><td>Cash:</td><td className="r">1,838.00</td></tr>
                      </tbody>
                    </table>

                    <div className={`adm-slip-sep ${ps.separatorStyle}`} />

                    {ps.showPaidBadge && <div className="b">[PAID]</div>}
                    <div>Print at: {fmtSlipDT(new Date())}</div>
                    {ps.showPrintTimes && <div>Times of Printing: 1</div>}

                    <div className="adm-slip-foot">
                      {ps.showAddress && settings.addressLine1 && <div>{settings.addressLine1}</div>}
                      {ps.showAddress && settings.addressLine2 && <div>{settings.addressLine2}</div>}
                      {ps.showTaxId && settings.taxId && <div>Tax ID No.{settings.taxId}</div>}
                      {ps.showWebsite && settings.website && <div>{settings.website}</div>}
                      {ps.showPhone && settings.phone && <div>Tell {settings.phone}</div>}
                      {ps.showSlogan && settings.footerSlogan && <div>{settings.footerSlogan}</div>}
                      {ps.showSlogan && settings.footerThankYou && <div>{settings.footerThankYou}</div>}
                    </div>
                  </>
                ) : (
                  /* ── PREVIEW: ORDER IN ── */
                  <>
                    <div className="c b" style={{ fontSize: `${oi.headerFontSize}px`, textAlign: oi.headerAlign }}>
                      {oi.headerTitle || 'ORDER IN'}
                    </div>
                    {oi.showCompanyHeader && settings.companyNameTh && (
                      <div className="c">{settings.companyNameTh}</div>
                    )}
                    {oi.subHeader && (
                      <div className="c">{oi.subHeader}</div>
                    )}

                    <div className={`adm-slip-sep ${oi.separatorStyle}`} />

                    {oi.showRoomGst && (
                      <>
                        <div>ROOM: VIP 2 GST: 4</div>
                        <div className={`adm-slip-sep ${oi.separatorStyle}`} />
                      </>
                    )}

                    <table className="adm-slip-table">
                      <tbody>
                        <tr>
                          <td style={{ fontSize: `${oi.itemFontSize}px` }}>เกี๊ยวซ่าทอด ×2 {oi.showOrderedBy ? '(วิน)' : ''}</td>
                          {oi.showItemPrice && <td className="r" style={{ fontSize: `${oi.itemFontSize}px` }}>198.00</td>}
                        </tr>
                        {oi.showAddons && (
                          <tr>
                            <td style={{ paddingLeft: 12, fontSize: `${oi.fontSize}px` }}>+ ชีส ×2</td>
                            {oi.showItemPrice && <td className="r" style={{ fontSize: `${oi.fontSize}px` }}>40.00</td>}
                          </tr>
                        )}
                        <tr>
                          <td style={{ fontSize: `${oi.itemFontSize}px` }}>เฟรนช์ฟรายส์ ×1 {oi.showOrderedBy ? '(เต้ย)' : ''}</td>
                          {oi.showItemPrice && <td className="r" style={{ fontSize: `${oi.itemFontSize}px` }}>89.00</td>}
                        </tr>
                        {oi.showAddons && (
                          <tr>
                            <td style={{ paddingLeft: 12, fontSize: `${oi.fontSize}px` }}>+ ซอสทรัฟเฟิล ×1</td>
                            {oi.showItemPrice && <td className="r" style={{ fontSize: `${oi.fontSize}px` }}>25.00</td>}
                          </tr>
                        )}
                        <tr>
                          <td style={{ fontSize: `${oi.itemFontSize}px` }}>โค้กซีโร่ ×4 {oi.showOrderedBy ? '(พลอย)' : ''}</td>
                          {oi.showItemPrice && <td className="r" style={{ fontSize: `${oi.itemFontSize}px` }}>140.00</td>}
                        </tr>
                      </tbody>
                    </table>

                    <div className={`adm-slip-sep ${oi.separatorStyle}`} />

                    {oi.showStatusBadge && <div>[OPEN]</div>}
                    {oi.showTime && (
                      <>
                        <div>Print at: {fmtSlipDT(new Date())}</div>
                        <div>Times of Printing: 1</div>
                      </>
                    )}
                    {oi.kitchenNote && (
                      <div style={{ marginTop: 8, fontStyle: 'italic', fontSize: `${oi.fontSize}px` }}>
                        * {oi.kitchenNote}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={{ padding: '12px 16px', background: 'var(--surface-page)', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="adm-btn-red"
                style={{ width: '100%', padding: '10px 16px', fontSize: 13 }}
                onClick={handlePrintTest}
              >
                <i className="fas fa-print" /> ทดสอบพิมพ์บิลนี้ ({previewMode === 'payment' ? 'สลีปชำระ' : 'Order In'})
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Promotion & New Games Tab ──────────────────────────────────────────────
function PromotionTab({ showToast, allGames = [] }) {
  const [promo, setPromo] = useState({
    heading: 'โปรเปิดตี้สืบคดีสุดคุ้ม',
    month: 'ประจำเดือนนี้',
    description: 'เริ่มต้นง่าย เลือกสคริปต์ที่ชอบ ชวนเพื่อนมาสืบสวน และค้นหาว่าใครคือฆาตกร รับสิทธิพิเศษส่วนลดทันทีเมื่อเปิดตี้หรือจองรอบเล่นล่วงหน้า',
    promoTag: 'SPECIAL PROMOTION',
    badge1: 'สคริปต์ยอดฮิต',
    badge2: 'ส่วนลดพิเศษ',
    badge3: 'จำนวนจำกัด',
    bannerUrl: '',
    discountAmount: '100',
    discountType: 'party', // 'party' (ลดทั้งตี้) | 'person' (ลดต่อคน)
    buttonText: 'จองรอบรับสิทธิ์เลย →',
    buttonLink: 'booking', // 'booking' | 'games' | 'party'
    newGameIds: [], // array of up to 3 game IDs
    customCovers: {}, // { [gameId]: url }
  })
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [uploadingCoverFor, setUploadingCoverFor] = useState(null)
  const [gameSearch, setGameSearch] = useState('')
  const [showGamePicker, setShowGamePicker] = useState(false)

  // Drive image helper
  const toWsrv = (id, w = 400) => `https://wsrv.nl/?url=https://drive.usercontent.google.com/download?id=${id}%26export%3Dview&w=${w}&output=webp`
  const convertImg = (url, w = 400) => {
    if (!url) return url
    const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^=?/]+)/)
    if (lh3) return toWsrv(lh3[1], w)
    const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
    if (m1) return toWsrv(m1[1], w)
    const m2 = url.match(/[?&]id=([^&]+)/)
    if (m2) return toWsrv(m2[1], w)
    return url
  }

  useEffect(() => {
    getDoc(doc(db, 'settings', 'promotion')).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        setPromo(p => ({
          ...p,
          ...d,
          discountType: d.discountType || 'party',
          newGameIds: Array.isArray(d.newGameIds) ? d.newGameIds.slice(0, 3) : [],
          customCovers: d.customCovers || {},
        }))
      }
      setLoaded(true)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'promotion'), {
        ...promo,
        newGameIds: (promo.newGameIds || []).slice(0, 3),
        updatedAt: serverTimestamp(),
      })
      showToast('บันทึกโปรโมชั่นและเกมใหม่สำเร็จ')
    } catch (err) {
      console.error(err)
      showToast('บันทึกล้มเหลว', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Handle Banner Upload
  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingBanner(true)
    try {
      const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage')
      const { storage } = await import('../firebase')
      const r = storageRef(storage, `promotions/${Date.now()}_${file.name}`)
      const snap = await uploadBytes(r, file)
      const url = await getDownloadURL(snap.ref)
      setPromo(p => ({ ...p, bannerUrl: url }))
      showToast('อัพโหลดรูปโปรโมชั่นสำเร็จ')
    } catch (err) {
      console.error(err)
      showToast('อัพโหลดรูปล้มเหลว', 'error')
    } finally {
      setUploadingBanner(false)
    }
  }

  // Handle Custom Cover Upload for a Game
  const handleGameCoverUpload = async (gameId, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCoverFor(gameId)
    try {
      const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage')
      const { storage } = await import('../firebase')
      const r = storageRef(storage, `newGameCovers/${Date.now()}_${file.name}`)
      const snap = await uploadBytes(r, file)
      const url = await getDownloadURL(snap.ref)
      setPromo(p => ({
        ...p,
        customCovers: { ...(p.customCovers || {}), [gameId]: url }
      }))
      showToast('อัพโหลดปกเกมสำเร็จ')
    } catch (err) {
      console.error(err)
      showToast('อัพโหลดปกเกมล้มเหลว', 'error')
    } finally {
      setUploadingCoverFor(null)
    }
  }

  const handleAddGame = (gameId) => {
    if ((promo.newGameIds || []).includes(gameId)) return
    if ((promo.newGameIds || []).length >= 3) {
      showToast('เลือกเกมใหม่ได้สูงสุด 3 เกมเท่านั้น', 'warning')
      return
    }
    setPromo(p => ({
      ...p,
      newGameIds: [...(p.newGameIds || []), gameId]
    }))
    setShowGamePicker(false)
    setGameSearch('')
  }

  const handleRemoveGame = (gameId) => {
    setPromo(p => {
      const nextIds = (p.newGameIds || []).filter(id => id !== gameId)
      const nextCovers = { ...(p.customCovers || {}) }
      delete nextCovers[gameId]
      return { ...p, newGameIds: nextIds, customCovers: nextCovers }
    })
  }

  const field = (label, key, placeholder, type = 'text') => (
    <div className="adm-field">
      <label className="adm-label">{label}</label>
      {type === 'textarea'
        ? <textarea className="adm-input adm-textarea" value={promo[key] || ''} placeholder={placeholder}
            onChange={e => setPromo(p => ({ ...p, [key]: e.target.value }))} rows={3} />
        : <input className="adm-input" type={type} value={promo[key] || ''} placeholder={placeholder}
            onChange={e => setPromo(p => ({ ...p, [key]: e.target.value }))} />
      }
    </div>
  )

  if (!loaded) return <div className="adm-loading"><div className="spinner" /></div>

  // Filter games from inventory for picker
  const filteredAvailableGames = allGames.filter(g =>
    !(promo.newGameIds || []).includes(g.id) &&
    ((g.title || g.name || '').toLowerCase().includes(gameSearch.toLowerCase()) ||
     (g.difficulty || '').toLowerCase().includes(gameSearch.toLowerCase()))
  )

  const selectedGamesList = (promo.newGameIds || []).map(id => allGames.find(g => g.id === id)).filter(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── CARD 1: โปรโมชั่น (Promotion Settings) ── */}
      <div className="adm-card">
        <div className="adm-card-title" style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            <i className="fas fa-fire-alt" style={{ color: 'var(--crimson-500)', marginRight: 8 }} />
            ตั้งค่าโปรโมชั่น (Promotion)
          </span>
          <span style={{ fontSize: 11, background: 'rgba(198,36,25,0.12)', color: 'var(--crimson-500)', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>
            โชว์ฝั่งซ้ายของหน้าหลัก
          </span>
        </div>

        {/* รูปภาพโปรโมชั่น */}
        <div className="adm-field" style={{ marginBottom: 16 }}>
          <label className="adm-label">รูปภาพโปรโมชั่น (แบนเนอร์ / โปสเตอร์)</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8,
              background: 'var(--crimson-500)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.15s', opacity: uploadingBanner ? 0.6 : 1,
            }}>
              <i className={`fas ${uploadingBanner ? 'fa-spinner fa-spin' : 'fa-upload'}`} />
              {uploadingBanner ? 'กำลังอัพโหลด...' : 'อัพโหลดรูปโปรโมชั่น'}
              <input type="file" accept="image/*" onChange={handleBannerUpload} disabled={uploadingBanner} style={{ display: 'none' }} />
            </label>
            {promo.bannerUrl && (
              <button
                type="button"
                onClick={() => setPromo(p => ({ ...p, bannerUrl: '' }))}
                style={{
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                }}
              >
                <i className="fas fa-trash-alt" style={{ marginRight: 6 }} /> ลบรูปออก
              </button>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <input
              className="adm-input"
              type="text"
              value={promo.bannerUrl || ''}
              placeholder="หรือวาง URL รูปภาพโดยตรง (https://...)"
              onChange={e => setPromo(p => ({ ...p, bannerUrl: e.target.value }))}
            />
          </div>
          {promo.bannerUrl && (
            <div style={{ marginTop: 12, maxWidth: 360, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
              <img src={convertImg(promo.bannerUrl, 600)} alt="Promo Banner" style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }} onError={e => e.currentTarget.style.display = 'none'} />
            </div>
          )}
        </div>

        {/* ส่วนลด และประเภทส่วนลด */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: 16, marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fas fa-tags" /> การตั้งค่าส่วนลด (Discount Price & Type)
          </div>
          <div className="adm-field-row" style={{ alignItems: 'flex-start' }}>
            <div className="adm-field" style={{ flex: 1 }}>
              <label className="adm-label">ราคาส่วนลด (ใส่จำนวนเงิน หรือ %)</label>
              <input
                className="adm-input"
                type="text"
                value={promo.discountAmount || ''}
                placeholder="เช่น 100 บาท หรือ 15%"
                onChange={e => setPromo(p => ({ ...p, discountAmount: e.target.value }))}
              />
              <div className="adm-hint">ตัวอย่าง: "100", "50 บาท", "20%"</div>
            </div>

            <div className="adm-field" style={{ flex: 1.2 }}>
              <label className="adm-label">ประเภทส่วนลด (ลดทั้งตี้ หรือ ลดต่อคน)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPromo(p => ({ ...p, discountType: 'party' }))}
                  style={{
                    padding: '10px 12px', borderRadius: 8, border: '1px solid',
                    borderColor: promo.discountType === 'party' ? 'var(--crimson-500)' : 'rgba(255,255,255,0.12)',
                    background: promo.discountType === 'party' ? 'rgba(198,36,25,0.2)' : 'rgba(255,255,255,0.04)',
                    color: promo.discountType === 'party' ? '#fff' : 'rgba(255,255,255,0.6)',
                    fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <i className="fas fa-users" style={{ color: promo.discountType === 'party' ? 'var(--crimson-500)' : 'inherit' }} />
                  ลดทั้งตี้
                </button>
                <button
                  type="button"
                  onClick={() => setPromo(p => ({ ...p, discountType: 'person' }))}
                  style={{
                    padding: '10px 12px', borderRadius: 8, border: '1px solid',
                    borderColor: promo.discountType === 'person' ? 'var(--crimson-500)' : 'rgba(255,255,255,0.12)',
                    background: promo.discountType === 'person' ? 'rgba(198,36,25,0.2)' : 'rgba(255,255,255,0.04)',
                    color: promo.discountType === 'person' ? '#fff' : 'rgba(255,255,255,0.6)',
                    fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <i className="fas fa-user" style={{ color: promo.discountType === 'person' ? 'var(--crimson-500)' : 'inherit' }} />
                  ลดต่อคน
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ข้อความและรายละเอียด */}
        <div className="adm-field-row">
          {field('หัวข้อโปรโมชั่น', 'heading', 'เช่น โปรเปิดตี้สืบคดีสุดคุ้ม')}
          {field('ช่วงเวลา / เดือน', 'month', 'เช่น ประจำเดือนนี้ หรือ จำกัดเวลา')}
        </div>
        {field('คำอธิบายโปรโมชั่น', 'description', 'รายละเอียดและเงื่อนไขโปรโมชั่น...', 'textarea')}

        <div className="adm-field-row">
          {field('ป้ายกำกับด้านบน (Badge Tag)', 'promoTag', 'SPECIAL PROMOTION')}
          {field('ข้อความปุ่ม CTA', 'buttonText', 'จองรอบรับสิทธิ์เลย →')}
          <div className="adm-field">
            <label className="adm-label">ปุ่มลิงก์ไปยังหน้า</label>
            <select
              className="adm-input"
              value={promo.buttonLink || 'booking'}
              onChange={e => setPromo(p => ({ ...p, buttonLink: e.target.value }))}
            >
              <option value="booking">หน้าจองห้อง / ปฏิทิน (Booking)</option>
              <option value="games">หน้าคลังเกม (Games)</option>
              <option value="party">หน้าร่วมตี้ (Party)</option>
            </select>
          </div>
        </div>

        <div className="adm-field-row">
          {field('จุดเด่น 1', 'badge1', 'สคริปต์ยอดฮิต')}
          {field('จุดเด่น 2', 'badge2', 'ส่วนลดพิเศษ')}
          {field('จุดเด่น 3', 'badge3', 'จำนวนจำกัด')}
        </div>
      </div>

      {/* ── CARD 2: สปอตไลท์เกมใหม่ (New Games Spotlight - Max 3) ── */}
      <div className="adm-card">
        <div className="adm-card-title" style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            <i className="fas fa-sparkles" style={{ color: '#fbbf24', marginRight: 8 }} />
            เลือกเกมใหม่มาโชว์ (สูงสุด 3 เกม)
          </span>
          <span style={{ fontSize: 11, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>
            {(promo.newGameIds || []).length} / 3 เกม
          </span>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
          คุณสามารถกดเลือกเกมจากคลังเกมในร้าน เพื่อนำมาแสดงเป็นเกมใหม่ล่าสุดที่หน้าหลัก (สูงสุด 3 เกม) และสามารถอัพโหลดรูปปกเฉพาะสำหรับเกมใหม่นั้นๆ ได้
        </div>

        {/* Selected 3 Slots */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[0, 1, 2].map(slotIdx => {
            const gameId = (promo.newGameIds || [])[slotIdx]
            const game = gameId ? allGames.find(g => g.id === gameId) : null
            const customCover = gameId ? promo.customCovers?.[gameId] : null
            const displayCover = customCover || game?.image || game?.coverUrl

            if (!game) {
              return (
                <div
                  key={slotIdx}
                  onClick={() => setShowGamePicker(true)}
                  style={{
                    border: '2px dashed rgba(255,255,255,0.15)', borderRadius: 14, padding: 24,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.02)', minHeight: 180,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--crimson-500)'
                    e.currentTarget.style.background = 'rgba(198,36,25,0.04)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'rgba(255,255,255,0.6)' }}>
                    <i className="fas fa-plus" />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.8)' }}>
                    สล็อตเกมใหม่ #{slotIdx + 1} (ว่าง)
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    คลิกเพื่อเลือกเกมจากคลัง
                  </div>
                </div>
              )
            }

            return (
              <div
                key={slotIdx}
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
                  position: 'relative',
                }}
              >
                {/* Badge Slot */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--crimson-500)', background: 'rgba(198,36,25,0.15)', padding: '2px 8px', borderRadius: 6 }}>
                    สล็อต #{slotIdx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveGame(game.id)}
                    title="นำออกจากเกมใหม่"
                    style={{
                      background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                      fontSize: 14, padding: 4,
                    }}
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>

                {/* Game Info Row */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 60, height: 80, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#111', position: 'relative' }}>
                    {displayCover ? (
                      <img src={convertImg(displayCover, 300)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                        <i className="fas fa-image" />
                      </div>
                    )}
                    {customCover && (
                      <span style={{ position: 'absolute', bottom: 2, right: 2, background: 'var(--crimson-500)', color: '#fff', fontSize: 8, fontWeight: 800, padding: '1px 3px', borderRadius: 3 }}>
                        ปกใหม่
                      </span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {game.title || game.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                      {game.players ? `${game.players} คน` : ''} · {game.difficulty || ''}
                    </div>
                    {game.price !== undefined && (
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', marginTop: 4 }}>
                        ฿{game.fullPrice ?? game.price}
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload Custom Cover */}
                <div style={{ marginTop: 'auto', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '7px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}>
                    <i className={`fas ${uploadingCoverFor === game.id ? 'fa-spinner fa-spin' : 'fa-camera'}`} />
                    {uploadingCoverFor === game.id ? 'กำลังอัพโหลด...' : customCover ? 'เปลี่ยนรูปปกใหม่' : 'อัพโหลดปกเกมใหม่นี้'}
                    <input type="file" accept="image/*" onChange={e => handleGameCoverUpload(game.id, e)} disabled={uploadingCoverFor === game.id} style={{ display: 'none' }} />
                  </label>
                  {customCover && (
                    <button
                      type="button"
                      onClick={() => setPromo(p => {
                        const nextCovers = { ...(p.customCovers || {}) }
                        delete nextCovers[game.id]
                        return { ...p, customCovers: nextCovers }
                      })}
                      style={{
                        width: '100%', marginTop: 4, background: 'none', border: 'none',
                        color: 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer', padding: 2,
                      }}
                    >
                      รีเซ็ตกลับเป็นรูปปกเดิม
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Picker Button / Drawer */}
        {(promo.newGameIds || []).length < 3 && (
          <div>
            {!showGamePicker ? (
              <button
                type="button"
                onClick={() => setShowGamePicker(true)}
                style={{
                  padding: '10px 18px', borderRadius: 8, background: 'rgba(251,191,36,0.15)',
                  border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 13,
                  fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <i className="fas fa-plus" /> เลือกเกมจากคลังมาเพิ่ม (เหลืออีก {3 - (promo.newGameIds || []).length} สล็อต)
              </button>
            ) : (
              <div style={{
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14, padding: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                    เลือกเกมจากคลัง ({filteredAvailableGames.length} เกมที่พร้อมเลือก)
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGamePicker(false)}
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}
                  >
                    <i className="fas fa-times" /> ปิด
                  </button>
                </div>
                <input
                  type="text"
                  className="adm-input"
                  placeholder="ค้นหาชื่อเกม..."
                  value={gameSearch}
                  onChange={e => setGameSearch(e.target.value)}
                  style={{ marginBottom: 12 }}
                />
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredAvailableGames.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#888', padding: 20, fontSize: 12 }}>
                      ไม่พบเกมที่ค้นหา
                    </div>
                  ) : (
                    filteredAvailableGames.map(g => (
                      <div
                        key={g.id}
                        onClick={() => handleAddGame(g.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div style={{ width: 32, height: 42, borderRadius: 4, overflow: 'hidden', background: '#222', flexShrink: 0 }}>
                            {(g.image || g.coverUrl) && (
                              <img src={convertImg(g.image || g.coverUrl, 100)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {g.title || g.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                              {g.players} คน · {g.difficulty || ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          style={{
                            background: 'var(--crimson-500)', border: 'none', color: '#fff',
                            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                          }}
                        >
                          + เลือก
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CARD 3: ตัวอย่างแสดงผลจริง (Live Preview) ── */}
      <div className="adm-card" style={{ background: '#060606', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="adm-card-title" style={{ marginBottom: 16 }}>
          <i className="fas fa-eye" style={{ color: 'var(--crimson-500)' }} /> ตัวอย่างแสดงผลจริงที่หน้าหลัก (Editorial Live Preview)
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden',
        }}>
          {/* Left Preview: Promo */}
          <div style={{
            background: '#060606', borderRight: '1px solid rgba(255,255,255,0.06)',
            padding: 24, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative',
          }}>
            {promo.month && (
              <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                {promo.month}
              </span>
            )}

            <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", textTransform: 'uppercase', lineHeight: 0.95 }}>
              {promo.heading || 'โปรเปิดตี้สืบคดี'}
            </div>

            {promo.discountAmount && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: 'rgba(198,36,25,0.08)',
                border: '1px solid rgba(198,36,25,0.3)', borderRadius: 4, width: 'fit-content',
              }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>ส่วนลด</span>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#fff' }}>{promo.discountAmount}</span>
                <span style={{ fontSize: 9, fontWeight: 800, background: 'var(--crimson-500)', color: '#fff', padding: '2px 6px', borderRadius: 3 }}>
                  {promo.discountType === 'person' ? 'ลดต่อคน' : 'ลดทั้งตี้'}
                </span>
              </div>
            )}

            {promo.bannerUrl && (
              <div style={{ borderRadius: 4, overflow: 'hidden', height: 130, background: '#111', border: '1px solid rgba(255,255,255,0.08)' }}>
                <img src={convertImg(promo.bannerUrl, 500)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              {promo.description}
            </div>

            <button style={{
              marginTop: 'auto', background: '#fff', border: 'none', color: '#111',
              padding: '12px 24px', borderRadius: 4, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', cursor: 'pointer', textAlign: 'center', width: 'fit-content',
            }}>
              {promo.buttonText || 'เริ่มเล่นเลย →'}
            </button>
          </div>

          {/* Right Preview: 3 New Games */}
          <div style={{
            background: '#09090f', padding: 24,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", textTransform: 'uppercase', lineHeight: 0.95 }}>
              3 คดีใหม่ล่าสุด
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedGamesList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                  ยังไม่ได้เลือกเกมใหม่ (จะดึง 3 เกมล่าสุดจากคลังอัตโนมัติ)
                </div>
              ) : (
                selectedGamesList.map(g => {
                  const cover = promo.customCovers?.[g.id] || g.image || g.coverUrl
                  return (
                    <div
                      key={g.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ width: 38, height: 52, borderRadius: 3, overflow: 'hidden', background: '#222', flexShrink: 0, position: 'relative' }}>
                        {cover && <img src={convertImg(cover, 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        <span style={{ position: 'absolute', top: 2, left: 2, background: 'var(--crimson-500)', color: '#fff', fontSize: 7, fontWeight: 900, padding: '1px 3px', borderRadius: 2 }}>
                          NEW
                        </span>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {g.title || g.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                          {g.players} คน · {g.difficulty}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#fff' }}>
                        ฿{g.fullPrice ?? g.price}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        className="adm-btn-red"
        style={{ width: '100%', padding: '15px', fontSize: '15px', fontWeight: 800, borderRadius: 12 }}
        onClick={save}
        disabled={saving}
      >
        {saving ? <span className="spinner-sm" /> : <><i className="fas fa-save" /> บันทึกโปรโมชั่นและเกมใหม่</>}
      </button>
    </div>
  )
}

// ─── Random Wheel Tab ────────────────────────────────────────────────────────
function RandomWheelTab({ showToast, members = [] }) {
  const [config, setConfig] = useState({
    lockedWinnerId: null,
    removedUserIds: [],
    oneShotLock: true,
    removeWinnerMode: 'ask',
    dateFilter: 'all',
  })
  const [playHistory, setPlayHistory] = useState([])
  const [payments, setPayments] = useState([])
  const [winnerHistory, setWinnerHistory] = useState([])
  const [selectedLockedId, setSelectedLockedId] = useState('')
  const [savingLock, setSavingLock] = useState(false)
  const [triggeringSpin, setTriggeringSpin] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedUserForHistory, setSelectedUserForHistory] = useState(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  useEffect(() => {
    // 1. Live config
    const unsubConf = onSnapshot(doc(db, 'wheelSettings', 'config'), (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        setConfig(prev => ({ ...prev, ...d }))
        setSelectedLockedId(d.lockedWinnerId || '')
      }
    })

    // 2. Play history
    const unsubPh = onSnapshot(collection(db, 'playHistory'), (snap) => {
      setPlayHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    // 2.5 Payments
    const unsubPay = onSnapshot(collection(db, 'payments'), (snap) => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    // 3. Winner history
    const qWin = query(collection(db, 'wheelHistory'), orderBy('wonAt', 'desc'), limit(50))
    const unsubWin = onSnapshot(qWin, (snap) => {
      setWinnerHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return () => {
      unsubConf()
      unsubPh()
      unsubPay()
      unsubWin()
    }
  }, [])

  // Combine & Deduplicate Play Records
  const allPlayRecords = useMemo(() => {
    const records = []
    const seenKeys = new Set()

    playHistory.forEach(ph => {
      const pDate = ph.playedAt?.toDate ? ph.playedAt.toDate() : (ph.playedAt ? new Date(ph.playedAt) : new Date())
      const uid = ph.userId || ph.userName || 'unknown'
      const key = `${uid}_${ph.scriptId || ph.scriptTitle}_${pDate.toDateString()}`
      seenKeys.add(key)
      records.push({
        id: ph.id,
        userId: uid,
        userName: ph.userName || 'ลูกค้า',
        userAvatar: ph.userAvatar || '',
        scriptId: ph.scriptId || '',
        scriptTitle: ph.scriptTitle || 'เกมสืบคดี',
        character: ph.character || '',
        dm: ph.dm || '',
        room: ph.room || '',
        playedAt: pDate,
        recordedBy: ph.recordedBy || '',
        source: 'playHistory',
      })
    })

    payments.forEach(pm => {
      const pDate = pm.paidAt?.toDate ? pm.paidAt.toDate() : (pm.paidAt ? new Date(pm.paidAt) : pm.createdAt?.toDate ? pm.createdAt.toDate() : new Date())
      const members = Array.isArray(pm.members) ? pm.members : []
      members.forEach(m => {
        const uid = m.uid || m.name || 'unknown'
        const key = `${uid}_${pm.scriptId || pm.scriptTitle}_${pDate.toDateString()}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          records.push({
            id: `pay_${pm.id}_${uid}`,
            userId: uid,
            userName: m.name || 'ลูกค้า',
            userAvatar: m.avatar || '',
            scriptId: pm.scriptId || '',
            scriptTitle: pm.scriptTitle || 'เกมสืบคดี',
            character: m.character || '',
            dm: pm.dm || '',
            room: pm.room || pm.sessionLabel || '',
            playedAt: pDate,
            recordedBy: 'POS Checkout',
            source: 'payment',
          })
        }
      })
    })

    return records.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
  }, [playHistory, payments])

  // Aggregate user play counts
  const candidates = useMemo(() => {
    const userPlays = {}
    const userDetails = {}

    const memMap = {}
    members.forEach(m => { memMap[m.id] = m })

    allPlayRecords.forEach(ph => {
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

    Object.keys(userPlays).forEach(uid => {
      const mem = memMap[uid]
      if (mem) {
        userDetails[uid] = {
          ...userDetails[uid],
          name: mem.nickname || mem.firstname || mem.name || userDetails[uid].name,
          fullName: [mem.firstname, mem.lastname].filter(Boolean).join(' ') || mem.name || '',
          avatar: mem.pictureUrl || userDetails[uid].avatar,
          tel_no: mem.tel_no || '',
        }
      }
    })

    const removedSet = new Set(config.removedUserIds || [])

    const list = Object.keys(userPlays).map(uid => {
      const details = userDetails[uid]
      return {
        id: uid,
        name: details.name,
        fullName: details.fullName,
        avatar: details.avatar,
        tel_no: details.tel_no,
        tickets: userPlays[uid],
        isRemoved: removedSet.has(uid),
      }
    })

    const activeList = list.filter(c => !c.isRemoved)
    const totalTickets = activeList.reduce((s, c) => s + c.tickets, 0)

    return list.map(c => ({
      ...c,
      chance: totalTickets > 0 && !c.isRemoved ? ((c.tickets / totalTickets) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.tickets - a.tickets)
  }, [allPlayRecords, members, config.removedUserIds])

  const userHistoryList = useMemo(() => {
    if (!selectedUserForHistory) return []
    const targetId = selectedUserForHistory.id
    const targetName = selectedUserForHistory.name
    return allPlayRecords.filter(r => r.userId === targetId || (targetName && r.userName === targetName))
  }, [allPlayRecords, selectedUserForHistory])

  const activeCandidates = useMemo(() => candidates.filter(c => !c.isRemoved), [candidates])
  const removedCandidates = useMemo(() => candidates.filter(c => c.isRemoved), [candidates])
  const totalActiveTickets = useMemo(() => activeCandidates.reduce((s, c) => s + c.tickets, 0), [activeCandidates])

  const lockedCandidate = useMemo(() => {
    return candidates.find(c => c.id === config.lockedWinnerId)
  }, [candidates, config.lockedWinnerId])

  // Save locked winner
  const handleSaveLock = async () => {
    setSavingLock(true)
    try {
      await updateDoc(doc(db, 'wheelSettings', 'config'), {
        lockedWinnerId: selectedLockedId || null,
        oneShotLock: config.oneShotLock !== false,
        updatedAt: serverTimestamp(),
      })
      showToast(selectedLockedId ? 'บันทึกการล็อคผลเรียบร้อยแล้ว' : 'ปลดล็อคการสุ่มแล้ว')
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setSavingLock(false)
    }
  }

  // Clear lock
  const handleClearLock = async () => {
    setSelectedLockedId('')
    try {
      await updateDoc(doc(db, 'wheelSettings', 'config'), {
        lockedWinnerId: null,
        updatedAt: serverTimestamp(),
      })
      showToast('ปลดล็อคการสุ่มเรียบร้อยแล้ว')
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  // Toggle one-shot lock
  const handleToggleOneShot = async (val) => {
    try {
      await updateDoc(doc(db, 'wheelSettings', 'config'), {
        oneShotLock: val,
        updatedAt: serverTimestamp(),
      })
      showToast('อัปเดตการตั้งค่าแล้ว')
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  // Update removeWinnerMode
  const handleUpdateRemoveMode = async (mode) => {
    try {
      await updateDoc(doc(db, 'wheelSettings', 'config'), {
        removeWinnerMode: mode,
        updatedAt: serverTimestamp(),
      })
      showToast('อัปเดตการจัดการผู้ชนะแล้ว')
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  // Trigger remote spin
  const handleTriggerSpin = async () => {
    if (!window.confirm('ต้องการสั่งหมุนวงล้อไปยังหน้าจอแสดงผล (/random) ทันทีใช่หรือไม่?')) return
    setTriggeringSpin(true)
    try {
      await updateDoc(doc(db, 'wheelSettings', 'config'), {
        spinCommand: {
          id: 'spin_' + Date.now(),
          timestamp: Date.now(),
          trigger: true,
          targetWinnerId: config.lockedWinnerId || null,
        },
        updatedAt: serverTimestamp(),
      })
      showToast('ส่งคำสั่งหมุนวงล้อเรียบร้อยแล้ว')
    } catch (e) {
      showToast('ส่งคำสั่งไม่สำเร็จ: ' + e.message, 'error')
    } finally {
      setTriggeringSpin(false)
    }
  }

  // Remove or Restore user
  const handleToggleRemove = async (userId, shouldRemove) => {
    try {
      const current = Array.isArray(config.removedUserIds) ? config.removedUserIds : []
      const updated = shouldRemove ? [...current, userId] : current.filter(id => id !== userId)
      await updateDoc(doc(db, 'wheelSettings', 'config'), {
        removedUserIds: updated,
        updatedAt: serverTimestamp(),
      })
      showToast(shouldRemove ? 'นำออกจากวงล้อแล้ว' : 'คืนสิทธิ์เข้าวงล้อแล้ว')
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  // Restore all
  const handleRestoreAll = async () => {
    if (!window.confirm('ต้องการคืนสิทธิ์รายชื่อที่ถูกลบทั้งหมดกลับเข้าวงล้อใช่หรือไม่?')) return
    try {
      await updateDoc(doc(db, 'wheelSettings', 'config'), {
        removedUserIds: [],
        updatedAt: serverTimestamp(),
      })
      showToast('คืนสิทธิ์ให้ทุกคนเรียบร้อยแล้ว')
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  const filteredCandidates = activeCandidates.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.fullName && c.fullName.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header Card ── */}
      <div className="adm-card" style={{
        background: 'linear-gradient(135deg, rgba(198,36,25,0.12) 0%, rgba(200,160,80,0.08) 100%)',
        border: '1px solid rgba(198,36,25,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <i className="fas fa-dice" style={{ fontSize: 20, color: 'var(--crimson-500)' }} />
              <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>
                วงล้อสุ่มผู้โชคดี (Lucky Wheel)
              </h2>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              คำนวณสิทธิ์ตามจำนวนครั้งที่ลูกค้าเล่นเกมอัตโนมัติ ยิ่งเล่นเยอะยิ่งมีชื่อในวงล้อเยอะ
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href="/random"
              target="_blank"
              rel="noopener noreferrer"
              className="adm-btn-red"
              style={{
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', fontSize: 13,
              }}
            >
              <i className="fas fa-external-link-alt" /> เปิดหน้าวงล้อ (/random)
            </a>
            <button
              onClick={handleTriggerSpin}
              disabled={triggeringSpin || activeCandidates.length === 0}
              className="adm-btn-red"
              style={{
                background: 'linear-gradient(135deg, #c8a050, #9a1c13)',
                borderColor: '#c8a050',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', fontSize: 13, cursor: 'pointer',
              }}
            >
              <i className={`fas ${triggeringSpin ? 'fa-spinner fa-spin' : 'fa-play-circle'}`} />
              <span>สั่งหมุนจอแสดงผลทันที</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── CARD 1: ล็อคผลการสุ่ม (Rigged Winner Settings) ── */}
      <div className="adm-card" style={{
        border: `1px solid ${config.lockedWinnerId ? 'rgba(239,68,68,0.45)' : 'var(--border-default)'}`,
      }}>
        <div className="adm-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-user-secret" style={{ color: config.lockedWinnerId ? '#ef4444' : '#c8a050', fontSize: 16 }} />
            <span>ระบบล็อคผลการสุ่ม (Rigged Winner)</span>
          </div>

          <span style={{
            fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 12,
            background: config.lockedWinnerId ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
            border: `1px solid ${config.lockedWinnerId ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}`,
            color: config.lockedWinnerId ? '#ef4444' : '#22c55e',
          }}>
            {config.lockedWinnerId ? 'มีการล็อคผล' : 'สุ่มตามธรรมชาติ (Fair)'}
          </span>
        </div>

        {/* Current status banner */}
        {config.lockedWinnerId ? (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: '#ef4444',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 14, overflow: 'hidden',
              }}>
                {lockedCandidate?.avatar ? (
                  <img src={lockedCandidate.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  (lockedCandidate?.name || '?')[0]
                )}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444' }}>
                  <i className="fas fa-lock" style={{ marginRight: 4, color: '#ef4444' }} /> ล็อคให้: {lockedCandidate?.name || config.lockedWinnerId}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  การหมุนรอบถัดไปจะตกที่คนนี้แน่นอน (สิทธิ์: {lockedCandidate?.tickets || 0} ครั้ง, โอกาส: {lockedCandidate?.chance || 0}%)
                </div>
              </div>
            </div>

            <button
              onClick={handleClearLock}
              className="adm-btn-red"
              style={{
                background: 'rgba(239,68,68,0.2)', borderColor: '#ef4444', color: '#ef4444',
                padding: '6px 12px', fontSize: 12, cursor: 'pointer',
              }}
            >
              <i className="fas fa-unlock" style={{ marginRight: 5 }} /> ปลดล็อค
            </button>
          </div>
        ) : (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
            fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="fas fa-check-circle" />
            วงล้อทำงานแบบสุ่มตามสัดส่วนจำนวนครั้งที่เล่น (ไม่มีการล็อคผล)
          </div>
        )}

        {/* Lock selector form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
              เลือกผู้ที่จะให้ชนะในรอบต่อไป:
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                className="form-input"
                style={{ flex: 1, minWidth: 240 }}
                value={selectedLockedId}
                onChange={e => setSelectedLockedId(e.target.value)}
              >
                <option value="">-- ไม่ล็อคผล (สุ่มตามปกติ) --</option>
                {activeCandidates.map(c => (
                  <option key={c.id} value={c.id}>
                    <i className="fas fa-lock" style={{ marginRight: 4, color: '#ef4444' }} /> {c.name} ({c.tickets} ครั้ง · {c.chance}%)
                  </option>
                ))}
              </select>

              <button
                onClick={handleSaveLock}
                disabled={savingLock}
                className="adm-btn-red"
                style={{ padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}
              >
                {savingLock ? 'กำลังบันทึก...' : 'บันทึกการล็อค'}
              </button>
            </div>
          </div>

          {/* One-shot lock checkbox */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={config.oneShotLock !== false}
              onChange={e => handleToggleOneShot(e.target.checked)}
              style={{ accentColor: 'var(--crimson-500)', width: 16, height: 16 }}
            />
            <span>ปลดล็อคอัตโนมัติหลังจากหมุนจบ 1 รอบ (แนะนำ เพื่อความแนบเนียน)</span>
          </label>
        </div>
      </div>

      {/* ── CARD 2: การจัดการชื่อที่สุ่มได้แล้ว (Post-Win Management) ── */}
      <div className="adm-card">
        <div className="adm-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-cog" style={{ color: 'var(--crimson-500)' }} />
            <span>การจัดการเมื่อสุ่มได้ผู้โชคดี (Post-Win Management)</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { key: 'ask', label: 'ถามทุกครั้งหลังสุ่มเสร็จ (แนะนำ)', desc: 'ให้ผู้คุมเลือกว่าจะเก็บหรือลบชื่อผู้ชนะบนหน้าจอ' },
              { key: 'auto_remove', label: 'ลบชื่อออกจากวงล้ออัตโนมัติ', desc: 'ผู้ชนะจะไม่ถูกนำมาสุ่มซ้ำในรอบถัดไป' },
              { key: 'auto_keep', label: 'เก็บชื่อไว้ในวงล้ออัตโนมัติ', desc: 'ผู้ชนะยังมีสิทธิ์ได้รางวัลในรอบต่อไป' },
            ].map(opt => (
              <label
                key={opt.key}
                style={{
                  flex: 1, minWidth: 200, padding: '12px 14px', borderRadius: 10,
                  border: `1.5px solid ${config.removeWinnerMode === opt.key ? 'var(--crimson-500)' : 'var(--border-default)'}`,
                  background: config.removeWinnerMode === opt.key ? 'rgba(198,36,25,0.06)' : 'var(--surface-card)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800 }}>
                  <input
                    type="radio"
                    name="removeWinnerMode"
                    value={opt.key}
                    checked={(config.removeWinnerMode || 'ask') === opt.key}
                    onChange={() => handleUpdateRemoveMode(opt.key)}
                    style={{ accentColor: 'var(--crimson-500)' }}
                  />
                  <span>{opt.label}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', paddingLeft: 22 }}>
                  {opt.desc}
                </div>
              </label>
            ))}
          </div>

          {/* List of currently removed candidates */}
          <div style={{ marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)' }}>
                รายชื่อที่ถูกลบออกจากวงล้อ ({removedCandidates.length})
              </div>
              {removedCandidates.length > 0 && (
                <button
                  onClick={handleRestoreAll}
                  className="adm-btn-red"
                  style={{
                    background: 'none', border: '1px solid var(--border-strong)',
                    color: 'var(--text-secondary)', padding: '4px 10px', fontSize: 11,
                  }}
                >
                  <i className="fas fa-undo" style={{ marginRight: 4 }} /> คืนสิทธิ์ทุกคน
                </button>
              )}
            </div>

            {removedCandidates.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                ไม่มีรายชื่อที่ถูกลบออก (ทุกคนมีสิทธิ์ในวงล้อตามปกติ)
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {removedCandidates.map(c => (
                  <div
                    key={c.id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '5px 10px', borderRadius: 8,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                      fontSize: 12,
                    }}
                  >
                    <span>{c.name}</span>
                    <button
                      onClick={() => handleToggleRemove(c.id, false)}
                      title="คืนสิทธิ์กลับเข้าวงล้อ"
                      style={{
                        background: 'none', border: 'none', color: '#22c55e',
                        cursor: 'pointer', padding: '0 2px', fontSize: 12,
                      }}
                    >
                      <i className="fas fa-plus-circle" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CARD 3: รายชื่อผู้มีสิทธิ์ในวงล้อ (Candidate Roster) ── */}
      <div className="adm-card">
        <div className="adm-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div>
            <span>รายชื่อผู้มีสิทธิ์ในวงล้อ ({activeCandidates.length} คน · รวม {totalActiveTickets} สิทธิ์)</span>
          </div>

          <input
            type="text"
            placeholder="ค้นหาชื่อผู้เล่น..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input"
            style={{ width: 180, padding: '6px 12px', fontSize: 12 }}
          />
        </div>

        {filteredCandidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
            ยังไม่มีรายชื่อผู้เล่นที่บันทึกประวัติการเล่น
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px 12px' }}>#</th>
                  <th style={{ padding: '8px 12px' }}>ผู้เล่น</th>
                  <th style={{ padding: '8px 12px' }}>จำนวนครั้งที่เล่น (สิทธิ์)</th>
                  <th style={{ padding: '8px 12px' }}>โอกาส (%)</th>
                  <th style={{ padding: '8px 12px' }}>สถานะ</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>การกระทำ</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c, idx) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border-default)',
                      background: config.lockedWinnerId === c.id ? 'rgba(239,68,68,0.06)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--text-tertiary)' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', background: 'var(--crimson-500)',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 900, overflow: 'hidden', flexShrink: 0,
                        }}>
                          {c.avatar ? (
                            <img src={c.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            c.name[0]
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
                          {c.fullName && c.fullName !== c.name && (
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.fullName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 800 }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(200,160,80,0.12)', color: '#c8a050',
                      }}>
                        <i className="fas fa-ticket-alt" style={{ marginRight: 4, color: '#fbbf24' }} /> {c.tickets} ครั้ง
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--text-secondary)' }}>
                      {c.chance}%
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {config.lockedWinnerId === c.id ? (
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '2px 7px', borderRadius: 6 }}>
                          <i className="fas fa-lock" style={{ marginRight: 4 }} /> ล็อครอบนี้
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>ปกติ</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          onClick={() => {
                            setSelectedUserForHistory(c)
                            setShowHistoryModal(true)
                          }}
                          title="ดูประวัติการเล่น"
                          style={{
                            padding: '4px 8px', borderRadius: 6,
                            background: 'rgba(200,160,80,0.12)', color: '#c8a050',
                            border: '1px solid rgba(200,160,80,0.3)',
                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <i className="fas fa-history" style={{ marginRight: 4 }} /> ประวัติ
                        </button>
                        <button
                          onClick={() => {
                            setSelectedLockedId(c.id)
                            updateDoc(doc(db, 'wheelSettings', 'config'), {
                              lockedWinnerId: c.id,
                              updatedAt: serverTimestamp(),
                            }).then(() => showToast(`ล็อคผลให้ ${c.name} แล้ว`))
                          }}
                          title="ล็อคให้คนนี้ชนะรอบต่อไป"
                          style={{
                            padding: '4px 8px', borderRadius: 6,
                            background: config.lockedWinnerId === c.id ? '#ef4444' : 'rgba(239,68,68,0.1)',
                            color: config.lockedWinnerId === c.id ? '#fff' : '#ef4444',
                            border: '1px solid rgba(239,68,68,0.3)',
                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          ล็อคคนนี้
                        </button>
                        <button
                          onClick={() => handleToggleRemove(c.id, true)}
                          title="ลบออกจากวงล้อ"
                          style={{
                            padding: '4px 8px', borderRadius: 6,
                            background: 'none', color: 'var(--text-tertiary)',
                            border: '1px solid var(--border-default)',
                            fontSize: 11, cursor: 'pointer',
                          }}
                        >
                          ลบออก
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CARD 4: ประวัติการสุ่ม (Winner History) ── */}
      <div className="adm-card">
        <div className="adm-card-title" style={{ marginBottom: 14 }}>
          <span>ประวัติผู้โชคดีล่าสุด ({winnerHistory.length})</span>
        </div>

        {winnerHistory.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '10px 0' }}>
            ยังไม่มีประวัติการสุ่ม
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {winnerHistory.map(w => {
              const dStr = w.wonAt?.toDate ? w.wonAt.toDate().toLocaleString('th-TH') : ''
              return (
                <div
                  key={w.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 12px', borderRadius: 8,
                    background: 'var(--surface-page)', border: '1px solid var(--border-default)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fas fa-crown" style={{ fontSize: 14, color: '#f59e0b' }} />
                    <strong style={{ color: 'var(--text-primary)' }}>{w.winnerName}</strong>
                    <span style={{ color: 'var(--text-tertiary)' }}>({w.tickets} สิทธิ์ · {w.chance}%)</span>
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {dStr}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── PLAYER HISTORY MODAL FOR ADMIN ── */}
      {showHistoryModal && selectedUserForHistory && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: 'var(--surface-modal, #1e1e2d)',
            border: '1px solid var(--border-default, rgba(255,255,255,0.15))',
            borderRadius: 16,
            maxWidth: 520,
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-default, rgba(255,255,255,0.1))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'var(--crimson-500, #c62419)', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 900, color: '#fff',
                }}>
                  {selectedUserForHistory.avatar ? (
                    <img src={selectedUserForHistory.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    (selectedUserForHistory.name || 'U')[0]
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #fff)' }}>
                    {selectedUserForHistory.name}
                  </div>
                  {selectedUserForHistory.fullName && selectedUserForHistory.fullName !== selectedUserForHistory.name && (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary, #888)' }}>
                      {selectedUserForHistory.fullName}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary, #888)', fontSize: 18, cursor: 'pointer' }}
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {/* Summary Bar */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              padding: '12px 18px',
              background: 'rgba(0,0,0,0.2)',
              borderBottom: '1px solid var(--border-default, rgba(255,255,255,0.06))',
              textAlign: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary, #888)' }}>เล่นที่ร้านทั้งหมด</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#fbbf24' }}>
                  {userHistoryList.length} ครั้ง
                </div>
              </div>
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary, #888)' }}>สิทธิ์ในวงล้อ</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#4ade80' }}>
                  {candidates.find(c => c.id === selectedUserForHistory.id)?.tickets || userHistoryList.length} สิทธิ์
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary, #888)' }}>โอกาสชนะ</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#60a5fa' }}>
                  {candidates.find(c => c.id === selectedUserForHistory.id)?.chance || 0}%
                </div>
              </div>
            </div>

            {/* List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary, #aaa)' }}>
                รายการการเล่นที่บันทึกไว้ ({userHistoryList.length} รายการ)
              </div>
              {userHistoryList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-tertiary, #777)', fontSize: 13 }}>
                  ไม่มีประวัติการเล่นเกมที่บันทึกในระบบ
                </div>
              ) : (
                userHistoryList.map((item, idx) => {
                  const dStr = item.playedAt ? (item.playedAt.toLocaleString ? item.playedAt.toLocaleString('th-TH') : String(item.playedAt)) : '-'
                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'var(--surface-page, rgba(255,255,255,0.03))',
                        border: '1px solid var(--border-default, rgba(255,255,255,0.06))',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <strong style={{ color: 'var(--text-primary, #fff)', fontSize: 13 }}>
                          <i className="fas fa-gamepad" style={{ marginRight: 4, color: '#60a5fa' }} /> {item.scriptTitle}
                        </strong>
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          background: item.source === 'payment' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                          color: item.source === 'payment' ? '#60a5fa' : '#34d399',
                        }}>
                          {item.source === 'payment' ? 'เช็คบิลหน้าร้าน' : 'บันทึกการเล่น'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', color: 'var(--text-secondary, #aaa)', marginBottom: 4 }}>
                        {item.character && <span>บท: <strong style={{ color: '#fff' }}>{item.character}</strong></span>}
                        {item.dm && <span>DM: <strong style={{ color: '#fff' }}>{item.dm}</strong></span>}
                        {item.room && <span>ห้อง: {item.room}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary, #777)' }}>
                        <i className="fas fa-clock" style={{ marginRight: 4, color: '#a78bfa' }} /> {dStr}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-default, rgba(255,255,255,0.1))',
              display: 'flex',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="btn-secondary"
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Data Management Tab ─────────────────────────────────────────────────────
function DataTab({ showToast }) {
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(null) // 'payments' | 'orders' | 'all' | null
  const [modal, setModal] = useState(null)        // same values

  const deleteCollection = async (colName) => {
    const snap = await getDocs(collection(db, colName))
    const batches = []
    let batch = writeBatch(db)
    let count = 0
    snap.docs.forEach(d => {
      batch.delete(d.ref)
      count++
      if (count % 499 === 0) { batches.push(batch); batch = writeBatch(db) }
    })
    batches.push(batch)
    await Promise.all(batches.map(b => b.commit()))
    return snap.docs.length
  }

  const handleDelete = async (target) => {
    setDeleting(target)
    try {
      let total = 0
      if (target === 'payments'    || target === 'all') total += await deleteCollection('payments')
      if (target === 'orders'      || target === 'all') total += await deleteCollection('orders')
      if (target === 'playHistory' || target === 'all') total += await deleteCollection('playHistory')
      showToast(`ลบแล้ว ${total} รายการ`)
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setDeleting(null)
      setModal(null)
      setConfirm('')
    }
  }

  const WORD = 'ลบทั้งหมด'

  const ConfirmModal = ({ target, label }) => (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => e.target === e.currentTarget && setModal(null)}>
      <div style={{ background:'var(--surface-card)', borderRadius:16, padding:'28px 24px', width:'100%', maxWidth:400, border:'1px solid rgba(198,36,25,0.35)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <i className="fas fa-exclamation-triangle" style={{ color:'var(--crimson-500)', fontSize:20 }} />
          <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:'var(--text-primary)' }}>ยืนยันการลบ</h3>
        </div>
        <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.7, marginBottom:18 }}>
          คุณกำลังจะ<strong style={{ color:'var(--crimson-500)' }}> {label} </strong>ออกจากระบบถาวร ข้อมูลจะไม่สามารถกู้คืนได้<br />
          พิมพ์ <strong>{WORD}</strong> เพื่อยืนยัน
        </p>
        <input
          style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid var(--border-default)', background:'var(--surface-page)', color:'var(--text-primary)', fontSize:14, fontFamily:"'Sarabun',sans-serif", marginBottom:16, outline:'none', boxSizing:'border-box' }}
          placeholder={WORD}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          autoFocus
        />
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => { setModal(null); setConfirm('') }}
            style={{ flex:1, padding:'11px', borderRadius:8, border:'1px solid var(--border-default)', background:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Sarabun',sans-serif" }}>
            ยกเลิก
          </button>
          <button
            disabled={confirm !== WORD || !!deleting}
            onClick={() => handleDelete(target)}
            style={{ flex:1, padding:'11px', borderRadius:8, border:'none', background: confirm === WORD ? 'var(--crimson-500)' : 'var(--border-default)', color: confirm === WORD ? '#fff' : 'var(--text-tertiary)', cursor: confirm === WORD && !deleting ? 'pointer' : 'default', fontSize:13, fontWeight:800, fontFamily:"'Sarabun',sans-serif", transition:'background 0.18s' }}>
            {deleting ? <><i className="fas fa-spinner fa-spin" /> กำลังลบ...</> : 'ยืนยันลบ'}
          </button>
        </div>
      </div>
    </div>
  )

  const DangerRow = ({ icon, label, sub, target }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, padding:'16px 0', borderBottom:'1px solid var(--border-default)', flexWrap:'wrap' }}>
      <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
        <i className={`fas ${icon}`} style={{ color:'var(--crimson-500)', fontSize:16, marginTop:2 }} />
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>{label}</div>
          <div style={{ fontSize:12, color:'var(--text-tertiary)', lineHeight:1.6 }}>{sub}</div>
        </div>
      </div>
      <button
        onClick={() => { setConfirm(''); setModal(target) }}
        style={{ padding:'9px 18px', borderRadius:8, border:'1px solid rgba(198,36,25,0.4)', background:'rgba(198,36,25,0.08)', color:'var(--crimson-500)', cursor:'pointer', fontSize:12, fontWeight:800, fontFamily:"'Sarabun',sans-serif", whiteSpace:'nowrap', transition:'background 0.18s' }}
        onMouseEnter={e => e.currentTarget.style.background='rgba(198,36,25,0.16)'}
        onMouseLeave={e => e.currentTarget.style.background='rgba(198,36,25,0.08)'}>
        <i className="fas fa-trash-alt" style={{ marginRight:6 }} />ลบ
      </button>
    </div>
  )

  return (
    <div>
      <div className="adm-card" style={{ borderColor:'rgba(198,36,25,0.25)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
          <i className="fas fa-exclamation-triangle" style={{ color:'var(--crimson-500)' }} />
          <div className="adm-card-title" style={{ margin:0 }}>Danger Zone</div>
        </div>
        <p style={{ fontSize:12, color:'var(--text-tertiary)', marginBottom:20, lineHeight:1.7 }}>
          การลบข้อมูลเป็นการถาวร ไม่สามารถกู้คืนได้ ควร Export Report ก่อนลบ
        </p>
        <DangerRow
          icon="fa-receipt"
          label="ลบประวัติการชำระเงินทั้งหมด"
          sub="ลบทุก document ใน collection payments — ประวัติการเล่นของสมาชิกทั้งหมดจะหายไป"
          target="payments"
        />
        <DangerRow
          icon="fa-shopping-cart"
          label="ลบออเดอร์ทั้งหมด"
          sub="ลบทุก document ใน collection orders — รายการสั่งอาหาร/เครื่องดื่มจะหายไป"
          target="orders"
        />
        <DangerRow
          icon="fa-history"
          label="ลบรายงานการเล่นทั้งหมด"
          sub="ลบทุก document ใน collection playHistory — log การสแกน QR และปิดออเดอร์ทั้งหมดจะหายไป"
          target="playHistory"
        />
        <DangerRow
          icon="fa-database"
          label="ลบข้อมูลทั้งหมด"
          sub="ลบ payments, orders และ playHistory พร้อมกันทีเดียว"
          target="all"
        />
      </div>

      {modal === 'payments'    && <ConfirmModal target="payments"    label="ลบประวัติการชำระเงินทั้งหมด" />}
      {modal === 'orders'      && <ConfirmModal target="orders"      label="ลบออเดอร์ทั้งหมด" />}
      {modal === 'playHistory' && <ConfirmModal target="playHistory" label="ลบรายงานการเล่นทั้งหมด" />}
      {modal === 'all'         && <ConfirmModal target="all"         label="ลบข้อมูลทั้งหมด" />}
    </div>
  )
}

// ─── Bookings Tab ─────────────────────────────────────────────────────────────
const ALL_ROOMS_ADMIN = [
  'Waiting Area 1', 'Waiting Area 2', '404 Bar', 'Japanese Room',
  'Chinese Room', 'Europe Room', 'Ghost Room', 'Projector Room',
  '5 Floor', 'Yang', 'Chinese DM', 'Thai DM',
]

const STATUS_LABELS_B = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  locked: 'ล็อกห้อง',
  collapsed: 'ปาร์ตี้ล่ม',
  cancelled: 'ยกเลิก',
}

const STATUS_COLORS_B = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  locked: '#22c55e',
  collapsed: '#ef4444',
  cancelled: '#64748b',
}

function BookingStatusBadge({ status }) {
  const color = STATUS_COLORS_B[status] || '#888' /* ds-allow-hardcode: status data-viz */
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      background: color + '1a', color, border: `1px solid ${color}55`,
      fontFamily: "'Sarabun', sans-serif", whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {STATUS_LABELS_B[status] || status}
    </span>
  )
}

function ConfirmBookingModal({ booking, adminUser, onClose, showToast }) {
  const [room, setRoom] = useState(booking.room || '')
  const [adminNote, setAdminNote] = useState(booking.adminNote || '')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!room) { showToast('กรุณาเลือกห้อง', 'error'); return }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        status: 'confirmed',
        room,
        adminNote,
        depositDeadline: new Date(Date.now() + 3 * 86400000).toISOString(),
        confirmedAt: new Date().toISOString(),
        confirmedBy: adminUser?.name || adminUser?.email || 'admin',
        updatedAt: serverTimestamp(),
      })
      showToast('ยืนยันการจองสำเร็จ')
      onClose()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9900, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--surface-elevated, #ffffff)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 520,
        border: '1px solid var(--border-default)', borderBottom: 'none',
        boxShadow: '0 -8px 48px rgba(0,0,0,0.45)',
        fontFamily: "'Sarabun', sans-serif",
        animation: 'slideUp 0.28s cubic-bezier(0.22,1,0.36,1)',
      }}>
        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 14, paddingBottom: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
            ยืนยันการจอง
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, color: 'var(--text-tertiary)', padding: 6, lineHeight: 1 }}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div style={{ padding: '0 20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Booking summary */}
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-page)', border: '1px solid var(--border-default)' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>{booking.gameName || '-'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{booking.date}{booking.time ? ` · ${booking.time}` : ''} &middot; {booking.leaderName}</div>
          </div>

          {/* Room chip selector */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              เลือกห้อง *
            </label>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {ALL_ROOMS_ADMIN.map(r => {
                const rc = ROOM_COLORS_ADM[r] || '#888' /* ds-allow-hardcode: room data-viz */
                const sel = room === r
                return (
                  <button key={r} onClick={() => setRoom(r)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                      border: sel ? `1.5px solid ${rc}` : '1px solid var(--border-default)',
                      background: sel ? rc + '22' : 'var(--surface-page)',
                      color: sel ? rc : 'var(--text-secondary)',
                      cursor: 'pointer', transition: 'all 0.14s', fontFamily: "'Sarabun',sans-serif",
                    }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: rc, flexShrink: 0 }} />
                    {r}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Admin note */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              หมายเหตุถึงสมาชิก
            </label>
            <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3}
              placeholder="เช่น นัดเวลา 18:00 น."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--surface-page)', color: 'var(--text-primary)', fontSize: 13, fontFamily: "'Sarabun',sans-serif", outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '13px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: "'Sarabun',sans-serif" }}>
              ยกเลิก
            </button>
            <button onClick={handleConfirm} disabled={saving || !room}
              style={{ flex: 2, padding: '13px', borderRadius: 10, border: 'none', background: room ? '#3b82f6' : 'var(--border-default)', color: room ? '#fff' : 'var(--text-tertiary)', cursor: saving || !room ? 'default' : 'pointer', fontSize: 14, fontWeight: 800, fontFamily: "'Sarabun',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s' }}> {/* ds-allow-hardcode: action blue */}
              {saving
                ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> กำลังบันทึก...</>
                : <><i className="fas fa-check" /> ยืนยันการจอง</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockBookingModal({ adminUser, onClose, showToast, allGames = [] }) {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const dayAfter = new Date(Date.now() + 172800000).toISOString().slice(0, 10)

  const [date, setDate] = useState(today)
  const [time, setTime] = useState('13:00')
  const [room, setRoom] = useState('')
  const [note, setNote] = useState('')
  const [gameMode, setGameMode] = useState('select') // 'select' | 'custom'
  const [selectedGameId, setSelectedGameId] = useState('')
  const [customGameName, setCustomGameName] = useState('')
  const [gameSearch, setGameSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedGame = allGames.find(g => g.id === selectedGameId)

  const filteredGames = useMemo(() => {
    if (!gameSearch.trim()) return allGames
    const q = gameSearch.toLowerCase()
    return allGames.filter(g => (g.title || g.name || '').toLowerCase().includes(q))
  }, [allGames, gameSearch])

  const QUICK_TIMES = ['13:00', '14:00', '15:30', '18:00', '19:30', '21:00']
  const QUICK_PRESETS = [
    'ปิดห้องส่วนตัว (Private)',
    'งานวันเกิด / ปาร์ตี้',
    'ปิดซ่อมบำรุงห้อง',
    'Walk-in หน้าร้าน',
    'ถ่ายทำ / กองถ่าย',
  ]

  const handleSubmit = async () => {
    if (!date) { showToast('กรุณาเลือกวันที่', 'error'); return }
    if (!room) { showToast('กรุณาเลือกห้องที่ต้องการบล็อก', 'error'); return }

    const finalGameName = (gameMode === 'select' ? selectedGame?.title : customGameName) || customGameName || note || 'Mock Block'
    const finalGameImage = (gameMode === 'select' ? (selectedGame?.image || selectedGame?.coverUrl) : '') || ''
    const finalGameId = (gameMode === 'select' ? selectedGameId : '') || ''

    setSaving(true)
    try {
      await addDoc(collection(db, 'bookings'), {
        gameId: finalGameId,
        gameName: finalGameName,
        gameImage: finalGameImage,
        date,
        time: time || '13:00',
        room,
        status: 'confirmed', // สถานะยืนยันแล้วทันที!
        isMock: true,
        mockNote: note || '',
        adminNote: note || '',
        leaderId: adminUser?.uid || 'admin',
        leaderName: adminUser?.name || 'Admin Block',
        leaderAvatar: '',
        members: [],
        maxMembers: selectedGame?.players ? (parseInt(selectedGame.players) || 0) : 0,
        depositAmount: 0,
        depositDeadline: '',
        confirmedAt: new Date().toISOString(),
        confirmedBy: adminUser?.name || 'admin',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      showToast(`สร้าง Mock Block "${finalGameName}" (สถานะยืนยันแล้ว) สำเร็จ`, 'success')
      onClose()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(5px)',
        zIndex: 9900, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 18, width: '100%', maxWidth: 580, maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          fontFamily: "'Sarabun', sans-serif",
          overflow: 'hidden',
          animation: 'mmFadeUp 0.22s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#ffffff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: '#fef3c7', color: '#d97706',
              border: '1px solid #fde68a',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
            }}>
              <i className="fas fa-lock" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                  สร้าง Mock Block (ล็อกห้อง / จองพิเศษ)
                </h3>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                ระบบจะตั้งสถานะเป็น <strong style={{ color: '#059669' }}>"ยืนยันแล้ว"</strong> ทันที เพื่อล็อกห้องไม่ให้ลูกค้าจองชน
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 16, color: '#94a3b8', padding: '6px 8px', borderRadius: 8,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f172a' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#94a3b8' }}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Status Alert Badge */}
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: '#ecfdf5', border: '1px solid #a7f3d0',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <i className="fas fa-check-circle" style={{ color: '#059669', fontSize: 16, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#065f46', lineHeight: 1.5 }}>
              <span style={{ color: '#047857', fontWeight: 800, marginRight: 6 }}>[สถานะ: ยืนยันแล้ว]</span>
              หลังบันทึก ระบบจะลงตารางและขึ้นในปฏิทินทันที พร้อมล็อกห้องอัตโนมัติ
            </div>
          </div>

          {/* Row 1: Date & Time */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {/* Date */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  วันที่เล่น / บล็อก *
                </label>
              </div>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1px solid #cbd5e1', background: '#f8fafc',
                  color: '#0f172a', fontSize: 13.5, fontFamily: "'Sarabun',sans-serif",
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {/* Quick Date Chips */}
              <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                {[
                  { label: 'วันนี้', val: today },
                  { label: 'พรุ่งนี้', val: tomorrow },
                  { label: 'มะรืนนี้', val: dayAfter },
                ].map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setDate(item.val)}
                    style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
                      border: date === item.val ? '1px solid var(--crimson-500)' : '1px solid #e2e8f0',
                      background: date === item.val ? 'rgba(198,36,25,0.08)' : '#f8fafc',
                      color: date === item.val ? 'var(--crimson-500)' : '#64748b',
                      cursor: 'pointer', fontFamily: "'Sarabun',sans-serif",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  เวลาเริ่มรอบ *
                </label>
              </div>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1px solid #cbd5e1', background: '#f8fafc',
                  color: '#0f172a', fontSize: 13.5, fontFamily: "'Sarabun',sans-serif",
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {/* Quick Time Chips */}
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {QUICK_TIMES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTime(t)}
                    style={{
                      padding: '2px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
                      border: time === t ? '1px solid #2563eb' : '1px solid #e2e8f0',
                      background: time === t ? 'rgba(37,99,235,0.08)' : '#f8fafc',
                      color: time === t ? '#2563eb' : '#64748b',
                      cursor: 'pointer', fontFamily: "'Sarabun',sans-serif",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Game / Event Name */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                ชื่อเกม / รายละเอียดการบล็อก
              </label>
              {/* Mode Toggle */}
              <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 2, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setGameMode('select')}
                  style={{
                    padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: 'pointer', fontFamily: "'Sarabun',sans-serif",
                    background: gameMode === 'select' ? 'var(--crimson-500)' : 'transparent',
                    color: gameMode === 'select' ? '#fff' : '#64748b',
                  }}
                >
                  <i className="fas fa-dice" style={{ marginRight: 4 }} /> เลือกเกมในร้าน ({allGames.length})
                </button>
                <button
                  type="button"
                  onClick={() => setGameMode('custom')}
                  style={{
                    padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: 'pointer', fontFamily: "'Sarabun',sans-serif",
                    background: gameMode === 'custom' ? 'var(--crimson-500)' : 'transparent',
                    color: gameMode === 'custom' ? '#fff' : '#64748b',
                  }}
                >
                  <i className="fas fa-pen" style={{ marginRight: 4 }} /> ระบุชื่อเอง / งานส่วนตัว
                </button>
              </div>
            </div>

            {gameMode === 'select' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allGames.length > 8 && (
                  <input
                    type="text"
                    placeholder="พิมพ์ค้นหาชื่อเกมในคลัง..."
                    value={gameSearch}
                    onChange={e => setGameSearch(e.target.value)}
                    style={{
                      width: '100%', padding: '7px 12px', borderRadius: 8,
                      border: '1px solid #cbd5e1', background: '#f8fafc',
                      color: '#0f172a', fontSize: 12.5, fontFamily: "'Sarabun',sans-serif",
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                )}
                <select
                  value={selectedGameId}
                  onChange={e => setSelectedGameId(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 10,
                    border: '1px solid #cbd5e1', background: '#f8fafc',
                    color: '#0f172a', fontSize: 13.5, fontFamily: "'Sarabun',sans-serif",
                    outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
                  }}
                >
                  <option value="">-- เลือกเกมจากคลัง --</option>
                  {filteredGames.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.title || g.name} {g.players ? `(${g.players} คน)` : ''}
                    </option>
                  ))}
                </select>

                {/* Selected Game Preview */}
                {selectedGame && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                    borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0',
                  }}>
                    {(selectedGame.image || selectedGame.coverUrl) && (
                      <img
                        src={selectedGame.image || selectedGame.coverUrl}
                        alt=""
                        style={{ width: 36, height: 48, objectFit: 'cover', borderRadius: 4 }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedGame.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {selectedGame.players ? `${selectedGame.players} คน` : ''} · {selectedGame.difficulty || 'ปกติ'} · ฿{selectedGame.price || selectedGame.fullPrice || 0}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="text"
                  placeholder="เช่น งานส่วนตัว, ปิดห้องจัดเลี้ยง, Walk-in หน้าร้าน..."
                  value={customGameName}
                  onChange={e => setCustomGameName(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 10,
                    border: '1px solid #cbd5e1', background: '#f8fafc',
                    color: '#0f172a', fontSize: 13.5, fontFamily: "'Sarabun',sans-serif",
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                {/* Quick preset chips */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {QUICK_PRESETS.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustomGameName(preset)}
                      style={{
                        padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: '1px solid #e2e8f0', background: '#f8fafc',
                        color: '#475569', cursor: 'pointer', fontFamily: "'Sarabun',sans-serif",
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Row 3: Room Selection */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                ห้องที่ต้องการบล็อก *
              </label>
              {room && (
                <span style={{ fontSize: 11, fontWeight: 800, color: ROOM_COLORS_ADM[room] || 'var(--crimson-500)' }}>
                  เลือก: {room}
                </span>
              )}
            </div>

            {/* Room Grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 8, maxHeight: 180, overflowY: 'auto', padding: '2px',
            }}>
              {ALL_ROOMS_ADMIN.map(r => {
                const rc = ROOM_COLORS_ADM[r] || '#888'
                const sel = room === r
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoom(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                      border: sel ? `1.5px solid ${rc}` : '1px solid #e2e8f0',
                      background: sel ? rc + '18' : '#f8fafc',
                      color: sel ? rc : '#1e293b',
                      cursor: 'pointer', transition: 'all 0.12s', fontFamily: "'Sarabun',sans-serif",
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: rc, flexShrink: 0 }} />
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r}
                    </span>
                    {sel && <i className="fas fa-check" style={{ fontSize: 10, color: rc }} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Row 4: Note */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              หมายเหตุเพิ่มเติม (Admin Note)
            </label>
            <textarea
              rows={2}
              placeholder="เช่น ผู้ติดต่อ, เบอร์โทร, เหตุผลการบล็อกห้อง หรือข้อความถึงทีมงาน..."
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 10,
                border: '1px solid #cbd5e1', background: '#f8fafc',
                color: '#0f172a', fontSize: 13, fontFamily: "'Sarabun',sans-serif",
                outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>

        </div>

        {/* Modal Actions */}
        <div style={{
          padding: '16px 22px', borderTop: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              border: '1px solid #cbd5e1', background: '#ffffff',
              color: '#475569', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: "'Sarabun',sans-serif",
            }}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !date || !room}
            style={{
              flex: 2, padding: '12px', borderRadius: 10, border: 'none',
              background: date && room ? 'var(--crimson-500)' : '#e2e8f0',
              color: date && room ? '#fff' : '#94a3b8',
              cursor: saving || !date || !room ? 'default' : 'pointer',
              fontSize: 13.5, fontWeight: 800, fontFamily: "'Sarabun',sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s',
              boxShadow: date && room ? '0 4px 16px rgba(198,36,25,0.25)' : 'none',
            }}
          >
            {saving ? (
              <>
                <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <i className="fas fa-lock" /> ยืนยันและบล็อกห้อง (สถานะยืนยันแล้ว)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditBookingModal({ booking, onClose, showToast }) {
  const [status, setStatus]       = useState(booking.status || 'pending')
  const [room, setRoom]           = useState(booking.room || '')
  const [date, setDate]           = useState(booking.date || '')
  const [time, setTime]           = useState(booking.time || '')
  const [adminNote, setAdminNote] = useState(booking.adminNote || '')
  const [deposit, setDeposit]     = useState(String(booking.depositAmount ?? ''))
  const [maxMembers, setMaxMembers] = useState(String(booking.maxMembers ?? ''))
  const [deadline, setDeadline]   = useState(
    booking.depositDeadline ? booking.depositDeadline.slice(0, 16) : ''
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        status,
        room,
        date,
        time,
        adminNote,
        depositAmount: parseFloat(deposit) || 0,
        maxMembers: parseInt(maxMembers) || 0,
        depositDeadline: deadline ? new Date(deadline).toISOString() : booking.depositDeadline || '',
        updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'bookings', booking.id), payload)
      showToast('บันทึกการแก้ไขสำเร็จ')
      onClose()
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    } finally { setSaving(false) }
  }

  const STATUSES = ['pending','confirmed','locked','collapsed','cancelled']

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', zIndex:9900, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--surface-elevated, #ffffff)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:520, maxHeight:'92vh', overflowY:'auto', border:'1px solid var(--border-default)', borderBottom:'none', boxShadow:'0 -8px 48px rgba(0,0,0,0.45)', fontFamily:"'Sarabun',sans-serif", animation:'slideUp 0.28s cubic-bezier(0.22,1,0.36,1)' }}>
        <div style={{ display:'flex', justifyContent:'center', paddingTop:14, paddingBottom:4 }}>
          <div style={{ width:40, height:4, borderRadius:2, background:'var(--border-strong)' }} />
        </div>
        <div style={{ padding:'12px 20px 0', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'var(--text-primary)' }}>แก้ไขการจอง</div>
            <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:2 }}>{booking.gameName || booking.mockNote || '-'}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:17, color:'var(--text-tertiary)', padding:6 }}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div style={{ padding:'0 20px 32px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* Status */}
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.07em' }}>สถานะ</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {STATUSES.map(s => {
                const col = STATUS_COLORS_B[s] || '#888' /* ds-allow-hardcode: status data-viz */
                const sel = status === s
                return (
                  <button key={s} onClick={() => setStatus(s)}
                    style={{ padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:700, border: sel ? `1.5px solid ${col}` : '1px solid var(--border-default)', background: sel ? col + '22' : 'var(--surface-page)', color: sel ? col : 'var(--text-secondary)', cursor:'pointer', fontFamily:"'Sarabun',sans-serif" }}>
                    {STATUS_LABELS_B[s] || s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Room */}
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.07em' }}>ห้อง</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {ALL_ROOMS_ADMIN.map(r => {
                const rc = ROOM_COLORS_ADM[r] || '#888' /* ds-allow-hardcode: room data-viz */
                const sel = room === r
                return (
                  <button key={r} onClick={() => setRoom(r)}
                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:20, fontSize:11, fontWeight:700, border: sel ? `1.5px solid ${rc}` : '1px solid var(--border-default)', background: sel ? rc + '22' : 'var(--surface-page)', color: sel ? rc : 'var(--text-secondary)', cursor:'pointer', fontFamily:"'Sarabun',sans-serif" }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:rc, flexShrink:0 }} />
                    {r}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date + Time */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.07em' }}>วันที่เล่น</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--surface-page)', color:'var(--text-primary)', fontSize:14, fontFamily:"'Sarabun',sans-serif", outline:'none', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.07em' }}>เวลาเริ่ม</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--surface-page)', color:'var(--text-primary)', fontSize:14, fontFamily:"'Sarabun',sans-serif", outline:'none', boxSizing:'border-box' }} />
            </div>
          </div>

          {/* Deposit amount + Max members */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.07em' }}>มัดจำ/คน (฿)</label>
              <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)} min="0"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--surface-page)', color:'var(--text-primary)', fontSize:14, fontFamily:"'Sarabun',sans-serif", outline:'none', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.07em' }}>จำนวนสมาชิก</label>
              <input type="number" value={maxMembers} onChange={e => setMaxMembers(e.target.value)} min="1"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--surface-page)', color:'var(--text-primary)', fontSize:14, fontFamily:"'Sarabun',sans-serif", outline:'none', boxSizing:'border-box' }} />
            </div>
          </div>

          {/* Deposit deadline */}
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.07em' }}>กำหนดจ่ายมัดจำ</label>
            <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--surface-page)', color:'var(--text-primary)', fontSize:14, fontFamily:"'Sarabun',sans-serif", outline:'none', boxSizing:'border-box' }} />
          </div>

          {/* Admin note */}
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-tertiary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.07em' }}>หมายเหตุถึงสมาชิก</label>
            <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3}
              placeholder="เช่น นัดเวลา 18:00 น."
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--surface-page)', color:'var(--text-primary)', fontSize:13, fontFamily:"'Sarabun',sans-serif", outline:'none', resize:'vertical', boxSizing:'border-box' }} />
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose}
              style={{ flex:1, padding:'13px', borderRadius:10, border:'1px solid var(--border-default)', background:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Sarabun',sans-serif" }}>
              ยกเลิก
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ flex:2, padding:'13px', borderRadius:10, border:'none', background:'var(--crimson-500)', color:'#fff', cursor:saving ? 'default' : 'pointer', fontSize:14, fontWeight:800, fontFamily:"'Sarabun',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:saving ? 0.7 : 1 }}>
              {saving
                ? <><div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />กำลังบันทึก...</>
                : <><i className="fas fa-save" />บันทึกการแก้ไข</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const BOOKING_ROOMS = [
  'Waiting Area 1','Waiting Area 2','404 Bar','Japanese Room',
  'Chinese Room','Europe Room','Ghost Room','Projector Room',
  '5 Floor','Yang','Chinese DM','Thai DM',
]
const ROOM_COLORS_ADM = {
  'Waiting Area 1':'#94a3b8','Waiting Area 2':'#64748b','404 Bar':'#f59e0b',
  'Japanese Room':'#ef4444','Chinese Room':'#f97316','Europe Room':'#3b82f6',
  'Ghost Room':'#8b5cf6','Projector Room':'#06b6d4','5 Floor':'#22c55e',
  'Yang':'#ec4899','Chinese DM':'#c62419','Thai DM':'#d97706',
}

function RoomGrid({ bookings, onSelectBooking }) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
  const DAY_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']

  const occupied = {}
  bookings.forEach(b => {
    if (b.status === 'cancelled') return
    if (b.room && b.date) {
      if (!occupied[b.date]) occupied[b.date] = {}
      occupied[b.date][b.room] = b
    }
  })

  // Grid dimensions: room-name column 120px + 14 day columns 36px each
  const GRID_COLS = '120px repeat(14, 36px)'
  const CELL_H = 28

  return (
    <div style={{ marginBottom: 32, background: 'var(--surface-card)', borderRadius: 14, border: '1px solid var(--border-default)', overflow: 'hidden' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px 10px', borderBottom: '1px solid var(--border-default)', marginBottom: 0 }}>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: 'var(--crimson-500)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.10em', textTransform: 'uppercase', fontVariant: 'small-caps' }}>
          ห้องว่าง &middot; 14 วันข้างหน้า
        </span>
      </div>

      {/* Scrollable grid wrapper with right-edge fade */}
      <div style={{ position: 'relative' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
          <div style={{ minWidth: 120 + 36 * 14 + 36, padding: '0 18px 14px' }}>

            {/* Day headers row — CSS grid */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: '0 2px', paddingTop: 12, marginBottom: 5 }}>
              {/* Empty room-name column spacer */}
              <div />
              {days.map(d => {
                const dt = new Date(d + 'T00:00:00')
                const isToday = d === todayStr
                return (
                  <div key={d} style={{
                    textAlign: 'center',
                    borderLeft: isToday ? '2px solid var(--crimson-500)' : '2px solid transparent',
                    paddingTop: 2,
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: isToday ? 'var(--crimson-500)' : 'var(--text-tertiary)', letterSpacing: '0.02em', lineHeight: 1.2 }}>
                      {DAY_TH[dt.getDay()]}
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 800, lineHeight: 1,
                      color: isToday ? 'var(--crimson-500)' : 'var(--text-secondary)',
                      background: isToday ? 'rgba(198,36,25,0.12)' : 'transparent',
                      borderRadius: 5, padding: '3px 2px',
                    }}>
                      {dt.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Room rows — CSS grid */}
            {BOOKING_ROOMS.map(room => {
              const roomColor = ROOM_COLORS_ADM[room] || '#888' /* ds-allow-hardcode: room data-viz */
              return (
                <div key={room} style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: '0 2px', marginBottom: 3, alignItems: 'center' }}>
                  {/* Room label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingRight: 8, minWidth: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: roomColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {room}
                    </span>
                  </div>
                  {/* Day cells */}
                  {days.map(d => {
                    const b = occupied[d]?.[room]
                    const isToday = d === todayStr
                    const isMockOccupied = b?.isMock
                    const statusColor = b
                      ? (isMockOccupied ? (STATUS_COLORS_B[b.status] || '#f59e0b') : (STATUS_COLORS_B[b.status] || '#888'))
                      : null
                    return (
                      <div
                        key={d}
                        onClick={() => b && onSelectBooking && onSelectBooking(b)}
                        title={b ? `${b.isMock ? `[Mock Block] ${b.gameName || 'บล็อกห้อง'}` : (b.gameName || '-')} ${b.time ? `(${b.time})` : ''} · ${STATUS_LABELS_B[b.status] || b.status}` : 'ว่าง'}
                        style={{
                          height: CELL_H, borderRadius: 6,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: statusColor
                            ? (isMockOccupied ? 'rgba(245,158,11,0.22)' : roomColor + '40')
                            : isToday ? 'rgba(198,36,25,0.05)' : 'var(--surface-card)',
                          border: `1px solid ${statusColor
                            ? (isMockOccupied ? '#f59e0b' : roomColor + '66')
                            : isToday ? 'rgba(198,36,25,0.22)' : 'var(--border-default)'}`,
                          borderLeft: isToday ? '2px solid var(--crimson-500)' : undefined,
                          cursor: b ? 'pointer' : 'default',
                          transition: 'opacity 0.12s, transform 0.1s',
                        }}>
                        {isMockOccupied && (
                          <i className="fas fa-lock" style={{ fontSize: 7, color: '#f59e0b' }} />
                        )}
                        {b && !isMockOccupied && (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: roomColor, flexShrink: 0 }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        {/* Right-edge fade overlay */}
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 32, background: 'linear-gradient(to right, transparent, var(--surface-card))', pointerEvents: 'none' }} />
      </div>

      {/* Legend row */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 18px 14px', flexWrap: 'wrap', borderTop: '1px solid var(--border-default)' }}>
        {Object.entries(STATUS_LABELS_B).map(([k, v]) => (
          <span key={k} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)', background: 'var(--surface-page)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '2px 9px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_COLORS_B[k] || '#888', flexShrink: 0 }} /> {/* ds-allow-hardcode */}
            {v}
          </span>
        ))}
        <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)', background: 'var(--surface-page)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '2px 9px' }}>
          <i className="fas fa-lock" style={{ fontSize: 9 }} /> Mock Block
        </span>
      </div>
    </div>
  )
}

function BookingsTab({ showToast, adminUser, allGames = [] }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [confirmModal, setConfirmModal] = useState(null)
  const [editModal, setEditModal]       = useState(null)
  const [mockModal, setMockModal]       = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('ลบการจองนี้ถาวรหรือไม่?')) return
    try {
      await deleteDoc(doc(db, 'bookings', id))
      showToast('ลบการจองสำเร็จ')
    } catch (e) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  const handleVerifySlip = async (bookingId, memberUid) => {
    try {
      const ref = doc(db, 'bookings', bookingId)
      const snap = await getDoc(ref)
      if (!snap.exists()) { showToast('ไม่พบการจอง', 'error'); return }
      const data = snap.data()
      const updatedMembers = data.members.map(m =>
        m.uid === memberUid
          ? { ...m, paidDeposit: true, paidAt: new Date().toISOString(), slipStatus: 'verified' }
          : m
      )
      const allPaid = updatedMembers.every(m => m.paidDeposit)
      const isFull = updatedMembers.length >= (data.maxMembers || 1)
      // Extend deadline by +3 days from max(current, now)
      const baseMs = Math.max(new Date(data.depositDeadline || 0).getTime(), Date.now())
      const newDeadline = new Date(baseMs + 3 * 86400000).toISOString()
      const payload = {
        members: updatedMembers,
        depositDeadline: newDeadline,
        updatedAt: serverTimestamp(),
      }
      if (allPaid && isFull && data.status === 'confirmed') payload.status = 'locked'
      await updateDoc(ref, payload)
      showToast(allPaid && isFull ? 'ครบแล้ว — ล็อกห้องอัตโนมัติ' : 'ยืนยันสลิปสำเร็จ · ขยายเดดไลน์ +3 วัน')
    } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'error') }
  }

  const handleRejectSlip = async (bookingId, memberUid) => {
    if (!window.confirm('ปฏิเสธสลิปนี้ใช่ไหม? สมาชิกจะต้องส่งสลิปใหม่')) return
    try {
      const ref = doc(db, 'bookings', bookingId)
      const snap = await getDoc(ref)
      if (!snap.exists()) { showToast('ไม่พบการจอง', 'error'); return }
      const updatedMembers = snap.data().members.map(m =>
        m.uid === memberUid ? { ...m, slipStatus: 'rejected', slipUrl: '' } : m
      )
      await updateDoc(ref, { members: updatedMembers, updatedAt: serverTimestamp() })
      showToast('ปฏิเสธสลิปแล้ว')
    } catch (e) { showToast('เกิดข้อผิดพลาด: ' + e.message, 'error') }
  }

  const pendingCount = bookings.filter(b => b.status === 'pending').length
  const STATUS_FILTERS = ['all', 'pending', 'confirmed', 'locked', 'collapsed', 'cancelled']
  const STATUS_FILTER_LABELS = { all: 'ทั้งหมด', ...STATUS_LABELS_B }

  const filtered = statusFilter === 'all'
    ? bookings
    : bookings.filter(b => b.status === statusFilter)

  if (loading) return <div className="adm-loading"><div className="spinner" /></div>

  const pendingBookings = bookings.filter(b => b.status === 'pending')

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pendingPulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>

      {/* Room availability grid */}
      <RoomGrid bookings={bookings} onSelectBooking={setEditModal} />

      {/* ── Pending urgency section ── */}
      {pendingBookings.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          {/* Section label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 3, height: 18, borderRadius: 2, background: '#f59e0b', flexShrink: 0 }} /> {/* ds-allow-hardcode: status data-viz */}
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.09em', textTransform: 'uppercase' }}> {/* ds-allow-hardcode */}
              รอยืนยัน
            </span>
            {/* Pulsing amber dot */}
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: '#f59e0b', /* ds-allow-hardcode: status data-viz */
              animation: 'pendingPulse 1.2s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 11, fontWeight: 800, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 20, padding: '1px 8px' }}> {/* ds-allow-hardcode */}
              {pendingBookings.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingBookings.map(b => {
              const totalMembers = b.members?.length || 0
              const paidCount = b.members?.filter(m => m.paidDeposit).length || 0
              const pendingSlips = (b.members || []).filter(m => m.slipStatus === 'pending_verification' && !m.paidDeposit)
              return (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'stretch', borderRadius: 12, overflow: 'hidden',
                  background: 'var(--surface-elevated)', border: pendingSlips.length > 0 ? '1px solid rgba(6,199,85,0.35)' : '1px solid rgba(245,158,11,0.28)',
                  boxShadow: pendingSlips.length > 0 ? '0 2px 14px rgba(6,199,85,0.1)' : '0 2px 14px rgba(245,158,11,0.09)',
                }}>
                  {/* Amber left border strip */}
                  <div style={{ width: 4, background: '#f59e0b', flexShrink: 0 }} /> {/* ds-allow-hardcode */}
                  <div style={{ flex: 1, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                          {b.gameName || '-'}
                        </span>
                        <BookingStatusBadge status={b.status} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: 10, rowGap: 4, marginBottom: 6 }}>
                        <span><i className="fas fa-calendar" style={{ marginRight: 4, opacity: 0.55 }} />{b.date}</span>
                        {b.time && <span><i className="fas fa-clock" style={{ marginRight: 4, opacity: 0.55 }} />{b.time}</span>}
                        {b.room && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surface-page)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '0 8px', fontWeight: 700, fontSize: 11 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ROOM_COLORS_ADM[b.room] || 'var(--text-tertiary)' }} /> {/* ds-allow-hardcode: room data-viz */}
                            {b.room}
                          </span>
                        )}
                        <span><i className="fas fa-user" style={{ marginRight: 4, opacity: 0.55 }} />{b.leaderName || '-'}</span>
                      </div>
                      {/* Member progress bar */}
                      {totalMembers > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{paidCount}/{totalMembers} จ่ายแล้ว</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 4, background: 'var(--surface-page)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 4, background: '#3b82f6', width: `${(paidCount / totalMembers) * 100}%`, transition: 'width 0.3s' }} /> {/* ds-allow-hardcode: status data-viz */}
                          </div>
                        </div>
                      )}
                      {b.adminNote && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5 }}>
                          <i className="fas fa-comment-alt" style={{ fontSize: 9, marginTop: 2, opacity: 0.6 }} />
                          {b.adminNote}
                        </div>
                      )}
                      {/* Slip review section */}
                      {pendingSlips.length > 0 && (
                        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-default)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#06c755', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}> {/* ds-allow-hardcode: paid-green */}
                            <i className="fas fa-receipt" style={{ marginRight: 5 }} />สลิปรอยืนยัน
                          </div>
                          {pendingSlips.map(m => (
                            <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <a href={m.slipUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                                <img src={m.slipUrl} alt="slip" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-default)', display: 'block' }} />
                              </a>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {m.name || m.uid}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button
                                    onClick={() => handleVerifySlip(b.id, m.uid)}
                                    style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#06c755', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Sarabun',sans-serif" }}> {/* ds-allow-hardcode: paid-green */}
                                    <i className="fas fa-check" style={{ marginRight: 4 }} />ยืนยัน
                                  </button>
                                  <button
                                    onClick={() => handleRejectSlip(b.id, m.uid)}
                                    style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(198,36,25,0.35)', background: 'transparent', color: 'var(--crimson-500)', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Sarabun',sans-serif" }}>
                                    <i className="fas fa-times" style={{ marginRight: 4 }} />ปฏิเสธ
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start' }}>
                      <button
                        onClick={() => setConfirmModal(b)}
                        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: "'Sarabun',sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}> {/* ds-allow-hardcode: action blue */}
                        <i className="fas fa-check" /> ยืนยัน
                      </button>
                      <button
                        onClick={() => setEditModal(b)}
                        style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, transition: 'border-color 0.14s, color 0.14s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                        <i className="fas fa-pencil-alt" />
                      </button>
                      <button
                        onClick={() => handleDelete(b.id)}
                        style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, transition: 'border-color 0.14s, color 0.14s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--crimson-500)'; e.currentTarget.style.color = 'var(--crimson-500)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                        <i className="fas fa-trash" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Divider: History section ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.10em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          ประวัติทั้งหมด
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
      </div>

      {/* ── Full list header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
          {filtered.length} รายการ
        </span>
        {/* Mock Block — prominent amber utility button */}
        <button
          onClick={() => setMockModal(true)}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: '#f59e0b', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'Sarabun',sans-serif", display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.08)' }}>
          <i className="fas fa-lock" /> + Mock Block (ล็อกห้อง)
        </button>
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {STATUS_FILTERS.map(s => {
          const active = statusFilter === s
          const col = s === 'all' ? 'var(--crimson-500)' : STATUS_COLORS_B[s] || 'var(--crimson-500)' /* ds-allow-hardcode */
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '5px 13px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                border: active ? `1.5px solid ${col}` : '1px solid var(--border-default)',
                background: active ? (s === 'all' ? 'rgba(198,36,25,0.10)' : col + '1a') : 'var(--surface-page)',
                color: active ? col : 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.14s', fontFamily: "'Sarabun',sans-serif",
              }}>
              {STATUS_FILTER_LABELS[s]}
            </button>
          )
        })}
      </div>

      {/* All booking cards */}
      {filtered.length === 0 ? (
        <div className="adm-empty">ไม่มีการจองในสถานะนี้</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(b => {
            const paidCount = b.members?.filter(m => m.paidDeposit).length || 0
            const totalMembers = b.members?.length || 0
            const statusColor = STATUS_COLORS_B[b.status] || (b.isMock ? '#f59e0b' : '#888') /* ds-allow-hardcode: status data-viz */
            const pendingSlips = (b.members || []).filter(m => m.slipStatus === 'pending_verification' && !m.paidDeposit)
            return (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'stretch', borderRadius: 12, overflow: 'hidden',
                background: 'var(--surface-card)', border: '1px solid var(--border-default)',
              }}>
                {/* 4px colored left strip — flex child, full height */}
                <div style={{ width: 4, background: statusColor, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: '13px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Game name + status badge on same row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {b.isMock && <i className="fas fa-lock" style={{ fontSize: 11, color: '#f59e0b' }} title="Mock Block" />}
                        {b.gameName || (b.isMock ? 'Mock Block' : '-')}
                      </span>
                      <BookingStatusBadge status={b.status} />
                      {b.isMock && (
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: 'rgba(245,158,11,0.14)', color: '#f59e0b', fontWeight: 800, border: '1px solid rgba(245,158,11,0.3)' }}>
                          MOCK BLOCK
                        </span>
                      )}
                    </div>
                    {/* Date, room chip, leader name in a wrapping flex row */}
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: 10, rowGap: 4, marginBottom: 5, alignItems: 'center' }}>
                      <span><i className="fas fa-calendar" style={{ marginRight: 4, opacity: 0.55 }} />{b.date}</span>
                      {b.time && <span><i className="fas fa-clock" style={{ marginRight: 4, opacity: 0.55 }} />{b.time}</span>}
                      {b.room && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surface-page)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1px 8px', fontWeight: 700, fontSize: 11 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ROOM_COLORS_ADM[b.room] || 'var(--text-tertiary)' }} /> {/* ds-allow-hardcode: room data-viz */}
                          {b.room}
                        </span>
                      )}
                      <span><i className="fas fa-user" style={{ marginRight: 4, opacity: 0.55 }} />{b.leaderName || '-'}</span>
                    </div>
                    {/* Member progress bar — 5px tall, full-width, counts above */}
                    {!b.isMock && totalMembers > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{paidCount}/{totalMembers} จ่าย</span>
                          {/* Deadline countdown pill — amber, confirmed only */}
                          {b.depositDeadline && b.status === 'confirmed' && (() => {
                            const diff = new Date(b.depositDeadline) - new Date()
                            if (diff <= 0) return (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: '1px 8px' }}>หมดเวลา</span> /* ds-allow-hardcode */
                            )
                            const dv = Math.floor(diff / 86400000)
                            const hv = Math.floor((diff % 86400000) / 3600000)
                            return (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '1px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}> {/* ds-allow-hardcode */}
                                <i className="fas fa-clock" style={{ fontSize: 8 }} />
                                {dv > 0 ? `${dv}ว ${hv}ชม.` : `${hv}ชม.`}
                              </span>
                            )
                          })()}
                        </div>
                        <div style={{ height: 5, borderRadius: 4, background: 'var(--surface-page)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 4, background: '#3b82f6', width: `${(paidCount / totalMembers) * 100}%`, transition: 'width 0.3s' }} /> {/* ds-allow-hardcode: status data-viz */}
                        </div>
                      </div>
                    )}
                    {/* Admin note — italic, 11px, muted, comment icon */}
                    {b.adminNote && (
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5 }}>
                        <i className="fas fa-comment-alt" style={{ fontSize: 9, marginTop: 2, opacity: 0.6 }} />
                        {b.adminNote}
                      </div>
                    )}
                    {/* Slip review section */}
                    {pendingSlips.length > 0 && (
                      <div style={{ marginTop: 10, borderTop: '1px solid var(--border-default)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#06c755', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}> {/* ds-allow-hardcode: paid-green */}
                          <i className="fas fa-receipt" style={{ marginRight: 5 }} />สลิปรอยืนยัน
                        </div>
                        {pendingSlips.map(m => (
                          <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <a href={m.slipUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                              <img src={m.slipUrl} alt="slip" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-default)', display: 'block' }} />
                            </a>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.name || m.uid}
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => handleVerifySlip(b.id, m.uid)}
                                  style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#06c755', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Sarabun',sans-serif" }}> {/* ds-allow-hardcode: paid-green */}
                                  <i className="fas fa-check" style={{ marginRight: 4 }} />ยืนยัน
                                </button>
                                <button
                                  onClick={() => handleRejectSlip(b.id, m.uid)}
                                  style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(198,36,25,0.35)', background: 'transparent', color: 'var(--crimson-500)', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Sarabun',sans-serif" }}>
                                  <i className="fas fa-times" style={{ marginRight: 4 }} />ปฏิเสธ
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action buttons flush right */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start' }}>
                    {/* Confirm button — blue, compact, only for pending */}
                    {b.status === 'pending' && (
                      <button
                        onClick={() => setConfirmModal(b)}
                        style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: "'Sarabun',sans-serif", display: 'flex', alignItems: 'center', gap: 5 }}> {/* ds-allow-hardcode: action blue */}
                        <i className="fas fa-check" /> ยืนยัน
                      </button>
                    )}
                    {/* Edit — pencil icon */}
                    <button
                      onClick={() => setEditModal(b)}
                      title="แก้ไข"
                      style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, transition: 'border-color 0.14s, color 0.14s, background 0.14s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--surface-page)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent' }}>
                      <i className="fas fa-pencil-alt" />
                    </button>
                    {/* Delete — ghost red icon button, always visible */}
                    <button
                      onClick={() => handleDelete(b.id)}
                      title="ลบ"
                      style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, transition: 'border-color 0.14s, color 0.14s, background 0.14s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(198,36,25,0.35)'; e.currentTarget.style.color = 'var(--crimson-500)'; e.currentTarget.style.background = 'rgba(198,36,25,0.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent' }}>
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {confirmModal && (
        <ConfirmBookingModal
          booking={confirmModal}
          adminUser={adminUser}
          onClose={() => setConfirmModal(null)}
          showToast={showToast}
        />
      )}

      {editModal && (
        <EditBookingModal
          booking={editModal}
          onClose={() => setEditModal(null)}
          showToast={showToast}
        />
      )}

      {mockModal && (
        <MockBookingModal
          adminUser={adminUser}
          onClose={() => setMockModal(false)}
          showToast={showToast}
          allGames={allGames}
        />
      )}
    </div>
  )
}

function EvaluationsTab({ showToast, allGames = [] }) {
  const [evaluations, setEvaluations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedGame, setSelectedGame] = useState('ALL')
  const [selectedDm, setSelectedDm] = useState('ALL')
  const [ratingFilter, setRatingFilter] = useState('ALL')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'evaluations'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setEvaluations(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => {
      console.warn('evaluations orderBy query error, falling back:', err)
      const fallbackUnsub = onSnapshot(collection(db, 'evaluations'), snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0)
          const tb = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0)
          return tb - ta
        })
        setEvaluations(list)
        setLoading(false)
      })
      return fallbackUnsub
    })
    return unsub
  }, [])

  const handleDelete = async (evalItem) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบแบบประเมินของ "${evalItem.userName || 'ลูกค้า'}"?`)) return
    setDeletingId(evalItem.id)
    try {
      await deleteDoc(doc(db, 'evaluations', evalItem.id))
      showToast('ลบแบบประเมินสำเร็จ')
    } catch (err) {
      console.error('Delete evaluation error:', err)
      showToast('ลบไม่สำเร็จ: ' + err.message, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // Summary Metrics
  const totalCount = evaluations.length
  const avgGameRating = totalCount > 0
    ? (evaluations.reduce((s, e) => s + (Number(e.gameRating) || 0), 0) / totalCount).toFixed(1)
    : '0.0'
  const avgDmRating = totalCount > 0
    ? (evaluations.reduce((s, e) => s + (Number(e.dmRating) || 0), 0) / totalCount).toFixed(1)
    : '0.0'
  const withFeedbackCount = evaluations.filter(e => e.feedback && e.feedback.trim()).length

  // Unique Games & DMs for filter
  const gameOptions = Array.from(new Set(evaluations.map(e => e.scriptTitle).filter(Boolean))).sort()
  const dmOptions = Array.from(new Set(evaluations.map(e => e.dm).filter(Boolean))).sort()

  // DM Performance breakdown
  const dmStats = useMemo(() => {
    const map = {}
    evaluations.forEach(e => {
      const dm = e.dm || 'ไม่ระบุ DM'
      if (!map[dm]) map[dm] = { dm, count: 0, sumDm: 0, sumGame: 0 }
      map[dm].count++
      map[dm].sumDm += Number(e.dmRating) || 0
      map[dm].sumGame += Number(e.gameRating) || 0
    })
    return Object.values(map)
      .map(d => ({
        ...d,
        avgDm: (d.sumDm / d.count).toFixed(1),
        avgGame: (d.sumGame / d.count).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count)
  }, [evaluations])

  // Filtered evaluations
  const filtered = evaluations.filter(e => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchName = (e.userName || '').toLowerCase().includes(q)
      const matchGame = (e.scriptTitle || '').toLowerCase().includes(q)
      const matchDm = (e.dm || '').toLowerCase().includes(q)
      const matchFeedback = (e.feedback || '').toLowerCase().includes(q)
      const matchRoom = (e.room || '').toLowerCase().includes(q)
      if (!matchName && !matchGame && !matchDm && !matchFeedback && !matchRoom) return false
    }
    if (selectedGame !== 'ALL' && e.scriptTitle !== selectedGame) return false
    if (selectedDm !== 'ALL' && e.dm !== selectedDm) return false
    if (ratingFilter === '5' && (e.gameRating !== 5 && e.dmRating !== 5)) return false
    if (ratingFilter === '4+' && (e.gameRating < 4 || e.dmRating < 4)) return false
    if (ratingFilter === '3+' && (e.gameRating < 3 || e.dmRating < 3)) return false
    if (ratingFilter === 'low' && (e.gameRating >= 3 && e.dmRating >= 3)) return false

    return true
  })

  const renderStars = (score) => {
    const s = Math.round(Number(score) || 0)
    return (
      <span className="adm-eval-stars">
        {[1, 2, 3, 4, 5].map(i => (
          <i key={i} className={`fa-star ${i <= s ? 'fas active' : 'far'}`} />
        ))}
      </span>
    )
  }

  const formatEvalDate = (createdAt) => {
    if (!createdAt) return '—'
    const dt = createdAt.toDate ? createdAt.toDate() : (createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt))
    if (isNaN(dt.getTime())) return '—'
    return dt.toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  if (loading) return <div className="adm-loading"><div className="spinner" /></div>

  return (
    <div className="adm-eval-root">
      {/* ── Summary KPI Cards ── */}
      <div className="adm-eval-kpi-grid">
        <div className="adm-eval-kpi-card gold">
          <div className="adm-eval-kpi-icon"><i className="fas fa-star" /></div>
          <div className="adm-eval-kpi-info">
            <div className="adm-eval-kpi-label">คะแนนเกมเฉลี่ย</div>
            <div className="adm-eval-kpi-value">{avgGameRating} <span className="adm-eval-kpi-max">/ 5.0</span></div>
            <div className="adm-eval-kpi-sub">{renderStars(avgGameRating)} จาก {totalCount} รีวิว</div>
          </div>
        </div>

        <div className="adm-eval-kpi-card pink">
          <div className="adm-eval-kpi-icon"><i className="fas fa-crown" /></div>
          <div className="adm-eval-kpi-info">
            <div className="adm-eval-kpi-label">คะแนน DM เฉลี่ย</div>
            <div className="adm-eval-kpi-value">{avgDmRating} <span className="adm-eval-kpi-max">/ 5.0</span></div>
            <div className="adm-eval-kpi-sub">{renderStars(avgDmRating)} จาก {totalCount} รีวิว</div>
          </div>
        </div>

        <div className="adm-eval-kpi-card blue">
          <div className="adm-eval-kpi-icon"><i className="fas fa-clipboard-check" /></div>
          <div className="adm-eval-kpi-info">
            <div className="adm-eval-kpi-label">แบบประเมินทั้งหมด</div>
            <div className="adm-eval-kpi-value">{totalCount} <span className="adm-eval-kpi-max">รายการ</span></div>
            <div className="adm-eval-kpi-sub">จากผู้เล่นที่ชำระเงินแล้ว</div>
          </div>
        </div>

        <div className="adm-eval-kpi-card green">
          <div className="adm-eval-kpi-icon"><i className="fas fa-comments" /></div>
          <div className="adm-eval-kpi-info">
            <div className="adm-eval-kpi-label">มีข้อเสนอแนะ</div>
            <div className="adm-eval-kpi-value">{withFeedbackCount} <span className="adm-eval-kpi-max">ข้อความ</span></div>
            <div className="adm-eval-kpi-sub">{totalCount > 0 ? Math.round((withFeedbackCount / totalCount) * 100) : 0}% ของผู้ประเมิน</div>
          </div>
        </div>
      </div>

      {/* ── DM Performance Leaderboard ── */}
      {dmStats.length > 0 && (
        <div className="adm-card" style={{ marginBottom: 16 }}>
          <div className="adm-card-header">
            <div className="adm-card-title">
              <i className="fas fa-award" style={{ color: '#ec4899' }} /> คะแนนรายบุคคล DM
            </div>
          </div>
          <div className="adm-eval-dm-list">
            {dmStats.map(stat => (
              <button
                key={stat.dm}
                className={`adm-eval-dm-chip${selectedDm === stat.dm ? ' active' : ''}`}
                onClick={() => setSelectedDm(prev => prev === stat.dm ? 'ALL' : stat.dm)}
              >
                <span className="adm-eval-dm-name"><i className="fas fa-user-circle" /> {stat.dm}</span>
                <span className="adm-eval-dm-score">⭐ {stat.avgDm}</span>
                <span className="adm-eval-dm-count">({stat.count} รีวิว)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter and Search Bar ── */}
      <div className="adm-card">
        <div className="adm-card-header">
          <div className="adm-card-title">
            <i className="fas fa-list-alt" style={{ color: 'var(--crimson-500)' }} />
            รายการแบบประเมิน ({filtered.length})
          </div>
          {(selectedGame !== 'ALL' || selectedDm !== 'ALL' || ratingFilter !== 'ALL' || search) && (
            <button
              className="adm-btn-text"
              style={{ fontSize: 12, color: 'var(--crimson-500)', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 700 }}
              onClick={() => {
                setSearch('')
                setSelectedGame('ALL')
                setSelectedDm('ALL')
                setRatingFilter('ALL')
              }}
            >
              <i className="fas fa-undo" /> ล้างตัวกรอง
            </button>
          )}
        </div>

        <div className="adm-eval-filter-bar">
          <div className="adm-eval-search-wrap">
            <i className="fas fa-search adm-eval-search-icon" />
            <input
              type="text"
              className="adm-search"
              placeholder="ค้นหาชื่อลูกค้า, ข้อความข้อเสนอแนะ, เกม, DM..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 36, marginBottom: 0 }}
            />
            {search && (
              <button className="adm-search-clear-btn" onClick={() => setSearch('')}>
                <i className="fas fa-times" />
              </button>
            )}
          </div>

          <div className="adm-eval-selects">
            <select
              className="adm-eval-select"
              value={selectedGame}
              onChange={e => setSelectedGame(e.target.value)}
            >
              <option value="ALL">ทุกเกม</option>
              {gameOptions.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>

            <select
              className="adm-eval-select"
              value={selectedDm}
              onChange={e => setSelectedDm(e.target.value)}
            >
              <option value="ALL">ทุก DM</option>
              {dmOptions.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              className="adm-eval-select"
              value={ratingFilter}
              onChange={e => setRatingFilter(e.target.value)}
            >
              <option value="ALL">⭐ ทุกคะแนนดาว</option>
              <option value="5">⭐⭐⭐⭐⭐ 5 ดาว</option>
              <option value="4+">⭐ 4 ดาวขึ้นไป</option>
              <option value="3+">⭐ 3 ดาวขึ้นไป</option>
              <option value="low">น้อยกว่า 3 ดาว</option>
            </select>
          </div>
        </div>

        {/* ── Evaluation Cards List ── */}
        <div className="adm-eval-list">
          {filtered.length === 0 ? (
            <div className="adm-empty">
              <i className="fas fa-comment-slash" />
              <span>ไม่พบแบบประเมินตามเงื่อนไขที่เลือก</span>
            </div>
          ) : (
            filtered.map(item => (
              <div key={item.id} className="adm-eval-item-card">
                <div className="adm-eval-item-top">
                  <div className="adm-eval-user">
                    <div className="adm-eval-avatar">
                      {item.userAvatar ? (
                        <img src={item.userAvatar} alt="" onError={e => e.currentTarget.style.display = 'none'} />
                      ) : (
                        <span>{(item.userName || '?')[0]}</span>
                      )}
                    </div>
                    <div>
                      <div className="adm-eval-user-name">{item.userName || 'ไม่ระบุชื่อ'}</div>
                      <div className="adm-eval-date">
                        <i className="fas fa-clock" /> {formatEvalDate(item.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div className="adm-eval-tags">
                    {item.scriptTitle && (
                      <span className="adm-eval-tag game">
                        <i className="fas fa-scroll" /> {item.scriptTitle}
                      </span>
                    )}
                    {item.dm && (
                      <span className="adm-eval-tag dm">
                        <i className="fas fa-crown" /> {item.dm}
                      </span>
                    )}
                    {item.room && (
                      <span className="adm-eval-tag room">
                        <i className="fas fa-door-open" /> {item.room}
                      </span>
                    )}
                    <button
                      className="adm-eval-del-btn"
                      title="ลบแบบประเมิน"
                      disabled={deletingId === item.id}
                      onClick={() => handleDelete(item)}
                    >
                      <i className={`fas ${deletingId === item.id ? 'fa-spinner fa-spin' : 'fa-trash-alt'}`} />
                    </button>
                  </div>
                </div>

                <div className="adm-eval-scores-row">
                  <div className="adm-eval-score-block">
                    <span className="adm-eval-score-title">คะแนนเกม:</span>
                    <span className="adm-eval-score-val">
                      {renderStars(item.gameRating)}
                      <strong className="adm-eval-num">{item.gameRating}/5</strong>
                    </span>
                  </div>

                  <div className="adm-eval-score-block">
                    <span className="adm-eval-score-title">คะแนน DM:</span>
                    <span className="adm-eval-score-val">
                      {renderStars(item.dmRating)}
                      <strong className="adm-eval-num">{item.dmRating}/5</strong>
                    </span>
                  </div>
                </div>

                {item.feedback ? (
                  <div className="adm-eval-feedback-box">
                    <i className="fas fa-quote-left adm-eval-quote-icon" />
                    <p className="adm-eval-feedback-text">{item.feedback}</p>
                  </div>
                ) : (
                  <div className="adm-eval-feedback-empty">
                    <span>(ไม่มีข้อเสนอแนะเพิ่มเติม)</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

const NAV_SECTIONS = [
  {
    label: 'ภาพรวม',
    items: [
      { key: 'dashboard',   icon: 'fa-chart-pie', label: 'Dashboard' },
      { key: 'history',     icon: 'fa-history',   label: 'ประวัติ & บิลย้อนหลัง' },
      { key: 'evaluations', icon: 'fa-star',      label: 'แบบประเมิน' },
    ],
  },
  {
    label: 'จัดการข้อมูล',
    items: [
      { key: 'scripts',  icon: 'fa-scroll',    label: 'สคริปต์' },
      { key: 'members',  icon: 'fa-users',      label: 'สมาชิก' },
      { key: 'menu',     icon: 'fa-utensils',   label: 'เมนูอาหาร' },
    ],
  },
  {
    label: 'การจอง',
    items: [
      { key: 'bookings', icon: 'fa-calendar-check', label: 'จัดการการจอง' },
    ],
  },
  {
    label: 'กิจกรรม',
    items: [
      { key: 'random', icon: 'fa-dharmachakra', label: 'วงล้อสุ่ม' },
    ],
  },
  {
    label: 'ระบบ',
    items: [
      { key: 'payment',   icon: 'fa-mobile-alt',          label: 'การชำระเงิน' },
      { key: 'receipt',   icon: 'fa-file-invoice-dollar', label: 'แก้ไขบิล' },
      { key: 'promotion', icon: 'fa-bullhorn',             label: 'โปรโมชั่น' },
      { key: 'data',      icon: 'fa-exclamation-triangle', label: 'จัดการข้อมูล' },
    ],
  },
]
const ALL_TABS = NAV_SECTIONS.flatMap(s => s.items)

// ─── Main AdminPage ───────────────────────────────────────────────────────────
export default function AdminPage({ showToast, openModal, openEdit, allGames = [], allParties = [] }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [members, setMembers] = useState([])
  const [tab, setTab] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [historyInitialMember, setHistoryInitialMember] = useState(null)

  useEffect(() => onAuthStateChanged(auth, user => setIsAdmin(!!user)), [])

  useEffect(() => {
    if (!isAdmin) return
    return onSnapshot(collection(db, 'members'), snap => {
      setMembers(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    })
  }, [isAdmin])

  const handleLogin = async () => {
    if (!email || !password) { showToast('กรุณากรอกข้อมูล', 'error'); return }
    try {
      await signInWithEmailAndPassword(auth, email, password)
      showToast('เข้าสู่ระบบสำเร็จ')
    } catch { showToast('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'error') }
  }

  const handleLogout = async () => { await signOut(auth); showToast('ออกจากระบบแล้ว') }

  const activeTab = ALL_TABS.find(t => t.key === tab)

  const goTab = (key) => { setTab(key); setSidebarOpen(false) }

  return (
    <div id="admin-page" className="page active">
      {!isAdmin ? (
        <div className="admin-login">
          <div className="login-logo">So<span>Fun</span></div>
          <div className="login-sub">Admin Panel · ระบบจัดการ</div>
          <div className="login-card">
            <div className="form-group">
              <label className="form-label">อีเมล</label>
              <input className="form-input" type="email" placeholder="admin@sofun.com"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">รหัสผ่าน</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <button className="adm-btn-red" style={{ width: '100%', padding: '14px', fontSize: '15px', borderRadius: '12px', marginTop: '8px' }}
              onClick={handleLogin}>
              <i className="fas fa-sign-in-alt" /> เข้าสู่ระบบ
            </button>
          </div>
        </div>
      ) : (
        <div className="adm-layout">

          {/* ── Sidebar overlay (mobile) ── */}
          {sidebarOpen && <div className="adm-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

          {/* ── Sidebar ── */}
          <aside className={`adm-sidebar${sidebarOpen ? ' open' : ''}`}>
            <div className="adm-sidebar-brand">
              <div className="adm-sidebar-logo-text">So<span>Fun</span></div>
              <div className="adm-sidebar-sub-text">Admin Panel</div>
            </div>

            <nav className="adm-sidebar-nav">
              {NAV_SECTIONS.map(sec => (
                <div key={sec.label} className="adm-nav-section">
                  <div className="adm-nav-section-label">{sec.label}</div>
                  {sec.items.map(item => (
                    <button
                      key={item.key}
                      className={`adm-nav-btn${tab === item.key ? ' active' : ''}`}
                      onClick={() => goTab(item.key)}
                    >
                      <span className="adm-nav-icon"><i className={`fas ${item.icon}`} /></span>
                      <span className="adm-nav-label">{item.label}</span>
                      {tab === item.key && <span className="adm-nav-active-bar" />}
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            <button className="adm-sidebar-logout" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt" /> ออกจากระบบ
            </button>
          </aside>

          {/* ── Main content ── */}
          <main className="adm-content">

            {/* Top bar */}
            <div className="adm-topbar">
              <button className="adm-hamburger" onClick={() => setSidebarOpen(o => !o)}>
                <i className="fas fa-bars" />
              </button>
              <div className="adm-topbar-title">
                <i className={`fas ${activeTab?.icon}`} /> {activeTab?.label}
              </div>
              <div className="adm-topbar-actions">
                {tab === 'scripts' && (
                  <button className="adm-btn-red adm-btn-sm2" onClick={() => { setTab('scripts'); openModal() }}>
                    <i className="fas fa-plus" /> สคริปต์
                  </button>
                )}
              </div>
            </div>

            {/* Mobile tab scroll */}
            <div className="adm-mobile-tabs">
              {ALL_TABS.map(t => (
                <button key={t.key} className={`adm-mobile-tab${tab===t.key?' active':''}`} onClick={()=>goTab(t.key)}>
                  <i className={`fas ${t.icon}`} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <div className="adm-content-body">
              {tab === 'dashboard'   && <DashboardTab allGames={allGames} members={members} onGoTab={goTab} />}
              {tab === 'history'     && (
                <HistoryTab
                  allGames={allGames}
                  members={members}
                  showToast={showToast}
                  initialMember={historyInitialMember}
                  onClearInitialMember={() => setHistoryInitialMember(null)}
                />
              )}
              {tab === 'evaluations' && <EvaluationsTab showToast={showToast} allGames={allGames} />}
              {tab === 'scripts'   && <ScriptsTab allGames={allGames} showToast={showToast} openModal={openModal} openEdit={openEdit} />}
              {tab === 'members'   && (
                <MembersTab
                  members={members}
                  allGames={allGames}
                  showToast={showToast}
                  onViewMemberHistory={(m) => {
                    setHistoryInitialMember(m)
                    goTab('history')
                  }}
                />
              )}
              {tab === 'menu'      && <MenuTab showToast={showToast} />}
              {tab === 'bookings'  && <BookingsTab showToast={showToast} adminUser={isAdmin} allGames={allGames} />}
              {tab === 'random'    && <RandomWheelTab showToast={showToast} members={members} />}
              {tab === 'payment'   && <PaymentTab showToast={showToast} />}
              {tab === 'receipt'   && <ReceiptSettingsTab showToast={showToast} />}
              {tab === 'promotion' && <PromotionTab showToast={showToast} allGames={allGames} />}
              {tab === 'data'      && <DataTab showToast={showToast} />}
            </div>
          </main>
        </div>
      )}
      <div style={{ height: '80px' }} />
    </div>
  )
}
