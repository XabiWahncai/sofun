import { createContext, useContext, useState, useCallback } from 'react'
import PublicProfileModal from './components/PublicProfileModal'

const Ctx = createContext({ openProfile: () => {} })

export function UserProfileProvider({ children }) {
  const [uid, setUid] = useState(null)

  const openProfile = useCallback((u) => {
    if (!u) return
    setUid(u)
  }, [])

  return (
    <Ctx.Provider value={{ openProfile }}>
      {children}
      {uid && <PublicProfileModal uid={uid} onClose={() => setUid(null)} />}
    </Ctx.Provider>
  )
}

export function useOpenProfile() {
  return useContext(Ctx).openProfile
}
