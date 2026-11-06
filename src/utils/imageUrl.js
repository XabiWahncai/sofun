// Image optimization utilities for SOFUN platform
// High-speed local static covers + Google Edge CDN (lh3.googleusercontent.com) delivery
// Zero emojis rule strictly applied.

/**
 * Map of Google Drive file IDs of catalog games to their local static cover filenames.
 * All catalog games have pre-rendered static JPEG covers in /covers/{gameId}.jpg
 * which load locally in under 20ms without any external network dependency.
 */
export const STATIC_COVERS_BY_DRIVE_ID = {
  '1Cju4ADfgVJS-1oO5JEQ9_Gov81CHE9rV': '39sO2noXxUpDFYIo9fR6',
  '1x6EgQF3vjfHSqNMk1AkufOF3BRg8VI-h': '3We0g4oVYsaPMVaJDJhz',
  '1swLOIbHlRS2O_CQJ-lpkrKkDbUTUhqck': '4q3i2g5GjKbNZbJqG8Dq',
  '1qNHx_Ue17Vp22yZJP7B4YqfRrwP4qg1k': '56FaJlMPh1SabiIsAguq',
  '1u_FkCzeHKKS1pDg6OgSKg2WhfCZc3IDP': '57GA2xZ9PE2U185Xe66w',
  '1xeJQ6SiznF_RXxP_gxtb6PivhpgjYlB9': '71S7ZOcl2LHcDjo4NV4h',
  '1cnhvKP3P6dlee-mQ6z1Kw7oAisAwenUL': '8fIAM8vKETPfveFjcV7W',
  '1__JtgYi2duPh0qYUXY5JTkP6jpWx0hNA': 'AHObjL4ttWELAmDI5Ar1',
  '1OBv8D48bYfuuIDnjVG4P5As_RyBwFC5H': 'AMy2jBa11D7Vr1mPLgA3',
  '1jirrRgSxAwE9G_qYiQcs2-tBcN4BQl3x': 'CRCNibuPq3rCgB9ctPx1',
  '1w-r9mZ6rG9LXOOYCvlIOfG2QXjWBDgIj': 'DLGdhKcTWt1HJngG1I7b',
  '1-nE6RN-kIkgNzg-AdhRLNVaGVs0fhq-f': 'DxiWXE4UX1T2hsvuD1Ga',
  '1XMyUJ5ToHES1aTv9KFExkQQmfqry-bxp': 'Ed3qms9bJffHrBJL56mE',
  '1ZbojVWa7eZn1Uvafd62zwqOzZOAT69P_': 'EpjBMupOgojE4z4Wbkd5',
  '1TuFASUw3KqlPvwbbO-0r16ny-W9D9TpA': 'FK0qPEdQXh8RTsJAza32',
  '14EQkcvcwDUZ9DUv7nMkPhxeRU50hbzbd': 'GHOLGDtlCSGIAFOY3cLb',
  '1MkDyV-DI20InSfiR-aT_CCDImX5aG6Fd': 'J0XNjXNM1ypdb76TGuK2',
  '1QylfkWZJKgbA_aodUnYu23pQxupJfAQK': 'JBn9GUSafaVGYITGcrjg',
  '1O1b7_SLK8-00f5PuPj5wojFEp25tZrme': 'JN1xJz2EjuDr7z7lc43U',
  '1h-OVpTTJ-XsVsQCPRPGMfMcKpeh8EtAf': 'JxKVtIsoKk5y7Wbk1Frd',
  '1esUJv_Hg8r2fUxun_Tg1g9LtE2-F4dNM': 'L3nuDTjLBUVSbxih7xnt',
  '1xFwjSB__WBtF8aSRgkh6owPeGWYS-YiO': 'N5Fs5zKHolyMz1xFXwVa',
  '1xvLyISsTZP-cKPAIP3iQYaZKOwfaCscI': 'OQJYVSzcKZkuq12tjKAA',
  '1jcyCs_bOIUxISHkdOrHnowBtVBrxcoYL': 'PkDQciMkMT9NWSKwNP7B',
  '1LJe7y67iiXm99s7AckkRc4mRi8zRZrM-': 'R680aW0WcdShzrx9I0vg',
  '1rEVEh3hwIxgSMrb6xVashNMVWiwktLdG': 'S0000001',
  '1ILARD6-YnzBY9t9kwnTQqJsry5XY7cLL': 'S0000002',
  '1w3B6mWfejpoa9CI3r_99zVzae2uDaS9H': 'U1kUav6ECXFMjiNh1CgD',
  '1Mi4PO6RDctggEjzyXjTI-gy2WOxn8spl': 'USNHWsGokIOwmvskLcCg',
  '1RRnfFbAYIHbxF_V2W3pTmyd_qi19c1y5': 'VkWeSN2Q9m6VEZUvE9XU',
  '1c15G-Xlk9KMYmxYy-bpr15xMubEwMWkw': 'XDOkobfwT4plEQ5pnP0r',
  '1-lCLwJ7YWrOxL0Ug6AOBpZoPW4J_RclQ': 'XKlVBOixbERO7MudL4w8',
  '1Q3gtV_P9n12ZceLGwpC_SFWFRJAiMfop': 'Yp7b68sFdS6TRo1scU2x',
  '1X5RUYOoU7B84YaDb3tBEWeGLyb6DYmA5': 'acaTW9ovm9v7fyVY7Ze1',
  '1dix3IP29kHd4Jj0G7sIt1eN-BBrYehvi': 'ay2dReXVo0isKrWhQ8jl',
  '1aY7j-TXAyPejSbY9qHILDvn0fnRoYOUw': 'b19lZr5WBN3M7TIT9GKc',
  '184oL6rN7UlJpg4cWa82fymk6KTbg6E1c': 'biZ9Ov2zET055r5ZUNMu',
  '1kpK4AzmWtHbtBgAWMH3bDBcM46-gNPCf': 'c7jHs7slD4iNUBmDClKE',
  '1X3KAbf_t9IfXksZb8XBm5bY8xMSAZdag': 'cBBwyof1Zpy274OKyDIh',
  '1qEo207MsT6Bzurd7IIFvRpGq_uWJ-roY': 'cELtBG9IJdB6gK5t1aMa',
  '1fDNYFYxaFZyKSbz5i-rYdLXt3PFoh9dD': 'caO6vXTGJctqTXdQHjox',
  '1paTYcHg4xtDhyRjqC5TxSiXEzjDCxESI': 'dMlT2ZgRNg0vSYX3UcRG',
  '17Ow8fPIvE0w1TBf60LotxcIZQ5fsR0wG': 'dOqQK4hlvAquuiz0jpNH',
  '1Kpod9FnDg-sPVGvi-BskoMqACcbMaB7t': 'gozY2cLceVHvNFgJa2jR',
  '1XKLP6lBcIRbqZn8nnD9s0PvjQRKoIHB-': 'icb5UEU0Ze93XS0br7pH',
  '1oe3XUAfgKdm8DR8g4caDfxhcW1fCGG6e': 'kmUGgTgigVj4mWQGh015',
  '1JOhp8IfvVDh-LO53DYLeJkC3huFGdyfE': 'n45jknP5grPKYW1YlyF2',
  '1tM7JfRm6pHQnVh7zAMmi_zMALymYK0I2': 'nAEUDLtqBpEAJpaUM0tN',
  '1RXPINpTpsbUlsvKxS9ubNja7SQHQsOxq': 'nokW4F0GZjdsvwZohSWQ',
  '1TbIWc3bbnY2qBEVsQ913_gf3GN9d6wdj': 'nqi03IDFdMDBUiofScfZ',
  '1p_E1e8RqPFhIoMubjgVwcgSklU3nfSjY': 'oWtnZpj9q34Z76r3jz0s',
  '1YhgDG1IpO3zBuln-N9f_UMr3C0tC0YNT': 'osjLHFxSLGHoyqXfotPx',
  '11Fy1J2M6vIGQrlDiE9KzeLav2aEB4js-': 'ri68TrWrk8CzQV1jkD40',
  '15LWg_b2MNTvpdA_IeJpcjerPArminwHq': 'tUbdoPM8pUZINkmQ1pkz',
  '1zJc_ApotJuLlL5G3pHNj7wOwfCMlOi9M': 'tXhphD4ml4rY7r9ew76M',
  '1QQpaD1D0wsW5V_Vh0b4eWX5Qy0H35v-i': 'thhQXdSWvCmGORThBHCM',
  '1W7F16rKqQ8U474Gv-VKD9khEmlOMFI2q': 'tlfelbNta298LiOwaZv2',
  '1j1l0Qvm3nYBwftdcqgxYWUpBnI0N2TuC': 'u0ziUUzPnGsVvynq2kiT',
  '1BQwJpE7e_Uj8cCz2uEiklZ_2w8yzOQMR': 'vQpYQhfWsbq3nIKLsqtC',
  '1E_Ol5kBjdxHU3Js_aZaxV6oosFN1iiJ0': 'w4MScxVCjxOgpRkAtCGK',
  '1eArp4jrg2estC3in1wOBi2vFm4mn39Pq': 'xKRe3K4k94WIagYHRegf',
}

export const KNOWN_STATIC_GAME_IDS = new Set(Object.values(STATIC_COVERS_BY_DRIVE_ID))

/**
 * Safely extracts a Google Drive file ID ONLY from genuine Google Drive / Google UserContent / wsrv URLs.
 * Returns null for all other URLs (Firebase Storage, LINE avatars, relative paths, data URIs, external CDNs)
 * to ensure non-Drive images are never mangled or broken.
 */
export function extractDriveId(url) {
  if (!url) return null
  const str = String(url).trim()
  if (!str) return null

  // Local / relative paths, data URIs, blob URIs
  if (str.startsWith('/') || str.startsWith('./') || str.startsWith('../') || str.startsWith('data:') || str.startsWith('blob:')) {
    return null
  }

  // Pure Drive ID without URL scheme (alphanumeric, underscores, hyphens, 25-60 chars, no dots/slashes/colons)
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(str) && !str.includes('.') && !str.includes('/') && !str.includes(':')) {
    return str
  }

  // Only examine URLs that originate from Google Drive / Google UserContent / wsrv wrapping Google Drive
  let isGoogleSource = false
  try {
    const parsed = new URL(str)
    const host = parsed.hostname.toLowerCase()
    if (
      host.includes('drive.google.com') ||
      host.includes('drive.usercontent.google.com') ||
      (host.includes('googleusercontent.com') && parsed.pathname.startsWith('/d/')) ||
      host.includes('docs.google.com') ||
      (host.includes('wsrv.nl') && (parsed.search.includes('google.com') || parsed.search.includes('googleusercontent.com')))
    ) {
      isGoogleSource = true
    }
  } catch {
    if (str.includes('drive.google.com') || str.includes('googleusercontent.com') || str.includes('drive.usercontent')) {
      isGoogleSource = true
    }
  }

  if (!isGoogleSource) {
    return null
  }

  let decoded = str
  try {
    decoded = decodeURIComponent(str)
  } catch {
    // Keep decoded as str
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

  return null
}

/**
 * Resolves a game cover image.
 * If the game has a pre-rendered static cover in /covers/{id}.jpg, returns that immediately (<20ms).
 * Otherwise returns the optimized Google Edge CDN URL or source URL.
 *
 * @param {object|string} gameOrId - Game object or gameId or imageUrl
 * @param {string} [rawUrl] - Optional fallback image URL
 * @param {number} [width=400] - Desired width
 * @returns {string} High-speed cover URL
 */
export function resolveGameCover(gameOrId, rawUrl = null, width = 400) {
  if (!gameOrId && !rawUrl) return '/logo.png'

  let gameId = null
  let sourceUrl = rawUrl

  if (typeof gameOrId === 'object' && gameOrId !== null) {
    gameId = gameOrId.id || gameOrId._id || null
    sourceUrl = gameOrId.image || gameOrId.coverUrl || rawUrl
  } else if (typeof gameOrId === 'string') {
    const s = gameOrId.trim()
    if (KNOWN_STATIC_GAME_IDS.has(s)) {
      return `/covers/${s}.jpg`
    }
    if (!s.includes('/') && !s.includes(':') && !s.includes('?') && !s.includes('.')) {
      gameId = s
    } else {
      sourceUrl = s
    }
  }

  // 1. Direct match by game ID
  if (gameId && KNOWN_STATIC_GAME_IDS.has(gameId)) {
    return `/covers/${gameId}.jpg`
  }

  // 2. Match by Google Drive ID mapped to a static cover
  const driveId = extractDriveId(sourceUrl)
  if (driveId && STATIC_COVERS_BY_DRIVE_ID[driveId]) {
    return `/covers/${STATIC_COVERS_BY_DRIVE_ID[driveId]}.jpg`
  }

  // 3. Fallback to optimized URL
  return toOptimizedUrl(sourceUrl, width)
}

/**
 * Converts an image URL into a high-speed Google Edge CDN URL with WebP compression.
 * Non-Google URLs (LINE avatars, Firebase Storage, relative paths) are returned untouched.
 * Mapped game covers automatically return their local /covers/{id}.jpg file.
 *
 * @param {string} url - Source image URL or Drive ID
 * @param {number} width - Target width in pixels (e.g. 300, 400, 600, 900, 1200)
 * @param {object} options - Extra options: { noWebp: boolean, square: boolean }
 * @returns {string} Optimized CDN URL
 */
export function toOptimizedUrl(url, width = 600, options = {}) {
  if (!url) return ''
  const str = String(url).trim()
  if (!str) return ''

  // If already a local relative path, return as is
  if (str.startsWith('/') || str.startsWith('data:') || str.startsWith('blob:')) {
    return str
  }

  // Check if string is directly a game ID with local cover
  if (KNOWN_STATIC_GAME_IDS.has(str)) {
    return `/covers/${str}.jpg`
  }

  const id = extractDriveId(str)
  if (!id) {
    // Not a Google Drive URL (LINE avatar, Firebase Storage, external link) -> return untouched
    return str
  }

  // Check if this Drive ID belongs to a known catalog game with local static cover
  if (STATIC_COVERS_BY_DRIVE_ID[id]) {
    return `/covers/${STATIC_COVERS_BY_DRIVE_ID[id]}.jpg`
  }

  const w = Number(width) || 600
  const webpFlag = options.noWebp ? '' : '-rw'

  if (options.square) {
    return `https://lh3.googleusercontent.com/d/${id}=s${w}-c${webpFlag}`
  }

  return `https://lh3.googleusercontent.com/d/${id}=w${w}${webpFlag}`
}

/**
 * Fallback URL using Google Drive native thumbnail endpoint if CDN fails.
 */
export function toFallbackUrl(url, width = 600) {
  if (!url) return '/logo.png'
  const id = extractDriveId(url)
  if (!id) return url
  const w = Number(width) || 600
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`
}

/**
 * Drop-in replacement for existing convertImageUrl calls across the codebase.
 */
export function convertImageUrl(url, width = 600, options = {}) {
  return toOptimizedUrl(url, width, options)
}

/**
 * Robust cascading image error handler:
 * Step 0 (Local cover failed): Falls back to Google Edge CDN
 * Step 1 (Edge CDN failed): Falls back to Google Drive native thumbnail
 * Step 2 (Thumbnail failed): Falls back to /logo.png
 *
 * @param {Event} event - The img onError event
 * @param {string} originalUrl - The original raw image URL or Drive ID
 * @param {number} [width=600] - Image width
 */
export function handleImageLoadError(event, originalUrl, width = 600) {
  if (!event || !event.currentTarget) return
  const img = event.currentTarget
  const step = Number(img.dataset.failStep || 0)

  // Step 0: If current src is a local /covers/ path that failed, try Google Edge CDN
  if (step === 0 && img.src && img.src.includes('/covers/')) {
    img.dataset.failStep = '1'
    const driveId = extractDriveId(originalUrl)
    if (driveId) {
      img.src = `https://lh3.googleusercontent.com/d/${driveId}=w${width}-rw`
      return
    }
  }

  // Step 1: If Google Edge CDN failed, try native thumbnail endpoint
  if (step <= 1) {
    img.dataset.failStep = '2'
    const driveId = extractDriveId(originalUrl)
    if (driveId) {
      img.src = `https://drive.google.com/thumbnail?id=${driveId}&sz=w${width}`
      return
    }
  }

  // Step 2: Final fallback to logo
  img.dataset.failStep = '3'
  if (img.src && !img.src.includes('logo.png')) {
    img.src = '/logo.png'
  }
}

/**
 * Dedicated error handler for character portraits and member avatars.
 * Never falls back to /logo.png.
 * Step 0: Tries native thumbnail endpoint (works if user has Google session cookies)
 * Step 1: Hides the broken img element cleanly so the sleek underlying silhouette placeholder displays.
 */
export function handleCharacterImageError(event, originalUrl, width = 340) {
  if (!event || !event.currentTarget) return
  const img = event.currentTarget
  const step = Number(img.dataset.failStep || 0)

  if (step === 0) {
    img.dataset.failStep = '1'
    const driveId = extractDriveId(originalUrl)
    if (driveId) {
      img.src = `https://drive.google.com/thumbnail?id=${driveId}&sz=w${width}`
      return
    }
  }

  // Final fallback: hide img cleanly so underlying avatar/placeholder icon shows
  img.dataset.failStep = '2'
  img.style.display = 'none'
}
