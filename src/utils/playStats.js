import { useState, useEffect, useMemo } from 'react'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export function useTopPlayedGames90d(allGames = []) {
  const [playCounts, setPlayCounts] = useState({})

  useEffect(() => {
    let ordersList = []
    let paymentsList = []

    const recalculate = () => {
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
      const counts = {}
      const seenOrderIds = new Set()

      // Title to ID mapping for games without scriptId
      const titleToIdMap = new Map()
      if (Array.isArray(allGames)) {
        allGames.forEach(g => {
          if (g.title && g.id) {
            titleToIdMap.set(g.title.trim().toLowerCase(), g.id)
          }
        })
      }

      // 1. Count from payments
      paymentsList.forEach(data => {
        const dt = data.paidAt?.toDate ? data.paidAt.toDate() : (data.paidAt ? new Date(data.paidAt) : data.createdAt?.toDate ? data.createdAt.toDate() : null)
        if (dt && dt.getTime() >= ninetyDaysAgo) {
          if (data.orderId) seenOrderIds.add(data.orderId)
          let sid = data.scriptId
          if (!sid && data.scriptTitle) {
            sid = titleToIdMap.get(data.scriptTitle.trim().toLowerCase())
          }
          if (sid) {
            counts[sid] = (counts[sid] || 0) + 1
          }
        }
      })

      // 2. Count from orders not already recorded in payments
      ordersList.forEach(data => {
        if (data.id && seenOrderIds.has(data.id)) return
        const dt = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null)
        if (dt && dt.getTime() >= ninetyDaysAgo) {
          let sid = data.scriptId
          if (!sid && data.scriptTitle) {
            sid = titleToIdMap.get(data.scriptTitle.trim().toLowerCase())
          }
          if (sid) {
            counts[sid] = (counts[sid] || 0) + 1
          }
        }
      })

      setPlayCounts(counts)
    }

    const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(250))
    const unsubOrders = onSnapshot(qOrders, snap => {
      ordersList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      recalculate()
    }, () => {})

    const qPayments = query(collection(db, 'payments'), orderBy('paidAt', 'desc'), limit(250))
    const unsubPayments = onSnapshot(qPayments, snap => {
      paymentsList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      recalculate()
    }, () => {})

    return () => {
      unsubOrders()
      unsubPayments()
    }
  }, [allGames])

  const topGames = useMemo(() => {
    if (!allGames || allGames.length === 0) return []

    // Filter games with at least 1 round played in the past 90 days
    const withCounts = allGames
      .filter(g => (playCounts[g.id] || 0) > 0)
      .map(g => ({
        ...g,
        playCount90d: playCounts[g.id] || 0,
      }))
      .sort((a, b) => {
        if (b.playCount90d !== a.playCount90d) {
          return b.playCount90d - a.playCount90d
        }
        return (a.title || '').localeCompare(b.title || '')
      })

    return withCounts
  }, [allGames, playCounts])

  return { topGames, playCounts }
}
