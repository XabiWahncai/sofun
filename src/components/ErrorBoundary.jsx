import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, showDetails: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  componentDidUpdate(prevProps) {
    // Automatically recover when user switches page or route
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, showDetails: false })
    }
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null, showDetails: false })
    if (typeof this.props.onReset === 'function') {
      try {
        this.props.onReset()
      } catch {}
    }
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, showDetails: false })
    if (typeof this.props.onNavigateHome === 'function') {
      try {
        this.props.onNavigateHome()
        return
      } catch {}
    }
    window.location.href = '/'
  }

  handleClearCacheAndReload = () => {
    try {
      if (this.props.isPos || (this.props.title && this.props.title.includes('POS'))) {
        localStorage.removeItem('sofun_pos_sessions')
        localStorage.removeItem('sofun_pos_active_id')
      } else {
        localStorage.removeItem('sofun_cached_all_games')
        localStorage.removeItem('sofun_cached_promo_settings')
      }
    } catch {}
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const isPos = Boolean(this.props.isPos || (this.props.title && this.props.title.includes('POS')))

      return (
        <div style={{
          minHeight: this.props.isRoot ? '100vh' : '55vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '36px 20px',
          textAlign: 'center',
          fontFamily: "'Sarabun', sans-serif",
          boxSizing: 'border-box',
        }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: 'rgba(198,36,25,0.08)',
            color: '#c62419',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            marginBottom: '16px',
            boxShadow: '0 4px 12px rgba(198,36,25,0.12)',
          }}>
            <i className="fas fa-exclamation-triangle" />
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px', color: '#1a1a1a' }}>
            {this.props.title ? `เกิดข้อผิดพลาดในการแสดงผล ${this.props.title}` : 'เกิดข้อผิดพลาดชั่วคราวในหน้านี้'}
          </h2>

          <p style={{ fontSize: '14px', color: '#555', maxWidth: '420px', margin: '0 0 20px', lineHeight: 1.6 }}>
            ระบบพบปัญหาในการประมวลผลส่วนนี้ คุณสามารถลองโหลดใหม่ หรือสลับไปใช้งานเมนูอื่นได้ตามปกติ
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={this.handleTryAgain}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                background: '#c62419',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fas fa-redo" /> ลองใหม่อีกครั้ง
            </button>

            <button
              type="button"
              onClick={this.handleGoHome}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid rgba(26,26,26,0.15)',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fas fa-home" /> กลับหน้าหลัก
            </button>

            <button
              type="button"
              onClick={this.handleClearCacheAndReload}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                background: 'rgba(0,0,0,0.04)',
                color: '#444',
                border: '1px solid rgba(0,0,0,0.12)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fas fa-broom" /> {isPos ? 'รีเซ็ตแคช POS' : 'ล้างแคชและโหลดใหม่'}
            </button>
          </div>

          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                fontSize: '11px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {this.state.showDetails ? 'ซ่อนรายละเอียดข้อผิดพลาด' : 'แสดงรายละเอียดข้อผิดพลาด'}
            </button>

            {this.state.showDetails && (
              <pre style={{
                marginTop: '10px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#f8f9fa',
                border: '1px solid #e5e7eb',
                color: '#c62419',
                fontSize: '11px',
                maxWidth: '480px',
                overflowX: 'auto',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error?.stack || this.state.error?.message || 'Unknown error'}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
