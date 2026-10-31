import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useLang } from '../LangContext';
import { db } from '../firebase';
import { doc, updateDoc, arrayUnion, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import Footer from './Footer';

/* Design tokens - Netflix White Theme */
const C          = 'var(--crimson-500)';
const C_DEEP     = 'var(--crimson-700)';
const NETFLIX_RED = '#e50914';
const BG_PAGE    = '#ffffff';
const BG_SURFACE = '#f8fafc';
const CARD_BG    = '#ffffff';
const TEXT_MAIN  = '#111827';
const TEXT_MUTED = '#4b5563';
const TEXT_LIGHT = '#9ca3af';
const BORDER_CLR = 'rgba(0, 0, 0, 0.08)';

const toWsrv = (id, w = 900) =>
  `https://wsrv.nl/?url=https://drive.usercontent.google.com/download?id=${id}%26export%3Dview&w=${w}&output=webp`;

const extractDriveId = (url) => {
  if (!url) return null;
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^=?/]+)/);
  if (lh3) return lh3[1];
  const m1 = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return m2[1];
  return null;
};

const convertImageUrl = (url, w = 900) => {
  if (!url) return url;
  const id = extractDriveId(url);
  return id ? toWsrv(id, w) : url;
};

/* Difficulty Badge */
function DiffBadge({ d }) {
  if (!d) return null;
  const l = String(d).toLowerCase();
  let bg = '#6b7280';
  let fg = '#ffffff';
  let label = d;

  if (l === 'beginner' || l === 'ง่าย') {
    bg = '#10b981';
    fg = '#ffffff';
  } else if (l === 'normal' || l === 'ปานกลาง') {
    bg = '#3b82f6';
    fg = '#ffffff';
  } else if (l === 'hard' || l === 'ยาก') {
    bg = '#f59e0b';
    fg = '#111827';
  } else if (l === 'expert' || l === 'ยากมาก') {
    bg = NETFLIX_RED;
    fg = '#ffffff';
  }

  return (
    <span
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        zIndex: 2,
        fontSize: 10,
        fontWeight: 800,
        color: fg,
        background: bg,
        padding: '3px 7px',
        borderRadius: 6,
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      }}
    >
      {label}
    </span>
  );
}

function parsePlayerCount(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const match = String(str).match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function getGamePlayerCount(g) {
  if (!g) return 0;
  if (Array.isArray(g.characters) && g.characters.length > 0) return g.characters.length;
  return parsePlayerCount(g.players) || 6;
}

/* Netflix Poster Card */
function HomeNetflixPosterCard({ game, showDetail, showPage, isPlayed }) {
  const [hovered, setHovered] = useState(false);
  const posterImg = convertImageUrl(game.image || game.coverUrl, 400);
  const players = getGamePlayerCount(game);

  const handleBook = (e) => {
    e.stopPropagation();
    if (typeof showPage === 'function') {
      showPage('booking', { gameId: game.id });
    } else {
      window.location.href = `/booking?gameId=${game.id}`;
    }
  };

  const handleDetail = (e) => {
    e.stopPropagation();
    if (showDetail) showDetail(game.id);
  };

  return (
    <div
      onClick={handleDetail}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="netflix-home-card"
      style={{
        position: 'relative',
        width: 185,
        minWidth: 185,
        height: 278,
        borderRadius: 12,
        overflow: 'hidden',
        background: CARD_BG,
        cursor: 'pointer',
        border: `1.5px solid ${hovered ? 'rgba(229,9,20,0.35)' : BORDER_CLR}`,
        boxShadow: hovered
          ? '0 16px 36px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)'
          : '0 2px 8px rgba(0,0,0,0.05)',
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
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: hovered ? 'brightness(0.95)' : 'brightness(0.9)',
            transition: 'filter 0.24s ease',
          }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
          <i className="fas fa-theater-masks" style={{ fontSize: 32, color: 'rgba(0,0,0,0.2)' }} />
        </div>
      )}

      {/* Top Badges */}
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none', zIndex: 2 }}>
        {game.difficulty && <DiffBadge d={game.difficulty} />}

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
              marginLeft: 'auto',
            }}
          >
            <i className="fas fa-check" style={{ fontSize: 9 }} /> เล่นแล้ว
          </span>
        )}
      </div>

      {/* Bottom Gradient Overlay */}
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

        {/* Specs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>
          <span><i className="fas fa-users" style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }} /> {players} คน</span>
          <span>•</span>
          <span>{game.time || '4 ชม.'}</span>
        </div>

        {/* Action Bar */}
        <div
          className="netflix-home-card-actions"
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
            }}
          >
            <i className="fas fa-play" style={{ fontSize: 9 }} /> จองรอบ
          </button>

          <button
            type="button"
            onClick={handleDetail}
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
            }}
            aria-label="ดูรายละเอียด"
          >
            <i className="fas fa-info" style={{ fontSize: 10 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* Netflix Swimlane Row */
function HomeNetflixSwimlaneRow({ title, subtitle, games = [], showDetail, showPage, playedIds, onSeeAll }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', checkScroll, { passive: true });
    return () => el && el.removeEventListener('scroll', checkScroll);
  }, [games]);

  const scroll = (direction) => {
    if (!scrollRef.current) return;
    const step = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth'
    });
  };

  if (games.length === 0) return null;

  return (
    <div style={{ position: 'relative', marginBottom: 38 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 clamp(16px, 4vw, 40px)', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 18, background: NETFLIX_RED, borderRadius: 2 }} />
          <h3 style={{ margin: 0, fontSize: 'clamp(16px, 2.2vw, 20px)', fontWeight: 900, color: TEXT_MAIN, letterSpacing: '-0.01em' }}>
            {title}
          </h3>
          {subtitle && (
            <span style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: 500, marginLeft: 4 }}>
              {subtitle}
            </span>
          )}
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
            }}
          >
            <span>ดูทั้งหมด ({games.length})</span>
            <i className="fas fa-chevron-right" style={{ fontSize: 10 }} />
          </button>
        )}
      </div>

      {/* Row Body */}
      <div style={{ position: 'relative' }}>
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll('left')}
            className="netflix-home-scroll-arrow"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 48,
              zIndex: 10,
              background: 'linear-gradient(to right, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 60%, transparent 100%)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            aria-label="เลื่อนซ้าย"
          >
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ffffff', color: TEXT_MAIN, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', border: `1px solid ${BORDER_CLR}` }}>
              <i className="fas fa-chevron-left" style={{ fontSize: 12 }} />
            </div>
          </button>
        )}

        <div
          ref={scrollRef}
          style={{
            display: 'flex',
            gap: 14,
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '10px clamp(16px, 4vw, 40px) 16px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {games.map(game => (
            <HomeNetflixPosterCard
              key={game.id}
              game={game}
              showDetail={showDetail}
              showPage={showPage}
              isPlayed={playedIds.has(game.id)}
            />
          ))}
        </div>

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll('right')}
            className="netflix-home-scroll-arrow"
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 48,
              zIndex: 10,
              background: 'linear-gradient(to left, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 60%, transparent 100%)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            aria-label="เลื่อนขวา"
          >
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ffffff', color: TEXT_MAIN, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', border: `1px solid ${BORDER_CLR}` }}>
              <i className="fas fa-chevron-right" style={{ fontSize: 12 }} />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

const PLACEHOLDER = Array.from({ length: 12 }, (_, i) => ({
  id: `ph-${i}`,
  title: ['The Mansion Mystery','Blood on the Dancefloor','Midnight Train','The Last Supper','Carnival of Souls','Dead in the Water','Black Swan','The Quiet Room','Red Velvet','Ivory Tower','Crimson Tide','Shadow Play'][i],
  coverUrl: null,
  difficulty: ['ง่าย','ปานกลาง','ยาก','ยากมาก','ง่าย','ปานกลาง','ยาก','ยาก','ง่าย','ปานกลาง','ยาก','ง่าย'][i],
  players: ['4-6','6-8','8-10','6-8','4-6','8-12','6-10','4-8','4-6','6-10','6-8','4-6'][i],
  price: [0,299,399,499,0,349,399,299,0,349,399,0][i],
}));

export default function HomePage({ allGames = [], allParties = [], showPage, showDetail, lineUser }) {
  const { t } = useLang();
  const [heroIdx, setHeroIdx]         = useState(0);
  const [heroVisible, setHeroVisible] = useState(true);
  const [promoSettings, setPromoSettings] = useState(null);
  const [recentPlayedIds, setRecentPlayedIds] = useState([]);
  const [playedIds, setPlayedIds] = useState(() => new Set());
  const revealRoot = useRef(null);

  /* Load Promotion Settings */
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'promotion'), (snap) => {
      if (snap.exists()) {
        setPromoSettings(snap.data());
      }
    });
    return () => unsub();
  }, []);

  /* Load Recent Store Plays from Orders */
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, snap => {
      const seen = new Set();
      const list = [];
      snap.docs.forEach(d => {
        const sid = d.data().scriptId;
        if (sid && !seen.has(sid)) {
          seen.add(sid);
          list.push(sid);
        }
      });
      setRecentPlayedIds(list);
    }, () => {});
    return () => unsub();
  }, []);

  /* Load User Played Games History */
  useEffect(() => {
    if (!lineUser?.uid) { setPlayedIds(new Set()); return; }
    const q = query(collection(db, 'playHistory'), where('userId', '==', lineUser.uid));
    const unsub = onSnapshot(q, snap => {
      const ids = new Set();
      snap.docs.forEach(d => { const sid = d.data().scriptId; if (sid) ids.add(sid); });
      setPlayedIds(ids);
    }, () => {});
    return () => unsub();
  }, [lineUser?.uid]);

  /* Sort games by newest first */
  const sortedNewestGames = useMemo(() => {
    return [...allGames].sort((a, b) => {
      const getTimestamp = (g) => {
        if (!g) return 0;
        if (g.createdAt?.toMillis) return g.createdAt.toMillis();
        if (g.createdAt?.seconds) return g.createdAt.seconds * 1000;
        if (g.createdAt) return new Date(g.createdAt).getTime();
        return 0;
      };
      return getTimestamp(b) - getTimestamp(a);
    });
  }, [allGames]);

  /* 3 New Games to display in Hero Card */
  const newGames = useMemo(() => {
    if (promoSettings?.newGameIds && Array.isArray(promoSettings.newGameIds) && promoSettings.newGameIds.length > 0) {
      const mapped = promoSettings.newGameIds
        .map(id => allGames.find(g => g.id === id))
        .filter(Boolean);
      if (mapped.length > 0) return mapped.slice(0, 3);
    }
    const source = sortedNewestGames.length > 0 ? sortedNewestGames : (allGames.length > 0 ? allGames : PLACEHOLDER);
    return source.slice(0, 3);
  }, [promoSettings?.newGameIds, allGames, sortedNewestGames]);

  /* Hero Featured Games */
  const heroFeaturedGames = useMemo(() => {
    if (newGames && newGames.length > 0) return newGames;
    return (allGames.length > 0 ? allGames : PLACEHOLDER).slice(0, 3);
  }, [newGames, allGames]);

  /* Swimlanes Data */
  const trendingGames = useMemo(() => {
    const recentMap = new Map();
    recentPlayedIds.forEach((id, idx) => { recentMap.set(id, idx); });
    return [...allGames].sort((a, b) => {
      const idxA = recentMap.has(a.id) ? recentMap.get(a.id) : 9999;
      const idxB = recentMap.has(b.id) ? recentMap.get(b.id) : 9999;
      return idxA - idxB;
    });
  }, [allGames, recentPlayedIds]);

  const beginnerGames = useMemo(() => {
    return allGames
      .filter(g => {
        const det = g.detective || 0;
        const rp = g.roleplay || 0;
        if (det >= 4 || rp >= 4) return false;
        return (g.difficulty || '').toLowerCase() === 'beginner' || (g.difficulty || '') === 'ง่าย' || (det + rp <= 5);
      })
      .sort((a, b) => {
        const sumA = (a.detective || 0) + (a.roleplay || 0);
        const sumB = (b.detective || 0) + (b.roleplay || 0);
        if (sumA !== sumB) return sumA - sumB;
        return (a.detective || 0) - (b.detective || 0);
      });
  }, [allGames]);

  const detectiveGames = useMemo(() => {
    return allGames
      .filter(g => (g.tags || []).includes('Detective') || (g.detective || 0) >= 3 || (g.difficulty || '') === 'ยาก' || (g.difficulty || '') === 'ยากมาก')
      .sort((a, b) => (b.detective || 0) - (a.detective || 0));
  }, [allGames]);

  const dramaGames = useMemo(() => {
    return allGames
      .filter(g => (g.tags || []).includes('Drama'))
      .sort((a, b) => {
        const pA = getGamePlayerCount(a);
        const pB = getGamePlayerCount(b);
        if (pB !== pA) return pB - pA;
        return (b.roleplay || 0) - (a.roleplay || 0);
      });
  }, [allGames]);

  /* Hero slideshow timer */
  useEffect(() => {
    const len = heroFeaturedGames.length;
    if (len <= 1) return;
    const timer = setInterval(() => {
      setHeroVisible(false);
      setTimeout(() => {
        setHeroIdx(prev => (prev + 1) % len);
        setHeroVisible(true);
      }, 600);
    }, 4500);
    return () => clearInterval(timer);
  }, [heroFeaturedGames.length]);

  /* Scroll reveal */
  useEffect(() => {
    const els = document.querySelectorAll('.mm-reveal, .mm-reveal-l, .mm-reveal-r, .mm-reveal-s');
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('mm-in'); obs.unobserve(e.target); }
      }),
      { threshold: 0.06, rootMargin: '0px 0px -48px 0px' }
    );
    els.forEach(el => obs.observe(el));
    const fallback = setTimeout(() => els.forEach(el => el.classList.add('mm-in')), 600);
    return () => { obs.disconnect(); clearTimeout(fallback); };
  }, [allGames.length]);

  const joinParty = async (party, e) => {
    e.stopPropagation();
    if (!lineUser) { showPage('party'); return; }
    const alreadyIn = (party.members || []).some(m => m.uid === lineUser.uid);
    const pending   = (party.pendingRequests || []).some(r => r.uid === lineUser.uid);
    if (alreadyIn || pending || (party.members?.length || 0) >= party.maxPlayers) return;
    try {
      await updateDoc(doc(db, 'parties', party.id), {
        pendingRequests: arrayUnion({ uid: lineUser.uid, name: lineUser.name, avatar: lineUser.avatar || '', requestedAt: new Date().toISOString() })
      });
    } catch (err) { console.error(err); }
  };

  const openParties  = allParties.filter(p => p.status !== 'closed' && (p.members?.length || 0) < p.maxPlayers).slice(0, 4);
  const displayGames  = allGames.length > 0 ? allGames : PLACEHOLDER;
  const scriptCount   = allGames.length || 48;
  const HERO_EXCLUDED = ['1QylfkWZJKgbA_aodUnYu23pQxupJfAQK', '1Kpod9FnDg-sPVGvi-BskoMqACcbMaB7t'];
  const slidableGames = displayGames.filter(g => {
    const url = g.image || g.coverUrl;
    return url && !HERO_EXCLUDED.some(id => url.includes(id));
  });
  const heroSlide     = heroIdx % Math.max(heroFeaturedGames.length, 1);
  const heroGame      = heroFeaturedGames[heroSlide] || heroFeaturedGames[0];
  const heroCustomCover = heroGame ? promoSettings?.customCovers?.[heroGame.id] : null;
  const heroImg       = heroGame ? convertImageUrl(heroCustomCover || heroGame.image || heroGame.coverUrl, 900) : null;
  const tickerGames   = displayGames.map(g => g.title).filter(Boolean);
  const tickerDur     = Math.max(30, tickerGames.length * 2.5);
  const heroCovers    = heroFeaturedGames.map(g => {
    const custom = promoSettings?.customCovers?.[g.id];
    return convertImageUrl(custom || g.image || g.coverUrl, 400);
  });
  const scatterCovers = slidableGames.map(g => convertImageUrl(g.image || g.coverUrl, 200));

  return (
    <div ref={revealRoot} role="main" style={{ fontFamily: "'Sarabun', sans-serif", background: BG_PAGE, color: TEXT_MAIN, paddingTop: 60, overflowX: 'hidden' }}>

      <style>{`
        @keyframes mmTicker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes mmFadeUp { from{opacity:0;transform:translateY(32px);filter:blur(6px)} to{opacity:1;transform:translateY(0);filter:blur(0)} }
        @keyframes mmFadeL  { from{opacity:0;transform:translateX(-28px);filter:blur(6px)} to{opacity:1;transform:translateX(0);filter:blur(0)} }
        @keyframes mmFadeR  { from{opacity:0;transform:translateX(28px);filter:blur(6px)} to{opacity:1;transform:translateX(0);filter:blur(0)} }
        @keyframes mmPulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(0.8)} }
        @keyframes mmPing   { 0%{opacity:0.9;transform:scale(1)} 100%{opacity:0;transform:scale(3)} }
        @keyframes mmFloatA { 0%,100%{transform:translateY(0px) rotate(4deg)}   50%{transform:translateY(-14px) rotate(4deg)} }
        @keyframes mmFloatB { 0%,100%{transform:translateY(0px) rotate(-3deg)}  50%{transform:translateY(-9px)  rotate(-3deg)} }
        @keyframes mmFloatC { 0%,100%{transform:translateY(0px) rotate(1.5deg)} 50%{transform:translateY(-6px)  rotate(1.5deg)} }
        @keyframes mmFloatD { 0%,100%{transform:translateY(0px) rotate(-6deg)}  50%{transform:translateY(-11px) rotate(-6deg)} }
        @keyframes mmFloatE { 0%,100%{transform:translateY(0px) rotate(7deg)}   50%{transform:translateY(-8px)  rotate(7deg)} }
        @keyframes mmFloatF { 0%,100%{transform:translateY(0px) rotate(-2deg)}  50%{transform:translateY(-13px) rotate(-2deg)} }
        @keyframes mmFloatG { 0%,100%{transform:translateY(0px) rotate(5deg)}   50%{transform:translateY(-7px)  rotate(5deg)} }
        @keyframes mmFloatH { 0%,100%{transform:translateY(0px) rotate(-5deg)}  50%{transform:translateY(-10px) rotate(-5deg)} }

        @keyframes mmMainFloat {
          0%,100%{ transform:translateY(0px) rotate(0deg) scale(1) }
          35%    { transform:translateY(-20px) rotate(.7deg) scale(1.018) }
          65%    { transform:translateY(-9px) rotate(-.4deg) scale(1.008) }
        }

        @keyframes mmPillFloat {
          0%, 100% { transform: translate(calc(-50% + clamp(120px,13vw,200px)), calc(-50% + clamp(160px,20vw,280px))) translateY(0) scale(1); }
          50% { transform: translate(calc(-50% + clamp(120px,13vw,200px)), calc(-50% + clamp(160px,20vw,280px))) translateY(-9px) scale(1.025); }
        }

        @keyframes mmSnip {
          0%, 100% { transform: rotate(90deg) scale(1); }
          50% { transform: rotate(68deg) scale(1.2); color: var(--crimson-400); }
        }

        .mm-r1{animation:mmFadeUp .82s cubic-bezier(.16,1,.3,1) .06s both}
        .mm-r2{animation:mmFadeUp .82s cubic-bezier(.16,1,.3,1) .16s both}
        .mm-r3{animation:mmFadeUp .82s cubic-bezier(.16,1,.3,1) .28s both}
        .mm-r4{animation:mmFadeUp .82s cubic-bezier(.16,1,.3,1) .40s both}
        .mm-r5{animation:mmFadeL  .82s cubic-bezier(.16,1,.3,1) .18s both}

        .mm-reveal   {opacity:0;transform:translateY(32px);filter:blur(6px);transition:opacity .85s cubic-bezier(.16,1,.3,1),transform .85s cubic-bezier(.16,1,.3,1),filter .85s cubic-bezier(.16,1,.3,1)}
        .mm-reveal-l {opacity:0;transform:translateX(-32px);filter:blur(6px);transition:opacity .85s cubic-bezier(.16,1,.3,1),transform .85s cubic-bezier(.16,1,.3,1),filter .85s cubic-bezier(.16,1,.3,1)}
        .mm-reveal-r {opacity:0;transform:translateX(32px);filter:blur(6px);transition:opacity .85s cubic-bezier(.16,1,.3,1),transform .85s cubic-bezier(.16,1,.3,1),filter .85s cubic-bezier(.16,1,.3,1)}
        .mm-reveal-s {opacity:0;transform:scale(.94);filter:blur(6px);transition:opacity .85s cubic-bezier(.16,1,.3,1),transform .85s cubic-bezier(.16,1,.3,1),filter .85s cubic-bezier(.16,1,.3,1)}
        .mm-reveal.mm-in,.mm-reveal-l.mm-in,.mm-reveal-r.mm-in,.mm-reveal-s.mm-in{opacity:1;transform:none;filter:blur(0)}
        .mm-d1{transition-delay:.05s!important}.mm-d2{transition-delay:.10s!important}
        .mm-d3{transition-delay:.16s!important}.mm-d4{transition-delay:.22s!important}
        .mm-d5{transition-delay:.28s!important}.mm-d6{transition-delay:.34s!important}

        .mm-btn-pri{transition:background .25s ease,transform .25s cubic-bezier(.16,1,.3,1),box-shadow .25s cubic-bezier(.16,1,.3,1)!important}
        .mm-btn-pri:hover{background:${C_DEEP}!important;transform:translateY(-3px) scale(1.015)!important;box-shadow:0 18px 48px rgba(198,36,25,.55),0 0 24px rgba(198,36,25,.3)!important}
        .mm-btn-pri:active{transform:translateY(0) scale(0.98)!important}
        .mm-btn-pri:hover i.fa-arrow-right{transform:translateX(4px);transition:transform .22s ease}

        .mm-btn-gho{transition:border-color .25s,color .25s,transform .25s cubic-bezier(.16,1,.3,1),box-shadow .25s!important}
        .mm-btn-gho:hover{border-color:${C}!important;color:${C}!important;transform:translateY(-2px)!important;box-shadow:0 8px 24px rgba(198,36,25,.14)!important}
        .mm-btn-gho:active{transform:scale(0.98)!important}

        .mm-step-card{transition:transform .4s cubic-bezier(.16,1,.3,1),box-shadow .4s ease!important;border-radius:14px;background:#ffffff}
        .mm-step-card:hover{transform:translateY(-6px)!important;box-shadow:0 16px 36px rgba(0,0,0,0.08)!important}
        .mm-step-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(70px,10vw,110px);line-height:.8;letter-spacing:-.04em;color:rgba(0,0,0,.04);pointer-events:none;user-select:none}

        .mm-stat-box{transition:transform .35s cubic-bezier(.16,1,.3,1)!important}
        .mm-stat-box:hover{transform:translateY(-4px)!important}

        .mm-party-card{transition:transform .35s cubic-bezier(.16,1,.3,1),box-shadow .35s ease!important}
        .mm-party-card:hover{transform:translateY(-4px)!important;box-shadow:0 12px 28px rgba(0,0,0,0.07)!important}

        .mm-story-card{transition:transform .35s cubic-bezier(.16,1,.3,1),box-shadow .35s ease!important}
        .mm-story-card:hover{transform:translateY(-5px)!important;box-shadow:0 14px 30px rgba(0,0,0,0.06)!important}

        .mm-cover{transition:box-shadow .38s,transform .38s!important}
        .mm-cover:hover{box-shadow:0 36px 72px rgba(0,0,0,.32)!important;filter:brightness(1.06)!important}
        .mm-cover-main{
          transition:box-shadow .38s,filter .38s!important;
          animation:mmMainFloat 7.5s ease-in-out infinite;
          transform-origin:center bottom;
        }
        .mm-cover-main:hover{box-shadow:0 64px 120px rgba(0,0,0,.42),0 0 50px rgba(198,36,25,.3)!important;filter:brightness(1.07)!important;animation-play-state:paused!important}
        .mm-hero-pill{animation:mmPillFloat 4.6s ease-in-out infinite}

        .mm-fa{animation:mmFloatA 5.2s ease-in-out infinite}
        .mm-fb{animation:mmFloatB 6.8s ease-in-out infinite}
        .mm-fc{animation:mmFloatC 7.6s ease-in-out infinite}
        .mm-fd{animation:mmFloatD 4.9s ease-in-out infinite}
        .mm-fe{animation:mmFloatE 6.1s ease-in-out infinite}
        .mm-ff{animation:mmFloatF 8.2s ease-in-out infinite}
        .mm-fg{animation:mmFloatG 5.7s ease-in-out infinite}
        .mm-fh{animation:mmFloatH 7.1s ease-in-out infinite}

        .mm-hero-text{width:min(52%,700px);padding:clamp(56px,7vw,96px) clamp(36px,5vw,80px) clamp(64px,8vw,96px)}

        /* Modern Promotion Showcase Banner (Minimal Image Only) */
        .sofun-promo-card {
          position: relative;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.04);
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease;
          cursor: pointer;
          display: block;
          width: 100%;
        }
        .sofun-promo-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.09);
        }
        .sofun-promo-banner-wrap {
          width: 100%;
          position: relative;
          overflow: hidden;
          background: #f8fafc;
          display: block;
        }
        .sofun-promo-banner-img {
          width: 100%;
          height: auto;
          display: block;
          object-fit: cover;
          transition: transform 0.5s ease;
        }
        .sofun-promo-card:hover .sofun-promo-banner-img {
          transform: scale(1.012);
        }

        @media(max-width: 899px) {
          .sofun-promo-card { border-radius: 16px; }
          .mm-scatter-r,.mm-hero-main,.mm-hero-pill,.mm-hero-dots{display:none!important}
        }

        @media(min-width:640px) and (max-width:899px){
          .mm-hero-text{width:100%;padding:clamp(48px,7vw,72px) clamp(28px,5vw,56px) clamp(56px,7vw,80px)}
          .mm-hero-cats{justify-content:flex-start!important}
        }
        .mm-mobile-only{display:none!important}
        @media(max-width:639px){
          .mm-hero-text{width:100%;padding:clamp(36px,8vw,56px) 20px clamp(48px,8vw,64px)}
          .mm-hero-cats{justify-content:center!important}
          .mm-phone-r{display:none!important}
          .mm-mobile-only{display:block!important}
        }
        @media(min-width:900px) and (max-width:1199px){
          .mm-cover:not(.mm-cover-main){ max-width:48px!important }
        }

        /* Mobile adjustments for swimlanes */
        @media(max-width: 768px) {
          .netflix-home-card {
            width: 145px !important;
            min-width: 145px !important;
            height: 220px !important;
          }
          .netflix-home-card-actions {
            opacity: 1 !important;
            max-height: 36px !important;
            transform: none !important;
          }
          .netflix-home-scroll-arrow {
            display: none !important;
          }
        }
      `}</style>

      {/* ══════════════════════════════════════════
          1. HERO (KEPT EXACTLY 100% UNTOUCHED)
      ══════════════════════════════════════════ */}
      <section style={{ background: '#fff', position: 'relative', overflow: 'hidden', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>

        {/* ── dot grid ── */}
        <div aria-hidden style={{ position:'absolute', inset:0, backgroundImage:`radial-gradient(circle, rgba(198,36,25,.055) 1px, transparent 1px)`, backgroundSize:'24px 24px', zIndex:0, pointerEvents:'none' }} />

        {/* ── MOBILE-ONLY scatter covers — hidden on ≥640px ── */}
        {scatterCovers.length > 0 && [
          { top:'2%',  left:'62%', w:34, op:.22, cls:'mm-fa', delay:'0s'   },
          { top:'10%', right:'3%', w:30, op:.20, cls:'mm-fc', delay:'0.7s' },
          { top:'24%', left:'74%', w:38, op:.24, cls:'mm-fe', delay:'1.4s' },
          { top:'36%', right:'5%', w:32, op:.21, cls:'mm-fb', delay:'2.0s' },
          { top:'50%', left:'66%', w:36, op:.25, cls:'mm-fg', delay:'0.4s' },
          { top:'62%', right:'4%', w:34, op:.22, cls:'mm-fd', delay:'1.1s' },
          { top:'75%', left:'70%', w:30, op:.20, cls:'mm-fh', delay:'1.8s' },
          { top:'86%', right:'3%', w:36, op:.23, cls:'mm-fc', delay:'0.6s' },
        ].map(({ top, left, right, w, op, cls, delay }, j) => (
          <div key={`mob-${j}`} aria-hidden className={`mm-cover ${cls} mm-mobile-only`} style={{
            position:'absolute', top, ...(left ? { left } : { right }),
            width:w, aspectRatio:'2/3',
            borderRadius:8, overflow:'hidden',
            boxShadow:'0 6px 16px rgba(0,0,0,.12)',
            border:'1.5px solid rgba(255,255,255,.6)',
            zIndex:1, opacity:op, pointerEvents:'none',
            animationDelay: delay,
          }}>
            <img src={scatterCovers[j % scatterCovers.length]} alt="" aria-hidden loading="lazy" decoding="async" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'brightness(.84)' }} />
          </div>
        ))}

        {/* ══ SCATTER CARDS — full-section canvas ══ */}
        {[
          /* ── ZONE 1: FAR LEFT EDGE (0–6%) — whisper texture ── */
          { idx:0, cls:'mm-fa', top:'4%',  left:'0.5%', w:36, zi:1, op:.15, delay:'0s'    },
          { idx:1, cls:'mm-fb', top:'16%', left:'1%',   w:34, zi:1, op:.17, delay:'0.8s'  },
          { idx:2, cls:'mm-fc', top:'28%', left:'0%',   w:40, zi:1, op:.16, delay:'1.5s'  },
          { idx:3, cls:'mm-fd', top:'41%', left:'1.5%', w:36, zi:1, op:.14, delay:'2.3s'  },
          { idx:4, cls:'mm-fe', top:'53%', left:'0.5%', w:38, zi:1, op:.17, delay:'0.4s'  },
          { idx:5, cls:'mm-ff', top:'65%', left:'1%',   w:34, zi:1, op:.15, delay:'1.1s'  },
          { idx:6, cls:'mm-fg', top:'77%', left:'0%',   w:38, zi:1, op:.16, delay:'1.8s'  },
          { idx:7, cls:'mm-fh', top:'89%', left:'1.5%', w:34, zi:1, op:.14, delay:'0.6s'  },
          /* ── ZONE 2: LEFT (7–16%) ── */
          { idx:8, cls:'mm-fa', top:'8%',  left:'7%',   w:44, zi:1, op:.20, delay:'0.3s'  },
          { idx:0, cls:'mm-fb', top:'20%', left:'9%',   w:46, zi:1, op:.22, delay:'1.2s'  },
          { idx:1, cls:'mm-fc', top:'33%', left:'8%',   w:44, zi:1, op:.21, delay:'2.0s'  },
          { idx:2, cls:'mm-fd', top:'46%', left:'10%',  w:48, zi:1, op:.23, delay:'0.7s'  },
          { idx:3, cls:'mm-fe', top:'59%', left:'7.5%', w:44, zi:1, op:.20, delay:'1.6s'  },
          { idx:4, cls:'mm-ff', top:'72%', left:'9%',   w:44, zi:1, op:.21, delay:'2.4s'  },
          { idx:5, cls:'mm-fg', top:'87%', left:'8%',   w:40, zi:1, op:.19, delay:'0.9s'  },
          /* ── ZONE 3: CENTER-LEFT (16–29%) ── */
          { idx:6, cls:'mm-fh', top:'5%',  left:'16%',  w:48, zi:1, op:.25, delay:'0.5s',  hide:true },
          { idx:7, cls:'mm-fa', top:'18%', left:'18%',  w:52, zi:1, op:.27, delay:'1.3s',  hide:true },
          { idx:8, cls:'mm-fb', top:'31%', left:'20%',  w:50, zi:1, op:.26, delay:'2.1s',  hide:true },
          { idx:0, cls:'mm-fc', top:'44%', left:'17%',  w:54, zi:1, op:.28, delay:'0.9s',  hide:true },
          { idx:1, cls:'mm-fd', top:'57%', left:'22%',  w:48, zi:1, op:.25, delay:'1.7s',  hide:true },
          { idx:2, cls:'mm-fe', top:'70%', left:'19%',  w:46, zi:1, op:.23, delay:'0.2s',  hide:true },
          { idx:3, cls:'mm-ff', top:'84%', left:'21%',  w:50, zi:1, op:.24, delay:'2.5s',  hide:true },
          /* ── ZONE 4A: NEAR-CENTER (28–43%) ── */
          { idx:4, cls:'mm-fg', top:'7%',  left:'30%',  w:54, zi:1, op:.29, delay:'0.4s',  hide:true },
          { idx:5, cls:'mm-fh', top:'20%', left:'33%',  w:58, zi:1, op:.31, delay:'1.2s',  hide:true },
          { idx:6, cls:'mm-fa', top:'33%', left:'28%',  w:52, zi:1, op:.30, delay:'2.0s',  hide:true },
          { idx:7, cls:'mm-fb', top:'46%', left:'32%',  w:56, zi:1, op:.32, delay:'0.8s',  hide:true },
          { idx:8, cls:'mm-fc', top:'59%', left:'29%',  w:54, zi:1, op:.29, delay:'1.6s',  hide:true },
          { idx:0, cls:'mm-fd', top:'72%', left:'34%',  w:50, zi:1, op:.27, delay:'2.4s',  hide:true },
          { idx:1, cls:'mm-fe', top:'86%', left:'31%',  w:48, zi:1, op:.26, delay:'1.0s',  hide:true },
          /* ── ZONE 4B: NEAR-CENTER (38–49%) — growing density ── */
          { idx:2, cls:'mm-ff', top:'9%',  left:'40%',  w:60, zi:1, op:.37, delay:'0.6s',  hide:true },
          { idx:3, cls:'mm-fg', top:'23%', left:'42%',  w:56, zi:1, op:.35, delay:'1.4s',  hide:true },
          { idx:4, cls:'mm-fh', top:'38%', left:'38%',  w:60, zi:1, op:.39, delay:'2.2s',  hide:true },
          { idx:5, cls:'mm-fa', top:'53%', left:'41%',  w:56, zi:1, op:.37, delay:'0.5s',  hide:true },
          { idx:6, cls:'mm-fb', top:'68%', left:'39%',  w:54, zi:1, op:.35, delay:'1.8s',  hide:true },
          { idx:7, cls:'mm-fc', top:'83%', left:'43%',  w:52, zi:1, op:.33, delay:'0.3s',  hide:true },
          { idx:8, cls:'mm-fd', top:'4%',  left:'47%',  w:62, zi:1, op:.43, delay:'1.6s',  hide:true },
          { idx:0, cls:'mm-fe', top:'29%', left:'46%',  w:60, zi:1, op:.40, delay:'2.4s',  hide:true },
          { idx:1, cls:'mm-ff', top:'54%', left:'48%',  w:58, zi:1, op:.42, delay:'1.0s',  hide:true },
          { idx:2, cls:'mm-fg', top:'78%', left:'47%',  w:56, zi:1, op:.38, delay:'0.7s',  hide:true },
          /* ── ZONE 5: FAR RIGHT (right 0–1%) — peeking from edge ── */
          { idx:3, cls:'mm-fh', top:'5%',  right:'1%',  w:54, zi:4, op:.70, delay:'0.3s',  hide:true },
          { idx:4, cls:'mm-fa', top:'18%', right:'0.5%',w:50, zi:4, op:.66, delay:'1.1s',  hide:true },
          { idx:5, cls:'mm-fb', top:'32%', right:'1%',  w:58, zi:4, op:.72, delay:'1.9s',  hide:true },
          { idx:6, cls:'mm-fc', top:'46%', right:'0.5%',w:52, zi:4, op:.68, delay:'0.5s',  hide:true },
          { idx:7, cls:'mm-fd', top:'60%', right:'1%',  w:56, zi:4, op:.70, delay:'2.3s',  hide:true },
          { idx:8, cls:'mm-fe', top:'74%', right:'0.5%',w:48, zi:4, op:.64, delay:'1.5s',  hide:true },
          { idx:0, cls:'mm-ff', top:'87%', right:'1%',  w:50, zi:4, op:.62, delay:'0.9s',  hide:true },
          /* ── ZONE 6: AROUND THE MAIN COVER — fills empty band ── */
          { idx:1, cls:'mm-fb', top:'1%',  left:'55%', w:46, zi:4, op:.52, delay:'0.4s',  hide:true },
          { idx:2, cls:'mm-fd', top:'2%',  left:'64%', w:60, zi:4, op:.62, delay:'1.1s',  hide:true },
          { idx:3, cls:'mm-fg', top:'1%',  left:'74%', w:54, zi:4, op:.58, delay:'1.8s',  hide:true },
          { idx:4, cls:'mm-fa', top:'3%',  left:'83%', w:48, zi:4, op:.54, delay:'0.7s',  hide:true },
          { idx:5, cls:'mm-fc', top:'90%', left:'55%', w:48, zi:4, op:.52, delay:'2.1s',  hide:true },
          { idx:6, cls:'mm-fe', top:'89%', left:'64%', w:58, zi:4, op:.60, delay:'1.4s',  hide:true },
          { idx:7, cls:'mm-fh', top:'91%', left:'74%', w:52, zi:4, op:.56, delay:'0.5s',  hide:true },
          { idx:8, cls:'mm-fb', top:'89%', left:'83%', w:46, zi:4, op:.52, delay:'2.3s',  hide:true },
          { idx:0, cls:'mm-fc', top:'16%', left:'88%', w:50, zi:4, op:.62, delay:'0.3s',  hide:true },
          { idx:1, cls:'mm-fe', top:'31%', left:'90%', w:56, zi:4, op:.66, delay:'1.0s',  hide:true },
          { idx:2, cls:'mm-fg', top:'46%', left:'88%', w:60, zi:4, op:.70, delay:'1.7s',  hide:true },
          { idx:3, cls:'mm-fa', top:'61%', left:'90%', w:54, zi:4, op:.64, delay:'0.8s',  hide:true },
          { idx:4, cls:'mm-fh', top:'75%', left:'88%', w:50, zi:4, op:.60, delay:'2.0s',  hide:true },
          { idx:5, cls:'mm-fd', top:'18%', left:'51%', w:54, zi:4, op:.48, delay:'1.3s',  hide:true },
          { idx:6, cls:'mm-fb', top:'43%', left:'52%', w:58, zi:4, op:.52, delay:'0.6s',  hide:true },
          { idx:7, cls:'mm-fc', top:'67%', left:'51%', w:50, zi:4, op:.48, delay:'1.9s',  hide:true },
        ].map(({ idx: _idx, cls, w, zi, op, hide, delay, ...pos }, i) => {
          const src = scatterCovers.length > 0 ? scatterCovers[i % scatterCovers.length] : null;
          const ph = ['#ebebeb','#e8e8e8','#eeeeee','#e6e6e6','#ededed','#e9e9e9','#ececec','#eaeaea'][i % 8];
          const phoneHide = !hide && (i >= 8 || i % 2 === 1);
          return (
            <div key={i} aria-hidden className={`mm-cover ${cls}${hide ? ' mm-scatter-r' : ''}${phoneHide ? ' mm-phone-r' : ''}`} style={{
              position:'absolute', ...pos,
              width:w, aspectRatio:'2/3',
              borderRadius:10, overflow:'hidden',
              boxShadow: zi === 1 ? '0 8px 20px rgba(0,0,0,.12)' : '0 16px 40px rgba(0,0,0,.24)',
              border: zi === 1 ? '2px solid rgba(255,255,255,.68)' : '2.5px solid rgba(255,255,255,.92)',
              zIndex:zi, opacity:op, pointerEvents:'none',
              animationDelay: delay ?? '0s',
            }}>
              {src
                ? <img src={src} alt="" aria-hidden loading="lazy" decoding="async" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'brightness(.84)' }} />
                : <div style={{ width:'100%', height:'100%', background:ph }} />
              }
            </div>
          );
        })}

        {/* ══ MAIN FEATURED CARD ══ */}
        {(() => {
          return (
            <div className="mm-hero-main" style={{
              position:'absolute', top:'50%', left:'71%',
              transform:'translate(-50%, -50%)',
              zIndex:5,
            }}>
              <div
                className="mm-cover-main"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (heroGame?.id && showDetail) {
                    showDetail(heroGame.id);
                  } else if (showPage) {
                    showPage('games');
                  }
                }}
                style={{
                  width:'clamp(300px,34vw,480px)', aspectRatio:'2/3',
                  borderRadius:22, overflow:'hidden',
                  boxShadow:'0 100px 200px rgba(0,0,0,.50), 0 0 0 7px #fff',
                  cursor: heroGame?.id ? 'pointer' : 'default',
                }}
              >
                {heroImg
                  ? <img src={heroImg} alt="" aria-hidden fetchpriority="high" decoding="async" style={{ width:'100%', height:'100%', objectFit:'cover', opacity: heroVisible ? 1 : 0, transition:'opacity .65s ease' }} />
                  : <div style={{ width:'100%', height:'100%', background:'linear-gradient(145deg,#1a1a2e,#0f3460)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <i className="fas fa-user-secret" style={{ fontSize:80, color:'rgba(255,255,255,.12)' }} />
                    </div>
                }
                <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'linear-gradient(to top,rgba(0,0,0,.95),transparent)', padding:'32px 18px 18px' }}>
                  <div style={{ fontSize:8, fontWeight:800, letterSpacing:'0.26em', textTransform:'uppercase', color:C, marginBottom:5 }}>NOW SHOWING</div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#fff', lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {heroGame?.title || 'Script Murder'}
                  </div>
                </div>
                <div style={{ position:'absolute', top:14, right:14, background:C, color:'#fff', borderRadius:6, padding:'5px 10px', fontSize:9.5, fontWeight:800, letterSpacing:'0.12em', textTransform:'uppercase', boxShadow:'0 4px 14px rgba(198,36,25,.55)' }}>
                  FEATURED
                </div>
              </div>
            </div>
          );
        })()}

        {/* Crimson stat pill */}
        <div className="mm-hero-pill" style={{
          position:'absolute', top:'50%', left:'71%',
          transform:'translate(calc(-50% + clamp(120px,13vw,200px)), calc(-50% + clamp(160px,20vw,280px)))',
          background:C, color:'#fff', padding:'11px 18px', borderRadius:10,
          boxShadow:'0 16px 40px rgba(198,36,25,.45)', zIndex:6, textAlign:'center'
        }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, lineHeight:1, letterSpacing:'0.06em' }}>NEW</div>
          <div style={{ fontFamily:"'Sarabun',sans-serif", fontSize:9, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', opacity:.9, marginTop:3 }}>เกมใหม่</div>
        </div>

        {/* Slide dots */}
        {heroCovers.length > 1 && (
          <div className="mm-hero-dots" style={{ position:'absolute', bottom:'7%', left:'71%', transform:'translateX(-50%)', display:'flex', gap:6, zIndex:6 }}>
            {heroCovers.map((_, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setHeroVisible(false);
                  setTimeout(() => {
                    setHeroIdx(i);
                    setHeroVisible(true);
                  }, 200);
                }}
                style={{
                  width:20, height:6, borderRadius:3,
                  cursor:'pointer',
                  background: i === heroSlide ? C : 'rgba(0,0,0,.18)',
                  transform:`scaleX(${i === heroSlide ? 1 : 0.3})`,
                  transformOrigin:'center', transition:'transform .4s, background .4s'
                }}
              />
            ))}
          </div>
        )}

        {/* ── UNIFIED TEXT BLOCK ── */}
        <div className="mm-hero-text" style={{ position: 'relative', zIndex: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

            {/* Headline */}
            <h1 className="mm-r2" style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(76px,12vw,160px)',
              lineHeight: 0.84, letterSpacing: '-0.02em',
              textTransform: 'uppercase', color: '#111', margin: 0,
            }}>
              Script<br />
              <span style={{ color: C }}>Murder</span><br />
              Thailand
            </h1>

            {/* Description */}
            <p className="mm-r3" style={{
              fontSize: 'clamp(13px,1.3vw,15.5px)', lineHeight: 1.85,
              color: '#666', maxWidth: '48ch', margin: '24px 0 32px',
              textWrap: 'pretty', wordBreak: 'normal',
            }}>
              <strong>Sofun Club (Sofun Club Thailand)</strong> แพลตฟอร์มและสตูดิโอเกม <strong>Script Murder</strong> แห่งแรกในประเทศไทย พร้อมมอบประสบการณ์สืบสวนสวมบทบาท (Role-Playing) ระดับพรีเมียม สัมผัสความสนุกรูปแบบใหม่และร่วมไขปริศนาคดีฆาตกรรมไปกับตัวละครที่คุณเลือกเอง ที่&nbsp;<strong>Sofun</strong> เราคัดสรรสคริปต์เกมคุณภาพกว่า&nbsp;{scriptCount}&nbsp;เรื่อง พร้อม Game&nbsp;Master และห้องเล่นธีมเสมือนจริงใจกลาง&nbsp;RCA
            </p>

            {/* CTAs */}
            <div className="mm-r4" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="mm-btn-pri" onClick={() => showPage('games')} style={{
                background: C, color: '#fff', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
                fontFamily: "'Sarabun',sans-serif", padding: '16px 44px', borderRadius: 6,
                boxShadow: '0 8px 36px rgba(198,36,25,.38)',
              }}>
                {t('home','viewScripts')}
              </button>
              <button className="mm-btn-gho" onClick={() => showPage('party')} style={{
                background: 'transparent', color: '#444', border: '1.5px solid rgba(0,0,0,.2)',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', fontFamily: "'Sarabun',sans-serif",
                padding: '16px 32px', borderRadius: 6,
              }}>
                {t('home','findParty')}
              </button>
            </div>

            {/* Quick category nav */}
            <div className="mm-hero-cats mm-r4" style={{ display: 'flex', gap: 0, marginTop: 36, paddingTop: 24, borderTop: '1px solid rgba(0,0,0,.07)' }}>
              {[
                { label: t('home','heroBeginner'), sub: t('home','heroBeginnerSub'), icon: 'fas fa-star',    page: 'games' },
                { label: t('home','heroAdvanced'),  sub: t('home','heroAdvancedSub'),  icon: 'fas fa-search',  page: 'games' },
                { label: t('nav','party'),  sub: t('home','heroPartySub'), icon: 'fas fa-users',  page: 'party' },
              ].map((cat, i) => (
                <button key={i} onClick={() => showPage(cat.page)} style={{
                  flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left', padding: '10px 16px 10px 0',
                  borderRight: i < 2 ? '1px solid rgba(0,0,0,.07)' : 'none',
                  marginRight: i < 2 ? 16 : 0,
                }}
                  onMouseEnter={e => e.currentTarget.querySelector('.catlb').style.color = C}
                  onMouseLeave={e => e.currentTarget.querySelector('.catlb').style.color = '#111'}
                >
                  <i className={cat.icon} style={{ fontSize: 10, color: C, display: 'block', marginBottom: 5 }} />
                  <div className="catlb" style={{ fontSize: 12, fontWeight: 700, color: '#111', transition: 'color .2s' }}>{cat.label}</div>
                  <div style={{ fontSize: 9.5, color: '#bbb', marginTop: 2 }}>{cat.sub}</div>
                </button>
              ))}
            </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          2. TICKER (KEPT EXACTLY 100% UNTOUCHED)
      ══════════════════════════════════════════ */}
      <div style={{ background: C, overflow: 'hidden', padding: '11px 0', whiteSpace: 'nowrap', position: 'relative', zIndex: 10 }}>
        <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 72, background: `linear-gradient(to right,${C},transparent)`, zIndex: 1, pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 72, background: `linear-gradient(to left,${C},transparent)`, zIndex: 1, pointerEvents: 'none' }} />
        <div style={{ display: 'inline-block', animation: `mmTicker ${tickerDur}s linear infinite` }}>
          {[0, 1].map(pass => (
            <span key={pass} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {tickerGames.map((title, i) => (
                <React.Fragment key={i}>
                  <span style={{ fontFamily: "'Sarabun',sans-serif", fontWeight: 800, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fff', padding: '0 28px', whiteSpace: 'nowrap' }}>
                    {title}
                  </span>
                  <span aria-hidden style={{ opacity: 0.4, fontSize: 5, color: '#fff' }}>[#]</span>
                </React.Fragment>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          3. NETFLIX SWIMLANES CATALOG (WHITE THEME)
      ══════════════════════════════════════════ */}
      <section style={{ background: BG_PAGE, padding: 'clamp(56px,7vw,84px) 0 40px' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>

          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 clamp(16px, 4vw, 40px)', marginBottom: 28, flexWrap: 'wrap', gap: 14 }}>
            <div className="mm-reveal-l">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ background: NETFLIX_RED, color: '#fff', fontSize: 9.5, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4 }}>
                  NETFLIX SELECTION
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_MUTED }}>
                  คัดสรรเรื่องราวยอดนิยมประจำสัปดาห์
                </span>
              </div>
              <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(38px,5.5vw,68px)', lineHeight: 0.9, textTransform: 'uppercase', color: TEXT_MAIN, margin: 0 }}>
                {t('home','catalogHeading')}
              </h2>
            </div>
            <div className="mm-reveal-r">
              <button
                className="mm-btn-gho"
                onClick={() => showPage('games')}
                style={{
                  background: 'transparent',
                  color: TEXT_MAIN,
                  border: `1.5px solid ${BORDER_CLR}`,
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  padding: '12px 24px',
                  borderRadius: 8,
                }}
              >
                ดูสคริปต์ทั้งหมด {scriptCount}+ เรื่อง &gt;
              </button>
            </div>
          </div>

          {/* Swimlane 1: Trending Now */}
          <HomeNetflixSwimlaneRow
            title="กำลังมาแรงติดเทรนด์"
            subtitle="สคริปต์ที่มีการเล่นล่าสุดที่หน้าร้าน"
            games={trendingGames}
            showDetail={showDetail}
            showPage={showPage}
            playedIds={playedIds}
            onSeeAll={() => showPage('games')}
          />

          {/* Swimlane 2: New Releases */}
          <HomeNetflixSwimlaneRow
            title="เกมเข้าใหม่ล่าสุด"
            subtitle="สคริปต์พรีเมียมลิขสิทธิ์เรื่องใหม่"
            games={sortedNewestGames}
            showDetail={showDetail}
            showPage={showPage}
            playedIds={playedIds}
            onSeeAll={() => showPage('games')}
          />

          {/* Swimlane 3: Beginner Friendly */}
          <HomeNetflixSwimlaneRow
            title="เหมาะสำหรับมือใหม่"
            subtitle="สืบสวนและสวมบทบาทเริ่มต้น เล่นง่าย ไม่กดดัน"
            games={beginnerGames}
            showDetail={showDetail}
            showPage={showPage}
            playedIds={playedIds}
            onSeeAll={() => showPage('games')}
          />

          {/* Swimlane 4: Detective & Hardcore Mystery */}
          <HomeNetflixSwimlaneRow
            title="สืบสวนเข้มข้น ปริศนาท้าทาย"
            subtitle="เกมระดับสืบหลายดาว ปริศนาซับซ้อนหักมุม"
            games={detectiveGames}
            showDetail={showDetail}
            showPage={showPage}
            playedIds={playedIds}
            onSeeAll={() => showPage('games')}
          />

          {/* Swimlane 5: Roleplay & Drama */}
          <HomeNetflixSwimlaneRow
            title="สวมบทบาท ดราม่าอารมณ์"
            subtitle="สคริปต์แนวละครดราม่าเข้มข้น"
            games={dramaGames}
            showDetail={showDetail}
            showPage={showPage}
            playedIds={playedIds}
            onSeeAll={() => showPage('games')}
          />

          {/* Catalog Footer Link */}
          <div className="mm-reveal" style={{ textAlign: 'center', marginTop: 32, padding: '0 20px' }}>
            <button
              className="mm-btn-pri"
              onClick={() => showPage('games')}
              style={{
                background: NETFLIX_RED,
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                padding: '16px 48px',
                borderRadius: 8,
                boxShadow: '0 8px 32px rgba(229,9,20,0.3)',
              }}
            >
              เปิดดูคลังสคริปต์ทั้งหมด {scriptCount}+ เรื่อง
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          4. STATS BAR (WHITE THEME)
      ══════════════════════════════════════════ */}
      <section style={{ background: BG_SURFACE, color: TEXT_MAIN, padding: 'clamp(56px,7vw,88px) clamp(20px,5vw,60px)', borderTop: `1px solid ${BORDER_CLR}`, borderBottom: `1px solid ${BORDER_CLR}` }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            {[
              { num: scriptCount + '+', unit: t('home','statScriptLabel'),  sub: t('home','statReadySub'),  border: true },
              { num: '200+',            unit: t('home','statDetective'),     sub: t('home','statActiveSub'), border: true },
              { num: 'B499',            unit: t('home','statStarting'),      sub: t('home','statPriceSub'),  border: true },
              { num: '5',               unit: t('home','statYears'),          sub: t('home','statExpSub'),    border: false },
            ].map((s, i) => (
              <div key={i} className={`mm-reveal mm-d${i + 1} mm-stat-box`} style={{
                padding: 'clamp(24px,3vw,40px) clamp(16px,2vw,28px)',
                background: '#ffffff',
                borderRadius: 12,
                border: `1px solid ${BORDER_CLR}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: 'clamp(44px,6vw,76px)', color: TEXT_MAIN, lineHeight: 0.9 }}>
                  {s.num}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: NETFLIX_RED, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 6 }}>
                  {s.unit}
                </div>
                <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginTop: 4 }}>
                  {s.sub}
                </div>
              </div>
            ))}
          </div>

          <div className="mm-reveal" style={{ marginTop: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 'clamp(13px,1.4vw,16px)', fontWeight: 600, color: TEXT_MUTED, maxWidth: '64ch', margin: '0 auto', lineHeight: 1.7 }}>
              <strong>Sofun Club Thailand</strong> ผู้บุกเบิกและสตูดิโอเกม <strong>Script Murder</strong> คุณภาพพรีเมียมแห่งแรกใจกลาง RCA พร้อม Game Master มืออาชีพดูแลห้องสืบคดีทุกรอบ
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          5. HOW TO PLAY (WHITE THEME)
      ══════════════════════════════════════════ */}
      <section style={{ background: BG_PAGE, color: TEXT_MAIN, padding: 'clamp(64px,8vw,104px) clamp(20px,5vw,60px)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div className="mm-reveal" style={{ marginBottom: 48, textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(229,9,20,0.08)', color: NETFLIX_RED, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              HOW TO PLAY
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(40px,6vw,80px)', lineHeight: 0.9, textTransform: 'uppercase', color: TEXT_MAIN, margin: 0 }}>
              {t('home','howStartHeading')}
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {[
              { n: '01', icon: 'fas fa-folder-open', title: t('home','step1Title'), desc: t('home','step1Desc'), d: 'mm-d1' },
              { n: '02', icon: 'fas fa-user-secret', title: t('home','step2Title'), desc: t('home','step2Desc'), d: 'mm-d2' },
              { n: '03', icon: 'fas fa-search',      title: t('home','step3Title'), desc: t('home','step3Desc'), d: 'mm-d3' },
            ].map((step, i) => (
              <div key={i} className={`mm-reveal ${step.d} mm-step-card`} style={{
                padding: 'clamp(28px,3.5vw,44px)',
                position: 'relative',
                border: `1px solid ${BORDER_CLR}`,
                boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              }}>
                <div aria-hidden className="mm-step-num">{step.n}</div>
                <div style={{ marginTop: -14 }}>
                  <div style={{ width: 28, height: 3, background: NETFLIX_RED, marginBottom: 14, borderRadius: 2 }} />
                  <i className={step.icon} style={{ fontSize: 24, color: NETFLIX_RED, display: 'block', marginBottom: 14 }} />
                  <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(22px,2.6vw,32px)', textTransform: 'uppercase', color: TEXT_MAIN, marginBottom: 10, letterSpacing: '0.02em', margin: '0 0 10px' }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 13.5, lineHeight: 1.8, color: TEXT_MUTED, margin: 0 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mm-reveal" style={{ textAlign: 'center', marginTop: 52 }}>
            <button className="mm-btn-pri" onClick={() => showPage('games')} style={{
              background: NETFLIX_RED, color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
              fontFamily: "'Sarabun',sans-serif", padding: '16px 52px', borderRadius: 8,
              boxShadow: '0 8px 32px rgba(229,9,20,0.3)',
            }}>
              {t('home','startPlaying')}
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          6. PROMOTION SHOWCASE BANNER (IMAGE ONLY)
      ══════════════════════════════════════════ */}
      {(promoSettings?.bannerUrl || promoSettings?.heading) && (
        <section style={{
          background: BG_SURFACE,
          color: TEXT_MAIN,
          position: 'relative',
          overflow: 'hidden',
          borderTop: `1px solid ${BORDER_CLR}`,
          borderBottom: `1px solid ${BORDER_CLR}`,
          padding: 'clamp(32px, 5vw, 64px) clamp(16px, 4vw, 48px)',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
            <div
              className="sofun-promo-card mm-reveal"
              onClick={() => {
                const targetLink = promoSettings?.buttonLink || 'booking';
                if ((targetLink === 'booking' || targetLink === 'party') && !bookingEnabled) {
                  handleDirectLineBooking(null, showToast);
                  return;
                }
                showPage(targetLink);
              }}
              role="button"
              tabIndex={0}
              title={promoSettings?.heading || 'โปรโมชั่น'}
            >
              <div className="sofun-promo-banner-wrap">
                {promoSettings?.bannerUrl ? (
                  <img
                    src={convertImageUrl(promoSettings.bannerUrl, 1600)}
                    alt={promoSettings?.heading || 'โปรโมชั่น'}
                    className="sofun-promo-banner-img"
                    loading="lazy"
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    minHeight: 280,
                    background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 32,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      width: 56,
                      height: 56,
                      borderRadius: 16,
                      background: 'rgba(229, 9, 20, 0.08)',
                      border: '1px solid rgba(229, 9, 20, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: NETFLIX_RED,
                      fontSize: 22,
                      marginBottom: 12,
                    }}>
                      <i className="fas fa-bullhorn" />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>
                      {promoSettings?.heading || 'SOFUN SPECIAL PROMOTION'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          7. OPEN PARTIES (WHITE THEME - CONDITIONAL)
      ══════════════════════════════════════════ */}
      {openParties.length > 0 && (
        <section style={{ background: BG_PAGE, padding: 'clamp(56px,7vw,88px) clamp(20px,5vw,60px)', borderBottom: `1px solid ${BORDER_CLR}` }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 32, flexWrap: 'wrap' }}>
              <div className="mm-reveal-l">
                <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(36px,5vw,64px)', lineHeight: 0.9, textTransform: 'uppercase', color: TEXT_MAIN, margin: 0 }}>
                  {t('home','partyEyebrow')}
                </h2>
              </div>
              <div className="mm-reveal-r" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ position: 'relative', display: 'inline-block', width: 8, height: 8 }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: NETFLIX_RED, animation: 'mmPulse 2s ease-in-out infinite' }} />
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: NETFLIX_RED, animation: 'mmPing 2s ease-out infinite' }} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 20, background: 'rgba(229,9,20,.08)', color: NETFLIX_RED }}>
                  {openParties.length} {t('home','partiesOpen')}
                </span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(272px,1fr))', gap: 14 }}>
              {openParties.map((party, i) => (
                <div key={party.id} className={`mm-reveal mm-d${Math.min(i + 1, 4)} mm-party-card`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 18px', background: BG_SURFACE, borderRadius: 12,
                  border: `1px solid ${BORDER_CLR}`, gap: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(229,9,20,.08)', color: NETFLIX_RED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>
                      {(party.ownerName || '?')[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: TEXT_MAIN, maxWidth: 148, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{party.gameName || 'ปาร์ตี้'}</p>
                      <p style={{ fontSize: 10.5, color: TEXT_MUTED, margin: '3px 0 0' }}>{party.ownerName} · {party.members?.length || 0}/{party.maxPlayers} คน</p>
                    </div>
                  </div>
                  <button onClick={(e) => joinParty(party, e)} style={{
                    fontSize: 11, fontWeight: 800, padding: '10px 18px', borderRadius: 6,
                    background: NETFLIX_RED, color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0,
                  }}>
                    {t('home','joinParty')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          8. SCRIPT MURDER STORY & FAQ (WHITE THEME)
      ══════════════════════════════════════════ */}
      <section style={{
        background: BG_PAGE,
        color: TEXT_MAIN,
        padding: 'clamp(64px, 8vw, 104px) clamp(20px, 5vw, 60px)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div className="mm-reveal" style={{ textAlign: 'center', maxWidth: 800, margin: '0 auto 52px' }}>
            <h2 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(36px, 5.5vw, 64px)',
              lineHeight: 0.95, textTransform: 'uppercase', margin: '0 0 14px', color: TEXT_MAIN,
            }}>
              ประสบการณ์เกม <span style={{ color: NETFLIX_RED }}>Script Murder</span> กับ Sofun Club
            </h2>
            <p style={{ fontSize: 'clamp(13px, 1.3vw, 15px)', color: TEXT_MUTED, lineHeight: 1.8, margin: 0 }}>
              ค้นพบเสน่ห์ของเกมสืบสวนสวมบทบาทที่ได้รับความนิยมสูงสุดในเอเชีย กับ Sofun Club Thailand
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
          }}>
            {[
              {
                q: 'Script Murder คืออะไร?',
                a: 'Script Murder (เกมสืบสวนสอบสวนแบบสวมบทบาท หรือ Live Action Roleplay) คือประสบการณ์การเล่นที่ผู้เล่นแต่ละคนจะได้รับบทบาทตัวละครและแฟ้มคดีส่วนตัว ซักถามผู้ต้องสงสัย วิเคราะห์หลักฐาน ค้นหาแรงจูงใจ และร่วมกันชี้ตัวฆาตกรตัวจริงในเนื้อเรื่องที่เข้มข้นและหักมุม',
                icon: 'fas fa-mask',
              },
              {
                q: 'ทำไมต้องเลือกเล่นที่ Sofun Club Thailand?',
                a: 'Sofun Club เป็นแพลตฟอร์มและสตูดิโอเกม Script Murder แห่งแรกในประเทศไทย คัดสรรสคริปต์แปลไทยลิขสิทธิ์คุณภาพกว่า 48+ เรื่อง พร้อมห้องสืบคดีธีมเฉพาะ พร็อพเครื่องแต่งกายสมจริง และ Game Master มืออาชีพคอยดูแลการเล่นทุกขั้นตอน',
                icon: 'fas fa-shield-halved',
              },
              {
                q: 'เล่น Script Murder ที่ Sofun เหมาะกับใครบ้าง?',
                a: 'เหมาะสำหรับทุกคน ไม่ว่าจะเป็นกลุ่มเพื่อนที่มองหากิจกรรมบันเทิงรูปแบบใหม่ กิจกรรม Team Building ขององค์กร หรือผู้เล่นเดี่ยวที่ต้องการหาเพื่อนใหม่ผ่านระบบจับคู่ปาร์ตี้ของ Sofun Club Thailand พร้อมระดับความยากหลากหลายตั้งแต่ผู้เริ่มต้นจนถึงระดับเซียน',
                icon: 'fas fa-users',
              },
            ].map((item, idx) => (
              <div key={idx} className={`mm-reveal mm-d${idx + 1} mm-story-card`} style={{
                background: '#ffffff',
                borderRadius: 16,
                border: `1px solid ${BORDER_CLR}`,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(229,9,20,0.08)', color: NETFLIX_RED,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>
                  <i className={item.icon} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: TEXT_MAIN, lineHeight: 1.4, margin: 0 }}>
                  {item.q}
                </h3>
                <p style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.75, margin: 0 }}>
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact / Info Footer ── */}
      <Footer />
    </div>
  );
}
