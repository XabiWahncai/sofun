import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore'
import { DEFAULT_RECEIPT_SETTINGS, buildSlipHTML, fmtSlipDT } from '../constants/receipt'

export default function SlipPrint({ payData, serial, paymentDocId, onClose }) {
  const [printCount, setPrintCount] = useState(1)
  const [printing, setPrinting] = useState(false)
  const [receiptSettings, setReceiptSettings] = useState(DEFAULT_RECEIPT_SETTINGS)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'receipt'))
      .then(snap => {
        if (snap.exists()) {
          setReceiptSettings(prev => ({
            ...prev,
            ...snap.data(),
            paymentSlip: { ...prev.paymentSlip, ...snap.data().paymentSlip },
            orderIn: { ...prev.orderIn, ...snap.data().orderIn },
          }))
        }
      })
      .catch(e => console.warn('Could not load receipt settings:', e))
  }, [])

  const { grandTotal, gameUnitPrice, gameTotal, foodItems, discount,
    room, members, scriptTitle, openAt } = payData

  const ps = receiptSettings.paymentSlip || DEFAULT_RECEIPT_SETTINGS.paymentSlip
  const vatRate = Number(ps.vatRate) || 7
  const tax = ps.showVat ? (grandTotal * vatRate / (100 + vatRate)) : 0
  const subtotal = grandTotal - tax
  const discAmt = discount?.applied || 0

  const handlePrint = async () => {
    setPrinting(true)
    try {
      await updateDoc(doc(db, 'payments', paymentDocId), { printCount: increment(1) })
    } catch {}

    const now = new Date()
    const html = buildSlipHTML({
      serial, members, room, scriptTitle,
      gameUnitPrice, gameTotal, foodItems, discount, grandTotal,
      openAt, printAt: now, printCount
    }, receiptSettings)

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
  const is58 = ps.paperWidth === '58mm'

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="slip-modal" style={{ maxWidth: is58 ? 320 : 420 }}>
        <div className="slip-modal-header">
          <div className="slip-modal-title"><i className="fas fa-receipt" /> ใบเสร็จ ({ps.paperWidth || '80mm'})</div>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="slip-modal-body">
          <div className="slip-preview" style={{
            fontFamily: ps.fontFamily,
            fontSize: `${ps.fontSize}px`,
            fontWeight: ps.fontWeight,
            lineHeight: ps.lineHeight,
            maxWidth: is58 ? 220 : 302,
          }}>
            {ps.showCompanyEn && receiptSettings.companyNameEn && (
              <div className="slip-co-name" style={{ textAlign: ps.headerAlign, fontSize: `${ps.headerFontSize}px` }}>
                {receiptSettings.companyNameEn}
              </div>
            )}
            {ps.showCompanyTh && receiptSettings.companyNameTh && (
              <div className="slip-co-sub" style={{ textAlign: ps.headerAlign }}>{receiptSettings.companyNameTh}</div>
            )}
            {ps.showBranch && receiptSettings.branch && (
              <div className="slip-co-sub" style={{ textAlign: ps.headerAlign }}>{receiptSettings.branch}</div>
            )}
            {ps.showSerialChk && (
              <>
                <div className="slip-meta-row">Serial: {serialStr}</div>
                <div className="slip-meta-row">CHK: {chkStr}</div>
              </>
            )}
            <div className="slip-meta-row">Open at: {fmtSlipDT(openAt)}</div>
            <div className="slip-sep" />
            {ps.showRoomGst && (
              <>
                <div className="slip-room-row">ROOM: {room || '-'} | GST: {members.length}</div>
                <div className="slip-sep" />
              </>
            )}
            <div className="slip-section-label" style={{ textAlign: ps.headerAlign }}>{ps.title || 'ORDER'}</div>

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
            {ps.showVat && (
              <div className="slip-total-row">
                <span>Tax ({vatRate}%):</span><span>{tax.toFixed(2)}</span>
              </div>
            )}
            <div className="slip-total-row slip-grand">
              <span>Total:</span><span>{grandTotal.toFixed(2)}</span>
            </div>
            <div className="slip-total-row">
              <span>Cash:</span><span>{grandTotal.toFixed(2)}</span>
            </div>
            <div className="slip-sep" />
            {ps.showPaidBadge && <div className="slip-paid-badge">[PAID]</div>}
            <div>Print at: {fmtSlipDT(new Date())}</div>
            {ps.showPrintTimes && <div>Times of Printing: {printCount}</div>}

            <div className="slip-footer">
              {ps.showAddress && receiptSettings.addressLine1 && <div>{receiptSettings.addressLine1}</div>}
              {ps.showAddress && receiptSettings.addressLine2 && <div>{receiptSettings.addressLine2}</div>}
              {ps.showTaxId && receiptSettings.taxId && <div>Tax ID No.{receiptSettings.taxId}</div>}
              {ps.showWebsite && receiptSettings.website && <div>{receiptSettings.website}</div>}
              {ps.showPhone && receiptSettings.phone && <div>Tell {receiptSettings.phone}</div>}
              {ps.showSlogan && receiptSettings.footerSlogan && <div>{receiptSettings.footerSlogan}</div>}
              {ps.showSlogan && receiptSettings.footerThankYou && <div>{receiptSettings.footerThankYou}</div>}
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
