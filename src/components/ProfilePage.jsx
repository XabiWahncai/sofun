import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_RARITY, RARITY } from '../constants/achievements'
import { convertImageUrl } from '../utils/imageUrl'
import { isSpecialEventGame, isSpecialEventHistory } from '../utils/achievementTierSync'

const C = 'var(--red, #c62419)'
const INK = '#1a1a1a'
const INK_2 = 'rgba(26,26,26,0.65)'
const INK_3 = 'rgba(26,26,26,0.4)'
const PAPER = '#faf7f5'
const BORDER = 'rgba(26,26,26,0.08)'
const BORDER_2 = 'rgba(26,26,26,0.14)'

const MAX_PINNED = 5

const p2 = n => String(Math.round(n)).padStart(2, '0')
const fmtDT = d => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${p2(dt.getMonth()+1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}`
}

function buildReceiptHTML(h, meUid) {
  const myBill = h.memberBills?.find(m => m.uid === meUid)
  const me = h.members?.find(m => m.uid === meUid)
  const paidAt = h.paidAt?.toDate?.()
  const serial = h.serial ? String(h.serial).padStart(10, '0') : '-'
  const discAmt = h.discount?.applied || 0
  const myTotal = myBill?.total ?? h.grandTotal ?? 0
  const tax = myTotal * 7 / 107
  const subtotal = myTotal - tax

  const itemRows = []
  if ((h.gameUnitPrice || 0) > 0) {
    itemRows.push(`<tr><td>${h.scriptTitle || 'เกม'} ×${h.members?.length || 1}</td><td class="r">${(h.gameTotal||0).toFixed(2)}</td></tr>`)
  }
  ;(myBill?.foodItems || h.foodItems || []).forEach(fi => {
    const addStr = fi.addons?.length ? ` (${fi.addons.map(a => a.name||a).join(',')})` : ''
    itemRows.push(`<tr><td>${fi.name}${addStr} ×${fi.qty}</td><td class="r">${((fi.price||0)*fi.qty).toFixed(2)}</td></tr>`)
  })

  return `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8"><title>Receipt #${serial}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;color:#000;background:#fff;width:302px;margin:0 auto;padding:10px 8px}
.c{text-align:center}.b{font-weight:bold}.big{font-size:15px}
.sep{border:none;border-top:1px dashed #000;margin:5px 0}
table{width:100%;border-collapse:collapse}
td{padding:2px 0;vertical-align:top}
td.r{text-align:right;white-space:nowrap;padding-left:6px}
.foot{font-size:10px;text-align:center}
@media print{@page{margin:0;size:80mm auto}body{width:80mm}}
</style></head><body>
<div class="c b big">Sofun Club Co., Ltd.</div>
<div class="c">บริษัท โซฟัน จำกัด</div>
<div class="c">สาขาอาร์ซีเอ (RCA)</div>
<div>Serial: ${serial}</div>
<div>Date: ${fmtDT(paidAt)}</div>
<hr class="sep">
<div class="c">ROOM: ${h.room || '-'} | ${h.members?.length || 1} คน</div>
${me?.character ? `<div class="c">บทบาท: ${me.character}</div>` : ''}
<hr class="sep">
<div class="c b">รายการ</div>
<table>${itemRows.join('')}${discAmt > 0 ? `<tr><td>Discount</td><td class="r">-${discAmt.toFixed(2)}</td></tr>` : ''}</table>
<hr class="sep">
<table>
<tr><td>Subtotal:</td><td class="r">${subtotal.toFixed(2)}</td></tr>
<tr><td>Tax (7%):</td><td class="r">${tax.toFixed(2)}</td></tr>
<tr class="b"><td>ยอดของคุณ:</td><td class="r">${myTotal.toFixed(2)}</td></tr>
</table>
<hr class="sep">
<div>[PAID]</div>
${h.ending ? `<div>ผลเกม: ${h.ending}</div>` : ''}
<br>
<div class="foot">
<div>21/81 ซอยศูนย์วิจัย แขวงบางกะปิ เขตห้วยขวาง</div>
<div>กรุงเทพ 10310</div>
<div>Tax ID No.0105565117207</div>
<div>www.sofunclub.com</div>
<div>Tel +66 0814661166</div>
<div>Thank you very much!</div>
</div>
</body></html>`
}

function printBill(h, meUid) {
  const html = buildReceiptHTML(h, meUid)
  const w = window.open('', '_blank', 'width=440,height=720')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

export default function ProfilePage({ lineUser, onLogout, showPage, allGames = [] }) {
  // Tab menu bar state (default to 'dashboard')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [playHistory, setPlayHistory] = useState([])

  // Form states
  const [form, setForm] = useState({
    nickname: '', firstname: '', lastname: '',
    tel_no: '', email: '', birthday: '', gender: '', position: ''
  })
  const [pictureUrl, setPictureUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copiedText, setCopiedText] = useState('')

  // Achievements & Themes
  const [myAchievements, setMyAchievements] = useState([])
  const [pinned, setPinned] = useState([])
  const [activeTheme, setActiveTheme] = useState(() => {
    const s = localStorage.getItem('sofun_active_theme')
    return (s && s !== 'default' && s !== 'none') ? s : null
  })

  useEffect(() => {
    const handleSync = () => {
      const s = localStorage.getItem('sofun_active_theme')
      setActiveTheme((s && s !== 'default' && s !== 'none') ? s : null)
    }
    window.addEventListener('sofun-theme-change', handleSync)
    return () => window.removeEventListener('sofun-theme-change', handleSync)
  }, [])

  const [pinnedSaved, setPinnedSaved] = useState(false)
  const [pinnedSaving, setPinnedSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [snapshot, setSnapshot] = useState(null)
  const [editingAch, setEditingAch] = useState(false)
  const [pinnedSnapshot, setPinnedSnapshot] = useState(null)

  // Play History & Bills
  const [history, setHistory]         = useState([])
  const [expandedMap, setExpandedMap] = useState({})
  const [search, setSearch]           = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  const toggleExpanded = id => setExpandedMap(prev => ({ ...prev, [id]: !prev[id] }))

  // Load member data
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

        const fp = Array.isArray(d.pinnedAchievements) ? d.pinnedAchievements : []
        setPinned(fp.filter(id => owned.includes(id)))
        if (d.activeAchievement && d.activeAchievement !== 'default' && d.activeAchievement !== 'none') {
          setActiveTheme(d.activeAchievement)
          localStorage.setItem('sofun_active_theme', d.activeAchievement)
        } else if (d.activeAchievement === 'default' || d.activeAchievement === 'none') {
          setActiveTheme(null)
          localStorage.removeItem('sofun_active_theme')
        } else if (fp.length > 0) {
          setActiveTheme(fp[0])
          localStorage.setItem('sofun_active_theme', fp[0])
        } else {
          setActiveTheme(null)
          localStorage.removeItem('sofun_active_theme')
        }
      }
    }).finally(() => setLoading(false))
  }, [lineUser])

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

  // Load playHistory for member (live sessions & retroactive records)
  useEffect(() => {
    if (!lineUser?.uid) return
    const q = query(
      collection(db, 'playHistory'),
      where('userId', '==', lineUser.uid)
    )
    return onSnapshot(q, snap => {
      setPlayHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, err => console.warn('playHistory listener error:', err.message))
  }, [lineUser?.uid])

  // Extract month filter options
  const monthOptions = useMemo(() => {
    const seen = new Set()
    const opts = []
    history.forEach(h => {
      const d = h.paidAt?.toDate?.()
      if (!d) return
      const key = `${d.getFullYear()}-${p2(d.getMonth()+1)}`
      if (!seen.has(key)) {
        seen.add(key)
        opts.push({ key, label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) })
      }
    })
    return opts
  }, [history])

  // Filter history
  const filtered = useMemo(() => history.filter(h => {
    if (search) {
      if (!(h.scriptTitle || '').toLowerCase().includes(search.toLowerCase())) return false
    }
    if (filterMonth) {
      const d = h.paidAt?.toDate?.()
      if (!d) return false
      if (`${d.getFullYear()}-${p2(d.getMonth()+1)}` !== filterMonth) return false
    }
    return true
  }), [history, search, filterMonth])

  // Total spent calculation
  const totalSpent = useMemo(() => {
    return history.reduce((acc, h) => {
      const myBill = h.memberBills?.find(m => m.uid === lineUser?.uid)
      return acc + (myBill?.total ?? h.grandTotal ?? 0)
    }, 0)
  }, [history, lineUser?.uid])

  // Game map lookup for rapid cross-referencing
  const gameMap = useMemo(() => {
    const map = new Map()
    allGames.forEach(g => {
      if (g.id) map.set(String(g.id), g)
      if (g._id) map.set(String(g._id), g)
      if (g.title) {
        const raw = g.title.trim().toLowerCase()
        map.set(raw, g)
        map.set(raw.replace(/\s+/g, ''), g)
      }
    })
    return map
  }, [allGames])

  // Total valid store games (excluding Special Event)
  const totalStoreGames = useMemo(() => {
    return allGames.filter(g => !g.isDeleted && !g.archived && !isSpecialEventGame(g)).length
  }, [allGames])

  // Unique played games calculation (combining playHistory and payments history, excluding Special Event)
  const uniquePlayedGames = useMemo(() => {
    const set = new Set()
    playHistory.forEach(p => {
      if (isSpecialEventHistory(p)) return
      const sid = p.scriptId ? String(p.scriptId) : null
      const title = p.scriptTitle ? p.scriptTitle.trim().toLowerCase() : null
      const g = (sid && gameMap.get(sid)) || (title && gameMap.get(title))
      if (g && isSpecialEventGame(g)) return
      const id = g ? String(g.id || g._id) : (sid || title)
      if (id && id.toLowerCase() !== 'vqpyqhfwsbq3niklsqtc') set.add(id)
    })
    history.forEach(h => {
      if (isSpecialEventHistory(h)) return
      const sid = h.scriptId ? String(h.scriptId) : null
      const title = h.scriptTitle ? h.scriptTitle.trim().toLowerCase() : null
      const g = (sid && gameMap.get(sid)) || (title && gameMap.get(title))
      if (g && isSpecialEventGame(g)) return
      const id = g ? String(g.id || g._id) : (sid || title)
      if (id && id.toLowerCase() !== 'vqpyqhfwsbq3niklsqtc') set.add(id)
    })
    return set
  }, [playHistory, history, gameMap])

  const storePlayedPercentage = useMemo(() => {
    if (totalStoreGames === 0) return 0
    return Math.min(100, Number(((uniquePlayedGames.size / totalStoreGames) * 100).toFixed(1)))
  }, [uniquePlayedGames.size, totalStoreGames])

  // 1. Ending Statistics Breakdown
  const endingStats = useMemo(() => {
    const counts = {}
    let total = 0
    history.forEach(h => {
      if (!h.ending) return
      const raw = String(h.ending).trim().toLowerCase()
      let label = h.ending
      let color = '#d97706'
      let icon = 'fa-flag-checkered'
      let bg = 'rgba(245, 158, 11, 0.12)'

      if (raw.includes('true')) {
        label = 'True Ending (สมบูรณ์)'
        color = '#10b981'
        icon = 'fa-circle-check'
        bg = 'rgba(16, 185, 129, 0.12)'
      } else if (raw.includes('bad')) {
        label = 'Bad Ending (หายนะ)'
        color = '#ef4444'
        icon = 'fa-circle-xmark'
        bg = 'rgba(239, 68, 68, 0.12)'
      } else if (raw.includes('normal')) {
        label = 'Normal Ending (ปกติ)'
        color = '#6366f1'
        icon = 'fa-circle-half-stroke'
        bg = 'rgba(99, 102, 241, 0.12)'
      } else if (raw.includes('win') || raw.includes('ชนะ')) {
        label = 'ชนะคดี'
        color = '#059669'
        icon = 'fa-trophy'
        bg = 'rgba(5, 150, 105, 0.12)'
      } else if (raw.includes('lose') || raw.includes('แพ้')) {
        label = 'แพ้คดี'
        color = '#dc2626'
        icon = 'fa-skull'
        bg = 'rgba(220, 38, 38, 0.12)'
      }

      if (!counts[label]) {
        counts[label] = { label, count: 0, color, icon, bg }
      }
      counts[label].count++
      total++
    })

    const list = Object.values(counts).map(item => ({
      ...item,
      percentage: total > 0 ? ((item.count / total) * 100).toFixed(1) : '0'
    })).sort((a, b) => b.count - a.count)

    return { list, total }
  }, [history])

// Genre definitions and mapping for player dashboard breakdown
const PROFILE_GENRE_DEFINITIONS = {
  detective: {
    id: 'detective',
    labelTh: 'สืบสวน',
    labelEn: 'Detective',
    display: 'สืบสวน (Detective)',
    color: '#2563eb',
    icon: 'fa-magnifying-glass'
  },
  drama: {
    id: 'drama',
    labelTh: 'ดราม่า',
    labelEn: 'Drama',
    display: 'ดราม่า (Drama)',
    color: '#e11d48',
    icon: 'fa-masks-theater'
  },
  comedy: {
    id: 'comedy',
    labelTh: 'คอมเมดี้',
    labelEn: 'Comedy',
    display: 'คอมเมดี้ (Comedy)',
    color: '#d97706',
    icon: 'fa-face-laugh-beam'
  },
  horror: {
    id: 'horror',
    labelTh: 'สยองขวัญ',
    labelEn: 'Horror',
    display: 'สยองขวัญ (Horror)',
    color: '#991b1b',
    icon: 'fa-ghost'
  },
  fantasy: {
    id: 'fantasy',
    labelTh: 'แฟนตาซี',
    labelEn: 'Fantasy',
    display: 'แฟนตาซี (Fantasy)',
    color: '#7c3aed',
    icon: 'fa-wand-magic-sparkles'
  },
  romance: {
    id: 'romance',
    labelTh: 'โรแมนติก',
    labelEn: 'Romance',
    display: 'โรแมนติก (Romance)',
    color: '#db2777',
    icon: 'fa-heart'
  },
  scifi: {
    id: 'scifi',
    labelTh: 'ไซไฟ',
    labelEn: 'Sci-Fi',
    display: 'ไซไฟ (Sci-Fi)',
    color: '#0891b2',
    icon: 'fa-rocket'
  },
  thriller: {
    id: 'thriller',
    labelTh: 'ระทึกขวัญ',
    labelEn: 'Thriller',
    display: 'ระทึกขวัญ (Thriller)',
    color: '#475569',
    icon: 'fa-bolt'
  },
  action: {
    id: 'action',
    labelTh: 'แอ็กชัน',
    labelEn: 'Action',
    display: 'แอ็กชัน (Action)',
    color: '#ea580c',
    icon: 'fa-fire'
  },
  history: {
    id: 'history',
    labelTh: 'ย้อนยุค',
    labelEn: 'History',
    display: 'ย้อนยุค (History)',
    color: '#854d0e',
    icon: 'fa-landmark'
  }
}

const PROFILE_GENRE_MAP = {
  detective: 'detective',
  สืบสวน: 'detective',
  สืบสวนสอบสวน: 'detective',
  drama: 'drama',
  ดราม่า: 'drama',
  draman: 'drama',
  comedy: 'comedy',
  คอมเมดี้: 'comedy',
  ตลก: 'comedy',
  commady: 'comedy',
  horror: 'horror',
  สยองขวัญ: 'horror',
  ผี: 'horror',
  fantasy: 'fantasy',
  แฟนตาซี: 'fantasy',
  romance: 'romance',
  โรแมนติก: 'romance',
  ความรัก: 'romance',
  'sci-fi': 'scifi',
  scifi: 'scifi',
  ไซไฟ: 'scifi',
  thriller: 'thriller',
  ระทึกขวัญ: 'thriller',
  action: 'action',
  แอ็กชัน: 'action',
  แอ็คชั่น: 'action',
  history: 'history',
  ย้อนยุค: 'history',
  ประวัติศาสตร์: 'history'
}

  // 2. Genre / Category Statistics Breakdown
  const categoryStats = useMemo(() => {
    const counts = {}
    let totalTagsCount = 0
    const countedGameIds = new Set()

    const allPlayed = [
      ...playHistory.map(p => ({ scriptId: p.scriptId, scriptTitle: p.scriptTitle })),
      ...history.map(h => ({ scriptId: h.scriptId, scriptTitle: h.scriptTitle }))
    ]

    allPlayed.forEach(item => {
      if (isSpecialEventHistory(item)) return
      const sid = item.scriptId ? String(item.scriptId) : null
      const rawTitle = item.scriptTitle ? item.scriptTitle.trim().toLowerCase() : null
      const normTitle = rawTitle ? rawTitle.replace(/\s+/g, '') : null
      const g = (sid && gameMap.get(sid)) ||
                (rawTitle && gameMap.get(rawTitle)) ||
                (normTitle && gameMap.get(normTitle))
      if (g && isSpecialEventGame(g)) return
      const gid = g ? String(g.id || g._id) : (sid || rawTitle)
      if (!gid || gid.toLowerCase() === 'vqpyqhfwsbq3niklsqtc' || countedGameIds.has(gid)) return
      countedGameIds.add(gid)

      // Collect raw genre tags from game record
      let rawTags = []
      if (Array.isArray(g?.tags) && g.tags.length > 0) {
        rawTags = g.tags
      } else if (Array.isArray(g?.genres) && g.genres.length > 0) {
        rawTags = g.genres
      } else if (g?.category && typeof g.category === 'string') {
        rawTags = [g.category]
      } else if (g?.genre && typeof g.genre === 'string') {
        rawTags = [g.genre]
      }

      // Map into normalized genre IDs (deduplicating genres for the same game)
      const gameGenreIds = new Set()
      rawTags.forEach(t => {
        const key = String(t).trim().toLowerCase()
        const gId = PROFILE_GENRE_MAP[key]
        if (gId) gameGenreIds.add(gId)
      })

      // Fallback: if game has no recognizable genre tags, default to detective
      if (gameGenreIds.size === 0) {
        gameGenreIds.add('detective')
      }

      gameGenreIds.forEach(gId => {
        if (!counts[gId]) {
          const def = PROFILE_GENRE_DEFINITIONS[gId] || {
            id: gId,
            labelTh: gId,
            labelEn: gId,
            display: gId,
            color: '#7c3aed',
            icon: 'fa-masks-theater'
          }
          counts[gId] = {
            id: gId,
            category: def.display,
            labelTh: def.labelTh,
            labelEn: def.labelEn,
            color: def.color,
            icon: def.icon,
            count: 0
          }
        }
        counts[gId].count++
        totalTagsCount++
      })
    })

    const uniqueGamesCount = countedGameIds.size

    const list = Object.values(counts).map(item => ({
      ...item,
      percentage: totalTagsCount > 0 ? ((item.count / totalTagsCount) * 100).toFixed(1) : '0',
      gamePercentage: uniqueGamesCount > 0 ? ((item.count / uniqueGamesCount) * 100).toFixed(1) : '0'
    })).sort((a, b) => b.count - a.count)

    return { list, total: totalTagsCount, uniqueGamesCount }
  }, [playHistory, history, gameMap])

  // 3. Top Co-Players / Party Mates Leaderboard
  const topFriends = useMemo(() => {
    const map = new Map()
    history.forEach(h => {
      const members = h.members || []
      members.forEach(m => {
        if (!m.uid || m.uid === lineUser?.uid) return
        if (!map.has(m.uid)) {
          map.set(m.uid, {
            uid: m.uid,
            name: m.name || 'สหายนักสืบ',
            avatar: m.avatar || '',
            count: 0,
            recentGames: []
          })
        }
        const f = map.get(m.uid)
        f.count++
        if (h.scriptTitle && !f.recentGames.includes(h.scriptTitle)) {
          f.recentGames.push(h.scriptTitle)
        }
      })
    })

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [history, lineUser?.uid])

  // 4. Top Food & Drink Orders Leaderboard
  const topFoodItems = useMemo(() => {
    const map = new Map()
    history.forEach(h => {
      const myBill = h.memberBills?.find(b => b.uid === lineUser?.uid)
      let itemsToCount = []

      if (myBill?.foodItems && myBill.foodItems.length > 0) {
        itemsToCount = myBill.foodItems
      } else if (h.foodItems && h.foodItems.length > 0 && (!h.members || h.members.length === 1)) {
        itemsToCount = h.foodItems
      }

      itemsToCount.forEach(item => {
        const rawName = item.name || item.title
        if (!rawName) return
        const name = rawName.trim()
        if (name.includes('มัดจำ') || name.includes('ส่วนลด') || name.includes('Discount')) return

        const qty = Number(item.qty || item.quantity || 1)
        const price = Number(item.price || item.unitPrice || 0)

        if (!map.has(name)) {
          map.set(name, {
            name,
            count: 0,
            totalSpent: 0
          })
        }
        const f = map.get(name)
        f.count += qty
        f.totalSpent += (price * qty)
      })
    })

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [history, lineUser?.uid])

  // Resolve game poster image helper
  const getGameCover = (h) => {
    if (h.scriptImage || h.gameImage) return convertImageUrl(h.scriptImage || h.gameImage, 200)
    if (allGames?.length > 0) {
      const matched = allGames.find(g =>
        (h.scriptId && g.id === h.scriptId) ||
        (h.scriptTitle && g.title === h.scriptTitle) ||
        (h.scriptTitle && g.name === h.scriptTitle)
      )
      if (matched?.image || matched?.coverUrl) {
        return convertImageUrl(matched.image || matched.coverUrl, 200)
      }
    }
    return null
  }

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

  const moveToFirst = (id) => {
    setPinned(prev => [id, ...prev.filter(x => x !== id)])
  }

  const movePinned = (from, to) => {
    setPinned(prev => {
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const savePinned = async () => {
    setPinnedSaving(true)
    const primaryTheme = pinned.length > 0 ? pinned[0] : null
    try {
      await updateDoc(doc(db, 'members', lineUser.uid), {
        pinnedAchievements: pinned,
        activeAchievement: primaryTheme || 'default'
      })
      if (primaryTheme) {
        localStorage.setItem('sofun_active_theme', primaryTheme)
        document.documentElement.setAttribute('data-achievement', primaryTheme)
        setActiveTheme(primaryTheme)
      } else {
        localStorage.removeItem('sofun_active_theme')
        document.documentElement.removeAttribute('data-achievement')
        setActiveTheme(null)
      }
      window.dispatchEvent(new Event('sofun-theme-change'))
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

  const resetToDefaultTheme = async () => {
    setPinnedSaving(true)
    try {
      await updateDoc(doc(db, 'members', lineUser.uid), {
        activeAchievement: 'default'
      })
      localStorage.removeItem('sofun_active_theme')
      document.documentElement.removeAttribute('data-achievement')
      setActiveTheme(null)
      window.dispatchEvent(new Event('sofun-theme-change'))
      setPinnedSaved(true)
      setTimeout(() => setPinnedSaved(false), 2000)
    } catch (e) {
      alert('บันทึกล้มเหลว: ' + e.message)
    } finally {
      setPinnedSaving(false)
    }
  }

  const startEditAch = () => { setPinnedSnapshot(pinned); setEditingAch(true) }
  const cancelEditAch = () => { if (pinnedSnapshot) setPinned(pinnedSnapshot); setEditingAch(false); setPinnedSnapshot(null) }

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text)
    setCopiedText(label)
    setTimeout(() => setCopiedText(''), 2000)
  }

  const avatarLetter = (form.nickname || form.firstname || lineUser?.name || '?')[0].toUpperCase()
  const memberIdTag = `SF-${String(lineUser?.uid || '').slice(-6).toUpperCase()}`

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

  const TABS = [
    { id: 'dashboard',    label: 'Dashboard',   shortLabel: 'Dashboard', icon: 'fa-chart-pie' },
    { id: 'history',      label: 'คดี & บิล',   shortLabel: 'คดี & บิล', icon: 'fa-history',   badge: history.length > 0 ? history.length : null },
    { id: 'achievements', label: 'ความสำเร็จ', shortLabel: 'ความสำเร็จ', icon: 'fa-award',     badge: myAchievements.length > 0 ? myAchievements.length : null },
    { id: 'info',         label: 'ข้อมูลส่วนตัว', shortLabel: 'ข้อมูล',    icon: 'fa-user' },
    { id: 'account',      label: 'บัญชี',       shortLabel: 'บัญชี',    icon: 'fa-shield-halved' }
  ]

  return (
    <div style={{ background: PAPER, minHeight: '100vh', paddingTop: 60, paddingBottom: 80, fontFamily: "'Sarabun', sans-serif" }}>
      <style>{`
        .pp-input:focus { border-color: ${C} !important; box-shadow: 0 0 0 3px ${C}18 !important; }
        .pp-select:focus { border-color: ${C} !important; box-shadow: 0 0 0 3px ${C}18 !important; }
        .pp-btn-primary:hover:not(:disabled) { background: #9a1c13 !important; box-shadow: 0 8px 24px ${C}48 !important; transform: translateY(-1px); }
        .pp-btn-ghost:hover { background: ${PAPER} !important; color: ${INK} !important; }
        .pp-ach-card { transition: all 0.18s; cursor: pointer; }
        .pp-ach-card:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(26,26,26,0.1); }
        .profile-history-card {
          background: #ffffff;
          border: 1px solid ${BORDER};
          border-radius: 16px;
          padding: 14px;
          box-shadow: 0 2px 8px rgba(26,26,26,0.04);
          transition: all 0.2s ease;
        }
        .profile-history-card:hover {
          border-color: ${C}30;
          box-shadow: 0 4px 16px rgba(26,26,26,0.08);
        }
        .profile-main-wrap {
          max-width: 720px;
          margin: 0 auto;
          padding: 0 16px;
        }
        @media (max-width: 480px) {
          .profile-main-wrap {
            padding: 0 10px;
          }
        }
        .pp-tabs-container {
          margin-top: 18px;
          background: #ffffff;
          border-radius: 16px;
          padding: 5px;
          border: 1px solid ${BORDER};
          box-shadow: 0 2px 8px rgba(26,26,26,0.04);
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 4px;
          width: 100%;
          box-sizing: border-box;
        }
        .pp-tab-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 8px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-family: 'Sarabun', sans-serif;
          transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
          outline: none;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
        }
        .pp-tab-icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pp-tab-label-full {
          display: inline;
        }
        .pp-tab-label-short {
          display: none;
        }
        @media (max-width: 600px) {
          .pp-tabs-container {
            padding: 4px;
            gap: 2px;
            border-radius: 14px;
          }
          .pp-tab-btn {
            flex-direction: column;
            gap: 3px;
            padding: 7px 2px;
            border-radius: 10px;
          }
          .pp-tab-btn i {
            font-size: 13.5px !important;
          }
          .pp-tab-label-full {
            display: none;
          }
          .pp-tab-label-short {
            display: inline;
          }
          .pp-tab-btn .pp-tab-text {
            font-size: 10px !important;
            font-weight: 700 !important;
            letter-spacing: -0.02em !important;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            line-height: 1.1;
          }
          .pp-tab-badge {
            top: -5px !important;
            right: -8px !important;
            min-width: 13px !important;
            height: 13px !important;
            font-size: 8px !important;
            padding: 0 2px !important;
          }
        }
      `}</style>

      <div className="profile-main-wrap">

        {/* HERO CARD */}
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
              {pinned.map((id, idx) => {
                const ach = ACHIEVEMENTS[id]
                if (!ach) return null
                const rar = RARITY[ach.rarity]
                const isPrimary = (activeTheme && activeTheme !== 'default') && idx === 0
                return (
                  <span key={id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 999,
                    fontSize: 11, fontWeight: 700,
                    color: isPrimary ? '#ffffff' : ach.color,
                    background: isPrimary ? ach.color : ach.bg,
                    border: isPrimary ? `1px solid ${ach.color}` : `1px solid ${ach.border}`,
                    boxShadow: isPrimary ? `0 2px 10px ${ach.color}50` : (ach.rarity !== 'common' ? `0 0 8px ${rar.glow}` : 'none'),
                  }}>
                    <i className={`fas ${ach.icon}`} style={{ fontSize: 10 }} />
                    <span>{ach.labelTH}</span>
                    {isPrimary && (
                      <span style={{ fontSize: 9, opacity: 0.9, background: 'rgba(0,0,0,0.18)', padding: '1px 5px', borderRadius: 8 }}>
                        ธีมหลัก
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* ── MENU BAR / SEGMENTED TABS ── */}
        <div className="pp-tabs-container">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="pp-tab-btn"
                style={{
                  background: isActive ? C : 'transparent',
                  color: isActive ? '#ffffff' : INK_2,
                  boxShadow: isActive ? `0 4px 14px ${C}35` : 'none',
                }}
              >
                <div className="pp-tab-icon-wrap">
                  <i className={`fas ${tab.icon}`} style={{ fontSize: 14, color: isActive ? '#ffffff' : INK_3 }} />
                  {tab.badge !== null && tab.badge !== undefined && (
                    <span className="pp-tab-badge" style={{
                      position: 'absolute',
                      top: -6,
                      right: -11,
                      minWidth: 15,
                      height: 15,
                      padding: '0 3px',
                      borderRadius: 10,
                      background: isActive ? '#ffffff' : C,
                      color: isActive ? C : '#ffffff',
                      fontSize: 9,
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15)'
                    }}>
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="pp-tab-text" style={{
                  fontSize: 'clamp(10px, 2.4vw, 12px)',
                  fontWeight: isActive ? 800 : 600,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap'
                }}>
                  <span className="pp-tab-label-full">{tab.label}</span>
                  <span className="pp-tab-label-short">{tab.shortLabel || tab.label}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Toast / Copied notification */}
        {copiedText && (
          <div style={{
            position: 'fixed',
            bottom: 30,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(26, 26, 26, 0.92)',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: 20,
            fontSize: 12.5,
            fontWeight: 700,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
          }}>
            <i className="fas fa-check-circle" style={{ color: '#06c755' }} />
            <span>{copiedText}</span>
          </div>
        )}

        {/* BODY TABS CONTENT */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: INK_3 }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }} />
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>

            {/* ══════════════════════════════════════════════════════════
                TAB 0: DASHBOARD (สถิติบทสรุปผู้เล่น & ภาพรวมนักสืบ)
               ══════════════════════════════════════════════════════════ */}
            {activeTab === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* ── 1. STATS OVERVIEW CARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {/* Total Unique Games */}
                  <div style={{
                    background: '#ffffff',
                    borderRadius: 16,
                    padding: '16px 18px',
                    border: `1px solid ${BORDER}`,
                    boxShadow: '0 1px 4px rgba(26,26,26,0.04)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: INK_3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <i className="fas fa-scroll" style={{ color: C }} />
                      <span>คดีที่สืบแล้ว</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: INK, marginTop: 4 }}>
                      {uniquePlayedGames.size} <span style={{ fontSize: 13, fontWeight: 700, color: INK_3 }}>คดี</span>
                    </div>
                    <div style={{ fontSize: 11, color: INK_3, marginTop: 2 }}>
                      รวม {history.length + playHistory.length} รอบเล่นสะสม
                    </div>
                  </div>

                  {/* Total Spent */}
                  <div style={{
                    background: '#ffffff',
                    borderRadius: 16,
                    padding: '16px 18px',
                    border: `1px solid ${BORDER}`,
                    boxShadow: '0 1px 4px rgba(26,26,26,0.04)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: INK_3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <i className="fas fa-receipt" style={{ color: '#0284c7' }} />
                      <span>ยอดใช้จ่ายรวม</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: INK, marginTop: 4 }}>
                      ฿{totalSpent.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: INK_3, marginTop: 2 }}>
                      ค่ารอบเกมและอาหาร
                    </div>
                  </div>
                </div>

                {/* ── 2. STORE GAMES PROGRESS MILESTONE CARD ── */}
                <div style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: '18px 20px',
                  border: `1px solid ${BORDER}`,
                  boxShadow: '0 1px 4px rgba(26,26,26,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: INK }}>
                      <i className="fas fa-trophy" style={{ color: '#d97706' }} />
                      <span>ความคืบหน้าการเล่นคดีทั้งร้าน</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: C }}>
                      {storePlayedPercentage}% <span style={{ fontSize: 11, fontWeight: 700, color: INK_3 }}>({uniquePlayedGames.size}/{totalStoreGames} คดี)</span>
                    </div>
                  </div>

                  {/* Progress Track */}
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    height: 12,
                    borderRadius: 8,
                    background: '#f1f5f9',
                    overflow: 'hidden',
                    border: '1px solid #e2e8f0',
                    marginBottom: 8
                  }}>
                    <div style={{
                      width: `${storePlayedPercentage}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #60a5fa 0%, #a78bfa 50%, #fbbf24 100%)',
                      borderRadius: 8,
                      transition: 'width 0.4s ease'
                    }} />
                  </div>

                  {/* Milestones markers */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: INK_3, fontWeight: 700 }}>
                    <span style={{ color: storePlayedPercentage >= 30 ? '#2563eb' : INK_3 }}>
                      <i className="fas fa-award" style={{ marginRight: 3 }} />30% Bronze
                    </span>
                    <span style={{ color: storePlayedPercentage >= 50 ? '#7c3aed' : INK_3 }}>
                      <i className="fas fa-star-half-stroke" style={{ marginRight: 3 }} />50% Silver
                    </span>
                    <span style={{ color: storePlayedPercentage >= 80 ? '#d97706' : INK_3 }}>
                      <i className="fas fa-crown" style={{ marginRight: 3 }} />80% Golden
                    </span>
                  </div>
                </div>

                {/* ── 3. ENDING BREAKDOWN ── */}
                <div style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: '20px',
                  border: `1px solid ${BORDER}`,
                  boxShadow: '0 1px 4px rgba(26,26,26,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 900, color: INK }}>
                      <i className="fas fa-flag-checkered" style={{ color: '#d97706' }} />
                      <span>สัดส่วนฉากจบของคดี (Ending Breakdown)</span>
                    </div>
                    {endingStats.total > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: INK_3, background: PAPER, padding: '2px 8px', borderRadius: 12 }}>
                        {endingStats.total} รอบที่บันทึกผล
                      </span>
                    )}
                  </div>

                  {endingStats.total > 0 ? (
                    <>
                      {/* Stacked Multi-Segment Bar */}
                      <div style={{
                        display: 'flex',
                        width: '100%',
                        height: 12,
                        borderRadius: 8,
                        overflow: 'hidden',
                        marginBottom: 16,
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0'
                      }}>
                        {endingStats.list.map((item, idx) => (
                          <div
                            key={idx}
                            title={`${item.label}: ${item.percentage}% (${item.count} รอบ)`}
                            style={{
                              width: `${item.percentage}%`,
                              height: '100%',
                              background: item.color,
                              transition: 'width 0.3s ease'
                            }}
                          />
                        ))}
                      </div>

                      {/* Ending Cards Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                        {endingStats.list.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '12px',
                              borderRadius: 12,
                              background: item.bg,
                              border: `1px solid ${item.color}30`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: item.color }}>
                              <i className={`fas ${item.icon}`} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                            </div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: INK }}>
                              {item.percentage}%
                            </div>
                            <div style={{ fontSize: 10.5, color: INK_3, fontWeight: 600 }}>
                              {item.count} ครั้ง
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 16px', color: INK_3, fontSize: 12.5, background: PAPER, borderRadius: 12 }}>
                      <i className="fas fa-flag-checkered" style={{ fontSize: 22, opacity: 0.4, display: 'block', marginBottom: 8 }} />
                      ยังไม่มีข้อมูลฉากจบที่บันทึกไว้ — เมื่อเล่นจบและเช็คบิลที่ร้าน GM จะบันทึกฉากจบลงในประวัติของคุณโดยอัตโนมัติ
                    </div>
                  )}
                </div>

                {/* ── 4. CATEGORY / GENRE BREAKDOWN ── */}
                <div style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: '20px',
                  border: `1px solid ${BORDER}`,
                  boxShadow: '0 1px 4px rgba(26,26,26,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 900, color: INK }}>
                      <i className="fas fa-masks-theater" style={{ color: '#7c3aed' }} />
                      <span>สัดส่วนแนวเกมที่เล่น (Genre Breakdown)</span>
                    </div>
                    {categoryStats.total > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: INK_3, background: PAPER, padding: '2px 8px', borderRadius: 12 }}>
                        {categoryStats.list.length} หมวดหมู่
                      </span>
                    )}
                  </div>

                  {categoryStats.total > 0 ? (
                    <div>
                      {/* Overview multi-segment bar */}
                      <div
                        style={{
                          width: '100%',
                          height: 10,
                          borderRadius: 6,
                          background: '#f1f5f9',
                          overflow: 'hidden',
                          display: 'flex',
                          marginBottom: 16
                        }}
                      >
                        {categoryStats.list.map((item, idx) => (
                          <div
                            key={idx}
                            title={`${item.category}: ${item.count} คดี (${item.percentage}%)`}
                            style={{
                              width: `${item.percentage}%`,
                              height: '100%',
                              background: item.color,
                              borderRight: idx < categoryStats.list.length - 1 ? '1.5px solid #ffffff' : 'none'
                            }}
                          />
                        ))}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {categoryStats.list.map((item, idx) => (
                          <div key={idx}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                                <i className={`fas ${item.icon}`} style={{ fontSize: 11, color: item.color, width: 14, textAlign: 'center' }} />
                                <span>{item.category}</span>
                                {idx === 0 && (
                                  <span style={{ fontSize: 9.5, fontWeight: 800, color: item.color, background: `${item.color}14`, padding: '1px 6px', borderRadius: 6 }}>
                                    เล่นบ่อยที่สุด
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ fontSize: 11, color: INK_3 }}>{item.count} คดี</span>
                                <span style={{ fontSize: 13, fontWeight: 900, color: INK }}>{item.percentage}%</span>
                              </div>
                            </div>
                            <div style={{ width: '100%', height: 8, borderRadius: 6, background: '#f1f5f9', overflow: 'hidden' }}>
                              <div style={{ width: `${item.percentage}%`, height: '100%', background: item.color, borderRadius: 6, transition: 'width 0.3s ease' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 16px', color: INK_3, fontSize: 12.5, background: PAPER, borderRadius: 12 }}>
                      <i className="fas fa-masks-theater" style={{ fontSize: 22, opacity: 0.4, display: 'block', marginBottom: 8 }} />
                      ยังไม่มีสถิติแนวเกม — ร่วมเล่นคดีที่ร้านหรือบันทึกประวัติย้อนหลังเพื่อดูสัดส่วนแนวเกมโปรดของคุณ
                    </div>
                  )}
                </div>

                {/* ── 5. TOP CO-PLAYERS / PARTY MATES ── */}
                <div style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: '20px',
                  border: `1px solid ${BORDER}`,
                  boxShadow: '0 1px 4px rgba(26,26,26,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 900, color: INK }}>
                      <i className="fas fa-user-group" style={{ color: '#2563eb' }} />
                      <span>อันดับเพื่อนที่ร่วมสืบคดีบ่อยที่สุด</span>
                    </div>
                    {topFriends.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: INK_3, background: PAPER, padding: '2px 8px', borderRadius: 12 }}>
                        Top {topFriends.length} เพื่อนสนิท
                      </span>
                    )}
                  </div>

                  {topFriends.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {topFriends.map((f, idx) => {
                        const rank = idx + 1
                        const rankColor = rank === 1 ? '#d97706' : rank === 2 ? '#64748b' : rank === 3 ? '#b45309' : INK_3
                        const rankBg = rank === 1 ? 'rgba(245, 158, 11, 0.12)' : rank === 2 ? '#f1f5f9' : rank === 3 ? 'rgba(180, 83, 9, 0.08)' : 'transparent'
                        const synergy = rank === 1 ? 'คู่หูรู้ใจ' : rank === 2 ? 'สหายร่วมทีม' : rank === 3 ? 'เพื่อนร่วมตี้' : null

                        return (
                          <div
                            key={f.uid || idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              borderRadius: 12,
                              background: rank === 1 ? 'rgba(245, 158, 11, 0.04)' : '#ffffff',
                              border: `1px solid ${rank === 1 ? 'rgba(245, 158, 11, 0.25)' : '#e2e8f0'}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <div style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: rankBg,
                                color: rankColor,
                                fontSize: 11,
                                fontWeight: 900,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {rank === 1 ? <i className="fas fa-crown" style={{ fontSize: 10 }} /> : rank}
                              </div>

                              {f.avatar ? (
                                <img
                                  src={f.avatar}
                                  alt=""
                                  style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }}
                                />
                              ) : (
                                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#f1f5f9', color: INK_2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                                  {f.name ? f.name[0] : '?'}
                                </div>
                              )}

                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {f.name}
                                  </span>
                                  {synergy && (
                                    <span style={{ fontSize: 9.5, fontWeight: 700, color: rankColor, background: rankBg, padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                                      {synergy}
                                    </span>
                                  )}
                                </div>
                                {f.recentGames?.length > 0 && (
                                  <div style={{ fontSize: 10.5, color: INK_3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    เคยเล่น: {f.recentGames.slice(0, 2).join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 8 }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 10px',
                                borderRadius: 14,
                                background: rank === 1 ? 'rgba(245, 158, 11, 0.15)' : '#f8fafc',
                                color: rank === 1 ? '#b45309' : INK,
                                fontSize: 11.5,
                                fontWeight: 800,
                                border: '1px solid rgba(0,0,0,0.06)'
                              }}>
                                {f.count} คดี
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 16px', color: INK_3, fontSize: 12.5, background: PAPER, borderRadius: 12 }}>
                      <i className="fas fa-user-group" style={{ fontSize: 22, opacity: 0.4, display: 'block', marginBottom: 8 }} />
                      ยังไม่มีข้อมูลเพื่อนร่วมโต๊ะ — ชวนเพื่อนมาเล่นที่ร้านและสแกนเข้าโต๊ะพร้อมกันเพื่อบันทึกสถิติความสนิท
                    </div>
                  )}
                </div>

                {/* ── 6. TOP FOOD & DRINKS ORDERED ── */}
                <div style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: '20px',
                  border: `1px solid ${BORDER}`,
                  boxShadow: '0 1px 4px rgba(26,26,26,0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 900, color: INK }}>
                      <i className="fas fa-utensils" style={{ color: '#ea580c' }} />
                      <span>อันดับเมนูอาหาร &amp; เครื่องดื่มที่สั่งบ่อย</span>
                    </div>
                    {topFoodItems.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: INK_3, background: PAPER, padding: '2px 8px', borderRadius: 12 }}>
                        Top {topFoodItems.length} เมนูโปรด
                      </span>
                    )}
                  </div>

                  {topFoodItems.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {topFoodItems.map((item, idx) => {
                        const rank = idx + 1
                        const rankColor = rank === 1 ? '#ea580c' : rank === 2 ? '#d97706' : rank === 3 ? '#b45309' : INK_3
                        const rankBg = rank === 1 ? 'rgba(234, 88, 12, 0.1)' : rank === 2 ? 'rgba(245, 158, 11, 0.1)' : rank === 3 ? '#f1f5f9' : 'transparent'

                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              borderRadius: 12,
                              background: rank === 1 ? 'rgba(234, 88, 12, 0.03)' : '#ffffff',
                              border: `1px solid ${rank === 1 ? 'rgba(234, 88, 12, 0.22)' : '#e2e8f0'}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <div style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: rankBg,
                                color: rankColor,
                                fontSize: 11,
                                fontWeight: 900,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {rank}
                              </div>

                              <div style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: '#f8fafc',
                                color: rankColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                flexShrink: 0
                              }}>
                                <i className="fas fa-bowl-food" />
                              </div>

                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.name}
                                  </span>
                                  {rank === 1 && (
                                    <span style={{ fontSize: 9.5, fontWeight: 700, color: '#ea580c', background: 'rgba(234, 88, 12, 0.12)', padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                                      เมนูโปรดประจำตัว
                                    </span>
                                  )}
                                </div>
                                {item.totalSpent > 0 && (
                                  <div style={{ fontSize: 11, color: INK_3 }}>
                                    รวม ฿{item.totalSpent.toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 8 }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 10px',
                                borderRadius: 14,
                                background: rank === 1 ? 'rgba(234, 88, 12, 0.12)' : '#f8fafc',
                                color: rank === 1 ? '#c2410c' : INK,
                                fontSize: 11.5,
                                fontWeight: 800,
                                border: '1px solid rgba(0,0,0,0.06)'
                              }}>
                                {item.count} ที่
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 16px', color: INK_3, fontSize: 12.5, background: PAPER, borderRadius: 12 }}>
                      <i className="fas fa-utensils" style={{ fontSize: 22, opacity: 0.4, display: 'block', marginBottom: 8 }} />
                      ยังไม่มีข้อมูลการสั่งอาหาร — สั่งของว่างและเครื่องดื่มระหว่างเล่นคดีเพื่อบันทึกเมนูโปรดของคุณ
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                TAB 1: ประวัติการลงคดี & บิลย้อนหลัง (Play History & Bills)
               ══════════════════════════════════════════════════════════ */}
            {activeTab === 'history' && (
              <div>
                {/* Stats Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
                  <div style={{
                    background: '#ffffff',
                    borderRadius: 16,
                    padding: '16px 18px',
                    border: `1px solid ${BORDER}`,
                    boxShadow: '0 1px 4px rgba(26,26,26,0.04)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: INK_3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <i className="fas fa-scroll" style={{ color: C }} />
                      <span>คดีที่บันทึกแล้ว</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: INK, marginTop: 4 }}>
                      {history.length} <span style={{ fontSize: 13, fontWeight: 700, color: INK_3 }}>คดี</span>
                    </div>
                  </div>

                  <div style={{
                    background: '#ffffff',
                    borderRadius: 16,
                    padding: '16px 18px',
                    border: `1px solid ${BORDER}`,
                    boxShadow: '0 1px 4px rgba(26,26,26,0.04)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: INK_3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <i className="fas fa-receipt" style={{ color: C }} />
                      <span>ยอดใช้จ่ายรวม</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: INK, marginTop: 4 }}>
                      ฿{totalSpent.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Section Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 900, color: INK }}>
                    <i className="fas fa-history" style={{ color: C }} />
                    <span>ประวัติการลงคดี & บิลย้อนหลัง</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => showPage ? showPage('rehistory') : (window.location.href = '/rehistory')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 8,
                        background: 'rgba(220, 38, 38, 0.08)',
                        color: '#dc2626',
                        border: '1px solid rgba(220, 38, 38, 0.2)',
                        cursor: 'pointer'
                      }}
                      title="บันทึกคดีที่คุณเคยเล่นย้อนหลัง"
                    >
                      <i className="fas fa-history" />
                      <span>บันทึกย้อนหลัง</span>
                    </button>
                    {history.length > 0 && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '3px 10px',
                        borderRadius: 12,
                        background: `${C}10`,
                        color: C,
                        border: `1px solid ${C}28`
                      }}>
                        {history.length} รายการ
                      </span>
                    )}
                  </div>
                </div>

                {/* Search & Month Filter */}
                {history.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{
                      flex: 1,
                      minWidth: 180,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#ffffff',
                      border: `1px solid ${BORDER_2}`,
                      borderRadius: 12,
                      padding: '8px 12px'
                    }}>
                      <i className="fas fa-search" style={{ color: INK_3, fontSize: 12 }} />
                      <input
                        type="text"
                        placeholder="ค้นหาชื่อเกมหรือคดี..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                          border: 'none',
                          background: 'none',
                          outline: 'none',
                          fontSize: 13,
                          color: INK,
                          width: '100%',
                          fontFamily: 'inherit'
                        }}
                      />
                      {search && (
                        <button
                          onClick={() => setSearch('')}
                          style={{ background: 'none', border: 'none', color: INK_3, cursor: 'pointer', padding: 0 }}
                        >
                          <i className="fas fa-times" />
                        </button>
                      )}
                    </div>

                    {monthOptions.length > 1 && (
                      <select
                        value={filterMonth}
                        onChange={e => setFilterMonth(e.target.value)}
                        style={{
                          border: `1px solid ${BORDER_2}`,
                          borderRadius: 12,
                          padding: '8px 14px',
                          fontSize: 12.5,
                          color: INK,
                          background: '#ffffff',
                          outline: 'none',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">ทุกเดือน</option>
                        {monthOptions.map(m => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* History Items List */}
                {filtered.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '40px 16px',
                    borderRadius: 20,
                    background: '#ffffff',
                    border: `1px dashed ${BORDER_2}`,
                    color: INK_3,
                    fontSize: 13.5
                  }}>
                    <i className="fas fa-scroll" style={{ fontSize: 28, marginBottom: 10, opacity: 0.45, display: 'block', color: INK_3 }} />
                    {history.length === 0 ? 'ยังไม่มีประวัติการเล่นคดี' : 'ไม่พบคดีที่ตรงกับคำค้นหา'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filtered.map(h => {
                      const me = h.members?.find(m => m.uid === lineUser.uid)
                      const myBill = h.memberBills?.find(m => m.uid === lineUser.uid)
                      const allMembers = h.members || []
                      const paidAt = h.paidAt?.toDate?.()
                      const expanded = !!expandedMap[h.id]
                      const myTotal = myBill?.total ?? h.grandTotal ?? 0
                      const hasFood = (myBill?.foodItems?.length > 0 || (h.foodItems?.length > 0))
                      const discAmt = h.discount?.applied || 0
                      const gameCover = getGameCover(h)

                      return (
                        <div key={h.id} className="profile-history-card">
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            {/* Game Poster Thumbnail */}
                            <div style={{
                              width: 60,
                              height: 80,
                              borderRadius: 10,
                              overflow: 'hidden',
                              background: PAPER,
                              flexShrink: 0,
                              border: `1px solid ${BORDER}`
                            }}>
                              {gameCover ? (
                                <img
                                  src={gameCover}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={e => e.currentTarget.style.display = 'none'}
                                />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK_3 }}>
                                  <i className="fas fa-mask" style={{ fontSize: 22 }} />
                                </div>
                              )}
                            </div>

                            {/* Info Body */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                                <div style={{ fontSize: 14.5, fontWeight: 900, color: INK, lineHeight: 1.3 }}>
                                  {h.scriptTitle || 'คดีไม่ระบุชื่อ'}
                                </div>
                                <div style={{ fontSize: 11, color: INK_3, whiteSpace: 'nowrap' }}>
                                  {paidAt ? paidAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : ''}
                                </div>
                              </div>

                              {/* Metadata Tag Row */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                                {me?.character && (
                                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${C}12`, color: C }}>
                                    <i className="fas fa-user-secret" style={{ marginRight: 4 }} />{me.character}
                                  </span>
                                )}
                                {h.room && (
                                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: PAPER, color: INK_2, border: `1px solid ${BORDER}` }}>
                                    <i className="fas fa-door-open" style={{ marginRight: 4 }} />{h.room}
                                  </span>
                                )}
                                {h.dm && (
                                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: PAPER, color: INK_2, border: `1px solid ${BORDER}` }}>
                                    <i className="fas fa-crown" style={{ marginRight: 4 }} />GM: {h.dm}
                                  </span>
                                )}
                                {h.ending && (
                                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}>
                                    <i className="fas fa-flag-checkered" style={{ marginRight: 4 }} />{h.ending}
                                  </span>
                                )}
                              </div>

                              {/* Avatars of party */}
                              {allMembers.length > 0 && (
                                <div style={{ display: 'flex', gap: 3, marginTop: 8, alignItems: 'center' }}>
                                  {allMembers.slice(0, 7).map((m, idx) => (
                                    m.avatar ? (
                                      <img
                                        key={idx}
                                        src={m.avatar}
                                        alt={m.name}
                                        title={m.name}
                                        style={{
                                          width: 22,
                                          height: 22,
                                          borderRadius: '50%',
                                          objectFit: 'cover',
                                          border: m.uid === lineUser.uid ? `2px solid ${C}` : '1.5px solid #ffffff'
                                        }}
                                        onError={e => e.currentTarget.style.display = 'none'}
                                      />
                                    ) : (
                                      <div
                                        key={idx}
                                        style={{
                                          width: 22,
                                          height: 22,
                                          borderRadius: '50%',
                                          background: m.uid === lineUser.uid ? C : '#d1d5db',
                                          color: '#ffffff',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: 9,
                                          fontWeight: 700
                                        }}
                                        title={m.name}
                                      >
                                        {(m.name || '?')[0]}
                                      </div>
                                    )
                                  ))}
                                  {allMembers.length > 7 && (
                                    <span style={{ fontSize: 10, color: INK_3, fontWeight: 700, marginLeft: 2 }}>
                                      +{allMembers.length - 7}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Bottom Action / Price Bar */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: 12,
                            paddingTop: 10,
                            borderTop: `1px solid ${BORDER}`
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: INK_2 }}>
                              <i className="fas fa-receipt" style={{ color: C }} />
                              <span>ยอดของคุณ:</span>
                              <strong style={{ fontSize: 14.5, color: INK }}>฿{myTotal.toLocaleString()}</strong>
                            </div>

                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => toggleExpanded(h.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '5px 11px',
                                  borderRadius: 8,
                                  border: `1px solid ${BORDER_2}`,
                                  background: PAPER,
                                  color: INK_2,
                                  cursor: 'pointer'
                                }}
                              >
                                <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} />
                                <span>{expanded ? 'ซ่อน' : 'ดูบิล'}</span>
                              </button>

                              <button
                                onClick={() => printBill(h, lineUser.uid)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '5px 11px',
                                  borderRadius: 8,
                                  border: `1px solid ${C}28`,
                                  background: `${C}0c`,
                                  color: C,
                                  cursor: 'pointer'
                                }}
                              >
                                <i className="fas fa-print" />
                                <span>พิมพ์ใบเสร็จ</span>
                              </button>
                            </div>
                          </div>

                          {/* Expanded Detail Panel */}
                          {expanded && (
                            <div style={{
                              marginTop: 10,
                              paddingTop: 10,
                              borderTop: `1px dashed ${BORDER_2}`,
                              fontSize: 12,
                              color: INK_2
                            }}>
                              {(h.gameUnitPrice > 0 || h.gameTotal > 0) && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                                  <span>ค่าเล่นเกม {h.gameUnitPrice > 0 ? `(฿${h.gameUnitPrice}/คน)` : ''}</span>
                                  <span>฿{(h.gameTotal || 0).toLocaleString()}</span>
                                </div>
                              )}

                              {hasFood && (
                                <div style={{ marginTop: 6, marginBottom: 6 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: INK_3, textTransform: 'uppercase' }}>
                                    อาหาร & เครื่องดื่ม
                                  </div>
                                  {(myBill?.foodItems || h.foodItems || []).map((f, fi) => (
                                    <div key={fi} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                      <span>{f.name} × {f.qty}</span>
                                      <span>฿{((f.price || 0) * f.qty).toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {discAmt > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#16a34a', fontWeight: 700 }}>
                                  <span>ส่วนลดพิเศษ</span>
                                  <span>-฿{discAmt.toLocaleString()}</span>
                                </div>
                              )}

                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                paddingTop: 8,
                                marginTop: 6,
                                borderTop: `1px solid ${BORDER}`,
                                fontWeight: 800,
                                fontSize: 13,
                                color: INK
                              }}>
                                <span>ยอดรวมสุทธิ</span>
                                <span>฿{myTotal.toLocaleString()}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                TAB 2: ความสำเร็จ (Achievements)
               ══════════════════════════════════════════════════════════ */}
            {activeTab === 'achievements' && (
              <div style={{ background: '#fff', borderRadius: 20, padding: '24px 20px', border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(26,26,26,0.04)' }}>
                {sectionLabel(
                  <><i className="fas fa-award" style={{ marginRight: 6, color: C }} />Achievements</>,
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!editingAch && activeTheme && activeTheme !== 'default' && (
                      <button
                        type="button"
                        onClick={resetToDefaultTheme}
                        disabled={pinnedSaving}
                        className="pp-btn-ghost"
                        title="คืนค่าธีมสีหลักและปิดเอฟเฟกต์บรรยากาศทั้งหมด"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 12px', borderRadius: 999,
                          background: 'rgba(0,0,0,0.04)', color: INK_2,
                          border: `1px solid ${BORDER}`, cursor: 'pointer',
                          fontSize: 11, fontWeight: 700, fontFamily: "'Sarabun', sans-serif",
                          transition: 'all 0.18s',
                        }}
                      >
                        <i className="fas fa-rotate-left" style={{ fontSize: 9 }} />
                        คืนค่าธีมมาตรฐาน
                      </button>
                    )}
                    {!editingAch && myAchievements.length > 0 && (
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
                    )}
                  </div>
                )}

                <div style={{ fontSize: 12, color: INK_2, marginBottom: 14, lineHeight: 1.5 }}>
                  {activeTheme && activeTheme !== 'default' ? (
                    <span>กำลังใช้ธีม: <strong style={{ color: ACHIEVEMENTS[activeTheme]?.color || C }}>{ACHIEVEMENTS[activeTheme]?.labelTH || activeTheme}</strong> (อันดับ 1) · สีหลักของเว็บและเอฟเฟกต์จะเปลี่ยนตามความสำเร็จนี้</span>
                  ) : (
                    <span>ธีมปัจจุบัน: <strong style={{ color: C }}>ธีมมาตรฐาน Sofun (Curtain Crimson)</strong> · ไม่มีเอฟเฟกต์บรรยากาศ</span>
                  )}
                </div>

                {!editingAch ? (
                  /* ── VIEW MODE ── show pinned only ── */
                  pinned.length === 0 ? (
                    <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 32, color: INK_3, marginBottom: 10 }}>
                        <i className="fas fa-award" />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>ยังไม่ได้เลือก Achievement มาแสดง</div>
                      <div style={{ fontSize: 12, color: INK_2, marginTop: 4 }}>กดปุ่ม "แก้ไข" เพื่อเลือกความสำเร็จและกำหนดธีมหลักของเว็บ</div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 10 }}>
                      {pinned.map((id, idx) => {
                        const ach = ACHIEVEMENTS[id]
                        if (!ach) return null
                        const rar = RARITY[ach.rarity]
                        const isPrimary = (activeTheme && activeTheme !== 'default') && idx === 0
                        return (
                          <div
                            key={id}
                            title={`${ach.labelTH}${isPrimary ? ' (อันดับ 1 · ธีมหลักของเว็บ)' : ''}`}
                            style={{
                              position: 'relative',
                              padding: '14px 6px 10px',
                              background: isPrimary ? ach.bg : ach.bg,
                              border: isPrimary ? `2px solid ${ach.color}` : `1.5px solid ${ach.border}`,
                              borderRadius: 12,
                              textAlign: 'center',
                              boxShadow: isPrimary ? `0 0 14px ${ach.color}55` : (ach.rarity !== 'common' ? `0 0 10px ${rar.glow}` : 'none'),
                            }}
                          >
                            {isPrimary ? (
                              <div style={{
                                position: 'absolute',
                                top: -7,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: ach.color,
                                color: '#ffffff',
                                fontSize: 8.5,
                                fontWeight: 900,
                                padding: '1px 6px',
                                borderRadius: 10,
                                whiteSpace: 'nowrap',
                                letterSpacing: '0.04em',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                                zIndex: 2
                              }}>
                                ธีมหลักของเว็บ
                              </div>
                            ) : (
                              <div style={{
                                position: 'absolute',
                                top: 4,
                                left: 6,
                                fontSize: 9,
                                fontWeight: 800,
                                color: INK_3
                              }}>
                                #{idx + 1}
                              </div>
                            )}
                            <div style={{ fontSize: 22, color: ach.color, marginBottom: 5, lineHeight: 1, marginTop: isPrimary ? 2 : 0 }}>
                              <i className={`fas ${ach.icon}`} />
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 900, color: ach.color, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ach.label}</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                ) : (
                  /* ── EDIT MODE ── show order manager + all catalog ── */
                  <>
                    <div style={{ background: '#f8fafc', borderRadius: 14, padding: '12px 14px', marginBottom: 18, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fas fa-sort-amount-down" style={{ color: C }} />
                          <span>ลำดับที่เลือกแสดง (อันดับ 1 = ธีมหลักของเว็บ)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {pinned.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setPinned([])}
                              style={{
                                background: 'none', border: 'none', color: INK_3,
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                padding: '2px 6px', borderRadius: 4
                              }}
                            >
                              ล้างทั้งหมด
                            </button>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 700, color: C }}>{pinned.length}/{MAX_PINNED}</span>
                        </div>
                      </div>

                      {pinned.length === 0 ? (
                        <div style={{ fontSize: 12, color: INK_3, textAlign: 'center', padding: '10px 0' }}>
                          ยังไม่ได้เลือกความสำเร็จ (คลิกความสำเร็จด้านล่างเพื่อเลือก)
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {pinned.map((id, idx) => {
                            const ach = ACHIEVEMENTS[id]
                            if (!ach) return null
                            const isFirst = idx === 0
                            return (
                              <div
                                key={id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  background: isFirst ? ach.color : '#ffffff',
                                  color: isFirst ? '#ffffff' : INK,
                                  padding: '5px 10px',
                                  borderRadius: 10,
                                  fontSize: 11.5,
                                  fontWeight: 800,
                                  border: isFirst ? 'none' : '1px solid #cbd5e1',
                                  boxShadow: isFirst ? `0 2px 8px ${ach.color}40` : '0 1px 3px rgba(0,0,0,0.05)'
                                }}
                              >
                                <span style={{ fontSize: 10, opacity: isFirst ? 0.9 : 0.6 }}>#{idx + 1}</span>
                                <i className={`fas ${ach.icon}`} />
                                <span>{ach.labelTH}</span>
                                {isFirst ? (
                                  <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.25)', padding: '1px 5px', borderRadius: 6, marginLeft: 2 }}>
                                    ธีมหลัก
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => moveToFirst(id)}
                                    title="ตั้งเป็นอันดับ 1 (ใช้เป็นธีมหลักของเว็บ)"
                                    style={{
                                      background: 'rgba(0,0,0,0.06)',
                                      border: 'none',
                                      color: INK,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      borderRadius: 6,
                                      padding: '2px 6px',
                                      cursor: 'pointer',
                                      marginLeft: 2
                                    }}
                                  >
                                    ตั้งเป็นธีม
                                  </button>
                                )}
                                {idx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => movePinned(idx, idx - 1)}
                                    title="เลื่อนขึ้นหน้า"
                                    style={{ background: 'none', border: 'none', color: isFirst ? '#ffffff' : INK_2, cursor: 'pointer', padding: '0 2px' }}
                                  >
                                    <i className="fas fa-chevron-left" style={{ fontSize: 9 }} />
                                  </button>
                                )}
                                {idx < pinned.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => movePinned(idx, idx + 1)}
                                    title="เลื่อนไปหลัง"
                                    style={{ background: 'none', border: 'none', color: isFirst ? '#ffffff' : INK_2, cursor: 'pointer', padding: '0 2px' }}
                                  >
                                    <i className="fas fa-chevron-right" style={{ fontSize: 9 }} />
                                  </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => togglePin(id)}
                                    title="ยกเลิกการเลือก"
                                    style={{ background: 'none', border: 'none', color: isFirst ? '#ffffff' : INK_3, cursor: 'pointer', padding: '0 2px', marginLeft: 2 }}
                                  >
                                    <i className="fas fa-times" style={{ fontSize: 10 }} />
                                  </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

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

            {/* ══════════════════════════════════════════════════════════
                TAB 3: ข้อมูลส่วนตัว (Personal Info)
               ══════════════════════════════════════════════════════════ */}
            {activeTab === 'info' && (
              <div style={{ background: '#fff', borderRadius: 20, padding: '24px 20px', border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(26,26,26,0.04)' }}>
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
            )}

            {/* ══════════════════════════════════════════════════════════
                TAB 4: บัญชีและการตั้งค่า (Account & Settings)
               ══════════════════════════════════════════════════════════ */}
            {activeTab === 'account' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* LINE Account Link Card */}
                <div style={{ background: '#fff', borderRadius: 20, padding: '24px 20px', border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(26,26,26,0.04)' }}>
                  {sectionLabel(<><i className="fas fa-link" style={{ marginRight: 6, color: C }} />บัญชีที่เชื่อมต่อ</>)}

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

                  {/* Member ID Tag with Copy */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '12px 16px', background: PAPER, borderRadius: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: INK_3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Member ID</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: INK, fontFamily: 'monospace', marginTop: 2 }}>{memberIdTag}</div>
                    </div>
                    <button
                      onClick={() => handleCopy(memberIdTag, 'คัดลอกรหัสสมาชิกแล้ว')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '6px 12px',
                        borderRadius: 10,
                        background: '#ffffff',
                        border: `1px solid ${BORDER_2}`,
                        color: INK,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <i className="fas fa-copy" style={{ color: C }} />
                      <span>คัดลอก</span>
                    </button>
                  </div>

                  {/* User Role */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '12px 16px', background: PAPER, borderRadius: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: INK_3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>สถานะสมาชิก</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginTop: 2 }}>
                        {lineUser.role === 'admin' ? 'ผู้ดูแลระบบ (Admin)' : 'สมาชิกสโมสรนักสืบ (Member)'}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: lineUser.role === 'admin' ? C : INK_2,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: lineUser.role === 'admin' ? `${C}12` : 'rgba(0,0,0,0.06)',
                      border: lineUser.role === 'admin' ? `1px solid ${C}2c` : `1px solid ${BORDER}`
                    }}>
                      {lineUser.role === 'admin' ? 'ADMIN' : 'MEMBER'}
                    </span>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={onLogout}
                  className="pp-btn-ghost"
                  style={{
                    width: '100%', height: 50, borderRadius: 14,
                    background: '#fff', color: C,
                    border: `1.5px solid ${C}30`, cursor: 'pointer',
                    fontSize: 14, fontWeight: 800, fontFamily: "'Sarabun', sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    transition: 'all 0.18s',
                  }}
                >
                  <i className="fas fa-sign-out-alt" /> ออกจากระบบ
                </button>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
