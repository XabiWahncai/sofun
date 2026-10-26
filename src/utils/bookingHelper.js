// Universal Booking Helper for SoFun Club
// Handles LINE redirection and game clipboard formatting when booking is disabled

import { toOptimizedUrl } from './imageUrl'

export const resolveGameImageUrl = (url, w = 900) => {
  return toOptimizedUrl(url, w)
}

export const getGamePlayerText = (game) => {
  if (!game) return ''
  if (Array.isArray(game.characters) && game.characters.length > 0) {
    const male = game.characters.filter(c => c.gender === 'male' || c.gender === 'ชาย').length
    const female = game.characters.filter(c => c.gender === 'female' || c.gender === 'หญิง').length
    let countText = `${game.characters.length} คน`
    if (male || female) countText += ` (ชาย ${male} / หญิง ${female})`
    return countText
  }
  if (game.players) return String(game.players)
  if (game.minPlayers && game.maxPlayers) {
    return game.minPlayers === game.maxPlayers ? `${game.minPlayers} คน` : `${game.minPlayers}-${game.maxPlayers} คน`
  }
  return ''
}

export async function copyGameToClipboard(game) {
  if (!game) {
    const defaultText = `สนใจติดต่อจองรอบเล่นเกม / ปาร์ตี้\nเว็บไซต์: ${window.location.origin}`
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(defaultText)
    }
    return
  }

  const title = game.title || game.name || 'ไม่ระบุชื่อเกม'
  const subTitle = game.originalTitle || game.subtitle || ''
  const players = getGamePlayerText(game)
  const duration = game.duration || ''
  const difficulty = game.difficulty || ''
  const category = game.category || game.genre || ''
  const gameUrl = `${window.location.origin}/games/${game.id}`
  const rawImg = game.image || game.coverUrl || game.coverImage || ''
  const imageUrl = resolveGameImageUrl(rawImg, 1000)

  // Plain text representation
  const lines = [`[สนใจจองรอบเล่น] ${title}`]
  if (subTitle) lines.push(`(${subTitle})`)
  lines.push(`ลิงก์ข้อมูลเกม: ${gameUrl}`)
  if (players) lines.push(`จำนวนผู้เล่น: ${players}`)
  if (duration) lines.push(`ระยะเวลา: ${duration}`)
  if (difficulty) lines.push(`ความยาก: ${difficulty}`)
  if (category) lines.push(`หมวดหมู่: ${category}`)
  if (imageUrl) lines.push(`รูปภาพหน้าปก: ${imageUrl}`)

  const plainText = lines.join('\n')

  // HTML rich representation (for apps supporting rich paste)
  const htmlContent = `
    <div style="font-family: sans-serif; line-height: 1.5;">
      <h3 style="margin: 0 0 6px 0; color: #e50914;">[สนใจจองรอบเล่น] ${title}</h3>
      ${subTitle ? `<p style="margin: 0 0 8px 0; color: #666;"><em>${subTitle}</em></p>` : ''}
      ${imageUrl ? `<div style="margin: 10px 0;"><img src="${imageUrl}" alt="${title}" style="max-width: 320px; border-radius: 8px; display: block;" /></div>` : ''}
      <p style="margin: 4px 0;"><strong>ลิงก์ข้อมูลเกม:</strong> <a href="${gameUrl}">${gameUrl}</a></p>
      ${players ? `<p style="margin: 4px 0;"><strong>จำนวนผู้เล่น:</strong> ${players}</p>` : ''}
      ${duration ? `<p style="margin: 4px 0;"><strong>ระยะเวลา:</strong> ${duration}</p>` : ''}
      ${difficulty ? `<p style="margin: 4px 0;"><strong>ความยาก:</strong> ${difficulty}</p>` : ''}
      ${category ? `<p style="margin: 4px 0;"><strong>หมวดหมู่:</strong> ${category}</p>` : ''}
    </div>
  `.trim()

  try {
    if (navigator?.clipboard?.write && window.ClipboardItem) {
      const blobPlain = new Blob([plainText], { type: 'text/plain' })
      const blobHtml = new Blob([htmlContent], { type: 'text/html' })
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': blobPlain,
          'text/html': blobHtml,
        }),
      ])
      return
    }
  } catch (err) {
    console.warn('HTML clipboard write failed, falling back to text:', err)
  }

  // Fallback to text
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(plainText)
  } else {
    // Exec command fallback
    const textarea = document.createElement('textarea')
    textarea.value = plainText
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
    } catch {
      // ignore
    }
    document.body.removeChild(textarea)
  }
}

export async function handleDirectLineBooking(game, showToast) {
  const lineUrl = 'https://line.me/R/ti/p/@sofunclub'
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  let newTab = null
  if (!isMobile) {
    try {
      newTab = window.open('', '_blank')
    } catch {
      newTab = null
    }
  }

  try {
    await copyGameToClipboard(game)
    if (typeof showToast === 'function') {
      showToast(game ? 'คัดลอกรายละเอียดและรูปเกมแล้ว กำลังเปิด LINE' : 'กำลังเปิด LINE @sofunclub')
    }
  } catch (e) {
    console.warn('Clipboard copy error:', e)
  }

  if (newTab && !newTab.closed) {
    newTab.location.href = lineUrl
  } else {
    window.location.href = lineUrl
  }
}
