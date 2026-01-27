import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useMode } from '../config/api'

// Типы пользователя
export type UserRole = 'admin' | 'manager'

export interface User {
  id: string
  name: string
  role: UserRole
}

// Ключи для localStorage
const TOKEN_STORAGE_KEY = 'schools-crm-token'
const USER_STORAGE_KEY = 'schools-crm-user'

// Контекст авторизации
export interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isAdmin: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

// Получить сохранённый токен из localStorage
const getSavedToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

// Получить сохранённого пользователя из localStorage
const getSavedUser = (): User | null => {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem(USER_STORAGE_KEY)
  if (!saved) return null
  try {
    return JSON.parse(saved)
  } catch {
    return null
  }
}

// Сохранить токен в localStorage
const saveToken = (token: string | null): void => {
  if (typeof window === 'undefined') return
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

// Сохранить пользователя в localStorage
const saveUser = (user: User | null): void => {
  if (typeof window === 'undefined') return
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_STORAGE_KEY)
  }
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const { apiUrl } = useMode()
  const [user, setUser] = useState<User | null>(getSavedUser)
  const [token, setToken] = useState<string | null>(getSavedToken)
  const [loading, setLoading] = useState(true)

  // Проверяем токен при загрузке
  useEffect(() => {
    const verifyToken = async () => {
      const savedToken = getSavedToken()
      if (!savedToken) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${apiUrl}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${savedToken}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setUser(data.user)
          setToken(savedToken)
          saveUser(data.user)
        } else {
          // Токен недействителен
          setUser(null)
          setToken(null)
          saveToken(null)
          saveUser(null)
        }
      } catch (error) {
        console.error('Error verifying token:', error)
        // При ошибке сети оставляем сохранённые данные
      }
      
      setLoading(false)
    }

    verifyToken()
  }, [apiUrl])

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setUser(data.user)
        setToken(data.token)
        saveToken(data.token)
        saveUser(data.user)
        return { success: true }
      } else {
        return { success: false, error: data.error || 'Ошибка авторизации' }
      }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: 'Ошибка подключения к серверу' }
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    saveToken(null)
    saveUser(null)
  }

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isAdmin: user?.role === 'admin',
    login,
    logout,
    loading
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Хук для использования контекста авторизации
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
