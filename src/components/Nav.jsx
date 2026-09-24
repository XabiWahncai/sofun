import { useState } from 'react'
import { useLang } from '../LangContext'
import logoImg from '../assets/Logo.jpg'

export default function Nav({ currentPage, showPage, lineUser, onLogin, onLogout, liffLoading, hasActiveOrder }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { lang, toggle, t } = useLang()

  const handleNav = (page) => {
    showPage(page)
    setUserMenuOpen(false)
  }

  return (
    <>
      {/* ── DESKTOP / TOP BAR ── */}
      <nav id="main-nav">
        <img
          src={logoImg}
          alt="SoFun Club"
          className="nav-logo-img"
          onClick={() => handleNav('home')}
        />

        {/* desktop links */}
        <div className="nav-links">
          <button className={`nav-btn${currentPage === 'home'   ? ' active' : ''}`} onClick={() => handleNav('home')}>
            {t('nav', 'home')}
          </button>
          <button className={`nav-btn${currentPage === 'games'  ? ' active' : ''}`} onClick={() => handleNav('games')}>
            {t('nav', 'scripts')}
          </button>
          <button className={`nav-btn${currentPage === 'party'  ? ' active' : ''}`} onClick={() => handleNav('party')}>
            <i className="fas fa-users" style={{ marginRight: '5px', fontSize: '11px' }} />{t('nav', 'party')}
          </button>
          <button className={`nav-btn${currentPage === 'booking' ? ' active' : ''}`} onClick={() => handleNav('booking')}>
            <i className="fas fa-calendar-check" style={{ marginRight: '5px', fontSize: '11px' }} />จอง
          </button>

          {/* Language toggle */}
          <button className="lang-toggle-btn" onClick={toggle} title="Switch language">
            <span className={lang === 'th' ? 'lang-active' : ''}>TH</span>
            <span className="lang-sep">|</span>
            <span className={lang === 'en' ? 'lang-active' : ''}>EN</span>
            <span className="lang-sep">|</span>
            <span className={lang === 'zh' ? 'lang-active' : ''}>中</span>
          </button>

          {lineUser ? (
            <div className="nav-user-wrap">
              <button className="nav-user-btn" onClick={() => setUserMenuOpen(o => !o)}>
                {lineUser.avatar
                  ? <img src={lineUser.avatar} alt="" className="nav-user-avatar" onError={e => e.currentTarget.style.display = 'none'} />
                  : <div className="nav-user-avatar-placeholder">{(lineUser.name || '?')[0]}</div>
                }
                <span className="nav-user-name">{lineUser.name}</span>
                <i className="fas fa-chevron-down" style={{ fontSize: '9px', marginLeft: '4px', opacity: 0.6 }} />
              </button>
              {userMenuOpen && (
                <div className="nav-user-menu">
                  <div className="nav-user-menu-info">
                    <div className="nav-user-menu-name">{lineUser.name}</div>
                    <div className="nav-user-menu-sub">{t('nav', 'lineMember')}</div>
                  </div>
                  <button className="nav-user-menu-item" onClick={() => handleNav('party')}>
                    <i className="fas fa-users" /> {t('nav', 'myParty')}
                  </button>
                  <button className="nav-user-menu-item logout" onClick={() => { onLogout(); setUserMenuOpen(false) }}>
                    <i className="fas fa-sign-out-alt" /> {t('nav', 'logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="nav-login-btn" onClick={onLogin} disabled={liffLoading}>
              {liffLoading
                ? <span className="spinner-sm" style={{ width: '12px', height: '12px', marginRight: '6px' }} />
                : <i className="fab fa-line" style={{ marginRight: '6px' }} />
              }
              {t('nav', 'login')}
            </button>
          )}

          {lineUser?.role === 'admin' && (
            <>
              <button className="nav-pos-btn" onClick={() => handleNav('pos')}>
                <i className="fas fa-cash-register" /> POS
              </button>
              <button className="nav-admin-btn" onClick={() => handleNav('random')} style={{ background: 'rgba(200,160,80,0.15)', borderColor: '#c8a050', color: '#c8a050' }}>
                <i className="fas fa-dharmachakra" /> วงล้อ
              </button>
              <button className="nav-admin-btn" onClick={() => handleNav('admin')}>
                ⚙ Admin
              </button>
            </>
          )}
        </div>

        {/* mobile top-right: login or avatar */}
        <div className="nav-mobile-right">
          {/* mobile lang toggle */}
          <button className="lang-toggle-btn lang-toggle-mobile" onClick={toggle}>
            {lang === 'th' ? 'EN' : lang === 'en' ? '中' : 'TH'}
          </button>

          {lineUser ? (
            <button className="nav-mobile-avatar-btn" onClick={() => setUserMenuOpen(o => !o)}>
              {lineUser.avatar
                ? <img src={lineUser.avatar} alt="" className="nav-user-avatar" onError={e => e.currentTarget.style.display = 'none'} />
                : <div className="nav-user-avatar-placeholder">{(lineUser.name || '?')[0]}</div>
              }
              {userMenuOpen && (
                <div className="nav-user-menu nav-user-menu-mobile">
                  <div className="nav-user-menu-info">
                    <div className="nav-user-menu-name">{lineUser.name}</div>
                    <div className="nav-user-menu-sub">{t('nav', 'lineMember')}</div>
                  </div>
                  <button className="nav-user-menu-item" onClick={() => handleNav('party')}>
                    <i className="fas fa-users" /> {t('nav', 'myParty')}
                  </button>
                  {lineUser?.role === 'admin' && (
                    <>
                      <button className="nav-user-menu-item" onClick={() => handleNav('random')}>
                        <i className="fas fa-dharmachakra" /> วงล้อสุ่ม (Lucky Wheel)
                      </button>
                      <button className="nav-user-menu-item" onClick={() => handleNav('admin')}>
                        <i className="fas fa-cog" /> Admin
                      </button>
                    </>
                  )}
                  <button className="nav-user-menu-item logout" onClick={() => { onLogout(); setUserMenuOpen(false) }}>
                    <i className="fas fa-sign-out-alt" /> {t('nav', 'logout')}
                  </button>
                </div>
              )}
            </button>
          ) : (
            <button className="nav-mobile-login-btn" onClick={onLogin} disabled={liffLoading}>
              {liffLoading
                ? <span className="spinner-sm" style={{ width: '14px', height: '14px' }} />
                : <><i className="fab fa-line" /> Login</>
              }
            </button>
          )}
        </div>
      </nav>

      {/* ── MOBILE BOTTOM TAB BAR ── */}
      <nav className="bottom-nav">
        <button className={`bottom-nav-item${currentPage === 'home'  ? ' active' : ''}`} onClick={() => handleNav('home')}>
          <i className="fas fa-home" />
          <span>{t('nav', 'home')}</span>
        </button>
        <button className={`bottom-nav-item${currentPage === 'games' ? ' active' : ''}`} onClick={() => handleNav('games')}>
          <i className="fas fa-scroll" />
          <span>{t('nav', 'scripts')}</span>
        </button>
        <button className={`bottom-nav-item${currentPage === 'party' ? ' active' : ''}`} onClick={() => handleNav('party')}>
          <i className="fas fa-users" />
          <span>{t('nav', 'party')}</span>
        </button>
        <button className={`bottom-nav-item${currentPage === 'booking' ? ' active' : ''}`} onClick={() => handleNav('booking')}>
          <i className="fas fa-calendar-check" />
          <span>จอง</span>
        </button>
        {lineUser && !hasActiveOrder && (
          <button className={`bottom-nav-item${currentPage === 'qr' ? ' active' : ''}`} onClick={() => handleNav('qr')}>
            <i className="fas fa-qrcode" />
            <span>QR</span>
          </button>
        )}
        {lineUser && hasActiveOrder && lineUser.role !== 'admin' && (
          <button className={`bottom-nav-item bottom-nav-order${currentPage === 'order' ? ' active' : ''}`} onClick={() => handleNav('order')}>
            <i className="fas fa-utensils" />
            <span>สั่งอาหาร</span>
          </button>
        )}
        {lineUser?.role === 'admin' && (
          <button className={`bottom-nav-item${currentPage === 'pos' ? ' active' : ''}`} onClick={() => handleNav('pos')}>
            <i className="fas fa-cash-register" />
            <span>POS</span>
          </button>
        )}
        {lineUser ? (
          <button className="bottom-nav-item bottom-nav-profile" onClick={() => handleNav('profile')}>
            {lineUser.avatar
              ? <img src={lineUser.avatar} alt="" className="bottom-nav-avatar" onError={e => { e.currentTarget.style.display='none' }} />
              : <i className="fas fa-user-circle" />
            }
            <span>{lang === 'th' ? 'โปรไฟล์' : 'Profile'}</span>
          </button>
        ) : (
          <button className="bottom-nav-item bottom-nav-login" onClick={onLogin} disabled={liffLoading}>
            {liffLoading
              ? <span className="spinner-sm" style={{ width: '18px', height: '18px' }} />
              : <i className="fab fa-line" />
            }
            <span>{lang === 'th' ? 'เข้าสู่ระบบ' : 'Login'}</span>
          </button>
        )}
      </nav>

      {userMenuOpen && <div className="nav-overlay" onClick={() => setUserMenuOpen(false)} />}
    </>
  )
}
