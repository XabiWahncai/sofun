import { useState, useEffect, useRef } from 'react'
import liff from '@line/liff'
import { Html5Qrcode } from 'html5-qrcode'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, doc, getDoc,
  serverTimestamp, arrayUnion, onSnapshot,
  query, orderBy, limit, where
} from 'firebase/firestore'
import { BookingDetailModal, isRoomLocked, canViewBookingDetail, getPublicGameName } from './BookingPage'
import { parseGamePlayerCount } from '../utils/bookingHelper'
import { useOpenProfile } from '../UserProfileContext'

import { convertImageUrl } from '../utils/imageUrl'

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatCountdown(isoStr) {
  if (!isoStr) return ''
  const diff = new Date(isoStr) - new Date()
  if (diff <= 0) return 'หมดเวลา'
  const days = Math.floor(diff / 86400000)
  const hrs  = Math.floor((diff % 86400000) / 3600000)
  return days > 0 ? `${days}ว ${hrs}ชม` : `${hrs}ชม`
}

const partyLink = (partyId) =>
  `${window.location.origin}${window.location.pathname}?party=${partyId}`

/* ── PARTY MEMBER SCAN MODAL ── */
function PartyMemberScanModal({ party, onClose }) {
  const [scanning, setScanning]       = useState(false)
  const [processing, setProcessing]   = useState(false)
  const [error, setError]             = useState(null)
  const [addedMember, setAddedMember] = useState(null)
  const scannerRef   = useRef(null)
  const processedRef = useRef(false)
  const inputRef     = useRef(null)
  const processingRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200)
    return () => {
      clearTimeout(t)
      if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null }
    }
  }, [])

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setScanning(false)
  }

  const addMemberFromScan = async (text) => {
    processingRef.current = true
    setProcessing(true)
    setError(null)
    try {
      let uid = text.trim()
      try {
        const url = new URL(text)
        const p = url.searchParams.get('scan')
        if (p) uid = p
      } catch {}

      if (!uid) { setError('QR ไม่ถูกต้อง'); processedRef.current = false; return }

      if (party.members?.some(m => m.uid === uid)) {
        setError('สมาชิกนี้อยู่ในตี้แล้ว'); processedRef.current = false; return
      }
      if ((party.members?.length || 0) >= party.maxPlayers) {
        setError('ตี้เต็มแล้ว'); processedRef.current = false; return
      }

      const snap = await getDoc(doc(db, 'members', uid))
      if (!snap.exists()) {
        setError('ไม่พบสมาชิกในระบบ - ให้สมาชิกลงทะเบียนก่อน')
        processedRef.current = false; return
      }

      const data = snap.data()
      const name   = data.nickname || data.firstname || data.name || uid
      const avatar = data.pictureUrl || data.avatar || ''

      await updateDoc(doc(db, 'parties', party.id), {
        members: arrayUnion({ uid, name, avatar }),
        pendingRequests: (party.pendingRequests || []).filter(r => r.uid !== uid),
      })
      if (inputRef.current) inputRef.current.value = ''
      setAddedMember({ name, avatar })
    } catch (e) {
      setError('เกิดข้อผิดพลาด: ' + e.message)
      processedRef.current = false
    } finally {
      processingRef.current = false
      setProcessing(false)
    }
  }

  const handleBarcodeKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    e.preventDefault()
    const val = (inputRef.current?.value || '').trim()
    if (inputRef.current) inputRef.current.value = ''
    if (val.length > 4 && !processedRef.current && !processingRef.current) {
      processedRef.current = true
      stopScanner()
      addMemberFromScan(val)
    }
  }

  const startScanner = async () => {
    setError(null)
    setScanning(true)
    processedRef.current = false
    try {
      const scanner = new Html5Qrcode('party-qr-reader')
      scannerRef.current = scanner
      const cameraConfig = /Mobi|Android/i.test(navigator.userAgent)
        ? { facingMode: 'environment' } : { facingMode: 'user' }
      await scanner.start(
        cameraConfig,
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decoded) => {
          if (processedRef.current) return
          processedRef.current = true
          await stopScanner()
          await addMemberFromScan(decoded)
        },
        () => {}
      )
    } catch (e) {
      setScanning(false)
      setError('ไม่สามารถเข้าถึงกล้องได้: ' + e.message)
    }
  }

  const reset = () => {
    setAddedMember(null); setError(null)
    processedRef.current = false; processingRef.current = false
    if (inputRef.current) inputRef.current.value = ''
    setTimeout(() => inputRef.current?.focus(), 200)
  }

  return (
    <div className="modal-backdrop psm-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="psm-modal" style={{ background: '#fff', borderRadius: '16px', maxWidth: '440px', width: '92vw', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-default)' }}>
          <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-qrcode" style={{ color: 'var(--crimson-500)' }} /> แสกน QR เพิ่มสมาชิก
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '18px', padding: '4px 8px' }}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="psm-body" style={{ padding: '20px' }}>
          {addedMember ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              {addedMember.avatar
                ? <img src={addedMember.avatar} alt="" referrerPolicy="no-referrer" style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--crimson-500)' }} onError={e => e.currentTarget.style.display = 'none'} />
                : <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(var(--crimson-500-rgb, 198, 36, 25),0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '28px', fontWeight: 700, color: 'var(--crimson-500)' }}>{addedMember.name[0]}</div>
              }
              <div style={{ marginTop: '12px' }}>
                <i className="fas fa-check-circle" style={{ color: 'var(--crimson-500)', fontSize: '20px' }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', marginTop: '6px' }}>{addedMember.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '13px', marginTop: '2px' }}>เพิ่มเข้าตี้แล้ว!</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                {(party.members?.length || 0) + 1}/{party.maxPlayers} คน
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={reset} style={{ flex: 1, height: '40px', borderRadius: '8px', background: 'var(--crimson-500)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
                  <i className="fas fa-qrcode" style={{ marginRight: '6px' }} /> แสกนคนต่อไป
                </button>
                <button onClick={onClose} style={{ flex: 1, height: '40px', borderRadius: '8px', background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', marginBottom: '14px' }}>
                <i className="fas fa-barcode" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '16px' }} />
                <input
                  ref={inputRef}
                  style={{ width: '100%', height: '44px', paddingLeft: '40px', paddingRight: '12px', border: '1.5px solid var(--border-default)', borderRadius: '12px', fontSize: '14px', color: 'var(--text-primary)', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="ชี้เครื่องแสกนที่นี่ แล้วสแกน QR..."
                  onKeyDown={handleBarcodeKeyDown}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={processing}
                />
                {processing && <div className="spinner" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px' }} />}
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(185,28,28,0.06)', border: '1px solid rgba(185,28,28,0.18)', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', gap: '8px' }}>
                  <span style={{ color: 'var(--crimson-500)', fontSize: '13px' }}><i className="fas fa-exclamation-circle" style={{ marginRight: '6px' }} />{error}</span>
                  <button onClick={() => { setError(null); processedRef.current = false; inputRef.current?.focus() }} style={{ background: 'none', border: 'none', color: 'var(--crimson-500)', fontWeight: 700, cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}>
                    ลองใหม่
                  </button>
                </div>
              )}

              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px', margin: '10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }} />
                <span>หรือสแกนด้วยกล้อง</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }} />
              </div>

              <div className="ascan-viewer-wrap">
                <div id="party-qr-reader" className="ascan-viewer" />
                {!scanning && (
                  <div className="ascan-overlay-idle">
                    <i className="fas fa-camera" />
                    <span>กดปุ่มด้านล่างเพื่อเปิดกล้อง</span>
                  </div>
                )}
                {scanning && (
                  <div className="ascan-corners">
                    <span className="ascan-corner tl" /><span className="ascan-corner tr" />
                    <span className="ascan-corner bl" /><span className="ascan-corner br" />
                    <div className="ascan-scan-line" />
                  </div>
                )}
              </div>

              <div style={{ marginTop: '14px' }}>
                {!scanning
                  ? <button onClick={startScanner} disabled={processing} style={{ width: '100%', height: '42px', borderRadius: '8px', background: 'var(--crimson-500)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
                      <i className="fas fa-camera" style={{ marginRight: '6px' }} /> เปิดกล้องสแกน
                    </button>
                  : <button onClick={stopScanner} style={{ width: '100%', height: '42px', borderRadius: '8px', background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
                      <i className="fas fa-stop" style={{ marginRight: '6px' }} /> หยุดสแกน
                    </button>
                }
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── PARTY DETAIL MODAL ── */
function PartyDetailModal({ party, user, onClose, onApprove, onDeny }) {
  const openProfile = useOpenProfile()
  const [messages, setMessages]   = useState([])
  const [msgText, setMsgText]     = useState('')
  const [sending, setSending]     = useState(false)
  const [tab, setTab]             = useState('info')
  const [lineGroupUrl, setLineGroupUrl] = useState(party.lineGroupUrl || '')
  const [savingUrl, setSavingUrl] = useState(false)
  const [showMemberScan, setShowMemberScan] = useState(false)
  const messagesEndRef            = useRef(null)

  const isMember = party.members?.some(m => m.uid === user?.uid)
  const isOwner  = party.ownerId === user?.uid

  useEffect(() => {
    if (!isMember) return
    const q = query(
      collection(db, 'parties', party.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200)
    )
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [party.id, isMember])

  useEffect(() => {
    if (tab === 'chat') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, tab])

  const sendMessage = async () => {
    if (!msgText.trim() || !user) return
    setSending(true)
    try {
      await addDoc(collection(db, 'parties', party.id, 'messages'), {
        text: msgText.trim(),
        uid: user.uid,
        name: user.name,
        avatar: user.avatar || '',
        createdAt: serverTimestamp(),
      })
      setMsgText('')
    } catch (e) {
      alert('ส่งไม่ได้: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  const shareToLine = async () => {
    const link = partyLink(party.id)
    const text = `ขอเชิญเข้าร่วมปาร์ตี้!\nสคริปต์: ${party.gameName}\n${formatDate(party.date)} เวลา ${party.time}\n${party.members?.length || 0}/${party.maxPlayers} คน\n\nกดลิงก์เพื่อเข้าร่วม:\n${link}`
    try {
      const result = await liff.shareTargetPicker([{ type: 'text', text }])
      if (!result) {
        navigator.clipboard.writeText(link).catch(() => {})
        alert('คัดลอกลิงก์แล้ว')
      }
    } catch {
      navigator.clipboard.writeText(link).catch(() => {})
      alert('คัดลอกลิงก์แล้ว - วางใน LINE ได้เลย')
    }
  }

  const saveLineGroupUrl = async () => {
    setSavingUrl(true)
    try {
      await updateDoc(doc(db, 'parties', party.id), { lineGroupUrl: lineGroupUrl.trim() })
    } catch (e) {
      alert('บันทึกไม่ได้: ' + e.message)
    } finally {
      setSavingUrl(false)
    }
  }

  const pendingRequests = party.pendingRequests || []

  return (
    <>
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '92vw', maxWidth: '520px',
        maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)'
      }}>

        {/* ── TOP IMAGE HEADER ── */}
        <div style={{ position: 'relative', height: '190px', flexShrink: 0, overflow: 'hidden' }}>
          {party.gameImage
            ? <img src={convertImageUrl(party.gameImage)} alt={party.gameName} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-theater-masks" style={{ fontSize: '48px', color: 'var(--text-tertiary)' }} />
              </div>
          }
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 30%, rgba(0,0,0,0.72))' }} />
          <button onClick={onClose} style={{ position: 'absolute', top: '12px', right: '12px', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fas fa-times" />
          </button>
          <div style={{ position: 'absolute', bottom: '14px', left: '16px', right: '16px' }}>
            <div style={{ fontWeight: 800, fontSize: '18px', color: '#fff', marginBottom: '6px', lineHeight: 1.2 }}>{party.gameName || 'ไม่ระบุเกม'}</div>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              {[
                { icon: 'fa-calendar-alt', text: formatDate(party.date) },
                { icon: 'fa-clock', text: party.time || '-' },
                { icon: 'fa-users', text: `${party.members?.length || 0}/${party.maxPlayers} คน` }
              ].map(({ icon, text }) => (
                <span key={icon} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <i className={`fas ${icon}`} style={{ opacity: 0.8 }} /> {text}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          {[
            { key: 'info', icon: 'fa-info-circle', label: 'รายละเอียด' },
            { key: 'chat', icon: 'fa-comment-dots', label: 'แชทปาร์ตี้' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, height: '44px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? 'var(--crimson-500)' : 'var(--text-secondary)',
                borderBottom: tab === t.key ? '2px solid var(--crimson-500)' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'color 0.15s',
              }}
            >
              <i className={`fas ${t.icon}`} />
              {t.label}
              {t.key === 'chat' && isMember && messages.length > 0 && tab !== 'chat' && (
                <span style={{ minWidth: '18px', height: '18px', borderRadius: '99px', background: 'var(--crimson-500)', color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {messages.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── INFO TAB ── */}
        {tab === 'info' && (
          <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Owner */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>หัวปาร์ตี้</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {party.ownerAvatar
                  ? <img src={party.ownerAvatar} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} alt="" referrerPolicy="no-referrer" onError={e => e.currentTarget.style.display = 'none'} />
                  : <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(var(--crimson-500-rgb, 198, 36, 25),0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--crimson-500)', fontSize: '15px' }}>{(party.ownerName || '?')[0]}</div>
                }
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                  {isOwner ? 'คุณ' : party.ownerName}
                  <i className="fas fa-crown" style={{ marginLeft: '6px', color: '#c8a050', fontSize: '12px' }} />
                </span>
              </div>
            </div>

            {/* Members */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
                สมาชิก ({party.members?.length || 0}/{party.maxPlayers})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(party.members || []).map((m, i) => (
                  <div
                    key={i}
                    onClick={() => m.uid && openProfile(m.uid)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: m.uid ? 'pointer' : 'default', padding: 4, margin: -4, borderRadius: 8 }}
                  >
                    {m.avatar
                      ? <img src={m.avatar} alt={m.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} referrerPolicy="no-referrer" onError={e => e.currentTarget.style.display = 'none'} />
                      : <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '13px' }}>{(m.name || '?')[0]}</div>
                    }
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)', flex: 1 }}>{m.name}</span>
                    {m.uid === party.ownerId && <i className="fas fa-crown" style={{ color: '#c8a050', fontSize: '11px' }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Note */}
            {party.note && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>หมายเหตุ</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'var(--surface-sunken)', borderRadius: '8px', padding: '10px 12px' }}>
                  "{party.note}"
                </div>
              </div>
            )}

            {/* Pending requests - owner only */}
            {isOwner && pendingRequests.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  คำขอเข้าร่วม ({pendingRequests.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pendingRequests.map(r => (
                    <div key={r.uid} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border-default)' }}>
                      {r.avatar
                        ? <img src={r.avatar} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} referrerPolicy="no-referrer" onError={e => e.currentTarget.style.display = 'none'} />
                        : <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '13px' }}>{(r.name || '?')[0]}</div>
                      }
                      <span style={{ fontSize: '14px', color: 'var(--text-primary)', flex: 1 }}>{r.name}</span>
                      <button onClick={() => onApprove(party, r)} style={{ height: '30px', padding: '0 12px', borderRadius: '8px', background: '#1a1a1a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
                        <i className="fas fa-check" style={{ marginRight: '4px' }} /> รับ
                      </button>
                      <button onClick={() => onDeny(party, r)} style={{ height: '30px', padding: '0 12px', borderRadius: '8px', background: 'rgba(var(--crimson-500-rgb, 198, 36, 25),0.08)', color: 'var(--crimson-500)', border: '1px solid rgba(var(--crimson-500-rgb, 198, 36, 25),0.2)', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
                        <i className="fas fa-times" style={{ marginRight: '4px' }} /> ปฏิเสธ
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invite - owner only */}
            {isOwner && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>เชิญสมาชิก</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button onClick={() => setShowMemberScan(true)} style={{ height: '40px', borderRadius: '8px', background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <i className="fas fa-qrcode" style={{ color: 'var(--crimson-500)' }} /> แสกน QR เพิ่มสมาชิก
                  </button>
                  <button onClick={shareToLine} style={{ height: '40px', borderRadius: '8px', background: 'var(--line-green, #06c755)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <i className="fab fa-line" /> แชร์ลิงก์เชิญทาง LINE
                  </button>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>แสกน QR สมาชิกโดยตรง หรือแชร์ลิงก์เชิญทาง LINE</div>
                </div>
              </div>
            )}

            {/* LINE Group URL */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
                <i className="fab fa-line" style={{ marginRight: '4px', color: 'var(--line-green, #06c755)' }} /> กลุ่ม LINE ของปาร์ตี้
              </div>
              {isOwner ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    style={{ flex: 1, height: '40px', padding: '0 12px', border: '1.5px solid var(--border-default)', borderRadius: '12px', fontSize: '13px', color: 'var(--text-primary)', background: '#fff', outline: 'none' }}
                    placeholder="วางลิงก์กลุ่ม LINE ที่นี่..."
                    value={lineGroupUrl}
                    onChange={e => setLineGroupUrl(e.target.value)}
                  />
                  <button onClick={saveLineGroupUrl} disabled={savingUrl} style={{ height: '40px', padding: '0 16px', borderRadius: '8px', background: 'var(--crimson-500)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', flexShrink: 0 }}>
                    {savingUrl ? <span className="spinner-sm" style={{ width: 14, height: 14 }} /> : 'บันทึก'}
                  </button>
                </div>
              ) : party.lineGroupUrl ? (
                <a href={party.lineGroupUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '40px', borderRadius: '8px', background: 'var(--line-green, #06c755)', color: '#fff', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
                  <i className="fab fa-line" /> เข้ากลุ่ม LINE ปาร์ตี้
                </a>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '8px 0' }}>หัวปาร์ตี้ยังไม่ได้ตั้งค่ากลุ่ม LINE</div>
              )}
            </div>
          </div>
        )}

        {/* ── CHAT TAB ── */}
        {tab === 'chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!isMember ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-tertiary)', padding: '40px 20px' }}>
                <i className="fas fa-lock" style={{ fontSize: '32px' }} />
                <p style={{ margin: 0, fontSize: '14px' }}>เข้าร่วมปาร์ตี้เพื่อเข้าถึงแชท</p>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', padding: '20px 0' }}>ยังไม่มีข้อความ - เริ่มแชทกันเลย!</div>
                  )}
                  {messages.map(msg => (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: msg.uid === user?.uid ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '8px' }}>
                      {msg.uid !== user?.uid && (
                        <div>
                          {msg.avatar
                            ? <img src={msg.avatar} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} referrerPolicy="no-referrer" onError={e => e.currentTarget.style.display = 'none'} />
                            : <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>{(msg.name || '?')[0]}</div>
                          }
                        </div>
                      )}
                      <div style={{ maxWidth: '72%' }}>
                        {msg.uid !== user?.uid && (
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px', paddingLeft: '2px' }}>{msg.name}</div>
                        )}
                        <div style={{
                          padding: '8px 12px', borderRadius: msg.uid === user?.uid ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                          background: msg.uid === user?.uid ? 'var(--crimson-500)' : 'var(--surface-sunken)',
                          color: msg.uid === user?.uid ? '#fff' : 'var(--text-primary)',
                          fontSize: '14px', lineHeight: 1.45
                        }}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', borderTop: '1px solid var(--border-default)', background: '#fff', flexShrink: 0 }}>
                  <input
                    style={{ flex: 1, height: '40px', padding: '0 14px', border: '1.5px solid var(--border-default)', borderRadius: '12px', fontSize: '14px', color: 'var(--text-primary)', background: '#fff', outline: 'none' }}
                    placeholder="พิมพ์ข้อความ..."
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  />
                  <button onClick={sendMessage} disabled={sending || !msgText.trim()} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--crimson-500)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: (!msgText.trim() || sending) ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                    <i className="fas fa-paper-plane" style={{ fontSize: '13px' }} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>

    {showMemberScan && (
      <PartyMemberScanModal party={party} onClose={() => setShowMemberScan(false)} />
    )}
    </>
  )
}

/* ── PARTY CARD ── */
function PartyCard({ party, user, onRequestJoin, onLeave, onApprove, onDeny, onCopyLink, copiedId, onDetail }) {
  const openProfile = useOpenProfile()
  const isMember = party.members?.some(m => m.uid === user?.uid)
  const isOwner = party.ownerId === user?.uid
  const isFull = (party.members?.length || 0) >= party.maxPlayers
  const isClosed = party.status === 'closed'
  const hasPending = isOwner && (party.pendingRequests?.length || 0) > 0
  const myRequest = !isOwner && (party.pendingRequests || []).some(r => r.uid === user?.uid)

  const statusBg    = (isClosed || isFull) ? 'rgba(var(--crimson-500-rgb, 198, 36, 25),0.85)' : 'rgba(0,0,0,0.55)'
  const statusLabel = isClosed ? 'ปิดแล้ว' : isFull ? 'เต็มแล้ว' : 'เปิดรับ'

  const fillPct = Math.min(100, ((party.members?.length || 0) / party.maxPlayers) * 100)
  const fillColor = 'var(--crimson-500)'

  return (
    <div style={{
      background: '#fff', borderRadius: '16px', border: '1px solid var(--border-default)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      boxShadow: hasPending ? '0 0 0 2px var(--crimson-500), 0 2px 8px rgba(0,0,0,0.07)' : '0 1px 4px rgba(0,0,0,0.07)',
      transition: 'box-shadow 0.15s, transform 0.15s',
      cursor: 'pointer',
    }}
    onClick={() => onDetail(party)}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)' }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = hasPending ? '0 0 0 2px var(--crimson-500), 0 2px 8px rgba(0,0,0,0.07)' : '0 1px 4px rgba(0,0,0,0.07)' }}
    >
      {/* Image */}
      <div className="party-card-img" style={{ position: 'relative', height: '135px', overflow: 'hidden', flexShrink: 0, background: '#0f172a' }}>
        {party.gameImage
          ? <img src={convertImageUrl(party.gameImage)} alt={party.gameName} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1e293b, #0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fas fa-masks-theater" style={{ fontSize: '32px', color: '#64748b' }} />
            </div>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 40%, rgba(15,23,42,0.7) 100%)' }} />
        <span style={{ position: 'absolute', top: '8px', right: '8px', padding: '3px 9px', borderRadius: '99px', fontSize: '10.5px', fontWeight: 800, color: '#fff', background: isClosed ? '#0f172a' : isFull ? '#b91c1c' : '#10b981', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {!isClosed && !isFull && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />}
          <span>{statusLabel}</span>
        </span>
        {hasPending && (
          <span style={{ position: 'absolute', top: '8px', left: '8px', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, color: '#fff', background: '#e50914', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
            {party.pendingRequests.length} คนรอ
          </span>
        )}
      </div>

      {/* Body */}
      <div className="party-card-body" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, background: '#ffffff' }}>

        {/* 1. Game Title (Hero) */}
        <div
          className="party-card-gamename"
          style={{
            fontSize: '14.5px',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
          title={party.gameName}
        >
          {party.gameName || 'ไม่ระบุชื่อเกม'}
        </div>

        {/* 2. Schedule Tag (Date & Time) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: '#e50914', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 700, flexShrink: 0 }}>
            <i className="fas fa-calendar-day" style={{ fontSize: '10.5px' }} />
            {party.date ? formatDate(party.date) : 'ยังไม่ระบุวัน'}
          </span>
          {party.time && (
            <>
              <span style={{ color: '#cbd5e1', flexShrink: 0 }}>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#64748b', flexShrink: 0 }}>
                <i className="fas fa-clock" style={{ fontSize: '10px' }} />
                {party.time} น.
              </span>
            </>
          )}
        </div>

        {/* 3. Owner & Note */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <div
            onClick={e => { e.stopPropagation(); party.ownerId && openProfile(party.ownerId) }}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flex: 1, cursor: party.ownerId ? 'pointer' : 'default' }}
          >
            {party.ownerAvatar ? (
              <img src={party.ownerAvatar} style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }} alt="" referrerPolicy="no-referrer" onError={e => e.currentTarget.style.display = 'none'} />
            ) : (
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '9px', color: '#64748b', fontWeight: 700 }}>
                {(party.ownerName || '?')[0].toUpperCase()}
              </div>
            )}
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isOwner ? 'คุณ (หัวตี้)' : (party.ownerName || 'หัวหน้าตี้')}
            </span>
          </div>

          {party.note && (
            <span style={{ fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>
              "{party.note}"
            </span>
          )}
        </div>

        {/* 4. Members + progress */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {(party.members || []).slice(0, 4).map((m, i) => (
                <div
                  key={i} title={m.name}
                  onClick={e => { e.stopPropagation(); m.uid && openProfile(m.uid) }}
                  style={{
                    width: '22px', height: '22px', borderRadius: '50%', overflow: 'hidden',
                    marginLeft: i === 0 ? 0 : '-5px', border: '1.5px solid #ffffff',
                    background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9.5px', fontWeight: 700, color: '#475569', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    cursor: m.uid ? 'pointer' : 'default',
                  }}
                >
                  {m.avatar
                    ? <img src={m.avatar} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" onError={e => e.currentTarget.style.display = 'none'} />
                    : <span>{(m.name || '?')[0].toUpperCase()}</span>
                  }
                </div>
              ))}
              {(party.members?.length || 0) > 4 && (
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%', marginLeft: '-5px',
                  border: '1.5px solid #ffffff', background: '#e2e8f0', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800,
                  color: '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}>
                  +{party.members.length - 4}
                </div>
              )}
            </div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a' }}>{party.members?.length || 0}/{party.maxPlayers} คน</span>
          </div>
          <div style={{ height: '4px', borderRadius: '99px', background: '#f1f5f9', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: isFull ? '#10b981' : 'linear-gradient(90deg, #e50914, #ff4d4f)', borderRadius: '99px', width: `${fillPct}%`, transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* 5. Actions */}
        <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', paddingTop: '2px' }}>
          <button
            onClick={e => { e.stopPropagation(); onDetail(party) }}
            style={{
              flex: 1, height: '34px', borderRadius: '8px', background: '#f8fafc',
              color: '#334155', border: '1px solid #e2e8f0', cursor: 'pointer',
              fontWeight: 700, fontSize: '11.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
            }}
          >
            <i className="fas fa-info-circle" style={{ fontSize: '10.5px' }} />
            <span>รายละเอียด</span>
          </button>

          {!user ? (
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <i className="fab fa-line" style={{ color: '#06c755' }} /> Login
            </span>
          ) : isOwner ? (
            <button
              onClick={e => { e.stopPropagation(); onDetail(party) }}
              style={{
                flex: 1, height: '34px', borderRadius: '8px',
                background: hasPending ? '#fef2f2' : '#f8fafc',
                color: hasPending ? '#dc2626' : '#334155',
                border: hasPending ? '1px solid #fecaca' : '1px solid #e2e8f0',
                cursor: 'pointer', fontWeight: 700, fontSize: '11.5px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              }}
            >
              <i className="fas fa-crown" style={{ fontSize: '10px' }} />
              <span>{hasPending ? `${party.pendingRequests.length} คำขอ` : 'จัดการ'}</span>
            </button>
          ) : isMember ? (
            <button
              onClick={e => { e.stopPropagation(); onLeave(party) }}
              style={{
                flex: 1, height: '34px', borderRadius: '8px', background: '#fef2f2',
                color: '#dc2626', border: '1px solid #fee2e2', cursor: 'pointer',
                fontWeight: 700, fontSize: '11.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              }}
            >
              <i className="fas fa-sign-out-alt" style={{ fontSize: '10px' }} />
              <span>ออก</span>
            </button>
          ) : myRequest ? (
            <button disabled style={{ flex: 1, height: '34px', borderRadius: '8px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', cursor: 'default', fontWeight: 700, fontSize: '11.5px' }}>
              <i className="fas fa-clock" style={{ marginRight: '4px', fontSize: '10px' }} /> รออนุมัติ
            </button>
          ) : isClosed ? (
            <button disabled style={{ flex: 1, height: '34px', borderRadius: '8px', background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', cursor: 'default', fontWeight: 700, fontSize: '11.5px' }}>ปิดรับแล้ว</button>
          ) : isFull ? (
            <button disabled style={{ flex: 1, height: '34px', borderRadius: '8px', background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', cursor: 'default', fontWeight: 700, fontSize: '11.5px' }}>ที่นั่งเต็ม</button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onRequestJoin(party) }}
              style={{
                flex: 1, height: '34px', borderRadius: '8px',
                background: 'linear-gradient(135deg, #e50914 0%, #b80710 100%)',
                color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                boxShadow: '0 2px 6px rgba(229, 9, 20, 0.25)',
              }}
            >
              <i className="fas fa-user-plus" style={{ fontSize: '10.5px' }} />
              <span>ขอเข้าร่วม</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── BOOKING PARTY CARD ── */
function BookingPartyCard({ booking, allGames = [], user, onRequestJoin, onOpen }) {
  const openProfile = useOpenProfile()
  const members     = booking.members || []
  const matchedGame = allGames?.find(g => g.id === booking.gameId || g._id === booking.gameId)
  const maxMembers  = matchedGame ? parseGamePlayerCount(matchedGame) : (booking.maxMembers || 0)
  const isMember    = members.some(m => m.uid === user?.uid || m.id === user?.uid)
  const isLeader    = booking.leaderId === user?.uid
  const isAdmin     = user?.role === 'admin' || user?.isAdmin
  const isFull      = members.length >= maxMembers
  const isLocked    = isRoomLocked(booking)
  const canView     = canViewBookingDetail(booking, user)
  const isLockedRestricted = isLocked && !canView
  const hasPending  = booking.joinRequests?.some(r => r.uid === user?.uid)

  const statusBg    = isLockedRestricted ? '#0f172a' : (isLocked || isFull) ? '#b91c1c' : '#10b981'
  const statusLabel = isLocked ? 'ล็อกห้องแล้ว' : isFull ? 'เต็มแล้ว' : 'เปิดรับ'

  const fillPct = maxMembers > 0 ? Math.min(100, (members.length / maxMembers) * 100) : 0

  return (
    <div
      onClick={onOpen}
      style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      }}
      onMouseEnter={e => { if (onOpen) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)' } }}
      onMouseLeave={e => { if (onOpen) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' } }}
    >
      {/* Cover Image Header */}
      <div className="party-card-img" style={{ position: 'relative', height: '135px', overflow: 'hidden', flexShrink: 0, background: '#0f172a' }}>
        {!isLockedRestricted && booking.gameImage ? (
          <img
            src={convertImageUrl(booking.gameImage)}
            alt={booking.gameName}
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1e293b, #0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className={isLockedRestricted ? "fas fa-lock" : "fas fa-masks-theater"} style={{ fontSize: '32px', color: '#64748b' }} />
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 40%, rgba(15,23,42,0.7) 100%)' }} />

        {/* Top-Left: Type Badge */}
        <span
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            padding: '3px 8px',
            borderRadius: '6px',
            fontSize: '10px',
            fontWeight: 800,
            color: '#e50914',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <i className="fas fa-ticket-alt" style={{ fontSize: '8.5px' }} />
          <span>จองห้อง</span>
        </span>

        {/* Top-Right: Status Badge */}
        <span
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '3px 9px',
            borderRadius: '99px',
            fontSize: '10.5px',
            fontWeight: 800,
            color: '#ffffff',
            background: statusBg,
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {!isLocked && !isFull && (
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#ffffff', display: 'inline-block' }} />
          )}
          <span>{statusLabel}</span>
        </span>

        {/* Bottom-Right on Image: Deposit Rate */}
        {booking.depositAmount > 0 && !isLockedRestricted && (
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(4px)',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 800,
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>มัดจำ</span>
            <span style={{ color: '#f87171' }}>฿{booking.depositAmount}</span>
            <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>/คน</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="party-card-body" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, background: '#ffffff' }}>

        {/* 1. Game Title (Hero) */}
        <div
          className="party-card-gamename"
          style={{
            fontSize: '14.5px',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
          title={booking.gameName}
        >
          {isLockedRestricted ? 'ล็อกห้องแล้ว (ห้องส่วนตัว)' : (booking.gameName || 'ไม่ระบุชื่อเกม')}
        </div>

        {/* 2. Schedule Tag (Date & Time on one clean row) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: '#e50914', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 700, flexShrink: 0 }}>
            <i className="fas fa-calendar-day" style={{ fontSize: '10.5px' }} />
            {booking.date ? formatDate(booking.date) : 'ยังไม่ระบุวัน'}
          </span>
          {booking.time && (
            <>
              <span style={{ color: '#cbd5e1', flexShrink: 0 }}>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#64748b', flexShrink: 0 }}>
                <i className="fas fa-clock" style={{ fontSize: '10px' }} />
                {booking.time} น.
              </span>
            </>
          )}
        </div>

        {/* 3. Host info & Deposit Countdown Tag */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          {isLockedRestricted ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flex: 1 }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '9px', color: '#64748b' }}>
                <i className="fas fa-lock" />
              </div>
              <span style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>ห้องส่วนตัว</span>
            </div>
          ) : (
            <div
              onClick={e => { e.stopPropagation(); booking.leaderId && openProfile(booking.leaderId) }}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flex: 1, cursor: booking.leaderId ? 'pointer' : 'default' }}
            >
              {booking.leaderAvatar ? (
                <img
                  src={booking.leaderAvatar}
                  style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={e => e.currentTarget.style.display = 'none'}
                />
              ) : (
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '9px', color: '#64748b', fontWeight: 700 }}>
                  {(booking.leaderName || '?')[0].toUpperCase()}
                </div>
              )}
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {booking.leaderName || 'หัวหน้าตี้'}
              </span>
            </div>
          )}

          {!isLocked && booking.depositDeadline && (
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#b45309',
                background: '#fef3c7',
                padding: '2px 6px',
                borderRadius: '5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                flexShrink: 0,
              }}
              title="เวลาที่เหลือก่อนหมดเขตชำระมัดจำ"
            >
              <i className="fas fa-hourglass-half" style={{ fontSize: '8.5px' }} />
              <span>{formatCountdown(booking.depositDeadline)}</span>
            </div>
          )}
        </div>

        {/* 4. Members & Progress */}
        {isLockedRestricted ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fas fa-user-lock" style={{ fontSize: '10px' }} /> เฉพาะในตี้
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669' }}>ล็อกแล้ว</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {members.slice(0, 4).map((m, i) => (
                  <div
                    key={i}
                    title={m.name}
                    onClick={e => { e.stopPropagation(); m.uid && openProfile(m.uid) }}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      marginLeft: i === 0 ? 0 : '-5px',
                      border: '1.5px solid #ffffff',
                      background: '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      color: '#475569',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      cursor: m.uid ? 'pointer' : 'default',
                    }}
                  >
                    {m.avatar ? (
                      <img
                        src={m.avatar}
                        alt={m.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        referrerPolicy="no-referrer"
                        onError={e => e.currentTarget.style.display = 'none'}
                      />
                    ) : (
                      <span>{(m.name || '?')[0].toUpperCase()}</span>
                    )}
                  </div>
                ))}
                {members.length > 4 && (
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      marginLeft: '-5px',
                      border: '1.5px solid #ffffff',
                      background: '#e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      fontWeight: 800,
                      color: '#64748b',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}
                  >
                    +{members.length - 4}
                  </div>
                )}
              </div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a' }}>
                {members.length}/{maxMembers} คน
              </span>
            </div>
            <div style={{ height: '4px', borderRadius: '99px', background: '#f1f5f9', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: isFull ? '#10b981' : 'linear-gradient(90deg, #e50914, #ff4d4f)',
                  borderRadius: '99px',
                  width: `${fillPct}%`,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* 5. Action Button */}
        <div style={{ marginTop: 'auto', paddingTop: '2px' }}>
          {isLockedRestricted ? (
            <button
              disabled
              style={{
                width: '100%',
                height: '34px',
                borderRadius: '8px',
                background: '#f8fafc',
                color: '#94a3b8',
                border: '1px solid #e2e8f0',
                cursor: 'not-allowed',
                fontWeight: 700,
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <i className="fas fa-lock" style={{ fontSize: '10px' }} />
              <span>ล็อกห้องแล้ว</span>
            </button>
          ) : !user ? (
            <span style={{ fontSize: '11.5px', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '34px' }}>
              <i className="fab fa-line" style={{ color: '#06c755' }} /> Login ก่อนเข้าตี้
            </span>
          ) : isMember ? (
            <button
              disabled
              style={{
                width: '100%',
                height: '34px',
                borderRadius: '8px',
                background: '#ecfdf5',
                color: '#059669',
                border: '1px solid #a7f3d0',
                cursor: 'default',
                fontWeight: 700,
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <i className="fas fa-check-circle" style={{ fontSize: '11px' }} />
              <span>อยู่ในตี้แล้ว</span>
            </button>
          ) : hasPending ? (
            <button
              disabled
              style={{
                width: '100%',
                height: '34px',
                borderRadius: '8px',
                background: '#fffbeb',
                color: '#b45309',
                border: '1px solid #fde68a',
                cursor: 'default',
                fontWeight: 700,
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <i className="fas fa-clock" style={{ fontSize: '10.5px' }} />
              <span>รออนุมัติ</span>
            </button>
          ) : isLocked || isFull ? (
            <button
              disabled
              style={{
                width: '100%',
                height: '34px',
                borderRadius: '8px',
                background: '#f8fafc',
                color: '#94a3b8',
                border: '1px solid #e2e8f0',
                cursor: 'default',
                fontWeight: 700,
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <span>{isLocked ? 'ล็อกห้องแล้ว' : 'ตี้เต็มแล้ว'}</span>
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onRequestJoin(booking) }}
              style={{
                width: '100%',
                height: '34px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #e50914 0%, #b80710 100%)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                boxShadow: '0 2px 8px rgba(229, 9, 20, 0.25)',
                transition: 'transform 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <i className="fas fa-user-plus" style={{ fontSize: '10.5px' }} />
              <span>ขอเข้าร่วมตี้</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── CREATE PARTY MODAL ── */
function CreatePartyModal({ user, allGames, onClose, onCreated }) {
  const [gameId, setGameId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedGame = allGames.find(g => g.id === gameId)
  const twoDaysLaterStr = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]

  const submit = async () => {
    if (!gameId || !date || !time) return alert('กรุณาเลือกเกม วันที่ และเวลา')
    if (date < twoDaysLaterStr) {
      alert('กำหนดให้จองล่วงหน้าอย่างน้อย 2 วัน หากต้องการจองด่วนหรือเล่นรอบดึก กรุณาติดต่อแอดมิน')
      return
    }
    setLoading(true)
    try {
      await addDoc(collection(db, 'parties'), {
        gameId,
        gameName: selectedGame?.title || '',
        gameImage: selectedGame?.image || selectedGame?.coverUrl || '',
        date,
        time,
        maxPlayers: Number(maxPlayers),
        note: note.trim(),
        ownerId: user.uid,
        ownerName: user.name,
        ownerAvatar: user.avatar || '',
        members: [{ uid: user.uid, name: user.name, avatar: user.avatar || '' }],
        pendingRequests: [],
        status: 'open',
        createdAt: serverTimestamp(),
      })
      onCreated()
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', height: '44px', padding: '0 14px', border: '1.5px solid var(--border-default)',
    borderRadius: '12px', fontSize: '14px', color: 'var(--text-primary)', background: '#fff',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '92vw', maxWidth: '480px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.16)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 16px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-users" style={{ color: 'var(--crimson-500)' }} /> สร้างปาร์ตี้ใหม่
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '18px', padding: '4px 8px' }}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>เลือกสคริปต์ *</label>
            <select
              value={gameId}
              onChange={e => setGameId(e.target.value)}
              style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%2394a3b8' d='M8 11L2 5h12z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '12px', paddingRight: '36px', cursor: 'pointer' }}
            >
              <option value="">-- เลือกสคริปต์ --</option>
              {allGames.map(g => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>

            {selectedGame && (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px', padding: '10px 12px', background: 'var(--surface-sunken)', borderRadius: '8px' }}>
                {(selectedGame.image || selectedGame.coverUrl) && (
                  <img src={convertImageUrl(selectedGame.image || selectedGame.coverUrl)} alt="" loading="lazy" decoding="async" style={{ width: '52px', height: '52px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{selectedGame.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', gap: '10px' }}>
                    {selectedGame.players && <span><i className="fas fa-users" style={{ marginRight: '3px' }} />{selectedGame.players} คน</span>}
                    {selectedGame.difficulty && <span>{selectedGame.difficulty}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>วันที่ *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} min={twoDaysLaterStr} style={{ ...inputStyle, colorScheme: 'light' }} />
            </div>
            <div>
              <label style={labelStyle}>เวลา *</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ ...inputStyle, colorScheme: 'light' }} />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '10px',
              background: '#fef2f2',
              border: '1px solid #fee2e2',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#991b1b', fontWeight: 600 }}>
              <i className="fas fa-info-circle" style={{ color: 'var(--crimson-500)', fontSize: '12px', flexShrink: 0 }} />
              <span>กำหนดให้จองล่วงหน้าอย่างน้อย 2 วัน (หากต้องการจองด่วน หรือเล่นรอบดึก กรุณาติดต่อแอดมิน)</span>
            </div>
            <a
              href="https://line.me/R/ti/p/@sofunclub"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '8px',
                background: '#06c755',
                color: '#ffffff',
                fontSize: '11.5px',
                fontWeight: 800,
                textDecoration: 'none',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(6, 199, 85, 0.25)',
              }}
            >
              <i className="fab fa-line" style={{ fontSize: '13px' }} />
              <span>ติดต่อแอดมินทาง LINE</span>
            </a>
          </div>

          <div>
            <label style={labelStyle}>จำนวนผู้เล่นสูงสุด</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[2,3,4,5,6,8,10,12].map(n => (
                <button
                  key={n}
                  onClick={() => setMaxPlayers(n)}
                  style={{ width: '44px', height: '44px', borderRadius: '8px', fontWeight: 700, fontSize: '15px', cursor: 'pointer', border: maxPlayers === n ? 'none' : '1.5px solid var(--border-default)', background: maxPlayers === n ? 'var(--crimson-500)' : '#fff', color: maxPlayers === n ? '#fff' : 'var(--text-primary)', transition: 'all 0.15s' }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>หมายเหตุ (ถ้ามี)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="เช่น มือใหม่ยินดีต้อนรับ, ต้องการผู้เล่นที่มีประสบการณ์..."
              style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border-default)', borderRadius: '12px', fontSize: '14px', color: 'var(--text-primary)', background: '#fff', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '14px 22px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, height: '44px', borderRadius: '8px', background: 'var(--surface-sunken)', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
            ยกเลิก
          </button>
          <button onClick={submit} disabled={loading} style={{ flex: 2, height: '44px', borderRadius: '8px', background: loading ? 'rgba(var(--crimson-500-rgb, 198, 36, 25),0.5)' : 'var(--crimson-500)', color: '#fff', border: 'none', cursor: loading ? 'default' : 'pointer', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {loading ? <span className="spinner-sm" /> : <><i className="fas fa-plus" /> สร้างปาร์ตี้</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── MAIN PAGE ── */
export default function PartyPage({ user, allGames, parties = [], highlightPartyId, onLogin = () => {}, showToast = () => {} }) {
  const [filter, setFilter]               = useState('open')
  const [gameSearch, setGameSearch]       = useState('')
  const [dateFilter, setDateFilter]       = useState('')
  const [copiedId, setCopiedId]           = useState(null)
  const [detailParty, setDetailParty]     = useState(null)
  const [detailBooking, setDetailBooking] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [bookings, setBookings]           = useState([])

  useEffect(() => {
    const q = query(
      collection(db, 'bookings'),
      where('status', 'in', ['confirmed', 'locked'])
    )
    return onSnapshot(q, snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, _type: 'booking', ...d.data() })).filter(b => !b.isMock))
    }, () => {})
  }, [])

  const handleRequestJoin = async (party) => {
    if (!user) return
    try {
      await updateDoc(doc(db, 'parties', party.id), {
        pendingRequests: arrayUnion({
          uid: user.uid,
          name: user.name,
          avatar: user.avatar || '',
          requestedAt: new Date().toISOString(),
        })
      })
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    }
  }

  const handleLeave = async (party) => {
    if (!user) return
    try {
      const newMembers = (party.members || []).filter(m => m.uid !== user.uid)
      await updateDoc(doc(db, 'parties', party.id), { members: newMembers })
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    }
  }

  const handleApprove = async (party, requester) => {
    try {
      const newPending = (party.pendingRequests || []).filter(r => r.uid !== requester.uid)
      await updateDoc(doc(db, 'parties', party.id), {
        pendingRequests: newPending,
        members: arrayUnion({ uid: requester.uid, name: requester.name, avatar: requester.avatar || '' }),
      })
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    }
  }

  const handleDeny = async (party, requester) => {
    try {
      const newPending = (party.pendingRequests || []).filter(r => r.uid !== requester.uid)
      await updateDoc(doc(db, 'parties', party.id), { pendingRequests: newPending })
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    }
  }

  const handleCopyLink = (partyId) => {
    navigator.clipboard.writeText(partyLink(partyId)).catch(() => {})
    setCopiedId(partyId)
    setTimeout(() => setCopiedId(null), 2500)
  }

  const handleBookingRequestJoin = async (booking) => {
    if (!user) return
    if (booking.joinRequests?.some(r => r.uid === user.uid)) return
    try {
      const ref = doc(db, 'bookings', booking.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) return
      const latest = snap.data()
      const existing = latest.joinRequests || []
      if (existing.some(r => r.uid === user.uid)) return
      await updateDoc(ref, {
        joinRequests: [...existing, {
          uid: user.uid, name: user.name,
          avatar: user.avatar || '', requestedAt: new Date().toISOString(),
        }]
      })
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message) }
  }

  const myPendingCount = parties
    .filter(p => p.ownerId === user?.uid)
    .reduce((sum, p) => sum + (p.pendingRequests?.length || 0), 0)

  const searchLower = gameSearch.trim().toLowerCase()

  const filtered = filter === 'open'
    ? parties.filter(p => p.status !== 'closed' && (p.members?.length || 0) < p.maxPlayers)
    : parties

  const sorted = highlightPartyId
    ? [...filtered].sort((a, b) => (b.id === highlightPartyId) - (a.id === highlightPartyId))
    : filtered

  const bookingItems = filter === 'open'
    ? bookings.filter(b => {
        const mg = allGames?.find(g => g.id === b.gameId || g._id === b.gameId)
        const max = mg ? parseGamePlayerCount(mg) : (b.maxMembers || 0)
        return b.status === 'confirmed' && (b.members?.length || 0) < max
      })
    : bookings

  const allItems = [
    ...sorted.map(p => ({ ...p, _type: 'party' })),
    ...bookingItems,
  ]
    .filter(item => !searchLower || (item.gameName || '').toLowerCase().includes(searchLower))
    .filter(item => !dateFilter || item.date === dateFilter)
    .sort((a, b) => {
      if (b.id === highlightPartyId) return 1
      if (a.id === highlightPartyId) return -1
      const dateCmp = (a.date || '').localeCompare(b.date || '')
      if (dateCmp !== 0) return dateCmp
      return (a.time || '').localeCompare(b.time || '')
    })

  useEffect(() => {
    if (!detailParty) return
    const fresh = parties.find(p => p.id === detailParty.id)
    if (fresh) setDetailParty(fresh)
  }, [parties])

  const hasFilters = gameSearch || dateFilter

  return (
    <div id="party-page" className="page active" style={{ background: '#f5f5f7', minHeight: '100vh', paddingTop: 60, paddingBottom: '80px' }}>
      <style>{`
        .party-cards-grid {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 12px !important;
        }
        @media (min-width: 900px) {
          .party-cards-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 16px !important;
          }
        }
        @media (min-width: 1280px) {
          .party-cards-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 18px !important;
          }
        }
        @media (max-width: 640px) {
          .party-cards-grid {
            gap: 10px !important;
          }
          .party-card-img {
            height: 125px !important;
          }
          .party-card-body {
            padding: 10px !important;
            gap: 6px !important;
          }
          .party-card-gamename {
            font-size: 13.5px !important;
            line-height: 1.25 !important;
          }
        }
      `}</style>

      {/* ── HERO HEADER ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border-default)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '320px', height: '100%', background: 'radial-gradient(ellipse at 100% 50%, rgba(var(--crimson-500-rgb, 198, 36, 25),0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 20px 20px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(var(--crimson-500-rgb, 198, 36, 25),0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fas fa-users" style={{ color: 'var(--crimson-500)', fontSize: '16px' }} />
                </div>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>ปาร์ตี้เกมสืบสวน</h1>
                {myPendingCount > 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: '99px', background: 'var(--crimson-500)', color: '#fff', fontSize: '12px', fontWeight: 700 }}>
                    <i className="fas fa-bell" style={{ marginRight: '4px' }} />{myPendingCount} คำขอ
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>รวมกลุ่มเล่นเกม Script Murder กับเพื่อนใหม่ที่ Sofun Club (Sofun Club Thailand)</p>
            </div>

            {!user && (
              <button
                onClick={onLogin}
                style={{ height: '42px', padding: '0 20px', borderRadius: '8px', background: 'var(--line-green, #06c755)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
              >
                <i className="fab fa-line" /> เข้าสู่ระบบ
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px 0' }}>

        {/* ── FILTER + SEARCH BAR ── */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid var(--border-default)', padding: '14px 16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { key: 'open', label: 'เปิดรับสมาชิก' },
              { key: 'all',  label: 'ทั้งหมด' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{ height: '34px', padding: '0 16px', borderRadius: '99px', border: filter === f.key ? 'none' : '1.5px solid var(--border-default)', background: filter === f.key ? 'var(--crimson-500)' : '#fff', color: filter === f.key ? '#fff' : 'var(--text-secondary)', fontWeight: filter === f.key ? 700 : 500, fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search inputs */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '13px' }} />
              <input
                type="text"
                placeholder="ค้นหาชื่อเกม..."
                value={gameSearch}
                onChange={e => setGameSearch(e.target.value)}
                style={{ width: '100%', height: '38px', paddingLeft: '36px', paddingRight: gameSearch ? '32px' : '12px', border: '1.5px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', background: 'var(--surface-sunken)', outline: 'none', boxSizing: 'border-box' }}
              />
              {gameSearch && (
                <button onClick={() => setGameSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px', fontSize: '12px' }}>
                  <i className="fas fa-times" />
                </button>
              )}
            </div>
            <div style={{ minWidth: '160px', position: 'relative' }}>
              <i className="fas fa-calendar-alt" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '13px' }} />
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                style={{ width: '100%', height: '38px', paddingLeft: '36px', paddingRight: dateFilter ? '32px' : '12px', border: '1.5px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', color: dateFilter ? 'var(--text-primary)' : 'var(--text-tertiary)', background: 'var(--surface-sunken)', outline: 'none', boxSizing: 'border-box', colorScheme: 'light' }}
              />
              {dateFilter && (
                <button onClick={() => setDateFilter('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px', fontSize: '12px' }}>
                  <i className="fas fa-times" />
                </button>
              )}
            </div>
            {hasFilters && (
              <button onClick={() => { setGameSearch(''); setDateFilter('') }} style={{ height: '38px', padding: '0 14px', borderRadius: '8px', background: 'rgba(var(--crimson-500-rgb, 198, 36, 25),0.08)', color: 'var(--crimson-500)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '12px', flexShrink: 0 }}>
                ล้างทั้งหมด
              </button>
            )}
          </div>
        </div>

        {/* ── GRID / EMPTY ── */}
        {allItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fas fa-users-slash" style={{ fontSize: '28px', color: 'var(--text-tertiary)' }} />
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {hasFilters ? 'ไม่พบปาร์ตี้ที่ตรงกับการค้นหา' : filter === 'open' ? 'ยังไม่มีปาร์ตี้เปิดรับสมาชิก' : 'ยังไม่มีปาร์ตี้'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '280px' }}>
              {hasFilters ? 'ลองปรับตัวกรองหรือล้างการค้นหา' : user ? 'ยังไม่มีปาร์ตี้ในขณะนี้ - ลองกลับมาใหม่' : 'เข้าสู่ระบบเพื่อเข้าร่วมปาร์ตี้'}
            </div>
            {hasFilters ? (
              <button onClick={() => { setGameSearch(''); setDateFilter('') }} style={{ height: '40px', padding: '0 20px', borderRadius: '8px', background: 'var(--crimson-500)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', marginTop: '4px' }}>
                ล้างตัวกรอง
              </button>
            ) : !user ? (
              <button onClick={onLogin} style={{ height: '40px', padding: '0 20px', borderRadius: '8px', background: 'var(--line-green, #06c755)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <i className="fab fa-line" /> เข้าสู่ระบบ
              </button>
            ) : null}
          </div>
        ) : (
          <div className="party-cards-grid">
            {allItems.map(item =>
              item._type === 'booking'
                ? <BookingPartyCard
                    key={item.id}
                    booking={item}
                    allGames={allGames}
                    user={user}
                    onRequestJoin={handleBookingRequestJoin}
                    onOpen={() => {
                      if (!canViewBookingDetail(item, user)) {
                        showToast?.('ห้องนี้ถูกล็อกแล้ว เฉพาะสมาชิกในตี้หรือแอดมินเท่านั้นที่สามารถดูรายละเอียดได้', 'warning')
                        return
                      }
                      setDetailBooking(item)
                    }}
                  />
                : <PartyCard
                    key={item.id}
                    party={item}
                    user={user}
                    onRequestJoin={handleRequestJoin}
                    onLeave={handleLeave}
                    onApprove={handleApprove}
                    onDeny={handleDeny}
                    onCopyLink={handleCopyLink}
                    copiedId={copiedId}
                    onDetail={setDetailParty}
                  />
            )}
          </div>
        )}
      </div>

      {detailParty && (
        <PartyDetailModal
          party={detailParty}
          user={user}
          onClose={() => setDetailParty(null)}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      )}

      {detailBooking && (
        <BookingDetailModal
          booking={bookings.find(b => b.id === detailBooking.id) || detailBooking}
          allGames={allGames}
          lineUser={user}
          onClose={() => setDetailBooking(null)}
          showToast={showToast}
          onUpdated={() => {}}
        />
      )}

      {showCreateModal && user && (
        <CreatePartyModal
          user={user}
          allGames={allGames}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}
