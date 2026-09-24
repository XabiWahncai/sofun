import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

function parseUid(text) {
  try {
    const url = new URL(text.trim())
    const uid = url.searchParams.get('scan')
    return uid || text.trim() || null
  } catch {
    return text.trim() || null
  }
}

export default function QRScanner({ onScan, onClose }) {
  const scannerRef  = useRef(null)
  const startedRef  = useRef(false)
  const inputRef    = useRef(null)
  const [error, setError]     = useState(null)
  const [scanning, setScanning] = useState(false)

  // Auto-focus the barcode input so hardware scanner keystrokes land here
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200)
    return () => {
      clearTimeout(t)
      if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null }
    }
  }, [])

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setScanning(false)
  }

  // Uncontrolled input — read value from DOM at Enter/Tab time to avoid stale closure
  const handleBarcodeKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    e.preventDefault()
    const val = (inputRef.current?.value || '').trim()
    if (inputRef.current) inputRef.current.value = ''
    if (!val || startedRef.current) return
    startedRef.current = true
    const uid = parseUid(val)
    if (uid) {
      stopScanner()
      onScan(uid)
    } else {
      setError('QR ไม่ถูกต้อง')
      startedRef.current = false
    }
  }

  const startCameraScanner = async () => {
    setError(null)
    setScanning(true)
    startedRef.current = false
    try {
      const scanner = new Html5Qrcode('pos-qr-reader')
      scannerRef.current = scanner
      const cameraConfig = /Mobi|Android/i.test(navigator.userAgent)
        ? { facingMode: 'environment' } : { facingMode: 'user' }
      await scanner.start(
        cameraConfig,
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (text) => {
          if (startedRef.current) return
          startedRef.current = true
          await stopScanner()
          const uid = parseUid(text)
          if (uid) onScan(uid)
          else { setError('QR ไม่ใช่ของระบบ Sofun'); startedRef.current = false }
        },
        () => {}
      )
    } catch (e) {
      setError('ไม่สามารถเข้าถึงกล้อง: ' + e.message)
      setScanning(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pos-scanner-modal">
        <div className="pos-scanner-header">
          <span><i className="fas fa-qrcode" /> สแกนเพิ่มสมาชิก</span>
          <button className="modal-close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {/* Focused input — hardware barcode scanner types here directly */}
        <div className="psm-barcode-wrap" style={{ margin: '12px 16px 0' }}>
          <i className="fas fa-barcode psm-barcode-icon" />
          <input
            ref={inputRef}
            className="psm-barcode-input"
            placeholder="ชี้เครื่องแสกนที่นี่..."
            onKeyDown={handleBarcodeKeyDown}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div className="psm-divider" style={{ margin: '12px 16px' }}>
          <span>หรือสแกนด้วยกล้อง</span>
        </div>

        <div className="pos-scanner-viewer-wrap">
          <div id="pos-qr-reader" className="ascan-viewer" />
          {!scanning && (
            <div className="ascan-overlay-idle">
              <i className="fas fa-camera" />
              <span>กดปุ่มด้านล่างเพื่อเปิดกล้อง</span>
            </div>
          )}
          {scanning && (
            <div className="ascan-corners">
              <span className="ascan-corner tl" /><span className="ascan-corner tr" />
              <span className="ascan-corner bl" /><span className="ascan-corner br" />
              <div className="ascan-scan-line" />
            </div>
          )}
        </div>

        {error && (
          <div className="ascan-error" style={{ margin: '8px 16px' }}>
            <i className="fas fa-exclamation-circle" /> {error}
          </div>
        )}

        <div className="ascan-btn-row" style={{ padding: '0 16px 16px' }}>
          {!scanning
            ? <button className="ascan-start-btn" onClick={startCameraScanner}>
                <i className="fas fa-camera" /> เปิดกล้องสแกน
              </button>
            : <button className="ascan-stop-btn" onClick={stopScanner}>
                <i className="fas fa-stop" /> หยุดสแกน
              </button>
          }
        </div>
      </div>
    </div>
  )
}
