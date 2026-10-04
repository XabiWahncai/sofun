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

// ── Component ───────────────────────────────────────────────────────────────
export default function PaymentModal({ session, selectedGame, onClose, onPaid, showToast, adminUser, memberPayments }) {
  const [promptPayPhone, setPromptPayPhone] = useState('')
  const [discountType, setDiscountType] = useState('amount') // 'amount' | 'percent'
  const [discountValue, setDiscountValue] = useState('')
  const [splitMode, setSplitMode] = useState(false)
  const [activeMember, setActiveMember] = useState(null)
  const [memberFoodKeys, setMemberFoodKeys] = useState({}) // uid → Set of food keys
  const [saving, setSaving] = useState(false)
  const [slipData, setSlipData] = useState(null)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'payment')).then(snap => {
      if (snap.exists()) setPromptPayPhone(snap.data().promptPayPhone || '')
    })
  }, [])

  // Init split food assignment: every member gets all food items
  useEffect(() => {
    if (!splitMode) return
    const allKeys = orderArr.map(x => x.key)
    const init = {}
    session.members.forEach(m => { init[m.uid] = new Set(allKeys) })
    setMemberFoodKeys(init)
    setActiveMember(session.members[0]?.uid || null)
  }, [splitMode])

  const orderArr = Array.isArray(session.order) ? session.order : []
  const baseGameUnitPrice = (session.customPrice !== '' && session.customPrice !== undefined)
    ? (Number(session.customPrice) || 0)
    : (selectedGame?.payPrice ?? selectedGame?.price ?? 0)
  const calcMemberGamePrice = (m) => {
    if (m?.customGamePrice !== undefined && m?.customGamePrice !== null && m?.customGamePrice !== '') {
      return Math.max(0, Number(m.customGamePrice))
    }
    return baseGameUnitPrice
  }
  const n = session.members.length

  const rawFoodTotal = orderArr.reduce((s, x) => s + (x.totalPrice || 0) * x.qty, 0)
  const rawGameTotal = session.members.reduce((s, m) => s + calcMemberGamePrice(m), 0)
  const totalPersonalDiscounts = session.members.reduce((s, m) => s + (Number(m.personalDiscount) || 0), 0)
  const rawTotal = rawFoodTotal + rawGameTotal

  // Members already paid via EasySlip
  const alreadyPaidMembers = session.members.filter(m => (memberPayments || {})[m.uid]?.verified)
  const alreadyPaid = alreadyPaidMembers.reduce((s, m) => s + (Number((memberPayments || {})[m.uid]?.amount) || 0), 0)

  const discNum = Math.max(0, parseFloat(discountValue) || 0)
  const discountAmt = discountType === 'amount'
    ? Math.min(discNum, rawTotal)
    : Math.min((rawTotal * Math.min(discNum, 100)) / 100, rawTotal)
  const grandTotal = Math.max(0, rawTotal - alreadyPaid - discountAmt - totalPersonalDiscounts)

  // Per-member total in split mode
  const getMemberTotal = (uid) => {
    const m = session.members.find(x => x.uid === uid)
    const myGame = m ? calcMemberGamePrice(m) : baseGameUnitPrice
    const keys = memberFoodKeys[uid] || new Set()
    const myFood = orderArr
      .filter(x => keys.has(x.key))
      .reduce((s, x) => s + (x.totalPrice || 0) * x.qty, 0)
    const myDiscount = n > 0 ? discountAmt / n : 0
    const myPersonalDiscount = Number(m?.personalDiscount) || 0
    return Math.max(0, myGame + myFood - myDiscount - myPersonalDiscount)
  }

  const toggleFood = (uid, key) => {
    setMemberFoodKeys(prev => {
      const s = new Set(prev[uid] || [])
      s.has(key) ? s.delete(key) : s.add(key)
      return { ...prev, [uid]: s }
    })
  }

  const activeAmt = splitMode && activeMember ? getMemberTotal(activeMember) : grandTotal
  const qrPayload = buildPromptPayQR(promptPayPhone, activeAmt)

  // ── Confirm payment ──────────────────────────────────────────────────────
  const handleConfirmPayment = async () => {
    if (!session.confirmedOrderId) {
      showToast('กรุณาบันทึกออเดอร์ก่อน (กดยืนยันออเดอร์)', 'error'); return
    }
    setSaving(true)
    try {
      // Fetch order openAt time
      const orderSnap = await getDoc(doc(db, 'orders', session.confirmedOrderId))
      const openAt = orderSnap.data()?.createdAt?.toDate() || null

      // Atomic serial counter
      const counterRef = doc(db, 'settings', 'counter')
      let serial = 1
      await runTransaction(db, async tx => {
        const snap = await tx.get(counterRef)
        serial = ((snap.exists() ? snap.data().slipSerial : 0) || 0) + 1
        tx.set(counterRef, { slipSerial: serial }, { merge: true })
      })

      const memberBills = session.members.map(m => {
        const keys = memberFoodKeys[m.uid] || new Set()
        const food = orderArr.filter(x => keys.has(x.key))
        return {
          uid: m.uid,
          name: m.name,
          character: m.character || '',
          avatar: m.avatar || '',
          scanInAt: m.scanInAt || null,
          gamePrice: calcMemberGamePrice(m),
          customGamePrice: (m.customGamePrice !== undefined && m.customGamePrice !== null && m.customGamePrice !== '') ? Number(m.customGamePrice) : null,
          customGamePriceReason: m.customGamePriceReason || '',
          personalDiscount: Number(m.personalDiscount) || 0,
          personalDiscountNote: m.personalDiscountNote || '',
          foodItems: food.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty })),
          total: splitMode ? getMemberTotal(m.uid) : (grandTotal / (n || 1)),
        }
      })

      const payData = {
        orderId: session.confirmedOrderId,
        sessionLabel: session.label,
        scriptId: session.scriptId,
        scriptTitle: selectedGame?.title || '',
        dm: session.dm,
        room: session.room,
        members: session.members.map(m => ({
          uid: m.uid, name: m.name,
          character: m.character || '',
          avatar: m.avatar || '',
          scanInAt: m.scanInAt || null,
          personalDiscount: Number(m.personalDiscount) || 0,
          personalDiscountNote: m.personalDiscountNote || '',
          customGamePrice: (m.customGamePrice !== undefined && m.customGamePrice !== null && m.customGamePrice !== '') ? Number(m.customGamePrice) : null,
          customGamePriceReason: m.customGamePriceReason || '',
        })),
        memberUids: session.members.map(m => m.uid),
        gameUnitPrice: baseGameUnitPrice,
        gameTotal: rawGameTotal,
        foodItems: orderArr.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty })),
        foodTotal: rawFoodTotal,
        discount: { type: discountType, value: discNum, applied: discountAmt },
        alreadyPaid,
        alreadyPaidMembers: alreadyPaidMembers.map(m => ({ uid: m.uid, name: m.name, amount: (memberPayments || {})[m.uid]?.amount || 0 })),
        fullTotal: rawTotal,
        grandTotal,
        splitMode,
        memberBills,
        serial,
        openAt,
        printCount: 0,
        paidAt: serverTimestamp(),
        confirmedBy: adminUser?.name || 'admin',
      }

      const payRef = await addDoc(collection(db, 'payments'), payData)
      await updateDoc(doc(db, 'orders', session.confirmedOrderId), {
        status: 'paid',
        paidAt: serverTimestamp(),
        paidTotal: grandTotal,
        discount: payData.discount,
        serial,
      })

      showToast('บันทึกการชำระเงินสำเร็จ ✓')
      setSlipData({ payData: { ...payData, openAt }, serial, paymentDocId: payRef.id })
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const activeMemberObj = session.members.find(m => m.uid === activeMember)

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

          {/* Order summary */}
          <div className="pay-summary-block">
            {selectedGame && (
              <div className="pay-summary-row">
                <span><i className="fas fa-scroll" style={{ color: '#c62419', marginRight: 4 }} />{selectedGame.title} × {n} คน</span>
                <span>฿{rawGameTotal.toLocaleString()}</span>
              </div>
            )}
            {orderArr.map(x => (
              <div key={x.key} className="pay-summary-row">
                <span>
                  {x.name}{x.addons?.length > 0 ? ` (${x.addons.map(a => a.name).join(', ')})` : ''} × {x.qty}
                </span>
                <span>฿{(x.totalPrice * x.qty).toLocaleString()}</span>
              </div>
            ))}
            <div className="pay-summary-sub">
              <span>รวม</span><span>฿{rawTotal.toLocaleString()}</span>
            </div>
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

          {/* Discount */}
          <div className="pay-discount-row">
            <span className="pay-disc-label"><i className="fas fa-tag" /> ส่วนลด</span>
            <div className="pay-disc-controls">
              <button
                className={`pay-disc-type${discountType === 'amount' ? ' active' : ''}`}
                onClick={() => { setDiscountType('amount'); setDiscountValue('') }}>฿</button>
              <button
                className={`pay-disc-type${discountType === 'percent' ? ' active' : ''}`}
                onClick={() => { setDiscountType('percent'); setDiscountValue('') }}>%</button>
              <input
                className="pay-disc-input" type="number"
                min="0" max={discountType === 'percent' ? 100 : rawTotal}
                placeholder="0" value={discountValue}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  if (isNaN(v) || v < 0) { setDiscountValue(''); return }
                  if (discountType === 'percent' && v > 100) { setDiscountValue('100'); return }
                  if (discountType === 'amount' && v > rawTotal) { setDiscountValue(String(rawTotal)); return }
                  setDiscountValue(e.target.value)
                }}
              />
            </div>
            {discountAmt > 0 && (
              <span className="pay-disc-applied">-฿{discountAmt.toLocaleString()}</span>
            )}
          </div>

          {/* Grand total */}
          <div className="pay-grand">
            <span>{alreadyPaid > 0 ? 'ยอดคงค้าง' : 'ยอดชำระ'}</span>
            <span className="pay-grand-amount">฿{grandTotal.toLocaleString()}</span>
          </div>

          {/* Split toggle */}
          {n > 1 && (
            <div className="pay-split-toggle">
              <button className={`pay-split-btn${!splitMode ? ' active' : ''}`} onClick={() => setSplitMode(false)}>
                <i className="fas fa-receipt" /> รวมบิล
              </button>
              <button className={`pay-split-btn${splitMode ? ' active' : ''}`} onClick={() => setSplitMode(true)}>
                <i className="fas fa-cut" /> แยกบิล
              </button>
            </div>
          )}

          {/* Split: member tabs */}
          {splitMode && (
            <div className="pay-member-tabs">
              {session.members.map(m => (
                <button
                  key={m.uid}
                  className={`pay-member-tab${activeMember === m.uid ? ' active' : ''}`}
                  onClick={() => setActiveMember(m.uid)}
                >
                  <span className="pay-member-tab-name">{m.name.split(' ')[0]}</span>
                  <span className="pay-member-tab-amt">฿{getMemberTotal(m.uid).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}

          {/* Split: food assignment for active member */}
          {splitMode && activeMember && orderArr.length > 0 && (
            <div className="pay-food-assign">
              <div className="pay-food-assign-label">
                รายการอาหารของ <strong>{activeMemberObj?.name}</strong>
              </div>
              {orderArr.map(x => (
                <label key={x.key} className="pay-food-check">
                  <input
                    type="checkbox"
                    checked={(memberFoodKeys[activeMember] || new Set()).has(x.key)}
                    onChange={() => toggleFood(activeMember, x.key)}
                  />
                  <span>
                    {x.name}{x.addons?.length > 0 ? ` (${x.addons.map(a=>a.name).join(',')})` : ''}
                    {' '}× {x.qty} — ฿{(x.totalPrice * x.qty).toLocaleString()}
                  </span>
                </label>
              ))}
              <div className="pay-food-assign-total">
                ค่าเกม ฿{calcMemberGamePrice(activeMemberObj).toLocaleString()}
                {activeMemberObj?.customGamePrice !== undefined && activeMemberObj?.customGamePrice !== null && (
                  <span style={{ fontSize: 11, color: 'var(--crimson-500)', marginLeft: 4 }}>
                    ({activeMemberObj.customGamePriceReason || 'ปรับพิเศษ'})
                  </span>
                )}
                {' '}+ อาหาร ฿{
                  orderArr.filter(x => (memberFoodKeys[activeMember]||new Set()).has(x.key))
                    .reduce((s,x)=>s+x.totalPrice*x.qty,0).toLocaleString()
                } = <strong>฿{getMemberTotal(activeMember).toLocaleString()}</strong>
              </div>
            </div>
          )}

          {/* PromptPay QR */}
          <div className="pay-qr-section">
            {promptPayPhone ? (
              <>
                <div className="pay-qr-label">
                  <i className="fas fa-qrcode" /> QR PromptPay
                  {splitMode && activeMemberObj && <span> — {activeMemberObj.name}</span>}
                </div>
                <div className="pay-qr-amount">฿{activeAmt.toLocaleString()}</div>
                <div className="pay-qr-wrap">
                  <QRCodeSVG
                    value={qrPayload}
                    size={200} bgColor="#fff" fgColor="#1a1a1a"
                    level="M" includeMargin={true}
                  />
                </div>
                <div className="pay-qr-phone">{promptPayPhone}</div>
                {splitMode && n > 1 && (
                  <div className="pay-split-nav">
                    {session.members.map((m, i) => (
                      <button
                        key={m.uid}
                        className={`pay-split-nav-dot${activeMember === m.uid ? ' active' : ''}`}
                        onClick={() => setActiveMember(m.uid)}
                        title={m.name}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="pay-no-phone">
                <i className="fas fa-exclamation-circle" />
                <div>ยังไม่ได้ตั้งค่าเบอร์ PromptPay</div>
                <div className="pay-no-phone-hint">ตั้งค่าได้ที่ Admin → การชำระเงิน</div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="pay-footer">
          <button className="pos-cancel-btn" style={{ flex: 1 }} onClick={onClose}>ยกเลิก</button>
          <button className="pay-confirm-btn" onClick={handleConfirmPayment} disabled={saving}>
            {saving
              ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
              : <><i className="fas fa-check-circle" /> ยืนยันรับเงิน</>
            }
          </button>
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
