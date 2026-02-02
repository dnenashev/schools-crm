import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useApiUrl, authenticatedFetch } from '../config/api'
import { useAuth } from '../components/AuthProvider'

interface VersionInfo {
  filename?: string
  timestamp: string
  displayDate: string
  size?: number
  schoolsCount?: number
  userId: string | null
  userName: string | null
}

const VersionsPage = () => {
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const API_URL = useApiUrl()
  const { isAdmin } = useAuth()

  // Загрузка данных
  const loadData = async () => {
    setLoading(true)
    try {
      const versionsRes = await fetch(`${API_URL}/versions`)
      const versionsData: VersionInfo[] = await versionsRes.json()
      setVersions(versionsData)
    } catch (error) {
      console.error('Error loading versions:', error)
      setMessage({ type: 'error', text: 'Ошибка загрузки версий. Убедитесь, что сервер запущен.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [API_URL])

  // Удаление последних N записей
  const handleDeleteLast = async (count: number) => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Удаление записей доступно только администраторам' })
      return
    }
    setDeleting(count)
    setMessage(null)
    try {
      const response = await authenticatedFetch(`${API_URL}/versions/last?count=${count}`, {
        method: 'DELETE'
      })
      const result = await response.json()
      if (result.success) {
        setMessage({ type: 'success', text: result.message || `Удалено записей: ${result.deleted}` })
        await loadData()
      } else {
        setMessage({ type: 'error', text: result.error || 'Ошибка удаления' })
      }
    } catch (error) {
      console.error('Error deleting last versions:', error)
      setMessage({ type: 'error', text: 'Ошибка удаления записей' })
    } finally {
      setDeleting(null)
    }
  }

  // Восстановление версии
  const handleRestore = async (version: string) => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Восстановление версий доступно только администраторам' })
      return
    }

    setRestoring(version)
    setMessage(null)

    try {
      const response = await authenticatedFetch(`${API_URL}/restore/${version}`, {
        method: 'POST'
      })

      const result = await response.json()

      if (result.success) {
        setMessage({ type: 'success', text: result.message })
        setConfirmRestore(null)
        // Перезагружаем данные
        await loadData()
      } else {
        setMessage({ type: 'error', text: result.error || 'Ошибка восстановления' })
      }
    } catch (error) {
      console.error('Error restoring version:', error)
      setMessage({ type: 'error', text: 'Ошибка восстановления версии' })
    } finally {
      setRestoring(null)
    }
  }

  // Форматирование размера файла
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Навигация */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            К дашборду
          </Link>
        </div>

        {/* Заголовок */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">История записей</h1>
          <p className="text-gray-600 mt-2">
            Здесь можно просмотреть все сохранённые версии данных, восстановить любую из них или удалить последние записи.
          </p>
        </div>

        {/* Удаление последних записей (только админ) */}
        {isAdmin && versions.length > 0 && (
          <div className="mb-6 p-4 bg-white rounded-lg shadow border border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Удалить последние записи</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleDeleteLast(1)}
                disabled={deleting !== null}
                className="px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50 transition-colors"
              >
                {deleting === 1 ? 'Удаление...' : 'Удалить последнюю запись'}
              </button>
              <button
                onClick={() => handleDeleteLast(5)}
                disabled={deleting !== null}
                className="px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50 transition-colors"
              >
                {deleting === 5 ? 'Удаление...' : 'Удалить последние 5 записей'}
              </button>
            </div>
          </div>
        )}

        {/* Сообщение */}
        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-100 text-green-800 border border-green-200'
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Список версий */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 bg-gray-100 border-b">
            <h2 className="font-semibold text-gray-900">
              Резервные копии ({versions.length})
            </h2>
          </div>

          {versions.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              Пока нет сохранённых версий. Версии создаются автоматически при сохранении данных.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {versions.map((version) => (
                <li key={version.timestamp} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {version.displayDate}
                      </p>
                      <p className="text-sm text-gray-500">
                        {version.size != null && `Размер: ${formatSize(version.size)}`}
                        {version.schoolsCount != null && `Школ: ${version.schoolsCount}`}
                        {version.userName && (
                          <span className="ml-2">
                            | Автор: <span className="font-medium">{version.userName}</span>
                          </span>
                        )}
                      </p>
                      {version.filename && (
                        <p className="text-xs text-gray-400 font-mono mt-1">
                          {version.filename}
                        </p>
                      )}
                    </div>

                    <div>
                      {isAdmin ? (
                        confirmRestore === version.timestamp ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRestore(version.timestamp)}
                              disabled={restoring !== null}
                              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {restoring === version.timestamp ? 'Восстановление...' : 'Подтвердить'}
                            </button>
                            <button
                              onClick={() => setConfirmRestore(null)}
                              disabled={restoring !== null}
                              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRestore(version.timestamp)}
                            className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                          >
                            Восстановить
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-gray-400 italic">
                          Только для администраторов
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Информация */}
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <h3 className="font-medium text-yellow-800 mb-2">Как это работает:</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>При каждом сохранении данных автоматически создаётся резервная копия</li>
            <li>Хранятся последние 50 версий</li>
            <li>При восстановлении текущие данные также сохраняются в бэкап</li>
            <li>Восстановление безопасно — вы всегда можете откатить обратно</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default VersionsPage
