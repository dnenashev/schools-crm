import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMode } from '../config/api'
import { useAuth } from './AuthProvider'
import ModeSwitcher from './ModeSwitcher'

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const { isSandbox } = useMode()
  const { user, isAdmin, logout } = useAuth()
  const location = useLocation()

  const navLinks = [
    { path: '/', label: 'Дашборд' },
    { path: '/pipeline', label: 'Пайплайн' },
    { path: '/calendar', label: 'Календарь' },
    { path: '/schools', label: 'Школы' },
    { path: '/photo-leads', label: 'Лиды по фото' },
    { path: '/versions', label: 'История записей', adminOnly: true },
  ]

  // Фильтруем ссылки для менеджеров (скрываем админские)
  const visibleLinks = navLinks.filter(link => !link.adminOnly || isAdmin)

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen">
      {/* Верхняя панель с переключателем режима */}
      <div className={`sticky top-0 z-50 ${isSandbox ? 'bg-orange-50 border-b border-orange-200' : 'bg-white border-b border-gray-200'}`}>
        <div className="container mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold text-gray-800">Schools CRM</span>
            {isSandbox && (
              <span className="text-xs text-orange-600 font-medium">
                (тестовый режим)
              </span>
            )}

            {/* Навигация */}
            <nav className="flex items-center gap-1">
              {visibleLinks.map(link => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    location.pathname === link.path
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <ModeSwitcher />

            {/* Информация о пользователе */}
            {user && (
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">{user.name}</div>
                  <div className="text-xs text-gray-500">
                    {user.role === 'admin' ? 'Администратор' : 'Менеджер'}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Выйти из системы"
                >
                  Выйти
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Предупреждение для sandbox */}
      {isSandbox && (
        <div className="bg-orange-100 border-b border-orange-300 px-4 py-2">
          <div className="container mx-auto text-center text-sm text-orange-800">
            Sandbox режим: изменения не влияют на реальные данные
          </div>
        </div>
      )}

      {/* Основной контент */}
      {children}
    </div>
  )
}

export default Layout
