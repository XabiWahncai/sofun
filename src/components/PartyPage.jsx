import { useState, useEffect, useRef } from 'react'
import liff from '@line/liff'
import { Html5Qrcode } from 'html5-qrcode'
import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, doc, getDoc,
  serverTimestamp, arrayUnion, onSnapshot,
  query, orderBy, limit, where
} from 'firebase/firestore'

const toWsrv = (fileId) =>
  `https://wsrv.nl/?url=https://drive.usercontent.google.com/download?id=${fileId}%26export%3Dview&w=400&output=webp`

const convertImageUrl = (url) => {
  if (!url) return url
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^=?/]+)/)
  if (lh3) return toWsrv(lh3[1])
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (m1) return toWsrv(m1[1])
  const m2 = url.match(/[?&]id=([^&]+)/)
  if (m2) return toWsrv(m2[1])
  return url
}

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
  const processingRef = useRef(false)  // ref mirror so handlers don't capture stale state

  // Auto-focus the barcode input on mount so hardware scanner keystrokes land here
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
        setError('ไม่พบสมาชิกในระบบ — ให้สมาชิกลงทะเบียนก่อน')
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

  // Uncontrolled input: read value from DOM directly at Enter/Tab time — avoids stale closure
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
      <div className="psm-modal">
        <div className="psm-header">
          <span className="psm-title"><i className="fas fa-qrcode" /> แสกน QR เพิ่มสมาชิก</span>
          <button className="modal-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="psm-body">
          {addedMember ? (
            <div className="psm-success">
              {addedMember.avatar
                ? <img src={addedMember.avatar} alt="" className="psm-success-avatar" onError={e => e.currentTarget.style.display = 'none'} />
                : <div className="psm-success-avatar-ph">{addedMember.name[0]}</div>
              }
              <i className="fas fa-check-circle psm-check-icon" />
              <div className="psm-success-name">{addedMember.name}</div>
              <div className="psm-success-sub">เพิ่มเข้าตี้แล้ว!</div>
              <div className="psm-slot-count">
                {(party.members?.length || 0) + 1}/{party.maxPlayers} คน
              </div>
              <div className="psm-btn-row">
                <button className="ascan-start-btn" onClick={reset} style={{ flex: 1 }}>
                  <i className="fas fa-qrcode" /> แสกนคนต่อไป
                </button>
                <button className="psm-done-btn" onClick={onClose}>
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── Barcode/QR input: auto-focused so hardware scanner types directly here ── */}
              <div className="psm-barcode-wrap">
                <i className="fas fa-barcode psm-barcode-icon" />
                <input
                  ref={inputRef}
                  className="psm-barcode-input"
                  placeholder="ชี้เครื่องแสกนที่นี่ แล้วสแกน QR..."
                  onKeyDown={handleBarcodeKeyDown}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={processing}
                />
                {processing && <div className="spinner psm-spinner" />}
              </div>

              {error && (
                <div className="ascan-error psm-error-row">
                  <span><i className="fas fa-exclamation-circle" /> {error}</span>
                  <button className="psm-retry-btn" onClick={() => { setError(null); processedRef.current = false; inputRef.current?.focus() }}>
                    ลองใหม่
                  </button>
                </div>
              )}

              <div className="psm-divider"><span>หรือสแกนด้วยกล้อง</span></div>

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

              <div className="ascan-btn-row">
                {!scanning
                  ? <button className="ascan-start-btn" onClick={startScanner} disabled={processing}>
                      <i className="fas fa-camera" /> เปิดกล้องสแกน
                    </button>
                  : <button className="ascan-stop-btn" onClick={stopScanner}>
                      <i className="fas fa-stop" /> หยุดสแกน
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
  const [messages, setMessages]   = useState([])
  const [msgText, setMsgText]     = useState('')
  const [sending, setSending]     = useState(false)
  const [tab, setTab]             = useState('info') // 'info' | 'chat'
  const [lineGroupUrl, setLineGroupUrl] = useState(party.lineGroupUrl || '')
  const [savingUrl, setSavingUrl] = useState(false)
  const [showMemberScan, setShowMemberScan] = useState(false)
  const messagesEndRef            = useRef(null)

  const isMember = party.members?.some(m => m.uid === user?.uid)
  const isOwner  = party.ownerId === user?.uid

  // Real-time chat listener (only for members)
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

  // Auto-scroll when new message
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
      alert('คัดลอกลิงก์แล้ว — วางใน LINE ได้เลย')
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
      <div className="party-detail-modal">

        {/* ── TOP IMAGE HEADER ── */}
        <div className="pdm-img-wrap">
          {party.gameImage
            ? <img src={convertImageUrl(party.gameImage)} alt={party.gameName} loading="lazy" decoding="async" className="pdm-img" />
            : <div className="pdm-img-placeholder"><i className="fas fa-theater-masks" /></div>
          }
          <div className="pdm-img-grad" />
          <button className="modal-close-btn pdm-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
          <div className="pdm-img-info">
            <div className="pdm-game-name">{party.gameName || 'ไม่ระบุเกม'}</div>
            <div className="pdm-meta-row">
              <span><i className="fas fa-calendar-alt" /> {formatDate(party.date)}</span>
              <span><i className="fas fa-clock" /> {party.time || '-'}</span>
              <span><i className="fas fa-users" /> {party.members?.length || 0}/{party.maxPlayers} คน</span>
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="pdm-tabs">
          <button className={`pdm-tab${tab === 'info' ? ' active' : ''}`} onClick={() => setTab('info')}>
            <i className="fas fa-info-circle" /> รายละเอียด
          </button>
          <button className={`pdm-tab${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}>
            <i className="fas fa-comment-dots" /> แชทปาร์ตี้
            {isMember && messages.length > 0 && tab !== 'chat' && (
              <span className="pdm-chat-badge">{messages.length}</span>
            )}
          </button>
        </div>

        {/* ── INFO TAB ── */}
        {tab === 'info' && (
          <div className="pdm-body">
            {/* Owner */}
            <div className="pdm-section">
              <div className="pdm-section-label">หัวปาร์ตี้</div>
              <div className="pdm-owner-row">
                {party.ownerAvatar
                  ? <img src={party.ownerAvatar} className="pdm-owner-avatar" alt="" onError={e => e.currentTarget.style.display = 'none'} />
                  : <div className="pdm-owner-avatar-ph">{(party.ownerName || '?')[0]}</div>
                }
                <span className="pdm-owner-name">{isOwner ? 'คุณ' : party.ownerName} <span className="pdm-crown"><i className="fas fa-crown" /></span></span>
              </div>
            </div>

            {/* Members */}
            <div className="pdm-section">
              <div className="pdm-section-label">สมาชิก ({party.members?.length || 0}/{party.maxPlayers})</div>
              <div className="pdm-members-list">
                {(party.members || []).map((m, i) => (
                  <div key={i} className="pdm-member-row">
                    {m.avatar
                      ? <img src={m.avatar} alt={m.name} className="pdm-member-avatar" onError={e => e.currentTarget.style.display = 'none'} />
                      : <div className="pdm-member-avatar-ph">{(m.name || '?')[0]}</div>
                    }
                    <span className="pdm-member-name">{m.name}</span>
                    {m.uid === party.ownerId && <span className="pdm-crown-sm"><i className="fas fa-crown" /></span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Note */}
            {party.note && (
              <div className="pdm-section">
                <div className="pdm-section-label">หมายเหตุ</div>
                <div className="pdm-note">"{party.note}"</div>
              </div>
            )}

            {/* Pending requests — owner only */}
            {isOwner && pendingRequests.length > 0 && (
              <div className="pdm-section">
                <div className="pdm-section-label">คำขอเข้าร่วม ({pendingRequests.length})</div>
                {pendingRequests.map(r => (
                  <div key={r.uid} className="pdm-pending-row">
                    {r.avatar
                      ? <img src={r.avatar} alt="" className="pdm-member-avatar" onError={e => e.currentTarget.style.display = 'none'} />
                      : <div className="pdm-member-avatar-ph">{(r.name || '?')[0]}</div>
                    }
                    <span className="pdm-member-name" style={{ flex: 1 }}>{r.name}</span>
                    <button className="party-approve-btn" onClick={() => onApprove(party, r)}><i className="fas fa-check" /> รับ</button>
                    <button className="party-deny-btn"   onClick={() => onDeny(party, r)}><i className="fas fa-times" /> ปฏิเสธ</button>
                  </div>
                ))}
              </div>
            )}

            {/* Invite — owner only */}
            {isOwner && (
              <div className="pdm-section">
                <div className="pdm-section-label">เชิญสมาชิก</div>
                <button className="pdm-scan-add-btn" onClick={() => setShowMemberScan(true)}>
                  <i className="fas fa-qrcode" /> แสกน QR เพิ่มสมาชิก
                </button>
                <button className="pdm-line-share-btn" onClick={shareToLine} style={{ marginTop: 8 }}>
                  <i className="fab fa-line" /> แชร์ลิงก์เชิญทาง LINE
                </button>
                <div className="pdm-share-hint">แสกน QR สมาชิกโดยตรง หรือแชร์ลิงก์เชิญทาง LINE</div>
              </div>
            )}

            {/* LINE Group URL — owner sets, members see */}
            <div className="pdm-section">
              <div className="pdm-section-label"><i className="fab fa-line" style={{marginRight:4}} />กลุ่ม LINE ของปาร์ตี้</div>
              {isOwner ? (
                <div className="pdm-group-url-row">
                  <input
                    className="pdm-group-url-input"
                    placeholder="วางลิงก์กลุ่ม LINE ที่นี่..."
                    value={lineGroupUrl}
                    onChange={e => setLineGroupUrl(e.target.value)}
                  />
                  <button
                    className="pdm-group-url-save"
                    onClick={saveLineGroupUrl}
                    disabled={savingUrl}
                  >
                    {savingUrl ? <span className="spinner-sm" style={{width:14,height:14}} /> : 'บันทึก'}
                  </button>
                </div>
              ) : party.lineGroupUrl ? (
                <a
                  className="pdm-line-group-btn"
                  href={party.lineGroupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="fab fa-line" /> เข้ากลุ่ม LINE ปาร์ตี้
                </a>
              ) : (
                <div className="pdm-no-group">หัวปาร์ตี้ยังไม่ได้ตั้งค่ากลุ่ม LINE</div>
              )}
            </div>
          </div>
        )}

        {/* ── CHAT TAB ── */}
        {tab === 'chat' && (
          <div className="pdm-chat-wrap">
            {!isMember ? (
              <div className="pdm-chat-locked">
                <i className="fas fa-lock" />
                <p>เข้าร่วมปาร์ตี้เพื่อเข้าถึงแชท</p>
              </div>
            ) : (
              <>
                <div className="pdm-messages">
                  {messages.length === 0 && (
                    <div className="pdm-no-msg">ยังไม่มีข้อความ — เริ่มแชทกันเลย!</div>
                  )}
                  {messages.map(msg => (
                    <div key={msg.id} className={`pdm-msg${msg.uid === user?.uid ? ' mine' : ''}`}>
                      {msg.uid !== user?.uid && (
                        <div className="pdm-msg-avatar">
                          {msg.avatar
                            ? <img src={msg.avatar} alt="" onError={e => e.currentTarget.style.display = 'none'} />
                            : <div className="pdm-msg-avatar-ph">{(msg.name || '?')[0]}</div>
                          }
                        </div>
                      )}
                      <div className="pdm-msg-content">
                        {msg.uid !== user?.uid && <div className="pdm-msg-name">{msg.name}</div>}
                        <div className="pdm-msg-bubble">{msg.text}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="pdm-chat-input-row">
                  <input
                    className="pdm-chat-input"
                    placeholder="พิมพ์ข้อความ..."
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  />
                  <button
                    className="pdm-send-btn"
                    onClick={sendMessage}
                    disabled={sending || !msgText.trim()}
                  >
                    <i className="fas fa-paper-plane" />
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
  const [showPending, setShowPending] = useState(false)

  const isMember = party.members?.some(m => m.uid === user?.uid)
  const isOwner = party.ownerId === user?.uid
  const isFull = (party.members?.length || 0) >= party.maxPlayers
  const isClosed = party.status === 'closed'
  const hasPending = isOwner && (party.pendingRequests?.length || 0) > 0
  const myRequest = !isOwner && (party.pendingRequests || []).some(r => r.uid === user?.uid)

  const statusColor = isClosed ? 'var(--void-500)' : isFull ? '#d97706' : '#16a34a'
  const statusText = isClosed ? 'ปิดแล้ว' : isFull ? 'เต็มแล้ว' : 'เปิดรับ'

  return (
    <div className={`party-card${hasPending ? ' has-pending' : ''}`}>
      <div className="party-card-img" onClick={() => onDetail(party)} style={{ cursor: 'pointer' }}>
        {party.gameImage
          ? <img src={convertImageUrl(party.gameImage)} alt={party.gameName} loading="lazy" decoding="async" />
          : <div className="party-card-img-placeholder"><i className="fas fa-theater-masks" /></div>
        }
        <div className="party-card-img-grad" />
        <span className="party-status-badge" style={{ background: statusColor }}>{statusText}</span>
        {hasPending && (
          <span className="party-pending-badge">{party.pendingRequests.length} คนรอ</span>
        )}
      </div>

      <div className="party-card-body">
        {/* Date/time hero — primary info */}
        <div className="party-datetime-hero" onClick={() => onDetail(party)} style={{ cursor: 'pointer' }}>
          <div className="party-datetime-date">
            <i className="fas fa-calendar-alt" />
            {party.date ? formatDate(party.date) : 'ยังไม่กำหนดวัน'}
          </div>
          {party.time && (
            <div className="party-datetime-time">
              <i className="fas fa-clock" />{party.time}
            </div>
          )}
        </div>
        <div className="party-game-name party-game-name--sub" onClick={() => onDetail(party)} style={{ cursor: 'pointer' }}>
          {party.gameName || 'ไม่ระบุเกม'}
        </div>
        <div className="party-owner">
          {party.ownerAvatar
            ? <img src={party.ownerAvatar} className="party-owner-avatar" alt="" onError={e => e.currentTarget.style.display = 'none'} />
            : <div className="party-owner-avatar-placeholder"><i className="fas fa-user" /></div>
          }
          <span>{isOwner ? 'คุณ (หัวปาร์ตี้)' : party.ownerName}</span>
        </div>
        {party.note && <div className="party-note">"{party.note}"</div>}

        <div className="party-members-row">
          <div className="party-member-avatars">
            {(party.members || []).slice(0, 5).map((m, i) => (
              <div key={i} className="party-member-dot" title={m.name}>
                {m.avatar
                  ? <img src={m.avatar} alt={m.name} onError={e => e.currentTarget.style.display = 'none'} />
                  : <span>{(m.name || '?')[0]}</span>
                }
              </div>
            ))}
            {(party.members?.length || 0) > 5 && (
              <div className="party-member-dot more">+{party.members.length - 5}</div>
            )}
          </div>
          <span className="party-count">{party.members?.length || 0}/{party.maxPlayers} คน</span>
        </div>

        <div className="party-actions-row">
          <button className="party-detail-btn" onClick={() => onDetail(party)}>
            <i className="fas fa-info-circle" /> รายละเอียด
          </button>

          {!user ? (
            <span className="party-login-hint"><i className="fab fa-line" /> Login ก่อน</span>
          ) : isOwner ? (
            <button className="party-pending-toggle" onClick={() => onDetail(party)}>
              <i className="fas fa-crown" />
              {hasPending ? ` ${party.pendingRequests.length} คำขอ` : ' จัดการ'}
            </button>
          ) : isMember ? (
            <button className="party-leave-btn" onClick={() => onLeave(party)}>
              <i className="fas fa-sign-out-alt" /> ออก
            </button>
          ) : myRequest ? (
            <button className="party-join-btn pending" disabled>
              <i className="fas fa-hourglass-half" /> รออนุมัติ
            </button>
          ) : isClosed ? (
            <button className="party-join-btn" disabled>ปิดรับแล้ว</button>
          ) : isFull ? (
            <button className="party-join-btn" disabled>ที่นั่งเต็ม</button>
          ) : (
            <button className="party-join-btn" onClick={() => onRequestJoin(party)}>
              <i className="fas fa-user-plus" /> ขอเข้าร่วม
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── BOOKING PARTY CARD ── */
function BookingPartyCard({ booking, user, onRequestJoin, onOpen }) {
  const members     = booking.members || []
  const maxMembers  = booking.maxMembers || 0
  const isMember    = members.some(m => m.uid === user?.uid)
  const isFull      = members.length >= maxMembers
  const isLocked    = booking.status === 'locked'
  const hasPending  = booking.joinRequests?.some(r => r.uid === user?.uid)

  return (
    <div className="party-card">
      <div className="party-card-img" style={{ cursor: onOpen ? 'pointer' : 'default' }} onClick={onOpen}>
        {booking.gameImage
          ? <img src={convertImageUrl(booking.gameImage)} alt={booking.gameName} loading="lazy" decoding="async" />
          : <div className="party-card-img-placeholder"><i className="fas fa-theater-masks" /></div>
        }
        <div className="party-card-img-grad" />
        {isLocked ? (
          <span className="party-status-badge" style={{ background: '#16a34a' }}>ล็อกแล้ว</span>
        ) : (
          <span className="party-status-badge" style={{ background: isFull ? '#d97706' : '#16a34a' }}>
            {isFull ? 'เต็มแล้ว' : 'เปิดรับ'}
          </span>
        )}
      </div>

      <div className="party-card-body">
        {/* Date/time hero */}
        <div className="party-datetime-hero" onClick={onOpen} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
          <div className="party-datetime-date">
            <i className="fas fa-calendar-alt" />
            {booking.date ? formatDate(booking.date) : 'ยังไม่กำหนดวัน'}
          </div>
          {booking.time && (
            <div className="party-datetime-time">
              <i className="fas fa-clock" />{booking.time}
            </div>
          )}
        </div>
        <div className="party-game-name party-game-name--sub" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: onOpen ? 'pointer' : 'default' }} onClick={onOpen}>
          {booking.gameName || 'ไม่ระบุเกม'}
          <span style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em',
            border: '1px solid #be123c', color: '#be123c', borderRadius: '4px',
            padding: '1px 5px', lineHeight: '1.4', flexShrink: 0,
          }}>จองห้อง</span>
        </div>

        <div className="party-meta">
          {booking.date && <span><i className="fas fa-calendar-alt" />{formatDate(booking.date)}</span>}
          {booking.time && <span><i className="fas fa-clock" />{booking.time}</span>}
          {!isLocked && booking.depositDeadline && (
            <span style={{ color: '#d97706' }}>
              <i className="fas fa-hourglass-half" /> มัดจำ {formatCountdown(booking.depositDeadline)}
            </span>
          )}
        </div>

        <div className="party-owner">
          {booking.leaderAvatar
            ? <img src={booking.leaderAvatar} className="party-owner-avatar" alt="" onError={e => e.currentTarget.style.display = 'none'} />
            : <div className="party-owner-avatar-placeholder"><i className="fas fa-user" /></div>
          }
          <span>{booking.leaderName || 'ไม่ระบุหัวหน้า'}</span>
        </div>

        {booking.depositAmount > 0 && (
          <div className="party-note" style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: '12px' }}>
            มัดจำ ฿{booking.depositAmount}/คน
          </div>
        )}

        <div className="party-members-row">
          <div className="party-member-avatars">
            {members.slice(0, 5).map((m, i) => (
              <div key={i} className="party-member-dot" title={m.name}>
                {m.avatar
                  ? <img src={m.avatar} alt={m.name} onError={e => e.currentTarget.style.display = 'none'} />
                  : <span>{(m.name || '?')[0]}</span>
                }
              </div>
            ))}
            {members.length > 5 && (
              <div className="party-member-dot more">+{members.length - 5}</div>
            )}
          </div>
          <span className="party-count">{members.length}/{maxMembers} คน</span>
        </div>

        <div className="party-actions-row">
          {!user ? (
            <span className="party-login-hint"><i className="fab fa-line" /> Login ก่อน</span>
          ) : isMember ? (
            <button className="party-join-btn" disabled>
              <i className="fas fa-check" /> อยู่แล้ว
            </button>
          ) : hasPending ? (
            <button className="party-join-btn pending" disabled style={{ background: '#d97706', opacity: 0.85 }}>
              <i className="fas fa-hourglass-half" /> รออนุมัติ
            </button>
          ) : isLocked || isFull ? (
            <button className="party-join-btn" disabled>เต็มแล้ว</button>
          ) : (
            <button className="party-join-btn" onClick={() => onRequestJoin(booking)}>
              <i className="fas fa-user-plus" /> ขอเข้าร่วม
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

  const submit = async () => {
    if (!gameId || !date || !time) return alert('กรุณาเลือกเกม วันที่ และเวลา')
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

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="party-modal">
        <div className="party-modal-header">
          <h3><i className="fas fa-users" /> สร้างปาร์ตี้ใหม่</h3>
          <button className="modal-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        <div className="party-modal-body">
          <label className="party-field-label">เลือกสคริปต์ *</label>
          <select className="party-select" value={gameId} onChange={e => setGameId(e.target.value)}>
            <option value="">-- เลือกสคริปต์ --</option>
            {allGames.map(g => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>

          {selectedGame && (
            <div className="party-game-preview">
              {(selectedGame.image || selectedGame.coverUrl) && (
                <img src={convertImageUrl(selectedGame.image || selectedGame.coverUrl)} alt="" loading="lazy" decoding="async" />
              )}
              <div>
                <div className="party-game-preview-title">{selectedGame.title}</div>
                <div className="party-game-preview-meta">
                  {selectedGame.players && <span><i className="fas fa-users" /> {selectedGame.players} คน</span>}
                  {selectedGame.difficulty && <span>{selectedGame.difficulty}</span>}
                </div>
              </div>
            </div>
          )}

          <div className="party-field-row">
            <div>
              <label className="party-field-label">วันที่ *</label>
              <input type="date" className="party-input" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label className="party-field-label">เวลา *</label>
              <input type="time" className="party-input" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>

          <label className="party-field-label">จำนวนผู้เล่นสูงสุด</label>
          <div className="party-players-selector">
            {[2,3,4,5,6,8,10,12].map(n => (
              <button
                key={n}
                className={`party-player-btn${maxPlayers === n ? ' selected' : ''}`}
                onClick={() => setMaxPlayers(n)}
              >{n}</button>
            ))}
          </div>

          <label className="party-field-label">หมายเหตุ (ถ้ามี)</label>
          <textarea
            className="party-textarea"
            placeholder="เช่น มือใหม่ยินดีต้อนรับ, ต้องการผู้เล่นที่มีประสบการณ์..."
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
          />
        </div>
        <div className="party-modal-footer">
          <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? <span className="spinner-sm" /> : <><i className="fas fa-plus" /> สร้างปาร์ตี้</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── MAIN PAGE ── */
export default function PartyPage({ user, allGames, parties = [], highlightPartyId, onLogin = () => {} }) {
  const [filter, setFilter]               = useState('open')
  const [gameSearch, setGameSearch]       = useState('')
  const [dateFilter, setDateFilter]       = useState('')
  const [copiedId, setCopiedId]           = useState(null)
  const [detailParty, setDetailParty]     = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [bookings, setBookings]           = useState([])

  useEffect(() => {
    const q = query(
      collection(db, 'bookings'),
      where('status', 'in', ['confirmed', 'locked'])
    )
    return onSnapshot(q, snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, _type: 'booking', ...d.data() })))
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
    ? bookings.filter(b => b.status === 'confirmed' && (b.members?.length || 0) < b.maxMembers)
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

  // keep detailParty in sync when parties update (e.g. new message badge)
  useEffect(() => {
    if (!detailParty) return
    const fresh = parties.find(p => p.id === detailParty.id)
    if (fresh) setDetailParty(fresh)
  }, [parties])

  return (
    <div id="party-page" className="page active">
      <div className="party-page-header">
        <div className="party-page-header-bg" />
        <div className="party-page-header-content">
          <h1 className="party-page-title">
            <i className="fas fa-users" /> ปาร์ตี้เกม
          </h1>
          <p className="party-page-subtitle">รวมกลุ่มกับเพื่อนใหม่ เล่นสคริปต์ที่คุณชื่นชอบ</p>
        </div>
      </div>

      <div className="party-page-body">
        <div className="party-topbar">
          <div className="party-filter-tabs">
            <button className={`party-tab${filter === 'open' ? ' active' : ''}`} onClick={() => setFilter('open')}>
              เปิดรับสมาชิก
            </button>
            <button className={`party-tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
              ทั้งหมด
            </button>
          </div>
          {myPendingCount > 0 && (
            <span className="party-my-pending-badge">
              <i className="fas fa-bell" /> {myPendingCount} คำขอใหม่
            </span>
          )}
        </div>

        {/* Search & date filter bar */}
        <div className="party-search-bar">
          <div className="party-search-field">
            <i className="fas fa-search party-search-icon" />
            <input
              type="text"
              className="party-search-input"
              placeholder="ค้นหาชื่อเกม..."
              value={gameSearch}
              onChange={e => setGameSearch(e.target.value)}
            />
            {gameSearch && (
              <button className="party-search-clear" onClick={() => setGameSearch('')}>
                <i className="fas fa-times" />
              </button>
            )}
          </div>
          <div className="party-search-field party-date-field">
            <i className="fas fa-calendar-alt party-search-icon" />
            <input
              type="date"
              className="party-search-input"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
            />
            {dateFilter && (
              <button className="party-search-clear" onClick={() => setDateFilter('')}>
                <i className="fas fa-times" />
              </button>
            )}
          </div>
          {(gameSearch || dateFilter) && (
            <button className="party-search-reset" onClick={() => { setGameSearch(''); setDateFilter('') }}>
              ล้างทั้งหมด
            </button>
          )}
        </div>

        {allItems.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-users-slash" />
            <p>{gameSearch || dateFilter ? 'ไม่พบปาร์ตี้ที่ตรงกับการค้นหา' : filter === 'open' ? 'ยังไม่มีปาร์ตี้เปิดรับสมาชิก' : 'ยังไม่มีปาร์ตี้'}</p>
            {(gameSearch || dateFilter) && (
              <button className="btn-primary" onClick={() => { setGameSearch(''); setDateFilter('') }} style={{ marginTop: '16px' }}>
                ล้างตัวกรอง
              </button>
            )}
          </div>
        ) : (
          <div className="party-grid">
            {allItems.map(item =>
              item._type === 'booking'
                ? <BookingPartyCard
                    key={item.id}
                    booking={item}
                    user={user}
                    onRequestJoin={handleBookingRequestJoin}
                    onOpen={() => {}}
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
    </div>
  )
}
