import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../LangContext';
import { db } from '../firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

/* ── Design tokens ─────────────────────────────────────── */
const VOID    = 'var(--void-950)';
const SURFACE = 'var(--void-900)';
const CARD    = 'var(--void-800)';
const C       = 'var(--crimson-500)';
const C_DEEP  = 'var(--crimson-700)';
const CHALK   = 'var(--chalk)';
const CHALK_2 = 'var(--chalk-2)';
const CHALK_3 = 'var(--chalk-3)';
const WIRE    = 'var(--border-dark-wire)';
const WIRE_2  = 'var(--border-dark-wire-2)';
const AMBER   = 'var(--case-amber)';
const INK     = 'var(--text-primary)';
const INK_2   = 'var(--text-secondary)';
const INK_3   = 'var(--text-tertiary)';
const PAPER   = 'var(--surface-page)';
const PAPER_2 = 'var(--surface-card)';

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

const PLACEHOLDER = Array.from({ length: 12 }, (_, i) => ({
  id: `ph-${i}`,
  title: ['The Mansion Mystery','Blood on the Dancefloor','Midnight Train','The Last Supper','Carnival of Souls','Dead in the Water','Black Swan','The Quiet Room','Red Velvet','Ivory Tower','Crimson Tide','Shadow Play'][i],
  coverUrl: null,
  difficulty: ['ง่าย','ปานกลาง','ยาก','ยากมาก','ง่าย','ปานกลาง','ยาก','ยาก','ง่าย','ปานกลาง','ยาก','ง่าย'][i],
  players: ['4-6','6-8','8-10','6-8','4-6','8-12','6-10','4-8','4-6','6-10','6-8','4-6'][i],
  price: [0,299,399,499,0,349,399,299,0,349,399,0][i],
}));

export default function HomePage({ allGames = [], allParties = [], showPage, lineUser }) {
  const { t } = useLang();
  const [heroIdx, setHeroIdx]         = useState(0);
  const [heroVisible, setHeroVisible] = useState(true);
  const revealRoot = useRef(null);

  /* hero slideshow */
  useEffect(() => {
    const len = allGames.length || PLACEHOLDER.length;
    if (len <= 1) return;
    const timer = setInterval(() => {
      setHeroVisible(false);
      setTimeout(() => {
        setHeroIdx(prev => {
          let next = Math.floor(Math.random() * len);
          while (next === prev && len > 1) next = Math.floor(Math.random() * len);
          return next;
        });
        setHeroVisible(true);
      }, 600);
    }, 5000);
    return () => clearInterval(timer);
  }, [allGames.length]);

  /* scroll reveal */
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
  /* games that actually have a cover image — used for hero slideshow */
  const HERO_EXCLUDED = ['1QylfkWZJKgbA_aodUnYu23pQxupJfAQK', '1Kpod9FnDg-sPVGvi-BskoMqACcbMaB7t'];
  const slidableGames = displayGames.filter(g => {
    const url = g.image || g.coverUrl;
    return url && !HERO_EXCLUDED.some(id => url.includes(id));
  });
  const heroSlide     = heroIdx % Math.max(slidableGames.length, 1);
  const heroGame      = slidableGames[heroSlide] || displayGames[0];
  const heroImg       = heroGame ? convertImageUrl(heroGame.image || heroGame.coverUrl) : null;
  const tickerGames   = displayGames.map(g => g.title).filter(Boolean);
  const tickerDur     = Math.max(30, tickerGames.length * 2.5);
  const gridGames     = displayGames.slice(0, 12);
  /* dots: up to 9 covers from slidable games */
  const heroCovers    = slidableGames.slice(0, 9).map(g => convertImageUrl(g.image || g.coverUrl, 400));
  /* scatter: tiny thumbnails — displayed at 36–52px CSS, w=200 is enough at 3× DPR */
  const scatterCovers = slidableGames.map(g => convertImageUrl(g.image || g.coverUrl, 200));

  return (
    <div ref={revealRoot} role="main" style={{ fontFamily: "'Sarabun', sans-serif", background: PAPER, color: INK, paddingTop: 60, overflowX: 'hidden' }}>

      <style>{`
        @keyframes mmTicker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes mmFadeUp { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes mmFadeL  { from{opacity:0;transform:translateX(-24px)} to{opacity:1;transform:translateX(0)} }
        @keyframes mmFadeR  { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:translateX(0)} }
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

        .mm-r1{animation:mmFadeUp .72s cubic-bezier(.22,1,.36,1) .06s both}
        .mm-r2{animation:mmFadeUp .72s cubic-bezier(.22,1,.36,1) .16s both}
        .mm-r3{animation:mmFadeUp .72s cubic-bezier(.22,1,.36,1) .28s both}
        .mm-r4{animation:mmFadeUp .72s cubic-bezier(.22,1,.36,1) .40s both}
        .mm-r5{animation:mmFadeL  .72s cubic-bezier(.22,1,.36,1) .18s both}

        .mm-reveal   {opacity:0;transform:translateY(28px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
        .mm-reveal-l {opacity:0;transform:translateX(-28px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
        .mm-reveal-r {opacity:0;transform:translateX(28px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
        .mm-reveal-s {opacity:0;transform:scale(.96);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
        .mm-reveal.mm-in,.mm-reveal-l.mm-in,.mm-reveal-r.mm-in,.mm-reveal-s.mm-in{opacity:1;transform:none}
        .mm-d1{transition-delay:.05s!important}.mm-d2{transition-delay:.10s!important}
        .mm-d3{transition-delay:.16s!important}.mm-d4{transition-delay:.22s!important}
        .mm-d5{transition-delay:.28s!important}.mm-d6{transition-delay:.34s!important}

        .mm-btn-pri{transition:background .22s cubic-bezier(.22,1,.36,1),transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s cubic-bezier(.22,1,.36,1)!important}
        .mm-btn-pri:hover{background:${C_DEEP}!important;transform:translateY(-3px)!important;box-shadow:0 18px 48px rgba(198,36,25,.55)!important}
        .mm-btn-pri:focus-visible{outline:2px solid ${C};outline-offset:3px}
        .mm-btn-gho{transition:border-color .2s,color .2s!important}
        .mm-btn-gho:hover{border-color:${C}!important;color:${C}!important}
        .mm-btn-gho:focus-visible{outline:2px solid ${C};outline-offset:3px}
        .mm-btn-dark{transition:background .2s,color .2s,transform .2s!important}
        .mm-btn-dark:hover{background:#fff!important;color:#111!important;transform:translateY(-2px)!important}
        button:focus-visible{outline:2px solid ${C};outline-offset:2px}

        .mm-card{transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s,border-color .22s!important;cursor:pointer}
        .mm-card:hover{transform:translateY(-8px)!important;box-shadow:0 24px 48px rgba(0,0,0,.13),0 0 0 1.5px rgba(198,36,25,.25)!important}
        .mm-card:hover .mm-card-img{transform:scale(1.07)!important}
        .mm-card:hover .mm-card-overlay{opacity:.72!important}
        .mm-card:focus-visible{outline:2px solid ${C};outline-offset:2px}
        .mm-card-img{transition:transform .55s cubic-bezier(.22,1,.36,1)!important}
        .mm-card-overlay{transition:opacity .35s!important}

        .mm-stat-num{font-family:'Bebas Neue',sans-serif;line-height:.88;letter-spacing:-.02em}
        .mm-step-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(80px,11vw,130px);line-height:.8;letter-spacing:-.04em;color:rgba(255,255,255,.045);pointer-events:none;user-select:none}

        @keyframes mmMainFloat {
          0%,100%{ transform:translateY(0px) rotate(0deg) scale(1) }
          35%    { transform:translateY(-22px) rotate(.7deg) scale(1.016) }
          65%    { transform:translateY(-10px) rotate(-.4deg) scale(1.008) }
        }

        .mm-cover{transition:box-shadow .38s!important}
        .mm-cover:hover{box-shadow:0 36px 72px rgba(0,0,0,.32)!important;filter:brightness(1.06)!important}
        .mm-cover-main{
          transition:box-shadow .38s,filter .38s!important;
          animation:mmMainFloat 7.5s ease-in-out infinite;
          transform-origin:center bottom;
        }
        .mm-cover-main:hover{box-shadow:0 64px 120px rgba(0,0,0,.42)!important;filter:brightness(1.07)!important;animation-play-state:paused!important}
        .mm-fa{animation:mmFloatA 5.2s ease-in-out infinite}
        .mm-fb{animation:mmFloatB 6.8s ease-in-out infinite}
        .mm-fc{animation:mmFloatC 7.6s ease-in-out infinite}
        .mm-fd{animation:mmFloatD 4.9s ease-in-out infinite}
        .mm-fe{animation:mmFloatE 6.1s ease-in-out infinite}
        .mm-ff{animation:mmFloatF 8.2s ease-in-out infinite}
        .mm-fg{animation:mmFloatG 5.7s ease-in-out infinite}
        .mm-fh{animation:mmFloatH 7.1s ease-in-out infinite}

        /* genre row */
        .mm-genre-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .mm-genre-row::-webkit-scrollbar{display:none}
        .mm-genre-btn{transition:border-color .18s,color .18s,background .18s!important;flex-shrink:0}
        .mm-genre-btn:hover{border-color:${C}!important;color:${C}!important;background:rgba(198,36,25,.05)!important}
        .mm-genre-btn.gba{background:${C}!important;color:#fff!important;border-color:${C}!important}

        /* ── grids ── */
        .mm-hero-text{width:min(52%,700px);padding:clamp(56px,7vw,96px) clamp(36px,5vw,80px) clamp(64px,8vw,96px)}

        .mm-catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}
        @media(max-width:480px){.mm-catalog-grid{grid-template-columns:repeat(2,1fr);gap:12px}}

        .mm-stats-grid{display:grid;grid-template-columns:repeat(2,1fr)}
        @media(min-width:640px){.mm-stats-grid{grid-template-columns:repeat(4,1fr)}}

        .mm-steps-grid{display:grid;grid-template-columns:1fr}
        @media(min-width:640px){.mm-steps-grid{grid-template-columns:repeat(3,1fr)}}

        .mm-footer-split{display:grid;grid-template-columns:1fr}
        @media(min-width:768px){.mm-footer-split{grid-template-columns:1fr 1fr}}

        .mm-footer-cols{display:grid;grid-template-columns:1fr;gap:40px}
        @media(min-width:640px){.mm-footer-cols{grid-template-columns:2fr 1fr 1fr 1fr}}

        /* mobile hero — hide right-side elements */
        @media(max-width:899px){
          .mm-scatter-r,.mm-hero-main,.mm-hero-pill,.mm-hero-dots{display:none!important}
        }
        @media(min-width:640px) and (max-width:899px){
          .mm-hero-text{width:100%;padding:clamp(48px,7vw,72px) clamp(28px,5vw,56px) clamp(56px,7vw,80px)}
          .mm-hero-cats,.mm-hero-stats{justify-content:flex-start!important}
        }
        /* mobile-only scatter covers — hidden on tablet/desktop */
        .mm-mobile-only{display:none!important}
        @media(max-width:639px){
          .mm-hero-text{width:100%;padding:clamp(36px,8vw,56px) 20px clamp(48px,8vw,64px)}
          .mm-hero-cats,.mm-hero-stats{justify-content:center!important}
          /* phone: hide zone-2 covers + odd zone-1 covers */
          .mm-phone-r{display:none!important}
          /* show mobile-specific scatter */
          .mm-mobile-only{display:block!important}
        }

        /* iPad: slightly smaller scatter covers */
        @media(min-width:900px) and (max-width:1199px){
          .mm-cover:not(.mm-cover-main){ max-width:48px!important }
        }

        @media(prefers-reduced-motion:reduce){
          .mm-r1,.mm-r2,.mm-r3,.mm-r4,.mm-r5{animation:none;opacity:1;transform:none}
          .mm-reveal,.mm-reveal-l,.mm-reveal-r,.mm-reveal-s{transition:none;opacity:1;transform:none}
          .mm-btn-pri:hover,.mm-card:hover{transform:none}
          .mm-fa,.mm-fb,.mm-fc,.mm-fd,.mm-fe,.mm-ff,.mm-fg,.mm-fh,.mm-cover-main{animation:none}
        }
      `}</style>

      {/* ══════════════════════════════════════════
          1. HERO
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

        {/* ══ SCATTER CARDS — full-section canvas ══
            zi:1 = behind text (left texture + center bridge)
            zi:3 = right showcase (high opacity)
            hide:true = also hidden on mobile (via mm-scatter-r)     */}
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
          /* above: top 0–5% spanning left 55–87% */
          { idx:1, cls:'mm-fb', top:'1%',  left:'55%', w:46, zi:4, op:.52, delay:'0.4s',  hide:true },
          { idx:2, cls:'mm-fd', top:'2%',  left:'64%', w:60, zi:4, op:.62, delay:'1.1s',  hide:true },
          { idx:3, cls:'mm-fg', top:'1%',  left:'74%', w:54, zi:4, op:.58, delay:'1.8s',  hide:true },
          { idx:4, cls:'mm-fa', top:'3%',  left:'83%', w:48, zi:4, op:.54, delay:'0.7s',  hide:true },
          /* below: top 88–92% spanning left 55–87% */
          { idx:5, cls:'mm-fc', top:'90%', left:'55%', w:48, zi:4, op:.52, delay:'2.1s',  hide:true },
          { idx:6, cls:'mm-fe', top:'89%', left:'64%', w:58, zi:4, op:.60, delay:'1.4s',  hide:true },
          { idx:7, cls:'mm-fh', top:'91%', left:'74%', w:52, zi:4, op:.56, delay:'0.5s',  hide:true },
          { idx:8, cls:'mm-fb', top:'89%', left:'83%', w:46, zi:4, op:.52, delay:'2.3s',  hide:true },
          /* right gap: left 88–93% between main cover right edge and far-right zone */
          { idx:0, cls:'mm-fc', top:'16%', left:'88%', w:50, zi:4, op:.62, delay:'0.3s',  hide:true },
          { idx:1, cls:'mm-fe', top:'31%', left:'90%', w:56, zi:4, op:.66, delay:'1.0s',  hide:true },
          { idx:2, cls:'mm-fg', top:'46%', left:'88%', w:60, zi:4, op:.70, delay:'1.7s',  hide:true },
          { idx:3, cls:'mm-fa', top:'61%', left:'90%', w:54, zi:4, op:.64, delay:'0.8s',  hide:true },
          { idx:4, cls:'mm-fh', top:'75%', left:'88%', w:50, zi:4, op:.60, delay:'2.0s',  hide:true },
          /* left gap: left 51–53% between zone 4B and main cover left edge */
          { idx:5, cls:'mm-fd', top:'18%', left:'51%', w:54, zi:4, op:.48, delay:'1.3s',  hide:true },
          { idx:6, cls:'mm-fb', top:'43%', left:'52%', w:58, zi:4, op:.52, delay:'0.6s',  hide:true },
          { idx:7, cls:'mm-fc', top:'67%', left:'51%', w:50, zi:4, op:.48, delay:'1.9s',  hide:true },
        ].map(({ idx: _idx, cls, w, zi, op, hide, delay, ...pos }, i) => {
          const src = scatterCovers.length > 0 ? scatterCovers[i % scatterCovers.length] : null;
          const ph = ['#ebebeb','#e8e8e8','#eeeeee','#e6e6e6','#ededed','#e9e9e9','#ececec','#eaeaea'][i % 8];
          /* phone: hide zone-2 (i 8–14) + odd zone-1 (i 1,3,5,7) */
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

        {/* ══ MAIN FEATURED CARD — positioning wrapper + animated inner ══ */}
        {(() => {
          return (
            <div className="mm-hero-main" style={{
              position:'absolute', top:'50%', left:'71%',
              transform:'translate(-50%, -50%)',
              zIndex:5,
            }}>
              <div className="mm-cover-main" style={{
                width:'clamp(300px,34vw,480px)', aspectRatio:'2/3',
                borderRadius:22, overflow:'hidden',
                boxShadow:'0 100px 200px rgba(0,0,0,.50), 0 0 0 7px #fff',
              }}>
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
        <div className="mm-hero-pill" style={{ position:'absolute', top:'50%', left:'71%', transform:'translate(calc(-50% + clamp(120px,13vw,200px)), calc(-50% + clamp(160px,20vw,280px)))', background:C, color:'#fff', padding:'13px 17px', borderRadius:10, boxShadow:'0 16px 40px rgba(198,36,25,.45)', zIndex:6 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, lineHeight:1 }}>5 ปี</div>
          <div style={{ fontSize:8, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', opacity:.72, marginTop:3 }}>ประสบการณ์</div>
        </div>

        {/* Slide dots */}
        {heroCovers.length > 1 && (
          <div className="mm-hero-dots" style={{ position:'absolute', bottom:'7%', left:'71%', transform:'translateX(-50%)', display:'flex', gap:6, zIndex:6 }}>
            {heroCovers.map((_, i) => (
              <div key={i} style={{ width:20, height:6, borderRadius:3, background: i === heroSlide % heroCovers.length ? C : 'rgba(0,0,0,.18)', transform:`scaleX(${i === heroSlide % heroCovers.length ? 1 : 0.3})`, transformOrigin:'center', transition:'transform .4s, background .4s' }} />
            ))}
          </div>
        )}

        {/* ── UNIFIED TEXT BLOCK ── */}
        <div className="mm-hero-text" style={{ position: 'relative', zIndex: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>


            {/* Eyebrow */}
            <div className="mm-r1" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <div style={{ width: 28, height: 2, background: C }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: C }}>
                Script Murder Platform · Thailand
              </span>
            </div>

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
              fontSize: 'clamp(13px,1.3vw,15.5px)', lineHeight: 1.8,
              color: '#666', maxWidth: '44ch', margin: '24px 0 32px',
            }}>
              Sofun Club เป็นที่แรกที่ให้ประสบการ์ณ script murder และ บริการเกม script murder แห่งแรกในประเทศไทย เป้าหมายของ Sofun คือทําให้คนหนุ่มสาวชาวไทยได้สัมผัสกับความสนุกสนานทางสังคมในระดับใหม่ ผ่านการเล่นเกม script murder Sofun Club ทุ่มเทเพื่อมอบประสบการณ์การเล่นเกมที่ไม่เหมือนใครและสนุกสนานแก่แขกทุกคน ที่นี่คุณสามารถเข้าสู่สถานการณ์ role-playing ที่แตกต่างกัน สัมผัสกับความรักและความเกลียดชังระหว่างตัวละคร และเดินทางในชีวิตที่คุณไม่เคยสัมผัสมาก่อน ประสบการณ์สืบสวนสอบสวนสมจริงกว่า {scriptCount} เรื่อง — ที่แรกและใหญ่ที่สุดในประเทศไทย
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

            {/* Inline stats */}
            <div className="mm-hero-stats mm-r4" style={{ display: 'flex', gap: 32, marginTop: 36, paddingTop: 28, borderTop: '1px solid rgba(0,0,0,.07)' }}>
              {[
                { n: scriptCount + '+', label: t('home','statScriptLabel') },
                { n: '200+',            label: t('home','statMemberLabel') },
                { n: '5',               label: t('home','statYearsLabel') },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(26px,3.2vw,34px)', color: '#111', lineHeight: 1 }}>{s.n}</div>
                  <div style={{ fontSize: 9, color: '#bbb', letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Quick category nav */}
            <div className="mm-hero-cats mm-r4" style={{ display: 'flex', gap: 0, marginTop: 28, paddingTop: 24, borderTop: '1px solid rgba(0,0,0,.07)' }}>
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
          2. TICKER
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
                  <span aria-hidden style={{ opacity: 0.4, fontSize: 5, color: '#fff' }}>◆</span>
                </React.Fragment>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          3. SCRIPT CATALOG — shown early, core product
      ══════════════════════════════════════════ */}
      <section style={{ background: '#fff', padding: 'clamp(72px,9vw,120px) clamp(24px,5vw,64px)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 32, flexWrap: 'wrap' }}>
            <div className="mm-reveal-l">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 16, height: 2, background: C }} />
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.26em', textTransform: 'uppercase', color: C }}>{t('home','catalogEyebrow')}</span>
              </div>
              <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(44px,6vw,80px)', lineHeight: 0.88, textTransform: 'uppercase', color: '#111', margin: 0 }}>
                {t('home','catalogHeading')}
              </h2>
            </div>
            <div className="mm-reveal-r">
              <button className="mm-btn-gho" onClick={() => showPage('games')} style={{
                background: 'transparent', color: '#555', border: '1.5px solid rgba(0,0,0,.18)',
                cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', fontFamily: "'Sarabun',sans-serif",
                padding: '12px 28px', borderRadius: 6,
              }}>
                {t('home','viewAll')} {scriptCount}+
              </button>
            </div>
          </div>

          {/* Genre filter row */}
          <div className="mm-genre-row mm-reveal" style={{ marginBottom: 28 }}>
            {['ทั้งหมด','Horror','Drama','Detective','Emotional','Thriller','Romance','Comedy','ฟรี'].map((g, i) => (
              <button key={g} className={`mm-genre-btn${i === 0 ? ' gba' : ''}`} onClick={() => showPage('games')} style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                padding: '8px 18px', borderRadius: 20,
                border: '1.5px solid rgba(0,0,0,.14)',
                color: i === 0 ? '#fff' : '#555',
                background: i === 0 ? C : 'transparent',
                cursor: 'pointer', fontFamily: "'Sarabun',sans-serif",
              }}>
                {g}
              </button>
            ))}
          </div>

          {/* Card grid */}
          <div className="mm-catalog-grid">
            {gridGames.map((game, i) => {
              const imgSrc = (game.image || game.coverUrl) ? convertImageUrl(game.image || game.coverUrl, 400) : null;
              const displayPrice = game.fullPrice ?? game.price;
              return (
                <div key={game.id || i}
                  className={`mm-card mm-reveal mm-d${Math.min((i % 4) + 1, 6)}`}
                  role="button" tabIndex={0}
                  onClick={() => showPage('games')}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && showPage('games')}
                  style={{ borderRadius: 12, overflow: 'hidden', background: PAPER_2, border: '1px solid rgba(0,0,0,.07)', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                  <div style={{ position: 'relative', aspectRatio: '2/3', overflow: 'hidden', flexShrink: 0 }}>
                    {imgSrc
                      ? <img src={imgSrc} alt={game.title} loading="lazy" decoding="async" className="mm-card-img" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg,#1a1a2e,#16213e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-user-secret" style={{ fontSize: 40, color: 'rgba(255,255,255,.1)' }} /></div>
                    }
                    <div className="mm-card-overlay" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,.8) 0%,rgba(0,0,0,.02) 55%,transparent 100%)', opacity: 0.48 }} />
                    {game.difficulty && <DiffBadge d={game.difficulty} />}
                    {displayPrice === 0 && (
                      <span style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, background: AMBER, color: VOID }}>{t('home','free')}</span>
                    )}
                  </div>
                  <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', margin: 0 }}>
                      {game.title}
                    </p>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1,2,3,4,5].map(s => <span key={s} style={{ fontSize: 9.5, color: s <= 4 ? AMBER : 'var(--void-200)', lineHeight: 1 }}>★</span>)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 4 }}>
                      {!!game.players && <span style={{ fontSize: 10, color: INK_3 }}>{game.players} {t('home','playerCount')}</span>}
                      {displayPrice !== undefined && (
                        <span style={{ fontSize: 13, fontWeight: 800, color: displayPrice === 0 ? AMBER : C }}>
                          {displayPrice === 0 ? t('home','free') : `฿${displayPrice}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mm-reveal" style={{ textAlign: 'center', marginTop: 52 }}>
            <button className="mm-btn-gho" onClick={() => showPage('games')} style={{
              background: 'transparent', color: '#555', border: '1.5px solid rgba(0,0,0,.18)',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase', fontFamily: "'Sarabun',sans-serif",
              padding: '17px 60px', borderRadius: 6,
            }}>
              {t('home','openAllFiles')} {scriptCount}+ →
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          4. FEATURE STRIP — 3 horizontal pillars
      ══════════════════════════════════════════ */}
      <section style={{ background: PAPER_2, padding: 'clamp(56px,7vw,88px) clamp(24px,5vw,64px)', borderTop: '1px solid rgba(0,0,0,.06)', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 0 }}>
            {[
              { icon: 'fas fa-user-secret', title: t('home','feat1Title'), desc: t('home','feat1Desc') },
              { icon: 'fas fa-search',      title: t('home','feat2Title'), desc: t('home','feat2Desc') },
              { icon: 'fas fa-scroll',      title: t('home','feat3Title'), desc: t('home','feat3Desc') },
            ].map((f, i) => (
              <div key={i} className={`mm-reveal mm-d${i + 1}`} style={{
                padding: 'clamp(32px,4vw,48px) clamp(24px,3.5vw,40px)',
                borderRight: i < 2 ? '1px solid rgba(0,0,0,.07)' : 'none',
                display: 'flex', gap: 20, alignItems: 'flex-start',
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: `rgba(198,36,25,.08)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={f.icon} style={{ fontSize: 18, color: C }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 8, margin: '0 0 8px' }}>{f.title}</h3>
                  <p style={{ fontSize: 13, color: '#777', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          5. STATS — dark, credibility numbers
      ══════════════════════════════════════════ */}
      <section style={{ background: '#060606', color: '#fff', padding: 'clamp(64px,8vw,104px) clamp(24px,5vw,64px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1 }}>

          <div className="mm-reveal" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 56 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: C }}>Script Murder</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.22)' }}>{t('home','statsPride')}</span>
          </div>

          <div className="mm-stats-grid">
            {[
              { num: scriptCount + '+', unit: t('home','statScriptLabel'),  sub: t('home','statReadySub'),  border: true },
              { num: '200+',            unit: t('home','statDetective'),     sub: t('home','statActiveSub'), border: true },
              { num: '฿349',            unit: t('home','statStarting'),      sub: t('home','statPriceSub'),  border: true },
              { num: '5',               unit: t('home','statYears'),          sub: t('home','statExpSub'),    border: false },
            ].map((s, i) => (
              <div key={i} className={`mm-reveal mm-d${i + 1}`} style={{
                padding: 'clamp(32px,4vw,56px) clamp(20px,3vw,40px)',
                borderRight: s.border ? '1px solid rgba(255,255,255,.06)' : 'none',
              }}>
                <div className="mm-stat-num" style={{ fontSize: 'clamp(52px,7.5vw,96px)', color: '#fff' }}>{s.num}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>{s.unit}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.28)', marginTop: 6 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="mm-reveal" style={{ marginTop: 56, paddingTop: 40, borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
            <p style={{ fontSize: 'clamp(14px,1.8vw,19px)', fontWeight: 700, color: 'rgba(255,255,255,.55)', maxWidth: '56ch', lineHeight: 1.55, margin: 0 }}>
              {t('home','statsClaim')}
            </p>
            <button className="mm-btn-dark" onClick={() => showPage('games')} style={{
              background: 'rgba(255,255,255,.07)', color: '#fff',
              border: '1.5px solid rgba(255,255,255,.18)',
              cursor: 'pointer', fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
              textTransform: 'uppercase', fontFamily: "'Sarabun',sans-serif",
              padding: '16px 40px', borderRadius: 6, flexShrink: 0,
            }}>
              {t('home','chooseScript')}
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          6. HOW TO PLAY
      ══════════════════════════════════════════ */}
      <section style={{ background: '#0a0a0a', color: '#fff', padding: 'clamp(72px,9vw,120px) clamp(24px,5vw,64px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1 }}>

          <div className="mm-reveal" style={{ marginBottom: 64 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 20, height: 2, background: C }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: C }}>{t('home','howStartEyebrow')}</span>
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(48px,7vw,96px)', lineHeight: 0.88, textTransform: 'uppercase', color: '#fff', margin: 0 }}>
              {t('home','howStartHeading')}
            </h2>
          </div>

          <div className="mm-steps-grid">
            {[
              { n: '01', icon: 'fas fa-folder-open', title: t('home','step1Title'), desc: t('home','step1Desc'), d: 'mm-d1' },
              { n: '02', icon: 'fas fa-user-secret', title: t('home','step2Title'), desc: t('home','step2Desc'), d: 'mm-d2' },
              { n: '03', icon: 'fas fa-search',      title: t('home','step3Title'), desc: t('home','step3Desc'), d: 'mm-d3' },
            ].map((step, i) => (
              <div key={i} className={`mm-reveal ${step.d}`} style={{
                padding: 'clamp(28px,4vw,48px)',
                borderRight: i < 2 ? '1px solid rgba(255,255,255,.05)' : 'none',
                position: 'relative',
              }}>
                <div aria-hidden className="mm-step-num">{step.n}</div>
                <div style={{ marginTop: -14, marginBottom: 16 }}>
                  <div style={{ width: 26, height: 2, background: C, marginBottom: 14, borderRadius: 2 }} />
                  <i className={step.icon} style={{ fontSize: 22, color: C, display: 'block', marginBottom: 14 }} />
                  <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(24px,3vw,38px)', textTransform: 'uppercase', color: '#fff', marginBottom: 12, letterSpacing: '0.02em', margin: '0 0 12px' }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 13.5, lineHeight: 1.85, color: 'rgba(255,255,255,.4)', margin: 0 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mm-reveal" style={{ textAlign: 'center', marginTop: 64, paddingTop: 48, borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <button className="mm-btn-pri" onClick={() => showPage('games')} style={{
              background: C, color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
              fontFamily: "'Sarabun',sans-serif", padding: '18px 56px', borderRadius: 6,
              boxShadow: '0 8px 36px rgba(198,36,25,.45)',
            }}>
              {t('home','startPlaying')}
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          7. OPEN PARTIES (conditional)
      ══════════════════════════════════════════ */}
      {openParties.length > 0 && (
        <section style={{ background: PAPER_2, padding: 'clamp(56px,7vw,96px) clamp(24px,5vw,64px)' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 36, flexWrap: 'wrap' }}>
              <div className="mm-reveal-l">
                <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(36px,5vw,64px)', lineHeight: 0.9, textTransform: 'uppercase', color: INK, margin: 0 }}>
                  {t('home','partyEyebrow')}
                </h2>
              </div>
              <div className="mm-reveal-r" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ position: 'relative', display: 'inline-block', width: 8, height: 8 }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C, animation: 'mmPulse 2s ease-in-out infinite' }} />
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C, animation: 'mmPing 2s ease-out infinite' }} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 20, background: 'rgba(198,36,25,.1)', color: C }}>
                  {openParties.length} {t('home','partiesOpen')}
                </span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(272px,1fr))', gap: 12 }}>
              {openParties.map((party, i) => (
                <div key={party.id} className={`mm-reveal mm-d${Math.min(i + 1, 4)}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 18px', background: PAPER, borderRadius: 10,
                  border: '1px solid rgba(0,0,0,.08)', gap: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(198,36,25,.11)', color: C, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>
                      {(party.ownerName || '?')[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: INK, maxWidth: 148, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{party.gameName || 'ปาร์ตี้'}</p>
                      <p style={{ fontSize: 10, color: INK_3, margin: '3px 0 0' }}>{party.ownerName} · {party.members?.length || 0}/{party.maxPlayers} คน</p>
                    </div>
                  </div>
                  <button onClick={(e) => joinParty(party, e)} style={{
                    fontSize: 11, fontWeight: 700, padding: '12px 18px', borderRadius: 5,
                    background: C, color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0, minHeight: 44,
                    transition: 'background .18s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = C_DEEP}
                    onMouseLeave={e => e.currentTarget.style.background = C}>
                    {t('home','joinParty')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          8. FOOTER
      ══════════════════════════════════════════ */}
      <footer style={{ background: '#060606', color: '#fff' }}>

        <div className="mm-footer-split" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>

          {/* Left: big CTA heading */}
          <div className="mm-reveal" style={{
            padding: 'clamp(64px,9vw,120px) clamp(32px,5vw,72px)',
            borderRight: '1px solid rgba(255,255,255,.06)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div aria-hidden style={{ position: 'absolute', bottom: -24, left: -24, fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(80px,14vw,200px)', fontWeight: 900, color: 'transparent', WebkitTextStroke: '1px rgba(198,36,25,.06)', lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>
              SOFUN
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 20, height: 2, background: C }} />
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: C }}>{t('home','footerReadyEyebrow')}</span>
              </div>
              <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(52px,8vw,108px)', lineHeight: 0.86, textTransform: 'uppercase', color: '#fff', margin: 0 }}>
                {t('home','footerReadyHeading')}
              </h2>
            </div>
          </div>

          {/* Right: crimson */}
          <div className="mm-reveal-r" style={{
            background: C, padding: 'clamp(64px,9vw,120px) clamp(32px,5vw,72px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            <div aria-hidden style={{ position: 'absolute', bottom: -24, right: -24, fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(80px,14vw,200px)', fontWeight: 900, color: 'transparent', WebkitTextStroke: '1px rgba(255,255,255,.1)', lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>
              CLUB
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: 'clamp(15px,1.8vw,20px)', color: 'rgba(255,255,255,.85)', lineHeight: 1.65, marginBottom: 36, maxWidth: '36ch' }}>
                {t('home','footerDesc')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button onClick={() => showPage('games')} style={{
                  background: '#fff', color: '#111', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
                  fontFamily: "'Sarabun',sans-serif", padding: '18px 40px', borderRadius: 6,
                  transition: 'background .22s, color .22s', textAlign: 'center',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#111'; }}>
                  {t('home','startPlaying')}
                </button>
                <button onClick={() => showPage('qr')} style={{
                  background: 'transparent', color: 'rgba(255,255,255,.7)',
                  border: '1.5px solid rgba(255,255,255,.35)',
                  cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
                  textTransform: 'uppercase', fontFamily: "'Sarabun',sans-serif",
                  padding: '16px 40px', borderRadius: 6, transition: 'border-color .2s, color .2s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#fff'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.35)'; e.currentTarget.style.color = 'rgba(255,255,255,.7)'; }}>
                  {t('home','registerLine')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer columns */}
        <div className="mm-footer-cols" style={{ maxWidth: 1280, margin: '0 auto', padding: 'clamp(48px,6vw,72px) clamp(24px,5vw,64px) 40px' }}>
          <div className="mm-reveal mm-d1">
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: '0.06em', color: '#fff', marginBottom: 16 }}>
              So<span style={{ color: C }}>Fun</span> Club
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.32)', lineHeight: 1.85, maxWidth: '28ch', marginBottom: 24 }}>
              {t('home','footerTagline')}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.16)', margin: 0 }}>© 2026 SoFun Club. All Rights Reserved.</p>
          </div>
          {[
            { head: t('home','footerScripts'),   links: [t('home','footerAllScripts'),t('home','footerFreeScripts'),t('home','footerNewScripts'),t('home','footerFeaturedScripts')], page: 'games', d: 'mm-d2' },
            { head: t('home','footerCommunity'), links: [t('home','footerOpenParty'),t('home','footerCreateParty'),t('home','footerMyProfile')],                                    page: 'party', d: 'mm-d3' },
            { head: t('home','footerInfo'),      links: ['Privacy Policy','Terms of Service',t('home','footerContact')],                                                            page: 'games', d: 'mm-d4' },
          ].map(col => (
            <div key={col.head} className={`mm-reveal ${col.d}`}>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: C, margin: '0 0 16px' }}>{col.head}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {col.links.map(label => (
                  <button key={label} onClick={() => showPage(col.page)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
                    color: 'rgba(255,255,255,.3)', fontFamily: "'Sarabun',sans-serif",
                    padding: '9px 0', minHeight: 44, textAlign: 'left',
                    transition: 'color .18s', display: 'block', width: '100%',
                  }}
                    onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,.3)'}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

/* ── DiffBadge ──────────────────────────────────────── */
function DiffBadge({ d }) {
  if (!d) return null;
  const bg = { 'ง่าย': 'var(--feedback-success-icon)', 'ปานกลาง': 'var(--feedback-info-icon)', 'ยาก': 'var(--feedback-warning-icon)', 'ยากมาก': 'var(--crimson-500)' }[d] || 'var(--void-500)';
  const fg = d === 'ยาก' ? 'var(--void-950)' : 'var(--chalk)';
  return (
    <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, color: fg, background: bg }}>
      {d}
    </span>
  );
}
