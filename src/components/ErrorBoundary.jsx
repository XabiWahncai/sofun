import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    try {
      localStorage.removeItem('sofun_pos_sessions')
      localStorage.removeItem('sofun_pos_active_id')
    } catch {}
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#0f172a',
          color: '#ffffff',
          fontFamily: "'Sarabun', -apple-system, sans-serif",
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(198, 36, 25, 0.15)',
            border: '2px solid #c62419',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: '28px', color: '#c62419' }} />
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px 0' }}>
            เกิดข้อผิดพลาดในการโหลดหน้านี้
          </h2>
          <p style={{
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.7)',
            maxWidth: '380px',
            lineHeight: 1.6,
            margin: '0 0 24px 0'
          }}>
            {this.state.error?.message || 'ระบบพบข้อผิดพลาดที่ไม่คาดคิด กรุณาลองรีเฟรชหน้าเว็บใหม่'}
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '12px 24px',
                borderRadius: '10px',
                background: '#c62419',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <i className="fas fa-redo" /> รีเฟรชหน้าเว็บ
            </button>
            <button
              onClick={this.handleReset}
              style={{
                padding: '12px 20px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <i className="fas fa-home" /> กลับหน้าหลัก
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
