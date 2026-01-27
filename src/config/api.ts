import { createContext, useContext } from 'react'

// Типы режимов
export type AppMode = 'production' | 'sandbox'

// Порты для локальной разработки
const LOCAL_PORTS: Record<AppMode, number> = {
  production: 3001,
  sandbox: 3002
}

// Ключи для localStorage
const MODE_STORAGE_KEY = 'schools-crm-mode'
const TOKEN_STORAGE_KEY = 'schools-crm-token'

// Получить сохранённый режим из localStorage
export const getSavedMode = (): AppMode => {
  if (typeof window === 'undefined') return 'production'
  const saved = localStorage.getItem(MODE_STORAGE_KEY)
  return (saved === 'sandbox' || saved === 'production') ? saved : 'production'
}

// Сохранить режим в localStorage
export const saveMode = (mode: AppMode): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem(MODE_STORAGE_KEY, mode)
}

// Получить API URL для режима
// В production использует VITE_API_URL, для локальной разработки - localhost
export const getApiUrl = (mode: AppMode): string => {
  // Check for environment variable (set during build for production)
  const envApiUrl = import.meta.env.VITE_API_URL
  
  if (envApiUrl) {
    // In production, use the configured API URL
    // Sandbox mode is not available in production (only local development)
    return envApiUrl
  }
  
  // Local development: use localhost with port based on mode
  return `http://localhost:${LOCAL_PORTS[mode]}/api`
}

// Check if sandbox mode is available (only in local development)
export const isSandboxAvailable = (): boolean => {
  return !import.meta.env.VITE_API_URL
}

// Получить токен из localStorage
export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

// Контекст для режима
export interface ModeContextType {
  mode: AppMode
  setMode: (mode: AppMode) => void
  apiUrl: string
  isSandbox: boolean
}

export const ModeContext = createContext<ModeContextType | null>(null)

// Хук для использования контекста режима
export const useMode = (): ModeContextType => {
  const context = useContext(ModeContext)
  if (!context) {
    throw new Error('useMode must be used within a ModeProvider')
  }
  return context
}

// Хук для получения API URL (для компонентов, которые ещё не обновлены)
export const useApiUrl = (): string => {
  const { apiUrl } = useMode()
  return apiUrl
}

// Функция для выполнения авторизованных запросов
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = getAuthToken()
  
  const headers: HeadersInit = {
    ...options.headers,
    'Content-Type': 'application/json',
  }
  
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  })
  
  // Если получили 401, очищаем токен и перенаправляем на логин
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem('schools-crm-user')
    window.location.href = '/login'
  }
  
  return response
}
