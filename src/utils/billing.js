/**
 * Calculates a member's individual / single bill from a payment document.
 * Ensures only the individual member's share is counted, preventing room-wide group bills
 * from inflating an individual player's total spend or receipt.
 */
export function getMemberSingleBill(h, meUid) {
  if (!h || !meUid) return 0

  // 1. Exact match in memberBills (POS per-member breakdown)
  const myBill = Array.isArray(h.memberBills) ? h.memberBills.find(m => m && m.uid === meUid) : null
  if (myBill && myBill.total !== undefined && myBill.total !== null) {
    const n = Number(myBill.total)
    if (!isNaN(n)) return n
  }

  // 2. Exact match in memberPayments (individual payment amount)
  const myPayment = h.memberPayments?.[meUid]
  if (myPayment && typeof myPayment.amount === 'number' && !myPayment.forAll) {
    return Number(myPayment.amount) || 0
  }

  // 3. Member count
  const membersCount = h.members?.length || h.memberUids?.length || 1
  if (membersCount <= 1) {
    return Number(h.grandTotal) || 0
  }

  // 4. Multi-member session with no per-member bill:
  // Calculate individual share (gameUnitPrice + member's food, or gameTotal / membersCount, or grandTotal / membersCount)
  // NEVER return the full grandTotal of the entire group!
  let foodTotal = 0
  if (h.memberFoodHistory?.[meUid]) {
    foodTotal = h.memberFoodHistory[meUid].reduce((s, f) => s + (Number(f.price) || 0) * (Number(f.qty) || 1), 0)
  } else if (Array.isArray(h.foodItems)) {
    foodTotal = h.foodItems
      .filter(f => f.orderedBy?.uid === meUid)
      .reduce((s, f) => s + (Number(f.price) || 0) * (Number(f.qty) || 1), 0)
  }

  if (Number(h.gameUnitPrice) > 0) {
    return Number(h.gameUnitPrice) + foodTotal
  }
  if (Number(h.gameTotal) > 0) {
    return Math.round(Number(h.gameTotal) / membersCount) + foodTotal
  }
  if (Number(h.grandTotal) > 0) {
    return Math.round(Number(h.grandTotal) / membersCount)
  }

  return 0
}
