import { useState, useEffect, useCallback, useRef } from 'react'
import { collection, onSnapshot, doc, getDoc, updateDoc, query, where } from 'firebase/firestore'
import { getToken, onMessage } from 'firebase/messaging'

import { db, getMessagingInstance, VAPID_KEY } from './firebase'
import liff from '@line/liff'
import Nav from './components/Nav'
import HomePage from './components/HomePage'
import GamesPage from './components/GamesPage'
import DetailPage from './components/DetailPage'
import AdminPage from './components/AdminPage'
import GameModal from './components/GameModal'
import Toast from './components/Toast'
import PartyPage from './components/PartyPage'
import RegisterModal from './components/RegisterModal'
import ProfilePage from './components/ProfilePage'
import QRPage from './components/QRPage'
import ScanModal from './components/ScanModal'
import AdminScanPage from './components/AdminScanPage'
import POSPage, { newPOSSession } from './components/POSPage'
import MemberOrderPage from './components/MemberOrderPage'
import BookingPage from './components/BookingPage'
import RandomWheelPage from './components/RandomWheelPage'
import TierEffect from './components/TierEffect'
import { ACHIEVEMENT_LIST } from './constants/achievements'

const LIFF_ID = import.meta.env.VITE_LIFF_ID || '2008759193-z2og6jZw'

const PAGE_PATHS = ['games', 'party', 'profile', 'qr', 'order', 'adminscan', 'pos', 'admin', 'booking', 'random']

function parseUrl(pathname) {
  const parts = pathname.replace(/^\//, '').split('/')
  const first = parts[0] || ''
  if (first === 'games' && parts[1]) return { page: 'detail', detailId: parts[1] }
  if (PAGE_PATHS.includes(first)) return { page: first, detailId: null }
  return { page: 'home', detailId: null }
}

function buildUrl(page, id = null) {
  if (page === 'home') return '/'
  if (page === 'detail' && id) return `/games/${id}`
  return `/${page}`
}

export default function App() {
  const [currentPage, setCurrentPage] = useState(() => parseUrl(window.location.pathname).page)
  const [prevPage, setPrevPage] = useState('home')
  const [highlightPartyId, setHighlightPartyId] = useState(null)
  const [allGames, setAllGames] = useState([])
  const [allParties, setAllParties] = useState([])
  const [detailId, setDetailId] = useState(() => parseUrl(window.location.pathname).detailId)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingGame, setEditingGame] = useState(null)
  const [toast, setToast] = useState({ msg: '', type: 'success', visible: false })
  const [lineUser, setLineUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sofun_line_user')) } catch { return null }
  })
  const [liffReady, setLiffReady] = useState(false)
  const [liffProfile, setLiffProfile] = useState(null)
  const [showRegister, setShowRegister] = useState(false)
  const [liffLoading, setLiffLoading] = useState(false)
  const [scanUid, setScanUid] = useState(null)
  const [posSessions, setPosSessions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sofun_pos_sessions'))
      if (saved?.sessions?.length > 0) return saved.sessions
    } catch {}
    const s = newPOSSession(); return [s]
  })
  const [posActiveId, setPosActiveId] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sofun_pos_sessions'))
      if (saved?.activeId) return saved.activeId
    } catch {}
    return null
  })
  const [activeMemberOrder, setActiveMemberOrder] = useState(null)
  const liffInitialized = useRef(false)

  // ── Persist POS sessions across refresh ───────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem('sofun_pos_sessions', JSON.stringify({ sessions: posSessions, activeId: posActiveId }))
    } catch {}
  }, [posSessions, posActiveId])

  // ── Handle URL params ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('party')
    const sid = params.get('scan')
    const bid = params.get('booking')
    if (pid) {
      setHighlightPartyId(pid)
      setCurrentPage('party')
      window.history.replaceState({ page: 'party' }, '', '/party')
    }
    if (bid) {
      setCurrentPage('booking')
      window.history.replaceState({ page: 'booking' }, '', `/booking?booking=${bid}`)
    }
    if (sid) {
      setScanUid(sid)
      if (!pid && !bid) window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // ── Sync URL on browser back/forward ──────────────────────────────
  useEffect(() => {
    const handlePop = () => {
      const { page, detailId: did } = parseUrl(window.location.pathname)
      setCurrentPage(page)
      if (did) setDetailId(did)
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  // ── LIFF init on mount ──────────────────────────────────────────
  useEffect(() => {
    if (liffInitialized.current) return
    liffInitialized.current = true

    liff.init({ liffId: LIFF_ID })
      .then(async () => {
        setLiffReady(true)
        if (!liff.isLoggedIn()) return
        try {
          const profile = await liff.getProfile()
          await handleProfileCheck(profile)
        } catch (e) {
          console.warn('Profile check failed:', e.message)
        }
      })
      .catch(err => {
        console.warn('LIFF init failed:', err.message)
        setLiffReady(true)
      })
  }, [])

  // ── ตรวจสอบ member ใน Firestore ────────────────────────────────
  const handleProfileCheck = async (profile) => {
    const snap = await getDoc(doc(db, 'members', profile.userId))
    if (snap.exists()) {
      const data = snap.data()
      // refresh LINE picture URL in Firestore so team section always has fresh URL
      if (profile.pictureUrl) {
        updateDoc(doc(db, 'members', profile.userId), { pictureUrl: profile.pictureUrl }).catch(() => {})
      }
      saveUser({
        uid: profile.userId,
        name: data.nickname || data.firstname || profile.displayName,
        avatar: profile.pictureUrl || '',
        role: data.role || 'member',
        achievement: data.achievement || null,
        achievements: Array.isArray(data.achievements) ? data.achievements
          : data.achievement ? [data.achievement] : [],
      })
    } else {
      // ไม่เคยสมัคร → โชว์ register modal
      setLiffProfile(profile)
      setShowRegister(true)
    }
  }

  const saveUser = (user) => {
    setLineUser(user)
    localStorage.setItem('sofun_line_user', JSON.stringify(user))
    setupFCM(user.uid)
  }

  const setupFCM = async (uid) => {
    try {
      if (!('Notification' in window)) return
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      const messaging = await getMessagingInstance()
      if (!messaging) return
      const token = await getToken(messaging, { vapidKey: VAPID_KEY })
      if (token) {
        updateDoc(doc(db, 'members', uid), { fcmToken: token }).catch(() => {})
      }
      onMessage(messaging, payload => {
        showToast(payload.notification?.body || 'แจ้งเตือนใหม่')
      })
    } catch (e) {
      console.warn('FCM setup:', e.message)
    }
  }

  // ── กดปุ่ม LINE Login ────────────────────────────────────────────
  const handleLineLogin = useCallback(async () => {
    if (!liffReady) return
    setLiffLoading(true)
    try {
      if (!liff.isLoggedIn()) {
        // redirect กลับมาหน้าเดิม
        liff.login({ redirectUri: window.location.href })
        return
      }
      const profile = await liff.getProfile()
      await handleProfileCheck(profile)
    } catch (err) {
      console.error('Login error:', err)
      showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error')
    } finally {
      setLiffLoading(false)
    }
  }, [liffReady])

  // ── Logout ────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    localStorage.removeItem('sofun_line_user')
    setLineUser(null)
    if (liffReady && liff.isLoggedIn()) {
      liff.logout()
    }
  }, [liffReady])

  // ── Apply achievement theme to <html> — pick highest-rarity owned ──
  useEffect(() => {
    const achs = lineUser?.achievements || (lineUser?.achievement ? [lineUser.achievement] : [])
    const top = ACHIEVEMENT_LIST.find(a => achs.includes(a.id))
    if (top) {
      document.documentElement.setAttribute('data-achievement', top.id)
    } else {
      document.documentElement.removeAttribute('data-achievement')
    }
  }, [lineUser?.achievements, lineUser?.achievement])

  // ── Live-sync achievements from Firestore (admin may update them) ───
  useEffect(() => {
    const uid = lineUser?.uid
    if (!uid || lineUser?.role === 'admin') return
    return onSnapshot(doc(db, 'members', uid), snap => {
      if (!snap.exists()) return
      const d = snap.data()
      const achievement = d.achievement || null
      const achievements = Array.isArray(d.achievements) ? d.achievements
        : achievement ? [achievement] : []
      setLineUser(prev => {
        if (!prev) return prev
        const same = prev.achievement === achievement
          && JSON.stringify(prev.achievements) === JSON.stringify(achievements)
        if (same) return prev
        const updated = { ...prev, achievement, achievements }
        localStorage.setItem('sofun_line_user', JSON.stringify(updated))
        return updated
      })
    })
  }, [lineUser?.uid])

  // ── Scripts ────────────────────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(collection(db, 'scripts'), snap => {
      setAllGames(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // ── Parties (single source of truth) ───────────────────────────────
  useEffect(() => {
    return onSnapshot(collection(db, 'parties'), snap => {
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setAllParties(sorted)
    })
  }, [])

  // ── Block non-admin from admin-only pages ──────────────────────────
  useEffect(() => {
    if (lineUser && lineUser.role !== 'admin') {
      if (['pos', 'admin', 'adminscan'].includes(currentPage)) {
        setCurrentPage('home')
        window.history.replaceState({ page: 'home' }, '', '/')
      }
    }
  }, [currentPage, lineUser?.role])

  // ── Active order for current member (non-admin) ─────────────────────
  useEffect(() => {
    const uid = lineUser?.uid
    if (!uid || lineUser?.role === 'admin') { setActiveMemberOrder(null); return }
    const q = query(collection(db, 'orders'), where('memberUids', 'array-contains', uid))
    return onSnapshot(q, snap => {
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .find(o => o.status === 'active')
      setActiveMemberOrder(active || null)
    }, () => setActiveMemberOrder(null))
  }, [lineUser?.uid, lineUser?.role])

  // ── Redirect to QR if order closes while on order page ─────────────
  useEffect(() => {
    if (currentPage === 'order' && !activeMemberOrder) {
      setCurrentPage('qr')
      window.history.replaceState({ page: 'qr' }, '', '/qr')
    }
  }, [activeMemberOrder, currentPage])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type, visible: true })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000)
  }, [])

  const showPage = useCallback((page) => {
    setPrevPage(p => p)
    setCurrentPage(page)
    window.history.pushState({ page }, '', buildUrl(page))
    window.scrollTo(0, 0)
  }, [])

  const showDetail = useCallback((id) => {
    setDetailId(id)
    setCurrentPage('detail')
    window.history.pushState({ page: 'detail', detailId: id }, '', `/games/${id}`)
    window.scrollTo(0, 0)
  }, [])

  return (
    <>
      <Nav
        currentPage={currentPage}
        showPage={showPage}
        lineUser={lineUser}
        onLogin={handleLineLogin}
        onLogout={handleLogout}
        liffLoading={liffLoading}
        hasActiveOrder={!!activeMemberOrder}
      />

      {currentPage === 'home' && <HomePage allGames={allGames} allParties={allParties} showPage={showPage} lineUser={lineUser} />}
      {currentPage === 'games' && <GamesPage allGames={allGames} showDetail={showDetail} />}
      {currentPage === 'detail' && <DetailPage id={detailId} showPage={showPage} showDetail={showDetail} allGames={allGames} lineUser={lineUser} />}
      {currentPage === 'party' && <PartyPage user={lineUser} allGames={allGames} parties={allParties} highlightPartyId={highlightPartyId} />}
      {currentPage === 'profile' && <ProfilePage lineUser={lineUser} onLogout={handleLogout} showPage={showPage} />}
      {currentPage === 'qr' && <QRPage lineUser={lineUser} />}
      {currentPage === 'order' && activeMemberOrder && (
        <MemberOrderPage lineUser={lineUser} activeOrder={activeMemberOrder} showToast={showToast} />
      )}
      {currentPage === 'adminscan' && lineUser?.role === 'admin' && <AdminScanPage lineUser={lineUser} allGames={allGames} showToast={showToast} onScanSuccess={(uid) => { setScanUid(uid); showPage('pos') }} onOpenPOS={() => { setScanUid(null); showPage('pos') }} />}
      {currentPage === 'pos' && lineUser?.role === 'admin' && (
        <POSPage
          initialUid={scanUid}
          adminUser={lineUser}
          allGames={allGames}
          showToast={showToast}
          sessions={posSessions}
          activeId={posActiveId}
          onSessionsChange={setPosSessions}
          onActiveIdChange={setPosActiveId}
          onScanConsumed={() => setScanUid(null)}
          onClose={() => { setScanUid(null); showPage('adminscan') }}
        />
      )}
      {currentPage === 'booking' && <BookingPage lineUser={lineUser} allGames={allGames} showToast={showToast} onLogin={handleLineLogin} />}
      {currentPage === 'random' && <RandomWheelPage lineUser={lineUser} showToast={showToast} showPage={showPage} />}
      {currentPage === 'admin' && (
        <AdminPage
          showToast={showToast}
          openModal={() => { setEditingGame(null); setModalOpen(true) }}
          openEdit={(g) => { setEditingGame(g); setModalOpen(true) }}
          allGames={allGames}
          allParties={allParties}
        />
      )}

      {modalOpen && (
        <GameModal
          editingGame={editingGame}
          onClose={() => setModalOpen(false)}
          showToast={showToast}
        />
      )}

      {showRegister && liffProfile && (
        <RegisterModal
          profile={liffProfile}
          onSuccess={(user) => {
            saveUser(user)
            setShowRegister(false)
            setLiffProfile(null)
          }}
          onClose={() => {
            setShowRegister(false)
            setLiffProfile(null)
          }}
        />
      )}

      {scanUid && lineUser?.role === 'admin' && (
        <ScanModal
          scannedUid={scanUid}
          adminUser={lineUser}
          allGames={allGames}
          onClose={() => setScanUid(null)}
          showToast={showToast}
        />
      )}

      {(() => {
        if (lineUser?.role === 'admin') return null
        if (currentPage === 'qr') return null
        const achs = lineUser?.achievements || (lineUser?.achievement ? [lineUser.achievement] : [])
        const tier = ['golden', 'silver', 'bronze', 'sadness', 'hunger', 'billionaire', 'charity'].find(t => achs.includes(t))
        return tier ? <TierEffect tier={tier} /> : null
      })()}

      <Toast msg={toast.msg} type={toast.type} visible={toast.visible} />
    </>
  )
}
