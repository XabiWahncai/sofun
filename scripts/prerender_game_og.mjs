import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function cleanDescription(desc) {
  if (!desc) return 'สคริปต์เกมสืบสวน Script Murder ยอดนิยม พร้อมห้องเล่นสมจริงและ Game Master มืออาชีพที่ Sofun Club Thailand'
  return desc
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 220)
}

function formatFallbackOgImage(imgUrl) {
  if (!imgUrl) return 'https://sofunclub.co/logo.jpg'
  try {
    const parsed = new URL(imgUrl)
    if (parsed.hostname.includes('wsrv.nl')) {
      parsed.searchParams.set('output', 'jpg')
      parsed.searchParams.set('w', '1200')
      return parsed.toString()
    }
  } catch (e) {
    // fallback
  }
  return imgUrl
}

async function ensureLocalCover(id, rawImageUrl) {
  const publicCoversDir = path.join(rootDir, 'public', 'covers')
  const distCoversDir = path.join(rootDir, 'dist', 'covers')
  if (!fs.existsSync(publicCoversDir)) fs.mkdirSync(publicCoversDir, { recursive: true })
  if (!fs.existsSync(distCoversDir)) fs.mkdirSync(distCoversDir, { recursive: true })

  const publicFilePath = path.join(publicCoversDir, `${id}.jpg`)
  const distFilePath = path.join(distCoversDir, `${id}.jpg`)

  if (fs.existsSync(publicFilePath) && fs.statSync(publicFilePath).size > 1000) {
    if (!fs.existsSync(distFilePath) || fs.statSync(distFilePath).size !== fs.statSync(publicFilePath).size) {
      fs.copyFileSync(publicFilePath, distFilePath)
    }
    return `https://sofunclub.co/covers/${id}.jpg`
  }

  if (!rawImageUrl) return 'https://sofunclub.co/logo.jpg'

  let fetchUrl = rawImageUrl
  try {
    const parsed = new URL(rawImageUrl)
    if (parsed.hostname.includes('wsrv.nl')) {
      parsed.searchParams.set('output', 'jpg')
      parsed.searchParams.set('w', '1200')
      fetchUrl = parsed.toString()
    }
  } catch (e) {}

  try {
    const res = await fetch(fetchUrl)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 1000) {
        fs.writeFileSync(publicFilePath, buf)
        fs.writeFileSync(distFilePath, buf)
        console.log(`[prerender] Downloaded cover for ${id} (${(buf.length / 1024).toFixed(1)} KB)`)
        return `https://sofunclub.co/covers/${id}.jpg`
      }
    }
  } catch (e) {
    console.warn(`[prerender] Failed to download cover for ${id}:`, e.message)
  }

  return formatFallbackOgImage(rawImageUrl)
}

function setOrInsertMeta(html, attr, attrVal, content) {
  const pattern = new RegExp(`<meta\\s+${attr}=["']${attrVal}["'][^>]*>`, 'i')
  const newTag = `<meta ${attr}="${attrVal}" content="${escapeHtml(content)}" />`
  if (pattern.test(html)) {
    return html.replace(pattern, newTag)
  }
  return html.replace('</head>', `    ${newTag}\n  </head>`)
}

function setOrInsertLink(html, rel, href) {
  const pattern = new RegExp(`<link\\s+rel=["']${rel}["'][^>]*>`, 'i')
  const newTag = `<link rel="${rel}" href="${escapeHtml(href)}" />`
  if (pattern.test(html)) {
    return html.replace(pattern, newTag)
  }
  return html.replace('</head>', `    ${newTag}\n  </head>`)
}

function findLatestBackupScripts() {
  const backupsDir = path.join(rootDir, 'backups')
  if (!fs.existsSync(backupsDir)) return null
  const subdirs = fs.readdirSync(backupsDir)
    .filter(name => name.startsWith('firestore_'))
    .sort()
    .reverse()

  for (const dir of subdirs) {
    const scriptsPath = path.join(backupsDir, dir, 'scripts.json')
    if (fs.existsSync(scriptsPath)) {
      try {
        const raw = fs.readFileSync(scriptsPath, 'utf8')
        const data = JSON.parse(raw)
        if (Array.isArray(data) && data.length > 0) {
          console.log(`[prerender] Loaded ${data.length} games from backup: ${dir}`)
          return data
        }
      } catch (e) {
        console.warn(`[prerender] Failed to parse ${scriptsPath}:`, e.message)
      }
    }
  }
  return null
}

async function loadGames() {
  const backupGames = findLatestBackupScripts()
  if (backupGames) return backupGames

  throw new Error('No game data found in backups')
}

async function main() {
  const distHtmlPath = path.join(rootDir, 'dist', 'index.html')
  if (!fs.existsSync(distHtmlPath)) {
    console.error('[prerender] dist/index.html not found. Run vite build first.')
    process.exit(1)
  }

  const baseHtml = fs.readFileSync(distHtmlPath, 'utf8')
  const games = await loadGames()

  const gamesOutDir = path.join(rootDir, 'dist', 'games')
  if (!fs.existsSync(gamesOutDir)) {
    fs.mkdirSync(gamesOutDir, { recursive: true })
  }

  // Pre-download covers with concurrency pool
  console.log(`[prerender] Ensuring static cover images for ${games.length} games...`)
  const coverUrls = {}
  const poolLimit = 5
  let index = 0

  async function worker() {
    while (index < games.length) {
      const g = games[index++]
      const id = g._id || g.id
      if (id) {
        coverUrls[id] = await ensureLocalCover(id, g.image)
      }
    }
  }
  const workers = Array.from({ length: poolLimit }, () => worker())
  await Promise.all(workers)

  let generatedCount = 0

  for (const game of games) {
    const id = game._id || game.id
    if (!id) continue

    const title = game.title || 'เกมสืบสวน Script Murder'
    const pageTitle = `${title} — Script Murder | Sofun Club Thailand`
    const desc = cleanDescription(game.synopsis || game.description)
    const gameUrl = `https://sofunclub.co/games/${id}`
    const imageUrl = coverUrls[id] || formatFallbackOgImage(game.image)
    const imageType = imageUrl.includes('output=jpg') || imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg')
      ? 'image/jpeg'
      : (imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg')

    let html = baseHtml

    // Update <title>
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`)

    // Primary SEO
    html = setOrInsertMeta(html, 'name', 'description', desc)
    html = setOrInsertLink(html, 'canonical', gameUrl)

    // Open Graph
    html = setOrInsertMeta(html, 'property', 'og:type', 'website')
    html = setOrInsertMeta(html, 'property', 'og:url', gameUrl)
    html = setOrInsertMeta(html, 'property', 'og:title', pageTitle)
    html = setOrInsertMeta(html, 'property', 'og:description', desc)
    html = setOrInsertMeta(html, 'property', 'og:image', imageUrl)
    html = setOrInsertMeta(html, 'property', 'og:image:secure_url', imageUrl)
    html = setOrInsertMeta(html, 'property', 'og:image:type', imageType)
    html = setOrInsertMeta(html, 'property', 'og:image:width', '1200')
    html = setOrInsertMeta(html, 'property', 'og:image:height', '630')
    html = setOrInsertMeta(html, 'property', 'og:image:alt', title)

    // Twitter Card
    html = setOrInsertMeta(html, 'name', 'twitter:card', 'summary_large_image')
    html = setOrInsertMeta(html, 'name', 'twitter:title', pageTitle)
    html = setOrInsertMeta(html, 'name', 'twitter:description', desc)
    html = setOrInsertMeta(html, 'name', 'twitter:image', imageUrl)
    html = setOrInsertMeta(html, 'name', 'twitter:image:alt', title)

    // JSON-LD structured data for Game
    const gameSchema = {
      '@context': 'https://schema.org',
      '@type': 'Game',
      name: title,
      description: desc,
      url: gameUrl,
      image: imageUrl,
      genre: ['Script Murder', 'Jubensha', 'Mystery', 'Detective'],
      author: {
        '@type': 'Organization',
        name: 'Sofun Club Thailand',
        url: 'https://sofunclub.co/',
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'THB',
        price: game.price || 599,
        availability: 'https://schema.org/InStock',
      },
    }
    const schemaTag = `\n    <script type="application/ld+json">\n    ${JSON.stringify(gameSchema, null, 2)}\n    </script>`
    html = html.replace('</head>', `${schemaTag}\n  </head>`)

    // 1. Write dist/games/[id]/index.html
    const targetDir = path.join(gamesOutDir, id)
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    fs.writeFileSync(path.join(targetDir, 'index.html'), html, 'utf8')

    // 2. Write dist/games/[id].html
    fs.writeFileSync(path.join(gamesOutDir, `${id}.html`), html, 'utf8')

    // 3. Special alias for 'cELtBG9IJdB6gK5t1aMa' -> 'cELtBG9IJdB6qK5t1aMa'
    if (id === 'cELtBG9IJdB6gK5t1aMa') {
      const aliasId = 'cELtBG9IJdB6qK5t1aMa'
      const aliasDir = path.join(gamesOutDir, aliasId)
      if (!fs.existsSync(aliasDir)) fs.mkdirSync(aliasDir, { recursive: true })
      const aliasHtml = html.split(id).join(aliasId)
      fs.writeFileSync(path.join(aliasDir, 'index.html'), aliasHtml, 'utf8')
      fs.writeFileSync(path.join(gamesOutDir, `${aliasId}.html`), aliasHtml, 'utf8')
      // Also alias the cover image in both public and dist
      const srcCoverDist = path.join(rootDir, 'dist', 'covers', `${id}.jpg`)
      const dstCoverDist = path.join(rootDir, 'dist', 'covers', `${aliasId}.jpg`)
      if (fs.existsSync(srcCoverDist)) fs.copyFileSync(srcCoverDist, dstCoverDist)
      const srcCoverPub = path.join(rootDir, 'public', 'covers', `${id}.jpg`)
      const dstCoverPub = path.join(rootDir, 'public', 'covers', `${aliasId}.jpg`)
      if (fs.existsSync(srcCoverPub)) fs.copyFileSync(srcCoverPub, dstCoverPub)
    }

    generatedCount++
  }

  // Update sitemap.xml with game links
  try {
    const sitemapPath = path.join(rootDir, 'public', 'sitemap.xml')
    const distSitemapPath = path.join(rootDir, 'dist', 'sitemap.xml')
    const today = new Date().toISOString().slice(0, 10)
    let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    sitemapXml += `  <url><loc>https://sofunclub.co/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n`
    sitemapXml += `  <url><loc>https://sofunclub.co/games</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`
    sitemapXml += `  <url><loc>https://sofunclub.co/booking</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`
    sitemapXml += `  <url><loc>https://sofunclub.co/party</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`
    for (const game of games) {
      const id = game._id || game.id
      if (id) {
        sitemapXml += `  <url><loc>https://sofunclub.co/games/${id}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`
      }
    }
    sitemapXml += `</urlset>\n`
    fs.writeFileSync(sitemapPath, sitemapXml, 'utf8')
    fs.writeFileSync(distSitemapPath, sitemapXml, 'utf8')
    console.log(`[prerender] Updated sitemap.xml with ${games.length} game URLs`)
  } catch (err) {
    console.warn('[prerender] Could not update sitemap:', err.message)
  }

  console.log(`[prerender] Successfully generated static Open Graph pages for ${generatedCount} games in dist/games/`)
  process.exit(0)
}

main().catch((err) => {
  console.error('[prerender] Error:', err)
  process.exit(1)
})
