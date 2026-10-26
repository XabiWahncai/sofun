// Image optimization utilities for SOFUN platform
// High-speed Google Edge CDN (lh3.googleusercontent.com) delivery with WebP compression
// Zero emojis rule strictly applied.

/**
 * Robustly extract Google Drive file ID from various URL formats:
 * - https://lh3.googleusercontent.com/d/{id}=...
 * - https://drive.google.com/file/d/{id}/view
 * - https://drive.google.com/open?id={id}
 * - https://drive.google.com/thumbnail?id={id}&sz=...
 * - https://drive.usercontent.google.com/download?id={id}&export=view
 * - https://wsrv.nl/?url=...&id={id}... (legacy proxy URLs)
 * - Direct ID string (25+ characters)
 */
export function extractDriveId(url) {
  if (!url) return null
  const str = String(url).trim()
  if (!str) return null

  // If directly a Drive ID (alphanumeric, underscores, hyphens, 25+ chars)
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(str)) {
    return str
  }

  // Decode URI components in case of nested encoded URLs
  let decoded = str
  try {
    decoded = decodeURIComponent(str)
  } catch {
    // Keep original if decoding fails
  }

  // Match /d/{id} or /file/d/{id}
  const dMatch = decoded.match(/\/(?:d|file\/d)\/([a-zA-Z0-9_-]{25,})/i)
  if (dMatch && dMatch[1]) {
    return dMatch[1].split('&')[0].split('?')[0].split('=')[0]
  }

  // Match [?&]id={id}
  const idMatch = decoded.match(/[?&]id=([a-zA-Z0-9_-]{25,})/i)
  if (idMatch && idMatch[1]) {
    return idMatch[1].split('&')[0].split('?')[0].split('=')[0]
  }

  // Fallback: match any base64-like drive token of 28+ chars
  const genericMatch = decoded.match(/([a-zA-Z0-9_-]{28,50})/)
  if (genericMatch && genericMatch[1]) {
    return genericMatch[1]
  }

  return null
}

/**
 * Converts an image URL into a high-speed Google Edge CDN URL with WebP compression and width scaling.
 * Direct Google Edge CDN delivers within ~300-500ms from regional edge nodes in Bangkok/Singapore.
 *
 * @param {string} url - Source image URL or Drive ID
 * @param {number} width - Target width in pixels (e.g. 300, 400, 600, 900, 1200)
 * @param {object} options - Extra options: { noWebp: boolean, square: boolean }
 * @returns {string} Optimized CDN URL
 */
export function toOptimizedUrl(url, width = 600, options = {}) {
  if (!url) return ''
  const id = extractDriveId(url)
  if (!id) return url

  const w = Number(width) || 600
  const webpFlag = options.noWebp ? '' : '-rw'

  // If square crop requested
  if (options.square) {
    return `https://lh3.googleusercontent.com/d/${id}=s${w}-c${webpFlag}`
  }

  return `https://lh3.googleusercontent.com/d/${id}=w${w}${webpFlag}`
}

/**
 * Fallback URL using Google Drive native thumbnail endpoint if CDN fails.
 */
export function toFallbackUrl(url, width = 600) {
  if (!url) return ''
  const id = extractDriveId(url)
  if (!id) return url
  const w = Number(width) || 600
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`
}

/**
 * Drop-in replacement for existing convertImageUrl calls across the codebase.
 */
export function convertImageUrl(url, width = 600) {
  return toOptimizedUrl(url, width)
}

/**
 * Image error handler helper to switch to fallback URL on load failure.
 */
export function handleImageLoadError(event, originalUrl, width = 600) {
  if (!event || !event.currentTarget) return
  const img = event.currentTarget
  if (img.dataset.hasFailed) return // Prevent infinite loop
  img.dataset.hasFailed = 'true'
  const fallback = toFallbackUrl(originalUrl, width)
  if (fallback && img.src !== fallback) {
    img.src = fallback
  }
}
