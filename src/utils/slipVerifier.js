import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'
import jsQR from 'jsqr'
import { Html5Qrcode } from 'html5-qrcode'

/**
 * Open slip image in a safe window/tab whether it is a data URL or an HTTP URL
 */
export function viewSlipImage(url) {
  if (!url) return
  if (url.startsWith('data:')) {
    const w = window.open('')
    if (w) {
      w.document.write(
        '<title>Slip Preview</title>' +
        '<body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;">' +
        `<img src="${url}" style="max-width:96vw;max-height:96vh;object-fit:contain;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.5);" />` +
        '</body>'
      )
    }
  } else {
    window.open(url, '_blank')
  }
}

/**
 * Generate a compressed JPEG base64 data URL from a slip File.
 * Constrained to ~400px to keep size under 30KB for Firestore storage.
 */
export async function createSlipThumbnail(file, maxDimension = 420, quality = 0.5) {
  try {
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            let { width, height } = img
            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width)
                width = maxDimension
              } else {
                width = Math.round((width * maxDimension) / height)
                height = maxDimension
              }
            }
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, width, height)
            const dataUrl = canvas.toDataURL('image/jpeg', quality)
            resolve(dataUrl)
          } catch (err) {
            console.warn('Canvas resize failed:', err)
            resolve('')
          }
        }
        img.onerror = () => resolve('')
        img.src = e.target.result
      }
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
  } catch (err) {
    console.warn('createSlipThumbnail error:', err)
    return ''
  }
}

/**
 * Extract QR code text from an image file using jsQR with Html5Qrcode fallback.
 */
export async function scanQrFromImage(file) {
  const decode = jsQR?.default || jsQR

  // 1. Try jsQR with canvas
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = dataUrl
    })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const maxDim = Math.max(img.width, img.height)
    const sizes = [Math.min(maxDim, 1200), 800, 500]

    for (const targetDim of sizes) {
      const scale = targetDim / maxDim
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      if (typeof decode === 'function') {
        let code = decode(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })
        if (code?.data) return code.data

        code = decode(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        })
        if (code?.data) return code.data
      }
    }
  } catch (err) {
    console.warn('jsQR scan attempt failed:', err)
  }

  // 2. Fallback to Html5Qrcode scanFile
  try {
    let container = document.getElementById('temp-slip-qr-reader')
    if (!container) {
      container = document.createElement('div')
      container.id = 'temp-slip-qr-reader'
      container.style.display = 'none'
      document.body.appendChild(container)
    }
    const html5QrCode = new Html5Qrcode('temp-slip-qr-reader')
    const decoded = await html5QrCode.scanFile(file, false)
    html5QrCode.clear().catch(() => {})
    if (decoded) return decoded
  } catch (err) {
    console.warn('Html5Qrcode scanFile fallback failed:', err)
  }

  return null
}

/**
 * Direct EasySlip verification without uploading to Firebase Storage or calling Cloud Functions.
 * Returns:
 * - { success: true, data, rawSlip, slipThumbnail, payload, verifyData }
 * - { success: false, code: 'WRONG_RECEIVER', msg, slipThumbnail, payload }
 * - { success: false, code, slipThumbnail, payload, fallbackToManual: true }
 */
export async function verifySlipDirect(file, amount, { isDeposit = false } = {}) {
  // 1. Create thumbnail in parallel
  const slipThumbnailPromise = createSlipThumbnail(file, 420, 0.5)

  // 2. Fetch payment settings directly from Firestore
  let apiKey = ''
  let promptPayPhone = ''
  let depositPromptPayPhone = ''
  try {
    const snap = await getDoc(doc(db, 'settings', 'payment'))
    if (snap.exists()) {
      const d = snap.data()
      apiKey = d.easySlipApiKey || ''
      promptPayPhone = d.promptPayPhone || ''
      depositPromptPayPhone = d.depositPromptPayPhone || ''
    }
  } catch (e) {
    console.warn('Failed to load payment settings:', e)
  }

  const expectedPhone = isDeposit ? (depositPromptPayPhone || promptPayPhone) : promptPayPhone

  // 3. Scan QR code
  const [slipThumbnail, payload] = await Promise.all([
    slipThumbnailPromise,
    scanQrFromImage(file),
  ])

  if (!payload) {
    return {
      success: false,
      code: 'QR_NOT_FOUND',
      slipThumbnail,
      payload: null,
      fallbackToManual: true,
    }
  }

  if (!apiKey) {
    return {
      success: false,
      code: 'NO_API_KEY',
      slipThumbnail,
      payload,
      fallbackToManual: true,
    }
  }

  // 4. Call EasySlip API directly
  try {
    const body = { payload }
    if (amount) body.matchAmount = Number(amount)
    const res = await fetch('https://api.easyslip.com/v2/verify/bank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const json = await res.json()

    if (json.success) {
      if (expectedPhone) {
        const receiverAccount = json.data?.rawSlip?.receiver?.account?.value || ''
        const norm = p => {
          const d = (p || '').replace(/\D/g, '')
          if (d.startsWith('0066')) return '66' + d.slice(4)
          if (d.startsWith('0')) return '66' + d.slice(1)
          return d
        }
        if (receiverAccount && norm(receiverAccount) !== norm(expectedPhone)) {
          return {
            success: false,
            code: 'WRONG_RECEIVER',
            msg: 'สลิปโอนไปยังบัญชีอื่น — กรุณาตรวจสอบและโอนใหม่',
            slipThumbnail,
            payload,
            fallbackToManual: false,
          }
        }
      }

      const rawSlip = json.data?.rawSlip || {}
      return {
        success: true,
        data: json.data,
        rawSlip,
        slipThumbnail,
        payload,
        verifyData: {
          transRef: rawSlip.transRef || '',
          bank: rawSlip.sender?.bank?.short || '',
          bankName: rawSlip.sender?.bank?.name || '',
        },
      }
    }

    if (json.code === 'SLIP_PENDING' || json.error?.code === 'SLIP_PENDING') {
      return {
        success: false,
        code: 'SLIP_PENDING',
        slipThumbnail,
        payload,
        fallbackToManual: true,
      }
    }

    return {
      success: false,
      code: json.code || json.error?.code || 'EASYSLIP_FAILED',
      slipThumbnail,
      payload,
      fallbackToManual: true,
    }
  } catch (err) {
    console.warn('EasySlip direct call failed:', err)
    return {
      success: false,
      code: 'NETWORK_ERROR',
      slipThumbnail,
      payload,
      fallbackToManual: true,
    }
  }
}
