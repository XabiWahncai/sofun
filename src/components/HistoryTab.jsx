import React, { useState, useEffect, useMemo } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  DEFAULT_RECEIPT_SETTINGS,
  buildSlipHTML,
  fmtSlipDT,
} from '../constants/receipt'

// ── Helpers ──────────────────────────────────────────────────────────────────
const toDateObj = (v) => {
  if (!v) return null
  if (v instanceof Date) return v
  if (v?.toDate) return v.toDate()
  if (v?.seconds) return new Date(v.seconds * 1000)
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

const fmtThaiDate = (d) => {
  if (!d) return '—'
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })
}

const fmtThaiTime = (d) => {
  if (!d) return ''
  return d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const calcDuration = (start, end) => {
  const s = toDateObj(start)
  const e = toDateObj(end)
  if (!s || !e) return null
  const diffMs = e.getTime() - s.getTime()
  if (diffMs < 60000) return null
  const totalMins = Math.floor(diffMs / 60000)
  const hrs = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hrs > 0) return `${hrs} ชม. ${mins > 0 ? `${mins} น.` : ''}`
  return `${mins} นาที`
}

const toDatetimeLocal = (v) => {
  const d = toDateObj(v)
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const MM = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`
}

export const getCleanGrandTotal = (p) => {
  if (!p) return 0
  const expectedItemsTotal = Math.max(
    0,
    (p.gameTotal || 0) +
    (p.foodTotal !== undefined && p.foodTotal !== null
      ? p.foodTotal
      : (p.foodItems || []).reduce((s, f) => s + (f.price || 0) * (f.qty || 1), 0)) -
    (p.discount?.applied || 0)
  )
  if (expectedItemsTotal > 0 && (!p.grandTotal || p.grandTotal > expectedItemsTotal * 1.05)) {
    return expectedItemsTotal
  }
  return p.grandTotal || expectedItemsTotal || 0
}

// ── Thermal Slip Modal Component ─────────────────────────────────────────────
export function ThermalSlipModal({ payment, receiptSettings, onClose, showToast }) {
  const [selectedMemberUid, setSelectedMemberUid] = useState('all') // 'all' or uid
  const [printing, setPrinting] = useState(false)

  if (!payment) return null

  const ps = receiptSettings?.paymentSlip || DEFAULT_RECEIPT_SETTINGS.paymentSlip
  const openAt = toDateObj(payment.openAt) || toDateObj(payment.paidAt) || new Date()
  const paidAt = toDateObj(payment.paidAt) || new Date()
  const members = payment.members || []
  const serial = payment.serial || 1
  const serialStr = String(serial).padStart(10, '0')
  const chkStr = String(serial).padStart(5, '0') + '/' + (members.length || 1)

  // Identify individual member bill if selected
  const activeMember = members.find(m => m.uid === selectedMemberUid)
  const memberBills = payment.memberBills || []
  const memberPayments = payment.memberPayments || {}
  const activeMemberBill = memberBills.find(b => b.uid === selectedMemberUid)
  const activeMemberPayment = memberPayments[selectedMemberUid]

  // Calculate slip numbers depending on 'all' vs individual
  const cleanTableTotal = getCleanGrandTotal(payment)
  let displayTitle = payment.scriptTitle || 'เกม'
  let displayGrandTotal = cleanTableTotal
  let displayGamePrice = payment.gameUnitPrice || (payment.gameTotal ? payment.gameTotal / (members.length || 1) : 0)
  let displayGameTotal = payment.gameTotal || 0
  let displayFoodItems = payment.foodItems || []
  let displayCustomerName = ''
  let displayCharacterName = ''

  if (selectedMemberUid !== 'all' && activeMember) {
    displayCustomerName = activeMember.name || 'ลูกค้า'
    displayCharacterName = activeMember.character || ''
    if (activeMemberBill) {
      displayGrandTotal = activeMemberBill.total || 0
      displayFoodItems = activeMemberBill.foodItems || []
      displayGamePrice = activeMemberBill.gamePrice || displayGamePrice
    } else if (activeMemberPayment) {
      const rawAmt = Number(activeMemberPayment.amount) || 0
      if (rawAmt >= cleanTableTotal && members.length > 1) {
        displayGrandTotal = cleanTableTotal / members.length
      } else {
        displayGrandTotal = rawAmt || (cleanTableTotal / (members.length || 1))
      }
    } else {
      displayGrandTotal = cleanTableTotal / (members.length || 1)
    }
  }

  const vatRate = Number(ps.vatRate) || 7
  const tax = ps.showVat ? (displayGrandTotal * vatRate / (100 + vatRate)) : 0
  const subtotal = displayGrandTotal - tax
  const discAmt = selectedMemberUid === 'all' ? (payment.discount?.applied || 0) : 0

  const handlePrint = () => {
    setPrinting(true)
    try {
      const html = buildSlipHTML({
        serial,
        members,
        room: payment.room,
        scriptTitle: payment.scriptTitle,
        gameUnitPrice: selectedMemberUid !== 'all' ? displayGamePrice : 0,
        gameTotal: selectedMemberUid === 'all' ? displayGameTotal : 0,
        foodItems: displayFoodItems,
        discount: selectedMemberUid === 'all' ? payment.discount : null,
        grandTotal: displayGrandTotal,
        openAt,
        printAt: new Date(),
        printCount: 1,
        customerName: displayCustomerName,
        characterName: displayCharacterName,
        ending: payment.ending || '',
      }, receiptSettings)

      const win = window.open('', '_blank', 'width=420,height=800,scrollbars=yes')
      if (win) {
        win.document.write(html)
        win.document.close()
        setTimeout(() => {
          win.focus()
          win.print()
        }, 300)
      }
      showToast?.('ส่งคำสั่งพิมพ์เรียบร้อย')
    } catch (e) {
      showToast?.('เกิดข้อผิดพลาดในการพิมพ์: ' + e.message, 'error')
    } finally {
      setPrinting(false)
    }
  }

  const is58 = ps.paperWidth === '58mm'

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="slip-modal" style={{ maxWidth: 440 }}>
        <div className="slip-modal-header">
          <div className="slip-modal-title">
            <i className="fas fa-receipt" style={{ color: 'var(--crimson-500)', marginRight: 8 }} />
            ใบเสร็จชำระเงิน · {payment.sessionLabel || payment.room || 'โต๊ะ'}
          </div>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {/* Member Selector (if table has multiple members) */}
        {members.length > 1 && (
          <div style={{ padding: '12px 18px', background: 'var(--surface-page)', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              พิมพ์แบบ:
            </span>
            <button
              type="button"
              className={`adm-pill-btn sm${selectedMemberUid === 'all' ? ' active' : ''}`}
              onClick={() => setSelectedMemberUid('all')}
            >
              บิลรวมทั้งโต๊ะ ({members.length} คน)
            </button>
            {members.map(m => (
              <button
                key={m.uid}
                type="button"
                className={`adm-pill-btn sm${selectedMemberUid === m.uid ? ' active' : ''}`}
                onClick={() => setSelectedMemberUid(m.uid)}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        <div className="slip-modal-body" style={{ maxHeight: '65vh', overflowY: 'auto', background: '#374151', padding: '20px 14px', display: 'flex', justifyContent: 'center' }}>
          <div
            className="slip-preview"
            style={{
              fontFamily: ps.fontFamily,
              fontSize: `${ps.fontSize}px`,
              fontWeight: ps.fontWeight,
              lineHeight: ps.lineHeight,
              width: is58 ? '215px' : '302px',
              background: '#ffffff',
              color: '#000000',
              padding: '16px 14px',
              borderRadius: '4px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              userSelect: 'text',
            }}
          >
            {/* Header / Store details */}
            {ps.showCompanyEn && receiptSettings?.companyNameEn && (
              <div className="c b" style={{ textAlign: ps.headerAlign, fontSize: `${ps.headerFontSize}px` }}>
                {receiptSettings.companyNameEn}
              </div>
            )}
            {ps.showCompanyTh && receiptSettings?.companyNameTh && (
              <div className="c" style={{ textAlign: ps.headerAlign }}>{receiptSettings.companyNameTh}</div>
            )}
            {ps.showBranch && receiptSettings?.branch && (
              <div className="c" style={{ textAlign: ps.headerAlign }}>{receiptSettings.branch}</div>
            )}

            {ps.showSerialChk && (
              <>
                <div>Serial: {serialStr}</div>
                <div>CHK: {chkStr}</div>
              </>
            )}
            <div>Open at: {fmtSlipDT(openAt)}</div>
            <div className={`adm-slip-sep ${ps.separatorStyle}`} />

            {ps.showRoomGst && (
              <>
                <div className="c">ROOM: {payment.room || '-'} | GST: {members.length}</div>
                <div className={`adm-slip-sep ${ps.separatorStyle}`} />
              </>
            )}

            {selectedMemberUid !== 'all' && (
              <div style={{ fontWeight: 'bold', margin: '4px 0' }}>
                ลูกค้า: {displayCustomerName} {displayCharacterName ? `(${displayCharacterName})` : ''}
              </div>
            )}

            <div className="c b" style={{ textAlign: ps.headerAlign }}>{ps.title || 'ORDER'}</div>

            {/* Line items */}
            <table className="adm-slip-table">
              <tbody>
                {selectedMemberUid === 'all' ? (
                  payment.gameTotal > 0 && (
                    <tr>
                      <td>{payment.scriptTitle || 'เกม'} ×{members.length}</td>
                      <td className="r">{(payment.gameTotal || 0).toFixed(2)}</td>
                    </tr>
                  )
                ) : (
                  displayGamePrice > 0 && (
                    <tr>
                      <td>{payment.scriptTitle || 'เกม'} (รายคน)</td>
                      <td className="r">{displayGamePrice.toFixed(2)}</td>
                    </tr>
                  )
                )}

                {displayFoodItems.map((fi, i) => {
                  const addStr = fi.addons?.length ? ` (${fi.addons.map(a => a.name || a).join(',')})` : ''
                  return (
                    <tr key={i}>
                      <td>{fi.name}{addStr} ×{fi.qty || 1}</td>
                      <td className="r">{((fi.price || 0) * (fi.qty || 1)).toFixed(2)}</td>
                    </tr>
                  )
                })}

                {discAmt > 0 && (
                  <tr>
                    <td>Discount</td>
                    <td className="r">-{discAmt.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className={`adm-slip-sep ${ps.separatorStyle}`} />

            {/* Totals table */}
            <table className="adm-slip-table">
              <tbody>
                <tr>
                  <td>Subtotal:</td>
                  <td className="r">{subtotal.toFixed(2)}</td>
                </tr>
                {ps.showVat && (
                  <tr>
                    <td>Tax ({vatRate}%):</td>
                    <td className="r">{tax.toFixed(2)}</td>
                  </tr>
                )}
                <tr className="b">
                  <td>Total:</td>
                  <td className="r">{displayGrandTotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Cash:</td>
                  <td className="r">{displayGrandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div className={`adm-slip-sep ${ps.separatorStyle}`} />

            {ps.showPaidBadge && <div className="b">[PAID]</div>}
            {payment.ending && <div>ผลเกม: {payment.ending}</div>}
            <div>Print at: {fmtSlipDT(paidAt)}</div>
            {ps.showPrintTimes && <div>Times of Printing: {payment.printCount || 1}</div>}

            {/* Footer */}
            <div className="adm-slip-foot">
              {ps.showAddress && receiptSettings?.addressLine1 && <div>{receiptSettings.addressLine1}</div>}
              {ps.showAddress && receiptSettings?.addressLine2 && <div>{receiptSettings.addressLine2}</div>}
              {ps.showTaxId && receiptSettings?.taxId && <div>Tax ID No.{receiptSettings.taxId}</div>}
              {ps.showWebsite && receiptSettings?.website && <div>{receiptSettings.website}</div>}
              {ps.showPhone && receiptSettings?.phone && <div>Tell {receiptSettings.phone}</div>}
              {ps.showSlogan && receiptSettings?.footerSlogan && <div>{receiptSettings.footerSlogan}</div>}
              {ps.showSlogan && receiptSettings?.footerThankYou && <div>{receiptSettings.footerThankYou}</div>}
            </div>
          </div>
        </div>

        <div className="slip-modal-footer" style={{ padding: '12px 18px', display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--surface-card)', borderTop: '1px solid var(--border-default)' }}>
          <button className="adm-btn-outline" onClick={onClose}>
            ปิด
          </button>
          <button className="adm-btn-red" onClick={handlePrint} disabled={printing}>
            {printing ? <span className="spinner-sm" /> : <><i className="fas fa-print" /> พิมพ์สลีปนี้</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Member History Drawer / Modal Component ──────────────────────────────────
export function MemberHistoryModal({ member, payments = [], receiptSettings, onClose, onOpenSlip, onEditPayment, showToast }) {
  if (!member) return null

  const memberName = member.nickname || `${member.firstname || ''} ${member.lastname || ''}`.trim() || 'สมาชิก'
  const memberUid = member.id || member.uid

  // Find all payments this member participated in
  const memberHistory = payments.filter(p => {
    if (p.memberUids?.includes(memberUid)) return true
    if (p.members?.some(m => m.uid === memberUid || m.name === memberName)) return true
    return false
  })

  // Calculate customer metrics
  const totalGamesPlayed = memberHistory.filter(p => !!p.scriptTitle || !!p.scriptId).length
  const totalSpent = memberHistory.reduce((sum, p) => {
    const mb = p.memberBills?.find(b => b.uid === memberUid)
    if (mb?.total) return sum + mb.total
    const mp = p.memberPayments?.[memberUid]
    if (mp?.amount) return sum + Number(mp.amount)
    const n = p.members?.length || 1
    return sum + ((p.grandTotal || 0) / n)
  }, 0)

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-edit-modal" style={{ maxWidth: 640 }}>
        <div className="adm-edit-modal-header">
          <div className="adm-edit-modal-title">
            <div className="adm-member-ava large" style={{ width: 44, height: 44 }}>
              {member.pictureUrl ? (
                <img src={member.pictureUrl} alt="" onError={e => e.currentTarget.style.display = 'none'} />
              ) : (
                <span>{memberName[0]}</span>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{memberName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {member.email || member.tel_no || 'ประวัติการเล่นและบิลย้อนหลัง'}
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="adm-edit-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {/* Lifetime stats pill */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'var(--surface-page)', borderRadius: 12, padding: '12px 16px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>เล่นไปแล้ว</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--crimson-500)', marginTop: 4 }}>
                {totalGamesPlayed} <span style={{ fontSize: 13, fontWeight: 600 }}>รอบ</span>
              </div>
            </div>
            <div style={{ background: 'var(--surface-page)', borderRadius: 12, padding: '12px 16px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>ยอดใช้จ่ายสะสม</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                ฿{Math.round(totalSpent).toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fas fa-history" /> ประวัติการเล่นทั้งหมด ({memberHistory.length})
          </div>

          {memberHistory.length === 0 ? (
            <div className="adm-empty" style={{ padding: '36px 0', textAlign: 'center' }}>
              <i className="fas fa-ghost" style={{ fontSize: 28, opacity: 0.3, marginBottom: 8, display: 'block' }} />
              ยังไม่พบประวัติการเล่นหรือบิลชำระเงินของสมาชิกท่านนี้
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {memberHistory.map(p => {
                const paidAt = toDateObj(p.paidAt)
                const meInParty = p.members?.find(m => m.uid === memberUid || m.name === memberName)
                const myBill = p.memberBills?.find(b => b.uid === memberUid)
                const myPayment = p.memberPayments?.[memberUid]
                const myAmount = myBill?.total || (myPayment?.amount ? Number(myPayment.amount) : null) || ((p.grandTotal || 0) / (p.members?.length || 1))

                return (
                  <div
                    key={p.id}
                    style={{
                      background: 'var(--surface-card)',
                      borderRadius: 12,
                      border: '1px solid var(--border-default)',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
                          {p.scriptTitle || 'เกม / ออเดอร์'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          <i className="fas fa-calendar-alt" style={{ marginRight: 4 }} />
                          {fmtThaiDate(paidAt)} {fmtThaiTime(paidAt)}
                          {p.room && ` · ${p.room}`}
                          {p.dm && ` · DM: ${p.dm}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--crimson-500)' }}>
                          ฿{Math.round(myAmount).toLocaleString()}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>ยอดสมาชิก</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {meInParty?.character && (
                        <span className="qr-history-tag" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--crimson-500)' }}>
                          <i className="fas fa-user-secret" /> บท: {meInParty.character}
                        </span>
                      )}
                      {p.ending && (
                        <span className="qr-history-tag" style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}>
                          <i className="fas fa-flag-checkered" /> {p.ending}
                        </span>
                      )}
                      <span className="qr-history-tag">
                        <i className="fas fa-users" /> {p.members?.length || 1} คน
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
                      {onEditPayment && (
                        <button
                          type="button"
                          className="adm-btn-outline"
                          style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={() => {
                            onClose?.()
                            onEditPayment(p)
                          }}
                          title="แก้ไขข้อมูลย้อนหลัง"
                        >
                          <i className="fas fa-edit" style={{ color: 'var(--crimson-500)', marginRight: 4 }} /> แก้ไข
                        </button>
                      )}
                      <button
                        type="button"
                        className="adm-btn-outline"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => onOpenSlip(p)}
                      >
                        <i className="fas fa-receipt" /> ดูสลีป / พิมพ์บิล
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Edit Payment Modal Component (Retroactive Data Editing) ──────────────────
export function EditPaymentModal({
  payment,
  allGames = [],
  availableMembers = [],
  dmOptions = [],
  onClose,
  showToast,
}) {
  if (!payment) return null

  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => {
    const rawPaid = payment.paidAt || payment.openAt || new Date()
    return {
      scriptTitle: payment.scriptTitle || '',
      scriptId: payment.scriptId || '',
      room: payment.room || '',
      dm: payment.dm || '',
      npc: payment.npc || '',
      ending: payment.ending || '',
      paidAt: toDatetimeLocal(rawPaid),
      gameTotal: payment.gameTotal ?? (payment.grandTotal || 0),
      discountApplied: payment.discount?.applied ?? 0,
      grandTotal: getCleanGrandTotal(payment),
      notes: payment.notes || '',
      members: (payment.members || []).map(m => ({
        uid: m.uid || '',
        name: m.name || '',
        character: m.character || '',
        avatar: m.avatar || '',
      })),
    }
  })

  // Adding new player state
  const [addMode, setAddMode] = useState('select') // 'select' | 'custom'
  const [selectedAddUid, setSelectedAddUid] = useState('')
  const [customAddName, setCustomAddName] = useState('')
  const [customAddChar, setCustomAddChar] = useState('')

  // Presets
  const ROOM_PRESETS = ['Ghost Room', 'Cyberpunk Room', 'Medieval Room', 'Room 1', 'Room 2', 'Room 3', 'โต๊ะ 1', 'โต๊ะ 2']
  const ENDING_PRESETS = ['good-ending', 'bad-ending', 'true-ending', 'ฆาตกรชนะ', 'นักสืบชนะ', 'เสมอ', 'คดีปิดไม่ลง']
  const DEFAULT_DMS = ['Smooth Operator', 'DM Palm', 'DM Max', 'DM Ice', 'DM Film']
  const effectiveDmPresets = useMemo(() => {
    const set = new Set([...DEFAULT_DMS, ...dmOptions])
    return Array.from(set).filter(Boolean)
  }, [dmOptions])

  const handleGameChange = (e) => {
    const title = e.target.value
    const found = allGames.find(g => g.title === title)
    setForm(prev => ({
      ...prev,
      scriptTitle: title,
      scriptId: found ? (found.id || found.slug || '') : prev.scriptId,
    }))
  }

  const handleAddPlayer = () => {
    if (addMode === 'select') {
      if (!selectedAddUid) return
      const found = availableMembers.find(m => (m.id || m.uid) === selectedAddUid)
      if (!found) return
      const name = found.nickname || `${found.firstname || ''} ${found.lastname || ''}`.trim() || 'สมาชิก'
      setForm(prev => ({
        ...prev,
        members: [
          ...prev.members,
          {
            uid: found.id || found.uid || '',
            name,
            character: customAddChar.trim(),
            avatar: found.pictureUrl || '',
          },
        ],
      }))
      setSelectedAddUid('')
      setCustomAddChar('')
    } else {
      if (!customAddName.trim()) return
      setForm(prev => ({
        ...prev,
        members: [
          ...prev.members,
          {
            uid: '',
            name: customAddName.trim(),
            character: customAddChar.trim(),
            avatar: '',
          },
        ],
      }))
      setCustomAddName('')
      setCustomAddChar('')
    }
  }

  const handleRemoveMember = (idx) => {
    setForm(prev => ({
      ...prev,
      members: prev.members.filter((_, i) => i !== idx),
    }))
  }

  const handleMemberFieldChange = (idx, field, val) => {
    setForm(prev => {
      const next = [...prev.members]
      next[idx] = { ...next[idx], [field]: val }
      return { ...prev, members: next }
    })
  }

  const handleAutoRecalc = () => {
    const foodTotal = payment.foodTotal !== undefined && payment.foodTotal !== null
      ? payment.foodTotal
      : (payment.foodItems || []).reduce((s, f) => s + (f.price || 0) * (f.qty || 1), 0)
    const newGrand = Math.max(0, (Number(form.gameTotal) || 0) + foodTotal - (Number(form.discountApplied) || 0))
    setForm(prev => ({ ...prev, grandTotal: newGrand }))
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    setSaving(true)
    try {
      const dtObj = form.paidAt ? new Date(form.paidAt) : new Date()
      const validDate = isNaN(dtObj.getTime()) ? new Date() : dtObj
      const updatedMemberUids = form.members.map(m => m.uid).filter(Boolean)

      // Sync memberBills if array exists
      let updatedMemberBills = payment.memberBills || []
      if (Array.isArray(updatedMemberBills) && updatedMemberBills.length > 0) {
        updatedMemberBills = updatedMemberBills.map(mb => {
          const matched = form.members.find(m => m.uid && m.uid === mb.uid)
          if (matched) {
            return {
              ...mb,
              name: matched.name || mb.name,
              character: matched.character || mb.character,
            }
          }
          return mb
        })
      }

      const patch = {
        scriptTitle: form.scriptTitle.trim(),
        scriptId: form.scriptId || '',
        room: form.room.trim(),
        dm: form.dm.trim(),
        npc: form.npc.trim(),
        ending: form.ending.trim(),
        paidAt: Timestamp.fromDate(validDate),
        members: form.members,
        memberUids: updatedMemberUids,
        memberBills: updatedMemberBills,
        gameTotal: Number(form.gameTotal) || 0,
        discount: {
          ...(payment.discount || {}),
          applied: Number(form.discountApplied) || 0,
          value: Number(form.discountApplied) || 0,
        },
        grandTotal: Number(form.grandTotal) || 0,
        notes: form.notes.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: 'admin',
      }

      await updateDoc(doc(db, 'payments', payment.id), patch)

      // If linked with active or archived order
      if (payment.orderId) {
        try {
          await updateDoc(doc(db, 'orders', payment.orderId), {
            scriptTitle: patch.scriptTitle,
            scriptId: patch.scriptId,
            room: patch.room,
            dm: patch.dm,
            npc: patch.npc,
            ending: patch.ending,
            members: patch.members,
            memberUids: patch.memberUids,
            discount: patch.discount,
            paidTotal: patch.grandTotal,
            updatedAt: serverTimestamp(),
          })
        } catch (err) {
          console.warn('Sync order document failed (may not exist):', err)
        }
      }

      showToast?.('อัปเดตข้อมูลประวัติการเล่นและบิลย้อนหลังเรียบร้อยแล้ว')
      onClose()
    } catch (err) {
      console.error('Failed to update payment:', err)
      showToast?.('เกิดข้อผิดพลาดในการบันทึก: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const serialStr = payment.serial ? `#${payment.serial}` : ''

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-edit-modal" style={{ maxWidth: 680, width: '95%' }}>
        {/* Header */}
        <div className="adm-edit-modal-header" style={{ borderBottom: '1px solid var(--border-default)', padding: '16px 20px' }}>
          <div className="adm-edit-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(198,36,25,0.1)', color: 'var(--crimson-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
              <i className="fas fa-edit" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>
                แก้ไขข้อมูลประวัติการเล่น / บิลย้อนหลัง {serialStr}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                ปรับปรุงห้อง, DM, ผลเกม, บทละคร, วันเวลา และรายชื่อผู้เล่นเพื่ออัปเดตประวัติของสมาชิก
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {/* Modal Body */}
        <div className="adm-edit-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          
          {/* 1. General Game & Session Info */}
          <div style={{ background: 'var(--surface-page)', borderRadius: 12, padding: 14, border: '1px solid var(--border-default)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-dice" style={{ color: 'var(--crimson-500)' }} /> ข้อมูลรอบเล่น & สคริปต์
            </div>

            {/* Script / Game */}
            <div className="adm-field" style={{ marginBottom: 12 }}>
              <label className="adm-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ชื่อบทละคร / เกม *</span>
                {allGames.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    เลือกจากคลังหรือพิมพ์ใหม่
                  </span>
                )}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: allGames.length > 0 ? '1fr 1fr' : '1fr', gap: 8 }}>
                {allGames.length > 0 && (
                  <select
                    className="adm-input"
                    value={allGames.some(g => g.title === form.scriptTitle) ? form.scriptTitle : ''}
                    onChange={handleGameChange}
                  >
                    <option value="">-- เลือกจากคลังเกม ({allGames.length}) --</option>
                    {allGames.map(g => (
                      <option key={g.id || g.title} value={g.title}>{g.title}</option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  className="adm-input"
                  placeholder="หรือพิมพ์ชื่อเกม..."
                  value={form.scriptTitle}
                  onChange={e => setForm(p => ({ ...p, scriptTitle: e.target.value }))}
                />
              </div>
            </div>

            {/* Date & Time */}
            <div className="adm-field" style={{ marginBottom: 12 }}>
              <label className="adm-label">วันและเวลาที่เล่น / ปิดบิล *</label>
              <input
                type="datetime-local"
                className="adm-input"
                value={form.paidAt}
                onChange={e => setForm(p => ({ ...p, paidAt: e.target.value }))}
              />
            </div>

            {/* Room & Table */}
            <div className="adm-field" style={{ marginBottom: 12 }}>
              <label className="adm-label">ห้อง / โต๊ะ</label>
              <input
                type="text"
                className="adm-input"
                placeholder="เช่น Ghost Room, โต๊ะ 1"
                value={form.room}
                onChange={e => setForm(p => ({ ...p, room: e.target.value }))}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {ROOM_PRESETS.map(r => (
                  <button
                    key={r}
                    type="button"
                    style={{
                      background: form.room === r ? 'var(--crimson-500)' : 'var(--surface-elevated)',
                      color: form.room === r ? '#fff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 14,
                      padding: '2px 8px',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontWeight: form.room === r ? 700 : 500,
                    }}
                    onClick={() => setForm(p => ({ ...p, room: r }))}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* DM & NPC */}
            <div className="adm-field-row" style={{ marginBottom: 12 }}>
              <div className="adm-field" style={{ flex: 1 }}>
                <label className="adm-label">DM (ผู้คุมเกม)</label>
                <input
                  type="text"
                  className="adm-input"
                  placeholder="เช่น Smooth Operator"
                  value={form.dm}
                  onChange={e => setForm(p => ({ ...p, dm: e.target.value }))}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {effectiveDmPresets.slice(0, 5).map(d => (
                    <button
                      key={d}
                      type="button"
                      style={{
                        background: form.dm === d ? '#ec4899' : 'var(--surface-elevated)',
                        color: form.dm === d ? '#fff' : 'var(--text-secondary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 14,
                        padding: '2px 8px',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontWeight: form.dm === d ? 700 : 500,
                      }}
                      onClick={() => setForm(p => ({ ...p, dm: d }))}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="adm-field" style={{ flex: 1 }}>
                <label className="adm-label">NPC / ผู้ช่วย (ถ้ามี)</label>
                <input
                  type="text"
                  className="adm-input"
                  placeholder="เช่น เมด, ผู้ช่วยสารวัตร"
                  value={form.npc}
                  onChange={e => setForm(p => ({ ...p, npc: e.target.value }))}
                />
              </div>
            </div>

            {/* Game Ending */}
            <div className="adm-field">
              <label className="adm-label">ผลเกม (Ending)</label>
              <input
                type="text"
                className="adm-input"
                placeholder="เช่น bad-ending, ฆาตกรชนะ"
                value={form.ending}
                onChange={e => setForm(p => ({ ...p, ending: e.target.value }))}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {ENDING_PRESETS.map(ed => (
                  <button
                    key={ed}
                    type="button"
                    style={{
                      background: form.ending === ed ? '#b45309' : 'var(--surface-elevated)',
                      color: form.ending === ed ? '#fff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 14,
                      padding: '2px 8px',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontWeight: form.ending === ed ? 700 : 500,
                    }}
                    onClick={() => setForm(p => ({ ...p, ending: ed }))}
                  >
                    {ed}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* 2. Members & Characters in Party */}
          <div style={{ background: 'var(--surface-page)', borderRadius: 12, padding: 14, border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-users" style={{ color: '#3b82f6' }} /> ผู้เล่นและบทละคร ({form.members.length} คน)
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                ซิงค์ประวัติไปยัง QR Code ของสมาชิกอัตโนมัติ
              </span>
            </div>

            {/* Player list */}
            {form.members.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, background: 'var(--surface-card)', borderRadius: 8 }}>
                ยังไม่มีรายชื่อผู้เล่นในรอบนี้
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {form.members.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: 'var(--surface-card)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.uid ? 'var(--crimson-500)' : 'var(--text-tertiary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                      {m.avatar ? <img src={m.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.currentTarget.style.display = 'none'} /> : (m.name || '?')[0]}
                    </div>

                    <div style={{ flex: 1.2 }}>
                      <input
                        type="text"
                        className="adm-input"
                        style={{ padding: '6px 8px', fontSize: 12 }}
                        placeholder="ชื่อผู้เล่น"
                        value={m.name}
                        onChange={e => handleMemberFieldChange(idx, 'name', e.target.value)}
                      />
                    </div>

                    <div style={{ flex: 1.2 }}>
                      <input
                        type="text"
                        className="adm-input"
                        style={{ padding: '6px 8px', fontSize: 12 }}
                        placeholder="บทบาท / ตัวละคร"
                        value={m.character}
                        onChange={e => handleMemberFieldChange(idx, 'character', e.target.value)}
                      />
                    </div>

                    {m.uid && (
                      <span title="สมาชิกที่มีในระบบ" style={{ fontSize: 10, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <i className="fas fa-id-badge" /> สมาชิก
                      </span>
                    )}

                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 6, fontSize: 13 }}
                      onClick={() => handleRemoveMember(idx)}
                      title="ลบผู้เล่นคนนี้ออกจากรอบ"
                    >
                      <i className="fas fa-trash-alt" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Player Box */}
            <div style={{ background: 'var(--surface-elevated)', borderRadius: 10, padding: 10, border: '1px dashed var(--border-strong)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>+ เพิ่มผู้เล่น:</span>
                <label style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <input
                    type="radio"
                    name="addMode"
                    checked={addMode === 'select'}
                    onChange={() => setAddMode('select')}
                  />
                  เลือกสมาชิกในระบบ
                </label>
                <label style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <input
                    type="radio"
                    name="addMode"
                    checked={addMode === 'custom'}
                    onChange={() => setAddMode('custom')}
                  />
                  ลูกค้าทั่วไป / Walk-in
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {addMode === 'select' ? (
                  <select
                    className="adm-input"
                    style={{ flex: 1.5, minWidth: 160, padding: '6px 8px', fontSize: 12 }}
                    value={selectedAddUid}
                    onChange={e => setSelectedAddUid(e.target.value)}
                  >
                    <option value="">-- เลือกสมาชิก ({availableMembers.length}) --</option>
                    {availableMembers.map(m => {
                      const mName = m.nickname || `${m.firstname || ''} ${m.lastname || ''}`.trim() || 'สมาชิก'
                      return (
                        <option key={m.id || m.uid} value={m.id || m.uid}>
                          {mName} {m.tel_no ? `(${m.tel_no})` : ''}
                        </option>
                      )
                    })}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="adm-input"
                    style={{ flex: 1.5, minWidth: 160, padding: '6px 8px', fontSize: 12 }}
                    placeholder="ชื่อลูกค้า..."
                    value={customAddName}
                    onChange={e => setCustomAddName(e.target.value)}
                  />
                )}

                <input
                  type="text"
                  className="adm-input"
                  style={{ flex: 1.2, minWidth: 130, padding: '6px 8px', fontSize: 12 }}
                  placeholder="บทละคร / ตัวละคร..."
                  value={customAddChar}
                  onChange={e => setCustomAddChar(e.target.value)}
                />

                <button
                  type="button"
                  className="adm-btn-outline"
                  style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
                  onClick={handleAddPlayer}
                >
                  <i className="fas fa-plus" /> เพิ่ม
                </button>
              </div>
            </div>

          </div>

          {/* 3. Financial Adjustments */}
          <div style={{ background: 'var(--surface-page)', borderRadius: 12, padding: 14, border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-coins" style={{ color: '#10b981' }} /> ปรับยอดเงิน & ส่วนลด
              </div>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--crimson-500)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                onClick={handleAutoRecalc}
              >
                <i className="fas fa-calculator" /> คำนวณยอดสุทธิใหม่อัตโนมัติ
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div className="adm-field">
                <label className="adm-label">ค่าเกมรวม (฿)</label>
                <input
                  type="number"
                  className="adm-input"
                  value={form.gameTotal}
                  onChange={e => setForm(p => ({ ...p, gameTotal: e.target.value }))}
                />
              </div>

              <div className="adm-field">
                <label className="adm-label">ส่วนลด (฿)</label>
                <input
                  type="number"
                  className="adm-input"
                  value={form.discountApplied}
                  onChange={e => setForm(p => ({ ...p, discountApplied: e.target.value }))}
                />
              </div>

              <div className="adm-field">
                <label className="adm-label">ยอดสุทธิ Grand Total (฿) *</label>
                <input
                  type="number"
                  className="adm-input"
                  style={{ fontWeight: 800, color: 'var(--crimson-500)' }}
                  value={form.grandTotal}
                  onChange={e => setForm(p => ({ ...p, grandTotal: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* 4. Notes */}
          <div className="adm-field">
            <label className="adm-label">หมายเหตุเพิ่มเติม / Audit Note</label>
            <textarea
              className="adm-input"
              rows={2}
              placeholder="ระบุเหตุผลในการแก้ไขข้อมูล เช่น ลูกค้าเปลี่ยนชื่อตัวละคร, แก้ไข DM..."
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            />
          </div>

        </div>

        {/* Footer */}
        <div className="adm-edit-modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button type="button" className="adm-btn-red" onClick={handleSave} disabled={saving} style={{ minWidth: 140 }}>
            {saving ? <span className="spinner-sm" /> : <><i className="fas fa-save" /> บันทึกการแก้ไข</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main HistoryTab Component ────────────────────────────────────────────────
export default function HistoryTab({
  allGames = [],
  members = [],
  showToast,
  initialMember = null,
  onClearInitialMember = null,
}) {
  const [payments, setPayments] = useState([])
  const [receiptSettings, setReceiptSettings] = useState(DEFAULT_RECEIPT_SETTINGS)
  const [loading, setLoading] = useState(true)

  // Filters state
  const [search, setSearch] = useState(initialMember ? (initialMember.nickname || initialMember.firstname || '') : '')
  const [dateFilter, setDateFilter] = useState('all') // 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'
  const [customDate, setCustomDate] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'game' | 'food'
  const [selectedGameFilter, setSelectedGameFilter] = useState('all')
  const [selectedDmFilter, setSelectedDmFilter] = useState('all')
  const [selectedMemberFilter, setSelectedMemberFilter] = useState(initialMember ? initialMember.id : 'all')

  // Modals state
  const [slipModalPayment, setSlipModalPayment] = useState(null)
  const [editingPayment, setEditingPayment] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [expandedIds, setExpandedIds] = useState(new Set())

  // 1. Subscribe to Payments collection in real-time
  useEffect(() => {
    const q = query(collection(db, 'payments'), orderBy('paidAt', 'desc'))
    const unsub = onSnapshot(
      q,
      snap => {
        setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        console.warn('Error loading payments:', err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  // 2. Load receipt customization settings
  useEffect(() => {
    getDoc(doc(db, 'settings', 'receipt'))
      .then(snap => {
        if (snap.exists()) {
          setReceiptSettings({
            ...DEFAULT_RECEIPT_SETTINGS,
            ...snap.data(),
            paymentSlip: {
              ...DEFAULT_RECEIPT_SETTINGS.paymentSlip,
              ...(snap.data().paymentSlip || {}),
            },
          })
        }
      })
      .catch(e => console.warn('Load receipt settings failed:', e))
  }, [])

  // Update search when initialMember changes
  useEffect(() => {
    if (initialMember) {
      setSelectedMemberFilter(initialMember.id)
      setSearch(initialMember.nickname || initialMember.firstname || '')
    }
  }, [initialMember])

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Unique Options for Dropdowns ──────────────────────────────────────────
  const gameOptions = useMemo(() => {
    const set = new Set()
    payments.forEach(p => { if (p.scriptTitle) set.add(p.scriptTitle) })
    allGames.forEach(g => { if (g.title) set.add(g.title) })
    return Array.from(set).sort()
  }, [payments, allGames])

  const dmOptions = useMemo(() => {
    const set = new Set()
    payments.forEach(p => { if (p.dm) set.add(p.dm) })
    return Array.from(set).sort()
  }, [payments])

  // ── Filter Logic ─────────────────────────────────────────────────────────
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const paidDate = toDateObj(p.paidAt) || toDateObj(p.openAt)

      // Date preset filter
      if (dateFilter === 'today') {
        if (!paidDate || paidDate < todayStart) return false
      } else if (dateFilter === 'yesterday') {
        if (!paidDate || paidDate < yesterdayStart || paidDate >= todayStart) return false
      } else if (dateFilter === 'week') {
        if (!paidDate || paidDate < weekStart) return false
      } else if (dateFilter === 'month') {
        if (!paidDate || paidDate < monthStart) return false
      } else if (dateFilter === 'custom' && customDate) {
        if (!paidDate) return false
        const year = paidDate.getFullYear()
        const month = String(paidDate.getMonth() + 1).padStart(2, '0')
        const day = String(paidDate.getDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`
        if (dateStr !== customDate) return false
      }

      // Type filter
      if (typeFilter === 'game') {
        if (!p.scriptTitle && !p.scriptId && (!p.gameTotal || p.gameTotal <= 0)) return false
      } else if (typeFilter === 'food') {
        if (!p.foodItems || p.foodItems.length === 0) return false
      }

      // Game title filter
      if (selectedGameFilter !== 'all' && p.scriptTitle !== selectedGameFilter) {
        return false
      }

      // DM filter
      if (selectedDmFilter !== 'all' && p.dm !== selectedDmFilter) {
        return false
      }

      // Specific member filter
      if (selectedMemberFilter !== 'all') {
        const inUids = p.memberUids?.includes(selectedMemberFilter)
        const inMembers = p.members?.some(m => m.uid === selectedMemberFilter)
        if (!inUids && !inMembers) return false
      }

      // General Text Search (Member name, character, game title, DM, room, serial, ending)
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchTitle = (p.scriptTitle || '').toLowerCase().includes(q)
        const matchRoom = (p.room || '').toLowerCase().includes(q)
        const matchDm = (p.dm || '').toLowerCase().includes(q)
        const matchEnding = (p.ending || '').toLowerCase().includes(q)
        const matchSerial = String(p.serial || '').includes(q)
        const matchMembers = (p.members || []).some(m =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.character || '').toLowerCase().includes(q)
        )
        if (!matchTitle && !matchRoom && !matchDm && !matchEnding && !matchSerial && !matchMembers) {
          return false
        }
      }

      return true
    })
  }, [
    payments,
    dateFilter,
    customDate,
    typeFilter,
    selectedGameFilter,
    selectedDmFilter,
    selectedMemberFilter,
    search,
  ])

  // ── Derived KPI Metrics ──────────────────────────────────────────────────
  const totalRevenue = filteredPayments.reduce((s, p) => s + getCleanGrandTotal(p), 0)
  const totalSessions = filteredPayments.length
  const totalPlayers = filteredPayments.reduce((s, p) => s + (p.members?.length || 0), 0)
  const totalFoodRevenue = filteredPayments.reduce((s, p) => s + (p.foodTotal || 0), 0)
  const totalDiscounts = filteredPayments.reduce((s, p) => s + (p.discount?.applied || 0), 0)

  // ── Delete Payment Handler ───────────────────────────────────────────────
  const handleDeletePayment = async (p) => {
    const serialStr = p.serial ? `#${p.serial}` : ''
    const game = p.scriptTitle || 'บิลนี้'
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบบิล ${game} ${serialStr} ออกจากระบบ? (การลบจะไม่สามารถกู้คืนได้)`)) return

    setDeletingId(p.id)
    try {
      await deleteDoc(doc(db, 'payments', p.id))
      showToast?.('ลบบิลเรียบร้อยแล้ว')
    } catch (e) {
      showToast?.('เกิดข้อผิดพลาดในการลบ: ' + e.message, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // ── 1-Click Quick Print Table Receipt ─────────────────────────────────────
  const handleQuickPrint = (payment) => {
    try {
      const openAt = toDateObj(payment.openAt) || toDateObj(payment.paidAt) || new Date()
      const cleanTotal = getCleanGrandTotal(payment)
      const html = buildSlipHTML({
        serial: payment.serial || 1,
        members: payment.members || [],
        room: payment.room,
        scriptTitle: payment.scriptTitle,
        gameUnitPrice: 0,
        gameTotal: payment.gameTotal || 0,
        foodItems: payment.foodItems || [],
        discount: payment.discount,
        grandTotal: cleanTotal,
        openAt,
        printAt: new Date(),
        printCount: 1,
        ending: payment.ending || '',
      }, receiptSettings)

      const win = window.open('', '_blank', 'width=420,height=800,scrollbars=yes')
      if (win) {
        win.document.write(html)
        win.document.close()
        setTimeout(() => {
          win.focus()
          win.print()
        }, 300)
      }
      showToast?.('ส่งคำสั่งพิมพ์เรียบร้อย')
    } catch (e) {
      showToast?.('พิมพ์ล้มเหลว: ' + e.message, 'error')
    }
  }

  const resetAllFilters = () => {
    setSearch('')
    setDateFilter('all')
    setCustomDate('')
    setTypeFilter('all')
    setSelectedGameFilter('all')
    setSelectedDmFilter('all')
    setSelectedMemberFilter('all')
    onClearInitialMember?.()
  }

  const isFiltered = search || dateFilter !== 'all' || typeFilter !== 'all' || selectedGameFilter !== 'all' || selectedDmFilter !== 'all' || selectedMemberFilter !== 'all'

  if (loading) {
    return <div className="adm-loading"><div className="spinner" /></div>
  }

  return (
    <div className="adm-bill-editor-root">
      {/* ── Top Header Banner ── */}
      <div className="adm-bill-topbar">
        <div>
          <h3 className="adm-bill-top-title">
            <i className="fas fa-history" style={{ color: 'var(--crimson-500)', marginRight: 8 }} />
            ประวัติการเล่น & บิลย้อนหลัง (Play History & Billing Archive)
          </h3>
          <p className="adm-bill-top-sub">
            ค้นหาประวัติการเล่นของลูกค้า ตรวจสอบรายละเอียดเกม อาหาร ส่วนลด ดูสลีป และพิมพ์ใบเสร็จย้อนหลัง
          </p>
        </div>
        <div className="adm-bill-top-actions">
          <span className="adm-badge-num" style={{ fontSize: 13, padding: '6px 12px' }}>
            พบ <strong>{filteredPayments.length}</strong> บิล
          </span>
          {isFiltered && (
            <button className="adm-btn-outline" onClick={resetAllFilters}>
              <i className="fas fa-times" /> ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Statistics KPI Cards ── */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi">
          <div className="dash-kpi-icon" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--crimson-500)' }}>
            <i className="fas fa-coins" />
          </div>
          <div className="dash-kpi-body">
            <div className="dash-kpi-label">ยอดบิลรวม</div>
            <div className="dash-kpi-value" style={{ color: 'var(--crimson-500)' }}>
              ฿{Math.round(totalRevenue).toLocaleString()}
            </div>
            <div className="dash-kpi-sub">จาก {totalSessions} รายการ</div>
          </div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
            <i className="fas fa-gamepad" />
          </div>
          <div className="dash-kpi-body">
            <div className="dash-kpi-label">จำนวนรอบเล่น</div>
            <div className="dash-kpi-value" style={{ color: '#3b82f6' }}>
              {totalSessions} <span style={{ fontSize: 14 }}>รอบ</span>
            </div>
            <div className="dash-kpi-sub">เฉลี่ย ฿{totalSessions > 0 ? Math.round(totalRevenue / totalSessions).toLocaleString() : 0} / รอบ</div>
          </div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
            <i className="fas fa-users" />
          </div>
          <div className="dash-kpi-body">
            <div className="dash-kpi-label">จำนวนผู้เล่นรวม</div>
            <div className="dash-kpi-value" style={{ color: '#10b981' }}>
              {totalPlayers} <span style={{ fontSize: 14 }}>คน</span>
            </div>
            <div className="dash-kpi-sub">เฉลี่ย ฿{totalPlayers > 0 ? Math.round(totalRevenue / totalPlayers).toLocaleString() : 0} / คน</div>
          </div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
            <i className="fas fa-utensils" />
          </div>
          <div className="dash-kpi-body">
            <div className="dash-kpi-label">ค่าอาหาร & เครื่องดื่ม</div>
            <div className="dash-kpi-value" style={{ color: '#f59e0b' }}>
              ฿{Math.round(totalFoodRevenue).toLocaleString()}
            </div>
            <div className="dash-kpi-sub">ส่วนลดรวม ฿{Math.round(totalDiscounts).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* ── Control & Filters Card ── */}
      <div className="adm-card" style={{ padding: '16px 20px' }}>
        {/* Search Input + Date Presets */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <input
              type="text"
              className="adm-input"
              style={{ paddingLeft: 36 }}
              placeholder="ค้นหาชื่อลูกค้า, ตัวละคร, ชื่อเกม, DM, โต๊ะ, เลข Serial..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}
              >
                <i className="fas fa-times-circle" />
              </button>
            )}
          </div>

          {/* Date Range Presets */}
          <div className="adm-pills-row">
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'today', label: 'วันนี้' },
              { id: 'yesterday', label: 'เมื่อวาน' },
              { id: 'week', label: '7 วันล่าสุด' },
              { id: 'month', label: 'เดือนนี้' },
              { id: 'custom', label: 'เลือกวันที่' },
            ].map(dp => (
              <button
                key={dp.id}
                type="button"
                className={`adm-pill-btn sm${dateFilter === dp.id ? ' active' : ''}`}
                onClick={() => setDateFilter(dp.id)}
              >
                {dp.label}
              </button>
            ))}
          </div>

          {dateFilter === 'custom' && (
            <input
              type="date"
              className="adm-input"
              style={{ width: 'auto', padding: '6px 12px' }}
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
            />
          )}
        </div>

        {/* Secondary Filter Dropdowns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {/* Game Dropdown */}
          <div>
            <label className="adm-label">กรองตามเกม (Script)</label>
            <select
              className="adm-input"
              value={selectedGameFilter}
              onChange={e => setSelectedGameFilter(e.target.value)}
            >
              <option value="all">ทุกสคริปต์/เกม</option>
              {gameOptions.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* DM Dropdown */}
          <div>
            <label className="adm-label">กรองตาม DM</label>
            <select
              className="adm-input"
              value={selectedDmFilter}
              onChange={e => setSelectedDmFilter(e.target.value)}
            >
              <option value="all">ทุก DM</option>
              {dmOptions.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Type Dropdown */}
          <div>
            <label className="adm-label">ประเภทรายการ</label>
            <select
              className="adm-input"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="all">ทั้งหมด (เกม & อาหาร)</option>
              <option value="game">เฉพาะมีเกมเล่น</option>
              <option value="food">เฉพาะมีออเดอร์อาหาร</option>
            </select>
          </div>

          {/* Member Dropdown */}
          <div>
            <label className="adm-label">กรองตามสมาชิก</label>
            <select
              className="adm-input"
              value={selectedMemberFilter}
              onChange={e => setSelectedMemberFilter(e.target.value)}
            >
              <option value="all">สมาชิกทุกคน</option>
              {members.map(m => {
                const name = m.nickname || `${m.firstname || ''} ${m.lastname || ''}`.trim() || 'สมาชิก'
                return <option key={m.id} value={m.id}>{name}</option>
              })}
            </select>
          </div>
        </div>
      </div>

      {/* ── Active Filters Ribbon (if any active) ── */}
      {isFiltered && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 4px' }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>ตัวกรองที่เลือก:</span>
          {search && (
            <span className="adm-badge" style={{ background: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              คำค้น: "{search}" <i className="fas fa-times" style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />
            </span>
          )}
          {dateFilter !== 'all' && (
            <span className="adm-badge" style={{ background: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              วันที่: {dateFilter === 'custom' ? customDate : dateFilter} <i className="fas fa-times" style={{ cursor: 'pointer' }} onClick={() => setDateFilter('all')} />
            </span>
          )}
          {selectedGameFilter !== 'all' && (
            <span className="adm-badge" style={{ background: 'var(--crimson-500)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              เกม: {selectedGameFilter} <i className="fas fa-times" style={{ cursor: 'pointer' }} onClick={() => setSelectedGameFilter('all')} />
            </span>
          )}
          {selectedDmFilter !== 'all' && (
            <span className="adm-badge" style={{ background: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              DM: {selectedDmFilter} <i className="fas fa-times" style={{ cursor: 'pointer' }} onClick={() => setSelectedDmFilter('all')} />
            </span>
          )}
          {selectedMemberFilter !== 'all' && (
            <span className="adm-badge" style={{ background: '#8b5cf6', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              สมาชิก: {members.find(m => m.id === selectedMemberFilter)?.nickname || selectedMemberFilter} <i className="fas fa-times" style={{ cursor: 'pointer' }} onClick={() => setSelectedMemberFilter('all')} />
            </span>
          )}
          <button
            type="button"
            onClick={resetAllFilters}
            style={{ background: 'none', border: 'none', color: 'var(--crimson-500)', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
          >
            ล้างทั้งหมด
          </button>
        </div>
      )}

      {/* ── Play History & Bills List ── */}
      {filteredPayments.length === 0 ? (
        <div className="adm-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <i className="fas fa-receipt" style={{ fontSize: 42, color: 'var(--text-tertiary)', opacity: 0.4, marginBottom: 12, display: 'block' }} />
          <h4 style={{ margin: '0 0 6px 0', fontSize: 16, color: 'var(--text-primary)' }}>ไม่พบประวัติการเล่นหรือบิลตามเงื่อนไขที่เลือก</h4>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>ลองปรับเปลี่ยนคำค้นหา หรือเลือกตัวกรองวันที่แบบอื่น</p>
          {isFiltered && (
            <button className="adm-btn-outline" style={{ marginTop: 16 }} onClick={resetAllFilters}>
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredPayments.map(p => {
            const paidAt = toDateObj(p.paidAt)
            const openAt = toDateObj(p.openAt)
            const duration = calcDuration(openAt, paidAt)
            const members = p.members || []
            const isExpanded = expandedIds.has(p.id)
            const gameObj = allGames.find(g => g.id === p.scriptId || g.title === p.scriptTitle)
            const poster = gameObj?.image || gameObj?.coverUrl
            const serial = p.serial || 1
            const serialStr = String(serial).padStart(10, '0')
            const chkStr = String(serial).padStart(5, '0') + '/' + (members.length || 1)

            return (
              <div
                key={p.id}
                className="adm-card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                  border: '1px solid var(--border-default)',
                }}
              >
                {/* ── Top Bar of Card ── */}
                <div style={{ padding: '16px 20px', background: 'var(--surface-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Game thumbnail */}
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 10,
                        background: 'rgba(239,68,68,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      {poster ? (
                        <img src={poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <i className="fas fa-theater-masks" style={{ color: '#888' }} />
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                          {p.scriptTitle || 'ออเดอร์ทั่วไป'}
                        </h4>
                        <span className="adm-badge" style={{ background: '#10b981', fontSize: 11, padding: '2px 8px' }}>
                          [PAID] ชำระแล้ว
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>
                          <i className="fas fa-calendar-alt" style={{ marginRight: 4 }} />
                          {fmtThaiDate(paidAt)} {fmtThaiTime(paidAt)}
                        </span>
                        {duration && (
                          <span style={{ color: 'var(--crimson-500)', fontWeight: 600 }}>
                            <i className="fas fa-clock" style={{ marginRight: 4 }} />
                            {duration}
                          </span>
                        )}
                        <span>· Serial: {serialStr} (CHK: {chkStr})</span>
                        {p.confirmedBy && <span>· บันทึกโดย: {p.confirmedBy}</span>}
                        {p.room && <span>· ห้อง: {p.room}</span>}
                        {p.dm && <span>· DM: {p.dm}</span>}
                        {members.length > 0 && <span>· {members.length} ผู้เล่น</span>}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Grand total & Action buttons */}
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--crimson-500)' }}>
                      ฿{getCleanGrandTotal(p).toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="adm-btn-outline"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => setEditingPayment(p)}
                        title="แก้ไขข้อมูลย้อนหลัง"
                      >
                        <i className="fas fa-edit" style={{ color: 'var(--crimson-500)', marginRight: 4 }} /> แก้ไขข้อมูล
                      </button>
                      <button
                        type="button"
                        className="adm-btn-outline"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => setSlipModalPayment(p)}
                        title="ดูสลีปและพิมพ์ใบเสร็จ"
                      >
                        <i className="fas fa-receipt" style={{ marginRight: 4 }} /> ดูสลีป
                      </button>
                      <button
                        type="button"
                        className="adm-btn-red"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => handleQuickPrint(p)}
                        title="พิมพ์ใบเสร็จออกเครื่องพิมพ์ทันที"
                      >
                        <i className="fas fa-print" style={{ marginRight: 4 }} /> พิมพ์บิล
                      </button>
                      <button
                        type="button"
                        className="adm-btn-outline"
                        style={{
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          borderColor: isExpanded ? 'var(--crimson-500)' : 'var(--border-default)',
                          color: isExpanded ? 'var(--crimson-500)' : 'var(--text-secondary)',
                          background: isExpanded ? 'rgba(198,36,25,0.06)' : 'transparent',
                        }}
                        onClick={() => toggleExpand(p.id)}
                        title={isExpanded ? 'ย่อรายละเอียด' : 'ดูรายละเอียดเพิ่มเติม'}
                      >
                        <span>{isExpanded ? 'ย่อรายละเอียด' : 'ดูรายละเอียด'}</span>
                        <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Expanded Content (Metadata + Players + Breakdown) ── */}
                {isExpanded && (
                  <>
                    {/* ── Metadata Tags ── */}
                    <div style={{ padding: '10px 20px', background: 'var(--surface-page)', borderTop: '1px solid var(--border-default)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {p.room && (
                        <span className="qr-history-tag">
                          <i className="fas fa-door-open" /> โต๊ะ/ห้อง: {p.room}
                        </span>
                      )}
                      {p.dm && (
                        <span className="qr-history-tag">
                          <i className="fas fa-crown" style={{ color: '#ec4899' }} /> DM: {p.dm}
                        </span>
                      )}
                      {p.npc && (
                        <span className="qr-history-tag">
                          <i className="fas fa-theater-masks" style={{ color: '#8b5cf6' }} /> NPC: {p.npc}
                        </span>
                      )}
                      {p.ending && (
                        <span className="qr-history-tag" style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309', fontWeight: 700 }}>
                          <i className="fas fa-flag-checkered" /> ผลเกม: {p.ending}
                        </span>
                      )}
                      <span className="qr-history-tag">
                        <i className="fas fa-users" /> {members.length} ผู้เล่น
                      </span>
                      {p.discount?.applied > 0 && (
                        <span className="qr-history-tag" style={{ background: 'rgba(16,185,129,0.1)', color: '#047857' }}>
                          <i className="fas fa-tag" /> ส่วนลด ฿{p.discount.applied}
                        </span>
                      )}

                      <button
                        type="button"
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => toggleExpand(p.id)}
                      >
                        <span>ย่อรายละเอียด</span>
                        <i className="fas fa-chevron-up" />
                      </button>
                    </div>

                    {/* ── Players Chips Row ── */}
                    {members.length > 0 && (
                      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-default)', background: 'var(--surface-card)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>
                          ผู้เล่นในรอบนี้:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {members.map((m, idx) => {
                            const myBill = p.memberBills?.find(b => b.uid === m.uid)
                            const myPayment = p.memberPayments?.[m.uid]
                            const myAmount = myBill?.total || (myPayment?.amount ? Number(myPayment.amount) : null)

                            return (
                              <div
                                key={idx}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '5px 10px',
                                  borderRadius: 20,
                                  background: 'var(--surface-page)',
                                  border: '1px solid var(--border-default)',
                                  fontSize: 12,
                                }}
                              >
                                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--crimson-500)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, overflow: 'hidden' }}>
                                  {m.avatar ? <img src={m.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.currentTarget.style.display = 'none'} /> : (m.name || '?')[0]}
                                </div>
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</span>
                                {m.character && (
                                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>({m.character})</span>
                                )}
                                {myAmount !== null && (
                                  <span style={{ fontWeight: 800, color: 'var(--crimson-500)', fontSize: 11, marginLeft: 2 }}>
                                    ฿{Math.round(myAmount)}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Expanded Full Breakdown (Games + Foods + Member Bills) ── */}
                    <div style={{ padding: '16px 20px', background: 'var(--surface-page)', borderTop: '1px solid var(--border-default)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                        {/* Left: Items breakdown */}
                        <div style={{ background: 'var(--surface-card)', borderRadius: 10, padding: 14, border: '1px solid var(--border-default)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                            <i className="fas fa-list" style={{ marginRight: 6 }} /> รายการในบิล
                          </div>
                          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                            <tbody>
                              {p.gameTotal > 0 && (
                                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                  <td style={{ padding: '6px 0' }}>ค่าเกม: {p.scriptTitle || 'เกม'} ×{members.length}</td>
                                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>฿{p.gameTotal.toLocaleString()}</td>
                                </tr>
                              )}
                              {(p.foodItems || []).map((fi, fiIdx) => {
                                const addStr = fi.addons?.length ? ` (${fi.addons.map(a => a.name || a).join(', ')})` : ''
                                return (
                                  <tr key={fiIdx} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                    <td style={{ padding: '6px 0' }}>{fi.name}{addStr} ×{fi.qty || 1}</td>
                                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>฿{((fi.price || 0) * (fi.qty || 1)).toLocaleString()}</td>
                                  </tr>
                                )
                              })}
                              {p.discount?.applied > 0 && (
                                <tr style={{ color: '#16a34a' }}>
                                  <td style={{ padding: '6px 0' }}><i className="fas fa-tag" /> ส่วนลด</td>
                                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>-฿{p.discount.applied.toLocaleString()}</td>
                                </tr>
                              )}
                              <tr style={{ fontWeight: 800, fontSize: 14, borderTop: '1px solid var(--border-default)' }}>
                                <td style={{ paddingTop: 8 }}>ยอดสุทธิ (Grand Total):</td>
                                <td style={{ paddingTop: 8, textAlign: 'right', color: 'var(--crimson-500)' }}>฿{getCleanGrandTotal(p).toLocaleString()}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Right: Individual Member Bills (if available) */}
                        {p.memberBills?.length > 0 && (
                          <div style={{ background: 'var(--surface-card)', borderRadius: 10, padding: 14, border: '1px solid var(--border-default)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                              <i className="fas fa-user-friends" style={{ marginRight: 6 }} /> ยอดแยกรายบุคคล
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {p.memberBills.map((mb, mbIdx) => (
                                <div
                                  key={mbIdx}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: 12,
                                    padding: '4px 0',
                                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                                  }}
                                >
                                  <div>
                                    <span style={{ fontWeight: 700 }}>{mb.name}</span>
                                    {mb.character && <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>({mb.character})</span>}
                                  </div>
                                  <span style={{ fontWeight: 800, color: 'var(--crimson-500)' }}>
                                    ฿{(mb.total || 0).toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action buttons (Edit & Delete) */}
                      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                        <button
                          type="button"
                          className="adm-btn-outline"
                          style={{ padding: '6px 14px', fontSize: 12 }}
                          onClick={() => setEditingPayment(p)}
                        >
                          <i className="fas fa-edit" style={{ marginRight: 6, color: 'var(--crimson-500)' }} /> แก้ไขข้อมูลบิล / รอบเล่นนี้ย้อนหลัง
                        </button>
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            opacity: deletingId === p.id ? 0.5 : 1,
                          }}
                          disabled={deletingId === p.id}
                          onClick={() => handleDeletePayment(p)}
                        >
                          <i className={`fas ${deletingId === p.id ? 'fa-spinner fa-spin' : 'fa-trash-alt'}`} />
                          ลบบิลนี้ออกจากระบบ
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Thermal Slip Modal ── */}
      {slipModalPayment && (
        <ThermalSlipModal
          payment={slipModalPayment}
          receiptSettings={receiptSettings}
          onClose={() => setSlipModalPayment(null)}
          showToast={showToast}
        />
      )}

      {/* ── Edit Payment Modal (Retroactive Data Editing) ── */}
      {editingPayment && (
        <EditPaymentModal
          payment={editingPayment}
          allGames={allGames}
          availableMembers={members}
          dmOptions={dmOptions}
          onClose={() => setEditingPayment(null)}
          showToast={showToast}
        />
      )}
    </div>
  )
}
