import orderAlertUrl from '../assets/order-alert.mp3'

// Cached audio elements & buffer for zero-latency playback
let cachedAudioBuffer = null
let isFetchingBuffer = false
let audioElement = null

const getAudioElement = () => {
  if (typeof Audio === 'undefined') return null
  if (!audioElement) {
    audioElement = new Audio(orderAlertUrl)
    audioElement.preload = 'auto'
  }
  return audioElement
}

const getAudioContext = () => {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  if (!window._posAudioCtx) {
    window._posAudioCtx = new AudioCtx()
  }
  if (window._posAudioCtx.state === 'suspended') {
    window._posAudioCtx.resume().catch(() => {})
  }
  return window._posAudioCtx
}

// Pre-fetch and decode audio into Web Audio memory
const loadAudioBuffer = async () => {
  if (cachedAudioBuffer || isFetchingBuffer) return
  isFetchingBuffer = true
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const res = await fetch(orderAlertUrl)
    const arrayBuffer = await res.arrayBuffer()
    cachedAudioBuffer = await ctx.decodeAudioData(arrayBuffer)
  } catch (err) {
    console.warn('Preload order alert buffer notice:', err)
  } finally {
    isFetchingBuffer = false
  }
}

// Fallback chime in case audio file decoding/loading fails
const playFallbackChime = (ctx) => {
  try {
    if (!ctx) return
    const now = ctx.currentTime
    const notes = [
      { f: 523.25, t: 0,    d: 0.14 },
      { f: 659.25, t: 0.11, d: 0.14 },
      { f: 783.99, t: 0.22, d: 0.16 },
      { f: 1046.50, t: 0.35, d: 0.40 },
    ]
    notes.forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, now + t)
      gain.gain.setValueAtTime(0.001, now + t)
      gain.gain.linearRampToValueAtTime(0.28, now + t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + t)
      osc.stop(now + t + d + 0.05)
    })
  } catch {}
}

export const playOrderAlertSound = () => {
  try {
    const ctx = getAudioContext()

    // 1. Primary: Web Audio API with pre-decoded buffer (Instant, works in background tabs)
    if (ctx && cachedAudioBuffer) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      const source = ctx.createBufferSource()
      const gainNode = ctx.createGain()
      source.buffer = cachedAudioBuffer
      gainNode.gain.setValueAtTime(0.95, ctx.currentTime)
      source.connect(gainNode)
      gainNode.connect(ctx.destination)
      source.start(0)
      return
    }

    // If buffer not decoded yet, trigger decode in background for subsequent alerts
    if (ctx && !cachedAudioBuffer) {
      loadAudioBuffer().catch(() => {})
    }

    // 2. Secondary: HTMLAudioElement playback
    const audio = getAudioElement()
    if (audio) {
      audio.currentTime = 0
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio element play failed, trying fallback:', err)
          if (ctx) playFallbackChime(ctx)
        })
      }
      return
    }

    // 3. Tertiary: Fallback synthesizer chime
    if (ctx) {
      playFallbackChime(ctx)
    }
  } catch (e) {
    console.warn('Audio alert error:', e)
  }
}

export const unlockAudioContext = () => {
  try {
    const ctx = getAudioContext()
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
    const audio = getAudioElement()
    if (audio) {
      audio.load()
    }
    loadAudioBuffer().catch(() => {})
  } catch {}
}

// Initialize audio preload on script load in browser environment
if (typeof window !== 'undefined') {
  setTimeout(() => {
    loadAudioBuffer().catch(() => {})
  }, 1000)
}
