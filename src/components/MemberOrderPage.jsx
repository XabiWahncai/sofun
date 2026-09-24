import { useState, useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { db, storage, appFunctions } from '../firebase'
import { httpsCallable } from 'firebase/functions'
import { doc, collection, onSnapshot, query, orderBy, updateDoc, arrayUnion, getDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'


const ALL = 'ทั้งหมด'

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
  const f = (tag, val) => { const v = String(val); return `${tag}${v.length.toString().padStart(2, '0')}${v}` }
  const target = phoneOrId.replace(/[-\s]/g, '').replace(/^0/, '66')
  const acct = f('00', 'A000000677010111') + f('01', target)
  let s = f('00', '01') + f('01', '12') + f('29', acct) + f('53', '764')
  if (amount > 0) s += f('54', amount.toFixed(2))
  s += f('58', 'TH') + '6304'
  return s + crc16(s).toString(16).toUpperCase().padStart(4, '0')
}

const SEP = '================================'

function fmtDT(v) {
  if (!v) return '—'
  const d = v instanceof Date ? v : (typeof v === 'string' ? new Date(v) : v?.toDate?.())
  if (!d) return '—'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function MemberReceipt({ payment, amount, paidItems, scriptTitle, room, numMembers, createdAt, myGameFee, forAll, onClose }) {
  const total = Number(payment?.amount || amount)
  const tax   = total * 7 / 107
  const sub   = total - tax

  return (
    <div className="member-receipt-wrap">
      <div className="member-receipt">
        <div className="rcpt-company">Sofun Club Co., Ltd.</div>
        <div className="rcpt-sub">บริษัท โซฟัน จำกัด</div>
        <div className="rcpt-sub">สาขาอาร์ซีเอ (RCA)</div>

        <div className="rcpt-info-block">
          <div>Open at: {fmtDT(createdAt)}</div>
        </div>

        <div className="rcpt-sep">{SEP}</div>
        <div className="rcpt-table-line">
          ROOM: {room || '—'} | GST: {numMembers}
        </div>
        <div className="rcpt-sep">{SEP}</div>

        <div className="rcpt-section-title">ORDER</div>
        {myGameFee > 0 && (
          <div className="rcpt-item-row">
            <span className="rcpt-item-name">{scriptTitle || 'ค่าเกม'}</span>
            <span className="rcpt-item-price">{myGameFee.toFixed(2)}</span>
          </div>
        )}
        {(paidItems || []).map((item, i) => (
          <div key={i} className="rcpt-item-row">
            <span className="rcpt-item-name">
              {item.name}{item.addons?.length > 0 ? ` (${item.addons.map(a => a.name).join(',')})` : ''}
              {(item.qty || 1) > 1 ? ` ×${item.qty}` : ''}
            </span>
            <span className="rcpt-item-price">
              {((item.totalPrice || item.price || 0) * (item.qty || 1)).toFixed(2)}
            </span>
          </div>
        ))}

        <div className="rcpt-sep">{SEP}</div>
        <div className="rcpt-total-row"><span>Subtotal:</span><span>{sub.toFixed(2)}</span></div>
        <div className="rcpt-total-row"><span>Tax (7%):</span><span>{tax.toFixed(2)}</span></div>
        <div className="rcpt-total-row bold"><span>Total:</span><span>{total.toFixed(2)}</span></div>
        <div className="rcpt-total-row"><span>Cash:</span><span>{total.toFixed(2)}</span></div>
        <div className="rcpt-sep">{SEP}</div>

        <div className="rcpt-paid">[PAID]</div>
        <div className="rcpt-print-info">Print at: {fmtDT(new Date())}</div>
        <div className="rcpt-print-info">Times of Printing: 1</div>

        <div className="rcpt-sep">{SEP}</div>
        <div className="rcpt-footer">
          <div>21/81 ซอยศูนย์วิจัย แขวงบางกะปิ เขตห้วยขวาง</div>
          <div>กรุงเทพ 10310</div>
          <div>Tax ID No.0105565117207</div>
          <div>www.sofunclub.com</div>
          <div>Tell +66 0814661166</div>
          <div>Just so fun!</div>
          <div>Thank you very much</div>
        </div>
      </div>
      <button className="mo-pay-verify-btn" style={{ margin: '12px 16px 4px' }} onClick={onClose}>ปิด</button>
    </div>
  )
}

function PaymentSheet({ amount, forAll, forGroup, groupMembers = [], orderId, lineUser, allMembers, promptPayPhone, memberPayments, onClose, showToast, paidItems, scriptTitle, room, numMembers, createdAt, myGameFee, getGroupMemberBill }) {
  const myPayment = memberPayments?.[lineUser.uid]
  const [step, setStep] = useState(() =>
    myPayment?.verified || myPayment?.easyslipPending ? 'done'
    : myPayment?.pendingAdminReview ? 'slip'
    : 'qr'
  )
  const [loadMsg, setLoadMsg] = useState('')
  const qrValue = promptPayPhone ? buildPromptPayQR(promptPayPhone, amount) : ''

  const saveQR = () => {
    const canvas = document.getElementById('mo-pay-qr-canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png'); a.download = 'promptpay-qr.png'; a.click()
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setLoadMsg('กำลังอัปโหลดสลิป...')
    try {
      // 1. Upload to Storage (for record keeping)
      const slipRef = ref(storage, `slips/${orderId}/${lineUser.uid}_${Date.now()}`)
      await uploadBytes(slipRef, file)
      const slipUrl = await getDownloadURL(slipRef)

      // 2. Call Cloud Function: server reads QR from image → calls EasySlip
      setLoadMsg('กำลังตรวจสอบ EasySlip...')
      let verified = false
      let verifyData = {}
      let slipCode = null
      try {
        const verifySlip = httpsCallable(appFunctions, 'verifySlip')
        const result = await verifySlip({ slipUrl, amount, orderId, uid: lineUser.uid, name: lineUser.name })
        const json = result.data
        slipCode = json.code || null
        if (json.success) {
          verified = true
          const slip = json.data?.rawSlip || {}
          verifyData = {
            transRef: slip.transRef || '',
            bank: slip.sender?.bank?.short || '',
            bankName: slip.sender?.bank?.name || '',
          }
        } else if (json.code === 'SLIP_PENDING' && !forAll) {
          // Function already wrote the full pending entry to Firestore — just notify and close
          setStep('done')
          showToast('Bangkok Bank กำลังประมวลผล — ระบบจะยืนยันอัตโนมัติ ✓')
          return
        } else if (json.code === 'WRONG_RECEIVER') {
          showToast('สลิปโอนไปยังบัญชีอื่น — กรุณาตรวจสอบและโอนใหม่', 'error')
          return
        }
      } catch {}

      // 3. Save result to Firestore
      const entry = {
        paidAt: new Date().toISOString(), amount, slipUrl,
        verified, pendingAdminReview: !verified,
        name: lineUser.name, ...verifyData,
      }
      const updates = {}
      if (forAll) {
        allMembers.forEach(m => { updates[`memberPayments.${m.uid}`] = { ...entry, name: m.name, paidByProxy: lineUser.uid } })
      } else if (forGroup && groupMembers.length >= 2) {
        const groupUids = groupMembers.map(m => m.uid)
        groupMembers.forEach(m => {
          const memberAmount = getGroupMemberBill ? getGroupMemberBill(m) : Math.round(amount / groupMembers.length)
          updates[`memberPayments.${m.uid}`] = { ...entry, name: m.name, amount: memberAmount, groupPay: true, groupWith: groupUids.filter(u => u !== m.uid), paidByProxy: m.uid === lineUser.uid ? null : lineUser.uid }
        })
      } else {
        updates[`memberPayments.${lineUser.uid}`] = entry
      }
      await updateDoc(doc(db, 'orders', orderId), updates)

      setStep('done')
      if (verified) {
        showToast('EasySlip ยืนยันแล้ว ✓')
      } else if (slipCode === 'QR_NOT_FOUND' || slipCode === 'IMAGE_ERROR') {
        showToast('บันทึกสลิปแล้ว — รอแอดมินยืนยัน (อ่าน QR อัตโนมัติไม่สำเร็จ)')
      } else if (slipCode === 'SERVICE_EXPIRED') {
        showToast('EasySlip หมดอายุ — บันทึกสลิปแล้ว รอแอดมินยืนยัน')
      } else if (slipCode === 'NO_API_KEY') {
        showToast('บันทึกสลิปแล้ว — รอแอดมินยืนยัน')
      } else {
        showToast('บันทึกสลิปแล้ว — รอแอดมินยืนยัน')
      }
    } catch (err) {
      showToast(err?.message || 'อัปโหลดไม่สำเร็จ', 'error')
    } finally { setLoadMsg('') }
  }

  const loading = !!loadMsg

  return (
    <div className="mo-bill-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mo-pay-sheet">
        <div className="mo-bill-handle" />
        <div className="mo-bill-header">
          <span className="mo-bill-title">
            <i className={`fas fa-${step === 'done' ? (myPayment?.verified ? 'check-circle' : myPayment?.easyslipPending ? 'hourglass-half' : 'clock') : 'qrcode'}`} />
            {' '}{step === 'done' ? (myPayment?.verified ? 'ชำระเงินแล้ว' : myPayment?.easyslipPending ? 'รอยืนยันธนาคาร' : 'ส่งสลิปแล้ว') : forAll ? 'จ่ายทั้งตี้' : forGroup ? `จ่ายรวม ${groupMembers.length} คน` : 'จ่ายของฉัน'}
          </span>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {step === 'done' ? (
          myPayment?.verified ? (
            <MemberReceipt
              payment={myPayment}
              amount={amount}
              paidItems={paidItems}
              scriptTitle={scriptTitle}
              room={room}
              numMembers={numMembers}
              createdAt={createdAt}
              myGameFee={myGameFee}
              forAll={forAll}
              onClose={onClose}
            />
          ) : (
          <div className="mo-pay-done">
            <div className="mo-pay-done-icon">
              <i className={`fas ${myPayment?.easyslipPending ? 'fa-hourglass-half' : 'fa-clock'}`}
                style={{ color: myPayment?.easyslipPending ? 'var(--feedback-info-icon)' : 'var(--feedback-warning-icon)' }} />
            </div>
            <div className="mo-pay-done-amount">฿{(myPayment?.amount || amount).toLocaleString()}</div>
            <div className="mo-pay-done-label">
              {myPayment?.easyslipPending ? 'รอ Bangkok Bank ยืนยัน (อัตโนมัติ)' : 'รอแอดมินตรวจสอบ'}
            </div>
            {!myPayment?.easyslipPending && (
              <button className="mo-pay-verify-btn" style={{ marginTop: 12 }} onClick={() => setStep('slip')}>
                <i className="fas fa-upload" /> อัปโหลดสลิปใหม่
              </button>
            )}
            <button className="mo-pay-verify-btn" style={{ marginTop: 8, background: 'transparent', border: '1px solid #555555', color: '#555555' }} onClick={onClose}>ปิด</button>
          </div>
          )
        ) : step === 'slip' ? (
          <div className="mo-pay-section">
            <div className="mo-pay-step-nav">
              <button className="mo-pay-back-btn" onClick={() => setStep('qr')}>
                <i className="fas fa-arrow-left" /> กลับ
              </button>
              <span className="mo-pay-step-label">ขั้นตอน 2/2 — ส่งสลิป</span>
            </div>
            <div className="mo-pay-amount" style={{ marginBottom: 6 }}>฿{amount.toLocaleString()}</div>
            <div className="mo-pay-slip-instruction">
              <i className="fas fa-info-circle" /> เปิดสลิปในแอปธนาคาร แล้วอัปโหลดภาพสลิป — ระบบจะตรวจสอบ EasySlip อัตโนมัติ
            </div>
            <label className="mo-pay-upload-area" style={{ pointerEvents: loading ? 'none' : 'auto' }}>
              {loading
                ? <><i className="fas fa-spinner fa-spin" /><span>{loadMsg}</span></>
                : <><i className="fas fa-image" /><span>อัปโหลดภาพสลิป</span><span className="mo-pay-upload-hint">JPG, PNG · ตรวจสอบอัตโนมัติ</span></>
              }
              <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={handleFileUpload} style={{ display: 'none' }} disabled={loading} />
            </label>
          </div>
        ) : (
          <div className="mo-pay-section">
            <div className="mo-pay-step-label-top">ขั้นตอน 1/2 — สแกน QR โอนเงิน</div>
            <div className="mo-pay-amount">฿{amount.toLocaleString()}</div>
            {promptPayPhone ? (
              <>
                <div className="mo-pay-qr-box">
                  <QRCodeCanvas id="mo-pay-qr-canvas" value={qrValue} size={220} bgColor="#fff" fgColor="#1a1a1a" level="M" includeMargin={true} />
                </div>
                <div className="mo-pay-phone">{promptPayPhone}</div>
                <button className="mo-pay-save-btn" onClick={saveQR}>
                  <i className="fas fa-download" /> บันทึก QR
                </button>
              </>
            ) : (
              <div className="mo-pay-no-qr">ยังไม่ได้ตั้งค่า PromptPay</div>
            )}
            <button className="mo-pay-verify-btn" style={{ marginTop: 8 }} onClick={() => setStep('slip')}>
              โอนแล้ว → ส่งสลิป <i className="fas fa-arrow-right" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MenuRow({ item, cart, changeQty, addToCart, setAddonPopup }) {
  const inCart = cart.filter(x => x.menuId === item.id).reduce((s, x) => s + x.qty, 0)
  return (
    <div className={`mo-menu-item${inCart > 0 ? ' in-cart' : ''}`}>
      {item.imageUrl && <img src={item.imageUrl} alt="" className="mo-menu-img" />}
      <div className="mo-menu-info">
        <div className="mo-menu-name">
          {item.name}
          {item.addons?.length > 0 && <i className="fas fa-sliders-h mo-addon-hint" />}
        </div>
        <div className="mo-menu-price">฿{item.price}</div>
      </div>
      <div className="mo-menu-qty">
        {item.addons?.length > 0 ? (
          <>
            {inCart > 0 && <span className="mo-qty-badge">{inCart}</span>}
            <button className="mo-add-btn" onClick={() => setAddonPopup({ item, selectedAddons: [] })}>
              <i className="fas fa-plus" />
            </button>
          </>
        ) : (
          <>
            {inCart > 0 ? (
              <>
                <button className="mo-qty-btn" onClick={() => changeQty(item.id + '|', -1)}>−</button>
                <span className="mo-qty-num">{inCart}</span>
                <button className="mo-qty-btn mo-qty-add" onClick={() => addToCart(item, [])}>+</button>
              </>
            ) : (
              <button className="mo-add-btn" onClick={() => addToCart(item, [])}>
                <i className="fas fa-plus" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function MemberOrderPage({ lineUser, activeOrder, showToast }) {
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState([])
  const [addonPopup, setAddonPopup] = useState(null)
  const [showBill, setShowBill] = useState(false)
  const [billTab, setBillTab] = useState('me')
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(ALL)
  const cartRef = useRef(null)
  const [cartHeight, setCartHeight] = useState(0)
  const [promptPayPhone, setPromptPayPhone] = useState('')
  const [showPaySheet, setShowPaySheet] = useState(false)
  const [payForAll, setPayForAll] = useState(false)
  const [showGroupSelect, setShowGroupSelect] = useState(false)
  const [groupPayUids, setGroupPayUids] = useState(new Set())
  const [payGroupMembers, setPayGroupMembers] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'menuItems'), orderBy('category'), orderBy('name'))
    const unsub = onSnapshot(q,
      snap => setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.available !== false)),
      () => onSnapshot(collection(db, 'menuItems'), snap =>
        setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.available !== false)))
    )
    return unsub
  }, [])

  useEffect(() => {
    getDoc(doc(db, 'settings', 'payment')).then(snap => {
      if (snap.exists()) setPromptPayPhone(snap.data().promptPayPhone || '')
    })
  }, [])

  // Track cart panel height so menu scroll area can pad correctly
  useEffect(() => {
    if (!cartRef.current) { setCartHeight(0); return }
    const obs = new ResizeObserver(entries => {
      setCartHeight(entries[0]?.contentRect.height || 0)
    })
    obs.observe(cartRef.current)
    return () => obs.disconnect()
  }, [cart.length])

  const categories = [ALL, ...Array.from(new Set(menuItems.map(m => m.category))).sort()]

  const filtered = menuItems.filter(item => {
    const matchCat = activeCategory === ALL || item.category === activeCategory
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const groupedMenu = filtered.reduce((g, item) => {
    const cat = item.category || 'อื่นๆ'
    if (!g[cat]) g[cat] = []
    g[cat].push(item)
    return g
  }, {})

  const addToCart = (menuItem, selectedAddons = []) => {
    const addonTotal = selectedAddons.reduce((s, a) => s + (a.price || 0), 0)
    const totalPrice = (menuItem.price || 0) + addonTotal
    const key = menuItem.id + '|' + selectedAddons.map(a => a.name).sort().join(',')
    setCart(prev => {
      const idx = prev.findIndex(x => x.key === key)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 }
        return updated
      }
      return [...prev, { key, menuId: menuItem.id, name: menuItem.name, addons: selectedAddons, totalPrice, qty: 1 }]
    })
  }

  const changeQty = (key, delta) => {
    setCart(prev => {
      const idx = prev.findIndex(x => x.key === key)
      if (idx < 0) return prev
      const newQty = prev[idx].qty + delta
      if (newQty <= 0) return prev.filter(x => x.key !== key)
      const updated = [...prev]
      updated[idx] = { ...updated[idx], qty: newQty }
      return updated
    })
  }

  const cartTotal = cart.reduce((s, x) => s + x.totalPrice * x.qty, 0)
  const cartCount = cart.reduce((s, x) => s + x.qty, 0)

  const submitCart = async () => {
    if (cart.length === 0) return
    setSubmitting(true)
    try {
      const items = cart.map(x => ({
        menuId: x.menuId, name: x.name, addons: x.addons,
        totalPrice: x.totalPrice, qty: x.qty,
        orderedBy: { uid: lineUser.uid, name: lineUser.name },
        requestedAt: new Date().toISOString(),
      }))
      await updateDoc(doc(db, 'orders', activeOrder.id), {
        memberFoodQueue: arrayUnion(...items),
      })
      setCart([])
      showToast(`ส่งออเดอร์ ${cartCount} รายการแล้ว รอแอดมินยืนยัน`)
    } catch (e) {
      showToast('สั่งไม่สำเร็จ: ' + e.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const me = activeOrder.members?.find(m => m.uid === lineUser.uid)
  const confirmedItems = activeOrder.foodItems || []
  const pendingItems = (activeOrder.memberFoodQueue || []).filter(q => q.orderedBy?.uid === lineUser.uid)
  const otherPending = (activeOrder.memberFoodQueue || []).filter(q => q.orderedBy?.uid !== lineUser.uid)

  // My accepted food (items admin accepted from my queue — reliable uid tracking)
  const memberFoodHistory = activeOrder.memberFoodHistory || []
  const myHistoryItems = memberFoodHistory.filter(f => f.orderedBy?.uid === lineUser.uid)
  const myHistoryTotal = myHistoryItems.reduce((s, f) => s + (f.totalPrice || 0) * (f.qty || 1), 0)

  const myPendingTotal = pendingItems.reduce((s, f) => s + (f.totalPrice || 0) * (f.qty || 1), 0)
  const numMembers = activeOrder.members?.length || 1
  const myDiscount = activeOrder.discount || 0           // per-person group promo
  const myPersonalDiscount = Number(me?.personalDiscount) || 0
  const myPersonalDiscountNote = me?.personalDiscountNote || ''
  const tableTotalDiscount = myDiscount * numMembers
  const myGameFee = Math.round((activeOrder.gameTotal || 0) / numMembers)
  const myTotal = Math.max(0, myHistoryTotal + myPendingTotal + myGameFee - myDiscount - myPersonalDiscount)

  const getGroupMemberBill = (m) => {
    const food = (activeOrder.memberFoodHistory || [])
      .filter(f => f.orderedBy?.uid === m.uid)
      .reduce((s, f) => s + (f.totalPrice || 0) * (f.qty || 1), 0)
    const gameFee = Math.round((activeOrder.gameTotal || 0) / numMembers)
    return Math.max(0, food + gameFee - (activeOrder.discount || 0) - (Number(m.personalDiscount) || 0))
  }
  const groupPayTotal = [...groupPayUids].reduce((s, uid) => {
    const m = (activeOrder.members || []).find(x => x.uid === uid)
    return s + (m ? getGroupMemberBill(m) : 0)
  }, 0)

  const allPendingItems = activeOrder.memberFoodQueue || []
  const tablePendingTotal = allPendingItems.reduce((s, f) => s + (f.totalPrice || 0) * (f.qty || 1), 0)
  const tableConfirmedTotal = confirmedItems.reduce((s, f) => s + (f.price || 0) * (f.qty || 1), 0)
  const tableGameTotal = activeOrder.gameTotal || 0
  const tablePersonalDiscounts = (activeOrder.members || []).reduce((s, m) => s + (Number(m.personalDiscount) || 0), 0)
  const tableTotal = Math.max(0, tableConfirmedTotal + tablePendingTotal + tableGameTotal - tableTotalDiscount - tablePersonalDiscounts)

  return (
    <div id="member-order-page">

      {/* ── Top: session card + history (scrollable summary) ── */}
      <div className="mo-top-section">
        <div className="mo-session-card">
          {(() => {
            const achs = lineUser?.achievements || (lineUser?.achievement ? [lineUser.achievement] : [])
            const tier = ['golden', 'silver', 'bronze'].find(t => achs.includes(t))
            if (!tier) return null
            const labels = { golden: 'Golden Player', silver: 'Silver Player', bronze: 'Bronze Player' }
            return (
              <div className="mo-golden-banner">
                <i className="fas fa-star" /> {labels[tier]}
              </div>
            )
          })()}
          <div className="mo-session-top-row">
            <div className="mo-session-game">
              <i className="fas fa-scroll" /> {activeOrder.scriptTitle || 'ไม่ระบุเกม'}
            </div>
            <button className="mo-bill-btn" onClick={() => setShowBill(true)}>
              <i className="fas fa-receipt" /> บิล
            </button>
          </div>
          <div className="mo-session-meta">
            {activeOrder.dm && <span><i className="fas fa-crown" /> {activeOrder.dm}</span>}
            {activeOrder.room && <span><i className="fas fa-door-open" /> {activeOrder.room}</span>}
            {me?.character && <span><i className="fas fa-user-secret" /> {me.character}</span>}
          </div>
          <div className="mo-members-row">
            {(activeOrder.members || []).map((m, i) => (
              <div key={i} className={`mo-member-chip${m.uid === lineUser.uid ? ' me' : ''}`}>
                <span className="mo-member-name">{m.name.split(' ')[0]}</span>
                {m.character && <span className="mo-member-char">{m.character}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Order status pills */}
        {(confirmedItems.length > 0 || pendingItems.length > 0 || otherPending.length > 0) && (
          <div className="mo-status-row">
            {confirmedItems.length > 0 && (
              <div className="mo-status-pill confirmed">
                <i className="fas fa-check-circle" /> ยืนยันแล้ว {confirmedItems.reduce((s, f) => s + f.qty, 0)} รายการ
              </div>
            )}
            {pendingItems.length > 0 && (
              <div className="mo-status-pill pending">
                <i className="fas fa-clock" /> รอยืนยัน {pendingItems.length} รายการ
              </div>
            )}
            {otherPending.length > 0 && (
              <div className="mo-status-pill other">
                <i className="fas fa-users" /> เพื่อน {otherPending.length} รายการ
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Group pay strip ── */}
      {activeOrder.status !== 'paid' &&
       !activeOrder.memberPayments?.[lineUser.uid]?.verified &&
       !activeOrder.memberPayments?.[lineUser.uid]?.easyslipPending &&
       (activeOrder.members || []).filter(m => m.uid !== lineUser.uid && !activeOrder.memberPayments?.[m.uid]?.verified).length > 0 && (
        <div style={{ margin: '0 16px 12px', borderRadius: 14, border: '1.5px solid var(--border-default)', overflow: 'hidden' }}>
          <button onClick={() => {
            setGroupPayUids(prev => prev.size > 0 ? prev : new Set([lineUser.uid]))
            setShowGroupSelect(v => !v)
          }} style={{
            width: '100%', padding: '13px 16px', background: showGroupSelect ? 'rgba(198,36,25,0.05)' : 'var(--surface-card)',
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', fontFamily: "'Sarabun',sans-serif",
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              <i className="fas fa-object-group" style={{ color: 'var(--crimson-500)' }} /> รวมบิลกับเพื่อน
            </span>
            <i className={`fas fa-chevron-${showGroupSelect ? 'up' : 'down'}`} style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
          </button>

          {showGroupSelect && (
            <div style={{ padding: '0 12px 12px', background: 'var(--surface-card)' }}>
              {(activeOrder.members || [])
                .filter(m => !activeOrder.memberPayments?.[m.uid]?.verified)
                .map(m => {
                  const isSelf = m.uid === lineUser.uid
                  const sel = groupPayUids.has(m.uid)
                  const bill = getGroupMemberBill(m)
                  return (
                    <button key={m.uid} onClick={() => {
                      if (isSelf) return
                      setGroupPayUids(prev => {
                        const s = new Set(prev); s.has(m.uid) ? s.delete(m.uid) : s.add(m.uid); return s
                      })
                    }} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '10px 10px', marginBottom: 6, borderRadius: 10,
                      background: sel ? 'rgba(198,36,25,0.07)' : 'rgba(0,0,0,0.03)',
                      border: `1.5px solid ${sel ? 'var(--crimson-500)' : 'var(--border-default)'}`,
                      cursor: isSelf ? 'default' : 'pointer', fontFamily: "'Sarabun',sans-serif", textAlign: 'left',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={`fas fa-${sel ? 'check-square' : 'square'}`} style={{ color: sel ? 'var(--crimson-500)' : 'var(--border-strong)', fontSize: 14 }} />
                        <span style={{ fontSize: 14, fontWeight: sel ? 700 : 400, color: 'var(--text-primary)' }}>
                          {m.name.split(' ')[0]}{isSelf ? ' (ฉัน)' : ''}
                        </span>
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: sel ? 'var(--crimson-500)' : 'var(--text-secondary)' }}>฿{bill.toLocaleString()}</span>
                    </button>
                  )
                })}
              {groupPayUids.size >= 2 && (
                <div style={{ background: 'rgba(198,36,25,0.06)', border: '1px solid rgba(198,36,25,0.2)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>รวม {groupPayUids.size} คน</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--crimson-500)' }}>฿{groupPayTotal.toLocaleString()}</span>
                </div>
              )}
              <button disabled={groupPayUids.size < 2} onClick={() => {
                const members = (activeOrder.members || []).filter(m => groupPayUids.has(m.uid))
                setPayGroupMembers(members)
                setShowGroupSelect(false)
                setPayForAll(false)
                setShowPaySheet(true)
              }} style={{
                width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                background: groupPayUids.size >= 2 ? 'var(--crimson-500)' : 'var(--border-default)',
                color: '#fff', cursor: groupPayUids.size >= 2 ? 'pointer' : 'default',
                fontSize: 14, fontWeight: 700, fontFamily: "'Sarabun',sans-serif",
              }}>
                <i className="fas fa-qrcode" /> {groupPayUids.size >= 2 ? `จ่ายรวม ฿${groupPayTotal.toLocaleString()}` : 'เลือกอย่างน้อย 2 คน'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Sticky: search + category filter ── */}
      <div className="mo-search-sticky">
        <div className="mo-search-input-wrap">
          <i className="fas fa-search mo-search-icon" />
          <input
            className="mo-search-input"
            type="text"
            placeholder="ค้นหาเมนู..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="mo-search-clear" onClick={() => setSearch('')}>
              <i className="fas fa-times" />
            </button>
          )}
        </div>
        <div className="mo-cat-chips">
          {categories.map(cat => (
            <button
              key={cat}
              className={`mo-cat-chip${activeCategory === cat ? ' active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Menu scroll area ── */}
      <div className="mo-menu-scroll" style={{ paddingBottom: cart.length > 0 ? cartHeight + 16 : 16 }}>
        {filtered.length === 0 && (
          <div className="mo-empty">
            <i className="fas fa-search" />
            <span>ไม่พบเมนู "{search}"</span>
          </div>
        )}

        {activeCategory === ALL ? (
          /* flat list — no category labels */
          <div className="mo-menu-group">
            {filtered.map(item => <MenuRow key={item.id} item={item} cart={cart} changeQty={changeQty} addToCart={addToCart} setAddonPopup={setAddonPopup} />)}
          </div>
        ) : (
          /* grouped by category */
          Object.entries(groupedMenu).map(([cat, items]) => (
            <div key={cat} className="mo-menu-group">
              <div className="mo-menu-cat">{cat}</div>
              {items.map(item => <MenuRow key={item.id} item={item} cart={cart} changeQty={changeQty} addToCart={addToCart} setAddonPopup={setAddonPopup} />)}
            </div>
          ))
        )}
      </div>

      {/* ── Sticky cart panel ── */}
      {cart.length > 0 && (
        <div className="mo-cart-panel" ref={cartRef}>
          <div className="mo-cart-header">
            <span className="mo-cart-label"><i className="fas fa-shopping-cart" /> ตะกร้า</span>
            <span className="mo-cart-count">{cartCount} รายการ</span>
          </div>
          <div className="mo-cart-items">
            {cart.map(x => (
              <div key={x.key} className="mo-cart-row">
                <div className="mo-cart-row-left">
                  <span className="mo-cart-name">{x.name}</span>
                  {x.addons?.length > 0 && <span className="mo-cart-addons">{x.addons.map(a => a.name).join(', ')}</span>}
                </div>
                <div className="mo-cart-row-right">
                  <button className="mo-qty-btn" onClick={() => changeQty(x.key, -1)}>−</button>
                  <span className="mo-qty-num">{x.qty}</span>
                  <button className="mo-qty-btn mo-qty-add" onClick={() => changeQty(x.key, 1)}>+</button>
                  <span className="mo-cart-price">฿{(x.totalPrice * x.qty).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mo-cart-footer">
            <span className="mo-cart-total-label">รวม <strong>฿{cartTotal.toLocaleString()}</strong></span>
            <button className="mo-submit-btn" onClick={submitCart} disabled={submitting}>
              {submitting
                ? <><i className="fas fa-spinner fa-spin" /> กำลังส่ง...</>
                : <><i className="fas fa-paper-plane" /> ยืนยันการสั่ง</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Bill sheet ── */}
      {showBill && (
        <div className="mo-bill-backdrop" onClick={e => e.target === e.currentTarget && setShowBill(false)}>
          <div className="mo-bill-sheet">
            <div className="mo-bill-handle" />
            <div className="mo-bill-header">
              <span className="mo-bill-title"><i className="fas fa-receipt" /> บิลตี้</span>
              <button className="modal-close" onClick={() => setShowBill(false)}><i className="fas fa-times" /></button>
            </div>

            {/* Tab switcher */}
            <div className="mo-bill-tabs">
              <button className={`mo-bill-tab${billTab === 'me' ? ' active' : ''}`} onClick={() => setBillTab('me')}>
                <i className="fas fa-user" /> ของฉัน
              </button>
              <button className={`mo-bill-tab${billTab === 'table' ? ' active' : ''}`} onClick={() => setBillTab('table')}>
                <i className="fas fa-users" /> ทั้งตี้
              </button>
            </div>

            {billTab === 'me' ? (
              <>
                {myHistoryItems.length > 0 && (
                  <>
                    <div className="mo-bill-section"><span className="mo-bill-section-label"><i className="fas fa-check-circle" style={{ color: 'var(--feedback-success-text)' }} /> ยืนยันแล้ว</span></div>
                    {myHistoryItems.map((item, i) => (
                      <div key={i} className="mo-bill-row">
                        <span className="mo-bill-row-name">{item.name}{item.addons?.length > 0 ? ` (${item.addons.map(a => a.name).join(', ')})` : ''} ×{item.qty}</span>
                        <span className="mo-bill-row-price">฿{((item.totalPrice || 0) * (item.qty || 1)).toLocaleString()}</span>
                      </div>
                    ))}
                  </>
                )}
                {pendingItems.length > 0 && (
                  <>
                    <div className="mo-bill-section"><span className="mo-bill-section-label"><i className="fas fa-clock" style={{ color: 'var(--feedback-warning-text)' }} /> รอยืนยัน</span></div>
                    {pendingItems.map((item, i) => (
                      <div key={i} className="mo-bill-row pending">
                        <span className="mo-bill-row-name">{item.name}{item.addons?.length > 0 ? ` (${item.addons.map(a => a.name).join(', ')})` : ''} ×{item.qty}</span>
                        <span className="mo-bill-row-price">฿{((item.totalPrice || 0) * (item.qty || 1)).toLocaleString()}</span>
                      </div>
                    ))}
                  </>
                )}
                {myHistoryItems.length === 0 && pendingItems.length === 0 && (
                  <div className="mo-bill-empty">ยังไม่มีรายการอาหาร</div>
                )}
                <div className="mo-bill-divider" />
                <div className="mo-bill-row game">
                  <span className="mo-bill-row-name">
                    <i className="fas fa-scroll" style={{ marginRight: 5 }} />{activeOrder.scriptTitle || 'ค่าเกม'}
                    {numMembers > 1 && <span className="mo-bill-sub"> · หาร {numMembers} คน</span>}
                  </span>
                  <span className="mo-bill-row-price">฿{myGameFee.toLocaleString()}</span>
                </div>
                {myDiscount > 0 && (
                  <div className="mo-bill-row" style={{ color: 'var(--feedback-success-icon)' }}>
                    <span className="mo-bill-row-name"><i className="fas fa-tag" style={{ marginRight: 5 }} />{activeOrder.promoName || 'ส่วนลด'}{numMembers > 1 && <span className="mo-bill-sub"> · หาร {numMembers} คน</span>}</span>
                    <span className="mo-bill-row-price" style={{ color: 'var(--feedback-success-icon)' }}>−฿{myDiscount.toLocaleString()}</span>
                  </div>
                )}
                {myPersonalDiscount > 0 && (
                  <div className="mo-bill-row" style={{ color: 'var(--feedback-success-icon)' }}>
                    <span className="mo-bill-row-name"><i className="fas fa-user-tag" style={{ marginRight: 5 }} />{myPersonalDiscountNote || 'ส่วนลดพิเศษ'}</span>
                    <span className="mo-bill-row-price" style={{ color: 'var(--feedback-success-icon)' }}>−฿{myPersonalDiscount.toLocaleString()}</span>
                  </div>
                )}
                <div className="mo-bill-divider" />
                <div className="mo-bill-total-row">
                  <span>{myPendingTotal > 0 ? 'รวมของฉัน (ประมาณ)' : 'รวมของฉัน'}</span>
                  <span className="mo-bill-grand-total">฿{myTotal.toLocaleString()}</span>
                </div>
                {myPendingTotal > 0 && <div className="mo-bill-note">* รวมรายการรอยืนยัน ยอดจริงอาจเปลี่ยนแปลง</div>}

                {/* ── Pay button / status ── */}
                {(() => {
                  const p = activeOrder.memberPayments?.[lineUser.uid]
                  if (activeOrder.status === 'paid') return <div className="mo-pay-status paid"><i className="fas fa-check-circle" /> ตี้ปิดแล้ว</div>
                  if (p?.verified) return <div className="mo-pay-status paid"><i className="fas fa-check-circle" /> ชำระแล้ว ฿{(p.amount || 0).toLocaleString()}{p.bankName && <span className="mo-pay-meta"> · {p.bankName}</span>}</div>
                  if (p?.easyslipPending) return <div className="mo-pay-status pending-review" style={{ color: 'var(--feedback-info-icon)' }}><i className="fas fa-hourglass-half" /> รอ Bangkok Bank ยืนยัน — ระบบจะอัปเดตอัตโนมัติ</div>
                  if (p?.pendingAdminReview) return <div className="mo-pay-status pending-review"><i className="fas fa-clock" /> ส่งสลิปแล้ว — EasySlip ตรวจสอบไม่สำเร็จ รอแอดมิน<button className="mo-pay-reupload-btn" onClick={() => { setShowBill(false); setPayForAll(false); setShowPaySheet(true) }}><i className="fas fa-upload" /> ลองใหม่</button></div>
                  return <button className="mo-pay-cta-btn" onClick={() => { setShowBill(false); setPayForAll(false); setShowPaySheet(true) }}><i className="fas fa-qrcode" /> จ่ายของฉัน ฿{myTotal.toLocaleString()}</button>
                })()}
              </>
            ) : (
              <>
                {confirmedItems.length > 0 && (
                  <>
                    <div className="mo-bill-section"><span className="mo-bill-section-label"><i className="fas fa-check-circle" style={{ color: 'var(--feedback-success-text)' }} /> ยืนยันแล้ว</span></div>
                    {confirmedItems.map((item, i) => (
                      <div key={i} className="mo-bill-row">
                        <span className="mo-bill-row-name">
                          {item.name}{item.addons?.length > 0 ? ` (${item.addons.map(a => a.name).join(', ')})` : ''} ×{item.qty}
                          {item.orderedBy?.name && <span className="mo-bill-sub"> · {item.orderedBy.name.split(' ')[0]}</span>}
                        </span>
                        <span className="mo-bill-row-price">฿{((item.price || 0) * (item.qty || 1)).toLocaleString()}</span>
                      </div>
                    ))}
                  </>
                )}
                {allPendingItems.length > 0 && (
                  <>
                    <div className="mo-bill-section"><span className="mo-bill-section-label"><i className="fas fa-clock" style={{ color: 'var(--feedback-warning-text)' }} /> รอยืนยัน</span></div>
                    {allPendingItems.map((item, i) => (
                      <div key={i} className="mo-bill-row pending">
                        <span className="mo-bill-row-name">
                          {item.name}{item.addons?.length > 0 ? ` (${item.addons.map(a => a.name).join(', ')})` : ''} ×{item.qty}
                          {item.orderedBy?.name && <span className="mo-bill-sub"> · {item.orderedBy.name.split(' ')[0]}</span>}
                        </span>
                        <span className="mo-bill-row-price">฿{((item.totalPrice || 0) * (item.qty || 1)).toLocaleString()}</span>
                      </div>
                    ))}
                  </>
                )}
                {confirmedItems.length === 0 && allPendingItems.length === 0 && (
                  <div className="mo-bill-empty">ยังไม่มีรายการอาหาร</div>
                )}
                <div className="mo-bill-divider" />
                <div className="mo-bill-row game">
                  <span className="mo-bill-row-name">
                    <i className="fas fa-scroll" style={{ marginRight: 5 }} />{activeOrder.scriptTitle || 'ค่าเกม'}
                    {numMembers > 0 && <span className="mo-bill-sub"> · {numMembers} คน</span>}
                  </span>
                  <span className="mo-bill-row-price">฿{tableGameTotal.toLocaleString()}</span>
                </div>
                {tableTotalDiscount > 0 && (
                  <div className="mo-bill-row" style={{ color: 'var(--feedback-success-icon)' }}>
                    <span className="mo-bill-row-name"><i className="fas fa-tag" style={{ marginRight: 5 }} />{activeOrder.promoName || 'ส่วนลด'}{numMembers > 1 && <span className="mo-bill-sub"> · ฿{myDiscount}×{numMembers}คน</span>}</span>
                    <span className="mo-bill-row-price" style={{ color: 'var(--feedback-success-icon)' }}>−฿{tableTotalDiscount.toLocaleString()}</span>
                  </div>
                )}
                {(activeOrder.members || []).filter(m => Number(m.personalDiscount) > 0).map((m, i) => (
                  <div key={i} className="mo-bill-row" style={{ color: 'var(--feedback-success-icon)' }}>
                    <span className="mo-bill-row-name">
                      <i className="fas fa-user-tag" style={{ marginRight: 5 }} />
                      {m.name.split(' ')[0]}{m.personalDiscountNote ? ` · ${m.personalDiscountNote}` : ''}
                    </span>
                    <span className="mo-bill-row-price" style={{ color: 'var(--feedback-success-icon)' }}>−฿{Number(m.personalDiscount).toLocaleString()}</span>
                  </div>
                ))}
                <div className="mo-bill-divider" />
                <div className="mo-bill-total-row">
                  <span>{tablePendingTotal > 0 ? 'รวมทั้งตี้ (ประมาณ)' : 'รวมทั้งตี้'}</span>
                  <span className="mo-bill-grand-total">฿{tableTotal.toLocaleString()}</span>
                </div>
                {tablePendingTotal > 0 && <div className="mo-bill-note">* รวมรายการรอยืนยัน ยอดจริงอาจเปลี่ยนแปลง</div>}
                {activeOrder.status !== 'paid' && (
                  <button className="mo-pay-cta-btn" style={{ margin: '10px 16px 4px' }} onClick={() => { setShowBill(false); setPayForAll(true); setShowPaySheet(true) }}>
                    <i className="fas fa-qrcode" /> จ่ายทั้งตี้ ฿{tableTotal.toLocaleString()}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Payment sheet ── */}
      {showPaySheet && (
        <PaymentSheet
          amount={payForAll ? tableTotal : payGroupMembers.length >= 2 ? groupPayTotal : myTotal}
          forAll={payForAll}
          forGroup={!payForAll && payGroupMembers.length >= 2}
          groupMembers={payGroupMembers}
          orderId={activeOrder.id}
          lineUser={lineUser}
          allMembers={activeOrder.members || []}
          promptPayPhone={promptPayPhone}
          memberPayments={activeOrder.memberPayments || {}}
          paidItems={payForAll ? (activeOrder.foodItems || []) : myHistoryItems}
          onClose={() => { setShowPaySheet(false); setPayGroupMembers([]) }}
          showToast={showToast}
          scriptTitle={activeOrder.scriptTitle || ''}
          room={activeOrder.room || ''}
          numMembers={activeOrder.members?.length || 1}
          createdAt={activeOrder.createdAt}
          myGameFee={myGameFee}
          getGroupMemberBill={getGroupMemberBill}
        />
      )}

      {/* ── Addon popup ── */}
      {addonPopup && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setAddonPopup(null)}>
          <div className="pos-addon-modal">
            <div className="pos-addon-header">
              <div className="pos-addon-title">
                <i className="fas fa-utensils" /> {addonPopup.item.name}
                <span className="pos-addon-base-price">฿{addonPopup.item.price}</span>
              </div>
              <button className="modal-close" onClick={() => setAddonPopup(null)}><i className="fas fa-times" /></button>
            </div>
            <div className="pos-addon-label">เลือก Add-on</div>
            <div className="pos-addon-chips">
              {addonPopup.item.addons.map((a, i) => {
                const selected = addonPopup.selectedAddons.some(s => s.name === a.name)
                return (
                  <button
                    key={i}
                    className={`pos-addon-chip${selected ? ' selected' : ''}`}
                    onClick={() => setAddonPopup(p => ({
                      ...p,
                      selectedAddons: selected
                        ? p.selectedAddons.filter(s => s.name !== a.name)
                        : [...p.selectedAddons, a]
                    }))}
                  >
                    {a.name}{(a.price || 0) > 0 ? ` +฿${a.price}` : ''}
                    {selected && <i className="fas fa-check" style={{ marginLeft: 4 }} />}
                  </button>
                )
              })}
            </div>
            <div className="pos-addon-footer">
              <div className="pos-addon-total-label">ราคารวม</div>
              <div className="pos-addon-total-price">
                ฿{((addonPopup.item.price || 0) + addonPopup.selectedAddons.reduce((s, a) => s + (a.price || 0), 0)).toLocaleString()}
              </div>
              <button className="pos-confirm-btn" style={{ marginTop: 8 }} onClick={() => {
                addToCart(addonPopup.item, addonPopup.selectedAddons)
                setAddonPopup(null)
              }}>
                <i className="fas fa-plus" /> เพิ่มลงตะกร้า
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
