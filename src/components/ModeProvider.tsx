import { useState, ReactNode } from 'react'
import { ModeContext, AppMode, getSavedMode, saveMode, getApiUrl, isSandboxAvailable } from '../config/api'

interface ModeProviderProps {
  children: ReactNode
}

export const ModeProvider = ({ children }: ModeProviderProps) => {
  // In production (VITE_API_URL set), always use production mode
  const sandboxAvailable = isSandboxAvailable()
  const [mode, setModeState] = useState<AppMode>(() => {
    if (!sandboxAvailable) return 'production'
    return getSavedMode()
  })
  
  const setMode = (newMode: AppMode) => {
    // Don't allow sandbox mode in production
    if (newMode === 'sandbox' && !sandboxAvailable) {
      console.warn('Sandbox mode is not available in production')
      return
    }
    saveMode(newMode)
    setModeState(newMode)
  }

  const value = {
    mode,
    setMode,
    apiUrl: getApiUrl(mode),
    isSandbox: mode === 'sandbox' && sandboxAvailable
  }

  return (
    <ModeContext.Provider value={value}>
      {children}
    </ModeContext.Provider>
  )
}
