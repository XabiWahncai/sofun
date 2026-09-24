import { createContext, useContext, useState } from 'react'
import { getT } from './lang'

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('sofun_lang') || 'th')

  const LANGS = ['th', 'en', 'zh']
  const toggle = () => {
    setLang(l => {
      const next = LANGS[(LANGS.indexOf(l) + 1) % LANGS.length]
      localStorage.setItem('sofun_lang', next)
      return next
    })
  }

  const t = (section, key) => getT(lang)(section, key)

  return (
    <LangContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
