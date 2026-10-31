import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { collection, onSnapshot, query, where, orderBy, limit, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { handleDirectLineBooking } from '../utils/bookingHelper'
import { useTopPlayedGames90d } from '../utils/playStats'

/* ── Light / White Theme Tokens ────────────────────────────────────── */
const BG_PAGE       = '#fcfcfc'
const CARD_BG       = '#ffffff'
const CARD_BG_HOVER = '#f8f8f8'
const SURFACE_ELEV  = '#f3f4f6'
const NETFLIX_RED = 'var(--red, #e50914)'
const CRIMSON_DEEP  = '#b80710'
const GOLD_AMBER    = '#f59e0b'
const TEXT_PRIMARY  = '#111827'
const TEXT_MUTED    = '#4b5563'
const TEXT_SUBTLE   = '#9ca3af'
const BORDER_SUBTLE = 'rgba(0,0,0,0.08)'
const BORDER_FOCUS  = 'rgba(0,0,0,0.2)'

/* ── Image CDN Helper ──────────────────────────────────────────────── */
import { toOptimizedUrl as getCleanImgUrl } from '../utils/imageUrl'

/* ── Difficulty Badge Helper ───────────────────────────────────────── */
function getDifficultyBadge(level) {
  if (!level) return { bg: '#6b7280', text: '#ffffff', label: '' }
  const l = (level || '').toLowerCase()
  if (l === 'beginner' || l === 'ง่าย' || l === 'มือใหม่') return { bg: '#10b981', text: '#ffffff', label: level }
  if (l === 'normal' || l === 'ปานกลาง')   return { bg: '#3b82f6', text: '#ffffff', label: level }
  if (l === 'hard' || l === 'ยาก')     return { bg: '#f59e0b', text: '#111827', label: level }
  if (l === 'expert' || l === 'ยากมาก')   return { bg: NETFLIX_RED, text: '#ffffff', label: level }
  return { bg: '#6b7280', text: '#ffffff', label: level }
}

/* ── Parse Player Range ────────────────────────────────────────────── */
function parsePlayerCount(str) {
  if (typeof str === 'number') return str
  if (!str) return 0
  const match = String(str).match(/\d+/)
  return match ? parseInt(match[0], 10) : 0
}

function getGamePlayerCount(g) {
  if (!g) return 0
  if (Array.isArray(g.characters) && g.characters.length > 0) return g.characters.length
  return parsePlayerCount(g.players) || 6
}

/* ── Comprehensive Responsive CSS ──────────────────────────────────── */
const RESPONSIVE_CSS = `
  /* Desktop Wide (> 1024px) */
  @media (min-width: 1025px) {
    .netflix-billboard {
      padding-left: max(40px, calc((100% - 1320px) / 2)) !important;
      padding-right: 40px !important;
    }
  }

  /* Tablet (769px - 1024px) */
  @media (min-width: 769px) and (max-width: 1024px) {
    .netflix-billboard {
      min-height: 500px !important;
      height: 55vh !important;
      padding-left: 28px !important;
      padding-right: 28px !important;
    }
    .netflix-subbar {
      padding: 12px 28px !important;
    }
    .netflix-row-header {
      padding: 0 28px !important;
    }
    .netflix-row-scroll {
      padding: 8px 28px 16px !important;
      gap: 12px !important;
    }
    .netflix-card {
      width: 165px !important;
      min-width: 165px !important;
      height: 248px !important;
    }
    .netflix-grid-wrapper {
      padding: 0 28px !important;
    }
    .netflix-grid-cards {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) !important;
      gap: 14px !important;
    }
  }

  /* Mobile Devices (<= 768px) */
  @media (max-width: 768px) {
    /* Billboard */
    .netflix-billboard {
      min-height: 420px !important;
      height: auto !important;
      padding: 24px 16px 20px !important;
      flex-direction: column !important;
      justify-content: flex-end !important;
      align-items: stretch !important;
    }
    .netflix-billboard-backdrop {
      width: 100% !important;
      height: 65% !important;
      opacity: 0.82 !important;
      background-position: center top !important;
    }
    .netflix-billboard-grad-left {
      background: linear-gradient(to right, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.65) 60%, transparent 100%) !important;
    }
    .netflix-billboard-grad-bottom {
      height: 72% !important;
      background: linear-gradient(to top, #ffffff 42%, rgba(255,255,255,0.95) 70%, transparent 100%) !important;
    }
    .netflix-billboard-content {
      max-width: 100% !important;
      padding-top: 100px !important;
      gap: 10px !important;
    }
    .netflix-billboard-title {
      font-size: clamp(22px, 6vw, 30px) !important;
      line-height: 1.15 !important;
    }
    .netflix-billboard-synopsis {
      -webkit-line-clamp: 2 !important;
      font-size: 12.5px !important;
      line-height: 1.5 !important;
    }
    .netflix-billboard-actions {
      display: flex !important;
      flex-direction: row !important;
      gap: 8px !important;
      width: 100% !important;
      margin-top: 4px !important;
    }
    .netflix-billboard-actions button {
      flex: 1 !important;
      height: 44px !important;
      padding: 0 8px !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      justify-content: center !important;
      border-radius: 8px !important;
    }
    .netflix-billboard-dots {
      position: static !important;
      display: flex !important;
      justify-content: center !important;
      margin-top: 10px !important;
      z-index: 3 !important;
    }

    /* Subbar */
    .netflix-subbar {
      padding: 8px 12px !important;
      top: 56px !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 8px !important;
    }
    .netflix-subbar-categories {
      width: 100% !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
      padding-bottom: 2px !important;
      gap: 6px !important;
    }
    .netflix-subbar-categories::-webkit-scrollbar {
      display: none !important;
    }
    .netflix-subbar-controls {
      width: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 6px !important;
    }
    .netflix-search-box {
      flex: 1 !important;
      min-width: 0 !important;
    }
    .netflix-search-box input {
      width: 100% !important;
      height: 34px !important;
      font-size: 12px !important;
    }
    .netflix-filter-btn {
      height: 34px !important;
      padding: 0 10px !important;
      font-size: 11.5px !important;
      white-space: nowrap !important;
    }
    .netflix-view-toggle button {
      height: 30px !important;
      padding: 0 8px !important;
      font-size: 11px !important;
    }

    /* Swimlanes & Rows */
    .netflix-row-header {
      padding: 0 16px !important;
      margin-bottom: 8px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      text-align: left !important;
    }
    .netflix-row-title-wrap {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 10px !important;
      text-align: left !important;
      flex: 1 !important;
      min-width: 0 !important;
    }
    .netflix-row-header h3 {
      font-size: 16px !important;
      text-align: left !important;
    }
    .netflix-row-scroll {
      padding: 4px 16px 14px !important;
      gap: 10px !important;
      -webkit-overflow-scrolling: touch !important;
    }
    .netflix-scroll-arrow {
      display: none !important;
    }
    .netflix-card {
      width: 145px !important;
      min-width: 145px !important;
      height: 220px !important;
      border-radius: 10px !important;
    }
    .netflix-card h4 {
      font-size: 12px !important;
      -webkit-line-clamp: 1 !important;
    }
    .netflix-card-actions {
      opacity: 1 !important;
      max-height: 36px !important;
      transform: none !important;
      margin-top: 4px !important;
    }

    /* Grid View */
    .netflix-grid-wrapper {
      padding: 0 12px !important;
    }
    .netflix-grid-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
    }
    .netflix-grid-cards .netflix-card {
      width: 100% !important;
      min-width: 0 !important;
      height: 235px !important;
    }

    /* Active filter chips */
    .netflix-active-chips {
      padding: 10px 16px 0 !important;
    }

    /* Bottom Sheet Filter on Mobile */
    .netflix-filter-backdrop {
      position: fixed !important;
      inset: 0 !important;
      background: rgba(0,0,0,0.55) !important;
      backdrop-filter: blur(4px) !important;
      z-index: 99 !important;
    }
    .netflix-filter-drawer-container {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      max-height: 84vh !important;
      overflow-y: auto !important;
      background: #ffffff !important;
      border-radius: 20px 20px 0 0 !important;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.2) !important;
      z-index: 100 !important;
      padding: 16px 16px 24px !important;
      animation: netflixSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .netflix-filter-drag-handle {
      display: block !important;
      width: 40px !important;
      height: 4px !important;
      border-radius: 2px !important;
      background: #d1d5db !important;
      margin: 0 auto 12px !important;
    }
  }

  /* Extra Small Devices (<= 360px) */
  @media (max-width: 360px) {
    .netflix-card {
      width: 130px !important;
      min-width: 130px !important;
      height: 195px !important;
    }
    .netflix-grid-cards .netflix-card {
      height: 205px !important;
    }
  }

  @keyframes netflixSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  /* ── Netflix Signature Motion Engine ─────────────────────────────────── */

  /* Billboard Cinematic Ken Burns Effect */
  .netflix-billboard-backdrop {
    animation: netflixKenBurns 22s cubic-bezier(0.25, 1, 0.5, 1) infinite alternate, netflixFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    transform-origin: 75% 25%;
    will-change: transform, opacity;
  }
  @keyframes netflixKenBurns {
    0% { transform: scale(1) translate(0, 0); }
    50% { transform: scale(1.05) translate(-1%, -0.5%); }
    100% { transform: scale(1.02) translate(0.5%, 0.5%); }
  }
  @keyframes netflixFadeIn {
    from { opacity: 0; }
    to { opacity: 0.82; }
  }

  /* Billboard Staggered Entrance */
  .netflix-billboard-tag {
    animation: netflixMotionSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .netflix-billboard-title {
    animation: netflixMotionSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
  }
  .netflix-billboard-specs {
    animation: netflixMotionSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
  }
  .netflix-billboard-synopsis {
    animation: netflixMotionSlideUp 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
  }
  .netflix-billboard-actions {
    animation: netflixMotionSlideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
  }
  @keyframes netflixMotionSlideUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Billboard Buttons Micro-Interactions */
  .netflix-billboard-btn-book {
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, background 0.16s ease !important;
  }
  .netflix-billboard-btn-book:hover {
    transform: scale(1.03) translateY(-1px) !important;
    box-shadow: 0 8px 24px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.38) !important;
  }
  .netflix-billboard-btn-book:active {
    transform: scale(0.97) !important;
  }
  .netflix-billboard-btn-detail {
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.16s ease, border-color 0.16s ease !important;
  }
  .netflix-billboard-btn-detail:hover {
    transform: scale(1.03) translateY(-1px) !important;
    border-color: rgba(0,0,0,0.2) !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
  }
  .netflix-billboard-btn-detail:active {
    transform: scale(0.97) !important;
  }

  /* Poster Cards - The Iconic Netflix Elevation & Flare */
  .netflix-card {
    will-change: transform, box-shadow;
    transition: transform 0.28s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.28s ease, border-color 0.24s ease !important;
  }
  @media (hover: hover) and (min-width: 769px) {
    .netflix-card:hover {
      transform: translateY(-8px) scale(1.05) !important;
      box-shadow: 0 20px 42px rgba(0,0,0,0.18), 0 0 0 1.5px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.35) !important;
      z-index: 10 !important;
    }
    .netflix-card:hover .netflix-card-img {
      transform: scale(1.06) !important;
      filter: brightness(0.98) !important;
    }
  }

  /* Specular Shimmer Streak across Cards */
  .netflix-card::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.62) 62%, transparent 100%);
    transform: translateX(-120%);
    transition: transform 0.65s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    z-index: 3;
  }
  @media (hover: hover) {
    .netflix-card:hover::after {
      transform: translateX(120%);
    }
  }

  /* Mobile Touch Haptic Tactile Response */
  .netflix-card:active {
    transform: scale(0.96) !important;
    transition: transform 0.12s ease !important;
  }

  /* Card Action Buttons Spring Animations */
  .netflix-card-btn-play {
    transition: transform 0.16s ease, background 0.16s ease, box-shadow 0.16s ease !important;
  }
  .netflix-card-btn-play:hover {
    transform: scale(1.03);
    box-shadow: 0 4px 12px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.35);
  }
  .netflix-card-btn-play:active {
    transform: scale(0.96);
  }
  .netflix-card-btn-info {
    transition: transform 0.16s ease, background 0.16s ease !important;
  }
  .netflix-card-btn-info:hover {
    transform: scale(1.08);
  }
  .netflix-card-btn-info:active {
    transform: scale(0.92);
  }

  /* Swimlane Row Reveal & Interactive Indicators */
  .netflix-row-wrapper {
    animation: netflixRowSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes netflixRowSlideUp {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .netflix-row-indicator {
    transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.24s ease !important;
  }
  .netflix-row-header:hover .netflix-row-indicator {
    transform: scaleY(1.22);
    box-shadow: 0 0 10px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.55);
  }

  /* Carousel Navigation Arrows Micro-Animations */
  .netflix-scroll-arrow {
    transition: opacity 0.25s ease !important;
  }
  .netflix-scroll-arrow-circle {
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease, border-color 0.22s ease, color 0.16s ease, background 0.22s ease !important;
  }
  .netflix-scroll-arrow:hover .netflix-scroll-arrow-circle {
    transform: scale(1.15) !important;
    border-color: rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.4) !important;
    color: var(--curtain-crimson, #e50914) !important;
    box-shadow: 0 6px 20px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.22), 0 2px 8px rgba(0,0,0,0.1) !important;
  }
  .netflix-scroll-arrow:active .netflix-scroll-arrow-circle {
    transform: scale(0.95) !important;
  }
  .netflix-scroll-left:hover i {
    animation: netflixArrowNudgeLeft 0.75s ease-in-out infinite alternate;
  }
  .netflix-scroll-right:hover i {
    animation: netflixArrowNudgeRight 0.75s ease-in-out infinite alternate;
  }
  @keyframes netflixArrowNudgeLeft {
    from { transform: translateX(0); }
    to { transform: translateX(-3px); }
  }
  @keyframes netflixArrowNudgeRight {
    from { transform: translateX(0); }
    to { transform: translateX(3px); }
  }

  /* Subbar Controls Motion */
  .netflix-cat-pill {
    transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease !important;
  }
  .netflix-cat-pill:hover {
    transform: translateY(-1px);
  }
  .netflix-cat-pill:active {
    transform: scale(0.95) !important;
  }
  .netflix-cat-pill.active {
    box-shadow: 0 4px 14px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.3) !important;
  }

  .netflix-filter-btn {
    transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), background 0.18s ease, color 0.18s ease, border-color 0.18s ease !important;
  }
  .netflix-filter-btn:hover {
    transform: translateY(-1px);
  }
  .netflix-filter-btn:active {
    transform: scale(0.95) !important;
  }

  .netflix-search-box input {
    transition: border-color 0.2s ease, box-shadow 0.2s ease, width 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .netflix-search-box input:focus {
    border-color: rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.6) !important;
    box-shadow: 0 0 0 3px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.12) !important;
  }

  .netflix-view-toggle button {
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  }
  .netflix-view-toggle button:active {
    transform: scale(0.93) !important;
  }

  /* Disable hover transform on touch devices to avoid stuck states */
  @media (hover: none) {
    .netflix-card:hover {
      transform: none !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06) !important;
    }
    .netflix-card-actions {
      opacity: 1 !important;
      max-height: 36px !important;
      transform: none !important;
    }
  }
`

/* ── Netflix Poster Card Component (White Theme) ───────────────────── */
function NetflixPosterCard({ game, showDetail, showPage, isPlayed, bookingEnabled = false, showToast = null, dmRec = null }) {
  const [hovered, setHovered] = useState(false)
  const posterImg = getCleanImgUrl(game.image, 400)
  const diff = getDifficultyBadge(game.difficulty)
  const players = getGamePlayerCount(game)

  const handleBook = (e) => {
    e.stopPropagation()
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

  const handleDetail = (e) => {
    e.stopPropagation()
    showDetail(game.id)
  }

  return (
    <div
      onClick={handleDetail}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="netflix-card"
      style={{
        position: 'relative',
        width: 190,
        minWidth: 190,
        height: 285,
        borderRadius: 12,
        overflow: 'hidden',
        background: CARD_BG,
        cursor: 'pointer',
        border: `1.5px solid ${hovered ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.35)' : BORDER_SUBTLE}`,
        boxShadow: hovered
          ? '0 16px 36px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)'
          : '0 2px 8px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-6px) scale(1.03)' : 'translateY(0) scale(1)',
        transition: 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.24s ease, border-color 0.24s ease',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Poster Image */}
      {posterImg ? (
        <img
          src={posterImg}
          alt={game.title}
          loading="lazy"
          decoding="async"
          className="netflix-card-img"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: hovered ? 'brightness(0.96)' : 'brightness(0.9)',
            transform: hovered ? 'scale(1.06)' : 'scale(1)',
            transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), filter 0.24s ease',
          }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
          <i className="fas fa-theater-masks" style={{ fontSize: 32, color: 'rgba(0,0,0,0.2)' }} />
        </div>
      )}

      {/* Top Badges */}
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none', zIndex: 2, gap: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: diff.text,
              background: diff.bg,
              padding: '3px 7px',
              borderRadius: 6,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          >
            {diff.label}
          </span>
          {dmRec && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                color: '#ffffff',
                background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                padding: '2.5px 7px',
                borderRadius: 6,
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <i className="fas fa-crown" style={{ fontSize: 8.5 }} /> DM แนะนำ
            </span>
          )}
        </div>

        {isPlayed && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#ffffff',
              background: 'rgba(59,130,246,0.92)',
              padding: '3px 7px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          >
            <i className="fas fa-check" style={{ fontSize: 9 }} /> เล่นแล้ว
          </span>
        )}
      </div>

      {/* Bottom Gradient Overlay on Poster */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '40px 10px 10px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.72) 55%, transparent 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 2,
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            textShadow: '0 2px 4px rgba(0,0,0,0.9)',
          }}
        >
          {game.title}
        </h4>

        {/* Quick Specs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>
          <span><i className="fas fa-users" style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }} /> {players} คน</span>
          <span>•</span>
          <span>{game.time || '4 ชม.'}</span>
        </div>

        {/* DM Reason Snippet if present */}
        {dmRec && dmRec.reason && (
          <div
            style={{
              fontSize: 10.5,
              color: '#fbcfe8',
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={`${dmRec.dmName}: ${dmRec.reason}`}
          >
            <i className="fas fa-crown" style={{ fontSize: 8, color: '#f472b6', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <strong>{dmRec.dmName}:</strong> {dmRec.reason}
            </span>
          </div>
        )}

        {/* Hover Action Bar */}
        <div
          className="netflix-card-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
            opacity: hovered ? 1 : 0,
            maxHeight: hovered ? 36 : 0,
            transform: hovered ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.2s ease, max-height 0.2s ease, transform 0.2s ease',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={handleBook}
            className="netflix-card-btn-play"
            style={{
              flex: 1,
              height: 28,
              borderRadius: 6,
              background: NETFLIX_RED,
              color: '#ffffff',
              border: 'none',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              transition: 'background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f6121d'}
            onMouseLeave={e => e.currentTarget.style.background = NETFLIX_RED}
          >
            <i className="fas fa-play" style={{ fontSize: 9 }} /> จองรอบ
          </button>

          <button
            type="button"
            onClick={handleDetail}
            className="netflix-card-btn-info"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.22)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              transition: 'background 0.16s ease, transform 0.16s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.38)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
            aria-label="ดูรายละเอียด"
          >
            <i className="fas fa-info" style={{ fontSize: 10 }} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Netflix Horizontal Swimlane Row (White Theme) ─────────────────── */
function NetflixSwimlaneRow({ title, subtitle, games = [], showDetail, showPage, playedIds, onSeeAll, bookingEnabled = false, showToast = null, dmRecsMap = null, isDmPicks = false }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 10)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (el) el.addEventListener('scroll', checkScroll, { passive: true })
    return () => el && el.removeEventListener('scroll', checkScroll)
  }, [games])

  const scroll = (direction) => {
    if (!scrollRef.current) return
    const step = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth'
    })
  }

  if (games.length === 0) return null

  return (
    <div className="netflix-row-wrapper" style={{ position: 'relative', marginBottom: 38 }}>
      {/* Row Header */}
      <div className="netflix-row-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', marginBottom: 14 }}>
        <div className="netflix-row-title-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 10, textAlign: 'left' }}>
          <div className="netflix-row-indicator" style={{ width: 4, height: 18, background: NETFLIX_RED, borderRadius: 2, flexShrink: 0 }} />
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: TEXT_PRIMARY, letterSpacing: '-0.01em', textAlign: 'left' }}>
              {title}
            </h3>
            {subtitle && (
              <p style={{ margin: '3px 0 0', fontSize: 12, color: TEXT_MUTED, fontWeight: 500 }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            style={{
              background: 'none',
              border: 'none',
              color: TEXT_MUTED,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              borderRadius: 6,
              transition: 'color 0.16s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.color = TEXT_PRIMARY}
            onMouseLeave={e => e.currentTarget.style.color = TEXT_MUTED}
          >
            <span>ดูทั้งหมด ({games.length})</span>
            <i className="fas fa-chevron-right" style={{ fontSize: 10 }} />
          </button>
        )}
      </div>

      {/* Row Body with Navigation Buttons */}
      <div style={{ position: 'relative' }}>
        {/* Left Arrow */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll('left')}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 52,
              zIndex: 10,
              background: 'linear-gradient(to right, rgba(252,252,252,0.95) 0%, rgba(252,252,252,0.5) 60%, transparent 100%)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'opacity 0.2s ease',
            }}
            className="netflix-scroll-arrow netflix-scroll-left" aria-label="เลื่อนซ้าย"
          >
            <div className="netflix-scroll-arrow-circle" style={{ width: 38, height: 38, borderRadius: '50%', background: '#ffffff', color: TEXT_PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', border: `1px solid ${BORDER_SUBTLE}` }}>
              <i className="fas fa-chevron-left text-sm" />
            </div>
          </button>
        )}

        {/* Horizontal Scroll Area */}
        <div
          ref={scrollRef}
          className="netflix-row-scroll"
          style={{
            display: 'flex',
            gap: 14,
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '10px 40px 16px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            scrollSnapType: 'x proximity',
          }}
        >
          {games.map(game => (
            <NetflixPosterCard
              key={game.id}
              game={game}
              showDetail={showDetail}
              showPage={showPage}
              isPlayed={playedIds.has(game.id)}
              bookingEnabled={bookingEnabled}
              showToast={showToast}
              dmRec={dmRecsMap?.[game.id]?.[0]}
            />
          ))}
        </div>

        {/* Right Arrow */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll('right')}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 52,
              zIndex: 10,
              background: 'linear-gradient(to left, rgba(252,252,252,0.95) 0%, rgba(252,252,252,0.5) 60%, transparent 100%)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'opacity 0.2s ease',
            }}
            className="netflix-scroll-arrow netflix-scroll-right" aria-label="เลื่อนขวา"
          >
            <div className="netflix-scroll-arrow-circle" style={{ width: 38, height: 38, borderRadius: '50%', background: '#ffffff', color: TEXT_PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', border: `1px solid ${BORDER_SUBTLE}` }}>
              <i className="fas fa-chevron-right text-sm" />
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Hero Billboard Spotlight Component (White Theme) ──────────────── */
function NetflixHeroBillboard({ games = [], showDetail, showPage, promoSettings, bookingEnabled = false, showToast = null }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  // Spotlight games (strictly ONLY new games)
  const spotlightGames = useMemo(() => {
    if (!games || games.length === 0) return []

    const list = []
    const seen = new Set()

    // 1. Admin-curated new games from settings/promotion
    if (promoSettings?.newGameIds && Array.isArray(promoSettings.newGameIds)) {
      promoSettings.newGameIds.forEach(id => {
        const found = games.find(g => g.id === id)
        if (found && !seen.has(found.id)) {
          seen.add(found.id)
          list.push(found)
        }
      })
    }

    // 2. Games explicitly marked as isNew or tagged New or เกมใหม่
    games.forEach(g => {
      const isMarkedNew = g.isNew || (g.tags || []).some(t => {
        const s = String(t).toLowerCase()
        return s === 'new' || s === 'เกมใหม่'
      })
      if (isMarkedNew && !seen.has(g.id)) {
        seen.add(g.id)
        list.push(g)
      }
    })

    // 3. Newest releases sorted by createdAt descending
    const sorted = [...games].sort((a, b) => {
      const getTimestamp = (g) => {
        if (!g) return 0
        if (g.createdAt?.toMillis) return g.createdAt.toMillis()
        if (g.createdAt?.seconds) return g.createdAt.seconds * 1000
        if (g.createdAt) return new Date(g.createdAt).getTime()
        return 0
      }
      return getTimestamp(b) - getTimestamp(a)
    })

    sorted.forEach(g => {
      if (list.length < 5 && !seen.has(g.id)) {
        seen.add(g.id)
        list.push(g)
      }
    })

    return list.slice(0, 5)
  }, [games, promoSettings?.newGameIds])

  const currentGame = spotlightGames[currentIndex] || games[0]

  // Auto rotation
  useEffect(() => {
    if (spotlightGames.length <= 1 || isPaused) return
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % spotlightGames.length)
    }, 8000)
    return () => clearInterval(timer)
  }, [spotlightGames.length, isPaused])

  if (!currentGame) return null

  const customCover = promoSettings?.customCovers?.[currentGame.id]
  const backdropImg = getCleanImgUrl(customCover || currentGame.image, 1400)
  const diff = getDifficultyBadge(currentGame.difficulty)
  const players = getGamePlayerCount(currentGame)

  const handleBook = () => {
    if (!bookingEnabled) {
      handleDirectLineBooking(currentGame, showToast)
      return
    }
    if (typeof showPage === 'function') {
      showPage('booking', { gameId: currentGame.id, game: currentGame })
    } else {
      window.location.href = `/booking?gameId=${currentGame.id}`
    }
  }

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="netflix-billboard"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 520,
        height: '68vh',
        maxHeight: 640,
        background: '#ffffff',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 'max(40px, calc((100% - 1320px) / 2))',
        paddingRight: 40,
        borderBottom: `1px solid ${BORDER_SUBTLE}`,
      }}
    >
      {/* Background Image with Light Vignette */}
      <div
        key={`billboard-bg-${currentGame.id}`}
        className="netflix-billboard-backdrop"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '74%',
          height: '100%',
          backgroundImage: backdropImg ? `url('${backdropImg}')` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center 22%',
          opacity: 0.82,
          filter: 'contrast(1.04) brightness(0.98)',
        }}
      />

      {/* Left to right white gradient */}
      <div
        className="netflix-billboard-grad-left"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to right, #ffffff 32%, rgba(255,255,255,0.94) 52%, rgba(255,255,255,0.35) 80%, transparent 100%)',
          zIndex: 1,
        }}
      />

      {/* Bottom to top white gradient */}
      <div
        className="netflix-billboard-grad-bottom"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '45%',
          background: 'linear-gradient(to top, #ffffff 10%, rgba(255,255,255,0.75) 50%, transparent 100%)',
          zIndex: 1,
        }}
      />

      {/* Content Container */}
      <div
        key={`billboard-content-${currentGame.id}`}
        className="netflix-billboard-content"
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 620,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          paddingTop: 40,
        }}
      >
        {/* Spotlight Tag */}
        <div className="netflix-billboard-tag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              background: NETFLIX_RED,
              color: '#ffffff',
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: 4,
            }}
          >
            SOFUN NEW GAME
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_MUTED }}>
            เกมใหม่ล่าสุดจากร้าน
          </span>
        </div>

        {/* Title */}
        <h1
          className="netflix-billboard-title"
          style={{
            margin: 0,
            fontSize: 'clamp(28px, 4.2vw, 48px)',
            fontWeight: 950,
            color: TEXT_PRIMARY,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
          }}
        >
          {currentGame.title}
        </h1>

        {/* Quick Specs Row */}
        <div className="netflix-billboard-specs" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 13 }}>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 800,
              color: diff.text,
              background: diff.bg,
            }}
          >
            {diff.label}
          </span>
          <span style={{ color: TEXT_MUTED }}>
            <i className="fas fa-users" style={{ marginRight: 5, color: TEXT_SUBTLE }} />
            {players} คน
          </span>
          <span style={{ color: TEXT_MUTED }}>
            <i className="fas fa-clock" style={{ marginRight: 5, color: TEXT_SUBTLE }} />
            {currentGame.time || '4-5 ชั่วโมง'}
          </span>
          {currentGame.mainRoom && (
            <span style={{ color: TEXT_MUTED }}>
              <i className="fas fa-door-open" style={{ marginRight: 5, color: TEXT_SUBTLE }} />
              {currentGame.mainRoom}
            </span>
          )}
        </div>

        {/* Synopsis Teaser */}
        <p
          className="netflix-billboard-synopsis"
          style={{
            margin: 0,
            fontSize: 14,
            color: '#374151',
            lineHeight: 1.6,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {currentGame.synopsis || 'สัมผัสประสบการณ์สวมบทบาทสืบสวนคดีฆาตกรรมสุดเข้มข้น ดำดิ่งสู่เรื่องราวที่เต็มไปด้วยความลับ หักมุม และการชิงไหวชิงพริบในโลกเสมือนจริงที่ร้าน SOFUN'}
        </p>

        {/* Primary CTA Buttons */}
        <div className="netflix-billboard-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={handleBook}
            className="netflix-billboard-btn-book"
            style={{
              height: 44,
              padding: '0 26px',
              borderRadius: 8,
              background: NETFLIX_RED,
              color: '#ffffff',
              border: 'none',
              fontSize: 14,
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.3)',
            }}
          >
            <i className="fas fa-play" style={{ fontSize: 13 }} /> จองรอบเล่นเกมนี้
          </button>

          <button
            type="button"
            onClick={() => showDetail(currentGame.id)}
            className="netflix-billboard-btn-detail"
            style={{
              height: 44,
              padding: '0 22px',
              borderRadius: 8,
              background: '#ffffff',
              color: TEXT_PRIMARY,
              border: `1.5px solid ${BORDER_SUBTLE}`,
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i className="fas fa-info-circle" style={{ fontSize: 14 }} /> ข้อมูลเพิ่มเติม
          </button>
        </div>
      </div>

      {/* Rotation Indicator Dots (Bottom Right) */}
      {spotlightGames.length > 1 && (
        <div
          className="netflix-billboard-dots"
          style={{
            position: 'absolute',
            bottom: 24,
            right: 40,
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {spotlightGames.map((g, idx) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              style={{
                width: idx === currentIndex ? 22 : 6,
                height: 6,
                borderRadius: 3,
                background: idx === currentIndex ? NETFLIX_RED : 'rgba(0,0,0,0.2)',
                border: 'none',
                cursor: 'pointer',
                transition: 'width 0.24s ease, background 0.24s ease',
                padding: 0,
              }}
              aria-label={`ไฮไลต์ที่ ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Netflix SubBar Component (White Theme) ────────────────────────── */
function NetflixSubBar({
  activeCategory,
  onSelectCategory,
  search,
  onSearchChange,
  viewMode,
  onToggleViewMode,
  isFilterOpen,
  onToggleFilter,
  activeFilterCount,
}) {
  const CATEGORIES = [
    { id: 'all',       label: 'ทั้งหมด' },
    { id: 'dm_picks',  label: 'เกมที่ DM ที่ร้านแนะนำ' },
    { id: 'Detective', label: 'สืบสวน' },
    { id: 'Horror',    label: 'สยองขวัญ' },
    { id: 'Drama',     label: 'ดราม่า' },
    { id: 'Fantasy',   label: 'แฟนตาซี' },
    { id: 'Comedy',    label: 'คอมเมดี้' },
    { id: 'Beginner',  label: 'มือใหม่' },
  ]

  return (
    <div
      className="netflix-subbar"
      style={{
        position: 'sticky',
        top: 60,
        zIndex: 20,
        background: 'rgba(255,255,255,0.94)',
        backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${BORDER_SUBTLE}`,
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        padding: '12px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
      }}
    >
      {/* Category Pills (Left) */}
      <div className="netflix-subbar-categories" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', maxWidth: '100%', scrollbarWidth: 'none' }}>
        {CATEGORIES.map(cat => {
          const isAct = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`netflix-cat-pill ${isAct ? 'active' : ''}`}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: isAct ? 800 : 600,
                color: isAct ? '#ffffff' : TEXT_MUTED,
                background: isAct ? NETFLIX_RED : '#f3f4f6',
                border: `1px solid ${isAct ? NETFLIX_RED : 'transparent'}`,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!isAct) e.currentTarget.style.background = '#e5e7eb'
              }}
              onMouseLeave={e => {
                if (!isAct) e.currentTarget.style.background = '#f3f4f6'
              }}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Right Controls: Search, Deep Filter, and View Mode Toggle */}
      <div className="netflix-subbar-controls" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Search input */}
        <div className="netflix-search-box" style={{ position: 'relative' }}>
          <i
            className="fas fa-search"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 11,
              color: TEXT_SUBTLE,
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="ค้นหาชื่อสคริปต์, คีย์เวิร์ด..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              width: 200,
              height: 34,
              paddingLeft: 32,
              paddingRight: search ? 30 : 12,
              borderRadius: 18,
              background: '#f3f4f6',
              border: `1px solid ${search ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.06)'}`,
              color: TEXT_PRIMARY,
              fontSize: 12,
              outline: 'none',
              transition: 'all 0.2s ease',
            }}
            onFocus={e => { e.target.style.width = '240px'; e.target.style.background = '#ffffff'; e.target.style.borderColor = NETFLIX_RED }}
            onBlur={e => { if (!search) { e.target.style.width = '200px'; e.target.style.background = '#f3f4f6'; e.target.style.borderColor = 'rgba(0,0,0,0.06)' } }}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: TEXT_SUBTLE,
                cursor: 'pointer',
                fontSize: 11,
                padding: 4,
              }}
              aria-label="ล้างการค้นหา"
            >
              <i className="fas fa-times" />
            </button>
          )}
        </div>

        {/* Deep Filter Toggle Button */}
        <button
          type="button"
          onClick={onToggleFilter}
          className="netflix-filter-btn"
          style={{
            height: 34,
            padding: '0 12px',
            borderRadius: 18,
            background: isFilterOpen || activeFilterCount > 0 ? 'rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.08)' : '#f3f4f6',
            border: `1px solid ${isFilterOpen || activeFilterCount > 0 ? NETFLIX_RED : 'transparent'}`,
            color: isFilterOpen || activeFilterCount > 0 ? NETFLIX_RED : TEXT_MUTED,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.16s ease',
          }}
        >
          <i className="fas fa-sliders-h" style={{ fontSize: 11 }} />
          <span>ตัวกรอง</span>
          {activeFilterCount > 0 && (
            <span
              style={{
                background: NETFLIX_RED,
                color: '#ffffff',
                fontSize: 10,
                fontWeight: 900,
                width: 16,
                height: 16,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* View Mode Toggle Button */}
        <div
          className="netflix-view-toggle"
          style={{
            display: 'flex',
            background: '#f3f4f6',
            borderRadius: 18,
            padding: 2,
            border: `1px solid ${BORDER_SUBTLE}`,
          }}
        >
          <button
            type="button"
            onClick={() => onToggleViewMode('swimlanes')}
            title="มุมมองหมวดหมู่ (Swimlanes)"
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 16,
              background: viewMode === 'swimlanes' ? '#ffffff' : 'transparent',
              color: viewMode === 'swimlanes' ? TEXT_PRIMARY : TEXT_SUBTLE,
              boxShadow: viewMode === 'swimlanes' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.14s ease',
            }}
          >
            <i className="fas fa-stream" />
            <span style={{ fontSize: 11, fontWeight: 700 }}>หมวดหมู่</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleViewMode('grid')}
            title="มุมมองตารางทั้งหมด (Grid)"
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 16,
              background: viewMode === 'grid' ? '#ffffff' : 'transparent',
              color: viewMode === 'grid' ? TEXT_PRIMARY : TEXT_SUBTLE,
              boxShadow: viewMode === 'grid' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.14s ease',
            }}
          >
            <i className="fas fa-th-large" />
            <span style={{ fontSize: 11, fontWeight: 700 }}>ตาราง</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Deep Filter Drawer Component (White Theme) ────────────────────── */
function NetflixFilterDrawer({
  isOpen,
  onClose,
  selectedPlayerCount,
  onSelectPlayerCount,
  selectedDiffs,
  onToggleDiff,
  selectedPriceRange,
  onSelectPriceRange,
  selectedTimeRange,
  onSelectTimeRange,
  selectedDetective,
  onSelectDetective,
  selectedRoleplay,
  onSelectRoleplay,
  selectedTags,
  onToggleTag,
  onResetFilters,
  activeFilterCount,
  resultCount = 0,
}) {
  if (!isOpen) return null

  const PLAYER_OPTIONS = [
    { val: null, label: 'ทั้งหมด' },
    { val: 4,    label: '4 คนหรือน้อยกว่า' },
    { val: 5,    label: '5 คน' },
    { val: 6,    label: '6 คน' },
    { val: 7,    label: '7 คน' },
    { val: 8,    label: '8 คนขึ้นไป' },
  ]

  const DIFF_OPTIONS = [
    { id: 'Beginner', label: 'Beginner' },
    { id: 'Normal',   label: 'Normal' },
    { id: 'Hard',     label: 'Hard' },
    { id: 'Expert',   label: 'Expert' },
  ]

  const PRICE_OPTIONS = [
    { val: '',         label: 'ทั้งหมด' },
    { val: 'under600', label: 'ต่ำกว่า 600 บาท' },
    { val: '600-799',  label: '600 - 799 บาท' },
    { val: 'above800', label: '800 บาทขึ้นไป' },
  ]

  const TIME_OPTIONS = [
    { val: '',    label: 'ทั้งหมด' },
    { val: '3-4', label: '3 - 4 ชั่วโมง' },
    { val: '4-6', label: '4 - 6 ชั่วโมง' },
    { val: '6+',  label: '6 ชั่วโมงขึ้นไป' },
  ]

  const ALL_TAGS = ['Detective', 'Horror', 'Drama', 'Comedy', 'Fantasy', 'Romance', 'Sci-Fi', 'Action', 'Thriller', 'History']

  return (
    <>
      {/* Mobile Backdrop */}
      <div className="netflix-filter-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Drawer Container */}
      <div
        className="netflix-filter-drawer-container"
        style={{
          background: '#ffffff',
          borderBottom: `1.5px solid ${BORDER_SUBTLE}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
          padding: '24px 40px',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Mobile Drag Indicator */}
          <div className="netflix-filter-drag-handle" aria-hidden="true" style={{ display: 'none' }} />

          {/* Drawer Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-filter" style={{ color: NETFLIX_RED, fontSize: 14 }} />
              <span style={{ fontSize: 14, fontWeight: 900, color: TEXT_PRIMARY, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                ตัวกรองละเอียด (Advanced Filters)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: NETFLIX_RED,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  ล้างฟิลเตอร์ทั้งหมด
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#f3f4f6',
                  border: 'none',
                  color: TEXT_PRIMARY,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="ปิดตัวกรอง"
              >
                <i className="fas fa-times text-xs" />
              </button>
            </div>
          </div>

          {/* Filter Rows */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {/* 1. Players */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
                จำนวนผู้เล่น
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PLAYER_OPTIONS.map(opt => {
                  const isAct = selectedPlayerCount === opt.val
                  return (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => onSelectPlayerCount(opt.val)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: isAct ? 800 : 500,
                        color: isAct ? '#ffffff' : TEXT_MUTED,
                        background: isAct ? NETFLIX_RED : '#f3f4f6',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.14s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. Difficulty */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
                ระดับความยาก
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DIFF_OPTIONS.map(opt => {
                  const isAct = selectedDiffs.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onToggleDiff(opt.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: isAct ? 800 : 500,
                        color: isAct ? '#ffffff' : TEXT_MUTED,
                        background: isAct ? NETFLIX_RED : '#f3f4f6',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.14s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3. Duration */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
                ระยะเวลาเล่น
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TIME_OPTIONS.map(opt => {
                  const isAct = selectedTimeRange === opt.val
                  return (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => onSelectTimeRange(opt.val)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: isAct ? 800 : 500,
                        color: isAct ? '#ffffff' : TEXT_MUTED,
                        background: isAct ? NETFLIX_RED : '#f3f4f6',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.14s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 4. Price */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
                ช่วงราคา
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PRICE_OPTIONS.map(opt => {
                  const isAct = selectedPriceRange === opt.val
                  return (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => onSelectPriceRange(opt.val)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: isAct ? 800 : 500,
                        color: isAct ? '#ffffff' : TEXT_MUTED,
                        background: isAct ? NETFLIX_RED : '#f3f4f6',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.14s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Tags Row */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
              แท็กแนวเรื่อง (Genre Tags)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ALL_TAGS.map(tg => {
                const isAct = selectedTags.includes(tg)
                return (
                  <button
                    key={tg}
                    type="button"
                    onClick={() => onToggleTag(tg)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 16,
                      fontSize: 11.5,
                      fontWeight: isAct ? 800 : 500,
                      color: isAct ? '#ffffff' : TEXT_MUTED,
                      background: isAct ? NETFLIX_RED : '#f3f4f6',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.14s ease',
                    }}
                  >
                    #{tg}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 14, borderTop: `1px solid ${BORDER_SUBTLE}` }}>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onResetFilters}
                style={{
                  height: 42,
                  padding: '0 16px',
                  borderRadius: 8,
                  background: '#f3f4f6',
                  color: TEXT_MUTED,
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                รีเซ็ต
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 8,
                background: NETFLIX_RED,
                color: '#ffffff',
                border: 'none',
                fontSize: 13,
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 4px 14px rgba(var(--curtain-crimson-rgb, 229, 9, 20),0.3)',
              }}
            >
              <span>ดูผลลัพธ์ ({resultCount} เรื่อง)</span>
              <i className="fas fa-chevron-right" style={{ fontSize: 11 }} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Main GamesPage Component (White Theme) ────────────────────────── */
export default function GamesPage({ allGames = [], showDetail, showPage, lineUser, bookingEnabled = false, showToast = null }) {
  // 1. Played IDs from playHistory & Top Played Games (90 Days)
  const [playedIds, setPlayedIds] = useState(() => new Set())
  const [promoSettings, setPromoSettings] = useState(null)
  const { topGames: topPlayedGames } = useTopPlayedGames90d(allGames)

  // Load Promotion & Spotlight Settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'promotion'), snap => {
      if (snap.exists()) {
        setPromoSettings(snap.data())
      }
    })
    return () => unsub()
  }, [])

  // Load DM Recommendations
  const [dmRecommendations, setDmRecommendations] = useState([])
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'dm_recommendations'), snap => {
      if (snap.exists()) {
        const d = snap.data()
        setDmRecommendations(Array.isArray(d.recommendations) ? d.recommendations : [])
      } else {
        getDoc(doc(db, 'settings', 'promotion')).then(pSnap => {
          if (pSnap.exists() && Array.isArray(pSnap.data().dmRecommendations)) {
            setDmRecommendations(pSnap.data().dmRecommendations)
          }
        }).catch(() => {})
      }
    }, err => {
      console.warn('dm_recommendations listener error:', err.message)
    })
    return () => unsub()
  }, [])

  // Map recommendations by gameId
  const dmRecsByGameId = useMemo(() => {
    const map = {}
    dmRecommendations.forEach(rec => {
      if (!rec.gameId) return
      if (!map[rec.gameId]) map[rec.gameId] = []
      map[rec.gameId].push(rec)
    })
    return map
  }, [dmRecommendations])

  // Games recommended by DMs
  const dmRecommendedGames = useMemo(() => {
    const ordered = []
    const seen = new Set()
    dmRecommendations.forEach(rec => {
      if (!rec.gameId || seen.has(rec.gameId)) return
      seen.add(rec.gameId)
      const game = allGames.find(g => (g.id || g._id) === rec.gameId)
      if (game) ordered.push(game)
    })
    return ordered
  }, [allGames, dmRecommendations])

  useEffect(() => {
    if (!lineUser?.uid) { setPlayedIds(new Set()); return }
    const q = query(collection(db, 'playHistory'), where('userId', '==', lineUser.uid))
    return onSnapshot(q, snap => {
      const ids = new Set()
      snap.docs.forEach(d => { const sid = d.data().scriptId; if (sid) ids.add(sid) })
      setPlayedIds(ids)
    }, () => {})
  }, [lineUser?.uid])

  // 2. View Mode & Search States
  const [viewMode,            setViewMode]            = useState('swimlanes') // 'swimlanes' | 'grid'
  const [search,              setSearch]              = useState('')
  const [activeCategory,      setActiveCategory]      = useState('all')
  const [filterDrawerOpen,    setFilterDrawerOpen]    = useState(false)

  // 3. Deep Filters
  const [selectedPlayerCount, setSelectedPlayerCount] = useState(null)
  const [selectedDiffs,       setSelectedDiffs]       = useState([])
  const [selectedPriceRange,  setSelectedPriceRange]  = useState('')
  const [selectedTimeRange,   setSelectedTimeRange]   = useState('')
  const [selectedDetective,   setSelectedDetective]   = useState(null)
  const [selectedRoleplay,    setSelectedRoleplay]    = useState(null)
  const [selectedTags,        setSelectedTags]        = useState([])

  // Count active deep filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (selectedPlayerCount !== null) count++
    if (selectedDiffs.length > 0) count += selectedDiffs.length
    if (selectedPriceRange) count++
    if (selectedTimeRange) count++
    if (selectedDetective !== null) count++
    if (selectedRoleplay !== null) count++
    if (selectedTags.length > 0) count += selectedTags.length
    return count
  }, [selectedPlayerCount, selectedDiffs, selectedPriceRange, selectedTimeRange, selectedDetective, selectedRoleplay, selectedTags])

  const resetAllFilters = () => {
    setSelectedPlayerCount(null)
    setSelectedDiffs([])
    setSelectedPriceRange('')
    setSelectedTimeRange('')
    setSelectedDetective(null)
    setSelectedRoleplay(null)
    setSelectedTags([])
    setActiveCategory('all')
    setSearch('')
  }

  // Toggle filter helpers
  const toggleTag = (tg) => {
    setSelectedTags(prev => prev.includes(tg) ? prev.filter(x => x !== tg) : [...prev, tg])
  }
  const toggleDiff = (d) => {
    setSelectedDiffs(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  // Auto switch to grid if user enters search query or applies deep filters
  useEffect(() => {
    if (search.trim().length > 0 || activeFilterCount > 0) {
      setViewMode('grid')
    }
  }, [search, activeFilterCount])

  // 4. Filtering Logic
  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase()

    return allGames.filter(g => {
      // Search
      if (q) {
        const titleMatch = (g.title || '').toLowerCase().includes(q)
        const synMatch = (g.synopsis || '').toLowerCase().includes(q)
        const tagMatch = (g.tags || []).some(t => t.toLowerCase().includes(q))
        if (!titleMatch && !synMatch && !tagMatch) return false
      }

      // Quick Category Pill
      if (activeCategory !== 'all') {
        if (activeCategory === 'dm_picks') {
          const recs = dmRecsByGameId[g.id || g._id]
          if (!recs || recs.length === 0) return false
        } else if (activeCategory === 'Beginner') {
          if ((g.difficulty || '').toLowerCase() !== 'beginner') return false
        } else {
          if (!(g.tags || []).includes(activeCategory)) return false
        }
      }

      // Player Count
      if (selectedPlayerCount !== null) {
        const pCount = g.characters?.length || parsePlayerCount(g.players)
        if (selectedPlayerCount === 4 && pCount > 4) return false
        if (selectedPlayerCount === 5 && pCount !== 5) return false
        if (selectedPlayerCount === 6 && pCount !== 6) return false
        if (selectedPlayerCount === 7 && pCount !== 7) return false
        if (selectedPlayerCount === 8 && pCount < 8) return false
      }

      // Difficulty
      if (selectedDiffs.length > 0) {
        if (!selectedDiffs.includes(g.difficulty)) return false
      }

      // Price Range
      if (selectedPriceRange) {
        const p = g.price || g.fullPrice || 599
        if (selectedPriceRange === 'under600' && p >= 600) return false
        if (selectedPriceRange === '600-799' && (p < 600 || p >= 800)) return false
        if (selectedPriceRange === 'above800' && p < 800) return false
      }

      // Time Range
      if (selectedTimeRange) {
        const tStr = g.time || ''
        const m = tStr.match(/\d+/g)
        const hrs = m ? parseInt(m[m.length - 1], 10) : 4
        if (selectedTimeRange === '3-4' && hrs > 4) return false
        if (selectedTimeRange === '4-6' && (hrs < 4 || hrs > 6)) return false
        if (selectedTimeRange === '6+' && hrs < 6) return false
      }

      // Detective / Roleplay
      if (selectedDetective !== null && (g.detective || 0) < selectedDetective) return false
      if (selectedRoleplay !== null && (g.roleplay || 0) < selectedRoleplay) return false

      // Tags
      if (selectedTags.length > 0) {
        const hasAllTags = selectedTags.every(tg => (g.tags || []).includes(tg))
        if (!hasAllTags) return false
      }

      return true
    })
  }, [
    allGames, search, activeCategory, selectedPlayerCount, selectedDiffs,
    selectedPriceRange, selectedTimeRange, selectedDetective, selectedRoleplay, selectedTags,
    dmRecsByGameId
  ])

  // 5. Swimlane Categories Curation
  const swimlaneRows = useMemo(() => {
    if (viewMode !== 'swimlanes') return []

    // 1. Beginner Friendly — เน้นสืบและสวมบทดาวน้อย (คะแนนรวมสืบสวนและสวมบทบาทน้อยสุดขึ้นก่อน)
    const beginner = allGames
      .filter(g => {
        const det = Number(g.detective) || 0
        const rp = Number(g.roleplay) || 0
        const diff = (g.difficulty || '').toLowerCase()
        if (diff === 'expert' || diff === 'hard' || diff === 'ยาก' || diff === 'ยากมาก') return false
        if (det >= 4 || rp >= 4) return false
        return diff === 'beginner' || diff === 'ง่าย' || diff === 'มือใหม่' || (det + rp <= 5)
      })
      .sort((a, b) => {
        const detA = Number(a.detective) || 0
        const rpA  = Number(a.roleplay) || 0
        const detB = Number(b.detective) || 0
        const rpB  = Number(b.roleplay) || 0
        const sumA = detA + rpA
        const sumB = detB + rpB
        if (sumA !== sumB) return sumA - sumB
        const maxA = Math.max(detA, rpA)
        const maxB = Math.max(detB, rpB)
        if (maxA !== maxB) return maxA - maxB
        return detA - detB
      })

    // 3. Hardcore Mystery / Detective — เกมระดับสืบหลายดาว
    const detective = allGames
      .filter(g => (g.tags || []).includes('Detective') || (g.detective || 0) >= 3)
      .sort((a, b) => (b.detective || 0) - (a.detective || 0))

    // 4. Heavy Roleplay & Drama — เน้นเฉพาะเกมประเภทดราม่า (Drama Tag) เรียงตามจำนวนคนเยอะก่อน
    const roleplay = allGames
      .filter(g => (g.tags || []).includes('Drama'))
      .sort((a, b) => {
        const pA = getGamePlayerCount(a)
        const pB = getGamePlayerCount(b)
        if (pB !== pA) return pB - pA
        return (b.roleplay || 0) - (a.roleplay || 0)
      })

    // 5. Horror & Thriller
    const horror = allGames.filter(g => (g.tags || []).includes('Horror') || (g.tags || []).includes('Thriller'))

    // 6. Fantasy & Mystery
    const fantasy = allGames.filter(g => (g.tags || []).includes('Fantasy') || (g.tags || []).includes('Sci-Fi'))

    // 7. Large Group Parties (7+ Players)
    const largeGroups = allGames.filter(g => (g.characters?.length || parsePlayerCount(g.players)) >= 7)

    const rows = []

    // 0. DM Recommendations row (Top Priority)
    if (dmRecommendedGames && dmRecommendedGames.length > 0) {
      rows.push({
        id: 'dm_recommendations',
        title: 'เกมที่ DM ที่ร้านแนะนำ',
        games: dmRecommendedGames,
        isDmPicks: true,
        onSeeAll: () => { setActiveCategory('dm_picks'); setViewMode('grid') }
      })
    }

    if (topPlayedGames && topPlayedGames.length > 0) {
      rows.push({
        id: 'top_played_90d',
        title: 'รอบการเล่นสูงสุด (90 วันล่าสุด)',
        games: topPlayedGames,
        onSeeAll: () => { setViewMode('grid') }
      })
    }

    rows.push(
      {
        id: 'beginner',
        title: 'เหมาะสำหรับมือใหม่',
        games: beginner,
        onSeeAll: () => { setActiveCategory('Beginner'); setViewMode('grid') }
      },
      {
        id: 'detective',
        title: 'สืบสวนเข้มข้น หักมุม',
        games: detective,
        onSeeAll: () => { setActiveCategory('Detective'); setViewMode('grid') }
      },
      {
        id: 'roleplay',
        title: 'เน้นสวมบทบาท ดราม่าอารมณ์',
        games: roleplay,
        onSeeAll: () => { setActiveCategory('Drama'); setViewMode('grid') }
      },
      {
        id: 'horror',
        title: 'สยองขวัญ ระทึกขวัญ',
        games: horror,
        onSeeAll: () => { setActiveCategory('Horror'); setViewMode('grid') }
      },
      {
        id: 'fantasy',
        title: 'แฟนตาซี & เหนือธรรมชาติ',
        games: fantasy,
        onSeeAll: () => { setActiveCategory('Fantasy'); setViewMode('grid') }
      },
      {
        id: 'large_party',
        title: 'ปาร์ตี้กลุ่มใหญ่ 7 คนขึ้นไป',
        games: largeGroups,
        onSeeAll: () => { setSelectedPlayerCount(7); setViewMode('grid') }
      },
    )

    return rows
  }, [allGames, viewMode, topPlayedGames, dmRecommendedGames])

  return (
    <div style={{ background: BG_PAGE, color: TEXT_PRIMARY, minHeight: '100vh', paddingBottom: 80 }}>
      <style>{RESPONSIVE_CSS}</style>

      {/* 1. Hero Billboard (Spotlight - strictly ONLY new games) */}
      <NetflixHeroBillboard
        games={allGames}
        showDetail={showDetail}
        showPage={showPage}
        promoSettings={promoSettings}
        bookingEnabled={bookingEnabled}
        showToast={showToast}
      />

      {/* 2. Sticky SubBar for Search, Categories, and Mode Toggle */}
      <NetflixSubBar
        activeCategory={activeCategory}
        onSelectCategory={(cat) => {
          setActiveCategory(cat)
          if (cat !== 'all') setViewMode('grid')
        }}
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        isFilterOpen={filterDrawerOpen}
        onToggleFilter={() => setFilterDrawerOpen(prev => !prev)}
        activeFilterCount={activeFilterCount}
        resultCount={filteredGames.length}
      />

      {/* 3. Deep Filter Drawer */}
      <NetflixFilterDrawer
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        selectedPlayerCount={selectedPlayerCount}
        onSelectPlayerCount={setSelectedPlayerCount}
        selectedDiffs={selectedDiffs}
        onToggleDiff={toggleDiff}
        selectedPriceRange={selectedPriceRange}
        onSelectPriceRange={setSelectedPriceRange}
        selectedTimeRange={selectedTimeRange}
        onSelectTimeRange={setSelectedTimeRange}
        selectedDetective={selectedDetective}
        onSelectDetective={setSelectedDetective}
        selectedRoleplay={selectedRoleplay}
        onSelectRoleplay={setSelectedRoleplay}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onResetFilters={resetAllFilters}
        activeFilterCount={activeFilterCount}
      />

      {/* 4. Active Filter Chips Bar (If filters are active) */}
      {activeFilterCount > 0 && (
        <div className="netflix-active-chips" style={{ padding: '12px 40px 0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 700, textTransform: 'uppercase' }}>ฟิลเตอร์ที่ใช้งาน:</span>
          {selectedPlayerCount !== null && (
            <span style={{ fontSize: 11, background: '#f3f4f6', border: `1px solid ${BORDER_SUBTLE}`, color: TEXT_PRIMARY, padding: '3px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              ผู้เล่น: {selectedPlayerCount} คน
              <button type="button" onClick={() => setSelectedPlayerCount(null)} style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', padding: 0 }}><i className="fas fa-times text-[9px]" /></button>
            </span>
          )}
          {selectedDiffs.map(d => (
            <span key={d} style={{ fontSize: 11, background: '#f3f4f6', border: `1px solid ${BORDER_SUBTLE}`, color: TEXT_PRIMARY, padding: '3px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              ความยาก: {d}
              <button type="button" onClick={() => toggleDiff(d)} style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', padding: 0 }}><i className="fas fa-times text-[9px]" /></button>
            </span>
          ))}
          {selectedPriceRange && (
            <span key="price" style={{ fontSize: 11, background: '#f3f4f6', border: `1px solid ${BORDER_SUBTLE}`, color: TEXT_PRIMARY, padding: '3px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              ราคา: {selectedPriceRange}
              <button type="button" onClick={() => setSelectedPriceRange('')} style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', padding: 0 }}><i className="fas fa-times text-[9px]" /></button>
            </span>
          )}
          {selectedTimeRange && (
            <span key="time" style={{ fontSize: 11, background: '#f3f4f6', border: `1px solid ${BORDER_SUBTLE}`, color: TEXT_PRIMARY, padding: '3px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              เวลา: {selectedTimeRange} ชม.
              <button type="button" onClick={() => setSelectedTimeRange('')} style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', padding: 0 }}><i className="fas fa-times text-[9px]" /></button>
            </span>
          )}
          {selectedTags.map(tg => (
            <span key={tg} style={{ fontSize: 11, background: '#f3f4f6', border: `1px solid ${BORDER_SUBTLE}`, color: TEXT_PRIMARY, padding: '3px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              #{tg}
              <button type="button" onClick={() => toggleTag(tg)} style={{ background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer', padding: 0 }}><i className="fas fa-times text-[9px]" /></button>
            </span>
          ))}
          <button
            type="button"
            onClick={resetAllFilters}
            style={{ fontSize: 11, color: NETFLIX_RED, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, marginLeft: 4 }}
          >
            ล้างทั้งหมด
          </button>
        </div>
      )}

      {/* 5. Main Body: Mode Swimlanes OR Mode Grid */}
      <div style={{ marginTop: 28 }}>
        {viewMode === 'swimlanes' && !search && activeCategory === 'all' && activeFilterCount === 0 ? (
          /* Netflix Swimlanes Rows */
          <div>
            {swimlaneRows.map(row => (
              <NetflixSwimlaneRow
                key={row.id}
                title={row.title}
                subtitle={row.subtitle}
                games={row.games}
                showDetail={showDetail}
                showPage={showPage}
                playedIds={playedIds}
                onSeeAll={row.onSeeAll}
                bookingEnabled={bookingEnabled}
                showToast={showToast}
                dmRecsMap={dmRecsByGameId}
                isDmPicks={row.isDmPicks}
              />
            ))}
          </div>
        ) : (
          /* Full Grid View */
          <div className="netflix-grid-wrapper" style={{ padding: '0 40px' }}>
            {/* Header info */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 10, textAlign: 'left' }}>
                <div style={{ width: 4, height: 18, background: NETFLIX_RED, borderRadius: 2, flexShrink: 0 }} />
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: TEXT_PRIMARY, textAlign: 'left' }}>
                  {search ? `ผลการค้นหาสำหรับ "${search}"` : activeCategory === 'dm_picks' ? 'เกมที่ DM ที่ร้านแนะนำ' : activeCategory !== 'all' ? `หมวดหมู่: ${activeCategory}` : 'สคริปต์ทั้งหมด'}
                </h3>
                <span style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: 600 }}>
                  ({filteredGames.length} เรื่อง)
                </span>
              </div>

              {viewMode === 'grid' && !search && activeFilterCount === 0 && activeCategory === 'all' && (
                <button
                  type="button"
                  onClick={() => setViewMode('swimlanes')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: TEXT_MUTED,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className="fas fa-stream text-xs" /> กลับสู่มุมมองหมวดหมู่
                </button>
              )}
            </div>

            {/* Empty state */}
            {filteredGames.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '70px 20px',
                  background: '#ffffff',
                  borderRadius: 16,
                  border: `1px solid ${BORDER_SUBTLE}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fas fa-search" style={{ fontSize: 22, color: TEXT_SUBTLE }} />
                </div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TEXT_PRIMARY }}>
                  ไม่พบสคริปต์ที่ตรงกับเงื่อนไข
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, maxWidth: 360 }}>
                  ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองเพื่อค้นหาเรื่องราวอื่นๆ
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  style={{
                    marginTop: 8,
                    padding: '8px 20px',
                    borderRadius: 8,
                    background: NETFLIX_RED,
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              </div>
            ) : (
              /* Grid of Cards */
              <div
                className="netflix-grid-cards"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 18,
                  justifyItems: 'center',
                }}
              >
                {filteredGames.map(game => (
                  <NetflixPosterCard
                    key={game.id}
                    game={game}
                    showDetail={showDetail}
                    showPage={showPage}
                    isPlayed={playedIds.has(game.id)}
                    bookingEnabled={bookingEnabled}
                    showToast={showToast}
                    dmRec={dmRecsByGameId[game.id]?.[0]}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
