import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, writeBatch } from 'firebase/firestore'
import fs from 'fs'
import path from 'path'

const firebaseConfig = {
  apiKey: 'AIzaSyDNIDUj2ecjIUBeNjIwTisn5X46plXEhjQ',
  authDomain: 'sonfun0linel.firebaseapp.com',
  projectId: 'sonfun0linel',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// Find the target backup folder
const targetFolderArg = process.argv[2]
const backupsRootDir = path.resolve(process.cwd(), 'backups')

let targetDir = ''
if (targetFolderArg) {
  targetDir = path.isAbsolute(targetFolderArg)
    ? targetFolderArg
    : path.resolve(process.cwd(), targetFolderArg)
} else {
  // Pick latest folder in backups/
  if (fs.existsSync(backupsRootDir)) {
    const folders = fs.readdirSync(backupsRootDir)
      .filter(f => f.startsWith('firestore_'))
      .sort()
      .reverse()
    if (folders.length > 0) {
      targetDir = path.join(backupsRootDir, folders[0])
    }
  }
}

if (!targetDir || !fs.existsSync(targetDir)) {
  console.error(`Backup folder not found: ${targetDir || backupsRootDir}`)
  console.log('Usage: node scripts/restore_firestore.mjs [path_to_backup_folder]')
  process.exit(1)
}

const COLLECTIONS = [
  'members',
  'bookings',
  'scripts',
  'menuItems',
  'parties',
  'orders',
  'payments',
  'evaluations',
  'playHistory',
  'wheelSettings',
  'wheelHistory',
]

async function restore() {
  console.log(`Starting restore from: ${targetDir}`)

  for (const collName of COLLECTIONS) {
    const file = path.join(targetDir, `${collName}.json`)
    if (!fs.existsSync(file)) continue

    const docs = JSON.parse(fs.readFileSync(file, 'utf-8'))
    console.log(`Restoring ${collName} (${docs.length} docs)...`)

    // Write in batches of up to 450 docs
    let batch = writeBatch(db)
    let opCount = 0

    for (const d of docs) {
      const docId = d._id
      const data = { ...d }
      delete data._id

      const docRef = doc(db, collName, docId)
      batch.set(docRef, data, { merge: true })
      opCount++

      if (opCount >= 400) {
        await batch.commit()
        batch = writeBatch(db)
        opCount = 0
      }
    }

    if (opCount > 0) {
      await batch.commit()
    }
    console.log(`- ${collName}: restored successfully.`)
  }

  // Restore settings.json
  const settingsFile = path.join(targetDir, 'settings.json')
  if (fs.existsSync(settingsFile)) {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
    for (const [docId, data] of Object.entries(settings)) {
      await setDoc(doc(db, 'settings', docId), data, { merge: true })
      console.log(`- settings/${docId}: restored.`)
    }
  }

  // Restore pos_live
  const posFile = path.join(targetDir, 'pos_live.json')
  if (fs.existsSync(posFile)) {
    const docs = JSON.parse(fs.readFileSync(posFile, 'utf-8'))
    for (const d of docs) {
      const docId = d._id
      const data = { ...d }
      delete data._id
      await setDoc(doc(db, 'pos_live', docId), data, { merge: true })
    }
    console.log('- pos_live: restored.')
  }

  console.log('Restore finished successfully.')
  process.exit(0)
}

restore().catch(err => {
  console.error('Restore error:', err)
  process.exit(1)
})
