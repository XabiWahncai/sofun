import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth } from 'firebase/auth'
import { getFunctions } from 'firebase/functions'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: "AIzaSyDNIDUj2ecjIUBeNjIwTisn5X46plXEhjQ",
  authDomain: "sonfun0linel.firebaseapp.com",
  projectId: "sonfun0linel",
  storageBucket: "sonfun0linel.firebasestorage.app",
  messagingSenderId: "744126125400",
  appId: "1:744126125400:web:6d0463c11ab46107c4812d"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const auth = getAuth(app)
export const appFunctions = getFunctions(app, 'asia-southeast1')

export const VAPID_KEY = 'BGRrR2TXJVzxS2WL2Je7-I6dlTDMjkE2TNwbNam81MJnoAaHrmQIA83cqnFrTpXMM_jaKTxWLArSCi-hasxR5yc'

let _messaging = null
export async function getMessagingInstance() {
  if (_messaging) return _messaging
  try {
    const supported = await isSupported()
    if (!supported) return null
    _messaging = getMessaging(app)
    return _messaging
  } catch { return null }
}
