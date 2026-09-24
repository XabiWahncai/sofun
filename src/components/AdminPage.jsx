import { useState, useEffect, useMemo } from 'react'
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_RARITY, RARITY } from '../constants/achievements'
import { auth, db } from '../firebase'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, doc, getDoc, deleteDoc, updateDoc, setDoc, serverTimestamp, addDoc, query, orderBy, limit, getDocs, where, Timestamp, writeBatch } from 'firebase/firestore'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

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
function DashboardTab({ allGames, members }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(14) // days

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
        <div className="dash-chart-title"><i className="fas fa-receipt" /> ออเดอร์ล่าสุด</div>
        {payments.slice(0, 10).map(p => {
          const d = paidDate(p)
          return (
            <div key={p.id} className="dash-pay-row">
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
function ScriptsTab({ allGames, showToast, openModal, openEdit }) {
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

  return (
    <div className="adm-card">
      <div className="adm-card-header">
        <div className="adm-card-title"><i className="fas fa-scroll" style={{ color: 'var(--crimson-500)' }} /> สคริปต์ ({allGames.length})</div>
        <button className="adm-btn-red" onClick={openModal}><i className="fas fa-plus" /> เพิ่มใหม่</button>
      </div>
      <div className="adm-scripts-list">
        {allGames.length === 0
          ? <p className="adm-empty">ยังไม่มีสคริปต์</p>
          : allGames.map(g => (
            <div key={g.id} className="adm-script-row">
              <div className="adm-script-img">
                {g.image || g.coverUrl ? <img src={g.image || g.coverUrl} alt="" /> : '🎭'}
              </div>
              <div className="adm-list-info">
                <div className="adm-list-name">{g.title || 'ไม่มีชื่อ'}</div>
                <div className="adm-list-sub">{g.players || '-'} คน · {g.time || '-'} · {g.price || 0}฿ · {g.difficulty || '-'}</div>
              </div>
              <div className="adm-row-actions">
                <button className="adm-icon-btn adm-edit" onClick={() => handleEdit(g.id)}><i className="fas fa-edit" /></button>
                <button className="adm-icon-btn adm-del" onClick={() => handleDelete(g.id, g.title || '')}><i className="fas fa-trash" /></button>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ─── Edit Member Modal ────────────────────────────────────────────────────────
const getMemberAchievements = (m) =>
  Array.isArray(m.achievements) ? m.achievements
  : m.achievement && m.achievement !== 'none' ? [m.achievement]
  : []

function EditMemberModal({ member, onClose, showToast }) {
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

  const toggleAchievement = (id) => {
    setForm(f => ({
      ...f,
      achievements: f.achievements.includes(id)
        ? f.achievements.filter(a => a !== id)
        : [...f.achievements, id],
    }))
  }
  const [saving, setSaving] = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

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
      showToast('บันทึกข้อมูลสำเร็จ ✓')
      onClose()
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const F = ({ label, k, placeholder, type = 'text' }) => (
    <div className="adm-field">
      <label className="adm-label">{label}</label>
      <input className="adm-input" type={type} value={form[k]} placeholder={placeholder}
        onChange={e => set(k, e.target.value)} />
    </div>
  )

  const name = member.nickname || `${member.firstname || ''} ${member.lastname || ''}`.trim() || 'ไม่มีชื่อ'

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-edit-modal">
        <div className="adm-edit-modal-header">
          <div className="adm-edit-modal-title">
            <div className="adm-member-ava" style={{ width: 40, height: 40 }}>
              {form.pictureUrl
                ? <img src={form.pictureUrl} alt="" onError={e => e.currentTarget.style.display = 'none'} />
                : <span>{name[0]}</span>
              }
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>แก้ไขข้อมูลสมาชิก</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="adm-edit-modal-body">
          <div className="adm-field-row">
            <F label="ชื่อเล่น / Display Name" k="nickname" placeholder="เช่น นิค" />
            <div className="adm-field">
              <label className="adm-label">Role</label>
              <select className="adm-input" value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div className="adm-field-row">
            <F label="ชื่อจริง" k="firstname" placeholder="ชื่อ" />
            <F label="นามสกุล" k="lastname" placeholder="นามสกุล" />
          </div>

          <div className="adm-field-row">
            <F label="อีเมล" k="email" placeholder="email@example.com" type="email" />
            <F label="เบอร์โทร" k="tel_no" placeholder="08x-xxx-xxxx" />
          </div>

          <F label="ตำแหน่ง (แสดงในหน้า Team)" k="position" placeholder="เช่น Game Master, Designer" />
          <F label="URL รูปโปรไฟล์" k="pictureUrl" placeholder="https://..." />

          <div className="adm-field">
            <label className="adm-label">Achievements</label>
            <div className="adm-ach-picker">
              {ACHIEVEMENTS_BY_RARITY.map(({ rarity: rar, items }) => (
                <div key={rar.id} className="adm-ach-picker-group">
                  <div className="adm-ach-picker-rarity" style={{ color: rar.color }}>
                    <span className="adm-ach-picker-dot" style={{ background: rar.color }} />
                    {rar.label}
                  </div>
                  <div className="adm-ach-picker-row">
                    {items.map(ach => {
                      const on = form.achievements.includes(ach.id)
                      return (
                        <button key={ach.id} type="button"
                          className={`adm-ach-pick-card${on ? ' on' : ''}`}
                          style={{ '--ac': ach.color, '--ab': ach.bg, '--abr': ach.border }}
                          onClick={() => toggleAchievement(ach.id)}>
                          <div className="adm-ach-pick-icon">
                            <i className={`fas ${ach.icon}`} />
                          </div>
                          <div className="adm-ach-pick-body">
                            <div className="adm-ach-pick-name">{ach.label}</div>
                            <div className="adm-ach-pick-th">{ach.labelTH}</div>
                            <div className="adm-ach-pick-desc">{ach.descTH}</div>
                          </div>
                          {on && <div className="adm-ach-pick-check"><i className="fas fa-check" /></div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {form.pictureUrl && (
            <div className="adm-preview-img" style={{ marginTop: 8 }}>
              <img src={form.pictureUrl} alt="" style={{ height: 80, borderRadius: 8, objectFit: 'cover' }}
                onError={e => e.currentTarget.style.display = 'none'} />
            </div>
          )}
        </div>

        <div className="adm-edit-modal-footer">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="adm-btn-red" onClick={save} disabled={saving} style={{ minWidth: 120 }}>
            {saving ? <span className="spinner-sm" /> : <><i className="fas fa-save" /> บันทึก</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Members Tab ──────────────────────────────────────────────────────────────
function MembersTab({ members, showToast }) {
  const [search, setSearch]       = useState('')
  const [editMember, setEditMember] = useState(null)

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
          placeholder="🔍 ค้นหาชื่อหรืออีเมล..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="adm-members-hint">กด ✏️ เพื่อแก้ไขข้อมูลสมาชิก</div>

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
                {isAdm && <div className="adm-crown">👑</div>}
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
              <button className="adm-icon-btn adm-edit" onClick={() => setEditMember(m)} title="แก้ไขข้อมูล">
                <i className="fas fa-edit" />
              </button>
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
        showToast('อัปเดตเมนูสำเร็จ ✓')
      } else {
        await addDoc(collection(db, 'menuItems'), { ...data, available: true, createdAt: serverTimestamp() })
        showToast('เพิ่มเมนูสำเร็จ ✓')
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
  const [easySlipApiKey, setEasySlipApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'payment')).then(snap => {
      if (snap.exists()) {
        setPhone(snap.data().promptPayPhone || '')
        setEasySlipApiKey(snap.data().easySlipApiKey || '')
      }
      setLoaded(true)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'payment'), {
        promptPayPhone: phone.trim(),
        easySlipApiKey: easySlipApiKey.trim(),
        updatedAt: serverTimestamp(),
      })
      showToast('บันทึกสำเร็จ ✓')
    } catch { showToast('บันทึกล้มเหลว', 'error') }
    finally { setSaving(false) }
  }

  if (!loaded) return <div className="adm-loading"><div className="spinner" /></div>

  return (
    <div className="adm-card">
      <div className="adm-card-title"><i className="fas fa-mobile-alt" style={{ color: '#4ade80' /* ds-allow-hardcode */ }} /> ตั้งค่าการชำระเงิน</div>
      <div className="adm-field" style={{ marginTop: 16 }}>
        <label className="adm-label">เบอร์โทรศัพท์ หรือ เลขบัตรประชาชน (PromptPay)</label>
        <input
          className="adm-input"
          placeholder="เช่น 0812345678"
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />
        <div className="adm-hint" style={{ marginTop: 6 }}>
          ใช้สร้าง QR Code PromptPay ให้ลูกค้าสแกนจ่าย
        </div>
      </div>
      <div className="adm-field" style={{ marginTop: 16 }}>
        <label className="adm-label">EasySlip API Key (ตรวจสลิปอัตโนมัติ)</label>
        <input
          className="adm-input"
          type="password"
          placeholder="ใส่ API Key จาก developer.easyslip.com"
          value={easySlipApiKey}
          onChange={e => setEasySlipApiKey(e.target.value)}
        />
        <div className="adm-hint" style={{ marginTop: 6 }}>
          ถ้าใส่ API Key ระบบจะตรวจสลิปอัตโนมัติ — ถ้าไม่ใส่ลูกค้าส่งสลิปแล้วรอแอดมินยืนยันเอง
        </div>
      </div>
      <button className="adm-btn-red" style={{ marginTop: 20, width: '100%', padding: 14 }} onClick={save} disabled={saving}>
        {saving ? <span className="spinner-sm" /> : <><i className="fas fa-save" /> บันทึก</>}
      </button>
    </div>
  )
}

// ─── Promotion Tab ────────────────────────────────────────────────────────────
function PromotionTab({ showToast }) {
  const [promo, setPromo] = useState({
    heading: 'โปรโมชั่น เดือน',
    month: 'มิถุนายน 2025',
    description: 'โปรโมชั่นสำหรับผู้ที่สมัครเป็นสมาชิกร้าน',
    badge1: '🎭 สคริปต์ใหม่',
    badge2: '⚡ โปรโมชั่นพิเศษ',
    badge3: '🔥 จำนวนจำกัด',
    videoUrl: '',
    bannerUrl: '',
  })
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'promotion')).then(snap => {
      if (snap.exists()) setPromo(p => ({ ...p, ...snap.data() }))
      setLoaded(true)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'promotion'), { ...promo, updatedAt: serverTimestamp() })
      showToast('บันทึกโปรโมชั่นสำเร็จ ✓')
    } catch { showToast('บันทึกล้มเหลว', 'error') }
    finally { setSaving(false) }
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

  return (
    <div>
      <div className="adm-card">
        <div className="adm-card-title" style={{ marginBottom: '20px' }}>
          <i className="fas fa-bullhorn" style={{ color: '#fbbf24' /* ds-allow-hardcode */ }} /> ข้อความโปรโมชั่น
        </div>
        <div className="adm-field-row">
          {field('หัวข้อ', 'heading', 'โปรโมชั่น เดือน')}
          {field('เดือน/ปี', 'month', 'มิถุนายน 2025')}
        </div>
        {field('คำอธิบาย', 'description', 'รายละเอียดโปรโมชั่น...', 'textarea')}
        <div className="adm-field-row">
          {field('Badge 1', 'badge1', '🎭 สคริปต์ใหม่')}
          {field('Badge 2', 'badge2', '⚡ โปรโมชั่นพิเศษ')}
          {field('Badge 3', 'badge3', '🔥 จำนวนจำกัด')}
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-title" style={{ marginBottom: '20px' }}>
          <i className="fas fa-photo-video" style={{ color: '#60a5fa' /* ds-allow-hardcode */ }} /> มีเดีย
        </div>
        {field('URL วิดีโอ YouTube', 'videoUrl', 'https://www.youtube.com/embed/...')}
        <div className="adm-hint">วาง Embed URL จาก YouTube (Share → Embed → ก็อป src) · ถ้าว่างจะใช้วิดีโอ default</div>
        {promo.videoUrl && (
          <div className="adm-preview-video">
            <iframe src={promo.videoUrl} allow="autoplay; encrypted-media" allowFullScreen title="preview" />
          </div>
        )}
        {field('URL รูปแบนเนอร์ (ถ้ามี)', 'bannerUrl', 'https://...')}
        {promo.bannerUrl && (
          <div className="adm-preview-img">
            <img src={promo.bannerUrl} alt="banner preview" onError={e => e.currentTarget.style.display = 'none'} />
          </div>
        )}
      </div>

      <div className="adm-card" style={{ background: 'rgba(var(--crimson-500-rgb), 0.06)', border: '1px solid rgba(var(--crimson-500-rgb), 0.20)' }}>
        <div className="adm-card-title" style={{ marginBottom: '12px' }}>
          <i className="fas fa-eye" style={{ color: 'var(--crimson-500)' }} /> ตัวอย่างที่จะโชว์หน้าหลัก
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', lineHeight: 1.8 }}>
          <div style={{ fontSize: '11px', color: 'var(--crimson-500)', textTransform: 'uppercase', letterSpacing: '2px' }}>โปรโมชั่นประจำเดือน</div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-on-action)', fontFamily: "'Barlow Condensed', sans-serif" }}>
            {promo.heading}<br /><span style={{ color: 'var(--crimson-500)' }}>{promo.month}</span>
          </div>
          <div style={{ marginTop: '8px' }}>{promo.description}</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            {[promo.badge1, promo.badge2, promo.badge3].filter(Boolean).map((b, i) => (
              <span key={i} style={{ background: 'rgba(255,255,255,0.08)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>{b}</span>
            ))}
          </div>
        </div>
      </div>

      <button className="adm-btn-red" style={{ width: '100%', padding: '14px', fontSize: '15px' }} onClick={save} disabled={saving}>
        {saving ? <span className="spinner-sm" /> : <><i className="fas fa-save" /> บันทึกโปรโมชั่น</>}
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
  const [winnerHistory, setWinnerHistory] = useState([])
  const [selectedLockedId, setSelectedLockedId] = useState('')
  const [savingLock, setSavingLock] = useState(false)
  const [triggeringSpin, setTriggeringSpin] = useState(false)
  const [search, setSearch] = useState('')

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

    // 3. Winner history
    const qWin = query(collection(db, 'wheelHistory'), orderBy('wonAt', 'desc'), limit(50))
    const unsubWin = onSnapshot(qWin, (snap) => {
      setWinnerHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return () => {
      unsubConf()
      unsubPh()
      unsubWin()
    }
  }, [])

  // Aggregate user play counts
  const candidates = useMemo(() => {
    const userPlays = {}
    const userDetails = {}

    const memMap = {}
    members.forEach(m => { memMap[m.id] = m })

    playHistory.forEach(ph => {
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
  }, [playHistory, members, config.removedUserIds])

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
      showToast(selectedLockedId ? '🔒 บันทึกการล็อคผลเรียบร้อยแล้ว' : 'ปลดล็อคการสุ่มแล้ว')
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
      showToast('ส่งคำสั่งหมุนวงล้อเรียบร้อยแล้ว 🎯')
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
              <span style={{ fontSize: 20 }}>🎲</span>
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
            {config.lockedWinnerId ? '🔴 มีการล็อคผล' : '🟢 สุ่มตามธรรมชาติ (Fair)'}
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
                  🔒 ล็อคให้: {lockedCandidate?.name || config.lockedWinnerId}
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
                    🔒 {c.name} ({c.tickets} ครั้ง · {c.chance}%)
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
                        🎟️ {c.tickets} ครั้ง
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--text-secondary)' }}>
                      {c.chance}%
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {config.lockedWinnerId === c.id ? (
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '2px 7px', borderRadius: 6 }}>
                          🔒 ล็อครอบนี้
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>ปกติ</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          onClick={() => {
                            setSelectedLockedId(c.id)
                            updateDoc(doc(db, 'wheelSettings', 'config'), {
                              lockedWinnerId: c.id,
                              updatedAt: serverTimestamp(),
                            }).then(() => showToast(`🔒 ล็อคผลให้ ${c.name} แล้ว`))
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
                    <span style={{ fontSize: 14 }}>👑</span>
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
      showToast(`ลบแล้ว ${total} รายการ ✓`)
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
        background: 'var(--surface-elevated)', borderRadius: '20px 20px 0 0',
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

function MockBookingModal({ adminUser, onClose, showToast }) {
  const [date, setDate] = useState('')
  const [room, setRoom] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!date || !room) { showToast('กรุณาเลือกวันที่และห้อง', 'error'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'bookings'), {
        gameId: '',
        gameName: note || 'Mock Block',
        gameImage: '',
        date,
        room,
        status: 'confirmed',
        isMock: true,
        mockNote: note,
        leaderId: adminUser?.uid || 'admin',
        leaderName: adminUser?.name || 'Admin',
        leaderAvatar: '',
        members: [],
        maxMembers: 0,
        depositAmount: 0,
        depositDeadline: '',
        adminNote: note,
        confirmedAt: new Date().toISOString(),
        confirmedBy: adminUser?.name || 'admin',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      showToast('เพิ่ม Mock Booking สำเร็จ')
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
        background: 'var(--surface-elevated)', borderRadius: '20px 20px 0 0',
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
        <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
            Mock Block
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, color: 'var(--text-tertiary)', padding: 6, lineHeight: 1 }}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div style={{ padding: '0 20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Utility note */}
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            Mock block ป้องกันไม่ให้ลูกค้าจองวันนี้ — ใช้สำหรับงานส่วนตัว ปิดห้อง หรือ hold วันไว้ก่อน
          </p>

          {/* Date */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>วันที่ *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--surface-page)', color: 'var(--text-primary)', fontSize: 14, fontFamily: "'Sarabun',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Room chip selector */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>ห้อง *</label>
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

          {/* Note */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="เช่น งานส่วนตัว, ปิดห้อง"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--surface-page)', color: 'var(--text-primary)', fontSize: 13, fontFamily: "'Sarabun',sans-serif", outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '13px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: "'Sarabun',sans-serif" }}>
              ยกเลิก
            </button>
            <button onClick={handleSubmit} disabled={saving || !date || !room}
              style={{ flex: 2, padding: '13px', borderRadius: 10, border: 'none', background: date && room ? 'var(--crimson-500)' : 'var(--border-default)', color: date && room ? '#fff' : 'var(--text-tertiary)', cursor: saving || !date || !room ? 'default' : 'pointer', fontSize: 14, fontWeight: 800, fontFamily: "'Sarabun',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s' }}>
              {saving
                ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> กำลังบันทึก...</>
                : <><i className="fas fa-plus" /> เพิ่ม Mock Block</>}
            </button>
          </div>
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
      <div style={{ background:'var(--surface-elevated)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:520, maxHeight:'92vh', overflowY:'auto', border:'1px solid var(--border-default)', borderBottom:'none', boxShadow:'0 -8px 48px rgba(0,0,0,0.45)', fontFamily:"'Sarabun',sans-serif", animation:'slideUp 0.28s cubic-bezier(0.22,1,0.36,1)' }}>
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

function RoomGrid({ bookings }) {
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
                      ? (isMockOccupied ? '#64748b' : (STATUS_COLORS_B[b.status] || '#888')) /* ds-allow-hardcode: status data-viz */
                      : null
                    return (
                      <div
                        key={d}
                        title={b ? `${isMockOccupied ? 'Mock Block' : (b.gameName || '-')} · ${STATUS_LABELS_B[b.status] || b.status}` : 'ว่าง'}
                        style={{
                          height: CELL_H, borderRadius: 6,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: statusColor
                            ? (isMockOccupied ? statusColor + '22' : roomColor + '40')
                            : isToday ? 'rgba(198,36,25,0.05)' : 'var(--surface-card)',
                          border: `1px solid ${statusColor
                            ? (isMockOccupied ? statusColor + '66' : roomColor + '66')
                            : isToday ? 'rgba(198,36,25,0.22)' : 'var(--border-default)'}`,
                          borderLeft: isToday ? '2px solid var(--crimson-500)' : undefined,
                          cursor: b ? 'pointer' : 'default',
                          transition: 'opacity 0.12s',
                        }}>
                        {isMockOccupied && (
                          <i className="fas fa-lock" style={{ fontSize: 7, color: statusColor }} />
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

function BookingsTab({ showToast, adminUser }) {
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
      const updatedMembers = snap.data().members.map(m =>
        m.uid === memberUid
          ? { ...m, paidDeposit: true, paidAt: new Date().toISOString(), slipStatus: 'verified' }
          : m
      )
      const allPaid = updatedMembers.every(m => m.paidDeposit)
      const isFull = updatedMembers.length >= (snap.data().maxMembers || 1)
      const payload = { members: updatedMembers, updatedAt: serverTimestamp() }
      if (allPaid && isFull && snap.data().status === 'confirmed') payload.status = 'locked'
      await updateDoc(ref, payload)
      showToast('ยืนยันสลิปสำเร็จ')
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
      <RoomGrid bookings={bookings} />

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
        {/* Mock Block — outlined utility button, intentionally dim */}
        <button
          onClick={() => setMockModal(true)}
          style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Sarabun',sans-serif", display: 'flex', alignItems: 'center', gap: 5, transition: 'border-color 0.15s, color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
          <i className="fas fa-plus" /> Mock Block
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
            const statusColor = b.isMock ? '#64748b' : (STATUS_COLORS_B[b.status] || '#888') /* ds-allow-hardcode: status data-viz */
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
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                        {b.isMock
                          ? <><i className="fas fa-lock" style={{ fontSize: 11, marginRight: 5, color: 'var(--text-tertiary)' }} />Mock Block</>
                          : b.gameName || '-'}
                      </span>
                      <BookingStatusBadge status={b.status} />
                      {b.isMock && (
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: 'rgba(100,116,139,0.12)', color: '#64748b', fontWeight: 700, border: '1px solid rgba(100,116,139,0.25)' }}> {/* ds-allow-hardcode */}
                          MOCK
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
        />
      )}
    </div>
  )
}

const NAV_SECTIONS = [
  {
    label: 'ภาพรวม',
    items: [{ key: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' }],
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
      showToast('เข้าสู่ระบบสำเร็จ ✓')
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
              {tab === 'dashboard' && <DashboardTab allGames={allGames} members={members} />}
              {tab === 'scripts'   && <ScriptsTab allGames={allGames} showToast={showToast} openModal={openModal} openEdit={openEdit} />}
              {tab === 'members'   && <MembersTab members={members} showToast={showToast} />}
              {tab === 'menu'      && <MenuTab showToast={showToast} />}
              {tab === 'bookings'  && <BookingsTab showToast={showToast} adminUser={isAdmin} />}
              {tab === 'random'    && <RandomWheelTab showToast={showToast} members={members} />}
              {tab === 'payment'   && <PaymentTab showToast={showToast} />}
              {tab === 'promotion' && <PromotionTab showToast={showToast} />}
              {tab === 'data'      && <DataTab showToast={showToast} />}
            </div>
          </main>
        </div>
      )}
      <div style={{ height: '80px' }} />
    </div>
  )
}
