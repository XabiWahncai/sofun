// Cyber Security utilities for SOFUN platform
// Zero emojis rule strictly applied.

import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const LOCKOUT_KEY = 'sofun_sec_lockout'
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 5 * 60 * 1000 // 5 minutes

// Simple SHA-256 implementation using Web Crypto API
export async function sha256(message) {
  if (!message) return ''
  try {
    const msgBuffer = new TextEncoder().encode(String(message))
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // Fallback simple hash for older environments
    let hash = 0
    const str = String(message)
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return Math.abs(hash).toString(16)
  }
}

// Log security event to Firestore and local fallback
export async function logSecurityEvent({
  eventType = 'SYSTEM_EVENT',
  severity = 'info', // 'info' | 'warning' | 'critical' | 'blocked'
  details = '',
  user = 'anonymous',
  metadata = {}
}) {
  const payload = {
    eventType,
    severity,
    details: String(details).slice(0, 1000),
    user: String(user).slice(0, 100),
    metadata: {
      ...metadata,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      origin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
      url: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    },
    timestamp: serverTimestamp(),
    clientTime: new Date().toISOString()
  }

  try {
    await addDoc(collection(db, 'security_logs'), payload)
  } catch {
    // Local fallback if offline or permission denied
    try {
      const raw = localStorage.getItem('sofun_sec_fallback_logs')
      const logs = raw ? JSON.parse(raw) : []
      logs.unshift({ ...payload, timestamp: new Date().toISOString() })
      localStorage.setItem('sofun_sec_fallback_logs', JSON.stringify(logs.slice(0, 50)))
    } catch {
      // Ignore storage errors
    }
  }
}

// Check brute-force lockout status
export function checkBruteForceLockout() {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY)
    if (!raw) return { locked: false, attempts: 0, remainingSeconds: 0 }
    const data = JSON.parse(raw)
    const now = Date.now()
    if (data.lockedUntil && data.lockedUntil > now) {
      const remainingSeconds = Math.ceil((data.lockedUntil - now) / 1000)
      return { locked: true, attempts: data.attempts || MAX_ATTEMPTS, remainingSeconds }
    }
    // Expired lockout
    if (data.lockedUntil && data.lockedUntil <= now) {
      localStorage.removeItem(LOCKOUT_KEY)
      return { locked: false, attempts: 0, remainingSeconds: 0 }
    }
    return { locked: false, attempts: data.attempts || 0, remainingSeconds: 0 }
  } catch {
    return { locked: false, attempts: 0, remainingSeconds: 0 }
  }
}

// Record a failed login attempt
export function recordFailedLogin(identifier = 'admin') {
  try {
    const status = checkBruteForceLockout()
    const newAttempts = status.attempts + 1
    const now = Date.now()

    if (newAttempts >= MAX_ATTEMPTS) {
      const lockedUntil = now + LOCKOUT_DURATION_MS
      localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts: newAttempts, lockedUntil }))
      logSecurityEvent({
        eventType: 'AUTH_BRUTE_FORCE_LOCKOUT',
        severity: 'critical',
        details: `Brute force defense triggered: IP/Client locked for 5 minutes after ${newAttempts} failed login attempts. Identifier: ${identifier}`,
        user: identifier,
        metadata: { attempts: newAttempts, lockoutDurationMs: LOCKOUT_DURATION_MS }
      })
      return { locked: true, attempts: newAttempts, remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000) }
    } else {
      localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts: newAttempts, lockedUntil: 0 }))
      logSecurityEvent({
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'warning',
        details: `Failed admin login attempt (${newAttempts}/${MAX_ATTEMPTS}). Identifier: ${identifier}`,
        user: identifier,
        metadata: { attempts: newAttempts, remainingAllowed: MAX_ATTEMPTS - newAttempts }
      })
      return { locked: false, attempts: newAttempts, remainingSeconds: 0 }
    }
  } catch {
    return { locked: false, attempts: 0, remainingSeconds: 0 }
  }
}

// Record a successful login and clear attempt counters
export function recordSuccessfulLogin(identifier = 'admin') {
  try {
    localStorage.removeItem(LOCKOUT_KEY)
    logSecurityEvent({
      eventType: 'AUTH_LOGIN_SUCCESS',
      severity: 'info',
      details: `Admin successfully authenticated. Session initialized for ${identifier}`,
      user: identifier,
      metadata: { action: 'admin_login' }
    })
  } catch {
    // Ignore storage errors
  }
}

// Reset lockout manually (admin control)
export function resetBruteForceLockout() {
  try {
    localStorage.removeItem(LOCKOUT_KEY)
    logSecurityEvent({
      eventType: 'SECURITY_LOCKOUT_RESET',
      severity: 'info',
      details: 'Administrator manually cleared brute force lockout state.',
      user: 'admin_dashboard'
    })
    return true
  } catch {
    return false
  }
}

// Sanitize user inputs against XSS and Script Injection
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[<>]/g, (char) => (char === '<' ? '&lt;' : '&gt;'))
}

// Detect suspicious attack vectors (SQLi, NoSQL injection, XSS)
export function detectMaliciousPayload(input) {
  if (typeof input !== 'string') return { safe: true }
  const xssPattern = /<script|javascript:|onerror=|onload=|eval\(|document\.cookie/i
  const sqliPattern = /(\b(SELECT|UNION|INSERT|DELETE|DROP|ALTER|UPDATE)\b\s+.*\bFROM\b|--|;\s*DROP)/i
  const nosqlPattern = /(\$where|\$gt|\$ne|\$regex)/i

  if (xssPattern.test(input)) {
    return { safe: false, threat: 'XSS_INJECTION', matched: 'Cross-site scripting signature detected' }
  }
  if (sqliPattern.test(input)) {
    return { safe: false, threat: 'SQL_INJECTION', matched: 'SQL injection signature detected' }
  }
  if (nosqlPattern.test(input)) {
    return { safe: false, threat: 'NOSQL_INJECTION', matched: 'NoSQL operator injection signature detected' }
  }
  return { safe: true }
}

// Subscribe to real-time security logs
export function subscribeSecurityLogs(callback, maxLogs = 50) {
  const q = query(collection(db, 'security_logs'), orderBy('timestamp', 'desc'), limit(maxLogs))
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    callback(logs)
  }, () => {
    // Fallback to local logs on error
    try {
      const raw = localStorage.getItem('sofun_sec_fallback_logs')
      callback(raw ? JSON.parse(raw) : [])
    } catch {
      callback([])
    }
  })
}
