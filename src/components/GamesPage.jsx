import { useState, useMemo, useEffect } from 'react'
import { useLang } from '../LangContext'

/* ── Design tokens — resolved via theme.css CSS variables ─ */
const VOID    = 'var(--void-950)'   // kept for badge/overlay contexts
const SURFACE = 'var(--void-900)'
const CARD    = 'var(--void-800)'
const C       = 'var(--crimson-500)'
const C_DEEP  = 'var(--crimson-700)'
const CHALK   = 'var(--chalk)'      // kept for badge text on dark/colored bg
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
const toWsrv = (id) =>
  `https://wsrv.nl/?url=https://drive.usercontent.google.com/download?id=${id}%26export%3Dview&w=400&output=webp`

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

/* ── Filter constants ────────────────────────────────── */
const GENRE_OPTIONS  = ['Horror','Drama','Detective','Emotional','Comedy','Thriller','Romance','Action']
const DIFF_OPTIONS   = ['Beginner','Normal','Hard','Expert']
const PLAYER_COUNTS  = [1,2,3,4,5,6,7,8,9]
const STAR_OPTIONS   = [1, 2, 3, 4, 5]

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

function parsePlayerRange(str) {
  const nums = String(str || '').match(/\d+/g)?.map(Number) || []
  return { lo: nums[0] || 0, hi: nums[1] || nums[0] || 0 }
}

function playerMatches(playersStr, count) {
  if (!count) return true
  const { lo, hi } = parsePlayerRange(playersStr)
  if (!lo) return true
  return count >= lo && count <= (hi || lo)
}

/* ── Sub-components ──────────────────────────────────── */
function StarRow({ label, value, onChange, color }) {
  return (
    <div style={{ marginBottom: 0 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: INK_3, marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'flex', gap: 4 }}>
        {STAR_OPTIONS.map(n => {
          const active = value === n
          return (
            <button key={n} onClick={() => onChange(v => v === n ? null : n)} style={{
              background: active ? `${color}22` : 'transparent',
              border: `1px solid ${active ? color : L_BORDER}`,
              color: active ? color : INK_3,
              borderRadius: 4, cursor: 'pointer',
              fontSize: 10, padding: '4px 6px', lineHeight: 1,
              transition: 'all 0.18s',
            }}>{'★'.repeat(n)}</button>
          )
        })}
      </div>
    </div>
  )
}

function ScriptCard({ game, showDetail }) {
  const imgSrc = game.image ? convertImageUrl(game.image) : null
  const displayPrice = game.fullPrice ?? game.price
  const isFree = displayPrice === 0
  const stars  = Math.min(5, Math.max(0, parseInt(game.detective) || 4))
  const diff   = diffConfig(game.difficulty)

  return (
    <div className="gp-card" onClick={() => showDetail(game.id)} style={{
      borderRadius: 10, overflow: 'hidden', background: PAPER_2,
      border: `1px solid ${L_BORDER}`, position: 'relative',
      display: 'flex', flexDirection: 'column', cursor: 'pointer',
    }}>
      {/* Cover art */}
      <div style={{ position: 'relative', aspectRatio: '2/3', overflow: 'hidden', flexShrink: 0 }}>
        {imgSrc ? (
          <img src={imgSrc} alt={game.title} loading="lazy" decoding="async" className="gp-card-img" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', filter: 'brightness(0.86) contrast(1.06)',
          }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg, var(--void-100) 0%, var(--void-200) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fas fa-theater-masks" style={{ fontSize: 36, color: INK_3 }} />
          </div>
        )}
        {/* Gradient */}
        <div className="gp-card-overlay" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.05) 50%, transparent 100%)', opacity: 0.65 }} />
        {/* Difficulty badge */}
        {game.difficulty && (
          <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, color: diff.text, background: diff.bg }}>
            {game.difficulty}
          </span>
        )}
        {/* Free badge */}
        {isFree && (
          <span style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, background: AMBER, color: VOID }}>ฟรี</span>
        )}
        {/* Synopsis hover overlay */}
        {(game.synopsis || game.description) && (
          <div className="gp-synopsis" style={{
            position: 'absolute', inset: 0, zIndex: 3,
            background: 'rgba(9,9,15,0.92)',
            padding: '16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            opacity: 0, transition: 'opacity 0.28s ease',
          }}>
            <p style={{ fontSize: 11, color: CHALK_2, lineHeight: 1.75, display: '-webkit-box', WebkitLineClamp: 7, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {game.synopsis || game.description}
            </p>
            <p style={{ fontSize: 10, fontWeight: 700, color: C, marginTop: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>อ่านเพิ่ม →</p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="gp-card-info" style={{ padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        {game.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {game.tags.slice(0, 2).map(tag => (
              <span key={tag} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3, background: `${C}14`, color: C, border: `1px solid ${C}28` }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {game.title || 'ไม่มีชื่อ'}
        </p>

        {/* Stars */}
        <div style={{ display: 'flex', gap: 2 }}>
          {[1,2,3,4,5].map(s => (
            <span key={s} style={{ fontSize: 10, color: s <= stars ? AMBER : L_BORDER_2, lineHeight: 1 }}>★</span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: INK_3, flexWrap: 'wrap' }}>
          {!!game.players && <span><i className="fas fa-users" style={{ marginRight: 4, fontSize: 9 }} />{game.players} คน</span>}
          {game.time    && <span><i className="fas fa-clock" style={{ marginRight: 4, fontSize: 9 }} />{game.time}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 4 }}>
          {displayPrice !== undefined && (
            <span style={{ fontSize: 14, fontWeight: 800, color: isFree ? AMBER : C }}>
              {isFree ? 'ฟรี' : `฿${displayPrice}`}
              {!isFree && <span style={{ fontSize: 10, fontWeight: 500, color: INK_3, marginLeft: 3 }}>/คน</span>}
            </span>
          )}
          <span style={{ fontSize: 10, color: INK_3, marginLeft: 'auto' }}>→</span>
        </div>
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────────────────── */
export default function GamesPage({ allGames, showDetail }) {
  const { t } = useLang()
  const [search,           setSearch]           = useState('')
  const [selectedTags,     setSelectedTags]     = useState([])
  const [selectedDiffs,    setSelectedDiffs]    = useState([])
  const [selectedPlayerCount, setSelectedPlayerCount] = useState(null)
  const [minDetective,     setMinDetective]     = useState(null)
  const [minRoleplay,      setMinRoleplay]      = useState(null)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [sidebarVisible,   setSidebarVisible]   = useState(false)

  useEffect(() => { setTimeout(() => setSidebarVisible(true), 80) }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allGames.filter(g => {
      const matchName    = (g.title || '').toLowerCase().includes(q)
      const matchDiff    = selectedDiffs.length === 0 || selectedDiffs.some(d => (g.difficulty || '').toLowerCase() === d.toLowerCase())
      const matchTags    = selectedTags.length  === 0 || selectedTags.some(tg => g.tags?.includes(tg))
      const matchPlayers = playerMatches(g.players, selectedPlayerCount)
      const matchDet     = !minDetective || (parseInt(g.detective) || 0) >= minDetective
      const matchRole    = !minRoleplay  || (parseInt(g.roleplay)  || 0) >= minRoleplay
      return matchName && matchDiff && matchTags && matchPlayers && matchDet && matchRole
    })
  }, [allGames, search, selectedTags, selectedDiffs, selectedPlayerCount, minDetective, minRoleplay])

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('gp-in'); obs.unobserve(e.target) } }),
      { threshold: 0.06, rootMargin: '0px 0px -40px 0px' }
    )
    const t = setTimeout(() => {
      document.querySelectorAll('.gp-reveal:not(.gp-in)').forEach(el => obs.observe(el))
    }, 0)
    return () => { clearTimeout(t); obs.disconnect() }
  }, [filtered])

  const toggleTag  = tg => setSelectedTags(p  => p.includes(tg) ? p.filter(x => x !== tg) : [...p, tg])
  const toggleDiff = d  => setSelectedDiffs(p => p.includes(d)  ? p.filter(x => x !== d)  : [...p, d])
  const resetAll   = () => { setSelectedTags([]); setSelectedDiffs([]); setSelectedPlayerCount(null); setMinDetective(null); setMinRoleplay(null); setSearch('') }

  const hasFilters = selectedTags.length > 0 || selectedDiffs.length > 0 ||
    selectedPlayerCount !== null || minDetective !== null || minRoleplay !== null

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif", background: PAPER, color: INK, minHeight: '100vh', paddingTop: 60 }}>

      <style>{`
        @keyframes gpFadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }
        @keyframes gpFadeIn { from{opacity:0} to{opacity:1} }
        .gp-reveal { opacity:0; transform:translateY(24px); transition: opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1); }
        .gp-reveal.gp-in { opacity:1; transform:none; }
        .gp-d1{transition-delay:0.06s!important} .gp-d2{transition-delay:0.12s!important} .gp-d3{transition-delay:0.18s!important} .gp-d4{transition-delay:0.24s!important}

        /* Card */
        .gp-card { transition: transform 0.32s cubic-bezier(0.22,1,0.36,1), box-shadow 0.32s, border-color 0.22s !important; }
        .gp-card:hover { transform: translateY(-6px) !important; box-shadow: 0 16px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(198,36,25,0.25) !important; }
        .gp-card:focus-visible { outline: 2px solid ${C}; outline-offset: 2px; }
        .gp-card:hover .gp-card-img { transform: scale(1.06) !important; }
        .gp-card:hover .gp-card-overlay { opacity: 0.8 !important; }
        .gp-card:hover .gp-synopsis { opacity: 1 !important; }
        .gp-card-img { transition: transform 0.5s cubic-bezier(0.22,1,0.36,1) !important; }

        /* Search */
        .gp-search:focus { outline: none; border-color: ${C} !important; background: rgba(198,36,25,0.06) !important; }
        .gp-search::placeholder { color: ${INK_3}; }

        /* Sidebar check */
        .gp-check:hover { background: rgba(0,0,0,0.04) !important; }
        .gp-check input { accent-color: ${C}; }

        /* Filter chip */
        .gp-chip { transition: all 0.18s !important; }
        .gp-chip:hover { border-color: ${C} !important; color: ${INK} !important; }
        .gp-chip:focus-visible { outline: 2px solid ${C}; outline-offset: 2px; }

        /* Active filter tag */
        .gp-active-tag { transition: background 0.18s !important; }
        .gp-active-tag:hover { background: rgba(198,36,25,0.22) !important; }
        .gp-active-tag:focus-visible { outline: 2px solid ${C}; outline-offset: 2px; }

        /* Sidebar slide in */
        .gp-sidebar { opacity: 0; transform: translateX(-16px); transition: opacity 0.55s cubic-bezier(0.22,1,0.36,1) 0.1s, transform 0.55s cubic-bezier(0.22,1,0.36,1) 0.1s; }
        .gp-sidebar.gp-sidebar-in { opacity: 1; transform: none; }

        @media(prefers-reduced-motion:reduce){ .gp-reveal,.gp-card,.gp-sidebar{transition:none;opacity:1;transform:none} }
        @media(max-width:767px){ .gp-layout-sidebar{display:none!important} }
      `}</style>

      {/* ── Page header ── */}
      <header style={{ background: PAPER_2, borderBottom: `1px solid ${L_BORDER}`, padding: 'clamp(36px,5vw,60px) clamp(20px,4vw,40px)' }}>
        <div style={{ maxWidth: 1380, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: "'Sarabun', 'Bebas Neue', sans-serif", fontWeight: 900, fontSize: 'clamp(42px,6vw,80px)', lineHeight: 0.88, textTransform: 'uppercase', color: INK, margin: 0 }}>
              แฟ้มคดี<span style={{ color: C }}>ทั้งหมด</span>
            </h1>
            <span style={{ fontSize: 13, color: INK_3, flexShrink: 0, paddingBottom: 6 }}>
              {allGames.length} สคริปต์
            </span>
          </div>
        </div>
      </header>

      {/* ── Layout: sidebar + main ── */}
      <div style={{ maxWidth: 1380, margin: '0 auto', display: 'flex', gap: 0, padding: '0 clamp(20px,4vw,40px)', alignItems: 'flex-start' }}>

        {/* ── Sidebar ── */}
        <aside className={`gp-layout-sidebar gp-sidebar${sidebarVisible ? ' gp-sidebar-in' : ''}`} style={{
          width: 220, flexShrink: 0, paddingTop: 36, paddingRight: 28, paddingBottom: 48,
          position: 'sticky', top: 60, maxHeight: 'calc(100vh - 60px)', overflowY: 'auto',
        }}>
          {/* Sidebar header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, paddingBottom: 16, borderBottom: `1px solid ${L_BORDER}` }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: INK_3 }}>คัดกรอง</span>
            {hasFilters && (
              <button onClick={resetAll} style={{ fontSize: 11, fontWeight: 700, color: C, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>ล้างทั้งหมด</button>
            )}
          </div>

          <SidebarSection label="แนว / Genre">
            {GENRE_OPTIONS.map(g => (
              <CheckRow key={g} checked={selectedTags.includes(g)} onChange={() => toggleTag(g)} label={g} />
            ))}
          </SidebarSection>

          <SidebarSection label="ระดับความยาก">
            {DIFF_OPTIONS.map(d => (
              <CheckRow key={d} checked={selectedDiffs.includes(d)} onChange={() => toggleDiff(d)} label={d} accent={diffConfig(d).bg} active={selectedDiffs.includes(d)} />
            ))}
          </SidebarSection>

          <SidebarSection label="จำนวนผู้เล่น">
            <select
              value={selectedPlayerCount ?? ''}
              onChange={e => setSelectedPlayerCount(e.target.value ? Number(e.target.value) : null)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: PAPER_2, border: `1px solid ${selectedPlayerCount ? C : L_BORDER}`,
                borderRadius: 6, color: selectedPlayerCount ? C : INK_2,
                fontSize: 13, padding: '8px 10px',
                fontFamily: "'Sarabun', sans-serif", cursor: 'pointer',
                outline: 'none', fontWeight: selectedPlayerCount ? 700 : 400,
                transition: 'border-color 0.18s, color 0.18s',
              }}
            >
              <option value="">ทุกจำนวน</option>
              {PLAYER_COUNTS.map(n => (
                <option key={n} value={n}>{n} คน</option>
              ))}
            </select>
          </SidebarSection>

          <SidebarSection label="ความเข้มข้น">
            <StarRow label={t('games','detectiveLevel')} value={minDetective} onChange={setMinDetective} color={AMBER} />
            <div style={{ marginTop: 12 }}>
              <StarRow label={t('games','roleplayLevel')} value={minRoleplay} onChange={setMinRoleplay} color="#a78bfa" />
            </div>
          </SidebarSection>
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, minWidth: 0, paddingTop: 28, paddingBottom: 80 }}>

          {/* Topbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            {/* Search */}
            <div style={{ flex: 1, position: 'relative' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: INK_3, pointerEvents: 'none' }} />
              <input
                className="gp-search"
                placeholder="ค้นหาชื่อสคริปต์..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: PAPER_2, border: `1px solid ${L_BORDER}`,
                  borderRadius: 8, color: INK,
                  fontSize: 13, padding: '11px 14px 11px 38px',
                  fontFamily: "'Sarabun', sans-serif",
                  transition: 'border-color 0.2s, background 0.2s',
                }}
              />
            </div>

            {/* Count */}
            <span style={{ fontSize: 12, color: INK_3, flexShrink: 0, whiteSpace: 'nowrap' }}>
              {filtered.length} เรื่อง
            </span>

            {/* Mobile filter toggle */}
            <button
              onClick={() => setMobileFilterOpen(o => !o)}
              style={{
                display: 'none',
                background: mobileFilterOpen || hasFilters ? `${C}1a` : PAPER_2,
                border: `1px solid ${mobileFilterOpen || hasFilters ? C : L_BORDER}`,
                color: mobileFilterOpen || hasFilters ? C : INK_2,
                borderRadius: 8, padding: '10px 14px',
                fontSize: 13, cursor: 'pointer', flexShrink: 0,
                fontFamily: "'Sarabun', sans-serif", fontWeight: 700,
              }}
              className="gp-mobile-filter-btn"
            >
              <i className="fas fa-sliders-h" style={{ marginRight: 6 }} />
              ตัวกรอง{hasFilters ? ` (${selectedTags.length + selectedDiffs.length + (selectedPlayerCount ? 1 : 0) + (minDetective ? 1 : 0) + (minRoleplay ? 1 : 0)})` : ''}
            </button>
            <style>{`@media(max-width:767px){.gp-mobile-filter-btn{display:flex!important}}`}</style>
          </div>

          {/* Mobile filter drawer */}
          {mobileFilterOpen && (
            <div style={{ background: PAPER_2, borderRadius: 10, border: `1px solid ${L_BORDER}`, padding: '20px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <FilterGroup label="แนว" options={GENRE_OPTIONS} selected={selectedTags} onToggle={toggleTag} />
                <FilterGroup label="ความยาก" options={DIFF_OPTIONS} selected={selectedDiffs} onToggle={toggleDiff} />
              </div>
              <div style={{ marginBottom: 4 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: INK_3, marginBottom: 8 }}>จำนวนผู้เล่น</p>
                <select
                  value={selectedPlayerCount ?? ''}
                  onChange={e => setSelectedPlayerCount(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    background: PAPER_2, border: `1px solid ${selectedPlayerCount ? C : L_BORDER}`,
                    borderRadius: 6, color: selectedPlayerCount ? C : INK_2,
                    fontSize: 13, padding: '8px 12px',
                    fontFamily: "'Sarabun', sans-serif", cursor: 'pointer',
                    outline: 'none', fontWeight: selectedPlayerCount ? 700 : 400,
                  }}
                >
                  <option value="">ทุกจำนวน</option>
                  {PLAYER_COUNTS.map(n => <option key={n} value={n}>{n} คน</option>)}
                </select>
              </div>
              {hasFilters && (
                <button onClick={resetAll} style={{ fontSize: 11, fontWeight: 700, padding: '8px 18px', borderRadius: 6, background: `${C}18`, color: C, border: `1px solid ${C}44`, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Sarabun', sans-serif" }}>
                  ล้างทั้งหมด
                </button>
              )}
            </div>
          )}

          {/* Active filter chips */}
          {hasFilters && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
              {[
                ...selectedTags.map(v => ({ label: v, rm: () => toggleTag(v), color: C })),
                ...selectedDiffs.map(v => ({ label: v, rm: () => toggleDiff(v), color: diffConfig(v).bg })),
                ...(selectedPlayerCount ? [{ label: `${selectedPlayerCount} คน`, rm: () => setSelectedPlayerCount(null), color: C }] : []),
                ...(minDetective ? [{ label: `สืบ ${'★'.repeat(minDetective)}+`, rm: () => setMinDetective(null), color: AMBER }] : []),
                ...(minRoleplay  ? [{ label: `บท ${'★'.repeat(minRoleplay)}+`,  rm: () => setMinRoleplay(null),  color: 'var(--void-400)' }] : []),
              ].map(({ label, rm, color }) => (
                <button key={label} className="gp-active-tag" onClick={rm} style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                  background: `${color}14`, border: `1px solid ${color}38`, color,
                  cursor: 'pointer', fontFamily: "'Sarabun', sans-serif",
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {label} <i className="fas fa-times" style={{ fontSize: 9, opacity: 0.7 }} />
                </button>
              ))}
            </div>
          )}

          {/* Grid / states */}
          {allGames.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ width: 40, height: 40, border: `3px solid ${L_BORDER}`, borderTopColor: C, borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.9s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <p style={{ color: INK_3, fontSize: 14 }}>กำลังโหลดแฟ้มคดี...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <i className="fas fa-search" style={{ fontSize: 42, color: INK_3, marginBottom: 16, display: 'block' }} />
              <p style={{ color: INK_3, fontSize: 15, fontWeight: 600 }}>ไม่พบสคริปต์ที่ค้นหา</p>
              <p style={{ color: INK_3, fontSize: 13, marginTop: 8 }}>ลองปรับตัวกรองหรือคำค้นหา</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 14 }}>
              {filtered.map((game, i) => (
                <div key={game.id} className={`gp-reveal gp-d${(i % 4) + 1}`}>
                  <ScriptCard game={game} showDetail={showDetail} />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

/* ── Sidebar helpers ─────────────────────────────────── */
function SidebarSection({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: INK_3, marginBottom: 12 }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </div>
    </div>
  )
}

function CheckRow({ checked, onChange, label, accent, active }) {
  return (
    <label className="gp-check" style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px',
      borderRadius: 6, cursor: 'pointer',
      background: checked ? 'rgba(198,36,25,0.07)' : 'transparent',
      transition: 'background 0.18s',
    }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: C, width: 13, height: 13, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: active && accent ? accent : checked ? INK : INK_2, fontWeight: checked ? 700 : 400, transition: 'color 0.18s' }}>
        {label}
      </span>
    </label>
  )
}

function FilterGroup({ label: _label, options, selected, onToggle }) {
  return (
    <>
      {options.map(opt => (
        <button key={opt} className="gp-chip" onClick={() => onToggle(opt)} style={{
          fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 20,
          background: selected.includes(opt) ? `${C}18` : 'rgba(0,0,0,0.04)',
          border: `1px solid ${selected.includes(opt) ? C : L_BORDER}`,
          color: selected.includes(opt) ? C : INK_2,
          cursor: 'pointer', fontFamily: "'Sarabun', sans-serif",
        }}>{opt}</button>
      ))}
    </>
  )
}
