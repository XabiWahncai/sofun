import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { db } from '../firebase'
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp, runTransaction } from 'firebase/firestore'
import SlipPrint from './SlipPrint'

// ── PromptPay QR generator (EMVCo / BOT standard) ──────────────────────────
function crc16(str) {
  let crc = 0xFFFF
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
    }
  }
  return crc & 0xFFFF
}

function buildPromptPayQR(phoneOrId, amount) {
  if (!phoneOrId) return ''
  const f = (tag, val) => {
    const v = String(val)
    return `${tag}${v.length.toString().padStart(2, '0')}${v}`
  }
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

const fmtCurrency = (val) => {
  const n = Number(val) || 0
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Component ───────────────────────────────────────────────────────────────
export default function PaymentModal({
  session,
  selectedGame,
  onClose,
  onPaid,
  showToast,
  adminUser,
  memberPayments = {},
  getMemberBill: propGetMemberBill,
  grandTotal: propGrandTotal,
  remainingAmount: propRemainingAmount,
  totalDiscount: propTotalDiscount = 0,
  totalPersonalDiscounts: propTotalPersonalDiscounts = 0,
  gameUnitPay: propGameUnitPay,
  gameFullPrice: propGameFullPrice,
  discountEffectiveIds: propDiscountEffectiveIds = [],
  discountPerDiscounted: propDiscountPerDiscounted = 0,
}) {
  const [promptPayPhone, setPromptPayPhone] = useState('')
  const [paymentAccountName, setPaymentAccountName] = useState('')
  const [paymentBankName, setPaymentBankName] = useState('')
  const [splitMode, setSplitMode] = useState(false)
  const [activeMember, setActiveMember] = useState(null)
  const [localMemberPayments, setLocalMemberPayments] = useState({})
  const [saving, setSaving] = useState(false)
  const [slipData, setSlipData] = useState(null)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'payment')).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        setPromptPayPhone(d.promptPayPhone || '')
        setPaymentAccountName(d.paymentAccountName || '')
        setPaymentBankName(d.paymentBankName || '')
      }
    })
  }, [])

  const currentPayments = { ...memberPayments, ...localMemberPayments }
  const sessionMembers = Array.isArray(session?.members) ? session.members : []
  const orderArr = Array.isArray(session?.order) ? session.order : []
  const n = sessionMembers.length

  const gameUnit = (session?.customPrice !== '' && session?.customPrice !== undefined)
    ? Number(session.customPrice) || 0
    : selectedGame ? (selectedGame.payPrice ?? selectedGame.price ?? 0) : 0
  const gameFull = selectedGame
    ? (Number(selectedGame.fullPrice ?? selectedGame.price) || (gameUnit + (Number(selectedGame.deposit) || 0)))
    : gameUnit

  const getMemberBill = (m) => {
    if (propGetMemberBill) return propGetMemberBill(m)
    const myFood = orderArr
      .filter(x => x.orderedBy?.uid === m.uid)
      .reduce((s, x) => s + (x.totalPrice || 0) * (x.qty || 1), 0)
    const myBaseGame = m.unpaidDeposit ? (propGameFullPrice ?? gameFull) : (propGameUnitPay ?? gameUnit)
    const isMemberDiscounted = (propDiscountEffectiveIds || []).includes(m.uid)
    const myDisc = isMemberDiscounted ? (propDiscountPerDiscounted || 0) : 0
    return Math.max(0, myBaseGame + myFood - (Number(m.personalDiscount) || 0) - myDisc)
  }

  const rawFoodTotal = orderArr.reduce((s, x) => s + (x.totalPrice || 0) * (x.qty || 1), 0)
  const rawGameTotal = sessionMembers.reduce((sum, m) => sum + (m.unpaidDeposit ? (propGameFullPrice ?? gameFull) : (propGameUnitPay ?? gameUnit)), 0)
  const rawTotal = rawFoodTotal + rawGameTotal

  const alreadyPaidMembers = sessionMembers.filter(m => currentPayments[m.uid]?.verified)
  const alreadyPaid = alreadyPaidMembers.reduce((s, m) => s + (Number(currentPayments[m.uid]?.amount) || 0), 0)

  const calcGrandTotal = propGrandTotal ?? Math.max(0, rawTotal - propTotalDiscount - propTotalPersonalDiscounts)
  const tableRemaining = propRemainingAmount ?? Math.max(0, calcGrandTotal - alreadyPaid)

  const isAllMembersPaid = sessionMembers.length > 0 && sessionMembers.every(m => currentPayments[m.uid]?.verified)

  // Initialize or maintain active member in split mode
  useEffect(() => {
    if (splitMode && sessionMembers.length > 0) {
      if (!activeMember || !sessionMembers.some(m => m.uid === activeMember)) {
        const firstUnpaid = sessionMembers.find(m => !currentPayments[m.uid]?.verified)
        setActiveMember((firstUnpaid || sessionMembers[0]).uid)
      }
    }
  }, [splitMode, sessionMembers, currentPayments, activeMember])

  const activeMemberObj = sessionMembers.find(m => m.uid === activeMember) || sessionMembers[0] || null
  const activeAmt = splitMode && activeMemberObj
    ? getMemberBill(activeMemberObj)
    : tableRemaining
  const isSelectedMemberPaid = activeMemberObj ? Boolean(currentPayments[activeMemberObj.uid]?.verified) : false

  // ── Confirm single member payment (DOES NOT close party/session) ───────────
  const handleConfirmSingleMember = async () => {
    if (!session.confirmedOrderId) {
      showToast('กรุณาบันทึกออเดอร์ก่อน', 'error'); return
    }
    if (!activeMemberObj) return
    const targetUid = activeMemberObj.uid
    const amt = Math.round(activeAmt * 100) / 100

    setSaving(true)
    try {
      const updates = {
        [`memberPayments.${targetUid}.verified`]: true,
        [`memberPayments.${targetUid}.amount`]: amt,
        [`memberPayments.${targetUid}.verifiedAt`]: new Date().toISOString(),
        [`memberPayments.${targetUid}.paidByAdmin`]: true,
        [`memberPayments.${targetUid}.pendingAdminReview`]: false,
        [`memberPayments.${targetUid}.easyslipPending`]: false,
      }
      if (amt <= 0) updates[`memberPayments.${targetUid}.zeroAmount`] = true

      await updateDoc(doc(db, 'orders', session.confirmedOrderId), updates)

      setLocalMemberPayments(prev => ({
        ...prev,
        [targetUid]: {
          verified: true,
          amount: amt,
          verifiedAt: new Date().toISOString(),
          paidByAdmin: true,
          zeroAmount: amt <= 0,
        }
      }))

      showToast(`บันทึกรับเงินของ ${activeMemberObj.name} สำเร็จ ✓`)

      // Auto-advance to next unpaid member
      const nextUnpaid = sessionMembers.find(
        m => m.uid !== targetUid && !currentPayments[m.uid]?.verified
      )
      if (nextUnpaid) {
        setActiveMember(nextUnpaid.uid)
      }
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Confirm full table payment (marks all unpaid as paid & closes party) ────
  const handleConfirmFullPayment = async () => {
    if (!session.confirmedOrderId) {
      showToast('กรุณาบันทึกออเดอร์ก่อน', 'error'); return
    }
    setSaving(true)
    try {
      const orderSnap = await getDoc(doc(db, 'orders', session.confirmedOrderId))
      const openAt = orderSnap.data()?.createdAt?.toDate() || null

      const counterRef = doc(db, 'settings', 'counter')
      let serial = 1
      await runTransaction(db, async tx => {
        const snap = await tx.get(counterRef)
        serial = ((snap.exists() ? snap.data().slipSerial : 0) || 0) + 1
        tx.set(counterRef, { slipSerial: serial }, { merge: true })
      })

      const updates = {
        status: 'paid',
        paidAt: serverTimestamp(),
        paidTotal: calcGrandTotal,
        serial,
      }

      sessionMembers.forEach(m => {
        if (!currentPayments[m.uid]?.verified) {
          const mBill = getMemberBill(m)
          updates[`memberPayments.${m.uid}.verified`] = true
          updates[`memberPayments.${m.uid}.amount`] = Math.round(mBill * 100) / 100
          updates[`memberPayments.${m.uid}.verifiedAt`] = new Date().toISOString()
          updates[`memberPayments.${m.uid}.paidByAdmin`] = true
          updates[`memberPayments.${m.uid}.pendingAdminReview`] = false
          updates[`memberPayments.${m.uid}.easyslipPending`] = false
        }
      })

      const payData = {
        orderId: session.confirmedOrderId,
        sessionLabel: session.label,
        scriptId: session.scriptId,
        scriptTitle: selectedGame?.title || '',
        dm: session.dm,
        room: session.room,
        members: sessionMembers.map(m => ({
          uid: m.uid, name: m.name,
          character: m.character || '',
          avatar: m.avatar || '',
          scanInAt: m.scanInAt || null,
        })),
        memberUids: sessionMembers.map(m => m.uid),
        gameUnitPrice: propGameUnitPay ?? gameUnit,
        gameTotal: rawGameTotal,
        foodItems: orderArr.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty })),
        foodTotal: rawFoodTotal,
        discount: { applied: propTotalDiscount || 0 },
        alreadyPaid,
        fullTotal: calcGrandTotal,
        grandTotal: calcGrandTotal,
        serial,
        openAt,
        printCount: 0,
        paidAt: serverTimestamp(),
        confirmedBy: adminUser?.name || 'admin',
      }

      const payRef = await addDoc(collection(db, 'payments'), payData)
      await updateDoc(doc(db, 'orders', session.confirmedOrderId), updates)

      showToast('บันทึกการชำระเงินสำเร็จ ✓')
      setSlipData({ payData: { ...payData, openAt }, serial, paymentDocId: payRef.id })
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Active member breakdown values
  const memberFood = activeMemberObj ? orderArr.filter(x => x.orderedBy?.uid === activeMemberObj.uid) : []
  const isUnpaidDep = activeMemberObj ? Boolean(activeMemberObj.unpaidDeposit) : false
  const memberGameFee = activeMemberObj
    ? (isUnpaidDep ? (propGameFullPrice ?? gameFull) : (propGameUnitPay ?? gameUnit))
    : 0
  const isDisc = activeMemberObj ? (propDiscountEffectiveIds || []).includes(activeMemberObj.uid) : false
  const memberDisc = isDisc ? (propDiscountPerDiscounted || 0) : 0
  const memberPersonalDisc = activeMemberObj ? (Number(activeMemberObj.personalDiscount) || 0) : 0

  const qrPayload = buildPromptPayQR(promptPayPhone, activeAmt)

  return (
    <>
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pay-modal">

        {/* Header */}
        <div className="pay-header">
          <div className="pay-title"><i className="fas fa-credit-card" /> ชำระเงิน — {session.label}</div>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="pay-body">

          {/* Split Mode Toggle */}
          {n > 1 && (
            <div className="pay-split-toggle">
              <button
                className={`pay-split-btn${!splitMode ? ' active' : ''}`}
                onClick={() => setSplitMode(false)}
              >
                <i className="fas fa-receipt" /> รวมบิล (ทั้งโต๊ะ)
              </button>
              <button
                className={`pay-split-btn${splitMode ? ' active' : ''}`}
                onClick={() => setSplitMode(true)}
              >
                <i className="fas fa-cut" /> แยกบิล (รายคน)
              </button>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* ── MODE: รวมบิล (ทั้งโต๊ะ) ────────────────────────────────────────── */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {!splitMode && (
            <>
              {/* Order summary */}
              <div className="pay-summary-block">
                {selectedGame && (
                  <div className="pay-summary-row">
                    <span>
                      <i className="fas fa-scroll" style={{ color: '#c62419', marginRight: 4 }} />
                      {selectedGame.title} × {n} คน
                    </span>
                    <span>฿{rawGameTotal.toLocaleString()}</span>
                  </div>
                )}
                {orderArr.map((x, idx) => (
                  <div key={x.key || idx} className="pay-summary-row">
                    <span>
                      {x.name}{x.addons?.length > 0 ? ` (${x.addons.map(a => a.name).join(', ')})` : ''} × {x.qty}
                      {x.orderedBy?.name && <span style={{ color: '#888', fontSize: 11, marginLeft: 4 }}>({x.orderedBy.name.split(' ')[0]})</span>}
                    </span>
                    <span>฿{((x.totalPrice || 0) * (x.qty || 1)).toLocaleString()}</span>
                  </div>
                ))}
                <div className="pay-summary-sub">
                  <span>รวมรายการทั้งหมด</span>
                  <span>฿{rawTotal.toLocaleString()}</span>
                </div>
                {propTotalDiscount > 0 && (
                  <div className="pay-summary-row" style={{ color: 'var(--feedback-success-icon)' }}>
                    <span><i className="fas fa-tag" style={{ marginRight: 4 }} />ส่วนลดโปรโมชั่น</span>
                    <span style={{ color: 'var(--feedback-success-icon)' }}>−฿{propTotalDiscount.toLocaleString()}</span>
                  </div>
                )}
                {propTotalPersonalDiscounts > 0 && (
                  <div className="pay-summary-row" style={{ color: 'var(--feedback-success-icon)' }}>
                    <span><i className="fas fa-user-tag" style={{ marginRight: 4 }} />ส่วนลดพิเศษ</span>
                    <span style={{ color: 'var(--feedback-success-icon)' }}>−฿{propTotalPersonalDiscounts.toLocaleString()}</span>
                  </div>
                )}
                {alreadyPaid > 0 && (
                  <div className="pay-already-paid-row">
                    <span>
                      <i className="fas fa-check-circle" style={{ color: 'var(--feedback-success-icon)', marginRight: 4 }} />
                      จ่ายแล้ว ({alreadyPaidMembers.map(m => m.name.split(' ')[0]).join(', ')})
                    </span>
                    <span style={{ color: 'var(--feedback-success-icon)' }}>−฿{alreadyPaid.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Grand total */}
              <div className="pay-grand">
                <span>{alreadyPaid > 0 ? 'ยอดคงค้างทั้งโต๊ะ' : 'ยอดชำระทั้งโต๊ะ'}</span>
                <span className="pay-grand-amount">฿{tableRemaining.toLocaleString()}</span>
              </div>
            </>
          )}

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* ── MODE: แยกบิล (รายคน) ────────────────────────────────────────── */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {splitMode && (
            <>
              {/* Member Tabs */}
              <div className="pay-member-tabs">
                {sessionMembers.map(m => {
                  const isPaid = Boolean(currentPayments[m.uid]?.verified)
                  const mBill = getMemberBill(m)
                  const isActive = activeMember === m.uid
                  return (
                    <button
                      key={m.uid}
                      type="button"
                      className={`pay-member-tab${isActive ? ' active' : ''}${isPaid ? ' paid' : ''}`}
                      onClick={() => setActiveMember(m.uid)}
                      style={{
                        borderColor: isActive ? (isPaid ? '#16a34a' : 'var(--red)') : (isPaid ? '#86efac' : '#e0e0e0'),
                        background: isActive ? (isPaid ? '#f0fdf4' : 'rgba(198,36,25,0.06)') : (isPaid ? '#f0fdf4' : 'none'),
                        position: 'relative',
                      }}
                    >
                      <span className="pay-member-tab-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isPaid && <i className="fas fa-check-circle" style={{ color: '#16a34a', fontSize: 11 }} />}
                        {m.name.split(' ')[0]}
                      </span>
                      <span className="pay-member-tab-amt" style={{ color: isPaid ? '#16a34a' : 'var(--red)' }}>
                        {isPaid ? 'จ่ายแล้ว' : `฿${mBill.toLocaleString()}`}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* All members paid banner */}
              {isAllMembersPaid && (
                <div style={{ textAlign: 'center', padding: '14px 16px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 14 }}>
                  <div style={{ fontSize: 22, color: '#16a34a', marginBottom: 4 }}>
                    <i className="fas fa-check-double" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#166534' }}>
                    ทุกคนในตี้จ่ายเงินครบแล้ว
                  </div>
                  <div style={{ fontSize: 12, color: '#15803d', marginTop: 3 }}>
                    ปิดหน้านี้แล้วกดปุ่ม <strong>"ตี้นี้เล่นเสร็จแล้ว"</strong> ที่หน้าหลักเพื่อเลือกฉากจบและปิดตี้ได้ตามขั้นตอน
                  </div>
                </div>
              )}

              {/* Active member's individual breakdown */}
              {activeMemberObj && (
                <div className="pay-summary-block">
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      <i className="fas fa-user" style={{ marginRight: 5 }} />
                      รายการของ {activeMemberObj.name} {activeMemberObj.character ? `(${activeMemberObj.character})` : ''}
                    </span>
                    {isSelectedMemberPaid ? (
                      <span style={{ color: '#16a34a', fontWeight: 700 }}><i className="fas fa-check-circle" /> ชำระแล้ว</span>
                    ) : (
                      <span style={{ color: 'var(--red)', fontWeight: 700 }}>รอชำระ</span>
                    )}
                  </div>

                  {/* Game Fee */}
                  {memberGameFee > 0 && (
                    <div className="pay-summary-row">
                      <span>
                        <i className="fas fa-scroll" style={{ color: '#c62419', marginRight: 5 }} />
                        {selectedGame?.title || 'ค่าเกม'}{isUnpaidDep ? ' (ราคาเต็ม)' : ''}
                      </span>
                      <span>฿{memberGameFee.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Food Items ordered specifically by this member */}
                  {memberFood.map((x, idx) => (
                    <div key={x.key || idx} className="pay-summary-row">
                      <span>
                        {x.name}{x.addons?.length > 0 ? ` (${x.addons.map(a => a.name).join(', ')})` : ''} × {x.qty}
                      </span>
                      <span>฿{((x.totalPrice || 0) * (x.qty || 1)).toLocaleString()}</span>
                    </div>
                  ))}
                  {memberFood.length === 0 && memberGameFee <= 0 && (
                    <div style={{ fontSize: 12, color: '#999', padding: '4px 0' }}>ไม่มีรายการอาหารหรือค่าเกม</div>
                  )}

                  {/* Promo discount */}
                  {memberDisc > 0 && (
                    <div className="pay-summary-row" style={{ color: 'var(--feedback-success-icon)' }}>
                      <span><i className="fas fa-tag" style={{ marginRight: 5 }} />ส่วนลดโปรโมชั่น</span>
                      <span style={{ color: 'var(--feedback-success-icon)' }}>−฿{fmtCurrency(memberDisc)}</span>
                    </div>
                  )}

                  {/* Personal discount */}
                  {memberPersonalDisc > 0 && (
                    <div className="pay-summary-row" style={{ color: 'var(--feedback-success-icon)' }}>
                      <span><i className="fas fa-user-tag" style={{ marginRight: 5 }} />{activeMemberObj.personalDiscountNote || 'ส่วนลดพิเศษ'}</span>
                      <span style={{ color: 'var(--feedback-success-icon)' }}>−฿{fmtCurrency(memberPersonalDisc)}</span>
                    </div>
                  )}

                  <div className="pay-summary-sub">
                    <span>ยอดของคนนี้</span>
                    <span style={{ color: isSelectedMemberPaid ? '#16a34a' : 'var(--red)', fontSize: 16, fontWeight: 800 }}>
                      ฿{activeAmt.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* ── PromptPay QR / Status ───────────────────────────────────────── */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {splitMode && isSelectedMemberPaid ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', background: '#f0fdf4', borderRadius: 16, border: '1px solid #bbf7d0' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, margin: '0 auto 8px' }}>
                <i className="fas fa-check" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#166534', marginBottom: 2 }}>
                {activeMemberObj?.name} ชำระเงินเรียบร้อยแล้ว
              </div>
              <div style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                ยอด ฿{Number(currentPayments[activeMemberObj?.uid]?.amount ?? activeAmt).toLocaleString()}
              </div>
            </div>
          ) : activeAmt <= 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 12px', background: '#f0fdf4', borderRadius: 16, border: '1px solid #bbf7d0' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, margin: '0 auto 8px' }}>
                <i className="fas fa-check-circle" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a', marginBottom: 4 }}>
                ยอดชำระ ฿0
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                ไม่มีรายการต้องชำระ (หรือได้รับส่วนลดเต็มจำนวน) ไม่ต้องสแกนจ่าย สามารถกดยืนยันได้ทันที
              </div>
            </div>
          ) : promptPayPhone ? (
            <div className="pay-qr-section">
              <div className="pay-qr-label">
                <i className="fas fa-qrcode" /> QR PromptPay
                {splitMode && activeMemberObj && <span> — {activeMemberObj.name}</span>}
              </div>
              <div className="pay-qr-amount">฿{activeAmt.toLocaleString()}</div>
              <div className="pay-qr-wrap">
                <QRCodeSVG
                  value={qrPayload}
                  size={190} bgColor="#fff" fgColor="#1a1a1a"
                  level="M" includeMargin={true}
                />
              </div>
              <div className="pay-qr-phone">{promptPayPhone}</div>
              {(paymentAccountName || paymentBankName) && (
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px', fontWeight: 500, textAlign: 'center' }}>
                  {paymentAccountName}{paymentBankName ? ` (${paymentBankName})` : ''}
                </div>
              )}
            </div>
          ) : (
            <div className="pay-no-phone">
              <i className="fas fa-exclamation-circle" />
              <div>ยังไม่ได้ตั้งค่าเบอร์ PromptPay</div>
              <div className="pay-no-phone-hint">ตั้งค่าได้ที่ Admin → การชำระเงิน</div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="pay-footer">
          <button className="pos-cancel-btn" style={{ flex: 1 }} onClick={onClose}>
            {isAllMembersPaid ? 'ปิด' : 'ยกเลิก'}
          </button>

          {splitMode ? (
            isSelectedMemberPaid ? (
              <button
                className="pay-confirm-btn"
                style={{ background: '#16a34a', borderColor: '#16a34a' }}
                onClick={() => {
                  if (isAllMembersPaid) onClose()
                  else {
                    const nextUnpaid = sessionMembers.find(m => !currentPayments[m.uid]?.verified)
                    if (nextUnpaid) setActiveMember(nextUnpaid.uid)
                  }
                }}
              >
                {isAllMembersPaid ? (
                  <><i className="fas fa-check-double" /> ครบทุกคนแล้ว (ปิดหน้าต่าง)</>
                ) : (
                  <><i className="fas fa-arrow-right" /> สมาชิกคนถัดไป</>
                )}
              </button>
            ) : (
              <button
                className="pay-confirm-btn"
                onClick={handleConfirmSingleMember}
                disabled={saving}
                style={activeAmt <= 0 ? { background: '#16a34a', borderColor: '#16a34a' } : undefined}
              >
                {saving
                  ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                  : activeAmt <= 0
                  ? <><i className="fas fa-check-circle" /> ยืนยันยอด ฿0 ({activeMemberObj?.name?.split(' ')[0]})</>
                  : <><i className="fas fa-check-circle" /> ยืนยันรับเงิน ({activeMemberObj?.name?.split(' ')[0]}) ฿{activeAmt.toLocaleString()}</>
                }
              </button>
            )
          ) : (
            <button
              className="pay-confirm-btn"
              onClick={handleConfirmFullPayment}
              disabled={saving || tableRemaining < 0}
              style={tableRemaining <= 0 ? { background: '#16a34a', borderColor: '#16a34a' } : undefined}
            >
              {saving
                ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                : tableRemaining <= 0
                ? <><i className="fas fa-check-circle" /> ยืนยันปิดบิลทั้งโต๊ะ (฿0)</>
                : <><i className="fas fa-check-circle" /> ยืนยันรับเงินทั้งโต๊ะ ฿{tableRemaining.toLocaleString()}</>
              }
            </button>
          )}
        </div>
      </div>
    </div>

    {slipData && (
      <SlipPrint
        payData={slipData.payData}
        serial={slipData.serial}
        paymentDocId={slipData.paymentDocId}
        onClose={() => { setSlipData(null); onPaid() }}
      />
    )}
    </>
  )
}
