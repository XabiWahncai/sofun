import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth } from 'firebase/auth'
import { getFunctions } from 'firebase/functions'
import { getMessaging, isSupported } from 'firebase/messaging'

import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

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

// ── Web Application Firewall (WAF) / App Check Attestation ─────────
let _appCheck = null
if (typeof window !== 'undefined') {
  if (import.meta.env.DEV) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  }
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  if (siteKey) {
    try {
      _appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      })
    } catch (e) {
      console.warn('Firebase App Check WAF init skipped:', e.message)
    }
  }
}
export const appCheck = _appCheck

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

