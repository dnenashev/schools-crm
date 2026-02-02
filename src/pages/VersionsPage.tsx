import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useApiUrl, authenticatedFetch } from '../config/api'
import { useAuth } from '../components/AuthProvider'
import type { Activity } from '../types/school'

const UNKNOWN_SCHOOL_ID = '__unknown_school__'

interface VersionInfo {
  filename?: string
  timestamp: string
  displayDate: string
  size?: number
  schoolsCount?: number
  userId: string | null
  userName: string | null
}

// Только внесения воронки/метрик без школы (для истории записей)
const isRecordActivity = (a: Activity) =>
  a.type === 'funnel_metrics' || a.type === 'numeric_metrics'

const recordTypeLabel = (type: Activity['type']): string => {
  if (type === 'funnel_metrics') return 'Воронка (количеством)'
  if (type === 'numeric_metrics') return 'Метрики'
  return type
}

const formatRecordDate = (dateStr: string): string => {
  if (!dateStr || dateStr.length < 10) return dateStr
  const [y, m, d] = dateStr.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

const VersionsPage = () => {
  const [recordActivities, setRecordActivities] = useState<Activity[]>([])
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const API_URL = useApiUrl()
  const { isAdmin } = useAuth()

  const loadSchools = async () => {
    try {
      const res = await fetch(`${API_URL}/schools`)
      const schools: { id: string; activities?: Activity[] }[] = await res.json()
      const unknown = schools.find(s => s.id === UNKNOWN_SCHOOL_ID)
      const activities = (unknown?.activities || [])
        .filter(isRecordActivity)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setRecordActivities(activities)
    } catch (e) {
      console.error('Error loading schools:', e)
      setRecordActivities([])
    }
  }

  const loadVersions = async () => {
    try {
      const versionsRes = await fetch(`${API_URL}/versions`)
      const versionsData: VersionInfo[] = await versionsRes.json()
      setVersions(versionsData)
    } catch (error) {
      console.error('Error loading versions:', error)
      setMessage({ type: 'error', text: 'Ошибка загрузки версий. Убедитесь, что сервер запущен.' })
    }
  }

  const loadData = async () => {
    setLoading(true)
    setMessage(null)
    await Promise.all([loadSchools(), loadVersions()])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [API_URL])

  // Удаление одной записи (активности «без школы»)
  const handleDeleteActivity = async (activityId: string) => {
    if (!isAdmin) return
    setDeletingActivityId(activityId)
    setMessage(null)
    try {
      const response = await authenticatedFetch(
        `${API_URL}/schools/${UNKNOWN_SCHOOL_ID}/activity/${activityId}`,
        { method: 'DELETE' }
      )
      const result = await response.json()
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Запись удалена' })
        await loadSchools()
      } else {
        setMessage({ type: 'error', text: result.error || 'Ошибка удаления' })
      }
    } catch (error) {
      console.error('Error deleting activity:', error)
      setMessage({ type: 'error', text: 'Ошибка удаления записи' })
    } finally {
      setDeletingActivityId(null)
    }
  }

  // Удаление последних N резервных копий
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
            Внесения воронки и метрик без привязки к школе. Ниже — резервные копии данных.
          </p>
        </div>

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

        {/* Записи воронки и метрик (без школы) */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <div className="px-6 py-4 bg-gray-100 border-b">
            <h2 className="font-semibold text-gray-900">
              Записи (воронка и метрики без школы) — {recordActivities.length}
            </h2>
          </div>
          {recordActivities.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              Нет записей воронки или метрик без привязки к школе.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {recordActivities.map((activity) => (
                <li key={activity.id} className="px-6 py-4 hover:bg-gray-50 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">
                      {recordTypeLabel(activity.type)}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {formatRecordDate(activity.date)}
                      {(activity.createdByName || activity.createdBy) && (
                        <span> • {activity.createdByName || activity.createdBy}</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500 mt-1 break-words">
                      {activity.description || (activity.metrics && (
                        `Метрики: ${Object.entries(activity.metrics)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')}`
                      ))}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteActivity(activity.id)}
                      disabled={deletingActivityId !== null}
                      className="shrink-0 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                    >
                      {deletingActivityId === activity.id ? 'Удаление...' : 'Удалить'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Резервные копии */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 bg-gray-100 border-b flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-900">
              Резервные копии ({versions.length})
            </h2>
            {isAdmin && versions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleDeleteLast(1)}
                  disabled={deleting !== null}
                  className="px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                >
                  {deleting === 1 ? '...' : 'Удалить последнюю копию'}
                </button>
                <button
                  onClick={() => handleDeleteLast(5)}
                  disabled={deleting !== null}
                  className="px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                >
                  {deleting === 5 ? '...' : 'Удалить последние 5'}
                </button>
              </div>
            )}
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
            <li><strong>Записи</strong> — внесения воронки и метрик «без школы». Можно удалить конкретную запись кнопкой «Удалить».</li>
            <li><strong>Резервные копии</strong> — создаются при сохранении данных; хранятся последние 50 версий.</li>
            <li>Восстановление копии безопасно — текущие данные сохраняются в бэкап перед откатом.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default VersionsPage
