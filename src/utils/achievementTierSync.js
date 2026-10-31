// Automated Achievement Tier Sync Engine (Bronze > 30%, Silver > 50%, Golden > 80%, Water Man >= 80% drinks)
// Evaluates all played games and drink orders against store criteria.
// Zero emojis rule strictly applied.

import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'

// Drink categories and keywords for Water Man automated achievement
export const DRINK_CATEGORIES = new Set([
  'เครื่องดื่มแช่เย็น',
  'เครื่องดื่มชง',
  'กาแฟ',
  'ม็อกเทล',
  'แอลกอฮอล์',
  'เครื่องดื่ม',
  'drink',
  'drinks',
  'beverage',
  'beverages'
])

export function isDrinkItem(item) {
  if (!item) return false
  const cat = (item.category || '').trim().toLowerCase()
  if (DRINK_CATEGORIES.has(cat)) return true

  const name = (item.name || '').trim().toLowerCase()
  if (name.includes('น้ำมันหอย') || name.includes('น้ำตก') || name.includes('น้ำพริก') || name.includes('น้ำปลา')) {
    return false
  }
  const drinkKeywords = [
    'น้ำเปล่า', 'น้ำแข็ง', 'โค้ก', 'coke', 'pepsi', 'fanta', 'แฟนต้า',
    'สไปร์ท', 'sprite', 'ชาเขียว', 'ชามะนาว', 'ชาพีช', 'ชาลิ้นจี่', 'ชาเย็น', 'ชา',
    'กาแฟ', 'coffee', 'ลาเต้', 'latte', 'อเมริกาโน่', 'americano', 'คาปูชิโน่', 'cappuccino',
    'มอคค่า', 'mocha', 'เอสเปรสโซ่', 'espresso', 'โกโก้', 'cocoa', 'โซดา', 'soda',
    'เบียร์', 'beer', 'โซจู', 'soju', 'ม็อกเทล', 'mocktail', 'ชเวปส์', 'schweppes',
    'มอนสเตอร์', 'monster', 'hoegaarden', 'budweiser', 'singha', 'chang', 'heineken',
    'เปิดขวด', 'mystery drink', 'dream night', 'sour bomb', 'น้ำส้ม', 'น้ำแดง', 'น้ำเขียว', 'น้ำองุ่น'
  ]
  return drinkKeywords.some(kw => name.includes(kw))
}

/**
 * Calculates drink ordering statistics for a user from payments (live play history, excluding retroactive).
 * @param {Array} paymentDocs Array of payment records / documents
 * @param {string} uid User ID
 * @returns {{ liveGamesCount: number, drinkGamesCount: number, drinkPercentage: number, qualifies: boolean }}
 */
export function calculateDrinkStats(paymentDocs = [], uid) {
  if (!uid || !Array.isArray(paymentDocs)) {
    return { liveGamesCount: 0, drinkGamesCount: 0, drinkPercentage: 0, qualifies: false }
  }

  let liveGamesCount = 0
  let drinkGamesCount = 0

  paymentDocs.forEach(d => {
    const p = typeof d.data === 'function' ? d.data() : d
    if (!p) return
    const isMember = (p.memberUids && p.memberUids.includes(uid)) ||
      (Array.isArray(p.members) && p.members.some(m => m.uid === uid)) ||
      p.userId === uid

    if (!isMember) return

    liveGamesCount++

    let hasDrink = false
    const myBill = Array.isArray(p.memberBills) ? p.memberBills.find(b => b.uid === uid) : null
    if (myBill && Array.isArray(myBill.foodItems)) {
      hasDrink = myBill.foodItems.some(isDrinkItem)
    } else if (Array.isArray(p.foodItems)) {
      hasDrink = p.foodItems.some(isDrinkItem)
    }

    if (hasDrink) drinkGamesCount++
  })

  const drinkPercentage = liveGamesCount > 0 ? (drinkGamesCount / liveGamesCount) * 100 : 0
  const qualifies = liveGamesCount > 0 && drinkPercentage >= 80

  return { liveGamesCount, drinkGamesCount, drinkPercentage, qualifies }
}

export function isSpecialEventGame(g) {
  if (!g) return false
  const title = (g.title || '').trim().toLowerCase()
  const id = String(g.id || g._id || '').toLowerCase()
  return (
    title.includes('special event') ||
    title.includes('secial event') ||
    title === 'event' ||
    title.includes('clocktower') ||
    id === 'vqpyqhfwsbq3niklsqtc' ||
    (Array.isArray(g.tags) && g.tags.some(t => String(t).toLowerCase().includes('special event')))
  )
}

export function isSpecialEventHistory(h) {
  if (!h) return false
  const title = (h.scriptTitle || h.title || '').trim().toLowerCase()
  const sid = String(h.scriptId || h.id || '').toLowerCase()
  const room = (h.room || '').trim().toLowerCase()
  return (
    title.includes('special event') ||
    title.includes('secial event') ||
    title === 'event' ||
    title.includes('clocktower') ||
    sid === 'vqpyqhfwsbq3niklsqtc' ||
    room.includes('special')
  )
}

export function isSpecialEventId(id) {
  if (!id) return false
  return String(id).toLowerCase() === 'vqpyqhfwsbq3niklsqtc'
}

/**
 * Calculates played games statistics for a user (excluding Special Event).
 * @param {Array} playHistoryDocs Array of playHistory document snapshots or data objects
 * @param {Array} allGames Array of all script objects from Firestore
 * @returns {{ playedCount: number, totalGames: number, percentage: number, playedGameIds: Set<string> }}
 */
export function calculatePlayedStats(playHistoryDocs, allGames) {
  const validGames = Array.isArray(allGames)
    ? allGames.filter(g => !g.isDeleted && !g.archived && !isSpecialEventGame(g))
    : []
  const totalGames = validGames.length
  if (totalGames === 0) {
    return { playedCount: 0, totalGames: 0, percentage: 0, playedGameIds: new Set() }
  }

  const gameIdSet = new Set(validGames.map(g => String(g.id || g._id)))
  const gameTitleMap = new Map()
  validGames.forEach(g => {
    if (g.title) {
      gameTitleMap.set(g.title.trim().toLowerCase(), String(g.id || g._id))
    }
  })

  const playedGameIds = new Set()
  if (Array.isArray(playHistoryDocs)) {
    playHistoryDocs.forEach(d => {
      const data = typeof d.data === 'function' ? d.data() : d
      if (!data || isSpecialEventHistory(data)) return
      const sid = data.scriptId ? String(data.scriptId) : null
      const title = data.scriptTitle ? data.scriptTitle.trim().toLowerCase() : null

      if (sid && gameIdSet.has(sid)) {
        playedGameIds.add(sid)
      } else if (title && gameTitleMap.has(title)) {
        playedGameIds.add(gameTitleMap.get(title))
      } else if (sid && sid.toLowerCase() !== 'vqpyqhfwsbq3niklsqtc') {
        playedGameIds.add(sid)
      }
    })
  }

  const playedCount = playedGameIds.size
  const percentage = totalGames > 0 ? (playedCount / totalGames) * 100 : 0
  return { playedCount, totalGames, percentage, playedGameIds }
}

/**
 * Determines which tier achievements a player qualifies for based on store games and drink stats.
 * - Bronze Player: > 30%
 * - Silver Player: > 50%
 * - Golden Player: > 80%
 * - Water Man: >= 80% of live games have drinks ordered
 * @param {number} percentage
 * @param {boolean} drinkQualifies
 * @returns {{ bronze: boolean, silver: boolean, golden: boolean, water_man: boolean }}
 */
export function evaluateTierAchievements(percentage, drinkQualifies = false) {
  return {
    bronze: percentage > 30,
    silver: percentage > 50,
    golden: percentage > 80,
    water_man: !!drinkQualifies,
  }
}

/**
 * Reconciles the current achievements array with the required tier achievements.
 * Automatically adds qualified tiers and removes revoked tiers.
 * Leaves all other achievements intact.
 * @param {Array<string>} currentAchievements
 * @param {{ bronze: boolean, silver: boolean, golden: boolean, water_man: boolean }} shouldHaveTiers
 * @returns {{ achievements: string[], changed: boolean, added: string[], removed: string[] }}
 */
export function reconcileAchievements(currentAchievements = [], shouldHaveTiers = {}) {
  const currentList = Array.isArray(currentAchievements) ? currentAchievements : []
  const set = new Set(currentList)
  const added = []
  const removed = []

  const TIER_KEYS = ['bronze', 'silver', 'golden', 'water_man']
  TIER_KEYS.forEach(key => {
    const shouldHave = !!shouldHaveTiers[key]
    const currentlyHas = set.has(key) || (key === 'water_man' && set.has('warter_man'))

    if (shouldHave && !currentlyHas) {
      set.add(key)
      added.push(key)
    } else if (!shouldHave && currentlyHas) {
      set.delete(key)
      if (key === 'water_man') set.delete('warter_man')
      removed.push(key)
    }
  })

  const changed = added.length > 0 || removed.length > 0
  return {
    achievements: Array.from(set),
    changed,
    added,
    removed,
  }
}

/**
 * Synchronizes tier achievements for a member into Firestore if needed.
 * Cleans up pinnedAchievements and activeAchievement if an achievement was revoked.
 */
export async function syncMemberTierAchievements(db, uid, playHistoryDocs, allGames, currentMemberData, paymentDocs = null) {
  if (!uid || !db) return null

  let payments = paymentDocs
  if (!payments && db && uid) {
    try {
      const q = query(
        collection(db, 'payments'),
        where('memberUids', 'array-contains', uid)
      )
      const snap = await getDocs(q)
      payments = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch {
      payments = []
    }
  }

  const stats = calculatePlayedStats(playHistoryDocs, allGames)
  const drinkStats = calculateDrinkStats(payments || [], uid)
  const shouldHave = evaluateTierAchievements(stats.percentage, drinkStats.qualifies)

  const currentAchs = Array.isArray(currentMemberData?.achievements)
    ? currentMemberData.achievements
    : (currentMemberData?.achievement ? [currentMemberData.achievement] : [])

  const { achievements: newAchs, changed, added, removed } = reconcileAchievements(currentAchs, shouldHave)

  if (!changed) {
    return {
      changed: false,
      ...stats,
      drinkStats,
      achievements: newAchs,
      shouldHave,
    }
  }

  // Clean up pinnedAchievements if any was revoked
  const currentPinned = Array.isArray(currentMemberData?.pinnedAchievements)
    ? currentMemberData.pinnedAchievements
    : []
  const newPinned = currentPinned.filter(id => newAchs.includes(id) || (id === 'warter_man' && newAchs.includes('water_man')))

  // Clean up activeAchievement if revoked
  let newActive = currentMemberData?.activeAchievement || null
  if (newActive && !newAchs.includes(newActive) && !(newActive === 'warter_man' && newAchs.includes('water_man'))) {
    newActive = newPinned.length > 0 ? newPinned[0] : null
  }

  const updatePayload = {
    achievements: newAchs,
    achievement: newAchs.length > 0 ? newAchs[0] : null,
    pinnedAchievements: newPinned,
    activeAchievement: newActive || null,
  }

  try {
    await updateDoc(doc(db, 'members', uid), updatePayload)
  } catch (err) {
    console.error(`Failed to update tier achievements for member ${uid}:`, err)
    throw err
  }

  return {
    changed: true,
    ...stats,
    drinkStats,
    achievements: newAchs,
    pinnedAchievements: newPinned,
    activeAchievement: newActive,
    added,
    removed,
    shouldHave,
  }
}
