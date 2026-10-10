import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDNIDUj2ecjIUBeNjIwTisn5X46plXEhjQ',
  authDomain: 'sonfun0linel.firebaseapp.com',
  projectId: 'sonfun0linel',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const mockMembers = [
  {
    uid: 'U105528c99fe8086454d3dcaf671796e4',
    name: 'Karinaa',
    avatar: 'https://profile.line-scdn.net/0h1TiEZMtLbntEPHK-cBYQRTRsbRFnTTdpaw91HSU6MBt9BCskbV5ySnE6Nh94XH4ubgokGHA_OBhmX1kxCT1AQTVaZwt6W0FZHztDVAxSWR8uWVsuMSVWShdeaxMmX09LIQx4ZCl1dw0cdC1dKShmGHFEXks6EFRrI2sCLUEOAPgrPhkuaVsoG3U0MEP7',
    character: '',
    scanInAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    personalDiscount: 0,
    personalDiscountNote: '',
    isMock: true,
  },
  {
    uid: 'U194b640348fb426843fc8340f61e5b40',
    name: 'bird VC',
    avatar: 'https://profile.line-scdn.net/0hXdN2hxiyB0tjSxJgdvd5NBMbBCFAOl5ZGHkfLQZIXn9Wf0EcRihAJAJPDC5cfUMZGCQcel5OCitvWHAtfR37f2R7WnpfckYZRy1Arw',
    character: '',
    scanInAt: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
    personalDiscount: 0,
    personalDiscountNote: '',
    isMock: true,
  },
  {
    uid: 'U1dcda5c1c79ccf4f756a7a7cde23f728',
    name: 'Heart',
    avatar: 'https://profile.line-scdn.net/0hYo1SCh1bBkAcKhl8M_94fmx6BSo_W19SOEQZIHksCHcpTkRBNE1PJy4iWHYpSEQVM0odcS8jDXA-TUFyZjtLXXFWCyUkeiQfYBMwempjPhB-TjNlZjMcW1kvNnhibDpWQEwaRl1pBQNSXAhMaU0CJyheGgx3U0VodH1qFhkYaMNzKHEVMU1AIC0iWHij',
    character: '',
    scanInAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    personalDiscount: 0,
    personalDiscountNote: '',
    isMock: true,
  },
  {
    uid: 'U1ff716c0c1dc37d42dcc9ca7dc3285d3',
    name: 'Pinggg',
    avatar: 'https://profile.line-scdn.net/0hnDtVGVLSMWtZLyWN_ZVPFCl_MgF6Xmh5Ih54Xjt7agxtHyNufUB8XmwrP10wF3doIkh9DmosPVxVPEYNR3nNX14fbFplFnA5fUl2jw',
    character: '',
    scanInAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    personalDiscount: 0,
    personalDiscountNote: '',
    isMock: true,
  },
  {
    uid: 'U227c63527a0109f673b2aa657b7c75f4',
    name: 'Yok',
    avatar: 'https://profile.line-scdn.net/0hBfALt_pvHUlsNQw8ThVjNhxlHiNPRERbEFZXJl5lF34CAlxKRVQAels0QHxYAw8WFQcCKFllEHxgJmovcmPhfWsFQHhQDFwbSFNarQ',
    character: '',
    scanInAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    personalDiscount: 0,
    personalDiscountNote: '',
    isMock: true,
  },
  {
    uid: 'U25621eb72b0e0fb862831f265d3138c9',
    name: 'เอิร์ธ',
    avatar: 'https://profile.line-scdn.net/0hA42DgvG4HhsfPQCgodJgJW9tHXE8TEcJZFtWeSppEikgXV1LY1NSfi09RC4lClhLNwkBfSM-SXk9cF0kcx0THiN9BHdQYzlOVzwyK0RCQVhabDgMSAAhDy5tO1RidCojY1oTCH01Andbclw7Wz8SNWhuAFtkSTItbmpyTRoPcJhwP2lOMlpYey41QCOg',
    character: '',
    scanInAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    personalDiscount: 0,
    personalDiscountNote: '',
    isMock: true,
  },
]

async function run() {
  const posRef = doc(db, 'pos_live', 'current')
  const snap = await getDoc(posRef)
  if (!snap.exists()) {
    console.error('pos_live/current not found')
    process.exit(1)
  }

  const data = snap.data()
  const sessions = data.sessions || []
  if (sessions.length === 0) {
    console.error('No sessions in pos_live')
    process.exit(1)
  }

  sessions[0].members = mockMembers
  await updateDoc(posRef, { sessions })
  console.log('Successfully injected 6 mock members into pos_live/current active party.')
  process.exit(0)
}

run().catch(err => {
  console.error('Error injecting mock members:', err)
  process.exit(1)
})
