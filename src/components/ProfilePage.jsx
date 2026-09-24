import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_RARITY, RARITY } from '../constants/achievements'

const MAX_PINNED = 5

export default function ProfilePage({ lineUser, onLogout, showPage }) {
  const [form, setForm] = useState({
    nickname: '', firstname: '', lastname: '',
    tel_no: '', email: '', birthday: '', gender: '', position: ''
  })
  const [pictureUrl, setPictureUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // achievements
  const [myAchievements, setMyAchievements] = useState([])   // all owned
  const [pinned, setPinned] = useState([])                    // up to 5 shown
  const [pinnedSaved, setPinnedSaved] = useState(false)
  const [pinnedSaving, setPinnedSaving] = useState(false)

  useEffect(() => {
    if (!lineUser?.uid) return
    getDoc(doc(db, 'members', lineUser.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        setForm({
          nickname: d.nickname || '',
          firstname: d.firstname || '',
          lastname: d.lastname || '',
          tel_no: d.tel_no || '',
          email: d.email || '',
          birthday: d.birthday || '',
          gender: d.gender || '',
          position: d.position || '',
        })
        setPictureUrl(d.pictureUrl || lineUser.avatar || '')

        const owned = Array.isArray(d.achievements) ? d.achievements
          : d.achievement ? [d.achievement] : []
        setMyAchievements(owned)

        const fp = Array.isArray(d.pinnedAchievements) ? d.pinnedAchievements
          : owned  // default: show all owned
        setPinned(fp.filter(id => owned.includes(id)))
      }
    }).finally(() => setLoading(false))
  }, [lineUser])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'members', lineUser.uid), {
        ...form,
        updatedAt: serverTimestamp(),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      alert('บันทึกล้มเหลว: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const togglePin = (id) => {
    setPinned(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < MAX_PINNED ? [...prev, id] : prev
    )
  }

  const savePinned = async () => {
    setPinnedSaving(true)
    try {
      await updateDoc(doc(db, 'members', lineUser.uid), { pinnedAchievements: pinned })
      setPinnedSaved(true)
      setTimeout(() => setPinnedSaved(false), 2000)
    } catch (e) {
      alert('บันทึกล้มเหลว: ' + e.message)
    } finally {
      setPinnedSaving(false)
    }
  }

  const avatarLetter = (form.nickname || form.firstname || lineUser?.name || '?')[0].toUpperCase()

  if (!lineUser) {
    return (
      <div id="profile-page" className="page active profile-guest">
        <div className="profile-guest-inner">
          <div className="profile-guest-icon"><i className="fas fa-user-circle" /></div>
          <h2>ยังไม่ได้เข้าสู่ระบบ</h2>
          <p>เข้าสู่ระบบด้วย LINE เพื่อดูและแก้ไขโปรไฟล์ของคุณ</p>
        </div>
      </div>
    )
  }

  return (
    <div id="profile-page" className="page active">
      <div className="profile-header-banner">
        <div className="profile-avatar-wrap">
          {pictureUrl
            ? <img src={pictureUrl} alt="" className="profile-avatar-img" onError={e => e.currentTarget.style.display = 'none'} referrerPolicy="no-referrer" />
            : <div className="profile-avatar-placeholder">{avatarLetter}</div>
          }
          <div className="profile-line-badge"><i className="fab fa-line" /></div>
        </div>
        <div className="profile-header-name">{form.nickname || form.firstname || lineUser.name}</div>
        <div className="profile-header-sub">LINE Member{lineUser.role === 'admin' ? ' · Admin' : ''}</div>

        {/* Pinned achievements strip under name */}
        {pinned.length > 0 && (
          <div className="profile-pinned-strip">
            {pinned.map(id => {
              const ach = ACHIEVEMENTS[id]
              if (!ach) return null
              const rar = RARITY[ach.rarity]
              return (
                <span key={id} className="profile-pinned-badge"
                  style={{
                    color: ach.color,
                    background: ach.bg,
                    border: `1px solid ${ach.border}`,
                    boxShadow: ach.rarity !== 'common' ? `0 0 8px ${rar.glow}` : 'none',
                  }}>
                  <i className={`fas ${ach.icon}`} />
                  <span>{ach.labelTH}</span>
                  <span className="profile-pinned-rarity" style={{ color: rar.color }}>{rar.label}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      <div className="profile-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--void-400)' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px' }} />
          </div>
        ) : (
          <>
            {/* ── Achievements section ── */}
            {myAchievements.length > 0 && (
              <div className="profile-ach-section">
                <div className="profile-section-title">
                  <i className="fas fa-award" style={{ marginRight: 6 }} />Achievements
                </div>

                {myAchievements.length > 1 && (
                  <div className="profile-ach-hint">
                    เลือกที่ต้องการแสดงในโปรไฟล์ (สูงสุด {MAX_PINNED}) · เลือกแล้ว {pinned.length}/{MAX_PINNED}
                  </div>
                )}

                {ACHIEVEMENTS_BY_RARITY.map(({ rarity: rar, items }) => {
                  const ownedInGroup = items.filter(a => myAchievements.includes(a.id))
                  if (ownedInGroup.length === 0) return null
                  return (
                    <div key={rar.id} className="profile-ach-rarity-group">
                      <div className="profile-ach-rarity-label" style={{ color: rar.color }}>
                        <span className="profile-ach-rarity-dot" style={{ background: rar.color, boxShadow: `0 0 6px ${rar.glow}` }} />
                        {rar.label}
                      </div>
                      <div className="profile-ach-grid">
                        {ownedInGroup.map(ach => {
                          const isPinned = pinned.includes(ach.id)
                          const canAdd = pinned.length < MAX_PINNED
                          const selectable = myAchievements.length > 1
                          return (
                            <button
                              key={ach.id}
                              className={`profile-ach-card${isPinned ? ' pinned' : ''}${selectable ? ' selectable' : ''}`}
                              style={{
                                '--ac': ach.color,
                                '--ab': ach.bg,
                                '--abr': ach.border,
                                '--ag': rar.glow,
                              }}
                              onClick={() => selectable && togglePin(ach.id)}
                              disabled={selectable && !isPinned && !canAdd}
                              title={selectable ? (isPinned ? 'คลิกเพื่อยกเลิก' : canAdd ? 'คลิกเพื่อเลือก' : 'เลือกครบ 5 แล้ว') : ''}
                            >
                              <div className="profile-ach-icon">
                                <i className={`fas ${ach.icon}`} />
                              </div>
                              <div className="profile-ach-label">{ach.label}</div>
                              <div className="profile-ach-sublabel">{ach.labelTH}</div>
                              <div className="profile-ach-desc">{ach.descTH}</div>
                              {selectable && (
                                <div className={`profile-ach-check${isPinned ? ' checked' : ''}`}>
                                  <i className={`fas ${isPinned ? 'fa-check-circle' : 'fa-circle'}`} />
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {myAchievements.length > 1 && (
                  <button
                    className={`profile-ach-save-btn${pinnedSaved ? ' saved' : ''}`}
                    onClick={savePinned}
                    disabled={pinnedSaving}
                  >
                    {pinnedSaving
                      ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                      : pinnedSaved
                        ? <><i className="fas fa-check" /> บันทึกแล้ว!</>
                        : <><i className="fas fa-save" /> บันทึกที่เลือก</>
                    }
                  </button>
                )}
              </div>
            )}

            <div className="profile-section-title">ข้อมูลส่วนตัว</div>

            <div className="profile-form">
              <div className="profile-row">
                <div className="profile-field">
                  <label>ชื่อจริง</label>
                  <input className="profile-input" value={form.firstname} onChange={e => set('firstname', e.target.value)} placeholder="ชื่อจริง" />
                </div>
                <div className="profile-field">
                  <label>นามสกุล</label>
                  <input className="profile-input" value={form.lastname} onChange={e => set('lastname', e.target.value)} placeholder="นามสกุล" />
                </div>
              </div>

              <div className="profile-field">
                <label>ชื่อเล่น</label>
                <input className="profile-input" value={form.nickname} onChange={e => set('nickname', e.target.value)} placeholder="ชื่อเล่น" />
              </div>

              <div className="profile-field">
                <label>เบอร์โทรศัพท์</label>
                <input className="profile-input" type="tel" value={form.tel_no} onChange={e => set('tel_no', e.target.value)} placeholder="08x-xxx-xxxx" />
              </div>

              <div className="profile-field">
                <label>อีเมล</label>
                <input className="profile-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="example@email.com" />
              </div>

              <div className="profile-row">
                <div className="profile-field">
                  <label>วันเกิด</label>
                  <input className="profile-input" type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)} />
                </div>
                <div className="profile-field">
                  <label>เพศ</label>
                  <select className="profile-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">-- เลือก --</option>
                    <option value="ชาย">ชาย</option>
                    <option value="หญิง">หญิง</option>
                    <option value="อื่นๆ">อื่นๆ</option>
                  </select>
                </div>
              </div>

              <button className={`profile-save-btn${saved ? ' saved' : ''}`} onClick={handleSave} disabled={saving}>
                {saving
                  ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                  : saved
                    ? <><i className="fas fa-check" /> บันทึกแล้ว!</>
                    : <><i className="fas fa-save" /> บันทึกข้อมูล</>
                }
              </button>
            </div>

            <div className="profile-section-title" style={{ marginTop: '32px' }}>บัญชี</div>
            <div className="profile-account-box">
              <div className="profile-account-row">
                <i className="fab fa-line" style={{ color: 'var(--line-green)', fontSize: '20px' }} />
                <div>
                  <div className="profile-account-label">LINE Account</div>
                  <div className="profile-account-value">{lineUser.name}</div>
                </div>
                <span className="profile-account-badge">เชื่อมต่อแล้ว</span>
              </div>
            </div>

            <button className="profile-logout-btn" onClick={onLogout}>
              <i className="fas fa-sign-out-alt" /> ออกจากระบบ
            </button>
          </>
        )}
      </div>
    </div>
  )
}
