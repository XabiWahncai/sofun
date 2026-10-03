import { useState, useEffect, useRef, useMemo } from 'react'
import { db } from '../firebase'
import {
  doc, getDoc, collection, onSnapshot,
  addDoc, updateDoc, arrayUnion, serverTimestamp, query, orderBy, where, runTransaction
} from 'firebase/firestore'
import { Html5Qrcode } from 'html5-qrcode'
import QRScanner from './QRScanner'
import PaymentModal from './PaymentModal'
import { buildKitchenTicketHTML } from '../constants/receipt'

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

const ROOMS = ['1st Floor', '3rd Floor', 'Waiting Area 1', 'Waiting Area 2', '404 Bar', 'Japanese Room', 'Chinese Room', 'Europe Room', 'Ghost Room', 'Projector Room', '5 Floor', 'Yang', 'Chinese DM', 'Thai DM']

let sessionCounter = 1
const fmtDate = (d = new Date()) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`

export const newPOSSession = () => ({
  id: Date.now() + Math.random(),
  label: `ปาร์ตี้ ${sessionCounter++}`,
  createdAt: new Date().toISOString(),
  members: [],
  scriptId: '',
  eventName: '',
  customPrice: '',
  dm: '',
  npc: '',
  room: '',
  order: [],
  confirmedOrderId: null,
  promoName: '',
  discount: 0,
})

// ── Web Audio API sound alert (plays pleasant chime every 5s on customer order) ──
const playOrderAlertSound = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    if (!window._posAudioCtx) {
      window._posAudioCtx = new AudioCtx()
    }
    const ctx = window._posAudioCtx
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime
    // 4-tone ascending bell chime: C5 (523.25) -> E5 (659.25) -> G5 (783.99) -> C6 (1046.50)
    const notes = [
      { f: 523.25, t: 0,    d: 0.14 },
      { f: 659.25, t: 0.11, d: 0.14 },
      { f: 783.99, t: 0.22, d: 0.16 },
      { f: 1046.50, t: 0.35, d: 0.40 },
    ]

    notes.forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, now + t)

      gain.gain.setValueAtTime(0.001, now + t)
      gain.gain.linearRampToValueAtTime(0.28, now + t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + t)
      osc.stop(now + t + d + 0.05)
    })
  } catch (e) {
    console.warn('Audio alert error:', e)
  }
}

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
  const [gameSearch, setGameSearch] = useState('')
  const [gameDropOpen, setGameDropOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState('members') // 'members' | 'menu' | 'order' — mobile only
  const [expandedMembers, setExpandedMembers] = useState(() => new Set())
  const [editingUnlocked, setEditingUnlocked] = useState(false)
  const [receiptSettings, setReceiptSettings] = useState(null)

  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'receipt'), snap => {
      if (snap.exists()) setReceiptSettings(snap.data())
    }, () => {})
  }, [])

  const setSessions = onSessionsChange
  const setActiveId = onActiveIdChange

  const fallbackSession = useMemo(() => newPOSSession(), [])
  const safeSessions = Array.isArray(sessions) && sessions.length > 0 ? sessions : [fallbackSession]
  const activeSession = safeSessions.find(s => s.id === activeId) || safeSessions[0]
  const isLocked = !!activeSession?.confirmedOrderId && !editingUnlocked
  useEffect(() => { setEditingUnlocked(false) }, [activeId])

  // initialise with 1 session if empty
  useEffect(() => {
    if (!sessions || sessions.length === 0) {
      const s = newPOSSession()
      setSessions([s])
      setActiveId(s.id)
    } else if (!activeId || !sessions.find(s => s.id === activeId)) {
      setActiveId(sessions[sessions.length - 1].id)
    }
  }, [sessions, activeId])

  const updateSession = (id, patch) =>
    setSessions(prev => (Array.isArray(prev) ? prev : [fallbackSession]).map(s => s.id === id ? { ...s, ...patch } : s))

  const updateActive = (patch) => updateSession(activeSession.id, patch)

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

  // Unlock Web Audio API on first user interaction
  useEffect(() => {
    const unlock = () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          if (!window._posAudioCtx) window._posAudioCtx = new AudioCtx()
          if (window._posAudioCtx.state === 'suspended') window._posAudioCtx.resume().catch(() => {})
        }
      } catch {}
    }
    window.addEventListener('click', unlock, { passive: true })
    window.addEventListener('touchstart', unlock, { passive: true })
    window.addEventListener('keydown', unlock, { passive: true })
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('touchstart', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const [soundMuted, setSoundMuted] = useState(() => {
    try {
      return localStorage.getItem('sofun_pos_sound_muted') === 'true'
    } catch {
      return false
    }
  })

  const toggleSoundMute = () => {
    setSoundMuted(prev => {
      const next = !prev
      try {
        localStorage.setItem('sofun_pos_sound_muted', String(next))
      } catch {}
      if (!next) {
        playOrderAlertSound()
        showToast('เปิดเสียงแจ้งเตือนออเดอร์แล้ว 🔔')
      } else {
        showToast('ปิดเสียงแจ้งเตือนแล้ว 🔇')
      }
      return next
    })
  }

  // Other orders in today's orders that have pending member food items
  const otherPendingOrders = useMemo(() => {
    return todayOrders.filter(o =>
      o.id !== activeSession?.confirmedOrderId &&
      Array.isArray(o.memberFoodQueue) &&
      o.memberFoodQueue.length > 0
    )
  }, [todayOrders, activeSession?.confirmedOrderId])

  const totalPendingQueueCount = memberQueue.length + otherPendingOrders.reduce((sum, o) => sum + (o.memberFoodQueue?.length || 0), 0)

  const soundTimerRef = useRef(null)

  // Loop alert chime every 5 seconds while there are pending orders
  useEffect(() => {
    if (totalPendingQueueCount === 0 || soundMuted) {
      if (soundTimerRef.current) {
        clearInterval(soundTimerRef.current)
        soundTimerRef.current = null
      }
      return
    }

    // Orders pending and not muted: start 5-second interval if not already running
    if (!soundTimerRef.current) {
      playOrderAlertSound()
      soundTimerRef.current = setInterval(() => {
        playOrderAlertSound()
      }, 5000)
    }
  }, [totalPendingQueueCount, soundMuted])

  // Cleanup sound interval on unmount
  useEffect(() => {
    return () => {
      if (soundTimerRef.current) {
        clearInterval(soundTimerRef.current)
        soundTimerRef.current = null
      }
    }
  }, [])

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

    const queuedItems = [...memberQueue]
    // Optimistically clear immediately to silence sound and update UI instantaneously
    setMemberQueue([])

    const cur = activeSession.order || []
    const updated = [...cur]
    for (const qi of queuedItems) {
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
    const mode = activeSession.discountMode || 'perPerson'
    const totalD = mode === 'split' ? d : d * activeSession.members.length
    await updateDoc(doc(db, 'orders', orderId), {
      memberFoodQueue: [],
      memberFoodHistory: arrayUnion(...queuedItems),
      foodItems: updated.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy || null })),
      foodTotal: newFoodTotal,
      gameTotal: newGamePrice,
      discount: d,
      discountMode: mode,
      promoName: activeSession.promoName || '',
      grandTotal: Math.max(0, newFoodTotal + newGamePrice - totalD),
    })
    setShowQueue(false)
    showToast(`รับ ${queuedItems.length} รายการจากลูกค้าแล้ว ✓`)

    // Print via hidden iframe — srcdoc always renders as HTML, no popup/encoding issues
    const now = new Date()
    const isPaid = activeSession.members.length > 0 &&
      activeSession.members.every(m => memberPayments[m.uid]?.verified)
    const html = buildKitchenTicketHTML(memberQueue, activeSession, now, isPaid, receiptSettings)
    const printWidth = receiptSettings?.orderIn?.paperWidth || '80mm'
    const frame = document.createElement('iframe')
    frame.style.cssText = `position:fixed;left:-9999px;top:0;width:${printWidth};height:297mm;border:0;visibility:hidden;pointer-events:none`
    document.body.appendChild(frame)
    frame.srcdoc = html
    frame.onload = () => {
      setTimeout(() => {
        try { frame.contentWindow.focus(); frame.contentWindow.print() } catch (e) { console.warn('print error', e) }
        setTimeout(() => { try { document.body.removeChild(frame) } catch {} }, 5000)
      }, 300)
    }
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
    const n = Array.isArray(activeSession?.members) ? activeSession.members.length : 0
    const rawD = Number(activeSession?.discount) || 0
    const mode = activeSession?.discountMode || 'perPerson'
    const discountPerPerson = mode === 'split' ? (n > 0 ? rawD / n : 0) : rawD
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
    const mode = activeSession.discountMode || 'perPerson'
    const totalD = mode === 'split' ? d : d * activeSession.members.length
    await updateDoc(doc(db, 'orders', orderId), {
      foodItems: updated.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy || null })),
      memberFoodHistory: updated.filter(x => x.orderedBy).map(x => ({ name: x.name, addons: x.addons || [], totalPrice: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy })),
      foodTotal: newFoodTotal,
      gameTotal: newGamePrice,
      discount: d,
      discountMode: mode,
      promoName: activeSession.promoName || '',
      grandTotal: Math.max(0, newFoodTotal + newGamePrice - totalD),
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
  const selectedGame = allGames.find(g => g.id === activeSession?.scriptId)
  const orderArr = Array.isArray(activeSession?.order) ? activeSession.order : []
  const foodTotal = orderArr.reduce((s, x) => s + (x.totalPrice || 0) * x.qty, 0)
  const gameUnitPay = (activeSession?.customPrice !== '' && activeSession?.customPrice !== undefined)
    ? Number(activeSession.customPrice) || 0
    : selectedGame ? (selectedGame.payPrice ?? selectedGame.price ?? 0) : 0
  const sessionMembers = Array.isArray(activeSession?.members) ? activeSession.members : []
  const gamePrice = sessionMembers.length * gameUnitPay
  const discountMode = activeSession?.discountMode || 'perPerson' // 'perPerson' | 'split'
  const discountRaw = Number(activeSession?.discount) || 0
  const totalDiscount = discountMode === 'split' ? discountRaw : discountRaw * sessionMembers.length
  const discount = sessionMembers.length > 0 ? totalDiscount / sessionMembers.length : 0  // effective per-person
  const totalPersonalDiscounts = sessionMembers.reduce((s, m) => s + (Number(m.personalDiscount) || 0), 0)
  const grandTotal = Math.max(0, foodTotal + gamePrice - totalDiscount - totalPersonalDiscounts)

  // ── payment status helpers ───────────────────────────────────────
  const allMembersPaid = activeSession?.confirmedOrderId &&
    sessionMembers.length > 0 &&
    sessionMembers.every(m => memberPayments[m.uid]?.verified)
  const verifiedTotal = Object.values(memberPayments).filter(p => p.verified).reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const remainingAmount = Math.max(0, grandTotal - verifiedTotal)

  const acceptOtherQueue = async (order) => {
    const queue = order.memberFoodQueue || []
    if (queue.length === 0) return
    try {
      const cur = (order.foodItems || []).map(x => ({
        key: (x.menuId || x.name) + '|' + (x.addons || []).map(a => a.name).join(',') + '|' + (x.orderedBy?.uid || ''),
        menuId: x.menuId || '',
        name: x.name,
        basePrice: x.price || 0,
        addons: x.addons || [],
        totalPrice: x.price || 0,
        qty: x.qty || 1,
        orderedBy: x.orderedBy || null,
      }))
      const updated = [...cur]
      for (const qi of queue) {
        const key = (qi.menuId || qi.name) + '|' + (qi.addons || []).map(a => a.name).sort().join(',') + '|' + (qi.orderedBy?.uid || '')
        const idx = updated.findIndex(x => x.key === key)
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], qty: updated[idx].qty + qi.qty }
        } else {
          updated.push({ key, menuId: qi.menuId || '', name: qi.name, basePrice: qi.totalPrice, addons: qi.addons || [], totalPrice: qi.totalPrice, qty: qi.qty, orderedBy: qi.orderedBy || null })
        }
      }
      const newFoodTotal = updated.reduce((s, x) => s + (x.totalPrice || 0) * x.qty, 0)
      const membersCount = (order.members || []).length
      const gameUnitPrice = order.gameUnitPrice || (order.gameTotal && membersCount ? Math.round(order.gameTotal / membersCount) : 0)
      const gameTotal = membersCount * gameUnitPrice
      const d = Number(order.discount) || 0
      await updateDoc(doc(db, 'orders', order.id), {
        memberFoodQueue: [],
        memberFoodHistory: arrayUnion(...queue),
        foodItems: updated.map(x => ({ name: x.name, addons: x.addons || [], price: x.totalPrice, qty: x.qty, orderedBy: x.orderedBy || null })),
        foodTotal: newFoodTotal,
        grandTotal: Math.max(0, newFoodTotal + gameTotal - d * membersCount),
      })
      showToast(`รับ ${queue.length} รายการจาก ${order.room || order.scriptTitle || 'ลูกค้า'} แล้ว ✓`)

      // Print ticket
      const now = new Date()
      const isPaid = (order.members || []).length > 0 &&
        order.members.every(m => order.memberPayments?.[m.uid]?.verified)
      const html = buildKitchenTicketHTML(queue, order, now, isPaid, receiptSettings)
      const printWidth = receiptSettings?.orderIn?.paperWidth || '80mm'
      const frame = document.createElement('iframe')
      frame.style.cssText = `position:fixed;left:-9999px;top:0;width:${printWidth};height:297mm;border:0;visibility:hidden;pointer-events:none`
      document.body.appendChild(frame)
      frame.srcdoc = html
      frame.onload = () => {
        setTimeout(() => {
          try { frame.contentWindow.focus(); frame.contentWindow.print() } catch (e) { console.warn('print error', e) }
          setTimeout(() => { try { document.body.removeChild(frame) } catch {} }, 5000)
        }, 300)
      }
    } catch (e) {
      showToast('รับออเดอร์ล้มเหลว: ' + e.message, 'error')
    }
  }

  const openExistingOrder = (order) => {
    const existing = safeSessions.find(s => s.confirmedOrderId === order.id)
    if (existing) {
      setActiveId(existing.id)
      return
    }
    const newS = {
      id: Date.now() + Math.random(),
      label: order.scriptTitle ? `${order.scriptTitle} (${order.room || 'ตี้'})` : `ปาร์ตี้ ${sessionCounter++}`,
      createdAt: order.createdAt?.toDate ? order.createdAt.toDate().toISOString() : new Date().toISOString(),
      members: order.members || [],
      scriptId: order.scriptId || '',
      eventName: '',
      customPrice: '',
      dm: order.dm || '',
      npc: order.npc || '',
      room: order.room || '',
      order: (order.foodItems || []).map(x => ({
        key: (x.menuId || x.name) + '|' + (x.addons || []).map(a => a.name).join(',') + '|' + (x.orderedBy?.uid || ''),
        menuId: x.menuId || '',
        name: x.name,
        basePrice: x.price || 0,
        addons: x.addons || [],
        totalPrice: x.price || 0,
        qty: x.qty || 1,
        orderedBy: x.orderedBy || null,
      })),
      confirmedOrderId: order.id,
      promoName: order.promoName || '',
      discount: order.discount || 0,
    }
    setSessions(prev => [...(Array.isArray(prev) ? prev : []), newS])
    setActiveId(newS.id)
  }

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
        discount: discountRaw,  // raw input value (per-person or lump sum)
        discountMode,           // 'perPerson' | 'split'
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
        setEditingUnlocked(false)
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
    <div id="pos-page" className="page active" data-mobile-panel={mobilePanel}>

      {/* ─── POS redesign overrides — white-red, cleaner, less chrome ─── */}
      <style>{`
        /* Shell */
        #pos-page { background: #faf7f5 !important; min-height: 100vh; padding-top: 60px; }

        /* ── Today bar — flatter, calmer ── */
        .pos-today-bar { background: #ffffff !important; border-bottom: 1px solid rgba(26,26,26,0.06) !important; box-shadow: none !important; padding: 10px 0 !important; }
        .pos-today-bar-inner { max-width: 1340px !important; padding: 0 20px !important; }
        .pos-today-info { color: #1a1a1a !important; font-weight: 700 !important; font-size: 13px !important; display: flex !important; align-items: center !important; gap: 8px !important; }
        .pos-today-info i { color: #c62419 !important; }
        .pos-today-count { padding: 2px 10px !important; background: rgba(198,36,25,0.08) !important; color: #c62419 !important; border-radius: 999px !important; font-size: 11px !important; font-weight: 800 !important; border: 1px solid rgba(198,36,25,0.2) !important; margin-left: 4px !important; }
        .pos-today-sum { color: rgba(26,26,26,0.6) !important; font-size: 12.5px !important; font-weight: 600 !important; }
        .pos-today-list { background: #ffffff !important; border-radius: 14px !important; border: 1px solid rgba(26,26,26,0.06) !important; margin-top: 8px !important; }

        /* ── Session tabs — card-like, modern ── */
        .pos-tabs-wrap { background: transparent !important; border: none !important; padding: 14px 20px 6px !important; max-width: 1340px !important; margin: 0 auto !important; }
        .pos-tabs { gap: 6px !important; }
        .pos-tab {
          background: #ffffff !important;
          border: 1px solid rgba(26,26,26,0.08) !important;
          color: rgba(26,26,26,0.55) !important;
          padding: 8px 14px !important;
          border-radius: 10px !important;
          font-weight: 700 !important;
          font-size: 12.5px !important;
          transition: all 0.14s !important;
          box-shadow: 0 1px 2px rgba(26,26,26,0.03) !important;
        }
        .pos-tab:hover { color: #1a1a1a !important; border-color: rgba(26,26,26,0.18) !important; }
        .pos-tab.active {
          background: #c62419 !important;
          border-color: #c62419 !important;
          color: #ffffff !important;
          box-shadow: 0 4px 14px rgba(198,36,25,0.3) !important;
          transform: translateY(-1px);
        }
        .pos-tab.active .pos-tab-count { background: rgba(255,255,255,0.22) !important; color: #ffffff !important; }
        .pos-tab-count { background: rgba(198,36,25,0.1) !important; color: #c62419 !important; padding: 1px 7px !important; border-radius: 999px !important; font-size: 10.5px !important; font-weight: 800 !important; margin-left: 6px !important; border: none !important; }
        .pos-tab-close { color: rgba(255,255,255,0.6) !important; opacity: 0; margin-left: 2px !important; }
        .pos-tab.active .pos-tab-close { opacity: 0.75 !important; }
        .pos-tab.active .pos-tab-close:hover { color: #ffffff !important; opacity: 1 !important; }
        .pos-tab-add {
          background: transparent !important;
          color: #c62419 !important;
          border: 1.5px dashed rgba(198,36,25,0.4) !important;
          padding: 7px 14px !important;
          border-radius: 10px !important;
          font-weight: 700 !important;
          font-size: 12.5px !important;
        }
        .pos-tab-add:hover { background: rgba(198,36,25,0.06) !important; border-color: #c62419 !important; }
        .pos-tab-alert-badge { background: #c62419 !important; color: #fff !important; padding: 1px 7px !important; border-radius: 999px !important; font-size: 10px !important; font-weight: 800 !important; margin-left: 6px !important; }

        /* ── Main layout proportions ── */
        .pos-layout { padding: 10px 20px 60px !important; gap: 12px !important; grid-template-columns: 340px 1fr 320px !important; }
        .pos-left, .pos-middle, .pos-right {
          background: #ffffff !important;
          border-radius: 18px !important;
          border: 1px solid rgba(26,26,26,0.06) !important;
          box-shadow: 0 2px 8px rgba(26,26,26,0.04) !important;
        }

        /* ── Section titles — quieter, no shouting ── */
        .pos-section-title {
          font-size: 11px !important;
          letter-spacing: 0.14em !important;
          color: rgba(26,26,26,0.42) !important;
          font-weight: 800 !important;
          padding: 14px 18px 12px !important;
          border-bottom: 1px solid rgba(26,26,26,0.05) !important;
        }
        .pos-section-title i { color: #c62419 !important; font-size: 11px !important; }
        .pos-divider { margin: 8px 18px !important; background: rgba(26,26,26,0.05) !important; }

        /* ── Member row — cleaner ── */
        .pos-members-list { padding: 10px 14px !important; gap: 6px !important; }
        .pos-member-row {
          background: #faf7f5 !important;
          border: 1px solid rgba(26,26,26,0.05) !important;
          border-radius: 12px !important;
          padding: 10px 12px !important;
          gap: 10px !important;
        }
        .pos-member-row.pos-member-collapsible {
          display: flex !important;
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 0 !important;
          padding: 10px 12px !important;
          transition: background 0.14s, border-color 0.14s;
        }
        .pos-member-row.pos-member-collapsible.is-expanded {
          background: #ffffff !important;
          border-color: rgba(198,36,25,0.18) !important;
          box-shadow: 0 4px 14px rgba(198,36,25,0.08);
        }
        .pos-member-row.pos-member-collapsible .pos-member-head:hover {
          opacity: 0.92;
        }

        /* ── Locked state — hide inputs/edit controls, keep view interactions ── */
        .pos-left.is-locked .pos-remove-btn,
        .pos-left.is-locked .pos-scan-more-btn,
        .pos-left.is-locked .pos-lock-hide-when-locked { display: none !important; }

        /* Editing mode — subtle crimson ring to show "unlocked" */
        .pos-left.is-editing {
          box-shadow: 0 0 0 2px rgba(198,36,25,0.18), 0 2px 8px rgba(26,26,26,0.04) !important;
        }

        /* Menu picker — locked (can scroll/view, can't add) */
        .pos-middle.is-locked .pos-menu-item { pointer-events: none; }
        .pos-member-avatar, .pos-member-avatar-ph { width: 36px !important; height: 36px !important; }
        .pos-member-avatar-ph { background: #ebe4e1 !important; color: #1a1a1a !important; font-weight: 800 !important; font-size: 13px !important; display: flex !important; align-items: center !important; justify-content: center !important; }
        .pos-member-name { color: #1a1a1a !important; font-weight: 700 !important; font-size: 13.5px !important; gap: 6px !important; }
        .pos-member-paid-badge { background: #c62419 !important; color: #fff !important; border: none !important; padding: 2px 8px !important; border-radius: 999px !important; font-size: 10px !important; font-weight: 800 !important; }
        .pos-member-slip-badge { background: rgba(198,36,25,0.08) !important; color: #c62419 !important; border: 1px solid rgba(198,36,25,0.25) !important; padding: 3px 8px !important; border-radius: 999px !important; font-size: 10px !important; font-weight: 700 !important; }
        .pos-member-slip-badge:hover { background: rgba(198,36,25,0.14) !important; }
        .pos-member-pending-badge { background: rgba(26,26,26,0.06) !important; color: rgba(26,26,26,0.6) !important; padding: 2px 7px !important; border-radius: 999px !important; font-size: 10px !important; font-weight: 700 !important; }
        .pos-paid-collapse-btn { background: transparent !important; color: rgba(26,26,26,0.55) !important; font-size: 12px !important; font-weight: 700 !important; padding: 10px 14px !important; border-top: 1px solid rgba(26,26,26,0.05) !important; }
        .pos-paid-collapse-btn:hover { background: #faf7f5 !important; }
        .pos-char-select, .pos-char-input {
          background: #ffffff !important;
          border: 1px solid rgba(26,26,26,0.1) !important;
          color: #1a1a1a !important;
          font-size: 12px !important;
          padding: 6px 10px !important;
          border-radius: 8px !important;
        }
        .pos-char-select:focus, .pos-char-input:focus { border-color: #c62419 !important; box-shadow: 0 0 0 3px rgba(198,36,25,0.08) !important; outline: none !important; }
        .pos-remove-btn { color: rgba(26,26,26,0.3) !important; }
        .pos-remove-btn:hover { color: #c62419 !important; }

        /* ── Discount row ── */
        .pos-personal-disc-amt, .pos-personal-disc-note {
          background: #ffffff !important;
          border: 1px solid rgba(26,26,26,0.1) !important;
          font-size: 11.5px !important;
          padding: 6px 9px !important;
          border-radius: 8px !important;
        }
        .pos-personal-disc-amt:focus, .pos-personal-disc-note:focus { border-color: #c62419 !important; box-shadow: 0 0 0 3px rgba(198,36,25,0.08) !important; outline: none !important; }

        /* ── Scan button, Sync button ── */
        .pos-scan-more-btn {
          background: #1a1a1a !important;
          color: #ffffff !important;
          font-weight: 800 !important;
          font-size: 13px !important;
          padding: 10px 14px !important;
          border-radius: 10px !important;
        }
        .pos-scan-more-btn:hover { background: #000000 !important; }
        .pos-sync-disc-btn {
          background: #ffffff !important;
          color: #1a1a1a !important;
          border: 1px solid rgba(26,26,26,0.14) !important;
          font-weight: 700 !important;
          font-size: 12px !important;
          padding: 8px 12px !important;
          border-radius: 10px !important;
        }
        .pos-sync-disc-btn:hover { background: #faf7f5 !important; }

        /* ── Form inputs ── */
        .form-input, .form-select, .form-textarea {
          background: #ffffff !important;
          border: 1px solid rgba(26,26,26,0.1) !important;
          color: #1a1a1a !important;
          border-radius: 8px !important;
          padding: 8px 12px !important;
          font-size: 13px !important;
          transition: all 0.14s !important;
        }
        .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: #c62419 !important; box-shadow: 0 0 0 3px rgba(198,36,25,0.08) !important; outline: none !important; }
        .form-label { color: rgba(26,26,26,0.5) !important; font-size: 11px !important; font-weight: 700 !important; letter-spacing: 0.03em !important; margin-bottom: 4px !important; }

        /* ── Promo / discount section ── */
        .pos-promo-wrap { padding: 10px 14px 14px !important; display: flex !important; flex-direction: column !important; gap: 8px !important; }
        .pos-promo-name-input {
          background: #faf7f5 !important;
          border: 1px solid rgba(26,26,26,0.08) !important;
          color: #1a1a1a !important;
          padding: 9px 12px !important;
          border-radius: 10px !important;
          font-size: 12.5px !important;
        }
        .pos-promo-name-input:focus { border-color: #c62419 !important; background: #ffffff !important; outline: none !important; }
        .pos-promo-amount-input {
          background: #ffffff !important;
          border: 1px solid rgba(26,26,26,0.1) !important;
          color: #c62419 !important;
          font-weight: 800 !important;
          font-size: 14px !important;
          padding: 7px 10px !important;
          border-radius: 8px !important;
          text-align: right !important;
        }
        .pos-promo-amount-input:focus { border-color: #c62419 !important; outline: none !important; }
        .pos-promo-label { color: rgba(26,26,26,0.5) !important; font-size: 11.5px !important; font-weight: 700 !important; }
        .pos-promo-unit { color: rgba(26,26,26,0.4) !important; font-size: 11px !important; }

        /* ── Pay/CTA buttons ── */
        .pos-pay-btn {
          background: #c62419 !important;
          color: #ffffff !important;
          font-weight: 800 !important;
          font-size: 14px !important;
          padding: 12px 18px !important;
          border-radius: 12px !important;
          box-shadow: 0 6px 18px rgba(198,36,25,0.3) !important;
        }
        .pos-pay-btn:hover { background: #9a1c13 !important; }

        /* ── Right summary panel padding ── */
        .pos-right-content { padding: 12px 14px !important; }
        .pos-right-footer { background: #fdfbfa !important; }

        /* ── Empty state ── */
        .pos-empty { color: rgba(26,26,26,0.3) !important; font-size: 12.5px !important; padding: 24px 18px !important; }

        /* ── Queue bar (incoming orders) — more prominent ── */
        .pos-queue-bar { background: linear-gradient(135deg, #c62419 0%, #9a1c13 100%) !important; border: none !important; border-radius: 14px !important; box-shadow: 0 8px 24px rgba(198,36,25,0.3) !important; margin: 10px 20px 0 !important; max-width: calc(1340px - 40px) !important; margin-left: auto !important; margin-right: auto !important; }
        .pos-queue-bar.other-table { background: linear-gradient(135deg, #1a1a1a 0%, #000000 100%) !important; box-shadow: 0 8px 24px rgba(26,26,26,0.2) !important; }
        .pos-queue-badge { background: rgba(255,255,255,0.2) !important; color: #ffffff !important; backdrop-filter: blur(4px); }

        /* ─── RESPONSIVE ─── */

        /* Tablet: 2-col — left sidebar + merged middle+right */
        @media (max-width: 1200px) {
          .pos-layout { grid-template-columns: 320px 1fr !important; }
          .pos-right { grid-column: 2 !important; }
          .pos-middle, .pos-right { position: static !important; max-height: none !important; }
        }

        /* Mobile — segmented view: 1 panel at a time, top shortcut tabs */
        @media (max-width: 820px) {
          html, body { overflow-x: hidden !important; }
          #pos-page {
            padding-top: 60px; padding-bottom: 20px !important;
            overflow-x: hidden !important;
            max-width: 100vw !important;
          }
          .pos-today-bar, .pos-tabs-wrap, .pos-queue-bar, .pos-today-list { max-width: 100% !important; box-sizing: border-box !important; }
          .pos-today-bar-inner { padding: 0 14px !important; flex-wrap: wrap !important; gap: 8px !important; }
          .pos-today-info { font-size: 12.5px !important; }

          .pos-tabs-wrap { padding: 12px 14px 4px !important; overflow-x: auto !important; overflow-y: hidden !important; -webkit-overflow-scrolling: touch; width: 100% !important; box-sizing: border-box !important; margin: 0 !important; }
          .pos-tabs-wrap::-webkit-scrollbar { height: 0 !important; }
          .pos-tabs { flex-wrap: nowrap !important; min-width: min-content !important; }
          .pos-tab { flex-shrink: 0 !important; white-space: nowrap !important; max-width: 65vw !important; overflow: hidden !important; text-overflow: ellipsis !important; }
          .pos-tab-label { overflow: hidden !important; text-overflow: ellipsis !important; }
          .pos-tab-add { flex-shrink: 0 !important; white-space: nowrap !important; }

          .pos-queue-bar { margin: 8px 14px 0 !important; width: calc(100% - 28px) !important; max-width: calc(100% - 28px) !important; }
          .pos-today-list { margin: 6px 14px 0 !important; width: calc(100% - 28px) !important; max-width: calc(100% - 28px) !important; }

          .pos-layout {
            grid-template-columns: 1fr !important;
            padding: 8px 14px 20px !important;
            gap: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .pos-left, .pos-middle, .pos-right {
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
            border-radius: 16px !important;
            grid-column: 1 / -1 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          /* Show only the active mobile panel */
          #pos-page[data-mobile-panel="members"] .pos-middle,
          #pos-page[data-mobile-panel="members"] .pos-right { display: none !important; }
          #pos-page[data-mobile-panel="menu"] .pos-left,
          #pos-page[data-mobile-panel="menu"] .pos-right { display: none !important; }
          #pos-page[data-mobile-panel="order"] .pos-left,
          #pos-page[data-mobile-panel="order"] .pos-middle { display: none !important; }

          .pos-section-title { padding: 12px 14px 10px !important; font-size: 10.5px !important; }
          .pos-members-list { padding: 8px 10px !important; }
          .pos-member-row { padding: 9px 10px !important; }
          .pos-member-avatar, .pos-member-avatar-ph { width: 34px !important; height: 34px !important; }
          .pos-member-name { font-size: 13px !important; }
          .pos-personal-disc-row { flex-wrap: wrap !important; }
          .pos-personal-disc-amt { flex: 0 0 90px !important; min-width: 0 !important; }
          .pos-personal-disc-note { flex: 1 1 120px !important; min-width: 0 !important; }

          .pos-member-actions { padding: 0 10px 12px !important; }
          .pos-divider { margin: 6px 14px !important; }
          .pos-promo-wrap { padding: 8px 10px 12px !important; }

          .pos-queue-bar { margin: 8px 14px 0 !important; max-width: calc(100% - 28px) !important; }
          .pos-queue-bar-top { flex-wrap: wrap !important; gap: 8px !important; }

          .pos-today-list { margin: 6px 14px 0 !important; max-width: calc(100% - 28px) !important; }
          .pos-today-item-left { min-width: 0 !important; }
          .pos-today-game { font-size: 13px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }

          .pos-pay-btn { font-size: 13.5px !important; padding: 11px 14px !important; }

          /* Mobile top shortcut tabs */
          .pos-mobile-shortcut { display: flex !important; }
          #pos-page { padding-bottom: 20px !important; }
        }

        /* Desktop: hide mobile shortcut */
        .pos-mobile-shortcut { display: none; }
        @media (min-width: 821px) {
          .pos-mobile-shortcut { display: none !important; }
        }

        /* ── Mobile top shortcut tabs (sticky under party tabs) ── */
        .pos-mobile-shortcut {
          position: sticky; top: 60px; z-index: 30;
          display: none;
          gap: 6px;
          padding: 10px 14px;
          background: rgba(250,247,245,0.92);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(26,26,26,0.06);
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .pos-mobile-shortcut-btn {
          flex: 1; display: flex; align-items: center; justify-content: center;
          gap: 6px; padding: 9px 8px;
          background: #ffffff;
          border: 1px solid rgba(26,26,26,0.08);
          border-radius: 10px;
          color: rgba(26,26,26,0.6);
          font-size: 12px; font-weight: 800;
          font-family: 'Sarabun', sans-serif;
          cursor: pointer; transition: all 0.14s;
          position: relative;
          letter-spacing: 0.01em;
        }
        .pos-mobile-shortcut-btn.active {
          background: #c62419;
          border-color: #c62419;
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(198,36,25,0.3);
          transform: translateY(-1px);
        }
        .pos-mobile-shortcut-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px; padding: 0 5px;
          border-radius: 999px;
          background: rgba(198,36,25,0.1); color: #c62419;
          font-size: 10px; font-weight: 900;
          margin-left: 2px;
        }
        .pos-mobile-shortcut-btn.active .pos-mobile-shortcut-badge {
          background: rgba(255,255,255,0.22); color: #ffffff;
        }

        /* Very small (iPhone SE etc.) */
        @media (max-width: 400px) {
          .pos-today-bar-inner { padding: 0 10px !important; }
          .pos-tabs-wrap { padding: 10px 10px 4px !important; }
          .pos-layout { padding: 6px 10px 100px !important; gap: 8px !important; }
          .pos-section-title { padding: 10px 12px 8px !important; }
          .pos-members-list { padding: 6px 8px !important; }
          .pos-member-row { padding: 8px 9px !important; gap: 8px !important; }
          .pos-member-avatar, .pos-member-avatar-ph { width: 32px !important; height: 32px !important; }
          .pos-member-name { font-size: 12.5px !important; gap: 4px !important; flex-wrap: wrap !important; }
          .pos-char-select, .pos-char-input { font-size: 11.5px !important; padding: 5px 8px !important; }
          .pos-personal-disc-amt, .pos-personal-disc-note { font-size: 11px !important; padding: 5px 8px !important; }

          .pos-tab { padding: 7px 11px !important; font-size: 11.5px !important; }
          .pos-tab-add { padding: 6px 11px !important; font-size: 11.5px !important; }
          .pos-queue-bar { margin: 6px 10px 0 !important; max-width: calc(100% - 20px) !important; }
          .pos-today-list { margin: 4px 10px 0 !important; max-width: calc(100% - 20px) !important; }
        }
      `}</style>

      {/* ── TODAY BAR ── */}
      <div className="pos-today-bar">
        <div className="pos-today-bar-inner">
          <div className="pos-today-info" onClick={() => setShowHistory(h => !h)}>
            <i className="fas fa-calendar-day" />
            <span>ปาร์ตี้วันนี้: <strong>{todayOrders.length} รอบ</strong></span>
            <span className="pos-today-total">฿{todayOrders.reduce((s, o) => s + (o.grandTotal || 0), 0).toLocaleString()}</span>
            <i className={`fas fa-chevron-${showHistory ? 'up' : 'down'}`} style={{ fontSize: 11, opacity: 0.6 }} />
          </div>
          <button
            className={`pos-sound-header-btn${soundMuted ? ' muted' : (totalPendingQueueCount > 0 ? ' sounding' : '')}`}
            onClick={(e) => { e.stopPropagation(); toggleSoundMute() }}
            title={soundMuted ? 'คลิกเพื่อเปิดเสียงแจ้งเตือนออเดอร์' : 'เสียงเตือนเปิดอยู่ (ดังทุก 5 วินาทีเมื่อมีออเดอร์ใหม่)'}
          >
            <i className={`fas fa-${soundMuted ? 'volume-mute' : 'volume-up'}${totalPendingQueueCount > 0 && !soundMuted ? ' fa-shake' : ''}`} />
            <span>{soundMuted ? 'ปิดเสียง' : 'เสียงเตือน (5วิ)'}</span>
          </button>
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
          {safeSessions.map(s => {
            const isCurrent = s.id === activeSession.id
            const pendingCount = isCurrent
              ? memberQueue.length
              : (todayOrders.find(o => o.id === s.confirmedOrderId)?.memberFoodQueue?.length || 0)
            return (
              <div
                key={s.id}
                className={`pos-tab${isCurrent ? ' active' : ''}${s.confirmedOrderId ? ' confirmed' : ''}${pendingCount > 0 ? ' has-pending' : ''}`}
                onClick={() => setActiveId(s.id)}
              >
                <span className="pos-tab-label">
                  {s.confirmedOrderId && <i className="fas fa-check-circle" style={{ marginRight: 5, color: 'var(--feedback-success-icon)', fontSize: 10 }} />}
                  {(() => {
                    const game = allGames.find(g => g.id === s.scriptId)
                    const date = fmtDate(s.createdAt ? new Date(s.createdAt) : new Date())
                    return game ? `${game.title} ${date}` : s.label
                  })()}
                  {(s.members || []).length > 0 && <span className="pos-tab-count">{s.members.length}</span>}
                  {pendingCount > 0 && (
                    <span className="pos-tab-alert-badge" title={`มีออเดอร์ใหม่รอรับ ${pendingCount} รายการ`}>
                      <i className="fas fa-bell fa-shake" /> {pendingCount}
                    </span>
                  )}
                </span>
                {safeSessions.length > 1 && (
                  <button className="pos-tab-close" onClick={e => { e.stopPropagation(); removeSession(s.id) }}>
                    <i className="fas fa-times" />
                  </button>
                )}
              </div>
            )
          })}
          <button className="pos-tab-add" onClick={addSession}>
            <i className="fas fa-plus" /> ปาร์ตี้ใหม่
          </button>
        </div>
      </div>

      {/* ── MOBILE TOP SHORTCUT TABS (visible <820px) ── */}
      <div className="pos-mobile-shortcut">
        {[
          { key: 'members', icon: 'fa-users', label: 'สมาชิก', badge: (activeSession.members || []).length },
          { key: 'menu', icon: 'fa-utensils', label: 'เมนู', badge: 0 },
          { key: 'order', icon: 'fa-receipt', label: 'สรุปออเดอร์', badge: orderArr.length },
        ].map(t => {
          const active = mobilePanel === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setMobilePanel(t.key)
                // Scroll to top so user sees the panel from start
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              className={`pos-mobile-shortcut-btn${active ? ' active' : ''}`}
            >
              <i className={`fas ${t.icon}`} style={{ fontSize: 12 }} />
              <span>{t.label}</span>
              {t.badge > 0 && (
                <span className="pos-mobile-shortcut-badge">{t.badge}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── OTHER TABLES QUEUE ALERTS ── */}
      {otherPendingOrders.map(o => (
        <div key={o.id} className="pos-queue-bar other-table">
          <div className="pos-queue-bar-top">
            <span className="pos-queue-badge other">
              <i className="fas fa-bell fa-shake" /> มีออเดอร์ใหม่จาก {o.room ? `ห้อง ${o.room}` : (o.scriptTitle || 'ปาร์ตี้อื่น')} ({(o.memberFoodQueue || []).length} รายการ)
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className={`pos-queue-sound-btn ${soundMuted ? 'muted' : 'active'}`}
                onClick={toggleSoundMute}
                title={soundMuted ? 'เปิดเสียงเตือน' : 'ปิดเสียงเตือน'}
              >
                <i className={`fas fa-${soundMuted ? 'volume-mute' : 'volume-up'}`} />
              </button>
              <button className="pos-queue-switch-btn" onClick={() => openExistingOrder(o)}>
                <i className="fas fa-arrow-right" /> ไปที่ปาร์ตี้นี้
              </button>
              <button className="pos-queue-accept-all" onClick={() => acceptOtherQueue(o)}>
                <i className="fas fa-check-double" /> รับทั้งหมด
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* ── MEMBER FOOD QUEUE (CURRENT SESSION) ── */}
      {memberQueue.length > 0 && (
        <div className="pos-queue-bar">
          <div className="pos-queue-bar-top">
            <span className="pos-queue-badge">
              <i className="fas fa-bell fa-shake" /> {memberQueue.length} รายการจากลูกค้า
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className={`pos-queue-sound-btn ${soundMuted ? 'muted' : 'active'}`}
                onClick={toggleSoundMute}
                title={soundMuted ? 'เปิดเสียงเตือน' : 'ปิดเสียงเตือน (เตือนทุก 5 วินาที)'}
              >
                <i className={`fas fa-${soundMuted ? 'volume-mute' : 'volume-up'}`} />
                <span>{soundMuted ? 'เปิดเสียง' : 'เสียงเตือน (5วิ)'}</span>
              </button>
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
                  {qi.orderedBy && <span className="pos-queue-item-by"><i className="fas fa-user" /> {(qi.orderedBy.name || '').split(' ')[0]}</span>}
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
        <div className={`pos-left${isLocked ? ' is-locked' : ''}${editingUnlocked ? ' is-editing' : ''}`}>
          {/* Lock / edit banner — only visible after order is confirmed */}
          {activeSession?.confirmedOrderId && (
            <div className="pos-lock-banner" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              background: isLocked ? '#faf7f5' : 'rgba(198,36,25,0.08)',
              borderBottom: `1px solid ${isLocked ? 'rgba(26,26,26,0.06)' : 'rgba(198,36,25,0.2)'}`,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: isLocked ? 'rgba(26,26,26,0.06)' : 'rgba(198,36,25,0.15)',
                color: isLocked ? 'rgba(26,26,26,0.55)' : '#c62419',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <i className={`fas fa-${isLocked ? 'lock' : 'pen'}`} style={{ fontSize: 13 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.2 }}>
                  {isLocked ? 'ยืนยันออเดอร์แล้ว' : 'โหมดแก้ไข'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', marginTop: 2 }}>
                  {isLocked ? 'กด "แก้ไข" เพื่อปรับข้อมูล' : 'กดอัปเดตเมื่อเสร็จ หรือยกเลิก'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUnlocked(v => !v)}
                style={{
                  padding: '7px 14px', borderRadius: 10,
                  background: isLocked ? '#1a1a1a' : '#ffffff',
                  color: isLocked ? '#ffffff' : '#1a1a1a',
                  border: isLocked ? 'none' : '1px solid rgba(26,26,26,0.14)',
                  fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: "'Sarabun', sans-serif",
                  flexShrink: 0,
                }}
              >
                <i className={`fas fa-${isLocked ? 'pen' : 'times'}`} style={{ fontSize: 10 }} />
                {isLocked ? 'แก้ไข' : 'ยกเลิก'}
              </button>
            </div>
          )}

          <div className="pos-section-title"><i className="fas fa-users" /> สมาชิก <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'rgba(26,26,26,0.4)', textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>{(activeSession.members || []).length} คน</span></div>

          <div className="pos-members-list">
            {(activeSession.members || []).length === 0 && <div className="pos-empty">ยังไม่มีสมาชิก</div>}

            {/* Unpaid members */}
            {(activeSession.members || []).filter(m => !memberPayments[m.uid]?.verified).map(m => {
              const expanded = expandedMembers.has(m.uid)
              const myItems = orderArr.filter(x => x.orderedBy?.uid === m.uid)
              const bill = getMemberBill(m)
              const myFoodTotal = myItems.reduce((s, x) => s + (x.totalPrice || 0) * x.qty, 0)
              const discountPerPerson = sessionMembers.length > 0 ? totalDiscount / sessionMembers.length : 0
              const toggleMember = () => setExpandedMembers(prev => {
                const next = new Set(prev)
                if (next.has(m.uid)) next.delete(m.uid); else next.add(m.uid)
                return next
              })
              return (
                <div key={m.uid} className={`pos-member-row pos-member-collapsible${expanded ? ' is-expanded' : ''}`}>
                  {/* ── Collapsed head ── */}
                  <button
                    type="button"
                    onClick={toggleMember}
                    className="pos-member-head"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'inherit',
                    }}
                  >
                    {m.avatar
                      ? <img src={m.avatar} alt="" className="pos-member-avatar" />
                      : <div className="pos-member-avatar-ph">{(m.name || '?')[0]}</div>
                    }
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div className="pos-member-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                        {memberPayments[m.uid]?.easyslipPending && (
                          <span className="pos-member-pending-badge" title="รอ Bangkok Bank ยืนยันอัตโนมัติ">
                            <i className="fas fa-hourglass-half" /> รอ BK
                          </span>
                        )}
                        {memberPayments[m.uid]?.pendingAdminReview && (
                          <span
                            className="pos-member-slip-badge"
                            onClick={e => { e.stopPropagation(); setSlipVerifyMember(m) }}
                            title="คลิกตรวจสลิป EasySlip"
                            role="button"
                          >
                            <i className="fas fa-camera" /> ตรวจสลิป
                          </span>
                        )}
                      </div>
                      {m.character && (
                        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <i className="fas fa-user-tag" style={{ marginRight: 4, color: '#c62419', fontSize: 9 }} />{m.character}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#c62419', lineHeight: 1 }}>฿{bill.toLocaleString()}</div>
                      <div style={{ fontSize: 9.5, color: 'rgba(26,26,26,0.4)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>ต้องจ่าย</div>
                    </div>
                    <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} style={{ color: 'rgba(26,26,26,0.35)', fontSize: 11, marginLeft: 2 }} />
                  </button>

                  {/* ── Expanded detail ── */}
                  {expanded && (
                    <div style={{
                      marginTop: 10, paddingTop: 10,
                      borderTop: '1px dashed rgba(26,26,26,0.1)',
                      display: 'flex', flexDirection: 'column', gap: 12,
                    }}>
                      {/* Character */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(26,26,26,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>ตัวละคร</div>
                        {isLocked ? (
                          <div style={{ fontSize: 13, fontWeight: 700, color: m.character ? '#1a1a1a' : 'rgba(26,26,26,0.35)', padding: '6px 0' }}>
                            {m.character || '— ยังไม่กำหนด —'}
                          </div>
                        ) : selectedGame?.characters?.length > 0 ? (
                          <select className="pos-char-select" value={m.character} onChange={e => setCharacter(m.uid, e.target.value)}>
                            <option value="">— เลือกตัวละคร —</option>
                            {selectedGame.characters.map((c, i) => (
                              <option key={i} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input className="pos-char-input" placeholder="ตัวละคร..." value={m.character} onChange={e => setCharacter(m.uid, e.target.value)} />
                        )}
                      </div>

                      {/* Items ordered by this member */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(26,26,26,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>รายการที่สั่ง{myItems.length > 0 ? ` · ${myItems.length}` : ''}</span>
                          {myFoodTotal > 0 && <span style={{ color: '#1a1a1a', fontSize: 10.5 }}>฿{myFoodTotal.toLocaleString()}</span>}
                        </div>
                        {myItems.length === 0 ? (
                          <div style={{ fontSize: 11.5, color: 'rgba(26,26,26,0.3)', padding: '6px 2px' }}>ยังไม่มีรายการ</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid rgba(26,26,26,0.06)' }}>
                            {myItems.map((it, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#1a1a1a', padding: '2px 0' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {it.name}
                                  {it.qty > 1 && <span style={{ color: 'rgba(26,26,26,0.5)' }}> ×{it.qty}</span>}
                                  {it.addons?.length > 0 && <span style={{ color: 'rgba(26,26,26,0.4)', fontSize: 11 }}> ({it.addons.map(a => a.name).join(', ')})</span>}
                                </span>
                                <span style={{ fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>฿{(it.totalPrice * it.qty).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Breakdown summary */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: 'rgba(26,26,26,0.6)', background: '#faf7f5', padding: '8px 12px', borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>ค่าเกม / คน</span>
                          <span>฿{gameUnitPay.toLocaleString()}</span>
                        </div>
                        {myFoodTotal > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>อาหาร / เครื่องดื่ม</span>
                            <span>฿{myFoodTotal.toLocaleString()}</span>
                          </div>
                        )}
                        {discountPerPerson > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62419' }}>
                            <span>− โปร{activeSession.promoName ? ` (${activeSession.promoName})` : ''}</span>
                            <span>−฿{discountPerPerson.toLocaleString()}</span>
                          </div>
                        )}
                        {Number(m.personalDiscount) > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62419' }}>
                            <span>− {m.personalDiscountNote || 'ส่วนลดเพิ่มเติม'}</span>
                            <span>−฿{Number(m.personalDiscount).toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                      {/* Topup / personal discount */}
                      {isLocked ? (
                        Number(m.personalDiscount) > 0 && (
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(26,26,26,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>ส่วนลดเพิ่มเติม / Topup</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#1a1a1a' }}>
                              <span style={{ fontWeight: 600 }}>{m.personalDiscountNote || 'ส่วนลดเพิ่มเติม'}</span>
                              <span style={{ fontWeight: 800, color: '#c62419' }}>−฿{Number(m.personalDiscount).toLocaleString()}</span>
                            </div>
                          </div>
                        )
                      ) : (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(26,26,26,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>ส่วนลดเพิ่มเติม / Topup</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              className="pos-personal-disc-note"
                              placeholder="ชื่อ (เช่น Topup, คูปอง)"
                              value={m.personalDiscountNote || ''}
                              onChange={e => setPersonalDiscountNote(m.uid, e.target.value)}
                              style={{ flex: 1 }}
                            />
                            <input
                              className="pos-personal-disc-amt"
                              type="number" min="0"
                              placeholder="฿"
                              value={m.personalDiscount || ''}
                              onChange={e => setPersonalDiscount(m.uid, e.target.value)}
                              style={{ width: 90 }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Remove member */}
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => removeMember(m.uid)}
                          style={{
                            padding: '8px 12px', borderRadius: 10,
                            background: 'rgba(26,26,26,0.04)', border: '1px solid rgba(26,26,26,0.08)',
                            color: 'rgba(26,26,26,0.6)', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            fontFamily: "'Sarabun', sans-serif", transition: 'all 0.14s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(198,36,25,0.08)'; e.currentTarget.style.color = '#c62419'; e.currentTarget.style.borderColor = 'rgba(198,36,25,0.3)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.04)'; e.currentTarget.style.color = 'rgba(26,26,26,0.6)'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)' }}
                        >
                          <i className="fas fa-user-minus" style={{ fontSize: 10 }} /> ลบสมาชิกออก
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

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

          {/* Searchable game picker — read-only when locked */}
          {isLocked ? (
            <div style={{ margin: '0 18px', padding: '10px 12px', background: '#faf7f5', border: '1px solid rgba(26,26,26,0.06)', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: selectedGame ? '#1a1a1a' : 'rgba(26,26,26,0.35)' }}>
                {selectedGame ? selectedGame.title : '— ไม่ได้เลือกเกม —'}
              </div>
            </div>
          ) : (
          <div style={{ position: 'relative', margin: '0 18px' }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', border: '1px solid rgba(0,0,0,0.15)',
                borderRadius: 8, padding: '0 10px', height: 38, cursor: 'text',
              }}
              onClick={() => { setGameDropOpen(true); setTimeout(() => document.getElementById('pos-game-search')?.focus(), 0) }}
            >
              <i className="fas fa-search" style={{ color: 'rgba(0,0,0,0.35)', fontSize: 11, flexShrink: 0 }} />
              <input
                id="pos-game-search"
                type="text"
                placeholder={selectedGame ? selectedGame.title : '— เลือกเกม —'}
                value={gameSearch}
                onChange={e => { setGameSearch(e.target.value); setGameDropOpen(true) }}
                onFocus={() => setGameDropOpen(true)}
                onBlur={() => setTimeout(() => setGameDropOpen(false), 200)}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: gameSearch ? '#000' : (selectedGame ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)'),
                  fontSize: 13, fontWeight: 600,
                }}
              />
              {(activeSession.scriptId || gameSearch) && (
                <button
                  onMouseDown={e => { e.preventDefault(); updateActive({ scriptId: '', eventName: '', customPrice: '' }); setGameSearch(''); setGameDropOpen(false) }}
                  style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.35)', cursor: 'pointer', padding: 0, fontSize: 11 }}
                ><i className="fas fa-times" /></button>
              )}
            </div>
            {gameDropOpen && (
              <div style={{
                position: 'absolute', top: 42, left: 0, right: 0, zIndex: 200,
                background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, maxHeight: 220, overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              }}>
                {allGames
                  .filter(g => !gameSearch || g.title?.toLowerCase().includes(gameSearch.toLowerCase()))
                  .map(g => {
                    const price = g.payPrice ?? g.price
                    const isSel = activeSession.scriptId === g.id
                    return (
                      <div
                        key={g.id}
                        onMouseDown={e => { e.preventDefault(); updateActive({ scriptId: g.id, customPrice: '' }); setGameSearch(''); setGameDropOpen(false) }}
                        style={{
                          padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          background: isSel ? 'rgba(198,36,25,0.15)' : 'transparent',
                          borderLeft: isSel ? '2px solid #c62419' : '2px solid transparent',
                          color: isSel ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)',
                        }}
                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{ fontWeight: isSel ? 700 : 500 }}>{g.title}</span>
                        {price ? <span style={{ fontSize: 11, color: '#c8a050', flexShrink: 0 }}>฿{price}/คน</span> : null}
                      </div>
                    )
                  })}
                {allGames.filter(g => !gameSearch || g.title?.toLowerCase().includes(gameSearch.toLowerCase())).length === 0 && (
                  <div style={{ padding: '12px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>ไม่พบสคริปต์</div>
                )}
              </div>
            )}
          </div>
          )}

          {isLocked ? (
            ((activeSession.dm || activeSession.npc || activeSession.room) && (
              <div style={{ margin: '8px 18px 20px', padding: '8px 12px', background: '#faf7f5', borderRadius: 10, border: '1px solid rgba(26,26,26,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeSession.dm && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'rgba(26,26,26,0.5)', fontWeight: 700 }}>DM</span>
                    <span style={{ fontWeight: 700, color: '#1a1a1a' }}>{activeSession.dm}</span>
                  </div>
                )}
                {activeSession.npc && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'rgba(26,26,26,0.5)', fontWeight: 700 }}>NPC</span>
                    <span style={{ fontWeight: 700, color: '#1a1a1a' }}>{activeSession.npc}</span>
                  </div>
                )}
                {activeSession.room && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'rgba(26,26,26,0.5)', fontWeight: 700 }}>ห้อง</span>
                    <span style={{ fontWeight: 700, color: '#c62419' }}>{activeSession.room}</span>
                  </div>
                )}
              </div>
            )) || null
          ) : (
            <>
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
            </>
          )}

          {/* Promo + mode toggle — show locked summary or full editor */}
          {isLocked ? (
            (totalDiscount > 0 || activeSession.promoName) && (
              <>
                <div className="pos-divider" />
                <div className="pos-section-title"><i className="fas fa-tag" /> โปรโมชัน / ส่วนลด</div>
                <div style={{ margin: '0 18px 14px', padding: '12px 14px', background: '#faf7f5', borderRadius: 10, border: '1px solid rgba(26,26,26,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activeSession.promoName || 'ส่วนลด'}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: '#c62419', flexShrink: 0 }}>
                      −฿{totalDiscount.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.55)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{discountMode === 'split' ? 'เฉลี่ยทั้งตี้' : 'คนต่อคน'}</span>
                    <span>คนละ ฿{discount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </>
            )
          ) : (
            <>
              <div className="pos-divider" />
              <div className="pos-section-title"><i className="fas fa-tag" /> โปรโมชัน / ส่วนลด</div>
              <div className="pos-promo-wrap">
                <input
                  className="pos-promo-name-input"
                  placeholder="ชื่อโปร เช่น วันเกิด, สมาชิก..."
                  value={activeSession.promoName || ''}
                  onChange={e => updateActive({ promoName: e.target.value })}
                />

                {/* Mode toggle */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
                  padding: 3, background: '#f0ebe9', borderRadius: 10,
                }}>
                  {[
                    { key: 'perPerson', label: 'คนต่อคน', hint: 'ลดคนละเท่ากัน' },
                    { key: 'split', label: 'เฉลี่ยทั้งตี้', hint: 'หารเฉลี่ย' },
                  ].map(opt => {
                    const active = discountMode === opt.key
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => updateActive({ discountMode: opt.key })}
                        style={{
                          padding: '7px 8px', borderRadius: 8,
                          background: active ? '#ffffff' : 'transparent',
                          color: active ? '#1a1a1a' : 'rgba(26,26,26,0.55)',
                          border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: 800,
                          boxShadow: active ? '0 2px 6px rgba(26,26,26,0.08)' : 'none',
                          fontFamily: "'Sarabun', sans-serif",
                          display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.1,
                        }}
                      >
                        <span>{opt.label}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: active ? 'rgba(26,26,26,0.5)' : 'rgba(26,26,26,0.4)', letterSpacing: 0 }}>{opt.hint}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="pos-promo-amount-row">
                  <span className="pos-promo-label">{discountMode === 'split' ? 'ลดรวม' : 'ลดคนละ'}</span>
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

                {discountRaw > 0 && (
                  <div className="pos-promo-preview" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div>
                      <i className="fas fa-check-circle" /> {activeSession.promoName || 'ส่วนลด'} · รวม <strong>−฿{totalDiscount.toLocaleString()}</strong>
                    </div>
                    {sessionMembers.length > 0 && (
                      <div style={{ fontSize: 10.5, color: 'rgba(26,26,26,0.55)', paddingLeft: 18 }}>
                        {discountMode === 'split'
                          ? `หารเฉลี่ย ${sessionMembers.length} คน = คนละ ฿${discount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                          : `${sessionMembers.length} คน × ฿${discountRaw.toLocaleString()}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* MIDDLE — menu */}
        <div className={`pos-middle${isLocked ? ' is-locked' : ''}`}>
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
                {menuCategories.filter(c => c !== 'ทั้งหมด').map(cat => (
                  <button
                    key={cat}
                    className={`pos-menu-cat-chip${menuCategory === cat ? ' active' : ''}`}
                    onClick={() => setMenuCategory(menuCategory === cat ? 'ทั้งหมด' : cat)}
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
          <div className="pos-section-title">
            <i className="fas fa-receipt" /> สรุปออเดอร์
            {orderArr.length > 0 && (
              <span style={{ marginLeft: 'auto', fontWeight: 800, color: 'rgba(26,26,26,0.5)', textTransform: 'none', letterSpacing: 0, fontSize: 11, padding: '2px 9px', borderRadius: 999, background: 'rgba(26,26,26,0.05)' }}>
                {orderArr.length} รายการ
              </span>
            )}
          </div>

          <div className="pos-right-content">
            <div className="pos-summary">
              {/* Game card */}
              {selectedGame && (
                <div style={{
                  padding: '14px 14px', borderRadius: 14,
                  background: 'linear-gradient(135deg, #faf7f5 0%, #ffffff 100%)',
                  border: '1px solid rgba(26,26,26,0.06)',
                  display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(198,36,25,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="fas fa-scroll" style={{ color: '#c62419', fontSize: 13 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedGame.title}</div>
                      <div style={{ fontSize: 10.5, color: 'rgba(26,26,26,0.5)', marginTop: 1, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {selectedGame.players && <span><i className="fas fa-users" style={{ fontSize: 9, marginRight: 3 }} />{selectedGame.players} คน</span>}
                        {selectedGame.time && <span><i className="fas fa-clock" style={{ fontSize: 9, marginRight: 3 }} />{selectedGame.time}</span>}
                      </div>
                    </div>
                  </div>
                  {gameUnitPay > 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8, borderTop: '1px dashed rgba(26,26,26,0.1)' }}>
                      <span style={{ fontSize: 11.5, color: 'rgba(26,26,26,0.55)' }}>฿{gameUnitPay.toLocaleString()} × {activeSession.members.length} คน</span>
                      <span style={{ fontSize: 16, fontWeight: 900, color: '#c62419' }}>฿{gamePrice.toLocaleString()}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8, borderTop: '1px dashed rgba(26,26,26,0.1)' }}>
                      <span style={{ fontSize: 11.5, color: 'rgba(26,26,26,0.55)' }}>ค่าเกม</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: '#c8a050' }}>ฟรี</span>
                    </div>
                  )}
                </div>
              )}

              {/* Food/drink items */}
              {orderArr.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 2px 6px' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(26,26,26,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      <i className="fas fa-utensils" style={{ color: '#c62419', marginRight: 5, fontSize: 10 }} />
                      อาหาร / เครื่องดื่ม
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1a1a1a' }}>฿{foodTotal.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', background: '#ffffff', borderRadius: 12, border: '1px solid rgba(26,26,26,0.06)', overflow: 'hidden' }}>
                    {orderArr.map((x, i) => (
                      <div key={x.key} style={{
                        padding: '10px 12px',
                        borderTop: i > 0 ? '1px solid rgba(26,26,26,0.05)' : 'none',
                        display: 'flex', flexDirection: 'column', gap: 6,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3 }}>
                              {x.name} <span style={{ color: 'rgba(26,26,26,0.45)', fontWeight: 600 }}>× {x.qty}</span>
                            </div>
                            {x.addons?.length > 0 && (
                              <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.5)', marginTop: 2 }}>
                                {x.addons.map(a => a.name).join(', ')}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#1a1a1a' }}>฿{(x.totalPrice * x.qty).toLocaleString()}</span>
                            {!isLocked && (
                              <button onClick={() => voidItem(x.key)} title="ยกเลิกรายการนี้" style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(26,26,26,0.04)', border: 'none', color: 'rgba(26,26,26,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(198,36,25,0.1)'; e.currentTarget.style.color = '#c62419' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.04)'; e.currentTarget.style.color = 'rgba(26,26,26,0.4)' }}
                              >
                                <i className="fas fa-trash-alt" style={{ fontSize: 10 }} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Bill owner — compact chip row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          {editingBillKey === x.key ? (
                            <>
                              {activeSession.members.map(m => (
                                <button key={m.uid} onClick={() => assignBillOwner(x.key, { uid: m.uid, name: m.name, avatar: m.avatar || '' })} style={{
                                  fontSize: 10.5, padding: '3px 8px', borderRadius: 999,
                                  background: x.orderedBy?.uid === m.uid ? '#c62419' : '#faf7f5',
                                  color: x.orderedBy?.uid === m.uid ? '#fff' : '#1a1a1a',
                                  border: `1px solid ${x.orderedBy?.uid === m.uid ? '#c62419' : 'rgba(26,26,26,0.1)'}`,
                                  cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontWeight: 700,
                                }}>
                                  {(m.name || '').split(' ')[0]}
                                </button>
                              ))}
                              {x.orderedBy && (
                                <button onClick={() => assignBillOwner(x.key, null)} style={{
                                  fontSize: 10.5, padding: '3px 8px', borderRadius: 999,
                                  background: 'transparent', color: 'rgba(26,26,26,0.5)',
                                  border: '1px solid rgba(26,26,26,0.14)', cursor: 'pointer',
                                  fontFamily: "'Sarabun',sans-serif", fontWeight: 600,
                                }}>ล้าง</button>
                              )}
                              <button onClick={() => setEditingBillKey(null)} style={{
                                fontSize: 10, padding: '3px 7px', borderRadius: 999,
                                background: '#1a1a1a', color: '#fff', border: 'none', cursor: 'pointer',
                                fontWeight: 700,
                              }}>
                                <i className="fas fa-check" /> เสร็จ
                              </button>
                            </>
                          ) : isLocked ? (
                            x.orderedBy && (
                              <span style={{
                                fontSize: 10.5, padding: '2px 8px', borderRadius: 999,
                                background: 'rgba(198,36,25,0.07)', color: '#c62419',
                                border: '1px solid rgba(198,36,25,0.2)', fontWeight: 700,
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}>
                                <i className="fas fa-user" style={{ fontSize: 8 }} />{x.orderedBy.name.split(' ')[0]}
                              </span>
                            )
                          ) : (
                            <button onClick={() => setEditingBillKey(x.key)} style={{
                              fontSize: 10.5, padding: '3px 9px', borderRadius: 999,
                              background: x.orderedBy ? 'rgba(198,36,25,0.08)' : 'transparent',
                              color: x.orderedBy ? '#c62419' : 'rgba(26,26,26,0.45)',
                              border: `1px dashed ${x.orderedBy ? 'rgba(198,36,25,0.3)' : 'rgba(26,26,26,0.15)'}`,
                              cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontWeight: 700,
                            }}>
                              <i className="fas fa-user-tag" style={{ marginRight: 4, fontSize: 9 }} />
                              {x.orderedBy ? x.orderedBy.name.split(' ')[0] : 'ระบุเจ้าบิล'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Discounts */}
              {(totalDiscount > 0 || activeSession.members.some(m => Number(m.personalDiscount) > 0)) && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(198,36,25,0.04)', border: '1px solid rgba(198,36,25,0.15)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {totalDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                      <span style={{ color: 'rgba(26,26,26,0.75)' }}>
                        <i className="fas fa-tag" style={{ color: '#c62419', fontSize: 10, marginRight: 5 }} />
                        {activeSession.promoName || 'ส่วนลด'}
                        <span style={{ color: 'rgba(26,26,26,0.4)', fontSize: 10, marginLeft: 4 }}>
                          ({discountMode === 'split' ? 'เฉลี่ย' : `฿${discountRaw}×${activeSession.members.length}`})
                        </span>
                      </span>
                      <span style={{ color: '#c62419', fontWeight: 800 }}>−฿{totalDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  {activeSession.members.filter(m => Number(m.personalDiscount) > 0).map(m => (
                    <div key={m.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                      <span style={{ color: 'rgba(26,26,26,0.65)' }}>
                        <i className="fas fa-user-tag" style={{ color: '#c62419', fontSize: 9, marginRight: 5 }} />
                        {m.name.split(' ')[0]}{m.personalDiscountNote ? ` · ${m.personalDiscountNote}` : ''}
                      </span>
                      <span style={{ color: '#c62419', fontWeight: 800 }}>−฿{Number(m.personalDiscount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Grand total hero */}
              {(selectedGame || orderArr.length > 0) ? (
                <div style={{
                  marginTop: 12, padding: '14px 16px', borderRadius: 14,
                  background: 'linear-gradient(135deg, #c62419 0%, #9a1c13 100%)',
                  color: '#fff', boxShadow: '0 6px 20px rgba(198,36,25,0.3)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>ยอดรวม</span>
                  <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>฿{grandTotal.toLocaleString()}</span>
                </div>
              ) : (
                <div style={{ padding: '28px 18px', textAlign: 'center', color: 'rgba(26,26,26,0.3)', fontSize: 13 }}>
                  <i className="fas fa-receipt" style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                  ยังไม่มีรายการ
                </div>
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
                              <span style={{ fontSize: 13, fontWeight: sel ? 700 : 400, color: 'var(--text-primary)' }}>{(m.name || '').split(' ')[0]}</span>
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
                            const m = (activeSession.members || []).find(x => x.uid === uid)
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

          <div className="pos-right-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px 14px', borderTop: '1px solid rgba(26,26,26,0.06)' }}>
            {/* Primary action — Pay if confirmed+unpaid, else Confirm/Update */}
            {activeSession.confirmedOrderId && !allMembersPaid ? (
              <button
                onClick={() => setShowPayment(true)}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  background: '#c62419', color: '#fff', border: 'none',
                  fontSize: 14.5, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: "'Sarabun', sans-serif",
                  boxShadow: '0 6px 18px rgba(198,36,25,0.3)',
                  transition: 'all 0.14s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#9a1c13'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#c62419'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <i className="fas fa-qrcode" />
                ชำระเงิน{remainingAmount < grandTotal && grandTotal > 0 ? ` · ฿${remainingAmount.toLocaleString()}` : ` · ฿${grandTotal.toLocaleString()}`}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={saving}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  background: saving ? '#f0ebe9' : (activeSession.confirmedOrderId ? '#1a1a1a' : '#c62419'),
                  color: saving ? 'rgba(26,26,26,0.4)' : '#fff', border: 'none',
                  fontSize: 14.5, fontWeight: 800, cursor: saving ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: "'Sarabun', sans-serif",
                  boxShadow: saving ? 'none' : (activeSession.confirmedOrderId ? '0 6px 18px rgba(26,26,26,0.2)' : '0 6px 18px rgba(198,36,25,0.3)'),
                }}
              >
                {saving
                  ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                  : activeSession.confirmedOrderId
                    ? <><i className="fas fa-sync" /> อัปเดตออเดอร์</>
                    : <><i className="fas fa-check-circle" /> ยืนยันออเดอร์</>
                }
              </button>
            )}

            {/* When already confirmed+unpaid: show secondary Update option */}
            {activeSession.confirmedOrderId && !allMembersPaid && editingUnlocked && (
              <button
                onClick={handleConfirm}
                disabled={saving}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  background: '#ffffff', color: '#1a1a1a',
                  border: '1px solid rgba(26,26,26,0.14)',
                  fontSize: 12.5, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: "'Sarabun', sans-serif",
                }}
              >
                {saving
                  ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                  : <><i className="fas fa-sync" /> อัปเดตออเดอร์</>
                }
              </button>
            )}

            {/* Secondary ghost actions row */}
            <div style={{ display: 'flex', gap: 6 }}>
              {activeSession.confirmedOrderId && (
                <button
                  onClick={async () => {
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
                  }}
                  style={{
                    flex: 1, padding: '9px 10px', borderRadius: 10,
                    background: 'rgba(198,36,25,0.06)', color: '#c62419',
                    border: '1px solid rgba(198,36,25,0.22)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    fontFamily: "'Sarabun', sans-serif",
                  }}
                >
                  <i className="fas fa-ban" style={{ fontSize: 10 }} /> ยกเลิกตี้
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '9px 10px', borderRadius: 10,
                  background: 'transparent', color: 'rgba(26,26,26,0.55)',
                  border: '1px solid rgba(26,26,26,0.12)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: "'Sarabun', sans-serif",
                }}
              >
                <i className="fas fa-times" style={{ fontSize: 10 }} /> ปิดหน้า POS
              </button>
            </div>
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
