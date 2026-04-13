'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'

const LS_KEY = 'pib_selected_org'

interface OrgContextValue {
  orgId: string
  orgName: string
  setOrg: (id: string, name: string) => void
  clearOrg: () => void
}

const OrgContext = createContext<OrgContextValue>({
  orgId: '',
  orgName: '',
  setOrg: () => {},
  clearOrg: () => {},
})

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgId] = useState('')
  const [orgName, setOrgName] = useState('')

  // Rehydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { id: string; name: string }
        if (parsed.id) {
          setOrgId(parsed.id)
          setOrgName(parsed.name ?? '')
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }, [])

  const setOrg = useCallback((id: string, name: string) => {
    setOrgId(id)
    setOrgName(name)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ id, name }))
    } catch {
      // ignore storage errors
    }
  }, [])

  const clearOrg = useCallback(() => {
    setOrgId('')
    setOrgName('')
    try {
      localStorage.removeItem(LS_KEY)
    } catch {}
  }, [])

  return (
    <OrgContext.Provider value={{ orgId, orgName, setOrg, clearOrg }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg(): OrgContextValue {
  return useContext(OrgContext)
}
