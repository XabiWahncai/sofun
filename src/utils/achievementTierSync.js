// Automated Achievement Tier Sync Engine (Bronze > 30%, Silver > 50%, Golden > 80%)
// Evaluates all played games (including retroactive history) against total active scripts.
// Zero emojis rule strictly applied.

import { doc, updateDoc } from 'firebase/firestore'

/**
 * Calculates played games statistics for a user.
 * @param {Array} playHistoryDocs Array of playHistory document snapshots or data objects
 * @param {Array} allGames Array of all script objects from Firestore
 * @returns {{ playedCount: number, totalGames: number, percentage: number, playedGameIds: Set<string> }}
 */
export function calculatePlayedStats(playHistoryDocs, allGames) {
  const validGames = Array.isArray(allGames)
    ? allGames.filter(g => !g.isDeleted && !g.archived)
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
      if (!data) return
      const sid = data.scriptId ? String(data.scriptId) : null
      const title = data.scriptTitle ? data.scriptTitle.trim().toLowerCase() : null

      if (sid && gameIdSet.has(sid)) {
        playedGameIds.add(sid)
      } else if (title && gameTitleMap.has(title)) {
        playedGameIds.add(gameTitleMap.get(title))
      } else if (sid) {
        playedGameIds.add(sid)
      }
    })
  }

  const playedCount = playedGameIds.size
  const percentage = totalGames > 0 ? (playedCount / totalGames) * 100 : 0
  return { playedCount, totalGames, percentage, playedGameIds }
}

/**
 * Determines which tier achievements a player qualifies for based on percentage of store games played.
 * - Bronze Player: > 30%
 * - Silver Player: > 50%
 * - Golden Player: > 80%
 * @param {number} percentage
 * @returns {{ bronze: boolean, silver: boolean, golden: boolean }}
 */
export function evaluateTierAchievements(percentage) {
  return {
    bronze: percentage > 30,
    silver: percentage > 50,
    golden: percentage > 80,
  }
}

/**
 * Reconciles the current achievements array with the required tier achievements.
 * Automatically adds qualified tiers and removes revoked tiers.
 * Leaves all other achievements intact.
 * @param {Array<string>} currentAchievements
 * @param {{ bronze: boolean, silver: boolean, golden: boolean }} shouldHaveTiers
 * @returns {{ achievements: string[], changed: boolean, added: string[], removed: string[] }}
 */
export function reconcileAchievements(currentAchievements = [], shouldHaveTiers = {}) {
  const currentList = Array.isArray(currentAchievements) ? currentAchievements : []
  const set = new Set(currentList)
  const added = []
  const removed = []

  const TIER_KEYS = ['bronze', 'silver', 'golden']
  TIER_KEYS.forEach(key => {
    const shouldHave = !!shouldHaveTiers[key]
    const currentlyHas = set.has(key)

    if (shouldHave && !currentlyHas) {
      set.add(key)
      added.push(key)
    } else if (!shouldHave && currentlyHas) {
      set.delete(key)
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
export async function syncMemberTierAchievements(db, uid, playHistoryDocs, allGames, currentMemberData) {
  if (!uid || !db) return null

  const stats = calculatePlayedStats(playHistoryDocs, allGames)
  const shouldHave = evaluateTierAchievements(stats.percentage)

  const currentAchs = Array.isArray(currentMemberData?.achievements)
    ? currentMemberData.achievements
    : (currentMemberData?.achievement ? [currentMemberData.achievement] : [])

  const { achievements: newAchs, changed, added, removed } = reconcileAchievements(currentAchs, shouldHave)

  if (!changed) {
    return {
      changed: false,
      ...stats,
      achievements: newAchs,
      shouldHave,
    }
  }

  // Clean up pinnedAchievements if any was revoked
  const currentPinned = Array.isArray(currentMemberData?.pinnedAchievements)
    ? currentMemberData.pinnedAchievements
    : []
  const newPinned = currentPinned.filter(id => newAchs.includes(id))

  // Clean up activeAchievement if revoked
  let newActive = currentMemberData?.activeAchievement || null
  if (newActive && !newAchs.includes(newActive)) {
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
    achievements: newAchs,
    pinnedAchievements: newPinned,
    activeAchievement: newActive,
    added,
    removed,
    shouldHave,
  }
}
