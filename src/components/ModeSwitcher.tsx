import { useState } from 'react'
import { useMode, authenticatedFetch, isSandboxAvailable } from '../config/api'
import { useAuth } from './AuthProvider'

const ModeSwitcher = () => {
  const { mode, setMode, isSandbox, apiUrl } = useMode()
  const { isAdmin } = useAuth()
  const [clearing, setClearing] = useState(false)
  
  // Hide switcher in production (when VITE_API_URL is set)
  const sandboxAvailable = isSandboxAvailable()

  const handleToggle = () => {
    if (!sandboxAvailable) return
    const newMode = mode === 'production' ? 'sandbox' : 'production'
    setMode(newMode)
    // Перезагружаем страницу для переключения на новый API
    window.location.reload()
  }

  const handleClear = async () => {
    if (!isSandbox) {
      alert('Очистка доступна только в sandbox режиме')
      return
    }
    
    if (!isAdmin) {
      alert('Очистка данных доступна только администраторам')
      return
    }
    
    if (!confirm('Вы уверены, что хотите очистить все метрики и активности в sandbox? База школ сохранится. Это действие нельзя отменить.')) {
      return
    }
    
    setClearing(true)
    try {
      const url = `${apiUrl}/sandbox/clear`
      
      const res = await authenticatedFetch(url, {
        method: 'POST'
      })
      
      if (res.ok) {
        const data = await res.json()
        alert(data.message || 'Данные успешно очищены')
        window.location.reload()
      } else {
        let errorData
        try {
          const text = await res.text()
          errorData = JSON.parse(text)
        } catch (e) {
          errorData = { error: `HTTP ${res.status}: ${res.statusText}` }
        }
        
        if (res.status === 404) {
          alert(`Endpoint не найден (404).\n\nУбедитесь, что sandbox сервер запущен: npm run server:sandbox`)
        } else if (res.status === 403) {
          alert(`Доступ запрещен. Требуются права администратора.`)
        } else if (res.status === 401) {
          alert(`Необходима авторизация. Войдите в систему заново.`)
        } else {
          alert(`Ошибка при очистке данных: ${errorData.error || `HTTP ${res.status}`}`)
        }
      }
    } catch (error) {
      console.error('Error clearing sandbox:', error)
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
      
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        alert(`Не удалось подключиться к серверу.\n\nУбедитесь, что sandbox сервер запущен:\nnpm run server:sandbox`)
      } else {
        alert(`Ошибка при очистке данных: ${errorMessage}`)
      }
    } finally {
      setClearing(false)
    }
  }

  // Don't render anything in production (when sandbox is not available)
  if (!sandboxAvailable) {
    return null
  }

  return (
    <div className="flex items-center gap-3">
      {/* Индикатор режима */}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
        isSandbox 
          ? 'bg-orange-100 text-orange-800 border border-orange-300'
          : 'bg-green-100 text-green-800 border border-green-300'
      }`}>
        <span className={`w-2 h-2 rounded-full ${isSandbox ? 'bg-orange-500' : 'bg-green-500'}`} />
        {isSandbox ? 'Sandbox' : 'Production'}
      </div>

      {/* Кнопка очистки (только в sandbox и только для админов) */}
      {isSandbox && isAdmin && (
        <button
          onClick={handleClear}
          disabled={clearing}
          className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 border border-red-300 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Очистить все данные в sandbox"
        >
          {clearing ? 'Очистка...' : 'Очистить все'}
        </button>
      )}

      {/* Переключатель */}
      <button
        onClick={handleToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          isSandbox 
            ? 'bg-orange-500 focus:ring-orange-500' 
            : 'bg-green-500 focus:ring-green-500'
        }`}
        title={`Переключить на ${isSandbox ? 'Production' : 'Sandbox'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isSandbox ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

export default ModeSwitcher
