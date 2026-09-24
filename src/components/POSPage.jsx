import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import {
  doc, getDoc, collection, onSnapshot,
  addDoc, updateDoc, arrayUnion, serverTimestamp, query, orderBy, where, runTransaction
} from 'firebase/firestore'
import { Html5Qrcode } from 'html5-qrcode'
import QRScanner from './QRScanner'
import PaymentModal from './PaymentModal'

// ── Admin slip verifier (camera scan QR → EasySlip v2) ──────────────────────
function SlipVerifyModal({ member, payment, orderId, easySlipApiKey, showToast, onClose, onVerified }) {
  const [scanning, setScanning] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [manualVerifying, setManualVerifying] = useState(false)
  const [result, setResult] = useState(null)
  const scannerRef = useRef(null)
  const startedRef = useRef(false)

  useEffect(() => () => {
    if (scannerRef.current) scannerRef.current.stop().catch(() => {})
  }, [])

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setScanning(false)
  }

  const verifyPayload = async (payload) => {
    if (!easySlipApiKey) { setResult({ ok: false, msg: 'ยังไม่ได้ตั้งค่า EasySlip API Key' }); return }
    setVerifying(true)
    try {
      const body = { payload }
      if (payment?.amount) body.matchAmount = payment.amount
      const res = await fetch('https://api.easyslip.com/v2/verify/bank', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${easySlipApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) {
        const slip = json.data?.rawSlip || {}
        await updateDoc(doc(db, 'orders', orderId), {
          [`memberPayments.${member.uid}.verified`]: true,
          [`memberPayments.${member.uid}.pendingAdminReview`]: false,
          [`memberPayments.${member.uid}.verifiedAt`]: new Date().toISOString(),
          [`memberPayments.${member.uid}.transRef`]: slip.transRef || '',
          [`memberPayments.${member.uid}.bank`]: slip.sender?.bank?.short || '',
        })
        setResult({ ok: true, msg: `ยืนยันสำเร็จ ✓${slip.sender?.bank?.name ? ' ธนาคาร: ' + slip.sender.bank.name : ''}${slip.transRef ? '  Ref: ' + slip.transRef : ''}` })
        showToast(`${member.name} จ่ายแล้ว ✓`)
        onVerified(member.uid)
      } else {
        const code = json.code || json.message || 'UNKNOWN'
        const msgs = {
          SLIP_NOT_FOUND: 'ไม่พบสลิปใน EasySlip — ลองสแกนอีกครั้ง',
          INVALID_API_KEY: 'API Key ไม่ถูกต้อง',
          IP_NOT_ALLOWED: 'IP ไม่ได้รับอนุญาต — ตั้งค่า Whitelist ใน EasySlip Dashboard',
          BRANCH_INACTIVE: 'บัญชี EasySlip ไม่ Active',
          QUOTA_EXCEEDED: 'Quota EasySlip หมดแล้ว',
          AMOUNT_MISMATCH: `ยอดเงินไม่ตรง (ควรเป็น ฿${payment?.amount || '?'})`,
          VALIDATION_ERROR: 'ข้อมูล QR ไม่ถูกต้อง',
        }
        setResult({ ok: false, msg: msgs[code] || `EasySlip: ${code}` })
      }
    } catch (e) {
      setResult({ ok: false, msg: 'เชื่อมต่อ EasySlip ล้มเหลว: ' + (e.message || e) })
    } finally {
      setVerifying(false)
    }
  }

  const manualVerify = async () => {
    if (!window.confirm(`ยืนยันสลิปของ ${member.name} ด้วยตนเอง?`)) return
    setManualVerifying(true)
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        [`memberPayments.${member.uid}.verified`]: true,
        [`memberPayments.${member.uid}.pendingAdminReview`]: false,
        [`memberPayments.${member.uid}.verifiedAt`]: new Date().toISOString(),
        [`memberPayments.${member.uid}.manualVerify`]: true,
      })
      setResult({ ok: true, msg: 'ยืนยันสลิปด้วยตนเองสำเร็จ ✓' })
      showToast(`${member.name} จ่ายแล้ว ✓`)
      onVerified(member.uid)
    } catch (e) {
      setResult({ ok: false, msg: 'เกิดข้อผิดพลาด: ' + e.message })
    } finally {
      setManualVerifying(false)
    }
  }

  const startScanner = async () => {
    setScanning(true)
    setResult(null)
    startedRef.current = false
    await new Promise(r => setTimeout(r, 50)) // let DOM mount
    const scanner = new Html5Qrcode('slip-verify-qr-reader')
    scannerRef.current = scanner
    const cameraConfig = /Mobi|Android/i.test(navigator.userAgent)
      ? { facingMode: 'environment' }
      : { facingMode: 'user' }
    scanner.start(
      cameraConfig,
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (payload) => {
        if (startedRef.current) return
        startedRef.current = true
        await stopScanner()
        verifyPayload(payload)
      },
      () => {}
    ).catch(e => {
      setResult({ ok: false, msg: 'ไม่สามารถเข้าถึงกล้อง: ' + e.message })
      setScanning(false)
    })
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { stopScanner(); onClose() } }}>
      <div className="slip-verify-modal">
        <div className="slip-verify-header">
          <span><i className="fas fa-shield-alt" /> ตรวจสลิป — {member.name}</span>
          <button className="modal-close" onClick={() => { stopScanner(); onClose() }}><i className="fas fa-times" /></button>
        </div>

        {payment?.amount && (
          <div className="slip-verify-amount">ยอดที่ควรโอน: <strong>฿{Number(payment.amount).toLocaleString()}</strong></div>
        )}

        {payment?.slipUrl && (
          <div className="slip-verify-img-wrap">
            <img src={payment.slipUrl} alt="สลิป" className="slip-verify-img" />
            <a href={payment.slipUrl} target="_blank" rel="noopener noreferrer" className="slip-verify-open-link">
              <i className="fas fa-external-link-alt" /> เปิดเต็มจอ
            </a>
          </div>
        )}

        {scanning && (
          <div className="slip-verify-scanner-wrap">
            <div id="slip-verify-qr-reader" />
            <p className="slip-verify-hint">เล็งกล้องไปที่ QR บนสลิปลูกค้า</p>
            <button className="pos-cancel-btn" style={{ marginTop: 8 }} onClick={stopScanner}>
              <i className="fas fa-times" /> ยกเลิกสแกน
            </button>
          </div>
        )}

        {verifying && (
          <div className="slip-verify-loading">
            <i className="fas fa-spinner fa-spin" /> กำลังตรวจสอบกับ EasySlip...
          </div>
        )}

        {result && (
          <div className={`slip-verify-result ${result.ok ? 'ok' : 'err'}`}>
            <i className={`fas fa-${result.ok ? 'check-circle' : 'exclamation-circle'}`} /> {result.msg}
          </div>
        )}

        <div className="slip-verify-actions">
          {!scanning && !verifying && !manualVerifying && !result?.ok && (
            <>
              <button className="pos-pay-btn" style={{ flex: 1 }} onClick={startScanner}>
                <i className="fas fa-camera" /> สแกน QR
              </button>
              {payment?.slipUrl && (
                <button className="pos-confirm-btn" style={{ flex: 1 }} onClick={manualVerify}>
                  <i className="fas fa-check-circle" /> ยืนยันสลิป
                </button>
              )}
            </>
          )}
          {manualVerifying && (
            <div className="slip-verify-loading">
              <i className="fas fa-spinner fa-spin" /> กำลังบันทึก...
            </div>
          )}
          {result?.ok ? (
            <button className="pos-confirm-btn" style={{ flex: 1 }} onClick={() => { stopScanner(); onClose() }}>
              <i className="fas fa-check" /> ปิด
            </button>
          ) : (
            <button className="pos-cancel-btn" style={{ flex: 1 }} onClick={() => { stopScanner(); onClose() }}>ปิด</button>
          )}
        </div>
      </div>
    </div>
  )
}

const ROOMS = ['1st Floor', 'Japan Room', 'China Room']

let sessionCounter = 1
const fmtDate = (d = new Date()) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`

export const newPOSSession = () => ({
  id: Date.now() + Math.random(),
  label: `ปาร์ตี้ ${sessionCounter++}`,
  createdAt: new Date().toISOString(),
  members: [],
  scriptId: '',
  dm: '',
  npc: '',
  room: '',
  order: [],
  confirmedOrderId: null,
  promoName: '',
  discount: 0,
})

export default function POSPage({
  initialUid, adminUser, allGames, showToast, onClose,
  sessions, activeId,
  onSessionsChange, onActiveIdChange, onScanConsumed,
}) {
  const [menuItems, setMenuItems] = useState([])
  const [adminMembers, setAdminMembers] = useState([])
  const [todayOrders, setTodayOrders] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [easySlipApiKey, setEasySlipApiKey] = useState('')
  const [slipVerifyMember, setSlipVerifyMember] = useState(null)

  const setSessions = onSessionsChange
  const setActiveId = onActiveIdChange

  // initialise with 1 session if empty
  useEffect(() => {
    if (sessions.length === 0) {
      const s = newPOSSession()
      setSessions([s])
      setActiveId(s.id)
    } else if (!activeId || !sessions.find(s => s.id === activeId)) {
      setActiveId(sessions[sessions.length - 1].id)
    }
  }, [])

  const activeSession = sessions.find(s => s.id === activeId) || sessions[0]

  const updateSession = (id, patch) =>
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))

  const updateActive = (patch) => updateSession(activeId || sessions[0]?.id, patch)

  // ── load initialUid into active session once ──────────────────────
  const handledUid = useState(null)
  useEffect(() => {
    if (initialUid && initialUid !== handledUid[0] && (activeSession || sessions[0])) {
      handledUid[1](initialUid)
      fetchAndAddMember(activeId || sessions[0]?.id, initialUid)
      onScanConsumed?.()
    }
  }, [initialUid, activeId])

  // ── load EasySlip API key ────────────────────────────────────────
  useEffect(() => {
    getDoc(doc(db, 'settings', 'payment'))
      .then(snap => { if (snap.exists()) setEasySlipApiKey(snap.data().easySlipApiKey || '') })
      .catch(() => {})
  }, [])

  // ── load menu ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'menuItems'), orderBy('category'), orderBy('name'))
    const unsub = onSnapshot(q,
      snap => setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {
        onSnapshot(collection(db, 'menuItems'), snap => setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      }
    )
    return unsub
  }, [])

  // ── load admin members ───────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'members'), where('role', '==', 'admin'))
    return onSnapshot(q, snap => setAdminMembers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  // ── load today orders (client-side filter) ───────────────────────
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      setTodayOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.createdAt?.toDate?.() >= start))
    }, () => {})
  }, [])

  // ── fetch member and add to a session ───────────────────────────
  const fetchAndAddMember = async (sessionId, uid) => {
    const session = sessions.find(s => s.id === sessionId) || activeSession
    if (session.members.find(m => m.uid === uid)) {
      showToast('สมาชิกคนนี้อยู่ในปาร์ตี้นี้แล้ว', 'error'); return
    }
    try {
      const snap = await getDoc(doc(db, 'members', uid))
      if (!snap.exists()) { showToast('ไม่พบสมาชิก', 'error'); return }
      const d = snap.data()
      updateSession(sessionId, {
        members: [...session.members, {
          uid,
          name: d.nickname || d.firstname || d.name || 'ไม่ระบุ',
          avatar: d.pictureUrl || '',
          character: '',
          scanInAt: new Date().toISOString(),
        }]
      })
    } catch { showToast('โหลดข้อมูลล้มเหลว', 'error') }
  }

  const [addonPopup, setAddonPopup] = useState(null)
  const [editingBillKey, setEditingBillKey] = useState(null)
  const [showPayment, setShowPayment] = useState(false)
  const [groupPayMode, setGroupPayMode] = useState(false)
  const [groupPaySelected, setGroupPaySelected] = useState(new Set())
  const [groupPaySaving, setGroupPaySaving] = useState(false)
  const [memberQueue, setMemberQueue] = useState([])
  const [memberPayments, setMemberPayments] = useState({})
  const [showQueue, setShowQueue] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const [menuCategory, setMenuCategory] = useState('ทั้งหมด')
  const [showPaidMembers, setShowPaidMembers] = useState(false)
  const [showEndingModal, setShowEndingModal] = useState(false)
  const [selectedEnding, setSelectedEnding] = useState('')
  const autoClosedRef = useRef(new Set())

  useEffect(() => {
    setShowQueue(false)
    setShowPaidMembers(false)
  }, [activeId])

  // Listen for member food requests and payments on the confirmed order
  useEffect(() => {
    const orderId = activeSession?.confirmedOrderId
    if (!orderId) { setMemberQueue([]); setMemberPayments({}); return }
    return onSnapshot(doc(db, 'orders', orderId), snap => {
      const data = snap.data() || {}
      setMemberQueue(data.memberFoodQueue || [])
      setMemberPayments(data.memberPayments || {})
    }, () => {})
  }, [activeSession?.confirmedOrderId])

  // Accept all queued items into in-memory order and sync Firestore immediately
  const acceptQueue = async () => {
    const orderId = activeSession?.confirmedOrderId
    if (!orderId || memberQueue.length === 0) return
    const cur = activeSession.order || []
    const updated = [...cur]
    for (const qi of memberQueue) {
      const key = qi.menuId + '|' + (qi.addons || []).map(a => a.name).sort().join(',') + '|' + (qi.orderedBy?.uid || '')
      const idx = updated.findIndex(x => x.key === key)
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + qi.qty }
      } else {
        updated.push({ key, menuId: qi.menuId, name: qi.name, basePrice: qi.totalPrice, addons: qi.addons || [], totalPrice: qi.totalPrice, qty: qi.qty, orderedBy: qi.orderedBy || null })
      }
    }
    updateActive({ order: updated })
    const newFoodTotal = updated.reduce((s, x) => s + (x.totalPrice || 0) * x.qty, 0)
    const newGamePrice = activeSession.members.length * (selectedGame ? (selectedGame.payPrice ?? selectedGame.price ?? 0) : 0)
    const d = Number(activeSession.discount) || 0
    await updateDoc(doc(db, 'orders', orderId), {
      memberFoodQueue: [],
      memberFoodHistory: arrayUnion(...memberQueue),
      foodItems: updated.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy || null })),
      foodTotal: newFoodTotal,
      gameTotal: newGamePrice,
      discount: d,
      promoName: activeSession.promoName || '',
      grandTotal: Math.max(0, newFoodTotal + newGamePrice - d * activeSession.members.length),
    })
    setShowQueue(false)
    showToast(`รับ ${memberQueue.length} รายการจากลูกค้าแล้ว ✓`)
  }

  const handleScan = (uid) => {
    setScannerOpen(false)
    fetchAndAddMember(activeId, uid)
  }

  const setCharacter = (uid, val) =>
    updateActive({ members: activeSession.members.map(m => m.uid === uid ? { ...m, character: val } : m) })

  const setPersonalDiscount = (uid, val) =>
    updateActive({ members: activeSession.members.map(m => m.uid === uid ? { ...m, personalDiscount: Number(val) || 0 } : m) })

  const setPersonalDiscountNote = (uid, val) =>
    updateActive({ members: activeSession.members.map(m => m.uid === uid ? { ...m, personalDiscountNote: val } : m) })

  const syncMembersDiscount = async () => {
    const orderId = activeSession.confirmedOrderId
    if (!orderId) return
    const membersPayload = activeSession.members.map(m => ({
      uid: m.uid, name: m.name, character: m.character || '',
      avatar: m.avatar || '', scanInAt: m.scanInAt || null,
      personalDiscount: Number(m.personalDiscount) || 0,
      personalDiscountNote: m.personalDiscountNote || '',
    }))
    const totalPersonalDisc = membersPayload.reduce((s, m) => s + m.personalDiscount, 0)
    await updateDoc(doc(db, 'orders', orderId), {
      members: membersPayload,
      grandTotal: Math.max(0, foodTotal + gamePrice - totalDiscount - totalPersonalDisc),
    })
    showToast('อัปเดตส่วนลดรายบุคคลแล้ว ✓')
  }

  const removeMember = (uid) =>
    updateActive({ members: activeSession.members.filter(m => m.uid !== uid) })

  // order is now array: [{ key, menuId, name, basePrice, addons, totalPrice, qty }]
  const addItem = (menuItem) => {
    if (menuItem.addons?.length > 0) {
      setAddonPopup({ item: menuItem, selectedAddons: [] })
    } else {
      commitAddItem(menuItem, [])
    }
  }

  const commitAddItem = (menuItem, selectedAddons) => {
    const addonTotal = selectedAddons.reduce((s, a) => s + (a.price || 0), 0)
    const totalPrice = (menuItem.price || 0) + addonTotal
    const key = menuItem.id + '|' + selectedAddons.map(a => a.name).sort().join(',')
    const cur = activeSession.order || []
    const idx = cur.findIndex(x => x.key === key)
    if (idx >= 0) {
      const updated = [...cur]
      updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 }
      updateActive({ order: updated })
    } else {
      updateActive({ order: [...cur, { key, menuId: menuItem.id, name: menuItem.name, basePrice: menuItem.price, addons: selectedAddons, totalPrice, qty: 1 }] })
    }
  }

  const removeItem = (key) => {
    const cur = activeSession.order || []
    const idx = cur.findIndex(x => x.key === key)
    if (idx < 0) return
    if (cur[idx].qty <= 1) {
      updateActive({ order: cur.filter(x => x.key !== key) })
    } else {
      const updated = [...cur]; updated[idx] = { ...updated[idx], qty: updated[idx].qty - 1 }
      updateActive({ order: updated })
    }
  }

  const getMemberBill = (m) => {
    const myFood = orderArr
      .filter(x => x.orderedBy?.uid === m.uid)
      .reduce((s, x) => s + (x.totalPrice || 0) * x.qty, 0)
    const discountPerPerson = Number(activeSession.discount) || 0
    return Math.max(0, gameUnitPay + myFood - (Number(m.personalDiscount) || 0) - discountPerPerson)
  }

  const confirmGroupPayment = async () => {
    const orderId = activeSession.confirmedOrderId
    if (!orderId) { showToast('กรุณายืนยันออเดอร์ก่อน', 'error'); return }
    const selectedUids = [...groupPaySelected]
    if (selectedUids.length < 2) { showToast('เลือกอย่างน้อย 2 คน', 'error'); return }
    const updates = {}
    selectedUids.forEach(uid => {
      const m = activeSession.members.find(x => x.uid === uid)
      if (!m) return
      updates[`memberPayments.${uid}.verified`] = true
      updates[`memberPayments.${uid}.amount`] = getMemberBill(m)
      updates[`memberPayments.${uid}.verifiedAt`] = new Date().toISOString()
      updates[`memberPayments.${uid}.groupPay`] = true
      updates[`memberPayments.${uid}.groupWith`] = selectedUids.filter(x => x !== uid)
      updates[`memberPayments.${uid}.pendingAdminReview`] = false
    })
    setGroupPaySaving(true)
    try {
      await updateDoc(doc(db, 'orders', orderId), updates)
      setGroupPayMode(false)
      setGroupPaySelected(new Set())
      showToast(`รับชำระรวม ${selectedUids.length} คน ✓`)
    } catch (e) { showToast('บันทึกล้มเหลว: ' + e.message, 'error') }
    finally { setGroupPaySaving(false) }
  }

  const assignBillOwner = async (key, member) => {
    const cur = activeSession.order || []
    const updated = cur.map(x => x.key === key ? { ...x, orderedBy: member } : x)
    updateActive({ order: updated })
    setEditingBillKey(null)
    const orderId = activeSession.confirmedOrderId
    if (!orderId) return
    await updateDoc(doc(db, 'orders', orderId), {
      foodItems: updated.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy || null })),
      memberFoodHistory: updated.filter(x => x.orderedBy).map(x => ({ name: x.name, addons: x.addons || [], totalPrice: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy })),
    })
  }

  const voidItem = async (key) => {
    const cur = activeSession.order || []
    const updated = cur.filter(x => x.key !== key)
    updateActive({ order: updated })
    const orderId = activeSession.confirmedOrderId
    if (!orderId) return
    const newFoodTotal = updated.reduce((s, x) => s + (x.totalPrice || 0) * x.qty, 0)
    const newGamePrice = activeSession.members.length * (selectedGame ? (selectedGame.payPrice ?? selectedGame.price ?? 0) : 0)
    const d = Number(activeSession.discount) || 0
    await updateDoc(doc(db, 'orders', orderId), {
      foodItems: updated.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy || null })),
      memberFoodHistory: updated.filter(x => x.orderedBy).map(x => ({ name: x.name, addons: x.addons || [], totalPrice: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy })),
      foodTotal: newFoodTotal,
      gameTotal: newGamePrice,
      discount: d,
      promoName: activeSession.promoName || '',
      grandTotal: Math.max(0, newFoodTotal + newGamePrice - d * activeSession.members.length),
    })
  }

  const addSession = () => {
    const s = newPOSSession()
    setSessions(prev => [...prev, s])
    setActiveId(s.id)
  }

  const removeSession = async (id) => {
    if (sessions.length <= 1) { showToast('ต้องมีอย่างน้อย 1 ปาร์ตี้', 'error'); return }
    const session = sessions.find(s => s.id === id)
    if (session?.confirmedOrderId) {
      try {
        await updateDoc(doc(db, 'orders', session.confirmedOrderId), {
          status: 'closed', closedAt: serverTimestamp()
        })
      } catch (e) { console.warn('close order failed:', e.message) }
    }
    const remaining = sessions.filter(s => s.id !== id)
    setSessions(remaining)
    if (activeId === id) setActiveId(remaining[remaining.length - 1].id)
  }

  // ── derived values ───────────────────────────────────────────────
  const selectedGame = allGames.find(g => g.id === activeSession.scriptId)
  const orderArr = Array.isArray(activeSession.order) ? activeSession.order : []
  const foodTotal = orderArr.reduce((s, x) => s + (x.totalPrice || 0) * x.qty, 0)
  const gameUnitPay = selectedGame ? (selectedGame.payPrice ?? selectedGame.price ?? 0) : 0
  const gamePrice = activeSession.members.length * gameUnitPay
  const discount = Number(activeSession.discount) || 0          // per person (group promo)
  const totalDiscount = discount * activeSession.members.length
  const totalPersonalDiscounts = activeSession.members.reduce((s, m) => s + (Number(m.personalDiscount) || 0), 0)
  const grandTotal = Math.max(0, foodTotal + gamePrice - totalDiscount - totalPersonalDiscounts)

  // ── payment status helpers ───────────────────────────────────────
  const allMembersPaid = activeSession.confirmedOrderId &&
    activeSession.members.length > 0 &&
    activeSession.members.every(m => memberPayments[m.uid]?.verified)
  const verifiedTotal = Object.values(memberPayments).filter(p => p.verified).reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const remainingAmount = Math.max(0, grandTotal - verifiedTotal)

  const closeTable = () => {
    setSelectedEnding('')
    setShowEndingModal(true)
  }

  const doCloseTable = async (ending) => {
    setShowEndingModal(false)
    const orderId = activeSession.confirmedOrderId
    try {
      const orderSnap = await getDoc(doc(db, 'orders', orderId))
      if (orderSnap.exists() && orderSnap.data().status !== 'paid') {
        const counterRef = doc(db, 'settings', 'counter')
        let serial = 1
        await runTransaction(db, async tx => {
          const snap = await tx.get(counterRef)
          serial = ((snap.exists() ? snap.data().slipSerial : 0) || 0) + 1
          tx.set(counterRef, { slipSerial: serial }, { merge: true })
        })

        const totalPaid = Object.values(memberPayments)
          .reduce((s, p) => s + (Number(p.amount) || 0), 0)

        await addDoc(collection(db, 'payments'), {
          orderId,
          sessionLabel: activeSession.label,
          scriptId: activeSession.scriptId,
          scriptTitle: selectedGame?.title || '',
          dm: activeSession.dm,
          npc: activeSession.npc || '',
          room: activeSession.room,
          members: activeSession.members.map(m => ({
            uid: m.uid, name: m.name, character: m.character || '',
            avatar: m.avatar || '', scanInAt: m.scanInAt || null,
          })),
          memberUids: activeSession.members.map(m => m.uid),
          gameUnitPrice: gameUnitPay,
          gameTotal: gamePrice,
          foodItems: orderArr.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty })),
          foodTotal,
          discount: { type: 'amount', value: totalDiscount, applied: totalDiscount },
          grandTotal: totalPaid,
          memberPayments,
          serial,
          ending,
          openAt: orderSnap.data()?.createdAt?.toDate() || null,
          printCount: 0,
          paidAt: serverTimestamp(),
          confirmedBy: adminUser?.name || 'admin',
        })

        await updateDoc(doc(db, 'orders', orderId), {
          status: 'paid', paidAt: serverTimestamp(), paidTotal: totalPaid, ending,
        })
      }

      const remaining = sessions.filter(s => s.id !== activeId)
      if (remaining.length === 0) {
        const fresh = newPOSSession(); setSessions([fresh]); setActiveId(fresh.id)
      } else {
        setSessions(remaining); setActiveId(remaining[remaining.length - 1].id)
      }
      showToast('บันทึก report และปิดตี้แล้ว ✓')
    } catch (e) { showToast('ปิดตี้ล้มเหลว: ' + e.message, 'error') }
  }

  const menuCategories = ['ทั้งหมด', ...Array.from(new Set(menuItems.map(m => m.category).filter(Boolean))).sort()]

  const filteredMenuItems = menuItems.filter(item => {
    if (item.available === false) return false
    if (menuCategory !== 'ทั้งหมด' && item.category !== menuCategory) return false
    if (menuSearch && !item.name.toLowerCase().includes(menuSearch.toLowerCase())) return false
    return true
  })

  const groupedMenu = filteredMenuItems.reduce((g, item) => {
    const cat = item.category || 'อื่นๆ'
    if (!g[cat]) g[cat] = []
    g[cat].push(item); return g
  }, {})

  // ── confirm / update order ───────────────────────────────────────
  const handleConfirm = async () => {
    const s = activeSession
    if (s.members.length === 0) { showToast('ยังไม่มีสมาชิกในปาร์ตี้', 'error'); return }
    if (!s.scriptId) { showToast('กรุณาเลือกเกม', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        members: s.members.map(m => ({
          uid: m.uid, name: m.name, character: m.character || '',
          avatar: m.avatar || '', scanInAt: m.scanInAt || null,
          personalDiscount: Number(m.personalDiscount) || 0,
          personalDiscountNote: m.personalDiscountNote || '',
        })),
        memberUids: s.members.map(m => m.uid),
        scriptId: s.scriptId,
        scriptTitle: selectedGame?.title || '',
        dm: s.dm,
        npc: s.npc || '',
        room: s.room,
        foodItems: orderArr.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy || null })),
        memberFoodHistory: orderArr.filter(x => x.orderedBy).map(x => ({ name: x.name, addons: x.addons || [], totalPrice: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy })),
        foodTotal,
        gameTotal: gamePrice,
        discount,           // per-person discount
        promoName: s.promoName || '',
        grandTotal,
        createdBy: adminUser?.name || 'admin',
        status: 'active',
      }

      if (s.confirmedOrderId) {
        // ── update existing order (เพิ่มของกิน / สมาชิกใหม่) ──────
        await updateDoc(doc(db, 'orders', s.confirmedOrderId), {
          ...payload, updatedAt: serverTimestamp()
        })
        showToast('อัปเดตออเดอร์สำเร็จ ✓')
      } else {
        // ── create new order ──────────────────────────────────────
        for (const m of s.members) {
          await addDoc(collection(db, 'playHistory'), {
            userId: m.uid, userName: m.name, userAvatar: m.avatar,
            scriptId: s.scriptId, scriptTitle: selectedGame?.title || '',
            character: m.character, dm: s.dm, room: s.room,
            playedAt: serverTimestamp(), recordedBy: adminUser?.name || 'admin',
          })
        }
        const ref = await addDoc(collection(db, 'orders'), { ...payload, createdAt: serverTimestamp() })
        updateActive({ confirmedOrderId: ref.id })
        showToast('บันทึกออเดอร์สำเร็จ ✓')
      }
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="pos-page" className="page active">

      {/* ── TODAY BAR ── */}
      <div className="pos-today-bar">
        <div className="pos-today-info" onClick={() => setShowHistory(h => !h)}>
          <i className="fas fa-calendar-day" />
          <span>ปาร์ตี้วันนี้: <strong>{todayOrders.length} รอบ</strong></span>
          <span className="pos-today-total">฿{todayOrders.reduce((s, o) => s + (o.grandTotal || 0), 0).toLocaleString()}</span>
          <i className={`fas fa-chevron-${showHistory ? 'up' : 'down'}`} style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.6 }} />
        </div>
        {showHistory && (
          <div className="pos-today-list">
            {todayOrders.length === 0 && <div className="pos-empty">ยังไม่มีออเดอร์วันนี้</div>}
            {todayOrders.map(o => (
              <div key={o.id} className="pos-today-item">
                <div className="pos-today-item-left">
                  <div className="pos-today-game">{o.scriptTitle || 'ไม่ระบุ'}</div>
                  <div className="pos-today-members">
                    <i className="fas fa-users" /> {o.members?.length || 0} คน
                    {o.dm && <span> · DM: {o.dm}</span>}
                    {o.room && <span> · {o.room}</span>}
                  </div>
                </div>
                <div className="pos-today-price">฿{(o.grandTotal || 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SESSION TABS ── */}
      <div className="pos-tabs-wrap">
        <div className="pos-tabs">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`pos-tab${s.id === activeId ? ' active' : ''}${s.confirmedOrderId ? ' confirmed' : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              <span className="pos-tab-label">
                {s.confirmedOrderId && <i className="fas fa-check-circle" style={{ marginRight: 5, color: 'var(--feedback-success-icon)', fontSize: 10 }} />}
                {(() => {
                  const game = allGames.find(g => g.id === s.scriptId)
                  const date = fmtDate(s.createdAt ? new Date(s.createdAt) : new Date())
                  return game ? `${game.title} ${date}` : s.label
                })()}
                {s.members.length > 0 && <span className="pos-tab-count">{s.members.length}</span>}
              </span>
              {sessions.length > 1 && (
                <button className="pos-tab-close" onClick={e => { e.stopPropagation(); removeSession(s.id) }}>
                  <i className="fas fa-times" />
                </button>
              )}
            </div>
          ))}
          <button className="pos-tab-add" onClick={addSession}>
            <i className="fas fa-plus" /> ปาร์ตี้ใหม่
          </button>
        </div>
      </div>

      {/* ── MEMBER FOOD QUEUE ── */}
      {memberQueue.length > 0 && (
        <div className="pos-queue-bar">
          <div className="pos-queue-bar-top">
            <span className="pos-queue-badge"><i className="fas fa-bell" /> {memberQueue.length} รายการจากลูกค้า</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pos-queue-toggle" onClick={() => setShowQueue(v => !v)}>
                {showQueue ? 'ซ่อน' : 'ดูรายการ'} <i className={`fas fa-chevron-${showQueue ? 'up' : 'down'}`} />
              </button>
              <button className="pos-queue-accept-all" onClick={acceptQueue}>
                <i className="fas fa-check-double" /> รับทั้งหมด
              </button>
            </div>
          </div>
          {showQueue && (
            <div className="pos-queue-list">
              {memberQueue.map((qi, i) => (
                <div key={i} className="pos-queue-item">
                  <span className="pos-queue-item-name">
                    {qi.name}{qi.addons?.length ? ` (${qi.addons.map(a => a.name).join(',')})` : ''}
                  </span>
                  {qi.orderedBy && <span className="pos-queue-item-by"><i className="fas fa-user" /> {qi.orderedBy.name.split(' ')[0]}</span>}
                  <span className="pos-queue-item-price">฿{qi.totalPrice}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MAIN 2-COL ── */}
      <div className="pos-layout">

        {/* LEFT */}
        <div className="pos-left">
          <div className="pos-section-title"><i className="fas fa-users" /> สมาชิก — {activeSession.label}</div>

          <div className="pos-members-list">
            {activeSession.members.length === 0 && <div className="pos-empty">ยังไม่มีสมาชิก</div>}

            {/* Unpaid members */}
            {activeSession.members.filter(m => !memberPayments[m.uid]?.verified).map(m => (
              <div key={m.uid} className="pos-member-row">
                {m.avatar
                  ? <img src={m.avatar} alt="" className="pos-member-avatar" />
                  : <div className="pos-member-avatar-ph">{m.name[0]}</div>
                }
                <div className="pos-member-info">
                  <div className="pos-member-name">
                    {m.name}
                    {memberPayments[m.uid]?.easyslipPending && (
                      <span className="pos-member-pending-badge" title="รอ Bangkok Bank ยืนยันอัตโนมัติ">
                        <i className="fas fa-hourglass-half" /> รอ BK
                      </span>
                    )}
                    {memberPayments[m.uid]?.pendingAdminReview && (
                      <button className="pos-member-slip-badge" onClick={() => setSlipVerifyMember(m)} title="คลิกตรวจสลิป EasySlip">
                        <i className="fas fa-camera" /> ตรวจสลิป
                      </button>
                    )}
                  </div>
                  {selectedGame?.characters?.length > 0 ? (
                    <select className="pos-char-select" value={m.character} onChange={e => setCharacter(m.uid, e.target.value)}>
                      <option value="">— เลือกตัวละคร —</option>
                      {selectedGame.characters.map((c, i) => (
                        <option key={i} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="pos-char-input" placeholder="ตัวละคร..." value={m.character} onChange={e => setCharacter(m.uid, e.target.value)} />
                  )}
                  <div className="pos-personal-disc-row">
                    <input
                      className="pos-personal-disc-amt"
                      type="number" min="0"
                      placeholder="ส่วนลด ฿"
                      value={m.personalDiscount || ''}
                      onChange={e => setPersonalDiscount(m.uid, e.target.value)}
                    />
                    <input
                      className="pos-personal-disc-note"
                      placeholder="เหตุผล เช่น คูปอง"
                      value={m.personalDiscountNote || ''}
                      onChange={e => setPersonalDiscountNote(m.uid, e.target.value)}
                    />
                  </div>
                </div>
                <button className="pos-remove-btn" onClick={() => removeMember(m.uid)}><i className="fas fa-times" /></button>
              </div>
            ))}

            {/* Paid members — collapsible */}
            {activeSession.members.filter(m => memberPayments[m.uid]?.verified).length > 0 && (
              <div className="pos-paid-section">
                <button
                  className="pos-paid-collapse-btn"
                  onClick={() => setShowPaidMembers(v => !v)}
                >
                  <span><i className="fas fa-check-circle" style={{ color: 'var(--feedback-success-icon)' }} /> จ่ายแล้ว {activeSession.members.filter(m => memberPayments[m.uid]?.verified).length} คน · ฿{Object.values(memberPayments).filter(p => p.verified).reduce((s, p) => s + (Number(p.amount) || 0), 0).toLocaleString()}</span>
                  <i className={`fas fa-chevron-${showPaidMembers ? 'up' : 'down'}`} />
                </button>
                {showPaidMembers && activeSession.members.filter(m => memberPayments[m.uid]?.verified).map(m => (
                  <div key={m.uid} className="pos-member-row" style={{ opacity: 0.5 }}>
                    {m.avatar
                      ? <img src={m.avatar} alt="" className="pos-member-avatar" />
                      : <div className="pos-member-avatar-ph">{m.name[0]}</div>
                    }
                    <div className="pos-member-info">
                      <div className="pos-member-name">
                        {m.name}
                        <span className="pos-member-paid-badge">
                          <i className="fas fa-check-circle" /> ฿{Number(memberPayments[m.uid].amount || 0).toLocaleString()}
                        </span>
                      </div>
                      {m.character && <div style={{ fontSize: 12, color: '#555555' }}>{m.character}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pos-member-actions">
            <button className="pos-scan-more-btn" onClick={() => setScannerOpen(true)}>
              <i className="fas fa-qrcode" /> สแกนเพิ่มสมาชิก
            </button>
            {activeSession.confirmedOrderId && totalPersonalDiscounts > 0 && (
              <button className="pos-sync-disc-btn" onClick={syncMembersDiscount}>
                <i className="fas fa-sync" /> อัปเดตส่วนลด
              </button>
            )}
          </div>

          <div className="pos-divider" />

          <div className="pos-section-title"><i className="fas fa-scroll" /> เกม</div>
          <select className="form-select" value={activeSession.scriptId} onChange={e => updateActive({ scriptId: e.target.value })}>
            <option value="">— เลือกเกม —</option>
            {allGames.map(g => (
              <option key={g.id} value={g.id}>{g.title}{(g.payPrice ?? g.price) ? ` (฿${g.payPrice ?? g.price}/คน)` : ''}</option>
            ))}
          </select>

          <div className="form-row" style={{ marginTop: 4 }}>
            <div className="form-group">
              <label className="form-label">DM</label>
              <select className="form-select" value={activeSession.dmUid || ''} onChange={e => {
                const member = adminMembers.find(a => a.id === e.target.value)
                updateActive({
                  dmUid: e.target.value || null,
                  dm: member ? (member.nickname || member.firstname || '') : '',
                })
              }}>
                <option value="">— เลือก DM —</option>
                {adminMembers.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nickname || a.firstname} {a.lastname || ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">NPC</label>
              <input
                className="form-input"
                placeholder="ชื่อ NPC..."
                value={activeSession.npc || ''}
                onChange={e => updateActive({ npc: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 4 }}>
            <label className="form-label">ห้อง</label>
            <select className="form-select" value={activeSession.room} onChange={e => updateActive({ room: e.target.value })}>
              <option value="">— เลือกห้อง —</option>
              {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="pos-divider" />

          <div className="pos-section-title"><i className="fas fa-tag" /> โปรโมชัน / ส่วนลด</div>
          <div className="pos-promo-wrap">
            <input
              className="pos-promo-name-input"
              placeholder="ชื่อโปร เช่น วันเกิด, สมาชิก..."
              value={activeSession.promoName || ''}
              onChange={e => updateActive({ promoName: e.target.value })}
            />
            <div className="pos-promo-amount-row">
              <span className="pos-promo-label">ลดราคา</span>
              <input
                className="pos-promo-amount-input"
                type="number"
                min="0"
                placeholder="0"
                value={activeSession.discount || ''}
                onChange={e => updateActive({ discount: Number(e.target.value) || 0 })}
              />
              <span className="pos-promo-unit">บาท</span>
            </div>
            {discount > 0 && (
              <div className="pos-promo-preview">
                <i className="fas fa-check-circle" /> {activeSession.promoName || 'ส่วนลด'} −฿{discount.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE — menu */}
        <div className="pos-middle">
          <div className="pos-section-title"><i className="fas fa-utensils" /> เมนูอาหาร</div>

          {menuItems.length > 0 && (
            <div className="pos-menu-filter">
              <div className="pos-menu-search-wrap">
                <i className="fas fa-search pos-menu-search-icon" />
                <input
                  className="pos-menu-search-input"
                  type="text"
                  placeholder="ค้นหาเมนู..."
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                />
                {menuSearch && (
                  <button className="pos-menu-search-clear" onClick={() => setMenuSearch('')}>
                    <i className="fas fa-times" />
                  </button>
                )}
              </div>
              <div className="pos-menu-cat-chips">
                {menuCategories.map(cat => (
                  <button
                    key={cat}
                    className={`pos-menu-cat-chip${menuCategory === cat ? ' active' : ''}`}
                    onClick={() => setMenuCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pos-menu-scroll">
            {menuItems.length === 0 && <div className="pos-empty">ยังไม่มีเมนู (เพิ่มได้ในหน้า Admin)</div>}
            {menuItems.length > 0 && filteredMenuItems.length === 0 && (
              <div className="pos-empty">ไม่พบเมนู "{menuSearch}"</div>
            )}
            {Object.entries(groupedMenu).map(([cat, items]) => (
              <div key={cat} className="pos-menu-group">
                <div className="pos-menu-cat">{menuCategory === 'ทั้งหมด' ? cat : ''}</div>
                {items.map(item => {
                  const itemQty = orderArr.filter(x => x.menuId === item.id).reduce((s, x) => s + x.qty, 0)
                  const baseKey = item.id + '|'
                  return (
                    <div key={item.id} className={`pos-menu-item${itemQty > 0 ? ' in-order' : ''}`}>
                      {item.imageUrl && <img src={item.imageUrl} alt="" className="pos-menu-item-img" />}
                      <div className="pos-menu-item-info">
                        <div className="pos-menu-item-name">
                          {item.name}
                          {item.addons?.length > 0 && <span className="pos-menu-has-addon"><i className="fas fa-plus-circle" /></span>}
                        </div>
                        <div className="pos-menu-item-price">฿{item.price}</div>
                      </div>
                      <div className="pos-menu-qty">
                        {item.addons?.length > 0 ? (
                          <>
                            {itemQty > 0 && <span className="pos-qty-badge">{itemQty}</span>}
                            <button className="pos-qty-btn add" onClick={() => addItem(item)}>+</button>
                          </>
                        ) : (
                          <>
                            {itemQty > 0 ? (
                              <>
                                <button className="pos-qty-btn" onClick={() => removeItem(baseKey)}>−</button>
                                <span className="pos-qty-badge">{itemQty}</span>
                                <button className="pos-qty-btn add" onClick={() => addItem(item)}>+</button>
                              </>
                            ) : (
                              <button className="pos-qty-btn add" onClick={() => addItem(item)}>+</button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — order summary */}
        <div className="pos-right">
          <div className="pos-section-title"><i className="fas fa-receipt" /> สรุปออเดอร์</div>

          <div className="pos-right-content">
            <div className="pos-summary">
              {selectedGame && (
                <div className="pos-summary-game-card">
                  <div className="pos-summary-game-title">
                    <i className="fas fa-scroll" /> {selectedGame.title}
                  </div>
                  <div className="pos-summary-game-meta">
                    {selectedGame.players && (
                      <span><i className="fas fa-users" /> รองรับ {selectedGame.players} คน</span>
                    )}
                    {selectedGame.time && (
                      <span><i className="fas fa-clock" /> {selectedGame.time}</span>
                    )}
                  </div>
                  {gameUnitPay > 0 && (
                    <div className="pos-summary-game-calc">
                      <span className="pos-calc-label">ราคาเกม</span>
                      <span className="pos-calc-formula">
                        ฿{gameUnitPay} × {activeSession.members.length} คน
                      </span>
                      <span className="pos-calc-result">฿{gamePrice.toLocaleString()}</span>
                    </div>
                  )}
                  {gameUnitPay === 0 && (
                    <div className="pos-summary-game-free">ฟรี</div>
                  )}
                </div>
              )}
              {orderArr.map(x => (
                <div key={x.key} className="pos-summary-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div className="pos-summary-row-left">
                      <span>{x.name} × {x.qty}</span>
                      {x.addons?.length > 0 && (
                        <div className="pos-summary-addons">{x.addons.map(a => a.name).join(', ')}</div>
                      )}
                    </div>
                    <div className="pos-summary-row-right">
                      <span>฿{(x.totalPrice * x.qty).toLocaleString()}</span>
                      <button className="pos-summary-void" onClick={() => voidItem(x.key)} title="ยกเลิกรายการนี้">
                        <i className="fas fa-trash-alt" />
                      </button>
                    </div>
                  </div>
                  {/* Bill owner row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {editingBillKey === x.key ? (
                      <>
                        {activeSession.members.map(m => (
                          <button key={m.uid} onClick={() => assignBillOwner(x.key, { uid: m.uid, name: m.name, avatar: m.avatar || '' })} style={{
                            fontSize: 10, padding: '3px 8px', borderRadius: 12,
                            background: x.orderedBy?.uid === m.uid ? 'var(--crimson-500)' : 'rgba(0,0,0,0.06)',
                            color: x.orderedBy?.uid === m.uid ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${x.orderedBy?.uid === m.uid ? 'var(--crimson-500)' : 'var(--border-default)'}`,
                            cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontWeight: 600,
                          }}>
                            {m.name.split(' ')[0]}
                          </button>
                        ))}
                        {x.orderedBy && (
                          <button onClick={() => assignBillOwner(x.key, null)} style={{
                            fontSize: 10, padding: '3px 8px', borderRadius: 12,
                            background: 'rgba(198,36,25,0.08)', color: 'var(--crimson-500)',
                            border: '1px solid rgba(198,36,25,0.25)', cursor: 'pointer',
                            fontFamily: "'Sarabun',sans-serif", fontWeight: 600,
                          }}>
                            <i className="fas fa-times" /> ล้าง
                          </button>
                        )}
                        <button onClick={() => setEditingBillKey(null)} style={{
                          fontSize: 10, padding: '3px 6px', borderRadius: 12,
                          background: 'transparent', color: 'var(--text-tertiary)',
                          border: '1px solid var(--border-default)', cursor: 'pointer',
                        }}>
                          <i className="fas fa-check" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setEditingBillKey(x.key)} style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 12,
                        background: x.orderedBy ? 'rgba(198,36,25,0.08)' : 'rgba(0,0,0,0.04)',
                        color: x.orderedBy ? 'var(--crimson-500)' : 'var(--text-tertiary)',
                        border: `1px solid ${x.orderedBy ? 'rgba(198,36,25,0.25)' : 'var(--border-default)'}`,
                        cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontWeight: 600,
                      }}>
                        <i className="fas fa-user-tag" style={{ marginRight: 4 }} />
                        {x.orderedBy ? x.orderedBy.name.split(' ')[0] : 'ระบุเจ้าบิล'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {totalDiscount > 0 && (
                <div className="pos-summary-discount">
                  <span><i className="fas fa-tag" /> {activeSession.promoName || 'ส่วนลด'}{activeSession.members.length > 0 && ` (฿${discount}×${activeSession.members.length}คน)`}</span>
                  <span>−฿{totalDiscount.toLocaleString()}</span>
                </div>
              )}
              {activeSession.members.filter(m => Number(m.personalDiscount) > 0).map(m => (
                <div key={m.uid} className="pos-summary-discount personal">
                  <span><i className="fas fa-user-tag" /> {m.name.split(' ')[0]}{m.personalDiscountNote ? ` · ${m.personalDiscountNote}` : ''}</span>
                  <span>−฿{Number(m.personalDiscount).toLocaleString()}</span>
                </div>
              ))}
              {(selectedGame || orderArr.length > 0) ? (
                <div className="pos-summary-total">
                  <span>ยอดรวม</span>
                  <span>฿{grandTotal.toLocaleString()}</span>
                </div>
              ) : (
                <div className="pos-empty">ยังไม่มีรายการ</div>
              )}
            </div>

            {allMembersPaid ? (
              <div className="pos-all-paid-banner">
                <div className="pos-all-paid-label"><i className="fas fa-check-double" /> ทุกคนจ่ายครบแล้ว</div>
                <button className="pos-close-table-btn" onClick={closeTable}>
                  <i className="fas fa-flag-checkered" /> ตี้นี้เล่นเสร็จแล้ว
                </button>
              </div>
            ) : verifiedTotal > 0 && (
              <div className="pos-partial-paid-banner">
                <i className="fas fa-check-circle" /> จ่ายแล้ว ฿{verifiedTotal.toLocaleString()} · ค้าง ฿{remainingAmount.toLocaleString()}
              </div>
            )}

            {/* ── GROUP PAY ── */}
            {activeSession.confirmedOrderId && !allMembersPaid && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
                {!groupPayMode ? (
                  <button onClick={() => { setGroupPayMode(true); setGroupPaySelected(new Set()) }} style={{
                    width: '100%', padding: '9px 14px', borderRadius: 8,
                    background: 'rgba(0,0,0,0.04)', border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', fontFamily: "'Sarabun',sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}>
                    <i className="fas fa-object-group" /> รวมบิลจ่ายกัน
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      เลือกสมาชิกที่จ่ายรวมกัน
                    </div>
                    {activeSession.members
                      .filter(m => !memberPayments[m.uid]?.verified)
                      .map(m => {
                        const bill = getMemberBill(m)
                        const sel = groupPaySelected.has(m.uid)
                        return (
                          <button key={m.uid} onClick={() => setGroupPaySelected(prev => {
                            const s = new Set(prev)
                            s.has(m.uid) ? s.delete(m.uid) : s.add(m.uid)
                            return s
                          })} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                            background: sel ? 'rgba(198,36,25,0.07)' : 'rgba(0,0,0,0.03)',
                            border: `1px solid ${sel ? 'var(--crimson-500)' : 'var(--border-default)'}`,
                            fontFamily: "'Sarabun',sans-serif", textAlign: 'left',
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <i className={`fas fa-${sel ? 'check-square' : 'square'}`} style={{ color: sel ? 'var(--crimson-500)' : 'var(--border-strong)', fontSize: 13 }} />
                              <span style={{ fontSize: 13, fontWeight: sel ? 700 : 400, color: 'var(--text-primary)' }}>{m.name.split(' ')[0]}</span>
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: sel ? 'var(--crimson-500)' : 'var(--text-secondary)' }}>
                              ฿{bill.toLocaleString()}
                            </span>
                          </button>
                        )
                      })}
                    {groupPaySelected.size >= 2 && (
                      <div style={{ background: 'rgba(198,36,25,0.06)', border: '1px solid rgba(198,36,25,0.2)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          รวม {groupPaySelected.size} คน
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--crimson-500)' }}>
                          ฿{[...groupPaySelected].reduce((s, uid) => {
                            const m = activeSession.members.find(x => x.uid === uid)
                            return s + (m ? getMemberBill(m) : 0)
                          }, 0).toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setGroupPayMode(false); setGroupPaySelected(new Set()) }} style={{
                        flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border-default)',
                        background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
                        fontSize: 13, fontFamily: "'Sarabun',sans-serif",
                      }}>ยกเลิก</button>
                      <button onClick={confirmGroupPayment} disabled={groupPaySelected.size < 2 || groupPaySaving} style={{
                        flex: 2, padding: '8px', borderRadius: 8, border: 'none',
                        background: groupPaySelected.size >= 2 ? 'var(--crimson-500)' : 'var(--border-default)',
                        color: '#fff', cursor: groupPaySelected.size >= 2 ? 'pointer' : 'default',
                        fontSize: 13, fontWeight: 700, fontFamily: "'Sarabun',sans-serif",
                        opacity: groupPaySaving ? 0.7 : 1,
                      }}>
                        {groupPaySaving ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</> : <><i className="fas fa-check" /> ยืนยันรับเงิน</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pos-right-footer">
            <button className="pos-confirm-btn" onClick={handleConfirm} disabled={saving}>
              {saving
                ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                : activeSession.confirmedOrderId
                  ? <><i className="fas fa-sync" /> อัปเดตออเดอร์</>
                  : <><i className="fas fa-check-circle" /> ยืนยันออเดอร์</>
              }
            </button>
            {activeSession.confirmedOrderId && !allMembersPaid && (
              <button className="pos-pay-btn" onClick={() => setShowPayment(true)}>
                <i className="fas fa-qrcode" /> ชำระเงิน{remainingAmount < grandTotal && grandTotal > 0 ? ` ฿${remainingAmount.toLocaleString()}` : ''}
              </button>
            )}
            {activeSession.confirmedOrderId && (
              <button className="pos-void-btn" onClick={async () => {
                if (!window.confirm('ยืนยันยกเลิกตี้นี้? ลูกค้าจะถูกส่งกลับหน้า QR')) return
                try {
                  await updateDoc(doc(db, 'orders', activeSession.confirmedOrderId), {
                    status: 'closed', closedAt: serverTimestamp()
                  })
                  const remaining = sessions.filter(s => s.id !== activeId)
                  if (remaining.length === 0) {
                    const fresh = newPOSSession()
                    setSessions([fresh]); setActiveId(fresh.id)
                  } else {
                    setSessions(remaining); setActiveId(remaining[remaining.length - 1].id)
                  }
                  showToast('ยกเลิกตี้แล้ว')
                } catch (e) { showToast('ยกเลิกล้มเหลว', 'error') }
              }}>
                <i className="fas fa-ban" /> ยกเลิกตี้
              </button>
            )}
            <button className="pos-cancel-btn" onClick={onClose}>ปิดหน้า POS</button>
          </div>
        </div>
      </div>

      {scannerOpen && <QRScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />}

      {slipVerifyMember && (
        <SlipVerifyModal
          member={slipVerifyMember}
          payment={memberPayments[slipVerifyMember.uid]}
          orderId={activeSession.confirmedOrderId}
          easySlipApiKey={easySlipApiKey}
          showToast={showToast}
          onClose={() => setSlipVerifyMember(null)}
          onVerified={() => setTimeout(() => setSlipVerifyMember(null), 2000)}
        />
      )}

      {showPayment && (
        <PaymentModal
          session={activeSession}
          selectedGame={selectedGame}
          adminUser={adminUser}
          showToast={showToast}
          memberPayments={memberPayments}
          onClose={() => setShowPayment(false)}
          onPaid={() => {
            setShowPayment(false)
            // Remove the paid session, keep others
            const remaining = sessions.filter(s => s.id !== activeId)
            if (remaining.length === 0) {
              const fresh = newPOSSession()
              setSessions([fresh])
              setActiveId(fresh.id)
            } else {
              setSessions(remaining)
              setActiveId(remaining[remaining.length - 1].id)
            }
          }}
        />
      )}

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
            <div className="pos-addon-label">เลือก Add-on (เพิ่มเติม)</div>
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
                commitAddItem(addonPopup.item, addonPopup.selectedAddons)
                setAddonPopup(null)
              }}>
                <i className="fas fa-plus" /> เพิ่มลงออเดอร์
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ending selection modal ── */}
      {showEndingModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowEndingModal(false)}>
          <div className="pos-ending-modal">
            <div className="pos-ending-title">
              <i className="fas fa-flag-checkered" /> เลือก Ending ของปาร์ตี้
            </div>
            <div className="pos-ending-subtitle">ผลลัพธ์ที่ทีมนักสืบได้รับในคืนนี้</div>

            <div className="pos-ending-grid">
              {[
                { id: 'good-ending',  icon: 'fa-smile',  label: 'Good Ending',  sub: 'คดีถูกไขบางส่วน',  color: 'var(--feedback-success-icon)', bg: 'rgba(var(--feedback-success-rgb), 0.08)',  border: 'rgba(var(--feedback-success-rgb), 0.35)' },
                { id: 'true-ending',  icon: 'fa-star',   label: 'True Ending',  sub: 'ไขคดีครบสมบูรณ์',  color: 'var(--case-amber)',             bg: 'rgba(var(--case-amber-rgb), 0.08)',           border: 'rgba(var(--case-amber-rgb), 0.40)' },
                { id: 'bad-ending',   icon: 'fa-skull',  label: 'Bad Ending',   sub: 'ทีมล้มเหลว',       color: 'var(--crimson-500)',            bg: 'rgba(var(--crimson-500-rgb), 0.08)',          border: 'rgba(var(--crimson-500-rgb), 0.35)' },
              ].map(opt => (
                <button
                  key={opt.id}
                  className={`pos-ending-card${selectedEnding === opt.id ? ' selected' : ''}`}
                  style={{ '--ec': opt.color, '--eb': opt.bg, '--ebr': opt.border }}
                  onClick={() => setSelectedEnding(opt.id)}
                >
                  <div className="pos-ending-icon"><i className={`fas ${opt.icon}`} /></div>
                  <div className="pos-ending-label">{opt.label}</div>
                  <div className="pos-ending-sub">{opt.sub}</div>
                  {selectedEnding === opt.id && (
                    <div className="pos-ending-check"><i className="fas fa-check-circle" /></div>
                  )}
                </button>
              ))}
            </div>

            <div className="pos-ending-actions">
              <button className="btn-secondary" onClick={() => setShowEndingModal(false)}>ยกเลิก</button>
              <button
                className="pos-confirm-btn"
                style={{ flex: 1 }}
                disabled={!selectedEnding}
                onClick={() => doCloseTable(selectedEnding)}
              >
                <i className="fas fa-door-closed" /> ยืนยันปิดตี้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
