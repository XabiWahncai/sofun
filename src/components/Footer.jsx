import logoImg from '../assets/Logo.jpg'

const C = '#c62419'
const INK = '#1a1a1a'
const INK_LIGHT = 'rgba(255,255,255,0.75)'
const INK_DIM = 'rgba(255,255,255,0.5)'

const MAP_URL = 'https://maps.app.goo.gl/4opXQJmN2fkNRbHr7'
const MAP_EMBED =
  'https://www.google.com/maps/embed/v1/place?key=&q=SOFUN+CLUB+RCA+Bangkok&zoom=16'

export default function Footer() {
  return (
    <footer style={{
      background: INK, color: '#fff',
      fontFamily: "'Sarabun', sans-serif",
      padding: '48px 0 0',
      marginTop: 60,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        {/* Top grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 40,
          marginBottom: 36,
        }}>

          {/* Brand + about */}
          <div>
            <img src={logoImg} alt="SoFun Club"
              style={{ height: 56, width: 'auto', borderRadius: 8, marginBottom: 14 }} />
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-0.01em' }}>
              SOFUN CLUB <span style={{ color: C }}>RCA</span>
            </h3>
            <p style={{ margin: '10px 0 0', fontSize: 13, color: INK_LIGHT, lineHeight: 1.65 }}>
              Script Murder Platform เจ้าแรกในไทย — เกมสืบสวนสวมบทบาทที่คุณไม่เคยเจอมาก่อน
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <a href="https://instagram.com/sofunclub" target="_blank" rel="noopener noreferrer" title="Instagram @sofunclub"
                style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, textDecoration: 'none', transition: 'all 0.18s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e4405f'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                <i className="fab fa-instagram" />
              </a>
              <a href="https://line.me/R/ti/p/@sofunclub" target="_blank" rel="noopener noreferrer" title="LINE"
                style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, textDecoration: 'none', transition: 'all 0.18s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#06c755'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                <i className="fab fa-line" />
              </a>
              <a href="mailto:sofunclub.thailand@gmail.com" title="Email"
                style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, textDecoration: 'none', transition: 'all 0.18s' }}
                onMouseEnter={e => { e.currentTarget.style.background = C; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                <i className="fas fa-envelope" />
              </a>
            </div>
          </div>

          {/* Address */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: C, marginBottom: 14 }}>
              <i className="fas fa-location-dot" style={{ marginRight: 7 }} />ที่อยู่ร้าน
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: INK_LIGHT }}>
              21/81 ซอยศูนย์วิจัย<br />
              บางกะปิ, ห้วยขวาง<br />
              กรุงเทพฯ 10310
            </p>
            <a href={MAP_URL} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '9px 14px', borderRadius: 10, background: C, color: '#fff', fontSize: 12.5, fontWeight: 800, textDecoration: 'none', transition: 'all 0.18s', boxShadow: `0 4px 14px ${C}3f` }}
              onMouseEnter={e => { e.currentTarget.style.background = '#9a1c13'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = C; e.currentTarget.style.transform = 'translateY(0)' }}>
              <i className="fas fa-map-marked-alt" /> เปิดใน Google Maps
            </a>
          </div>

          {/* Contact */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: C, marginBottom: 14 }}>
              <i className="fas fa-phone" style={{ marginRight: 7 }} />ติดต่อ
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a href="tel:+66814661166" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none', fontSize: 13.5 }}>
                <i className="fas fa-phone" style={{ color: C, fontSize: 12, width: 16 }} />
                <span>
                  <span style={{ color: INK_DIM, fontSize: 10.5, display: 'block' }}>ไทย</span>
                  081-466-1166
                </span>
              </a>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
                <i className="fab fa-weixin" style={{ color: '#1aad19', fontSize: 14, width: 16 }} />
                <span>
                  <span style={{ color: INK_DIM, fontSize: 10.5, display: 'block' }}>WeChat · 中文服务</span>
                  <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>beihaidao1111</span>
                </span>
              </div>
              <a href="https://www.instagram.com/sofunclub.thailand/?hl=en" target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none', fontSize: 13.5 }}>
                <i className="fab fa-instagram" style={{ color: '#e4405f', fontSize: 14, width: 16 }} />
                <span>
                  <span style={{ color: INK_DIM, fontSize: 10.5, display: 'block' }}>Instagram</span>
                  @sofunclub
                </span>
              </a>
              <a href="mailto:sofunclub.thailand@gmail.com"
                style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none', fontSize: 13.5 }}>
                <i className="fas fa-envelope" style={{ color: C, fontSize: 12, width: 16 }} />
                <span>
                  <span style={{ color: INK_DIM, fontSize: 10.5, display: 'block' }}>Email</span>
                  <span style={{ fontSize: 12 }}>sofunclub.thailand@gmail.com</span>
                </span>
              </a>
            </div>
          </div>

          {/* Hours */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: C, marginBottom: 14 }}>
              <i className="fas fa-clock" style={{ marginRight: 7 }} />เวลาเปิดบริการ
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, color: INK_LIGHT }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>จันทร์ – พุธ</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>12:00 – 24:00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>พฤหัสบดี</span>
                <span style={{ color: C, fontWeight: 700 }}>ปิด</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>ศุกร์ – อาทิตย์</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>12:00 – 24:00</span>
              </div>
            </div>
          </div>
        </div>

        {/* Map embed */}
        <div style={{
          marginBottom: 32,
          borderRadius: 16, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)',
          height: 240,
          background: 'rgba(255,255,255,0.04)',
        }}>
          <iframe
            title="SoFun Club RCA map"
            src="https://maps.app.goo.gl/rcepAG2vr1wTaxFZA"
            width="100%" height="100%"
            style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) saturate(0.7)' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '20px 0 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 10,
          fontSize: 12, color: INK_DIM,
        }}>
          <span>© {new Date().getFullYear()} SoFun Club Thailand. All rights reserved.</span>
          <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span><i className="fas fa-heart" style={{ color: C, marginRight: 5 }} /> Script Murder</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Bangkok, Thailand</span>
          </span>
        </div>
      </div>
    </footer>
  )
}
