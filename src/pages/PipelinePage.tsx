import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PipelineMode, PIPELINE_MODES } from '../types/school'
import { useAuth } from '../components/AuthProvider'
import FillDataMode from '../components/pipeline/FillDataMode'
import ResolveUnknownMode from '../components/pipeline/ResolveUnknownMode'
import CallsMode from '../components/pipeline/CallsMode'
import MeetingsMode from '../components/pipeline/MeetingsMode'
import EventsMode from '../components/pipeline/EventsMode'
import PlansMode from '../components/pipeline/PlansMode'

const PipelinePage = () => {
  const [activeMode, setActiveMode] = useState<PipelineMode>('fill-data')
  const { isAdmin } = useAuth()
  const [searchParams] = useSearchParams()

  // Фильтруем режимы по правам доступа
  const visibleModes = PIPELINE_MODES.filter(mode => !mode.adminOnly || isAdmin)

  // Если пришли по deep-link (например, из /schools фильтра) — открываем нужный режим
  useEffect(() => {
    const requested = searchParams.get('mode') as PipelineMode | null
    if (!requested) return
    if (visibleModes.some(m => m.value === requested)) {
      setActiveMode(requested)
    }
  }, [searchParams, visibleModes])

  const renderActiveMode = () => {
    switch (activeMode) {
      case 'fill-data':
        return <FillDataMode />
      case 'resolve-unknown':
        return <ResolveUnknownMode />
      case 'calls':
        return <CallsMode />
      case 'meetings':
        return <MeetingsMode />
      case 'events':
        return <EventsMode />
      case 'plans':
        return <PlansMode />
      default:
        return <FillDataMode />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Верхняя навигация */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-4">
              <Link 
                to="/" 
                className="text-gray-600 hover:text-gray-800 flex items-center gap-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Дашборд
              </Link>
              <span className="text-gray-300">|</span>
              <h1 className="text-xl font-bold text-gray-900">Пайплайн работы</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <Link to="/schools" className="text-blue-600 hover:text-blue-800 text-sm">
                Все школы
              </Link>
            </div>
          </div>
          
          {/* Вкладки режимов */}
          <div className="flex gap-1 -mb-px">
            {visibleModes.map((mode) => (
              <button
                key={mode.value}
                onClick={() => setActiveMode(mode.value)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeMode === mode.value
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Контент активного режима */}
      <div className="container mx-auto px-4 py-6">
        {renderActiveMode()}
      </div>
    </div>
  )
}

export default PipelinePage
