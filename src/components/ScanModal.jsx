import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'

export default function ScanModal({ scannedUid, adminUser, allGames, onClose, showToast }) {
  const [scannedUser, setScannedUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scriptId, setScriptId] = useState('')
  const [character, setCharacter] = useState('')
  const [dm, setDm] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!scannedUid) return
    getDoc(doc(db, 'members', scannedUid))
      .then(snap => {
        if (snap.exists()) setScannedUser({ uid: scannedUid, ...snap.data() })
        else showToast('ไม่พบข้อมูลสมาชิก', 'error')
      })
      .catch(() => showToast('เกิดข้อผิดพลาด', 'error'))
      .finally(() => setLoading(false))
  }, [scannedUid])

  const selectedGame = allGames.find(g => g.id === scriptId)

  const handleSave = async () => {
    if (!scannedUser) return
    if (!scriptId) { showToast('กรุณาเลือกเกม', 'error'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'playHistory'), {
        userId: scannedUser.uid,
        userName: scannedUser.nickname || scannedUser.firstname || scannedUser.name || '',
        userAvatar: scannedUser.pictureUrl || '',
        scriptId,
        scriptTitle: selectedGame?.title || '',
        character: character.trim(),
        dm: dm.trim(),
        playedAt: serverTimestamp(),
        recordedBy: adminUser?.name || adminUser?.uid || 'admin',
      })
      showToast('บันทึกประวัติสำเร็จ ✓')
      onClose()
    } catch (e) {
      showToast('บันทึกล้มเหลว: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="scan-modal">
        <div className="scan-modal-header">
          <div className="scan-modal-title"><i className="fas fa-qrcode" /> บันทึกประวัติการเล่น</div>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="scan-modal-body">
          {loading ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : scannedUser ? (
            <>
              {/* Scanned user profile */}
              <div className="scan-user-card">
                {scannedUser.pictureUrl
                  ? <img src={scannedUser.pictureUrl} alt="" className="scan-user-avatar" />
                  : <div className="scan-user-avatar-ph">{(scannedUser.nickname || scannedUser.firstname || '?')[0]}</div>
                }
                <div>
                  <div className="scan-user-name">
                    {scannedUser.nickname || scannedUser.firstname} {scannedUser.lastname || ''}
                  </div>
                  <div className="scan-user-sub">
                    <i className="fas fa-check-circle" style={{ color: 'var(--feedback-success-icon)', marginRight: 4 }} />
                    ยืนยันตัวตนสำเร็จ
                  </div>
                </div>
              </div>

              <div className="scan-divider" />

              {/* Game select */}
              <div className="form-group">
                <label className="form-label">เกมที่เล่น *</label>
                <select className="form-select" value={scriptId} onChange={e => { setScriptId(e.target.value); setCharacter('') }}>
                  <option value="">— เลือกเกม —</option>
                  {allGames.map(g => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>

              {/* Character select (if game has characters) */}
              <div className="form-group">
                <label className="form-label">ตัวละครที่รับบท</label>
                {selectedGame?.characters?.length > 0 ? (
                  <select className="form-select" value={character} onChange={e => setCharacter(e.target.value)}>
                    <option value="">— เลือกตัวละคร —</option>
                    {selectedGame.characters.map((c, i) => (
                      <option key={i} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="form-input"
                    placeholder="ชื่อตัวละคร"
                    value={character}
                    onChange={e => setCharacter(e.target.value)}
                  />
                )}
              </div>

              {/* DM */}
              <div className="form-group">
                <label className="form-label">DM (ผู้ดำเนินเกม)</label>
                <input
                  className="form-input"
                  placeholder="ชื่อ DM"
                  value={dm}
                  onChange={e => setDm(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="empty-state"><i className="fas fa-exclamation-circle" /><p>ไม่พบข้อมูลสมาชิก</p></div>
          )}
        </div>

        {!loading && scannedUser && (
          <div className="scan-modal-footer">
            <button className="btn-outline-red" onClick={onClose}>ยกเลิก</button>
            <button className="btn-full-red" onClick={handleSave} disabled={saving}>
              {saving
                ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                : <><i className="fas fa-check" /> ยืนยันบันทึก</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
