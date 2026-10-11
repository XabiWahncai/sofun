import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore'
import fs from 'fs'
import path from 'path'

const firebaseConfig = {
  apiKey: 'AIzaSyDNIDUj2ecjIUBeNjIwTisn5X46plXEhjQ',
  authDomain: 'sonfun0linel.firebaseapp.com',
  projectId: 'sonfun0linel',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const now = new Date()
const timestampStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
const backupDir = path.resolve(process.cwd(), 'backups', `firestore_${timestampStr}`)

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
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
  'pos_live',
  'wheelSettings',
  'wheelHistory',
  'print_jobs',
]

const SETTINGS_DOCS = [
  'promotion',
  'payment',
  'receipt',
]

async function runBackup() {
  console.log(`Starting comprehensive Firestore backup to: ${backupDir}`)
  const report = {}

  for (const collName of COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, collName))
      const docs = snap.docs.map(d => ({
        _id: d.id,
        ...d.data(),
      }))
      const filePath = path.join(backupDir, `${collName}.json`)
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8')
      report[collName] = docs.length
      console.log(`- ${collName}: ${docs.length} documents`)
    } catch (err) {
      console.warn(`- ${collName}: failed (${err.message})`)
      report[collName] = `Error: ${err.message}`
    }
  }

  // Backup individual settings docs
  const settingsData = {}
  for (const docId of SETTINGS_DOCS) {
    try {
      const snap = await getDoc(doc(db, 'settings', docId))
      if (snap.exists()) {
        settingsData[docId] = snap.data()
        console.log(`- settings/${docId}: saved`)
      }
    } catch (err) {
      console.warn(`- settings/${docId}: failed (${err.message})`)
    }
  }
  if (Object.keys(settingsData).length > 0) {
    fs.writeFileSync(path.join(backupDir, 'settings.json'), JSON.stringify(settingsData, null, 2), 'utf-8')
    report['settings'] = Object.keys(settingsData).length
  }

  const meta = {
    backupAt: now.toISOString(),
    collections: report,
  }
  fs.writeFileSync(path.join(backupDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf-8')

  console.log(`Backup completed successfully in ${backupDir}`)
  process.exit(0)
}

runBackup().catch(err => {
  console.error('Backup failed:', err)
  process.exit(1)
})
