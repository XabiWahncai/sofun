import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_RARITY, RARITY } from '../constants/achievements'

const C = '#c62419'
const INK = '#1a1a1a'
const INK_2 = 'rgba(26,26,26,0.65)'
const INK_3 = 'rgba(26,26,26,0.4)'
const PAPER = '#faf7f5'
const BORDER = 'rgba(26,26,26,0.08)'
const BORDER_2 = 'rgba(26,26,26,0.14)'

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

  const [myAchievements, setMyAchievements] = useState([])
  const [pinned, setPinned] = useState([])
  const [pinnedSaved, setPinnedSaved] = useState(false)
  const [pinnedSaving, setPinnedSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [snapshot, setSnapshot] = useState(null)
  const [editingAch, setEditingAch] = useState(false)
  const [pinnedSnapshot, setPinnedSnapshot] = useState(null)

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

        const fp = Array.isArray(d.pinnedAchievements) ? d.pinnedAchievements : owned
        setPinned(fp.filter(id => owned.includes(id)))
      }
    }).finally(() => setLoading(false))
  }, [lineUser])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'members', lineUser.uid), { ...form, updatedAt: serverTimestamp() })
      setSaved(true)
      setEditing(false)
      setSnapshot(null)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      alert('บันทึกล้มเหลว: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = () => { setSnapshot(form); setEditing(true) }
  const cancelEdit = () => { if (snapshot) setForm(snapshot); setEditing(false); setSnapshot(null) }

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
      setEditingAch(false)
      setPinnedSnapshot(null)
      setTimeout(() => setPinnedSaved(false), 2000)
    } catch (e) {
      alert('บันทึกล้มเหลว: ' + e.message)
    } finally {
      setPinnedSaving(false)
    }
  }

  const startEditAch = () => { setPinnedSnapshot(pinned); setEditingAch(true) }
  const cancelEditAch = () => { if (pinnedSnapshot) setPinned(pinnedSnapshot); setEditingAch(false); setPinnedSnapshot(null) }

  const avatarLetter = (form.nickname || form.firstname || lineUser?.name || '?')[0].toUpperCase()

  if (!lineUser) {
    return (
      <div style={{ background: PAPER, minHeight: '100vh', paddingTop: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px 40px' }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: '48px 32px', textAlign: 'center', maxWidth: 420, width: '100%', boxShadow: '0 2px 12px rgba(26,26,26,0.06)', border: `1px solid ${BORDER}` }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <i className="fas fa-user-circle" style={{ fontSize: 36, color: INK_3 }} />
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: '-0.01em' }}>ยังไม่ได้เข้าสู่ระบบ</h2>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: INK_2, lineHeight: 1.6 }}>เข้าสู่ระบบด้วย LINE เพื่อดูและแก้ไขโปรไฟล์ของคุณ</p>
        </div>
      </div>
    )
  }

  const sectionLabel = (text, extra) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: INK_3 }}>{text}</span>
      {extra}
    </div>
  )

  const inputStyle = {
    width: '100%', height: 48, padding: '0 16px',
    background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 12,
    color: INK, fontSize: 14, fontWeight: 500, outline: 'none',
    fontFamily: "'Sarabun', sans-serif", boxSizing: 'border-box',
    transition: 'border-color 0.18s, box-shadow 0.18s',
  }

  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: INK_2, marginBottom: 6 }

  return (
    <div style={{ background: PAPER, minHeight: '100vh', paddingTop: 60, paddingBottom: 80, fontFamily: "'Sarabun', sans-serif" }}>
      <style>{`
        .pp-input:focus { border-color: ${C} !important; box-shadow: 0 0 0 3px ${C}18 !important; }
        .pp-select:focus { border-color: ${C} !important; box-shadow: 0 0 0 3px ${C}18 !important; }
        .pp-btn-primary:hover:not(:disabled) { background: #9a1c13 !important; box-shadow: 0 8px 24px ${C}48 !important; transform: translateY(-1px); }
        .pp-btn-ghost:hover { background: ${PAPER} !important; color: ${INK} !important; }
        .pp-ach-card { transition: all 0.18s; cursor: pointer; }
        .pp-ach-card:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(26,26,26,0.1); }
      `}</style>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px' }}>

        {/* HERO */}
        <div style={{ background: '#fff', borderRadius: 24, padding: '32px 24px 28px', textAlign: 'center', marginTop: 24, boxShadow: '0 2px 12px rgba(26,26,26,0.05)', border: `1px solid ${BORDER}`, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100, background: `linear-gradient(180deg, ${C}08 0%, transparent 100%)`, pointerEvents: 'none' }} />

          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
            {pictureUrl
              ? <img src={pictureUrl} alt="" style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '4px solid #fff', boxShadow: '0 8px 24px rgba(26,26,26,0.15)' }} onError={e => e.currentTarget.style.display = 'none'} referrerPolicy="no-referrer" />
              : <div style={{ width: 100, height: 100, borderRadius: '50%', background: C, color: '#fff', fontSize: 36, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #fff', boxShadow: '0 8px 24px rgba(26,26,26,0.15)' }}>{avatarLetter}</div>
            }
            <div style={{ position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
              <i className="fab fa-line" style={{ color: '#fff', fontSize: 12 }} />
            </div>
          </div>

          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: INK, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {form.nickname || form.firstname || lineUser.name}
          </h1>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: INK_3, letterSpacing: '0.04em' }}>LINE Member</span>
            {lineUser.role === 'admin' && (
              <>
                <span style={{ color: INK_3 }}>·</span>
                <span style={{ fontSize: 11, fontWeight: 900, color: C, padding: '2px 10px', borderRadius: 999, background: `${C}10`, border: `1px solid ${C}2c`, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Admin</span>
              </>
            )}
          </div>

          {/* Pinned achievements strip */}
          {pinned.length > 0 && (
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
              {pinned.map(id => {
                const ach = ACHIEVEMENTS[id]
                if (!ach) return null
                const rar = RARITY[ach.rarity]
                return (
                  <span key={id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 11px', borderRadius: 999,
                    fontSize: 11, fontWeight: 700,
                    color: ach.color, background: ach.bg,
                    border: `1px solid ${ach.border}`,
                    boxShadow: ach.rarity !== 'common' ? `0 0 8px ${rar.glow}` : 'none',
                  }}>
                    <i className={`fas ${ach.icon}`} style={{ fontSize: 10 }} />
                    <span>{ach.labelTH}</span>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* BODY */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: INK_3 }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }} />
          </div>
        ) : (
          <>
            {/* ── Achievements ── */}
            {myAchievements.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 20, padding: '24px 20px', marginTop: 20, border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(26,26,26,0.04)' }}>
                {sectionLabel(
                  <><i className="fas fa-award" style={{ marginRight: 6, color: C }} />Achievements</>,
                  !editingAch && myAchievements.length > 1 && (
                    <button
                      onClick={startEditAch}
                      className="pp-btn-ghost"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 999,
                        background: `${C}0c`, color: C,
                        border: `1px solid ${C}2c`, cursor: 'pointer',
                        fontSize: 12, fontWeight: 700, fontFamily: "'Sarabun', sans-serif",
                        transition: 'all 0.18s',
                      }}
                    >
                      <i className="fas fa-pen" style={{ fontSize: 10 }} />แก้ไข
                    </button>
                  )
                )}

                {!editingAch ? (
                  /* ── VIEW MODE ── show pinned only ── */
                  pinned.length === 0 ? (
                    <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 32, color: INK_3, marginBottom: 10 }}>
                        <i className="fas fa-award" />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>ยังไม่ได้เลือก Achievement มาแสดง</div>
                      <div style={{ fontSize: 12, color: INK_2, marginTop: 4 }}>กดปุ่ม "แก้ไข" เพื่อเลือก achievement ที่ต้องการโชว์</div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                      {pinned.map(id => {
                        const ach = ACHIEVEMENTS[id]
                        if (!ach) return null
                        const rar = RARITY[ach.rarity]
                        return (
                          <div
                            key={id}
                            title={ach.labelTH}
                            style={{
                              position: 'relative',
                              padding: '10px 6px 8px',
                              background: ach.bg,
                              border: `1.5px solid ${ach.border}`,
                              borderRadius: 10,
                              textAlign: 'center',
                              boxShadow: ach.rarity !== 'common' ? `0 0 10px ${rar.glow}` : 'none',
                            }}
                          >
                            <div style={{ fontSize: 20, color: ach.color, marginBottom: 4, lineHeight: 1 }}>
                              <i className={`fas ${ach.icon}`} />
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 900, color: ach.color, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ach.label}</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                ) : (
                  /* ── EDIT MODE ── show all with selection ── */
                  <>
                    <p style={{ margin: '0 0 16px', fontSize: 12.5, color: INK_2, lineHeight: 1.55 }}>
                      เลือก achievement ที่ต้องการแสดงในโปรไฟล์ (สูงสุด {MAX_PINNED} อัน) ·
                      <span style={{ color: C, fontWeight: 700, marginLeft: 4 }}>เลือกแล้ว {pinned.length}/{MAX_PINNED}</span>
                    </p>

                    {ACHIEVEMENTS_BY_RARITY.map(({ rarity: rar, items }) => {
                      const ownedInGroup = items.filter(a => myAchievements.includes(a.id))
                      if (ownedInGroup.length === 0) return null
                      return (
                        <div key={rar.id} style={{ marginBottom: 20 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: rar.color, boxShadow: `0 0 6px ${rar.glow}` }} />
                            <span style={{ fontSize: 11, fontWeight: 900, color: rar.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{rar.label}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                            {ownedInGroup.map(ach => {
                              const isPinned = pinned.includes(ach.id)
                              const canAdd = pinned.length < MAX_PINNED
                              const disabled = !isPinned && !canAdd
                              return (
                                <button
                                  key={ach.id}
                                  className="pp-ach-card"
                                  onClick={() => togglePin(ach.id)}
                                  disabled={disabled}
                                  title={`${ach.labelTH} — ${isPinned ? 'คลิกเพื่อยกเลิก' : canAdd ? 'คลิกเพื่อเลือก' : 'เลือกครบ 5 แล้ว'}`}
                                  style={{
                                    position: 'relative',
                                    padding: '10px 6px 8px',
                                    background: isPinned ? ach.bg : '#fff',
                                    border: `1.5px solid ${isPinned ? ach.border : BORDER}`,
                                    borderRadius: 10,
                                    color: INK,
                                    fontFamily: "'Sarabun', sans-serif",
                                    textAlign: 'center',
                                    opacity: disabled ? 0.4 : 1,
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                    boxShadow: isPinned && ach.rarity !== 'common' ? `0 0 10px ${rar.glow}` : 'none',
                                  }}
                                >
                                  <div style={{ fontSize: 20, color: ach.color, marginBottom: 4, lineHeight: 1 }}>
                                    <i className={`fas ${ach.icon}`} />
                                  </div>
                                  <div style={{ fontSize: 10, fontWeight: 900, color: ach.color, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ach.label}</div>
                                  {isPinned && (
                                    <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 11, color: C, lineHeight: 1 }}>
                                      <i className="fas fa-check-circle" />
                                    </div>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={cancelEditAch}
                        disabled={pinnedSaving}
                        className="pp-btn-ghost"
                        style={{
                          flex: 1, height: 48, borderRadius: 12,
                          background: '#fff', color: INK_2,
                          border: `1px solid ${BORDER_2}`, cursor: pinnedSaving ? 'not-allowed' : 'pointer',
                          fontSize: 14, fontWeight: 700, fontFamily: "'Sarabun', sans-serif",
                          transition: 'all 0.18s',
                        }}
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={savePinned}
                        disabled={pinnedSaving}
                        className="pp-btn-primary"
                        style={{
                          flex: 2, height: 48, borderRadius: 12,
                          background: C, color: '#fff', border: 'none',
                          cursor: pinnedSaving ? 'wait' : 'pointer',
                          fontSize: 14, fontWeight: 800, fontFamily: "'Sarabun', sans-serif",
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          boxShadow: `0 4px 16px ${C}30`, transition: 'all 0.18s',
                        }}
                      >
                        {pinnedSaving ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                          : <><i className="fas fa-check" /> บันทึกการแก้ไข</>}
                      </button>
                    </div>
                  </>
                )}

                {pinnedSaved && !editingAch && (
                  <div style={{
                    marginTop: 14, padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(6,199,85,0.1)', border: '1px solid rgba(6,199,85,0.3)',
                    color: '#06c755', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <i className="fas fa-check-circle" />บันทึก achievement ที่เลือกเรียบร้อยแล้ว
                  </div>
                )}
              </div>
            )}

            {/* ── Personal info ── */}
            <div style={{ background: '#fff', borderRadius: 20, padding: '24px 20px', marginTop: 20, border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(26,26,26,0.04)' }}>
              {sectionLabel(
                <><i className="fas fa-user" style={{ marginRight: 6, color: C }} />ข้อมูลส่วนตัว</>,
                !editing && (
                  <button
                    onClick={startEdit}
                    className="pp-btn-ghost"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 999,
                      background: `${C}0c`, color: C,
                      border: `1px solid ${C}2c`, cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, fontFamily: "'Sarabun', sans-serif",
                      transition: 'all 0.18s',
                    }}
                  >
                    <i className="fas fa-pen" style={{ fontSize: 10 }} />แก้ไข
                  </button>
                )
              )}

              {!editing ? (
                /* ── VIEW MODE ── */
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {[
                    { icon: 'fa-id-card',       label: 'ชื่อ-นามสกุล', value: [form.firstname, form.lastname].filter(Boolean).join(' ') },
                    { icon: 'fa-smile',         label: 'ชื่อเล่น',      value: form.nickname },
                    { icon: 'fa-phone',         label: 'เบอร์โทรศัพท์',  value: form.tel_no },
                    { icon: 'fa-envelope',      label: 'อีเมล',         value: form.email, mono: true },
                    { icon: 'fa-cake-candles',  label: 'วันเกิด',       value: form.birthday ? new Date(form.birthday).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '' },
                    { icon: 'fa-venus-mars',    label: 'เพศ',           value: form.gender },
                  ].map((row, i, arr) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 2px',
                      borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none',
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`fas ${row.icon}`} style={{ color: C, fontSize: 13 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: INK_3, letterSpacing: '0.04em' }}>{row.label}</div>
                        <div style={{
                          marginTop: 2, fontSize: 14,
                          fontWeight: row.value ? 700 : 500,
                          color: row.value ? INK : INK_3,
                          fontFamily: row.mono ? "'JetBrains Mono', monospace" : "'Sarabun', sans-serif",
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {row.value || 'ยังไม่ระบุ'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* ── EDIT MODE ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>ชื่อจริง</label>
                      <input className="pp-input" style={inputStyle} value={form.firstname} onChange={e => set('firstname', e.target.value)} placeholder="ชื่อจริง" />
                    </div>
                    <div>
                      <label style={labelStyle}>นามสกุล</label>
                      <input className="pp-input" style={inputStyle} value={form.lastname} onChange={e => set('lastname', e.target.value)} placeholder="นามสกุล" />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>ชื่อเล่น</label>
                    <input className="pp-input" style={inputStyle} value={form.nickname} onChange={e => set('nickname', e.target.value)} placeholder="ชื่อเล่น" />
                  </div>

                  <div>
                    <label style={labelStyle}>เบอร์โทรศัพท์</label>
                    <input className="pp-input" style={inputStyle} type="tel" value={form.tel_no} onChange={e => set('tel_no', e.target.value)} placeholder="08x-xxx-xxxx" />
                  </div>

                  <div>
                    <label style={labelStyle}>อีเมล</label>
                    <input className="pp-input" style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="example@email.com" />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>วันเกิด</label>
                      <input className="pp-input" style={{ ...inputStyle, colorScheme: 'light' }} type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>เพศ</label>
                      <select className="pp-select" style={{ ...inputStyle, cursor: 'pointer' }} value={form.gender} onChange={e => set('gender', e.target.value)}>
                        <option value="">— เลือก —</option>
                        <option value="ชาย">ชาย</option>
                        <option value="หญิง">หญิง</option>
                        <option value="อื่นๆ">อื่นๆ</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className="pp-btn-ghost"
                      style={{
                        flex: 1, height: 52, borderRadius: 12,
                        background: '#fff', color: INK_2,
                        border: `1px solid ${BORDER_2}`, cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: 14, fontWeight: 700, fontFamily: "'Sarabun', sans-serif",
                        transition: 'all 0.18s',
                      }}
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="pp-btn-primary"
                      style={{
                        flex: 2, height: 52, borderRadius: 12,
                        background: C, color: '#fff', border: 'none',
                        cursor: saving ? 'wait' : 'pointer',
                        fontSize: 14.5, fontWeight: 800, fontFamily: "'Sarabun', sans-serif",
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: `0 6px 20px ${C}35`, transition: 'all 0.18s',
                      }}
                    >
                      {saving ? <><i className="fas fa-spinner fa-spin" /> กำลังบันทึก...</>
                        : <><i className="fas fa-check" /> บันทึกการแก้ไข</>}
                    </button>
                  </div>
                </div>
              )}

              {saved && !editing && (
                <div style={{
                  marginTop: 14, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(6,199,85,0.1)', border: '1px solid rgba(6,199,85,0.3)',
                  color: '#06c755', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <i className="fas fa-check-circle" />บันทึกข้อมูลเรียบร้อยแล้ว
                </div>
              )}
            </div>

            {/* ── Account ── */}
            <div style={{ background: '#fff', borderRadius: 20, padding: '24px 20px', marginTop: 20, border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(26,26,26,0.04)' }}>
              {sectionLabel(<><i className="fas fa-link" style={{ marginRight: 6, color: C }} />บัญชี</>)}

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: PAPER, borderRadius: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="fab fa-line" style={{ color: '#fff', fontSize: 20 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: INK_3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>LINE Account</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lineUser.name}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#06c755', padding: '4px 10px', borderRadius: 999, background: 'rgba(6,199,85,0.1)', border: '1px solid rgba(6,199,85,0.3)', flexShrink: 0 }}>
                  <i className="fas fa-check" style={{ marginRight: 4, fontSize: 9 }} />เชื่อมต่อแล้ว
                </span>
              </div>
            </div>

            {/* ── Logout ── */}
            <button
              onClick={onLogout}
              className="pp-btn-ghost"
              style={{
                marginTop: 20, width: '100%', height: 48, borderRadius: 12,
                background: '#fff', color: INK_2,
                border: `1px solid ${BORDER_2}`, cursor: 'pointer',
                fontSize: 13.5, fontWeight: 700, fontFamily: "'Sarabun', sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.18s',
              }}
            >
              <i className="fas fa-sign-out-alt" /> ออกจากระบบ
            </button>
          </>
        )}
      </div>
    </div>
  )
}
