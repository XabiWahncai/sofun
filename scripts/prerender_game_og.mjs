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

function formatOgImage(imgUrl) {
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

  let generatedCount = 0

  for (const game of games) {
    const id = game._id || game.id
    if (!id) continue

    const title = game.title || 'เกมสืบสวน Script Murder'
    const pageTitle = `${title} — Script Murder | Sofun Club Thailand`
    const desc = cleanDescription(game.synopsis || game.description)
    const gameUrl = `https://sofunclub.co/games/${id}`
    const imageUrl = formatOgImage(game.image)
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

    generatedCount++
  }

  console.log(`[prerender] Successfully generated static Open Graph pages for ${generatedCount} games in dist/games/`)
  process.exit(0)
}

main().catch((err) => {
  console.error('[prerender] Error:', err)
  process.exit(1)
})
