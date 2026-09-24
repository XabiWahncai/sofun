import { useState } from 'react'
import { db } from '../firebase'
import { doc, updateDoc, increment } from 'firebase/firestore'

const p2 = n => String(Math.round(n)).padStart(2, '0')
const fmtDT = d => {
  if (!d) return 'N/A'
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${p2(dt.getMonth()+1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}`
}

function buildSlipHTML({ serial, members, room, scriptTitle, gameUnitPrice, gameTotal,
  foodItems, discount, grandTotal, openAt, printAt, printCount }) {
  const serialStr = String(serial).padStart(10, '0')
  const chkStr = String(serial).padStart(5, '0') + '/' + members.length
  const tax = grandTotal * 7 / 107
  const subtotal = grandTotal - tax
  const discAmt = discount?.applied || 0
  const rawTotal = grandTotal + discAmt

  const itemRows = []
  if (gameUnitPrice > 0) {
    itemRows.push(`<tr><td>${scriptTitle || 'เกม'} ×${members.length}</td><td class="r">${gameTotal.toFixed(2)}</td></tr>`)
  }
  ;(foodItems || []).forEach(fi => {
    const addStr = fi.addons?.length ? ` (${fi.addons.map(a => a.name).join(',')})` : ''
    itemRows.push(`<tr><td>${fi.name}${addStr} ×${fi.qty}</td><td class="r">${(fi.price * fi.qty).toFixed(2)}</td></tr>`)
  })

  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8"><title>Receipt #${serialStr}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
/* ds-allow-hardcode: thermal receipt print CSS — #000/#fff required for reliable cross-printer rendering; CSS vars do not resolve in print stylesheets */
body{font-family:'Courier New',monospace;font-size:12px;color:#000/* ds-allow-hardcode */;background:#fff/* ds-allow-hardcode */;width:302px;margin:0 auto;padding:10px 8px}
.c{text-align:center}.b{font-weight:bold}.big{font-size:15px}
.sep{border:none;border-top:1px dashed #000/* ds-allow-hardcode */;margin:5px 0}
table{width:100%;border-collapse:collapse}
td{padding:2px 0;vertical-align:top}
td.r{text-align:right;white-space:nowrap;padding-left:6px}
.foot{font-size:10px;text-align:center}
@media print{@page{margin:0;size:80mm auto}body{width:80mm}}
</style></head><body>
<div class="c b big">Sofun Club Co., Ltd.</div>
<div class="c">บริษัท โซฟัน จำกัด</div>
<div class="c">สาขาอาร์ซีเอ (RCA)</div>
<div>Serial: ${serialStr}</div>
<div>CHK: ${chkStr}</div>
<div>Open at: ${fmtDT(openAt)}</div>
<hr class="sep">
<div class="c">ROOM: ${room || '-'} | GST: ${members.length}</div>
<hr class="sep">
<div class="c b">ORDER</div>
<table>${itemRows.join('')}${discAmt > 0 ? `<tr><td>Discount (${discount.type === 'percent' ? discount.value+'%' : '฿'+discount.value})</td><td class="r">-${discAmt.toFixed(2)}</td></tr>` : ''}</table>
<hr class="sep">
<table>
<tr><td>Subtotal:</td><td class="r">${subtotal.toFixed(2)}</td></tr>
<tr><td>Tax (7%):</td><td class="r">${tax.toFixed(2)}</td></tr>
<tr class="b"><td>Total:</td><td class="r">${grandTotal.toFixed(2)}</td></tr>
<tr><td>Cash:</td><td class="r">${grandTotal.toFixed(2)}</td></tr>
</table>
<hr class="sep">
<div>[PAID]</div>
<div>Print at: ${fmtDT(printAt)}</div>
<div>Times of Printing: ${printCount}</div>
<br>
<div class="foot">
<div>21/81 ซอยศูนย์วิจัย แขวงบางกะปิ เขตห้วยขวาง</div>
<div>กรุงเทพ 10310</div>
<div>Tax ID No.0105565117207</div>
<div>www.sofunclub.com</div>
<div>Tell +66 0814661166</div>
<div>Just so fun!</div>
<div>Thank you very much</div>
</div>
</body></html>`
}

export default function SlipPrint({ payData, serial, paymentDocId, onClose }) {
  const [printCount, setPrintCount] = useState(1)
  const [printing, setPrinting] = useState(false)

  const { grandTotal, gameUnitPrice, gameTotal, foodItems, discount,
    room, members, scriptTitle, openAt } = payData

  const tax = grandTotal * 7 / 107
  const subtotal = grandTotal - tax
  const discAmt = discount?.applied || 0

  const handlePrint = async () => {
    setPrinting(true)
    try {
      await updateDoc(doc(db, 'payments', paymentDocId), { printCount: increment(1) })
    } catch {}

    const now = new Date()
    const html = buildSlipHTML({ serial, members, room, scriptTitle,
      gameUnitPrice, gameTotal, foodItems, discount, grandTotal,
      openAt, printAt: now, printCount })

    const win = window.open('', '_blank', 'width=420,height=850,scrollbars=yes')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 300)
    }
    setPrintCount(c => c + 1)
    setPrinting(false)
  }

  const serialStr = String(serial).padStart(10, '0')
  const chkStr = String(serial).padStart(5, '0') + '/' + members.length

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="slip-modal">
        <div className="slip-modal-header">
          <div className="slip-modal-title"><i className="fas fa-receipt" /> ใบเสร็จ</div>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="slip-modal-body">
          <div className="slip-preview">
            <div className="slip-co-name">Sofun Club Co., Ltd.</div>
            <div className="slip-co-sub">บริษัท โซฟัน จำกัด</div>
            <div className="slip-co-sub">สาขาอาร์ซีเอ (RCA)</div>
            <div className="slip-meta-row">Serial: {serialStr}</div>
            <div className="slip-meta-row">CHK: {chkStr}</div>
            <div className="slip-meta-row">Open at: {fmtDT(openAt)}</div>
            <div className="slip-sep" />
            <div className="slip-room-row">ROOM: {room || '-'} | GST: {members.length}</div>
            <div className="slip-sep" />
            <div className="slip-section-label">ORDER</div>

            {gameUnitPrice > 0 && (
              <div className="slip-item-row">
                <span>{scriptTitle || 'เกม'} ×{members.length}</span>
                <span>{gameTotal.toFixed(2)}</span>
              </div>
            )}
            {(foodItems || []).map((fi, i) => {
              const addStr = fi.addons?.length ? ` (${fi.addons.map(a => a.name).join(',')})` : ''
              return (
                <div key={i} className="slip-item-row">
                  <span>{fi.name}{addStr} ×{fi.qty}</span>
                  <span>{(fi.price * fi.qty).toFixed(2)}</span>
                </div>
              )
            })}
            {discAmt > 0 && (
              <div className="slip-item-row slip-discount">
                <span>Discount ({discount.type === 'percent' ? discount.value + '%' : '฿' + discount.value})</span>
                <span>-{discAmt.toFixed(2)}</span>
              </div>
            )}

            <div className="slip-sep" />
            <div className="slip-total-row">
              <span>Subtotal:</span><span>{subtotal.toFixed(2)}</span>
            </div>
            <div className="slip-total-row">
              <span>Tax (7%):</span><span>{tax.toFixed(2)}</span>
            </div>
            <div className="slip-total-row slip-grand">
              <span>Total:</span><span>{grandTotal.toFixed(2)}</span>
            </div>
            <div className="slip-total-row">
              <span>Cash:</span><span>{grandTotal.toFixed(2)}</span>
            </div>
            <div className="slip-sep" />
            <div className="slip-paid-badge">[PAID]</div>
            <div className="slip-meta-row">Print at: {fmtDT(new Date())}</div>
            <div className="slip-meta-row">Times of Printing: {printCount}</div>

            <div className="slip-footer">
              <div>21/81 ซอยศูนย์วิจัย แขวงบางกะปิ เขตห้วยขวาง</div>
              <div>กรุงเทพ 10310</div>
              <div>Tax ID No.0105565117207</div>
              <div>www.sofunclub.com</div>
              <div>Tell +66 0814661166</div>
              <div>Just so fun!</div>
              <div>Thank you very much</div>
            </div>
          </div>
        </div>

        <div className="slip-modal-footer">
          <button className="pos-cancel-btn" style={{ flex: 1 }} onClick={onClose}>ปิด</button>
          <button className="slip-print-btn" onClick={handlePrint} disabled={printing}>
            {printing
              ? <><i className="fas fa-spinner fa-spin" /> กำลังพิมพ์...</>
              : <><i className="fas fa-print" /> พิมพ์ใบเสร็จ {printCount > 1 ? `(#${printCount})` : ''}</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
