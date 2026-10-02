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

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center',
          fontFamily: "'Sarabun', sans-serif",
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(198,36,25,0.1)',
            color: '#c62419',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            marginBottom: '16px',
          }}>
            <i className="fas fa-exclamation-triangle" />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px', color: '#1a1a1a' }}>
            เกิดข้อผิดพลาดในการแสดงผล POS
          </h2>
          <p style={{ fontSize: '13px', color: '#666', maxWidth: '380px', margin: '0 0 20px', lineHeight: 1.6 }}>
            {this.state.error?.message || 'ระบบเกิดข้อผิดพลาดชั่วคราว'}
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                background: '#c62419',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <i className="fas fa-redo" style={{ marginRight: '6px' }} /> โหลดใหม่อีกครั้ง
            </button>
            <button
              onClick={() => {
                try {
                  localStorage.removeItem('sofun_pos_sessions')
                  localStorage.removeItem('sofun_pos_active_id')
                } catch {}
                window.location.reload()
              }}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                background: 'rgba(0,0,0,0.06)',
                color: '#333',
                border: '1px solid rgba(0,0,0,0.12)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              รีเซ็ตแคช POS
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
