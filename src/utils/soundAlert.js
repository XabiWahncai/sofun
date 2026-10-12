// Web Audio API sound alert for customer orders
// Plays pleasant ascending 4-tone chime every 5s when customer orders are pending
export const playOrderAlertSound = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    if (!window._posAudioCtx) {
      window._posAudioCtx = new AudioCtx()
    }
    const ctx = window._posAudioCtx
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime
    // 4-tone ascending bell chime: C5 (523.25) -> E5 (659.25) -> G5 (783.99) -> C6 (1046.50)
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
  } catch (e) {
    console.warn('Audio alert error:', e)
  }
}

export const unlockAudioContext = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (AudioCtx) {
      if (!window._posAudioCtx) window._posAudioCtx = new AudioCtx()
      if (window._posAudioCtx.state === 'suspended') window._posAudioCtx.resume().catch(() => {})
    }
  } catch {}
}
