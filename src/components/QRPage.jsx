import { useEffect, useState, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { db } from '../firebase'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'

const p2 = n => String(Math.round(n)).padStart(2, '0')
const fmtDT = d => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${p2(dt.getMonth()+1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}`
}

function buildReceiptHTML(h, meUid) {
  const myBill = h.memberBills?.find(m => m.uid === meUid)
  const me = h.members?.find(m => m.uid === meUid)
  const paidAt = h.paidAt?.toDate?.()
  const serial = h.serial ? String(h.serial).padStart(10, '0') : '-'
  const discAmt = h.discount?.applied || 0
  const myTotal = myBill?.total ?? h.grandTotal ?? 0
  const tax = myTotal * 7 / 107
  const subtotal = myTotal - tax

  const itemRows = []
  if ((h.gameUnitPrice || 0) > 0) {
    itemRows.push(`<tr><td>${h.scriptTitle || 'เกม'} ×${h.members?.length || 1}</td><td class="r">${(h.gameTotal||0).toFixed(2)}</td></tr>`)
  }
  ;(myBill?.foodItems || h.foodItems || []).forEach(fi => {
    const addStr = fi.addons?.length ? ` (${fi.addons.map(a => a.name||a).join(',')})` : ''
    itemRows.push(`<tr><td>${fi.name}${addStr} ×${fi.qty}</td><td class="r">${((fi.price||0)*fi.qty).toFixed(2)}</td></tr>`)
  })

  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8"><title>Receipt #${serial}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;color:#000;background:#fff;width:302px;margin:0 auto;padding:10px 8px}
.c{text-align:center}.b{font-weight:bold}.big{font-size:15px}
.sep{border:none;border-top:1px dashed #000;margin:5px 0}
table{width:100%;border-collapse:collapse}
td{padding:2px 0;vertical-align:top}
td.r{text-align:right;white-space:nowrap;padding-left:6px}
.foot{font-size:10px;text-align:center}
@media print{@page{margin:0;size:80mm auto}body{width:80mm}}
</style></head><body>
<div class="c b big">Sofun Club Co., Ltd.</div>
<div class="c">บริษัท โซฟัน จำกัด</div>
<div class="c">สาขาอาร์ซีเอ (RCA)</div>
<div>Serial: ${serial}</div>
<div>Date: ${fmtDT(paidAt)}</div>
<hr class="sep">
<div class="c">ROOM: ${h.room || '-'} | ${h.members?.length || 1} คน</div>
${me?.character ? `<div class="c">บทบาท: ${me.character}</div>` : ''}
<hr class="sep">
<div class="c b">รายการ</div>
<table>${itemRows.join('')}${discAmt > 0 ? `<tr><td>Discount</td><td class="r">-${discAmt.toFixed(2)}</td></tr>` : ''}</table>
<hr class="sep">
<table>
<tr><td>Subtotal:</td><td class="r">${subtotal.toFixed(2)}</td></tr>
<tr><td>Tax (7%):</td><td class="r">${tax.toFixed(2)}</td></tr>
<tr class="b"><td>ยอดของคุณ:</td><td class="r">${myTotal.toFixed(2)}</td></tr>
</table>
<hr class="sep">
<div>[PAID]</div>
${h.ending ? `<div>ผลเกม: ${h.ending}</div>` : ''}
<br>
<div class="foot">
<div>21/81 ซอยศูนย์วิจัย แขวงบางกะปิ เขตห้วยขวาง</div>
<div>กรุงเทพ 10310</div>
<div>Tax ID No.0105565117207</div>
<div>www.sofunclub.com</div>
<div>Tel +66 0814661166</div>
<div>Thank you very much!</div>
</div>
</body></html>`
}

function printBill(h, meUid) {
  const html = buildReceiptHTML(h, meUid)
  const w = window.open('', '_blank', 'width=440,height=720')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

export default function QRPage({ lineUser }) {
  const [history, setHistory]       = useState([])
  const [expandedMap, setExpandedMap] = useState({})
  const [search, setSearch]         = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  const toggleExpanded = id => setExpandedMap(prev => ({ ...prev, [id]: !prev[id] }))

  useEffect(() => {
    if (!lineUser?.uid) return
    const q = query(
      collection(db, 'payments'),
      where('memberUids', 'array-contains', lineUser.uid),
      orderBy('paidAt', 'desc')
    )
    const unsub = onSnapshot(q,
      snap => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {
        const q2 = query(collection(db, 'payments'), orderBy('paidAt', 'desc'))
        onSnapshot(q2, snap => {
          setHistory(snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.memberUids?.includes(lineUser.uid)))
        }, () => {})
      }
    )
    return unsub
  }, [lineUser?.uid])

  const monthOptions = useMemo(() => {
    const seen = new Set()
    const opts = []
    history.forEach(h => {
      const d = h.paidAt?.toDate?.()
      if (!d) return
      const key = `${d.getFullYear()}-${p2(d.getMonth()+1)}`
      if (!seen.has(key)) {
        seen.add(key)
        opts.push({ key, label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) })
      }
    })
    return opts
  }, [history])

  const filtered = useMemo(() => history.filter(h => {
    if (search) {
      if (!(h.scriptTitle || '').toLowerCase().includes(search.toLowerCase())) return false
    }
    if (filterMonth) {
      const d = h.paidAt?.toDate?.()
      if (!d) return false
      if (`${d.getFullYear()}-${p2(d.getMonth()+1)}` !== filterMonth) return false
    }
    return true
  }), [history, search, filterMonth])

  if (!lineUser) {
    return (
      <div id="qr-page" className="page active">
        <div className="qr-not-login">
          <i className="fab fa-line" />
          <p>กรุณาเข้าสู่ระบบด้วย LINE ก่อน</p>
        </div>
      </div>
    )
  }

  const qrUrl = `${window.location.origin}/?scan=${lineUser.uid}`

  return (
    <div id="qr-page" className="page active">
      <div className="qr-container">

        {/* Profile card */}
        <div className="qr-profile-card">
          {lineUser.avatar
            ? <img src={lineUser.avatar} alt="" className="qr-avatar" onError={e => e.currentTarget.style.display = 'none'} />
            : <div className="qr-avatar-placeholder">{(lineUser.name || '?')[0]}</div>
          }
          <div className="qr-profile-name">{lineUser.name}</div>
          <div className="qr-profile-badge"><i className="fab fa-line" /> สมาชิก Sofun Club</div>
        </div>

        {/* QR Code */}
        <div className="qr-card">
          <div className="qr-card-label">แสดง QR นี้ให้แอดมินสแกน</div>
          <div className="qr-code-wrap">
            <QRCodeSVG
              value={qrUrl}
              size={220}
              bgColor="#ffffff" /* ds-allow-hardcode: QRCodeSVG API prop */
              fgColor="#1a1a1a" /* ds-allow-hardcode */
              level="M"
              includeMargin={true}
            />
          </div>
          <div className="qr-card-sub">เพื่อบันทึกประวัติการเล่น</div>
        </div>

        {/* Play History */}
        <div className="qr-history-section">
          <div className="qr-history-title">
            <i className="fas fa-history" /> ประวัติการเล่น
            {history.length > 0 && <span className="qr-history-count">{history.length} ครั้ง</span>}
          </div>

          {/* Filters */}
          {history.length > 0 && (
            <div className="qr-filter-row">
              <div className="qr-filter-search">
                <i className="fas fa-search" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อเกม..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="qr-filter-input"
                />
                {search && (
                  <button className="qr-filter-clear" onClick={() => setSearch('')}>
                    <i className="fas fa-times" />
                  </button>
                )}
              </div>
              {monthOptions.length > 1 && (
                <select
                  className="qr-filter-month"
                  value={filterMonth}
                  onChange={e => setFilterMonth(e.target.value)}
                >
                  <option value="">ทุกเดือน</option>
                  {monthOptions.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="qr-history-empty">
              {history.length === 0 ? 'ยังไม่มีประวัติการเล่น' : 'ไม่พบผลลัพธ์'}
            </div>
          ) : (
            <div className="qr-history-list">
              {filtered.map(h => {
                const me       = h.members?.find(m => m.uid === lineUser.uid)
                const myBill   = h.memberBills?.find(m => m.uid === lineUser.uid)
                const allMembers = h.members || []
                const paidAt   = h.paidAt?.toDate?.()
                const expanded = !!expandedMap[h.id]
                const myTotal  = myBill?.total ?? h.grandTotal ?? 0
                const hasFood  = (myBill?.foodItems?.length > 0 || (h.foodItems?.length > 0))
                const discAmt  = h.discount?.applied || 0

                return (
                  <div key={h.id} className="qr-history-item">

                    {/* Top row: game name + date */}
                    <div className="qr-history-item-top">
                      <div className="qr-history-game">{h.scriptTitle || 'ไม่ระบุเกม'}</div>
                      <div className="qr-history-date">
                        {paidAt ? paidAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : ''}
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="qr-history-meta">
                      {me?.character && <span className="qr-history-tag"><i className="fas fa-user-secret" /> {me.character}</span>}
                      {h.dm         && <span className="qr-history-tag"><i className="fas fa-crown" /> {h.dm}</span>}
                      {h.room       && <span className="qr-history-tag"><i className="fas fa-door-open" /> {h.room}</span>}
                      {allMembers.length > 0 && <span className="qr-history-tag"><i className="fas fa-users" /> {allMembers.length} คน</span>}
                      {h.ending     && <span className="qr-history-tag qr-tag-ending"><i className="fas fa-flag-checkered" /> {h.ending}</span>}
                    </div>

                    {/* Member avatars */}
                    {allMembers.length > 0 && (
                      <div className="qr-member-avatars">
                        {allMembers.slice(0, 9).map((m, i) => (
                          m.avatar
                            ? <img key={i} src={m.avatar} alt={m.name} title={m.name} className={`qr-member-av${m.uid === lineUser.uid ? ' qr-member-av-me' : ''}`} onError={e => e.currentTarget.style.display = 'none'} />
                            : <div key={i} className={`qr-member-av qr-member-av-ph${m.uid === lineUser.uid ? ' qr-member-av-me' : ''}`} title={m.name}>{(m.name||'?')[0]}</div>
                        ))}
                        {allMembers.length > 9 && <div className="qr-member-av qr-member-av-more">+{allMembers.length - 9}</div>}
                      </div>
                    )}

                    {/* Bill summary + action buttons */}
                    <div className="qr-bill-row">
                      <div className="qr-bill-total">
                        <i className="fas fa-receipt" />
                        <span>ยอดของคุณ</span>
                        <strong>฿{myTotal.toLocaleString()}</strong>
                      </div>
                      <div className="qr-bill-actions">
                        <button className="qr-bill-btn" onClick={() => toggleExpanded(h.id)}>
                          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} />
                          {expanded ? 'ซ่อน' : 'ดูบิล'}
                        </button>
                        <button className="qr-bill-btn qr-bill-print" onClick={() => printBill(h, lineUser.uid)}>
                          <i className="fas fa-print" /> ปริ้น
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {expanded && (
                      <div className="qr-history-detail">

                        {/* Game cost */}
                        {(h.gameUnitPrice > 0 || h.gameTotal > 0) && (
                          <div className="qr-hist-detail-section">
                            <div className="qr-hist-detail-label"><i className="fas fa-gamepad" /> ค่าเกม</div>
                            <div className="qr-hist-food-row">
                              <span>{h.scriptTitle || 'เกม'}{h.gameUnitPrice > 0 ? ` (฿${h.gameUnitPrice}/คน × ${allMembers.length || 1})` : ''}</span>
                              <span>฿{(h.gameTotal || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        {/* Food items */}
                        {hasFood && (
                          <div className="qr-hist-detail-section">
                            <div className="qr-hist-detail-label"><i className="fas fa-utensils" /> รายการอาหาร</div>
                            {(myBill?.foodItems || h.foodItems || []).map((f, i) => (
                              <div key={i} className="qr-hist-food-row">
                                <span>{f.name}{f.addons?.length > 0 ? ` (${f.addons.map(a => a.name||a).join(', ')})` : ''} × {f.qty}</span>
                                <span>฿{((f.price||0)*f.qty).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Discount */}
                        {discAmt > 0 && (
                          <div className="qr-hist-food-row qr-hist-discount">
                            <span><i className="fas fa-tag" /> ส่วนลด</span>
                            <span>-฿{discAmt.toLocaleString()}</span>
                          </div>
                        )}

                        {/* Party members */}
                        {allMembers.length > 0 && (
                          <div className="qr-hist-detail-section">
                            <div className="qr-hist-detail-label"><i className="fas fa-users" /> เพื่อนร่วมปาร์ตี้</div>
                            {allMembers.map((m, i) => (
                              <div key={i} className="qr-hist-member-row">
                                {m.avatar
                                  ? <img src={m.avatar} alt="" className="qr-hist-avatar" onError={e => e.currentTarget.style.display = 'none'} />
                                  : <div className="qr-hist-avatar-ph">{(m.name||'?')[0]}</div>
                                }
                                <span className="qr-hist-member-name">{m.name}</span>
                                {m.character && <span className="qr-hist-member-char">({m.character})</span>}
                                {m.uid === lineUser.uid && <span className="qr-hist-me-badge">คุณ</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Game ending */}
                        {h.ending && (
                          <div className="qr-hist-ending">
                            <i className="fas fa-flag-checkered" /> ผลเกม: <strong>{h.ending}</strong>
                          </div>
                        )}

                        {/* Total */}
                        <div className="qr-hist-total-row">
                          <span>ยอดรวมของคุณ</span>
                          <strong>฿{myTotal.toLocaleString()}</strong>
                        </div>

                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
