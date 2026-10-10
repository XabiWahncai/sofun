import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDNIDUj2ecjIUBeNjIwTisn5X46plXEhjQ',
  authDomain: 'sonfun0linel.firebaseapp.com',
  projectId: 'sonfun0linel',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function clearMock() {
  const posRef = doc(db, 'pos_live', 'current')
  const snap = await getDoc(posRef)
  if (!snap.exists()) {
    console.error('pos_live/current not found')
    process.exit(1)
  }

  const data = snap.data()
  const sessions = data.sessions || []
  if (sessions.length === 0) {
    console.log('No sessions to clear.')
    process.exit(0)
  }

  // Clear mock members from sessions (filter out isMock, or reset members if all were mock)
  sessions.forEach(s => {
    if (Array.isArray(s.members)) {
      s.members = s.members.filter(m => !m.isMock)
    }
  })

  await updateDoc(posRef, { sessions })
  console.log('Successfully cleared all mock members from pos_live/current.')
  process.exit(0)
}

clearMock().catch(err => {
  console.error('Error clearing mock members:', err)
  process.exit(1)
})
