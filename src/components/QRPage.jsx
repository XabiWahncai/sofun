// Redesigned QR Member Pass with Dynamic Achievement Theme Engine
// Zero emojis rule strictly applied.

import { useEffect, useState, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { db } from '../firebase'
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_RARITY, RARITY } from '../constants/achievements'
import { convertImageUrl } from '../utils/imageUrl'


// ── Achievement Theme Profiles ───────────────────────────────────────────────
const THEME_PROFILES = {
  default: {
    id: 'default',
    name: 'Curtain Crimson',
    title: 'SOFUN CLUB PASS',
    subtitle: 'สมาชิกระดับมาตรฐานแห่งสโมสรนักสืบ',
    accent: '#c62419',
    accentRgb: '198, 36, 25',
    cardBg: 'linear-gradient(145deg, #18141e 0%, #290808 60%, #140404 100%)',
    borderGlow: 'rgba(198, 36, 25, 0.45)',
    cardBorder: 'rgba(198, 36, 25, 0.35)',
    watermarkIcon: 'fa-mask'
  },
  golden: {
    id: 'golden',
    name: 'Golden Player',
    title: 'GOLDEN VIP PASS',
    subtitle: 'สืบคดีจากร้านไปมากกว่า 80% แล้ว ไปเอาเวลาและเงินมาจากไหนเนี่ย',
    accent: '#D4AF37',
    accentRgb: '212, 175, 55',
    cardBg: 'linear-gradient(145deg, #1c180e 0%, #3a2e12 55%, #18140a 100%)',
    borderGlow: 'rgba(212, 175, 55, 0.65)',
    cardBorder: 'rgba(212, 175, 55, 0.55)',
    watermarkIcon: 'fa-trophy'
  },
  golden_pass: {
    id: 'golden_pass',
    name: 'Golden Pass',
    title: 'GOLDEN PASS VIP',
    subtitle: 'ผู้เล่นคนนี้ดวงดีกว่าใคร เล่นฟรี 1 ปี เล่นเกมทั้งร้านได้ 100 รอบเลยมั้ง',
    accent: '#EAB308',
    accentRgb: '234, 179, 8',
    cardBg: 'linear-gradient(145deg, #241d08 0%, #4a3b10 55%, #1f1805 100%)',
    borderGlow: 'rgba(234, 179, 8, 0.70)',
    cardBorder: 'rgba(234, 179, 8, 0.60)',
    watermarkIcon: 'fa-ticket'
  },
  hunger: {
    id: 'hunger',
    name: 'The Hunger',
    title: 'THE HUNGER PASS',
    subtitle: 'นักสืบสายกิน พลังงานสมองขับเคลื่อนด้วยของอร่อย',
    accent: '#F97316',
    accentRgb: '249, 115, 22',
    cardBg: 'linear-gradient(145deg, #1e1208 0%, #3d1c07 55%, #160a04 100%)',
    borderGlow: 'rgba(249, 115, 22, 0.65)',
    cardBorder: 'rgba(249, 115, 22, 0.55)',
    watermarkIcon: 'fa-utensils'
  },
  food_garden: {
    id: 'food_garden',
    name: 'Food Garden',
    title: 'FOOD GARDEN PASS',
    subtitle: 'นัดกันมาเล่นเกมหรือกินข้าว ถ้าไม่บอกนึกว่านั้งอยู่ในร้านอาหารตามสั่ง',
    accent: '#EA580C',
    accentRgb: '234, 88, 12',
    cardBg: 'linear-gradient(145deg, #201006 0%, #441f0b 55%, #180a03 100%)',
    borderGlow: 'rgba(234, 88, 12, 0.65)',
    cardBorder: 'rgba(234, 88, 12, 0.55)',
    watermarkIcon: 'fa-bowl-rice'
  },
  sadness: {
    id: 'sadness',
    name: 'Sadness Noir',
    title: 'MELANCHOLY NOIR PASS',
    subtitle: 'ความเศร้าภายใต้สายฝนแห่งความจริงอันเจ็บปวด',
    accent: '#94A3B8',
    accentRgb: '148, 163, 184',
    cardBg: 'linear-gradient(145deg, #0f172a 0%, #1e293b 55%, #0a0f1d 100%)',
    borderGlow: 'rgba(148, 163, 184, 0.55)',
    cardBorder: 'rgba(148, 163, 184, 0.45)',
    watermarkIcon: 'fa-cloud-rain'
  },
  godfather: {
    id: 'godfather',
    name: 'Godfather',
    title: 'GODFATHER EXECUTIVE PASS',
    subtitle: 'เจ้าพ่อแห่งค่ำคืน ผู้คุมทุกคดีในเงามืด',
    accent: '#8B0000',
    accentRgb: '139, 0, 0',
    cardBg: 'linear-gradient(145deg, #170404 0%, #320707 55%, #0f0202 100%)',
    borderGlow: 'rgba(139, 0, 0, 0.65)',
    cardBorder: 'rgba(139, 0, 0, 0.55)',
    watermarkIcon: 'fa-crown'
  },
  champion: {
    id: 'champion',
    name: 'Champion',
    title: 'CHAMPION TROPHY PASS',
    subtitle: 'ผู้ยืนหยัดเป็นผู้ชนะเหนือทุกคดีฆาตกรรม',
    accent: '#D97706',
    accentRgb: '217, 119, 6',
    cardBg: 'linear-gradient(145deg, #1b1206 0%, #382405 55%, #130c02 100%)',
    borderGlow: 'rgba(217, 119, 6, 0.65)',
    cardBorder: 'rgba(217, 119, 6, 0.55)',
    watermarkIcon: 'fa-trophy'
  },
  detective: {
    id: 'detective',
    name: 'Master Detective',
    title: 'MASTER DETECTIVE PASS',
    subtitle: 'สมองอันเฉียบแหลมที่มองทะลุทุกคำโกหก',
    accent: '#2563EB',
    accentRgb: '37, 99, 235',
    cardBg: 'linear-gradient(145deg, #061129 0%, #0d2250 55%, #040919 100%)',
    borderGlow: 'rgba(37, 99, 235, 0.65)',
    cardBorder: 'rgba(37, 99, 235, 0.55)',
    watermarkIcon: 'fa-magnifying-glass'
  },
  villain: {
    id: 'villain',
    name: 'Phantom Villain',
    title: 'PHANTOM VILLAIN PASS',
    subtitle: 'สวมหน้ากากฆาตกร หลอกล่อทุกคนอย่างไร้ร่องรอย',
    accent: '#DB2777',
    accentRgb: '219, 39, 119',
    cardBg: 'linear-gradient(145deg, #1d0615 0%, #390d28 55%, #13030c 100%)',
    borderGlow: 'rgba(219, 39, 119, 0.65)',
    cardBorder: 'rgba(219, 39, 119, 0.55)',
    watermarkIcon: 'fa-user-secret'
  },
  veteran: {
    id: 'veteran',
    name: 'Veteran Sleuth',
    title: 'VETERAN SLEUTH PASS',
    subtitle: 'นักเล่นเก๋าเกม ผู้ผ่านสมรภูมิคดีมานับไม่ถ้วน',
    accent: '#7C3AED',
    accentRgb: '124, 58, 237',
    cardBg: 'linear-gradient(145deg, #140825 0%, #281048 55%, #0d041a 100%)',
    borderGlow: 'rgba(124, 58, 237, 0.65)',
    cardBorder: 'rgba(124, 58, 237, 0.55)',
    watermarkIcon: 'fa-medal'
  },
  billionaire: {
    id: 'billionaire',
    name: 'The Billionaire',
    title: 'BILLIONAIRE PASS',
    subtitle: 'มหาเศรษฐีใจถึง ผู้ขับเคลื่อนทุกค่ำคืนด้วยความมั่งคั่ง',
    accent: '#16A34A',
    accentRgb: '22, 163, 74',
    cardBg: 'linear-gradient(145deg, #08190d 0%, #0e321a 55%, #041008 100%)',
    borderGlow: 'rgba(22, 163, 74, 0.65)',
    cardBorder: 'rgba(22, 163, 74, 0.55)',
    watermarkIcon: 'fa-money-bill-wave'
  },
  explorer: {
    id: 'explorer',
    name: 'The Explorer',
    title: 'EXPLORER PASS',
    subtitle: 'ผู้กล้าบุกเบิกคดีใหม่ ไม่เคยหยุดค้นหาความจริง',
    accent: '#059669',
    accentRgb: '5, 150, 105',
    cardBg: 'linear-gradient(145deg, #061914 0%, #0d3529 55%, #030e0b 100%)',
    borderGlow: 'rgba(5, 150, 105, 0.65)',
    cardBorder: 'rgba(5, 150, 105, 0.45)',
    watermarkIcon: 'fa-compass'
  },
  potterhead: {
    id: 'potterhead',
    name: 'PotterHead',
    title: 'WIZARDING PASS',
    subtitle: 'สาวกเวทมนตร์ ถือไม้กายสิทธิ์ร่ายมนตร์คลี่คลายปริศนา',
    accent: '#E11D48',
    accentRgb: '225, 29, 72',
    cardBg: 'linear-gradient(145deg, #1f0810 0%, #3d0c1e 55%, #14030a 100%)',
    borderGlow: 'rgba(225, 29, 72, 0.65)',
    cardBorder: 'rgba(225, 29, 72, 0.55)',
    watermarkIcon: 'fa-wand-magic-sparkles'
  },
  new_era: {
    id: 'new_era',
    name: 'First Party',
    title: 'FIRST PARTY PASS',
    subtitle: 'กลุ่มผู้เล่นกลุ่มแรกที่ได้ใช้งานเว็บไซต์นี้',
    accent: '#06B6D4',
    accentRgb: '6, 182, 212',
    cardBg: 'linear-gradient(145deg, #04161c 0%, #082d3a 55%, #020f14 100%)',
    borderGlow: 'rgba(6, 182, 212, 0.65)',
    cardBorder: 'rgba(6, 182, 212, 0.55)',
    watermarkIcon: 'fa-bolt'
  },
  manager: {
    id: 'manager',
    name: 'Manager',
    title: 'CLUB MANAGER PASS',
    subtitle: 'คุณผู้จัดการร้าน ดูแลทุกรายละเอียด บริหารความสนุกอย่างสมบูรณ์แบบ',
    accent: '#10B981',
    accentRgb: '16, 185, 129',
    cardBg: 'linear-gradient(145deg, #061912 0%, #0c3325 55%, #03110c 100%)',
    borderGlow: 'rgba(16, 185, 129, 0.65)',
    cardBorder: 'rgba(16, 185, 129, 0.55)',
    watermarkIcon: 'fa-user-tie'
  },
  silver: {
    id: 'silver',
    name: 'Silver Player',
    title: 'SILVER SLEUTH PASS',
    subtitle: 'สืบคดีจากร้านไปมากกว่า 50% แล้ว มาถึงครึ่งทางแล้ว ลุยกันต่อ!',
    accent: '#94A3B8',
    accentRgb: '148, 163, 184',
    cardBg: 'linear-gradient(145deg, #131722 0%, #242c3d 55%, #0d1017 100%)',
    borderGlow: 'rgba(148, 163, 184, 0.60)',
    cardBorder: 'rgba(148, 163, 184, 0.50)',
    watermarkIcon: 'fa-star-half-stroke'
  },
  bronze: {
    id: 'bronze',
    name: 'Bronze Player',
    title: 'BRONZE INITIATE PASS',
    subtitle: 'สืบคดีจากร้านไปมากกว่า 30% แล้ว อนาคตยังอีกไกลมีคดีมากมายรอคุณอยู่',
    accent: '#CD7F32',
    accentRgb: '205, 127, 50',
    cardBg: 'linear-gradient(145deg, #1c1106 0%, #36220d 55%, #130b04 100%)',
    borderGlow: 'rgba(205, 127, 50, 0.65)',
    cardBorder: 'rgba(205, 127, 50, 0.55)',
    watermarkIcon: 'fa-award'
  },
  charity: {
    id: 'charity',
    name: 'Charity Chairman',
    title: 'PHILANTHROPIST PASS',
    subtitle: 'ประธานสมาคมการกุศล ใจใหญ่และเปี่ยมด้วยน้ำใจ คอยดูแลทุกคนเสมอ',
    accent: '#BE185D',
    accentRgb: '190, 24, 93',
    cardBg: 'linear-gradient(145deg, #1f0714 0%, #3a0d26 55%, #14040d 100%)',
    borderGlow: 'rgba(190, 24, 93, 0.65)',
    cardBorder: 'rgba(190, 24, 93, 0.55)',
    watermarkIcon: 'fa-heart'
  }
}

THEME_PROFILES.first_party = THEME_PROFILES.new_era;

export default function QRPage({ lineUser, allGames = [], hasActiveOrder = false, showPage }) {
  const [history, setHistory]         = useState([])
  const [copiedText, setCopiedText]   = useState('')
  const [fullscreenQr, setFullscreenQr] = useState(false)

  // Track active achievement theme
  const [activeTheme, setActiveTheme] = useState(() => {
    const stored = localStorage.getItem('sofun_active_theme')
    if (stored && stored !== 'default') return stored
    const docAttr = document.documentElement.getAttribute('data-achievement')
    if (docAttr && docAttr !== 'default') return docAttr
    if (lineUser?.activeAchievement && lineUser.activeAchievement !== 'default') return lineUser.activeAchievement
    if (Array.isArray(lineUser?.pinnedAchievements) && lineUser.pinnedAchievements.length > 0) {
      return lineUser.pinnedAchievements[0]
    }
    return 'default'
  })

  // Sync theme changes from window events
  useEffect(() => {
    const handleThemeSync = () => {
      const stored = localStorage.getItem('sofun_active_theme')
      const docAttr = document.documentElement.getAttribute('data-achievement')
      const effective = (stored && stored !== 'default') ? stored : (docAttr && docAttr !== 'default') ? docAttr : 'default'
      setActiveTheme(effective)
    }
    window.addEventListener('sofun-theme-change', handleThemeSync)
    return () => window.removeEventListener('sofun-theme-change', handleThemeSync)
  }, [])

  // Listen to member doc for activeAchievement updates
  useEffect(() => {
    if (!lineUser?.uid) return
    return onSnapshot(doc(db, 'members', lineUser.uid), snap => {
      if (snap.exists()) {
        const d = snap.data()
        if (d.activeAchievement === 'default' || d.activeAchievement === 'none') {
          setActiveTheme('default')
          return
        }
        const topPinned = Array.isArray(d.pinnedAchievements) && d.pinnedAchievements.length > 0 ? d.pinnedAchievements[0] : null
        const themeId = d.activeAchievement || topPinned || 'default'
        setActiveTheme(themeId)
      }
    })
  }, [lineUser?.uid])

  // Load play history for member
  useEffect(() => {
    if (!lineUser?.uid) return
    const q = query(
      collection(db, 'payments'),
      where('memberUids', 'array-contains', lineUser.uid),
      orderBy('paidAt', 'desc')
    )
    const unsub = onSnapshot(q,
      snap => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {
        const q2 = query(collection(db, 'payments'), orderBy('paidAt', 'desc'))
        onSnapshot(q2, snap => {
          setHistory(snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.memberUids?.includes(lineUser.uid)))
        }, () => {})
      }
    )
    return unsub
  }, [lineUser?.uid])

  // Resolve active theme profile
  const theme = THEME_PROFILES[activeTheme] || THEME_PROFILES.default

  // Get list of member achievements
  const memberAchs = useMemo(() => {
    const raw = lineUser?.achievements || (lineUser?.achievement ? [lineUser.achievement] : [])
    const unique = Array.from(new Set(raw.filter(Boolean)))
    return unique
  }, [lineUser?.achievements, lineUser?.achievement])

  // Copy helper
  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text)
    setCopiedText(label)
    setTimeout(() => setCopiedText(''), 2000)
  }

  if (!lineUser) {
    return (
      <div id="qr-page" className="page active">
        <div className="qr-not-login">
          <i className="fab fa-line" />
          <p>กรุณาเข้าสู่ระบบด้วย LINE ก่อนใช้งาน Member Pass</p>
        </div>
      </div>
    )
  }

  const memberIdTag = `SF-${String(lineUser.uid || '').slice(-6).toUpperCase()}`
  const qrUrl = `${window.location.origin}/?scan=${lineUser.uid}`
  const totalSpent = history.reduce((acc, h) => {
    const myBill = h.memberBills?.find(m => m.uid === lineUser.uid)
    return acc + (myBill?.total ?? h.grandTotal ?? 0)
  }, 0)

  return (
    <div id="qr-page" className="page active" style={{ paddingTop: 60, paddingBottom: 100, background: 'var(--surface-page)' }}>

      <style>{`
        .qr-pass-wrapper {
          position: relative;
          z-index: 30;
          max-width: 440px;
          margin: 0 auto;
          padding: 16px 16px 40px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ── Digital Member Pass Card ── */
        .qr-member-pass {
          position: relative;
          z-index: 40;
          border-radius: 24px;
          padding: 24px 20px 22px;
          color: #ffffff;
          overflow: hidden;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28), 0 0 0 1px ${theme.cardBorder};
          transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .qr-pass-shimmer {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.12), transparent 60%);
          pointer-events: none;
        }

        .qr-pass-watermark {
          position: absolute;
          right: -18px;
          bottom: -22px;
          font-size: 140px;
          opacity: 0.06;
          color: ${theme.accent};
          pointer-events: none;
          transform: rotate(-10deg);
        }

        .qr-target-box {
          position: relative;
          z-index: 50;
          isolation: isolate;
          padding: 14px;
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        /* Corner HUD Brackets */
        .qr-hud-corner {
          position: absolute;
          width: 18px;
          height: 18px;
          border-color: ${theme.accent};
          border-style: solid;
          pointer-events: none;
          filter: drop-shadow(0 0 4px ${theme.accent});
        }
        .qr-hud-tl { top: 6px; left: 6px; border-width: 3px 0 0 3px; border-top-left-radius: 8px; }
        .qr-hud-tr { top: 6px; right: 6px; border-width: 3px 3px 0 0; border-top-right-radius: 8px; }
        .qr-hud-bl { bottom: 6px; left: 6px; border-width: 0 0 3px 3px; border-bottom-left-radius: 8px; }
        .qr-hud-br { bottom: 6px; right: 6px; border-width: 0 3px 3px 0; border-bottom-right-radius: 8px; }

        /* History Card */
        .qr-game-item {
          background: #ffffff;
          border: 1px solid var(--border-default, #e5e7eb);
          border-radius: 16px;
          padding: 14px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          transition: all 0.2s ease;
        }
        .qr-game-item:hover {
          border-color: ${theme.accent};
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.07);
        }
      `}</style>

      <div className="qr-pass-wrapper">

        {/* ── Active Party Order Banner ── */}
        {hasActiveOrder && (
          <div
            onClick={() => showPage?.('order')}
            style={{
              padding: '14px 18px',
              background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.15) 0%, rgba(22, 163, 74, 0.08) 100%)',
              border: '1.5px solid #22c55e',
              borderRadius: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              boxShadow: '0 4px 16px rgba(34, 197, 94, 0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 10,
                background: '#22c55e', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0
              }}>
                <i className="fas fa-utensils" />
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>คุณอยู่ในปาร์ตี้ที่เปิดใช้งานแล้ว</div>
                <div style={{ fontSize: 11.5, color: '#15803d' }}>แตะที่นี่เพื่อไปหน้าสั่งอาหารและเครื่องดื่ม</div>
              </div>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700, color: '#fff',
              background: '#16a34a', padding: '6px 12px',
              borderRadius: 20, whiteSpace: 'nowrap'
            }}>
              สั่งอาหาร <i className="fas fa-arrow-right" style={{ marginLeft: 4 }} />
            </span>
          </div>
        )}

        {/* ── Toast Feedback Notification ── */}
        {copiedText && (
          <div style={{
            position: 'fixed',
            top: 75,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#111827',
            color: '#ffffff',
            padding: '8px 18px',
            borderRadius: 30,
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'fadeIn 0.2s ease'
          }}>
            <i className="fas fa-check-circle" style={{ color: theme.accent }} />
            <span>{copiedText}</span>
          </div>
        )}

        {/* ── DIGITAL MEMBER PASS (The VIP Card) ── */}
        <div
          className="qr-member-pass"
          style={{
            background: theme.cardBg,
            borderColor: theme.cardBorder
          }}
        >
          <div className="qr-pass-shimmer" />
          <i className={`fas ${theme.watermarkIcon} qr-pass-watermark`} />


          {/* Member Avatar & Details */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, position: 'relative', zIndex: 2 }}>
            <div style={{ position: 'relative' }}>
              {lineUser.avatar ? (
                <img
                  src={lineUser.avatar}
                  alt={lineUser.name}
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `3px solid ${theme.accent}`,
                    boxShadow: `0 0 16px ${theme.borderGlow}`
                  }}
                  onError={e => e.currentTarget.style.display = 'none'}
                />
              ) : (
                <div style={{
                  width: 68,
                  height: 68,
                  borderRadius: '50%',
                  background: theme.accent,
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 900,
                  boxShadow: `0 0 16px ${theme.borderGlow}`
                }}>
                  {(lineUser.name || '?')[0]}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {lineUser.name}
              </div>
            </div>
          </div>

          {/* ── Centered High-Tech QR Target ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2 }}>
            <div
              className="qr-target-box"
              onClick={() => setFullscreenQr(true)}
              title="แตะเพื่อขยาย QR เต็มจอ"
            >
              <div className="qr-hud-corner qr-hud-tl" />
              <div className="qr-hud-corner qr-hud-tr" />
              <div className="qr-hud-corner qr-hud-bl" />
              <div className="qr-hud-corner qr-hud-br" />

              <QRCodeSVG
                value={qrUrl}
                size={210}
                bgColor="#ffffff"
                fgColor="#09090f"
                level="M"
                includeMargin={true}
              />
            </div>


            {/* Quick Action Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, width: '100%' }}>
              <button
                onClick={() => setFullscreenQr(true)}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <i className="fas fa-expand" />
                <span>ขยายเต็มจอ</span>
              </button>

              <button
                onClick={() => handleCopy(qrUrl, 'คัดลอกลิงก์สแกนแล้ว')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: `rgba(${theme.accentRgb}, 0.22)`,
                  border: `1px solid rgba(${theme.accentRgb}, 0.5)`,
                  color: theme.accent,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <i className="fas fa-link" />
                <span>คัดลอกลิงก์</span>
              </button>
            </div>
          </div>

          {/* Member Stat Strip */}
          <div style={{
            marginTop: 20,
            paddingTop: 14,
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            textAlign: 'center',
            position: 'relative',
            zIndex: 2
          }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>ลงคดีแล้ว</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', marginTop: 2 }}>
                {history.length} <span style={{ fontSize: 11, color: theme.accent }}>คดี</span>
              </div>
            </div>
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>ความสำเร็จ</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', marginTop: 2 }}>
                {memberAchs.length} <span style={{ fontSize: 11, color: theme.accent }}>รายการ</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>ยอดใช้จ่ายรวม</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', marginTop: 2 }}>
                ฿{totalSpent.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Shortcut to Profile Play History & Bills */}
        <button
          onClick={() => showPage?.('profile')}
          style={{
            width: '100%',
            marginTop: 14,
            padding: '12px 16px',
            borderRadius: 14,
            background: 'var(--surface-card, #f8f8fc)',
            border: '1px solid var(--border-default, #e5e7eb)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all 0.18s'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: `rgba(${theme.accentRgb}, 0.12)`,
              color: theme.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13
            }}>
              <i className="fas fa-history" />
            </span>
            <span>ดูประวัติการลงคดี & บิลย้อนหลัง</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 12 }}>
            {history.length > 0 && <span>{history.length} รายการ</span>}
            <i className="fas fa-chevron-right" style={{ fontSize: 11 }} />
          </span>
        </button>
</div>

      {/* ── Fullscreen QR Zoom Modal ── */}
      {fullscreenQr && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
          onClick={() => setFullscreenQr(false)}
        >
          <div
            style={{
              background: '#ffffff',
              padding: 24,
              borderRadius: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              maxWidth: 360,
              width: '100%',
              boxShadow: `0 0 40px ${theme.borderGlow}`,
              border: `3px solid ${theme.accent}`
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 13, fontWeight: 900, color: theme.accent, letterSpacing: '0.08em', marginBottom: 6 }}>
              {theme.title}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#111827', marginBottom: 16 }}>
              {lineUser.name}
            </div>

            <QRCodeSVG
              value={qrUrl}
              size={260}
              bgColor="#ffffff"
              fgColor="#09090f"
              level="H"
              includeMargin={true}
            />

            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 16, textAlign: 'center' }}>
              แตะส่วนใดก็ได้เพื่อปิดหน้าต่าง
            </div>

            <button
              onClick={() => setFullscreenQr(false)}
              style={{
                marginTop: 18,
                padding: '10px 24px',
                borderRadius: 12,
                background: theme.accent,
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
