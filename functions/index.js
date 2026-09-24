const { onCall } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const sharp = require('sharp')
const jsQR = require('jsqr')
const { google } = require('googleapis')

initializeApp()

// ── FCM push helper ───────────────────────────────────────────────────────────
async function sendPush(token, title, body, data = {}) {
  if (!token) return
  try {
    await getMessaging().send({
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      webpush: {
        notification: { icon: '/Logo.jpg', badge: '/Logo.jpg' },
        fcmOptions: { link: data.url || '/' },
      },
      android: { notification: { icon: 'ic_notification', sound: 'default' } },
    })
  } catch (e) {
    console.warn('FCM send failed:', e.message)
  }
}

// ── Booking notifications ─────────────────────────────────────────────────────
exports.onBookingWrite = onDocumentWritten(
  { document: 'bookings/{bookingId}', region: 'asia-southeast1' },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null
    const after  = event.data.after.exists  ? event.data.after.data()  : null
    if (!after) return

    const db = getFirestore()
    const bookingId = event.params.bookingId

    const prevRequests = before?.joinRequests || []
    const nextRequests = after.joinRequests  || []

    // ── New join request → notify leader ──────────────────────────────
    const newReqs = nextRequests.filter(r => !prevRequests.some(p => p.uid === r.uid))
    if (newReqs.length > 0 && after.leaderId) {
      const leaderSnap = await db.collection('members').doc(after.leaderId).get()
      const token = leaderSnap.data()?.fcmToken
      for (const req of newReqs) {
        await sendPush(
          token,
          'มีคำขอเข้าร่วมปาร์ตี้',
          `${req.name} ขอเข้าร่วม ${after.gameName || 'ปาร์ตี้ของคุณ'}`,
          { url: '/booking', tag: `join-req-${bookingId}` }
        )
      }
    }

    // ── Request approved (moved from joinRequests → members) → notify requester ──
    const prevMembers = before?.members || []
    const nextMembers = after.members  || []
    const approved = nextMembers.filter(m =>
      !prevMembers.some(p => p.uid === m.uid) &&
      prevRequests.some(r => r.uid === m.uid)
    )
    for (const m of approved) {
      const snap = await db.collection('members').doc(m.uid).get()
      await sendPush(
        snap.data()?.fcmToken,
        'คำขอได้รับการอนุมัติ',
        `คุณได้รับการอนุมัติเข้าร่วม ${after.gameName || 'ปาร์ตี้'}`,
        { url: `/booking?booking=${bookingId}`, tag: `approved-${bookingId}` }
      )
    }

    // ── Request rejected (removed from joinRequests, not in members) → notify ──
    const rejected = prevRequests.filter(r =>
      !nextRequests.some(n => n.uid === r.uid) &&
      !nextMembers.some(m => m.uid === r.uid)
    )
    for (const r of rejected) {
      const snap = await db.collection('members').doc(r.uid).get()
      await sendPush(
        snap.data()?.fcmToken,
        'คำขอเข้าร่วมไม่ได้รับอนุมัติ',
        `หัวปาร์ตี้ไม่อนุมัติคำขอเข้าร่วม ${after.gameName || 'ปาร์ตี้'}`,
        { url: '/booking', tag: `rejected-${bookingId}` }
      )
    }

    // ── Admin confirmed booking → notify leader ───────────────────────
    if (before?.status === 'pending' && after.status === 'confirmed' && after.leaderId) {
      const snap = await db.collection('members').doc(after.leaderId).get()
      await sendPush(
        snap.data()?.fcmToken,
        'การจองได้รับการยืนยัน',
        `${after.gameName} วันที่ ${after.date} — จ่ายมัดจำภายใน 3 วัน`,
        { url: `/booking?booking=${bookingId}`, tag: `confirmed-${bookingId}` }
      )
    }
  }
)

// ── QR reading helpers ────────────────────────────────────────────────────────

function scanBuffer(data, width, height) {
  try {
    const code = jsQR(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      width, height,
      { inversionAttempts: 'attemptBoth' }
    )
    return code?.data || null
  } catch { return null }
}

async function trySize(sharpPipeline, targetWidth) {
  try {
    const resize = (p) => p.clone().resize(targetWidth, null, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: false })

    // Pass 1: raw pixels
    const { data: d1, info: i1 } = await resize(sharpPipeline).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const r1 = scanBuffer(d1, i1.width, i1.height)
    if (r1) return r1

    // Pass 2: grayscale + normalize + threshold 128
    const { data: d2, info: i2 } = await resize(sharpPipeline).grayscale().normalize().threshold(128).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const r2 = scanBuffer(d2, i2.width, i2.height)
    if (r2) return r2

    // Pass 3: sharpen + grayscale + threshold 96 (for faint QR codes)
    const { data: d3, info: i3 } = await resize(sharpPipeline).sharpen({ sigma: 1.5 }).grayscale().threshold(96).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const r3 = scanBuffer(d3, i3.width, i3.height)
    if (r3) return r3

    // Pass 4: sharpen + grayscale + threshold 160 (for dark QR codes)
    const { data: d4, info: i4 } = await resize(sharpPipeline).sharpen({ sigma: 1.5 }).grayscale().threshold(160).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return scanBuffer(d4, i4.width, i4.height)
  } catch { return null }
}

async function extractQR(imgBuffer) {
  const { width, height } = await sharp(imgBuffer).metadata()
  console.log(`Image ${width}x${height}`)
  const base = sharp(imgBuffer)

  // Full image at multiple scales
  for (const w of [width, 1200, 800, 1600, 600, 2000]) {
    const r = await trySize(base, w)
    if (r) { console.log(`QR found full w=${w}`); return r }
  }

  // Bottom 60% (most slips put QR near bottom)
  const cropY = Math.round(height * 0.4)
  const bottom60 = sharp(imgBuffer).extract({ left: 0, top: cropY, width, height: height - cropY })
  for (const w of [width, 1200, 800]) {
    const r = await trySize(bottom60, w)
    if (r) { console.log(`QR found bottom60 w=${w}`); return r }
  }

  // Top 50% (some slips put QR at top)
  const top50 = sharp(imgBuffer).extract({ left: 0, top: 0, width, height: Math.round(height * 0.5) })
  for (const w of [width, 1200, 800]) {
    const r = await trySize(top50, w)
    if (r) { console.log(`QR found top50 w=${w}`); return r }
  }

  // Bottom 40%
  const cropY2 = Math.round(height * 0.6)
  const bottom40 = sharp(imgBuffer).extract({ left: 0, top: cropY2, width, height: height - cropY2 })
  for (const w of [width, 1200, 800]) {
    const r = await trySize(bottom40, w)
    if (r) { console.log(`QR found bottom40 w=${w}`); return r }
  }

  // Center square
  const side = Math.min(width, height)
  const center = sharp(imgBuffer).extract({ left: Math.round((width - side) / 2), top: Math.round((height - side) / 2), width: side, height: side })
  for (const w of [1200, 800, 600]) {
    const r = await trySize(center, w)
    if (r) { console.log(`QR found center w=${w}`); return r }
  }

  console.log('QR not found after all attempts')
  return null
}

// ── EasySlip caller ───────────────────────────────────────────────────────────

async function callEasySlip(payload, amount, apiKey) {
  const body = { payload }
  if (amount) body.matchAmount = Number(amount)
  const res = await fetch('https://api.easyslip.com/v2/verify/bank', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ── Main callable: verify slip on upload ──────────────────────────────────────

exports.verifySlip = onCall({ region: 'asia-southeast1', cors: true }, async (req) => {
  const { slipUrl, amount, orderId, uid, name } = req.data
  if (!slipUrl || !orderId || !uid) return { success: false, code: 'MISSING_PARAMS' }

  const db = getFirestore()
  const settingsSnap = await db.doc('settings/payment').get()
  const settingsData = settingsSnap.data() || {}
  const apiKey = settingsData.easySlipApiKey
  const promptPayPhone = settingsData.promptPayPhone || ''
  if (!apiKey) return { success: false, code: 'NO_API_KEY' }

  // Download image
  let imgBuffer
  try {
    const imgRes = await fetch(slipUrl)
    if (!imgRes.ok) return { success: false, code: 'DOWNLOAD_FAILED' }
    imgBuffer = Buffer.from(await imgRes.arrayBuffer())
    console.log(`Downloaded ${(imgBuffer.length / 1024).toFixed(0)}KB`)
  } catch (e) {
    return { success: false, code: 'DOWNLOAD_FAILED', msg: e.message }
  }

  // Extract QR
  let payload
  try {
    payload = await extractQR(imgBuffer)
  } catch (e) {
    return { success: false, code: 'IMAGE_ERROR', msg: e.message }
  }
  if (!payload) return { success: false, code: 'QR_NOT_FOUND' }

  // Call EasySlip
  let json
  try {
    json = await callEasySlip(payload, amount, apiKey)
    console.log('EasySlip:', JSON.stringify(json).slice(0, 200))
  } catch (e) {
    return { success: false, code: 'EASYSLIP_ERROR', msg: e.message }
  }

  // EasySlip subscription expired
  if (!json.success && json.error?.code === 'SERVICE_EXPIRED') {
    return { success: false, code: 'SERVICE_EXPIRED' }
  }

  // If Bangkok Bank / other bank is still settling — save full entry + payload for background retry
  if (!json.success && json.error?.code === 'SLIP_PENDING') {
    await db.doc(`orders/${orderId}`).update({
      [`memberPayments.${uid}.paidAt`]: new Date().toISOString(),
      [`memberPayments.${uid}.amount`]: amount ? Number(amount) : null,
      [`memberPayments.${uid}.slipUrl`]: slipUrl || '',
      [`memberPayments.${uid}.name`]: name || '',
      [`memberPayments.${uid}.verified`]: false,
      [`memberPayments.${uid}.pendingAdminReview`]: false,
      [`memberPayments.${uid}.easyslipPending`]: true,
      [`memberPayments.${uid}.easyslipPayload`]: payload,
      [`memberPayments.${uid}.easyslipPendingSince`]: new Date().toISOString(),
    })
    return { success: false, code: 'SLIP_PENDING' }
  }

  // Validate receiver account matches our PromptPay
  if (json.success && promptPayPhone) {
    const receiverAccount = json.data?.rawSlip?.receiver?.account?.value || ''
    const norm = p => { const d = p.replace(/\D/g, ''); if (d.startsWith('0066')) return '66' + d.slice(4); if (d.startsWith('0')) return '66' + d.slice(1); return d }
    if (receiverAccount && norm(receiverAccount) !== norm(promptPayPhone)) {
      console.log(`Receiver mismatch: slip=${receiverAccount} expected=${promptPayPhone}`)
      return { success: false, code: 'WRONG_RECEIVER' }
    }
    console.log(`Receiver OK: ${receiverAccount}`)
  }

  return json
})

// ── Scheduled retry: runs every 3 minutes ────────────────────────────────────

exports.retryPendingSlips = onSchedule(
  { schedule: 'every 3 minutes', region: 'asia-southeast1', timeZone: 'Asia/Bangkok' },
  async () => {
    const db = getFirestore()
    const settingsSnap = await db.doc('settings/payment').get()
    const apiKey = settingsSnap.data()?.easySlipApiKey
    if (!apiKey) return

    // Find active orders only
    const ordersSnap = await db.collection('orders').where('status', '==', 'active').get()
    const cutoff = new Date(Date.now() - 30 * 60 * 1000) // give up after 30 min

    for (const orderDoc of ordersSnap.docs) {
      const memberPayments = orderDoc.data().memberPayments || {}
      const updates = {}

      for (const [uid, payment] of Object.entries(memberPayments)) {
        if (!payment.easyslipPending || !payment.easyslipPayload) continue

        const pendingSince = payment.easyslipPendingSince ? new Date(payment.easyslipPendingSince) : new Date()

        // Give up after 30 minutes → fall back to admin review
        if (pendingSince < cutoff) {
          console.log(`${orderDoc.id}/${uid}: giving up after 30min`)
          updates[`memberPayments.${uid}.easyslipPending`] = false
          updates[`memberPayments.${uid}.pendingAdminReview`] = true
          continue
        }

        try {
          const json = await callEasySlip(payment.easyslipPayload, payment.amount, apiKey)
          console.log(`${orderDoc.id}/${uid} retry:`, JSON.stringify(json).slice(0, 100))

          if (json.success) {
            const slip = json.data?.rawSlip || {}
            updates[`memberPayments.${uid}.verified`] = true
            updates[`memberPayments.${uid}.easyslipPending`] = false
            updates[`memberPayments.${uid}.pendingAdminReview`] = false
            updates[`memberPayments.${uid}.verifiedAt`] = new Date().toISOString()
            updates[`memberPayments.${uid}.transRef`] = slip.transRef || ''
            updates[`memberPayments.${uid}.bankName`] = slip.sender?.bank?.name || ''
          } else if (json.error?.code !== 'SLIP_PENDING') {
            // Non-retryable error → fall back to admin review
            updates[`memberPayments.${uid}.easyslipPending`] = false
            updates[`memberPayments.${uid}.pendingAdminReview`] = true
          }
        } catch (e) {
          console.warn(`Retry error ${orderDoc.id}/${uid}:`, e.message)
        }
      }

      if (Object.keys(updates).length > 0) {
        await orderDoc.ref.update(updates)
      }
    }
  }
)

// ── Google Sheets helpers ─────────────────────────────────────────────────────

async function getSheetsClient() {
  const raw = process.env.GOOGLE_CREDENTIALS
  if (!raw) throw new Error('GOOGLE_CREDENTIALS secret not set')
  const creds = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

async function getSheetId() {
  const db = getFirestore()
  const snap = await db.doc('settings/googleSheets').get()
  const id = snap.data()?.spreadsheetId
  if (!id) throw new Error('settings/googleSheets.spreadsheetId not set')
  return id
}

// Ensure a sheet tab exists; returns its numeric sheetId for batchUpdate
async function ensureSheet(sheets, spreadsheetId, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existing = meta.data.sheets.find(s => s.properties.title === title)
  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    })
    // Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    })
  }
}

// Find a row by key in column A; returns 1-based row number or null
async function findRow(sheets, spreadsheetId, sheetTitle, keyValue) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A:A`,
  })
  const rows = res.data.values || []
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === keyValue) return i + 1
  }
  return null
}

// ── Payments sheet: sync on order write ──────────────────────────────────────

const PAYMENT_HEADERS = [
  'Order ID', 'Date', 'Room', 'Script', 'Game Duration (hr)', 'Players',
  'Game Fee', 'Food Total', 'Discount', 'Grand Total', 'Status', 'Updated At',
]

exports.syncPaymentsSheet = onDocumentWritten(
  { document: 'orders/{orderId}', region: 'asia-southeast1', secrets: ['GOOGLE_CREDENTIALS'] },
  async (event) => {
    const after = event.data?.after?.data()
    if (!after) return // deleted
    if (!['paid', 'active', 'closed'].includes(after.status)) return

    let sheets, spreadsheetId
    try {
      sheets = await getSheetsClient()
      spreadsheetId = await getSheetId()
    } catch (e) { console.warn('Sheets setup:', e.message); return }

    const title = 'Payments'
    await ensureSheet(sheets, spreadsheetId, title, PAYMENT_HEADERS)

    const orderId = event.params.orderId
    const foodTotal = (after.foodItems || []).reduce((s, f) => s + (f.price || 0) * (f.qty || 1), 0)
    const discount = after.discount || 0
    const gameFee = after.gameFee || 0
    const grandTotal = gameFee + foodTotal - discount
    const players = Object.keys(after.memberPayments || {}).length || after.playerCount || ''

    const row = [
      orderId,
      after.date || '',
      after.room || '',
      after.script || '',
      after.durationHours || '',
      players,
      gameFee,
      foodTotal,
      discount,
      grandTotal,
      after.status || '',
      new Date().toISOString(),
    ]

    const existingRow = await findRow(sheets, spreadsheetId, title, orderId)
    if (existingRow) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A${existingRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      })
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      })
    }
    console.log(`Payments synced: ${orderId}`)
  }
)

// ── Members sheet: sync on member write ──────────────────────────────────────

const MEMBER_HEADERS = [
  'UID', 'Name', 'Phone', 'Email', 'Role', 'Total Games', 'Total Spend', 'Joined At', 'Updated At',
]

exports.syncMembersSheet = onDocumentWritten(
  { document: 'members/{memberId}', region: 'asia-southeast1', secrets: ['GOOGLE_CREDENTIALS'] },
  async (event) => {
    const after = event.data?.after?.data()
    if (!after) return

    let sheets, spreadsheetId
    try {
      sheets = await getSheetsClient()
      spreadsheetId = await getSheetId()
    } catch (e) { console.warn('Sheets setup:', e.message); return }

    const title = 'Members'
    await ensureSheet(sheets, spreadsheetId, title, MEMBER_HEADERS)

    const memberId = event.params.memberId
    const row = [
      memberId,
      after.name || after.displayName || '',
      after.phone || '',
      after.email || '',
      after.role || 'player',
      after.totalGames || 0,
      after.totalSpend || 0,
      after.createdAt || after.joinedAt || '',
      new Date().toISOString(),
    ]

    const existingRow = await findRow(sheets, spreadsheetId, title, memberId)
    if (existingRow) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A${existingRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      })
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      })
    }
    console.log(`Members synced: ${memberId}`)
  }
)

// ── Play History sheet: append on create ─────────────────────────────────────

const PLAY_HISTORY_HEADERS = [
  'ID', 'Date', 'Room', 'Script', 'Duration (hr)', 'Players', 'Result', 'Game Fee', 'Created At',
]

exports.syncPlayHistorySheet = onDocumentCreated(
  { document: 'playHistory/{id}', region: 'asia-southeast1', secrets: ['GOOGLE_CREDENTIALS'] },
  async (event) => {
    const data = event.data?.data()
    if (!data) return

    let sheets, spreadsheetId
    try {
      sheets = await getSheetsClient()
      spreadsheetId = await getSheetId()
    } catch (e) { console.warn('Sheets setup:', e.message); return }

    const title = 'Play History'
    await ensureSheet(sheets, spreadsheetId, title, PLAY_HISTORY_HEADERS)

    const id = event.params.id
    const row = [
      id,
      data.date || '',
      data.room || '',
      data.script || '',
      data.durationHours || '',
      data.playerCount || '',
      data.result || '',
      data.gameFee || '',
      data.createdAt || new Date().toISOString(),
    ]

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })
    console.log(`Play History appended: ${id}`)
  }
)

// ── Daily Stats sheet: runs every day at 01:00 Bangkok ───────────────────────

const DAILY_STATS_HEADERS = [
  'Date', 'Total Orders', 'Total Revenue', 'Total Game Fee', 'Total Food',
  'Total Discount', 'Total Players', 'Avg Session (hr)', 'Updated At',
]

exports.syncDailyStats = onSchedule(
  { schedule: 'every day 01:00', region: 'asia-southeast1', timeZone: 'Asia/Bangkok', secrets: ['GOOGLE_CREDENTIALS'] },
  async () => {
    const db = getFirestore()

    let sheets, spreadsheetId
    try {
      sheets = await getSheetsClient()
      spreadsheetId = await getSheetId()
    } catch (e) { console.warn('Sheets setup:', e.message); return }

    const title = 'Daily Stats'
    await ensureSheet(sheets, spreadsheetId, title, DAILY_STATS_HEADERS)

    // Aggregate yesterday's orders
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().slice(0, 10) // YYYY-MM-DD

    const snap = await db.collection('orders')
      .where('date', '==', dateStr)
      .where('status', 'in', ['paid', 'closed'])
      .get()

    let totalRevenue = 0, totalGameFee = 0, totalFood = 0, totalDiscount = 0
    let totalPlayers = 0, totalDuration = 0, orderCount = snap.size

    for (const doc of snap.docs) {
      const d = doc.data()
      const food = (d.foodItems || []).reduce((s, f) => s + (f.price || 0) * (f.qty || 1), 0)
      const discount = d.discount || 0
      const gameFee = d.gameFee || 0
      totalGameFee += gameFee
      totalFood += food
      totalDiscount += discount
      totalRevenue += gameFee + food - discount
      totalPlayers += Object.keys(d.memberPayments || {}).length || d.playerCount || 0
      totalDuration += d.durationHours || 0
    }

    const avgSession = orderCount > 0 ? (totalDuration / orderCount).toFixed(1) : 0

    const row = [
      dateStr,
      orderCount,
      totalRevenue,
      totalGameFee,
      totalFood,
      totalDiscount,
      totalPlayers,
      avgSession,
      new Date().toISOString(),
    ]

    const existingRow = await findRow(sheets, spreadsheetId, title, dateStr)
    if (existingRow) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A${existingRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      })
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      })
    }
    console.log(`Daily stats synced: ${dateStr}, ${orderCount} orders, ฿${totalRevenue}`)
  }
)

// ── Helper: send push to all admins ──────────────────────────────────────────
async function notifyAdmins(db, title, body, data = {}) {
  const snap = await db.collection('members').where('role', '==', 'admin').get()
  const tokens = snap.docs.map(d => d.data()?.fcmToken).filter(Boolean)
  await Promise.all(tokens.map(t => sendPush(t, title, body, data)))
}

// ── Notify admins when a new POS session is opened (เข้าตี้) ─────────────────
exports.onOrderCreated = onDocumentCreated(
  { document: 'orders/{orderId}', region: 'asia-southeast1' },
  async (event) => {
    const data = event.data?.data()
    if (!data || data.status !== 'active') return
    const db = getFirestore()
    const count = data.members?.length || 0
    await notifyAdmins(
      db,
      `เปิดตี้ใหม่ — ห้อง ${data.room || '?'}`,
      `${data.scriptTitle || 'ไม่ระบุเกม'} · ${count} คน${data.dm ? ` · DM: ${data.dm}` : ''}`,
      { url: '/pos', tag: `order-created-${event.params.orderId}` }
    )
  }
)

// ── Notify admins when a member submits a food order (สั่งอาหาร) ──────────────
exports.onFoodQueueUpdate = onDocumentWritten(
  { document: 'orders/{orderId}', region: 'asia-southeast1' },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null
    const after  = event.data.after.exists  ? event.data.after.data()  : null
    if (!after) return

    // Find newly added queue items by requestedAt timestamp (arrayUnion appends unique items)
    const prevTimes = new Set((before?.memberFoodQueue || []).map(i => i.requestedAt).filter(Boolean))
    const newItems = (after.memberFoodQueue || []).filter(i => i.requestedAt && !prevTimes.has(i.requestedAt))
    if (newItems.length === 0) return

    const db = getFirestore()
    // Group new items by the person who ordered them
    const byPerson = {}
    for (const item of newItems) {
      const name = item.orderedBy?.name || 'ลูกค้า'
      if (!byPerson[name]) byPerson[name] = []
      byPerson[name].push(`${item.name}${(item.qty || 1) > 1 ? ` ×${item.qty}` : ''}`)
    }

    for (const [name, items] of Object.entries(byPerson)) {
      await notifyAdmins(
        db,
        `สั่งอาหาร — ${name}`,
        items.join(', '),
        { url: '/pos', tag: `food-order-${event.params.orderId}` }
      )
    }
  }
)
