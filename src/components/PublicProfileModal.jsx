import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { ACHIEVEMENTS, RARITY } from '../constants/achievements'

const C = '#c62419'
const INK = '#1a1a1a'
const INK_2 = 'rgba(26,26,26,0.65)'
const INK_3 = 'rgba(26,26,26,0.4)'
const PAPER = '#faf7f5'
const BORDER = 'rgba(26,26,26,0.08)'

const convertImageUrl = (url) => {
  if (!url) return url
  const m = url.match(/[?&]id=([^&]+)/) || url.match(/\/d\/([^/]+)/)
  if (m) return `https://wsrv.nl/?url=https://drive.usercontent.google.com/download?id=${m[1]}%26export%3Dview&w=400&output=webp`
  return url
}

function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(d)) return ''
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function PublicProfileModal({ uid, onClose }) {
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getDoc(doc(db, 'members', uid)),
      getDocs(query(collection(db, 'playHistory'), where('userId', '==', uid))),
    ]).then(([memSnap, histSnap]) => {
      if (cancelled) return
      if (memSnap.exists()) setProfile(memSnap.data())
      const hs = histSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      hs.sort((a, b) => {
        const ta = a.playedAt?.toDate?.()?.getTime() || 0
        const tb = b.playedAt?.toDate?.()?.getTime() || 0
        return tb - ta
      })
      setHistory(hs)
    }).catch(e => console.warn('profile load failed:', e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [uid])

  if (!uid) return null

  const name = profile?.nickname || profile?.firstname || profile?.name || '—'
  const avatar = profile?.pictureUrl || profile?.avatar || ''
  const avatarLetter = (name || '?')[0].toUpperCase()
  const role = profile?.role

  const owned = Array.isArray(profile?.achievements) ? profile.achievements
    : profile?.achievement ? [profile.achievement] : []
  const pinnedIds = Array.isArray(profile?.pinnedAchievements)
    ? profile.pinnedAchievements.filter(id => owned.includes(id))
    : owned

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(26,26,26,0.5)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 0,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560,
        background: '#fff', color: INK,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        maxHeight: '94dvh',
        boxShadow: '0 50px 120px rgba(26,26,26,0.25)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Sarabun', sans-serif",
      }}
      className="pp-modal-shell"
      >
        <style>{`
          @media (min-width: 640px) { .pp-modal-shell { margin: auto; border-radius: 28px !important; max-height: 92dvh; } }
          .pp-modal-row:hover { background: ${PAPER} !important; }
        `}</style>

        {/* Drag handle (mobile) */}
        <div style={{ width: 44, height: 5, borderRadius: 999, background: 'rgba(26,26,26,0.12)', margin: '12px auto 0' }} />

        {/* Header close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 20px 0' }}>
          <button
            onClick={onClose}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: PAPER, border: `1px solid ${BORDER}`,
              color: INK_2, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ebe4e1'; e.currentTarget.style.color = INK }}
            onMouseLeave={e => { e.currentTarget.style.background = PAPER; e.currentTarget.style.color = INK_2 }}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: INK_3 }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }} />
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* HERO */}
            <div style={{ padding: '12px 28px 24px', textAlign: 'center' }}>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
                {avatar ? (
                  <img src={avatar} alt={name}
                    referrerPolicy="no-referrer"
                    style={{ width: 92, height: 92, borderRadius: '50%', objectFit: 'cover', border: '4px solid #fff', boxShadow: '0 8px 24px rgba(26,26,26,0.15)' }}
                    onError={e => e.currentTarget.style.display = 'none'} />
                ) : (
                  <div style={{ width: 92, height: 92, borderRadius: '50%', background: C, color: '#fff', fontSize: 34, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #fff', boxShadow: '0 8px 24px rgba(26,26,26,0.15)' }}>
                    {avatarLetter}
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', background: '#06c755', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #fff' }}>
                  <i className="fab fa-line" style={{ color: '#fff', fontSize: 11 }} />
                </div>
              </div>

              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: INK, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {name}
              </h2>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: INK_3, letterSpacing: '0.04em' }}>LINE Member</span>
                {role === 'admin' && (
                  <>
                    <span style={{ color: INK_3 }}>·</span>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: C, padding: '2px 10px', borderRadius: 999, background: `${C}10`, border: `1px solid ${C}2c`, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Admin</span>
                  </>
                )}
              </div>

              {/* Pinned achievements strip */}
              {pinnedIds.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {pinnedIds.map(id => {
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

            <div style={{ borderTop: `1px solid ${BORDER}` }} />

            {/* Play history */}
            <div style={{ padding: '20px 24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: INK_3 }}>
                  <i className="fas fa-history" style={{ marginRight: 6, color: C }} />ประวัติการเล่น
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: INK_2, padding: '3px 10px', borderRadius: 999, background: PAPER }}>
                  {history.length} เกม
                </span>
              </div>

              {history.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, color: INK_3, marginBottom: 10 }}>
                    <i className="fas fa-theater-masks" />
                  </div>
                  <div style={{ fontSize: 13, color: INK_2 }}>ยังไม่มีประวัติการเล่น</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {history.map(h => (
                    <div
                      key={h.id}
                      className="pp-modal-row"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: 10, borderRadius: 12,
                        background: '#fff', border: `1px solid ${BORDER}`,
                        transition: 'background 0.14s',
                      }}
                    >
                      <div style={{ width: 42, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: PAPER }}>
                        {h.scriptImage || h.gameImage ? (
                          <img src={convertImageUrl(h.scriptImage || h.gameImage)} alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => e.currentTarget.style.display = 'none'} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-theater-masks" style={{ color: INK_3, fontSize: 16 }} />
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {h.scriptTitle || h.gameName || 'ไม่ระบุชื่อเกม'}
                        </div>
                        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: INK_2 }}>
                          {h.character && (
                            <span><i className="fas fa-user-tag" style={{ marginRight: 4, color: C, fontSize: 10 }} />{h.character}</span>
                          )}
                          {h.room && (
                            <>
                              <span style={{ color: INK_3 }}>·</span>
                              <span><i className="fas fa-door-open" style={{ marginRight: 4, fontSize: 10 }} />{h.room}</span>
                            </>
                          )}
                          {h.dm && (
                            <>
                              <span style={{ color: INK_3 }}>·</span>
                              <span>DM: <strong style={{ color: INK }}>{h.dm}</strong></span>
                            </>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: INK_3, flexShrink: 0 }}>
                        {formatDate(h.playedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  )
}
