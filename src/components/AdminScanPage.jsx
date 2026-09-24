import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import useBarcodeScanner from '../hooks/useBarcodeScanner'

export default function AdminScanPage({ lineUser, showToast, onScanSuccess, onOpenPOS }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [transitioning, setTransitioning] = useState(false)
  const scannerRef = useRef(null)
  const startedRef = useRef(false)

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setScanning(false)
  }

  const startScanner = async () => {
    setError(null)
    setScanning(true)
    startedRef.current = false

    try {
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner

      const cameraConfig = /Mobi|Android/i.test(navigator.userAgent)
        ? { facingMode: 'environment' }
        : { facingMode: 'user' }

      await scanner.start(
        cameraConfig,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (startedRef.current) return
          startedRef.current = true
          try {
            const url = new URL(decodedText)
            const uid = url.searchParams.get('scan')
            if (uid) {
              setTransitioning(true)
              // fully stop scanner before page transition
              await stopScanner()
              onScanSuccess?.(uid)
            } else {
              setError('QR code นี้ไม่ใช่ของระบบ Sofun')
              startedRef.current = false
            }
          } catch {
            setError('QR code ไม่ถูกต้อง')
            startedRef.current = false
          }
        },
        () => {}
      )
    } catch (e) {
      setScanning(false)
      setError('ไม่สามารถเข้าถึงกล้องได้: ' + e.message)
    }
  }

  const handleBarcodeScan = (text) => {
    if (startedRef.current) return
    startedRef.current = true
    try {
      const url = new URL(text)
      const uid = url.searchParams.get('scan')
      if (uid) {
        stopScanner()
        onScanSuccess?.(uid)
      } else {
        setError('บาร์โค้ดนี้ไม่ใช่ของระบบ Sofun')
        startedRef.current = false
      }
    } catch {
      // plain UID (not a URL)
      const uid = text.trim()
      if (uid) {
        stopScanner()
        onScanSuccess?.(uid)
      } else {
        setError('บาร์โค้ดไม่ถูกต้อง')
        startedRef.current = false
      }
    }
  }

  useBarcodeScanner(handleBarcodeScan, lineUser?.role === 'admin')

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [])

  if (lineUser?.role !== 'admin') {
    return (
      <div id="admin-scan-page" className="page active">
        <div className="qr-not-login">
          <i className="fas fa-lock" /><p>เฉพาะแอดมินเท่านั้น</p>
        </div>
      </div>
    )
  }

  if (transitioning) {
    return (
      <div id="admin-scan-page" className="page active">
        <div className="qr-not-login">
          <div className="spinner" style={{ width: 40, height: 40 }} />
          <p style={{ marginTop: 16, color: 'var(--text-tertiary)' }}>กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  return (
    <div id="admin-scan-page" className="page active">
      <div className="ascan-container">
        <div className="ascan-header">
          <i className="fas fa-qrcode" />
          <div>
            <div className="ascan-title">สแกน QR สมาชิก</div>
            <div className="ascan-sub">สแกนเพื่อเปิดหน้า POS จัดการออเดอร์</div>
          </div>
        </div>

        <div className="ascan-viewer-wrap">
          <div id="qr-reader" className="ascan-viewer" />
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

        {error && <div className="ascan-error"><i className="fas fa-exclamation-circle" /> {error}</div>}

        <div className="ascan-btn-row">
          {!scanning
            ? <button className="ascan-start-btn" onClick={startScanner}><i className="fas fa-camera" /> เปิดกล้องสแกน</button>
            : <button className="ascan-stop-btn" onClick={stopScanner}><i className="fas fa-stop" /> หยุดสแกน</button>
          }
        </div>

        <div className="ascan-hint">
          <i className="fas fa-info-circle" />
          ให้สมาชิกเปิดหน้า QR ในแอป แล้วนำกล้องมาสแกน
        </div>

        <div className="ascan-divider"><span>หรือ</span></div>

        <button className="ascan-pos-btn" onClick={onOpenPOS}>
          <i className="fas fa-cash-register" /> เปิดหน้า POS เลย
        </button>
      </div>
    </div>
  )
}
