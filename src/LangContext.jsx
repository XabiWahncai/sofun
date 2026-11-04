import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getT } from './lang'

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sofun_lang') || 'th'
    }
    return 'th'
  })

  // Full-page automatic translation via Google Translate engine
  const applyGoogleTranslate = useCallback((targetLang) => {
    if (typeof window === 'undefined') return

    const googleTarget = targetLang === 'zh' ? 'zh-CN' : targetLang

    // Set or clear googtrans cookies across domain and path
    if (targetLang === 'th') {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      if (window.location.hostname !== 'localhost') {
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=' + window.location.hostname + '; path=/;'
      }
    } else {
      document.cookie = `googtrans=/th/${googleTarget}; path=/;`
      if (window.location.hostname !== 'localhost') {
        document.cookie = `googtrans=/th/${googleTarget}; domain=${window.location.hostname}; path=/;`
      }
    }

    const triggerCombo = () => {
      const select = document.querySelector('.goog-te-combo')
      if (select) {
        const val = targetLang === 'th' ? '' : googleTarget
        if (select.value !== val) {
          select.value = val
          select.dispatchEvent(new Event('change'))
        }
        return true
      }
      return false
    }

    if (!triggerCombo()) {
      let count = 0
      const timer = setInterval(() => {
        count++
        if (triggerCombo() || count > 25) {
          clearInterval(timer)
        }
      }, 250)
    }

    // When switching back to Thai from an active translation, reset cleanly
    if (targetLang === 'th') {
      const isTranslated = document.documentElement.classList.contains('translated-ltr') ||
                           document.documentElement.classList.contains('translated-rtl') ||
                           document.querySelector('.goog-te-banner-frame')
      if (isTranslated) {
        const select = document.querySelector('.goog-te-combo')
        if (select) {
          select.value = ''
          select.dispatchEvent(new Event('change'))
        }
        setTimeout(() => {
          window.location.reload()
        }, 120)
      }
    }
  }, [])

  const setLang = useCallback((newLang) => {
    setLangState(newLang)
    localStorage.setItem('sofun_lang', newLang)
    document.documentElement.lang = newLang
    applyGoogleTranslate(newLang)
  }, [applyGoogleTranslate])

  const LANGS = ['th', 'en', 'zh']
  const toggle = useCallback(() => {
    setLangState(current => {
      const next = LANGS[(LANGS.indexOf(current) + 1) % LANGS.length]
      localStorage.setItem('sofun_lang', next)
      document.documentElement.lang = next
      applyGoogleTranslate(next)
      return next
    })
  }, [applyGoogleTranslate])

  // Initial sync on mount if non-th language is stored
  useEffect(() => {
    const saved = localStorage.getItem('sofun_lang') || 'th'
    document.documentElement.lang = saved
    if (saved !== 'th') {
      applyGoogleTranslate(saved)
    }
  }, [applyGoogleTranslate])

  const t = (section, key) => getT(lang)(section, key)

  return (
    <LangContext.Provider value={{ lang, setLang, toggle, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
