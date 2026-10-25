import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import { doc, getDoc, collection, onSnapshot, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { useLang } from '../LangContext'
import { handleDirectLineBooking } from '../utils/bookingHelper'

/* ── Netflix Design Tokens ─────────────────────────────────────────── */
const BG_DARK      = '#0c0c0c'
const CARD_BG      = '#161616'
const CARD_BG_HOVER= '#1f1f1f'
const SURFACE_ELEV = '#222222'
const NETFLIX_RED  = '#e50914'
const CRIMSON_DEEP = '#b80710'
const GOLD_AMBER   = '#f59e0b'
const GREEN_MATCH  = '#46d369'
const TEXT_PRIMARY = '#ffffff'
const TEXT_MUTED   = 'rgba(255,255,255,0.72)'
const TEXT_SUBTLE  = 'rgba(255,255,255,0.45)'
const BORDER_SUBTLE= 'rgba(255,255,255,0.08)'
const BORDER_FOCUS = 'rgba(255,255,255,0.22)'

/* ── Image Helpers ─────────────────────────────────────────────────── */
const toWsrv = (id, w = 900) =>
  `https://wsrv.nl/?url=https://drive.usercontent.google.com/download?id=${id}%26export%3Dview&w=${w}&output=webp`

const convertImageUrl = (url, w = 900) => {
  if (!url) return url
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^=?/]+)/)
  if (lh3) return toWsrv(lh3[1], w)
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (m1) return toWsrv(m1[1], w)
  const m2 = url.match(/[?&]id=([^&]+)/)
  if (m2) return toWsrv(m2[1], w)
  return url
}

/* ── Difficulty Badge Helper ───────────────────────────────────────── */
function diffConfig(level) {
  const lv = (level || '').toLowerCase()
  if (lv.includes('beginner') || lv.includes('easy'))
    return { bg: '#15803d', text: '#ffffff', label: 'Beginner' }
  if (lv.includes('normal') || lv.includes('medium'))
    return { bg: '#0369a1', text: '#ffffff', label: 'Normal' }
  if (lv.includes('hard'))
    return { bg: '#d97706', text: '#ffffff', label: 'Hard' }
  if (lv.includes('expert'))
    return { bg: NETFLIX_RED, text: '#ffffff', label: 'Expert' }
  return { bg: '#374151', text: '#ffffff', label: level || '' }
}

/* ── Star Display Row ──────────────────────────────────────────────── */
function StarRow({ value, size = 13, color = GOLD_AMBER }) {
  const filled = Math.round(Math.min(5, Math.max(0, value || 0)))
  return (
    <div style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <i
          key={s}
          className="fas fa-star"
          style={{ fontSize: size, color: s <= filled ? color : 'rgba(255,255,255,0.18)', lineHeight: 1 }}
        />
      ))}
    </div>
  )
}

/* ── Interactive Star Picker ───────────────────────────────────────── */
function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  const display = hovered || value
  return (
    <div style={{ display: 'inline-flex', gap: 8 }} onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          type="button"
          onMouseEnter={() => setHovered(s)}
          onClick={() => onChange(s)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
            lineHeight: 1,
            color: s <= display ? GOLD_AMBER : 'rgba(255,255,255,0.18)',
            transition: 'color 0.14s, transform 0.14s',
            transform: s <= display ? 'scale(1.2)' : 'scale(1)',
          }}
          aria-label={`${s} ดาว`}
        >
          <i className="fas fa-star" style={{ fontSize: 22 }} />
        </button>
      ))}
    </div>
  )
}

const formatReviewDate = (ts) => {
  if (!ts?.seconds) return ''
  return new Date(ts.seconds * 1000).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

/* ── Character Lightbox Modal ──────────────────────────────────────── */
function CharacterModal({ character, onClose }) {
  if (!character) return null
  const imgSrc = character.image ? convertImageUrl(character.image, 800) : null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'dpFadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: CARD_BG, border: `1px solid ${BORDER_FOCUS}`,
          borderRadius: 16, overflow: 'hidden', maxWidth: 460, width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.8)', position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 10,
            width: 34, height: 34, borderRadius: '50%',
            background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14,
          }}
        >
          <i className="fas fa-times" />
        </button>

        <div style={{ aspectRatio: '3/4', width: '100%', background: '#111', overflow: 'hidden', position: 'relative' }}>
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={character.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT_SUBTLE }}>
              <i className="fas fa-user-secret" style={{ fontSize: 48 }} />
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(22,22,22,1) 0%, rgba(22,22,22,0.2) 40%, transparent 70%)' }} />
        </div>

        <div style={{ padding: '20px 24px 26px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: NETFLIX_RED, marginBottom: 4 }}>
            CHARACTER PROFILE
          </div>
          <h3 style={{ fontSize: 24, fontWeight: 900, color: '#fff', marginBottom: character.role ? 6 : 14 }}>
            {character.name}
          </h3>
          {character.role && (
            <div style={{ fontSize: 14, color: TEXT_MUTED, lineHeight: 1.6, background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: 8, border: `1px solid ${BORDER_SUBTLE}` }}>
              <i className="fas fa-tag" style={{ color: NETFLIX_RED, marginRight: 8, fontSize: 11 }} />
              {character.role}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Related Card (Netflix Poster) ─────────────────────────────────── */
function RelatedCard({ game, showDetail }) {
  const imgSrc = game.image ? convertImageUrl(game.image, 420) : null
  const displayPrice = game.fullPrice ?? game.price
  const isFree = displayPrice === 0
  const diff = diffConfig(game.difficulty)
  return (
    <div
      onClick={() => showDetail(game.id)}
      style={{
        borderRadius: 10, overflow: 'hidden', background: CARD_BG,
        border: `1px solid ${BORDER_SUBTLE}`, cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        transition: 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.28s, border-color 0.22s',
      }}
      className="dp-netflix-card"
    >
      <div style={{ position: 'relative', aspectRatio: '2/3', overflow: 'hidden', background: '#1c1c1c' }}>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={game.title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s ease-out' }}
            className="dp-netflix-card-img"
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fas fa-theater-masks" style={{ fontSize: 32, color: TEXT_SUBTLE }} />
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.2) 50%, transparent 80%)' }} />
        {game.difficulty && (
          <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 4, color: diff.text, background: diff.bg }}>
            {diff.label}
          </span>
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 10px 10px' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', lineHeight: 1.3, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {game.title}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {game.players && <span style={{ fontSize: 11, color: TEXT_SUBTLE }}>{game.players} คน</span>}
            <span style={{ fontSize: 13, fontWeight: 900, color: isFree ? GOLD_AMBER : NETFLIX_RED }}>
              {isFree ? 'ฟรี' : `฿${displayPrice}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main DetailPage Component ─────────────────────────────────────── */
export default function DetailPage({ id, showPage, showDetail, allGames = [], lineUser = null, bookingEnabled = true, showToast = null }) {
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [reviews, setReviews] = useState([])
  const [myRating, setMyRating] = useState(0)
  const [myText, setMyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const carouselRef = useRef(null)

  // 1. Fetch game script by id
  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    setGame(null)
    getDoc(doc(db, 'scripts', id))
      .then(snap => snap.exists() ? setGame({ id: snap.id, ...snap.data() }) : setError('ไม่พบข้อมูลสคริปต์นี้'))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  // 2. Real-time reviews subscription
  useEffect(() => {
    if (!id) return
    return onSnapshot(collection(db, 'scripts', id, 'reviews'), snap => {
      const list = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setReviews(list)
      if (lineUser?.uid) {
        const mine = list.find(r => r.uid === lineUser.uid)
        if (mine) {
          setMyRating(mine.rating || 0)
          setMyText(mine.text || '')
        }
      }
    })
  }, [id, lineUser?.uid])

  // 3. Carousel scroll buttons
  const scrollCarousel = (direction) => {
    if (!carouselRef.current) return
    const offset = direction === 'left' ? -320 : 320
    carouselRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  // 4. Share link
  const handleShare = async () => {
    const url = window.location.href
    const title = game?.title || ''
    const synopsis = game?.synopsis || game?.description || ''
    const clipText = [title, synopsis, url].filter(Boolean).join('\n\n')

    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${synopsis}\n\n${url}`, url })
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
        return
      } catch (e) {
        if (e.name === 'AbortError') return
      }
    }
    navigator.clipboard.writeText(clipText).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // 5. Booking navigation with Game ID
  const handleBookNow = () => {
    if (!game) return
    if (!bookingEnabled) {
      handleDirectLineBooking(game, showToast)
      return
    }
    if (typeof showPage === 'function') {
      showPage('booking', { gameId: game.id, game })
    } else {
      window.location.href = `/booking?gameId=${game.id}`
    }
  }

  // 6. Review handlers
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

  const deleteReview = async (reviewUid) => {
    if (!window.confirm('คุณต้องการลบรีวิวนี้หรือไม่?')) return
    try {
      await deleteDoc(doc(db, 'scripts', id, 'reviews', reviewUid))
    } catch (e) {
      console.error('Delete review error:', e)
    }
  }

  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
    : 0
  const myReview = reviews.find(r => r.uid === lineUser?.uid)

  const related = allGames.filter(g => g.id !== id).slice(0, 6)
  const bannerImgSrc = game?.image ? convertImageUrl(game.image, 1400) : null
  const displayFullPrice = game ? (game.fullPrice ?? game.price ?? 0) : 0
  const depositPrice = game?.deposit ?? (displayFullPrice > 0 ? Math.round(displayFullPrice / 2) : 0)
  const storePayPrice = game?.payPrice ?? Math.max(0, displayFullPrice - depositPrice)
  const isFree = displayFullPrice === 0
  const diff = diffConfig(game?.difficulty)

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif", background: BG_DARK, color: TEXT_PRIMARY, minHeight: '100vh', paddingTop: 56 }}>

      <style>{`
        @keyframes dpFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes dpHeroSlide { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }
        @keyframes dpSpin { to{transform:rotate(360deg)} }

        .dp-netflix-card:hover {
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px ${NETFLIX_RED};
          border-color: ${NETFLIX_RED} !important;
        }
        .dp-netflix-card:hover .dp-netflix-card-img {
          transform: scale(1.07);
        }

        .dp-carousel-track {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          padding: 8px 4px 16px;
        }
        .dp-carousel-track::-webkit-scrollbar {
          display: none;
        }

        .dp-char-item {
          flex: 0 0 clamp(130px, 18vw, 175px);
          scroll-snap-align: start;
          border-radius: 12px;
          overflow: hidden;
          background: ${CARD_BG};
          border: 1px solid ${BORDER_SUBTLE};
          cursor: pointer;
          transition: transform 0.26s cubic-bezier(0.2, 0.9, 0.3, 1), border-color 0.22s, box-shadow 0.26s;
        }
        .dp-char-item:hover {
          transform: translateY(-6px) scale(1.03);
          border-color: ${NETFLIX_RED};
          box-shadow: 0 14px 32px rgba(229,9,20,0.25);
        }
        .dp-char-item:hover .dp-char-poster {
          transform: scale(1.06);
        }

        .dp-primary-btn {
          background: ${NETFLIX_RED};
          color: #ffffff;
          border: none;
          cursor: pointer;
          font-family: 'Sarabun', sans-serif;
          font-weight: 800;
          letter-spacing: 0.04em;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.18s, transform 0.18s, box-shadow 0.18s;
        }
        .dp-primary-btn:hover {
          background: ${CRIMSON_DEEP};
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(229,9,20,0.45);
        }

        .dp-secondary-btn {
          background: rgba(255,255,255,0.08);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.18);
          cursor: pointer;
          font-family: 'Sarabun', sans-serif;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.18s, border-color 0.18s;
        }
        .dp-secondary-btn:hover {
          background: rgba(255,255,255,0.16);
          border-color: rgba(255,255,255,0.35);
        }

        .dp-nav-arrow {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(0,0,0,0.7);
          border: 1px solid rgba(255,255,255,0.2);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.18s, transform 0.18s;
        }
        .dp-nav-arrow:hover {
          background: ${NETFLIX_RED};
          border-color: ${NETFLIX_RED};
          transform: scale(1.1);
        }

        @media (max-width: 768px) {
          .dp-desktop-arrows { display: none !important; }
        }
      `}</style>

      {/* ── Loading Spinner ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '120px 20px' }}>
          <div style={{ width: 44, height: 44, border: `3px solid ${BORDER_SUBTLE}`, borderTopColor: NETFLIX_RED, borderRadius: '50%', margin: '0 auto 20px', animation: 'dpSpin 0.85s linear infinite' }} />
          <p style={{ color: TEXT_SUBTLE, fontSize: 14, letterSpacing: '0.06em' }}>กำลังโหลดแฟ้มคดี...</p>
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div style={{ textAlign: 'center', padding: '120px 20px' }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: 44, color: NETFLIX_RED, marginBottom: 16, display: 'block' }} />
          <p style={{ color: TEXT_PRIMARY, fontSize: 16, fontWeight: 700 }}>{error}</p>
          <button className="dp-secondary-btn" onClick={() => showPage('games')} style={{ marginTop: 20, padding: '10px 20px', borderRadius: 8 }}>
            ← กลับสู่หน้ารวมเกม
          </button>
        </div>
      )}

      {/* ── Content View ── */}
      {game && (
        <>
          {/* ── Top Floating Breadcrumb ── */}
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '16px 20px 0', position: 'relative', zIndex: 10 }}>
            <button
              onClick={() => showPage('games')}
              style={{
                background: 'rgba(18,18,18,0.7)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${BORDER_SUBTLE}`,
                borderRadius: 999,
                color: TEXT_MUTED,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.16s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = BORDER_FOCUS }}
              onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.borderColor = BORDER_SUBTLE }}
            >
              <i className="fas fa-arrow-left" style={{ fontSize: 10 }} />
              แฟ้มคดีทั้งหมด
            </button>
          </div>

          {/* ── NETFLIX HERO BACKDROP BANNER ── */}
          <div style={{ position: 'relative', minHeight: 'clamp(460px, 60vh, 600px)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden', marginTop: -46 }}>
            {/* Backdrop Image */}
            {bannerImgSrc && (
              <img
                src={bannerImgSrc}
                alt={game.title}
                fetchpriority="high"
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover', objectPosition: 'center 20%',
                  filter: 'brightness(0.65) contrast(1.1)',
                }}
              />
            )}

            {/* Gradient Overlays: Left shadow for desktop readability + Bottom fade to background */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(12,12,12,0.95) 0%, rgba(12,12,12,0.7) 40%, rgba(12,12,12,0.15) 75%, rgba(12,12,12,0.6) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, rgba(12,12,12,0.75) 70%, #0c0c0c 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 60% at 80% 30%, rgba(229,9,20,0.12) 0%, transparent 65%)' }} />

            {/* Hero Foreground Content */}
            <div style={{ position: 'relative', zIndex: 3, maxWidth: 1240, width: '100%', margin: '0 auto', padding: '0 20px 48px' }}>
              <div style={{ maxWidth: 740, animation: 'dpHeroSlide 0.6s cubic-bezier(0.2, 0.9, 0.3, 1)' }}>

                {/* Badges Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>

                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, color: diff.text, background: diff.bg }}>
                    {diff.label}
                  </span>
                  {(game.tags || []).slice(0, 3).map(tag => (
                    <span key={tag} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.1)', color: TEXT_MUTED, border: `1px solid ${BORDER_SUBTLE}` }}>
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Title */}
                <h1 style={{
                  fontSize: 'clamp(34px, 5.2vw, 68px)', fontWeight: 900,
                  lineHeight: 1.05, textTransform: 'uppercase', color: '#ffffff',
                  marginBottom: 16, textShadow: '0 4px 28px rgba(0,0,0,0.85)',
                  letterSpacing: '-0.01em',
                }}>
                  {game.title}
                </h1>

                {/* Metadata Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap', fontSize: 13, color: TEXT_MUTED }}>
                  {game.players && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fas fa-users" style={{ color: NETFLIX_RED, fontSize: 12 }} />
                      <strong>{game.players}</strong> คน
                    </span>
                  )}
                  {game.time && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fas fa-clock" style={{ color: NETFLIX_RED, fontSize: 12 }} />
                      {game.time}
                    </span>
                  )}
                  {game.mainRoom && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fas fa-door-open" style={{ color: NETFLIX_RED, fontSize: 12 }} />
                      {game.mainRoom}
                    </span>
                  )}
                  {avgRating > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: GOLD_AMBER }}>
                      <StarRow value={avgRating} size={12} />
                      <strong style={{ color: '#fff' }}>{avgRating.toFixed(1)}</strong>
                      <span style={{ fontSize: 11, color: TEXT_SUBTLE }}>({reviews.length})</span>
                    </span>
                  )}
                </div>

                {/* Primary Action Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <button
                    className="dp-primary-btn"
                    onClick={handleBookNow}
                    style={{ padding: '14px 28px', borderRadius: 8, fontSize: 15 }}
                  >
                    <i className="fas fa-calendar-check" />
                    จองรอบเล่นเกมนี้
                  </button>

                  <button
                    className="dp-secondary-btn"
                    onClick={handleShare}
                    style={{ padding: '13px 20px', borderRadius: 8, fontSize: 14 }}
                  >
                    <i className={`fas fa-${copied ? 'check' : 'share-alt'}`} />
                    {copied ? 'คัดลอกลิงก์แล้ว' : 'แชร์สคริปต์นี้'}
                  </button>

                  {/* Price Tag in Hero */}
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: TEXT_SUBTLE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      ราคาต่อท่าน
                    </div>
                    <div style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 900, color: isFree ? GOLD_AMBER : '#ffffff', lineHeight: 1 }}>
                      {isFree ? 'ฟรี' : `฿${displayFullPrice}`}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ── MAIN CONTENT CONTAINER ── */}
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 20px 80px' }}>

            {/* ── SECTION 1: SYNOPSIS (เรื่องย่อ) ── */}
            {(game.synopsis || game.description) && (
              <section style={{ marginBottom: 44, paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 4, height: 18, background: NETFLIX_RED, borderRadius: 2 }} />
                  <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#ffffff' }}>
                    เรื่องย่อ
                  </h2>
                </div>
                <div style={{
                  background: CARD_BG, border: `1px solid ${BORDER_SUBTLE}`,
                  borderRadius: 14, padding: 'clamp(22px, 3.5vw, 36px)',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                }}>
                  <p style={{
                    fontSize: 15.5, lineHeight: 1.95, color: TEXT_MUTED,
                    whiteSpace: 'pre-line', maxWidth: '85ch',
                  }}>
                    {game.synopsis || game.description}
                  </p>
                </div>
              </section>
            )}

            {/* ── SECTION 2: GAME SPECS & PRICING BREAKDOWN ── */}
            <section style={{ marginBottom: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 4, height: 18, background: NETFLIX_RED, borderRadius: 2 }} />
                <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#ffffff' }}>
                  ข้อมูลและสเปกคดี (Game Specifications)
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

                {/* Spec Box 1: Rooms (ห้องเล่น) */}
                <div style={{ background: CARD_BG, border: `1px solid ${BORDER_SUBTLE}`, borderRadius: 12, padding: '20px 22px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: NETFLIX_RED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-door-open" /> สถานที่และห้องเล่น
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 10 }}>
                    {game.mainRoom || 'ห้องส่วนตัว Sofun Club'}
                  </div>
                  {Array.isArray(game.rooms) && game.rooms.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {game.rooms.map(rm => (
                        <span key={rm} style={{
                          fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6,
                          background: rm === game.mainRoom ? 'rgba(229,9,20,0.18)' : 'rgba(255,255,255,0.06)',
                          color: rm === game.mainRoom ? '#fff' : TEXT_MUTED,
                          border: rm === game.mainRoom ? `1px solid ${NETFLIX_RED}` : `1px solid ${BORDER_SUBTLE}`,
                        }}>
                          {rm}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Spec Box 2: Price Breakdown */}
                <div style={{ background: CARD_BG, border: `1px solid ${BORDER_SUBTLE}`, borderRadius: 12, padding: '20px 22px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: NETFLIX_RED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-receipt" /> การชำระเงินและมัดจำ
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER_SUBTLE}`, paddingBottom: 6 }}>
                      <span style={{ color: TEXT_SUBTLE }}>ราคาเต็มต่อท่าน</span>
                      <strong style={{ color: '#fff', fontSize: 14 }}>฿{displayFullPrice}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER_SUBTLE}`, paddingBottom: 6 }}>
                      <span style={{ color: TEXT_SUBTLE }}>มัดจำจองรอบล่วงหน้า</span>
                      <strong style={{ color: GOLD_AMBER, fontSize: 14 }}>฿{depositPrice} /คน</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: TEXT_SUBTLE }}>ชำระส่วนที่เหลือหน้าร้าน</span>
                      <strong style={{ color: GREEN_MATCH, fontSize: 14 }}>฿{storePayPrice} /คน</strong>
                    </div>
                  </div>
                </div>

                {/* Spec Box 3: Gameplay Attributes */}
                <div style={{ background: CARD_BG, border: `1px solid ${BORDER_SUBTLE}`, borderRadius: 12, padding: '20px 22px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: NETFLIX_RED, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-chart-bar" /> ระดับความท้าทาย
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: TEXT_SUBTLE }}>ระดับการสืบสวน</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <StarRow value={game.detective || 3} color={GOLD_AMBER} />
                        <span style={{ fontWeight: 800, fontSize: 12 }}>{game.detective || 3}/5</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: TEXT_SUBTLE }}>ระดับการสวมบทบาท</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <StarRow value={game.roleplay || 3} color="#a78bfa" />
                        <span style={{ fontWeight: 800, fontSize: 12 }}>{game.roleplay || 3}/5</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: TEXT_SUBTLE }}>ระดับความยาก</span>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, color: diff.text, background: diff.bg }}>
                        {diff.label}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Trigger Warning Notice */}
              {(game.trigger || game.triggerWarning) && (
                <div style={{
                  marginTop: 16, background: 'rgba(229,9,20,0.08)',
                  border: '1px solid rgba(229,9,20,0.28)', borderRadius: 12,
                  padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <i className="fas fa-exclamation-triangle" style={{ color: NETFLIX_RED, fontSize: 16, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: NETFLIX_RED, textTransform: 'uppercase', marginBottom: 4 }}>
                      TRIGGER WARNING
                    </div>
                    <p style={{ fontSize: 13.5, color: TEXT_MUTED, lineHeight: 1.6, margin: 0 }}>
                      {game.trigger || game.triggerWarning}
                    </p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {game.notes && (
                <div style={{
                  marginTop: 12, background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${BORDER_SUBTLE}`, borderRadius: 12,
                  padding: '14px 20px', fontSize: 13, color: TEXT_MUTED, lineHeight: 1.7,
                }}>
                  <i className="fas fa-info-circle" style={{ color: TEXT_SUBTLE, marginRight: 8 }} />
                  {game.notes}
                </div>
              )}
            </section>

            {/* ── SECTION 3: NETFLIX CAST CAROUSEL (ตัวละครในเรื่อง) ── */}
            {Array.isArray(game.characters) && game.characters.length > 0 && (
              <section style={{ marginBottom: 52 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 4, height: 18, background: NETFLIX_RED, borderRadius: 2 }} />
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#ffffff' }}>
                        ตัวละครในคดี (Cast)
                      </h2>
                      <p style={{ fontSize: 12, color: TEXT_SUBTLE, marginTop: 2 }}>
                        แตะที่รูปเพื่อดูรายละเอียดและโปรไฟล์ตัวละคร ({game.characters.length} คน)
                      </p>
                    </div>
                  </div>

                  {/* Desktop Carousel Navigation Arrows */}
                  <div className="dp-desktop-arrows" style={{ display: 'flex', gap: 8 }}>
                    <button className="dp-nav-arrow" onClick={() => scrollCarousel('left')} title="ก่อนหน้า">
                      <i className="fas fa-chevron-left" />
                    </button>
                    <button className="dp-nav-arrow" onClick={() => scrollCarousel('right')} title="ถัดไป">
                      <i className="fas fa-chevron-right" />
                    </button>
                  </div>
                </div>

                <div ref={carouselRef} className="dp-carousel-track">
                  {game.characters.map((char, idx) => {
                    const charImg = char.image ? convertImageUrl(char.image, 340) : null
                    return (
                      <div
                        key={idx}
                        className="dp-char-item"
                        onClick={() => setSelectedCharacter(char)}
                      >
                        <div style={{ aspectRatio: '2/3', overflow: 'hidden', position: 'relative', background: '#181818' }}>
                          {charImg ? (
                            <img
                              src={charImg}
                              alt={char.name}
                              loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.35s ease' }}
                              className="dp-char-poster"
                            />
                          ) : (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT_SUBTLE }}>
                              <i className="fas fa-user" style={{ fontSize: 32 }} />
                            </div>
                          )}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.15) 50%, transparent 80%)' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 10px 10px' }}>
                            <p style={{ fontSize: 12.5, fontWeight: 800, color: '#ffffff', lineHeight: 1.25, marginBottom: char.role ? 2 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {char.name}
                            </p>
                            {char.role && (
                              <p style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {char.role}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ── SECTION 4: MORE LIKE THIS (สคริปต์ที่คล้ายกัน) ── */}
            {related.length > 0 && (
              <section style={{ marginBottom: 56, paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 4, height: 18, background: NETFLIX_RED, borderRadius: 2 }} />
                  <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#ffffff' }}>
                    เรื่องที่คุณอาจจะชอบ (More Like This)
                  </h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                  {related.map(relGame => (
                    <RelatedCard key={relGame.id} game={relGame} showDetail={showDetail} />
                  ))}
                </div>
              </section>
            )}

            {/* ── SECTION 5: PLAYER REVIEWS ── */}
            <section style={{ borderTop: `1px solid ${BORDER_SUBTLE}`, paddingTop: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 4, height: 18, background: NETFLIX_RED, borderRadius: 2 }} />
                  <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#ffffff' }}>
                    รีวิวและคะแนนจากผู้เล่น
                  </h2>
                </div>

                {reviews.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: GOLD_AMBER, lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
                    <StarRow value={avgRating} size={14} />
                    <span style={{ fontSize: 12, color: TEXT_SUBTLE }}>({reviews.length} รีวิว)</span>
                  </div>
                )}
              </div>

              {/* Review Input Box for logged-in user */}
              {lineUser && lineUser.role !== 'admin' && (
                <div style={{ marginBottom: 28, padding: '22px', background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER_SUBTLE}` }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                    {myReview ? 'แก้ไขคะแนนและรีวิวของคุณ' : 'ให้คะแนนคดีนี้'}
                  </p>
                  <div style={{ marginBottom: 14 }}>
                    <StarPicker value={myRating} onChange={setMyRating} />
                    {myRating === 0 && (
                      <p style={{ fontSize: 11.5, color: TEXT_SUBTLE, marginTop: 6 }}>แตะจำนวนดาวที่ต้องการ</p>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    placeholder="เขียนความประทับใจเกี่ยวกับคดีนี้... (ไม่บังคับ)"
                    value={myText}
                    onChange={e => setMyText(e.target.value)}
                    style={{
                      width: '100%', resize: 'vertical', border: `1px solid ${BORDER_SUBTLE}`,
                      borderRadius: 8, padding: '12px 14px', fontSize: 14, fontFamily: "'Sarabun', sans-serif",
                      background: BG_DARK, color: '#fff', lineHeight: 1.7, outline: 'none', marginBottom: 12,
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      className="dp-primary-btn"
                      onClick={submitReview}
                      disabled={myRating === 0 || submitting}
                      style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, opacity: (myRating === 0 || submitting) ? 0.5 : 1 }}
                    >
                      {submitting ? 'กำลังบันทึก...' : myReview ? 'อัปเดตรีวิว' : 'ส่งรีวิว'}
                    </button>
                    {myReview && (
                      <span style={{ fontSize: 12, color: GREEN_MATCH }}>
                        <i className="fas fa-check-circle" style={{ marginRight: 5 }} />
                        คุณได้รีวิวคดีนี้แล้ว
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Login prompt for anonymous user */}
              {!lineUser && (
                <div style={{ padding: '18px', background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER_SUBTLE}`, marginBottom: 24, textAlign: 'center' }}>
                  <p style={{ fontSize: 13.5, color: TEXT_SUBTLE }}>
                    เข้าสู่ระบบด้วย LINE เพื่อเขียนรีวิวและให้คะแนนคดีนี้
                  </p>
                </div>
              )}

              {/* Review Feed */}
              {reviews.length === 0 ? (
                <p style={{ fontSize: 13.5, color: TEXT_SUBTLE, textAlign: 'center', padding: '24px 0' }}>
                  ยังไม่มีรีวิวสำหรับสคริปต์นี้ — เป็นคนแรกที่ร่วมรีวิว
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {reviews.map(r => (
                    <div key={r.uid} style={{ display: 'flex', gap: 14, padding: '16px 18px', background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER_SUBTLE}` }}>
                      {r.avatar ? (
                        <img src={r.avatar} alt={r.name} style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="fas fa-user" style={{ fontSize: 14, color: TEXT_SUBTLE }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{r.name || 'ผู้เล่น'}</span>
                          {r.uid === lineUser?.uid && (
                            <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: 'rgba(229,9,20,0.15)', color: NETFLIX_RED, border: `1px solid rgba(229,9,20,0.3)` }}>คุณ</span>
                          )}
                          <StarRow value={r.rating} size={11} />
                          {r.createdAt && (
                            <span style={{ fontSize: 11, color: TEXT_SUBTLE, marginLeft: 'auto' }}>{formatReviewDate(r.createdAt)}</span>
                          )}
                          {lineUser?.role === 'admin' && (
                            <button
                              onClick={() => deleteReview(r.uid)}
                              title="ลบรีวิว"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: TEXT_SUBTLE, fontSize: 12 }}
                              onMouseEnter={e => e.currentTarget.style.color = NETFLIX_RED}
                              onMouseLeave={e => e.currentTarget.style.color = TEXT_SUBTLE}
                            >
                              <i className="fas fa-trash-alt" />
                            </button>
                          )}
                        </div>
                        {r.text && (
                          <p style={{ fontSize: 13.5, color: TEXT_MUTED, lineHeight: 1.7, margin: '4px 0 0' }}>{r.text}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>

          {/* ── MOBILE STICKY BOTTOM ACTION BAR ── */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'rgba(15,15,15,0.95)', backdropFilter: 'blur(16px)',
            borderTop: `1px solid ${BORDER_SUBTLE}`, padding: '12px 18px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
          }}
          className="dp-mobile-cta"
          >
            <div>
              <div style={{ fontSize: 10, color: TEXT_SUBTLE, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ราคาต่อท่าน (มัดจำ ฿{depositPrice})
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: isFree ? GOLD_AMBER : '#ffffff', lineHeight: 1.1 }}>
                {isFree ? 'ฟรี' : `฿${displayFullPrice}`}
              </div>
            </div>
            <button
              className="dp-primary-btn"
              onClick={handleBookNow}
              style={{ flex: 1, padding: '12px 18px', borderRadius: 8, fontSize: 14 }}
            >
              จองรอบเล่นเกมนี้ →
            </button>
          </div>

          {/* ── Character Detail Lightbox Modal ── */}
          {selectedCharacter && (
            <CharacterModal
              character={selectedCharacter}
              onClose={() => setSelectedCharacter(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
