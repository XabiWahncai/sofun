import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const driveIdRegex = /\/(?:d|file\/d)\/([a-zA-Z0-9_-]{25,})|[?&]id=([a-zA-Z0-9_-]{25,})/

function extractDriveId(url) {
  if (!url) return null
  const str = String(url).trim()
  if (!str) return null
  const m = str.match(driveIdRegex)
  if (m) return m[1] || m[2]
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(str)) return str
  return null
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
          console.log(`[characters] Loaded ${data.length} games from backup: ${dir}`)
          return data
        }
      } catch (e) {
        console.warn(`[characters] Failed to parse ${scriptsPath}:`, e.message)
      }
    }
  }
  return null
}

async function fetchImageBuffer(driveId) {
  const candidateUrls = [
    `https://lh3.googleusercontent.com/d/${driveId}=w600`,
    `https://drive.google.com/thumbnail?id=${driveId}&sz=w600`,
    `https://wsrv.nl/?url=https://drive.google.com/thumbnail?id=${driveId}%26sz=w600&output=jpg`,
    `https://images.weserv.nl/?url=https://drive.google.com/uc?id=${driveId}&w=600&output=jpg`
  ]

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > 1000) {
          return buf
        }
      }
    } catch (e) {
      // try next
    }
  }
  return null
}

async function main() {
  const games = findLatestBackupScripts()
  if (!games) {
    console.error('[characters] No games backup found!')
    process.exit(1)
  }

  const publicCharDir = path.join(rootDir, 'public', 'characters')
  const distCharDir = path.join(rootDir, 'dist', 'characters')
  if (!fs.existsSync(publicCharDir)) fs.mkdirSync(publicCharDir, { recursive: true })
  if (!fs.existsSync(distCharDir)) fs.mkdirSync(distCharDir, { recursive: true })

  const uniqueDriveIds = new Set()
  games.forEach(g => {
    if (Array.isArray(g.characters)) {
      g.characters.forEach(c => {
        if (c && c.image) {
          const id = extractDriveId(c.image)
          if (id) uniqueDriveIds.add(id)
        }
      })
    }
  })

  const idList = Array.from(uniqueDriveIds)
  console.log(`[characters] Total unique character images to verify: ${idList.length}`)

  let downloaded = 0
  let skipped = 0
  let failed = 0
  const successfulIds = []

  const concurrency = 10
  let index = 0

  async function worker() {
    while (index < idList.length) {
      const driveId = idList[index++]
      const publicPath = path.join(publicCharDir, `${driveId}.jpg`)
      const distPath = path.join(distCharDir, `${driveId}.jpg`)

      if (fs.existsSync(publicPath) && fs.statSync(publicPath).size > 1000) {
        if (!fs.existsSync(distPath) || fs.statSync(distPath).size !== fs.statSync(publicPath).size) {
          fs.copyFileSync(publicPath, distPath)
        }
        successfulIds.push(driveId)
        skipped++
        continue
      }

      const buf = await fetchImageBuffer(driveId)
      if (buf) {
        fs.writeFileSync(publicPath, buf)
        fs.writeFileSync(distPath, buf)
        successfulIds.push(driveId)
        downloaded++
        if (downloaded % 25 === 0 || downloaded === idList.length) {
          console.log(`[characters] Downloaded ${downloaded}/${idList.length} character images...`)
        }
      } else {
        console.warn(`[characters] Failed to fetch image for driveId: ${driveId}`)
        failed++
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker())
  await Promise.all(workers)

  console.log(`[characters] Completed: ${downloaded} downloaded, ${skipped} already cached, ${failed} failed.`)

  // Write static mapping file: src/utils/staticCharacters.js
  const manifestPath = path.join(rootDir, 'src', 'utils', 'staticCharacters.js')
  const content = `// Generated static character images set\n// Pre-downloaded in public/characters/{driveId}.jpg\n// Zero emojis applied strictly.\n\nexport const STATIC_CHARACTER_IDS = new Set([\n${successfulIds.map(id => `  '${id}',`).join('\n')}\n])\n`

  fs.writeFileSync(manifestPath, content, 'utf8')
  console.log(`[characters] Wrote static character manifest to ${manifestPath} (${successfulIds.length} ids)`)
}

main().catch(err => {
  console.error('[characters] Error:', err)
  process.exit(1)
})
