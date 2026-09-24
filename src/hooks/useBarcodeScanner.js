import { useEffect, useRef } from 'react'

// Detects hardware barcode/QR scanner input (keyboard-wedge devices).
// Scanners emit characters very fast (<50ms apart) then send Enter.
// Human typing is much slower, so we use timing to distinguish them.
export default function useBarcodeScanner(onScan, enabled = true) {
  const bufferRef = useRef('')
  const lastKeyTime = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!enabled) return

    const CHAR_GAP_MS = 50   // max ms between scanner chars
    const RESET_MS   = 300  // clear buffer if gap exceeds this

    const handleKeydown = (e) => {
      // Ignore when user is typing in an input/textarea/select
      const tag = e.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      const now = Date.now()
      const gap = now - lastKeyTime.current
      lastKeyTime.current = now

      if (e.key === 'Enter') {
        const text = bufferRef.current.trim()
        bufferRef.current = ''
        if (text.length > 4) onScan(text)
        return
      }

      // If gap is too large, it's a new scan attempt — reset buffer
      if (gap > RESET_MS) {
        bufferRef.current = ''
      }

      // Only accumulate printable characters
      if (e.key.length === 1) {
        bufferRef.current += e.key
      }

      // Safety reset: clear buffer if no Enter received after 1s
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        bufferRef.current = ''
      }, 1000)
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      clearTimeout(timerRef.current)
    }
  }, [enabled, onScan])
}
