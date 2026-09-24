import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, collection, onSnapshot, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { useLang } from '../LangContext'

/* ── Design tokens — resolved via theme.css CSS variables ─ */
const VOID    = 'var(--void-950)'   // kept for hero banner overlays + badge contexts
const SURFACE = 'var(--void-900)'
const CARD    = 'var(--void-800)'
const C       = 'var(--crimson-500)'
const C_DEEP  = 'var(--crimson-700)'
const CHALK   = 'var(--chalk)'      // kept for hero banner text + badge text
const CHALK_2 = 'var(--chalk-2)'
const CHALK_3 = 'var(--chalk-3)'
const WIRE    = 'var(--border-dark-wire)'
const WIRE_2  = 'var(--border-dark-wire-2)'
const AMBER   = 'var(--case-amber)'

/* ── Light catalog tokens ──────────────────────────────── */
const INK      = 'var(--text-primary)'
const INK_2    = 'var(--text-secondary)'
const INK_3    = 'var(--text-tertiary)'
const PAPER    = 'var(--surface-page)'
const PAPER_2  = 'var(--surface-card)'
const L_BORDER = 'var(--border-default)'
const L_BORDER_2 = 'var(--border-strong)'

/* ── Image helpers ───────────────────────────────────── */
const toWsrv = (id, w = 800) =>
  `https://wsrv.nl/?url=https://drive.usercontent.google.com/download?id=${id}%26export%3Dview&w=${w}&output=webp`

const convertImageUrl = (url, w = 800) => {
  if (!url) return url
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^=?/]+)/)
  if (lh3) return toWsrv(lh3[1], w)
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (m1) return toWsrv(m1[1], w)
  const m2 = url.match(/[?&]id=([^&]+)/)
  if (m2) return toWsrv(m2[1], w)
  return url
}

/* Returns badge bg + accessible text color (WCAG AA verified) */
function diffConfig(level) {
  const lv = (level || '').toLowerCase()
  if (lv.includes('beginner') || lv.includes('easy') || lv.includes('ง่าย'))
    return { bg: 'var(--feedback-success-icon)', text: CHALK }
  if (lv.includes('normal') || lv.includes('ปานกลาง'))
    return { bg: 'var(--feedback-info-icon)', text: CHALK }
  if (lv.includes('hard') || lv.includes('ยาก'))
    return { bg: 'var(--feedback-warning-icon)', text: VOID }
  if (lv.includes('expert') || lv.includes('ยากมาก'))
    return { bg: C, text: CHALK }
  return { bg: 'var(--void-500)', text: CHALK }
}

function StarBar({ val, color }) {
  const n = Math.min(5, Math.max(0, parseInt(val) || 0))
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} style={{ fontSize: 13, color: s <= n ? color : L_BORDER_2, lineHeight: 1 }}>★</span>
      ))}
    </div>
  )
}

/* ── Related card (matches GamesPage card) ───────────── */
function RelatedCard({ game, showDetail }) {
  const imgSrc = game.image ? convertImageUrl(game.image, 400) : null
  const displayPrice = game.fullPrice ?? game.price
  const isFree = displayPrice === 0
  const diff   = diffConfig(game.difficulty)
  return (
    <div className="dp-rel-card" onClick={() => showDetail(game.id)} style={{
      borderRadius: 10, overflow: 'hidden', background: PAPER_2,
      border: `1px solid ${L_BORDER}`, cursor: 'pointer',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ position: 'relative', aspectRatio: '2/3', overflow: 'hidden' }}>
        {imgSrc ? (
          <img src={imgSrc} alt={game.title} loading="lazy" decoding="async" className="dp-rel-img" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', filter: 'brightness(0.84) contrast(1.06)',
          }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg, var(--void-100) 0%, var(--void-200) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fas fa-theater-masks" style={{ fontSize: 32, color: INK_3 }} />
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)' }} />
        {game.difficulty && (
          <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, color: diff.text, background: diff.bg }}>
            {game.difficulty}
          </span>
        )}
        {isFree && (
          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, background: AMBER, color: VOID }}>ฟรี</span>
        )}
      </div>
      <div style={{ padding: '12px 12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{game.title}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          {game.players && <span style={{ fontSize: 10, color: INK_3 }}>{game.players} คน</span>}
          {displayPrice !== undefined && (
            <span style={{ fontSize: 13, fontWeight: 800, color: isFree ? AMBER : C }}>
              {isFree ? 'ฟรี' : `฿${displayPrice}`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Section header — no stripe, icon-led ────────────── */
function SectionHead({ label, iconClass }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      {iconClass && (
        <i className={iconClass} style={{ fontSize: 13, color: C, width: 16, textAlign: 'center', flexShrink: 0 }} />
      )}
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C }}>{label}</span>
    </div>
  )
}

/* ── Star picker (interactive) ───────────────────────── */
function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  const display = hovered || value
  return (
    <div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => setHovered(0)}>
      {[1,2,3,4,5].map(s => (
        <button
          key={s}
          type="button"
          className="rv-star-btn"
          onMouseEnter={() => setHovered(s)}
          onClick={() => onChange(s)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px',
            fontSize: 26, lineHeight: 1,
            color: s <= display ? AMBER : L_BORDER_2,
            transition: 'color 0.12s, transform 0.12s',
            transform: s <= display ? 'scale(1.15)' : 'scale(1)',
          }}
          aria-label={`${s} ดาว`}
        >★</button>
      ))}
    </div>
  )
}

/* ── Star display row (non-interactive) ─────────────── */
function StarRow({ value, size = 13 }) {
  const filled = Math.round(Math.min(5, Math.max(0, value || 0)))
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} style={{ fontSize: size, color: s <= filled ? AMBER : L_BORDER_2, lineHeight: 1 }}>★</span>
      ))}
    </div>
  )
}

const formatReviewDate = (ts) => {
  if (!ts?.seconds) return ''
  return new Date(ts.seconds * 1000).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

/* ── Main ────────────────────────────────────────────── */
export default function DetailPage({ id, showPage, showDetail, allGames = [], lineUser = null }) {
  const [game, setGame]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [copied, setCopied]     = useState(false)
  const [ready, setReady]       = useState(false)
  const [reviews, setReviews]   = useState([])
  const [myRating, setMyRating] = useState(0)
  const [myText, setMyText]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { t }                   = useLang()

  useEffect(() => {
    if (!id) return
    setLoading(true); setError(null); setGame(null); setReady(false)
    getDoc(doc(db, 'scripts', id))
      .then(snap => snap.exists() ? setGame({ id: snap.id, ...snap.data() }) : setError('ไม่พบข้อมูล'))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    return onSnapshot(collection(db, 'scripts', id, 'reviews'), snap => {
      const list = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setReviews(list)
      if (lineUser?.uid) {
        const mine = list.find(r => r.uid === lineUser.uid)
        if (mine) { setMyRating(mine.rating || 0); setMyText(mine.text || '') }
      }
    })
  }, [id]) // eslint-disable-line

  useEffect(() => {
    if (!lineUser?.uid || reviews.length === 0) return
    const mine = reviews.find(r => r.uid === lineUser.uid)
    if (mine) { setMyRating(mine.rating || 0); setMyText(mine.text || '') }
  }, [lineUser?.uid]) // eslint-disable-line

  useEffect(() => {
    if (game) setTimeout(() => setReady(true), 60)
  }, [game])

  const handleShare = async () => {
    const url = window.location.href
    const title = game?.title || ''
    const synopsis = game?.synopsis || game?.description || ''
    const clipText = [title, synopsis, url].filter(Boolean).join('\n\n')

    if (navigator.share) {
      try {
        // always copy text+url to clipboard first (iOS drops text when files present)
        navigator.clipboard.writeText(clipText).catch(() => {})

        if (imgSrc && navigator.canShare) {
          try {
            const resp = await fetch(imgSrc)
            const blob = await resp.blob()
            const file = new File([blob], `${title || 'game'}.jpg`, { type: blob.type || 'image/jpeg' })
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ title, text: `${synopsis}\n\n${url}`, url, files: [file] })
              setCopied(true); setTimeout(() => setCopied(false), 2500)
              return
            }
          } catch (e) {
            if (e.name === 'AbortError') return
          }
        }
        await navigator.share({ title, text: `${synopsis}\n\n${url}`, url })
        setCopied(true); setTimeout(() => setCopied(false), 2500)
        return
      } catch (e) {
        if (e.name === 'AbortError') return
      }
    }
    navigator.clipboard.writeText(clipText).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const deleteReview = async (reviewUid) => {
    if (!window.confirm('ลบรีวิวนี้?')) return
    try {
      await deleteDoc(doc(db, 'scripts', id, 'reviews', reviewUid))
    } catch (e) {
      console.error('Delete review error:', e)
    }
  }

  const submitReview = async () => {
    if (!lineUser?.uid || myRating === 0 || submitting) return
    setSubmitting(true)
    try {
      await setDoc(doc(db, 'scripts', id, 'reviews', lineUser.uid), {
        uid: lineUser.uid,
        name: lineUser.name || '',
        avatar: lineUser.avatar || '',
        rating: myRating,
        text: myText.trim(),
        createdAt: serverTimestamp(),
      })
    } catch (e) {
      console.error('Review error:', e)
    } finally {
      setSubmitting(false)
    }
  }

  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length : 0
  const myReview = reviews.find(r => r.uid === lineUser?.uid)

  const related  = allGames.filter(g => g.id !== id).slice(0, 4)
  const imgSrc   = game && (game.image) ? convertImageUrl(game.image) : null
  const displayPrice = game ? (game.fullPrice ?? game.price) : undefined
  const isFree   = displayPrice === 0
  const diff     = diffConfig(game?.difficulty)

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif", background: PAPER, color: INK, minHeight: '100vh', paddingTop: 60 }}>

      <style>{`
        @keyframes dpFadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        @keyframes dpSpin   { to{transform:rotate(360deg)} }
        @keyframes dpPosterIn { from{opacity:0;transform:translateY(24px) scale(0.97)} to{opacity:1;transform:none} }
        .dp-ready .dp-r1 { animation: dpFadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s both; }
        .dp-ready .dp-r2 { animation: dpFadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.13s both; }
        .dp-ready .dp-r3 { animation: dpFadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.21s both; }
        .dp-ready .dp-r4 { animation: dpFadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.29s both; }
        .dp-ready .dp-r5 { animation: dpFadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.37s both; }
        .dp-ready .dp-r6 { animation: dpFadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.45s both; }
        .dp-ready .dp-poster { animation: dpPosterIn 0.8s cubic-bezier(0.22,1,0.36,1) 0.1s both; }

        /* Back btn */
        .dp-back { transition: color 0.18s, gap 0.18s !important; }
        .dp-back:hover { color: ${CHALK} !important; gap: 10px !important; }
        .dp-back:focus-visible { outline: 2px solid ${C}; outline-offset: 3px; }

        /* Booking CTA */
        .dp-book { transition: all 0.22s cubic-bezier(0.22,1,0.36,1) !important; }
        .dp-book:hover { background: ${C_DEEP} !important; transform: translateY(-2px) !important; box-shadow: 0 14px 36px rgba(198,36,25,0.5) !important; }
        .dp-book:focus-visible { outline: 2px solid ${C}; outline-offset: 3px; }

        /* Share btn */
        .dp-share { transition: all 0.18s !important; }
        .dp-share:hover { border-color: ${L_BORDER_2} !important; color: ${INK} !important; background: rgba(0,0,0,0.04) !important; }
        .dp-share:focus-visible { outline: 2px solid ${C}; outline-offset: 3px; }

        /* Poster */
        .dp-poster { display: none; }
        @media(min-width:640px) { .dp-poster { display: block; flex-shrink: 0; width: clamp(140px,16vw,200px); } }

        /* Hero inner layout */
        .dp-hero-inner { display: flex; align-items: flex-end; gap: 32px; }
        @media(min-width:640px) { .dp-hero-inner { align-items: flex-end; gap: 40px; } }

        /* Meta dot separator */
        .dp-meta-dot { display: inline-block; width: 3px; height: 3px; border-radius: 50%; background: rgba(255,255,255,0.25); flex-shrink: 0; }

        /* Mobile CTA bar */
        .dp-mobile-cta { display: flex; position: fixed; bottom: 0; left: 0; right: 0; z-index: 40; padding: 12px 16px 20px; background: rgba(9,9,15,0.94); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-top: 1px solid rgba(255,255,255,0.08); gap: 12px; align-items: center; }
        @media(min-width:768px) { .dp-mobile-cta { display: none; } }
        .dp-mobile-cta-book { flex: 1; padding: 13px 16px; border-radius: 10px; background: ${C}; color: ${CHALK}; border: none; cursor: pointer; font-size: 14px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Sarabun', sans-serif; transition: background 0.18s; }
        .dp-mobile-cta-book:hover { background: ${C_DEEP}; }

        /* Related card */
        .dp-rel-card { transition: transform 0.3s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s, border-color 0.22s !important; }
        .dp-rel-card:hover { transform: translateY(-6px) !important; box-shadow: 0 14px 36px rgba(0,0,0,0.12), 0 0 0 1px rgba(198,36,25,0.22) !important; }
        .dp-rel-card:hover .dp-rel-img { transform: scale(1.06) !important; }
        .dp-rel-img { transition: transform 0.5s cubic-bezier(0.22,1,0.36,1) !important; }
        .dp-rel-card:focus-visible { outline: 2px solid ${C}; outline-offset: 2px; }

        /* Char card */
        .dp-char { transition: transform 0.25s cubic-bezier(0.22,1,0.36,1), border-color 0.22s !important; }
        .dp-char:hover { transform: translateY(-4px) !important; border-color: ${C} !important; }
        .dp-char:hover .dp-char-img { filter: brightness(1) contrast(1.05) !important; }
        .dp-char-img { transition: filter 0.35s !important; }

        /* Detail layout */
        .dp-layout { display: grid; grid-template-columns: 1fr; gap: 32px; }
        @media(min-width:768px) { .dp-layout { grid-template-columns: 1fr 320px; gap: 40px; } }
        @media(min-width:1024px) { .dp-layout { grid-template-columns: 1fr 360px; } }

        /* Related grid */
        .dp-rel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }

        /* Review */
        .rv-star-btn:focus-visible { outline: 2px solid ${C}; outline-offset: 2px; border-radius: 4px; }
        .rv-textarea { width: 100%; resize: vertical; border: 1px solid ${L_BORDER}; border-radius: 8px; padding: 12px 14px; font-size: 14px; font-family: 'Sarabun', sans-serif; background: ${PAPER}; color: ${INK}; line-height: 1.7; transition: border-color 0.18s; outline: none; }
        .rv-textarea:focus { border-color: ${C}; }
        .rv-submit { padding: 10px 22px; border-radius: 8px; border: none; cursor: pointer; background: ${C}; color: ${CHALK}; font-size: 13px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; font-family: 'Sarabun', sans-serif; transition: background 0.18s, transform 0.18s; }
        .rv-submit:hover:not(:disabled) { background: ${C_DEEP}; transform: translateY(-1px); }
        .rv-submit:disabled { opacity: 0.55; cursor: default; }
        .rv-card { display: flex; gap: 12px; padding: 16px 0; border-bottom: 1px solid ${L_BORDER}; }
        .rv-card:last-child { border-bottom: none; }
        .rv-av { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: ${L_BORDER}; }
        .rv-av-ph { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; background: ${L_BORDER}; display: flex; align-items: center; justify-content: center; }

        @media(prefers-reduced-motion:reduce){
          .dp-ready .dp-r1,.dp-ready .dp-r2,.dp-ready .dp-r3,.dp-ready .dp-r4,.dp-ready .dp-r5,.dp-ready .dp-r6,.dp-ready .dp-poster{animation:none}
          .dp-rel-card:hover,.dp-char:hover,.dp-book:hover,.rv-submit:hover,.dp-mobile-cta-book:hover{transform:none}
        }
      `}</style>

      {/* ── HERO BANNER ── */}
      {game && (
        <div className={ready ? 'dp-ready' : ''} style={{ position: 'relative', overflow: 'hidden', minHeight: 'clamp(460px,58vh,600px)' }}>

          {/* Blurred cover background */}
          {imgSrc && (
            <img src={imgSrc} aria-hidden alt="" fetchpriority="high" decoding="async" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', filter: 'blur(32px) brightness(0.2) saturate(0.55)',
              transform: 'scale(1.1)',
            }} />
          )}
          {/* Crimson accent glow top-right */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 75% 30%, rgba(198,36,25,0.12) 0%, transparent 70%)' }} />
          {/* Vignette + bottom fade to page bg */}
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, rgba(9,9,15,0.5) 0%, rgba(9,9,15,0.35) 45%, rgba(9,9,15,0.85) 82%, var(--surface-page) 100%)` }} />

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 2, maxWidth: 1280, margin: '0 auto', padding: 'clamp(32px,4vw,52px) clamp(20px,4vw,40px) clamp(40px,5vw,64px)', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>

            {/* Back breadcrumb */}
            <button className="dp-r1 dp-back" onClick={() => showPage('games')} style={{
              position: 'absolute', top: 'clamp(24px,3vw,40px)', left: 'clamp(20px,4vw,40px)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: CHALK_3, fontFamily: "'Sarabun', sans-serif",
            }}>
              ← แฟ้มคดีทั้งหมด
            </button>

            <div className="dp-hero-inner">
              {/* Left: text block */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>

                {/* Badges row */}
                <div className="dp-r2" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
                  {game.difficulty && (
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 11px', borderRadius: 4, color: diff.text, background: diff.bg }}>
                      {game.difficulty}
                    </span>
                  )}
                  {game.tags?.slice(0, 3).map(tag => (
                    <span key={tag} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 3, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.14)' }}>{tag}</span>
                  ))}
                </div>

                <h1 className="dp-r3" style={{
                  fontFamily: "'Sarabun', 'Bebas Neue', sans-serif", fontWeight: 900,
                  fontSize: 'clamp(38px,6.5vw,88px)', lineHeight: 0.88,
                  textTransform: 'uppercase', color: CHALK, marginBottom: 20,
                  textShadow: '0 4px 32px rgba(0,0,0,0.5)',
                  textWrap: 'balance',
                }}>
                  {game.title}
                </h1>

                {/* Meta row 1: players · time */}
                {(game.players || game.time) && (
                  <div className="dp-r4" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                    {game.players && (
                      <span style={{ fontSize: 13, color: CHALK_2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fas fa-users" style={{ fontSize: 11, color: CHALK_3 }} /> {game.players} คน
                      </span>
                    )}
                    {game.players && game.time && <span className="dp-meta-dot" />}
                    {game.time && (
                      <span style={{ fontSize: 13, color: CHALK_2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fas fa-clock" style={{ fontSize: 11, color: CHALK_3 }} /> {game.time}
                      </span>
                    )}
                  </div>
                )}

                {/* Meta row 2: ratings */}
                {(game.detective || game.roleplay || avgRating > 0) && (
                  <div className="dp-r4" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
                    {game.detective && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, color: CHALK_3, fontWeight: 600, letterSpacing: '0.04em' }}>สืบสวน</span>
                        <StarBar val={game.detective} color={AMBER} />
                      </span>
                    )}
                    {game.detective && game.roleplay && <span className="dp-meta-dot" />}
                    {game.roleplay && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, color: CHALK_3, fontWeight: 600, letterSpacing: '0.04em' }}>สวมบท</span>
                        <StarBar val={game.roleplay} color="#a78bfa" />
                      </span>
                    )}
                    {(game.detective || game.roleplay) && avgRating > 0 && <span className="dp-meta-dot" />}
                    {avgRating > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: AMBER, lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
                        <StarRow value={avgRating} size={11} />
                        <span style={{ fontSize: 11, color: CHALK_3 }}>({reviews.length})</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Price */}
                <div className="dp-r4" style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: "'Sarabun', 'Bebas Neue', sans-serif", fontSize: 'clamp(32px,4vw,48px)', fontWeight: 900, color: isFree ? AMBER : C, lineHeight: 1, textShadow: isFree ? '0 0 28px rgba(217,163,52,0.4)' : '0 0 28px rgba(198,36,25,0.4)' }}>
                    {isFree ? 'ฟรี' : `฿${displayPrice}`}
                  </span>
                  {!isFree && <span style={{ fontSize: 12, fontWeight: 500, color: CHALK_3 }}>/คน</span>}
                </div>
              </div>

              {/* Right: poster (desktop only) */}
              {imgSrc && (
                <div className="dp-poster" style={{ borderRadius: 10, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)', alignSelf: 'flex-end' }}>
                  <img src={imgSrc} alt={game.title} decoding="async" style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover', filter: 'contrast(1.04)' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Loading / Error ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${L_BORDER}`, borderTopColor: C, borderRadius: '50%', margin: '0 auto 20px', animation: 'dpSpin 0.9s linear infinite' }} />
          <p style={{ color: INK_3, fontSize: 14 }}>กำลังโหลดแฟ้มคดี...</p>
        </div>
      )}
      {error && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: 40, color: INK_3, marginBottom: 16, display: 'block' }} />
          <p style={{ color: INK_3, fontSize: 15 }}>{error}</p>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      {game && (
        <div className={ready ? 'dp-ready' : ''}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'clamp(32px,5vw,56px) clamp(20px,4vw,40px) 80px', paddingBottom: 'clamp(100px,12vw,80px)' }}>
            <div className="dp-layout">

              {/* ── LEFT: Case file sections ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

                {/* Synopsis */}
                {(game.synopsis || game.description) && (
                  <div className="dp-r1" style={{ background: PAPER_2, border: `1px solid ${L_BORDER}`, borderRadius: 12, padding: 'clamp(24px,3vw,36px)' }}>
                    <SectionHead label="เรื่องย่อ" iconClass="fas fa-book-open" />
                    <p style={{ fontSize: 15, lineHeight: 1.9, color: INK_2, maxWidth: '72ch' }}>
                      {game.synopsis || game.description}
                    </p>
                  </div>
                )}

                {/* Video */}
                {game.videoUrl && (
                  <div className="dp-r2" style={{ background: PAPER_2, border: `1px solid ${L_BORDER}`, borderRadius: 12, padding: 'clamp(24px,3vw,36px)' }}>
                    <SectionHead label="วิดีโอตัวอย่าง" iconClass="fas fa-film" />
                    <div style={{ borderRadius: 8, overflow: 'hidden', background: 'var(--void-950)' }}>
                      <video src={game.videoUrl} controls style={{ width: '100%', display: 'block', maxHeight: 400 }} />
                    </div>
                  </div>
                )}

                {/* Trigger Warning */}
                {(game.trigger || game.triggerWarning) && (
                  <div className="dp-r3" style={{ borderRadius: 12, padding: 'clamp(20px,3vw,30px)', background: `rgba(198,36,25,0.06)`, border: `1px solid rgba(198,36,25,0.22)` }}>
                    <SectionHead label="Trigger Warning" iconClass="fas fa-exclamation-triangle" />
                    <p style={{ fontSize: 14, lineHeight: 1.8, color: INK_2 }}>
                      {game.trigger || game.triggerWarning}
                    </p>
                  </div>
                )}

                {/* Characters */}
                {game.characters?.length > 0 && (
                  <div className="dp-r4" style={{ background: PAPER_2, border: `1px solid ${L_BORDER}`, borderRadius: 12, padding: 'clamp(24px,3vw,36px)' }}>
                    <SectionHead label="ตัวละคร" iconClass="fas fa-user-secret" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 14 }}>
                      {game.characters.map((char, i) => (
                        <div key={i} className="dp-char" style={{
                          borderRadius: 10, overflow: 'hidden', background: PAPER,
                          border: `1px solid ${L_BORDER}`, textAlign: 'center',
                        }}>
                          <div style={{ aspectRatio: '1/1', overflow: 'hidden', position: 'relative', background: 'var(--void-200)' }}>
                            {char.image ? (
                              <img src={convertImageUrl(char.image, 200)} alt={char.name} loading="lazy" decoding="async" className="dp-char-img" style={{
                                width: '100%', height: '100%', objectFit: 'cover',
                                filter: 'brightness(0.82) contrast(1.08) grayscale(0.25)',
                              }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK_3 }}>
                                <i className="fas fa-user" style={{ fontSize: 28 }} />
                              </div>
                            )}
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)' }} />
                          </div>
                          <div style={{ padding: '10px 8px 12px' }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: INK, lineHeight: 1.3, marginBottom: char.role ? 4 : 0 }}>{char.name}</p>
                            {char.role && <p style={{ fontSize: 10, color: INK_3, lineHeight: 1.4 }}>{char.role}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {game.notes && (
                  <div className="dp-r5" style={{ background: PAPER_2, border: `1px solid ${L_BORDER}`, borderRadius: 12, padding: 'clamp(24px,3vw,36px)' }}>
                    <SectionHead label="หมายเหตุ" iconClass="fas fa-thumbtack" />
                    <p style={{ fontSize: 14, lineHeight: 1.85, color: INK_2 }}>{game.notes}</p>
                  </div>
                )}

                {/* Reviews */}
                <div className="dp-r6" style={{ background: PAPER_2, border: `1px solid ${L_BORDER}`, borderRadius: 12, padding: 'clamp(24px,3vw,36px)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <i className="fas fa-star" style={{ fontSize: 13, color: AMBER, width: 16, textAlign: 'center', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C }}>รีวิวจากผู้เล่น</span>
                    </div>
                    {reviews.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 20, fontWeight: 900, color: AMBER, lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
                        <StarRow value={avgRating} size={12} />
                        <span style={{ fontSize: 11, color: INK_3 }}>({reviews.length})</span>
                      </div>
                    )}
                  </div>

                  {/* Review form — logged-in non-admin only */}
                  {lineUser && lineUser.role !== 'admin' && (
                    <div style={{ marginBottom: reviews.length > 0 ? 28 : 0, padding: '20px', background: PAPER, borderRadius: 10, border: `1px solid ${L_BORDER}` }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 12 }}>
                        {myReview ? 'แก้ไขรีวิวของคุณ' : 'ให้คะแนนสคริปต์นี้'}
                      </p>
                      <div style={{ marginBottom: 14 }}>
                        <StarPicker value={myRating} onChange={setMyRating} />
                        {myRating === 0 && (
                          <p style={{ fontSize: 11, color: INK_3, marginTop: 6 }}>แตะดาวเพื่อให้คะแนน</p>
                        )}
                      </div>
                      <textarea
                        className="rv-textarea"
                        rows={3}
                        placeholder="เขียนรีวิวของคุณ... (ไม่บังคับ)"
                        value={myText}
                        onChange={e => setMyText(e.target.value)}
                        style={{ marginBottom: 12 }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                          className="rv-submit"
                          onClick={submitReview}
                          disabled={myRating === 0 || submitting}
                        >
                          {submitting ? 'กำลังบันทึก...' : myReview ? 'อัปเดตรีวิว' : 'ส่งรีวิว'}
                        </button>
                        {myReview && (
                          <span style={{ fontSize: 11, color: INK_3 }}>
                            <i className="fas fa-check-circle" style={{ color: 'var(--feedback-success-icon)', marginRight: 5 }} />
                            คุณรีวิวแล้ว
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Login prompt */}
                  {!lineUser && (
                    <div style={{ padding: '16px', background: PAPER, borderRadius: 10, border: `1px solid ${L_BORDER}`, marginBottom: reviews.length > 0 ? 24 : 0, textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: INK_3 }}>เข้าสู่ระบบด้วย LINE เพื่อให้คะแนนและรีวิว</p>
                    </div>
                  )}

                  {/* Review list */}
                  {reviews.length === 0 && (
                    <p style={{ fontSize: 13, color: INK_3, textAlign: 'center', padding: '20px 0 4px' }}>ยังไม่มีรีวิว — เป็นคนแรกที่รีวิวสคริปต์นี้</p>
                  )}
                  {reviews.map(r => (
                    <div key={r.uid} className="rv-card">
                      {r.avatar ? (
                        <img src={r.avatar} alt={r.name} className="rv-av" />
                      ) : (
                        <div className="rv-av-ph">
                          <i className="fas fa-user" style={{ fontSize: 14, color: INK_3 }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{r.name || 'ผู้ใช้'}</span>
                          {r.uid === lineUser?.uid && (
                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3, background: `${C}18`, color: C, border: `1px solid ${C}28` }}>คุณ</span>
                          )}
                          <StarRow value={r.rating} size={12} />
                          {r.createdAt && (
                            <span style={{ fontSize: 10, color: INK_3, marginLeft: 'auto' }}>{formatReviewDate(r.createdAt)}</span>
                          )}
                          {lineUser?.role === 'admin' && (
                            <button
                              onClick={() => deleteReview(r.uid)}
                              title="ลบรีวิว"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '2px 6px', borderRadius: 5, color: INK_3,
                                fontSize: 12, transition: 'color 0.15s, background 0.15s',
                                marginLeft: r.createdAt ? 0 : 'auto',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = C; e.currentTarget.style.background = `${C}12` }}
                              onMouseLeave={e => { e.currentTarget.style.color = INK_3; e.currentTarget.style.background = 'none' }}
                            >
                              <i className="fas fa-trash-alt" />
                            </button>
                          )}
                        </div>
                        {r.text && (
                          <p style={{ fontSize: 13, color: INK_2, lineHeight: 1.75 }}>{r.text}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── RIGHT: Sticky booking card ── */}
              <div style={{ position: 'sticky', top: 80, alignSelf: 'start' }}>
                <div className="dp-r1" style={{ background: PAPER_2, border: `1px solid ${L_BORDER}`, borderRadius: 14, overflow: 'hidden' }}>

                  {/* Cover art */}
                  {imgSrc && (
                    <div style={{ position: 'relative', aspectRatio: '16/10', overflow: 'hidden' }}>
                      <img src={imgSrc} alt={game.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.8) contrast(1.06)' }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(14,14,26,1) 0%, transparent 55%)' }} />
                    </div>
                  )}

                  <div style={{ padding: '20px 22px 24px' }}>

                    {/* Price */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                      <span style={{ fontFamily: "'Sarabun', 'Bebas Neue', sans-serif", fontSize: 40, fontWeight: 900, color: isFree ? AMBER : C, lineHeight: 1 }}>
                        {isFree ? 'ฟรี' : `฿${displayPrice}`}
                      </span>
                      {!isFree && <span style={{ fontSize: 12, color: INK_3 }}>/คน</span>}
                    </div>

                    {/* CTA */}
                    <button className="dp-book" style={{
                      width: '100%', padding: '14px', borderRadius: 8,
                      background: C, color: CHALK, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 800, letterSpacing: '0.16em',
                      textTransform: 'uppercase', fontFamily: "'Sarabun', sans-serif",
                      boxShadow: `0 8px 28px rgba(198,36,25,0.35)`,
                    }}>
                      จองรอบเล่นเกมนี้ →
                    </button>

                    {/* Share */}
                    <button className="dp-share" onClick={handleShare} style={{
                      width: '100%', padding: '11px', borderRadius: 8, marginTop: 10,
                      background: 'transparent', color: copied ? INK : INK_3,
                      border: `1px solid ${copied ? L_BORDER_2 : L_BORDER}`,
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      fontFamily: "'Sarabun', sans-serif",
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}>
                      <i className={`fas fa-${copied ? 'check' : 'share-alt'}`} style={{ fontSize: 13 }} />
                      {copied ? 'แชร์แล้ว · ลิงก์ถูกคัดลอก' : 'แชร์สคริปต์นี้'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── RELATED SCRIPTS ── */}
            {related.length > 0 && (
              <div style={{ marginTop: 64, paddingTop: 48, borderTop: `1px solid ${L_BORDER}` }}>
                <h2 style={{ fontFamily: "'Sarabun', 'Bebas Neue', sans-serif", fontSize: 'clamp(22px,3vw,32px)', fontWeight: 900, textTransform: 'uppercase', color: INK, marginBottom: 28 }}>
                  สคริปต์อื่น <span style={{ color: C }}>ๆ</span>
                </h2>
                <div className="dp-rel-grid">
                  {related.map(g => (
                    <RelatedCard key={g.id} game={g} showDetail={showDetail} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MOBILE STICKY CTA ── */}
      {game && (
        <div className="dp-mobile-cta">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>ราคา/คน</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: isFree ? AMBER : C, lineHeight: 1 }}>
              {isFree ? 'ฟรี' : `฿${displayPrice}`}
            </span>
          </div>
          <button className="dp-mobile-cta-book">
            จองเกมนี้ →
          </button>
        </div>
      )}
    </div>
  )
}
