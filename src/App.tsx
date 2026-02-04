import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ModeProvider } from './components/ModeProvider'
import { AuthProvider, useAuth } from './components/AuthProvider'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SchoolsPage from './pages/SchoolsPage'
import VersionsPage from './pages/VersionsPage'
import PipelinePage from './pages/PipelinePage'
import CalendarPage from './pages/CalendarPage'
import PhotoLeadsPage from './pages/PhotoLeadsPage'
import { ReactNode } from 'react'

// Компонент для защищённых маршрутов
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Компонент для страницы логина (редирект если уже авторизован)
function LoginRoute() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <LoginPage />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout>
            <DashboardPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/schools" element={
        <ProtectedRoute>
          <Layout>
            <SchoolsPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/versions" element={
        <ProtectedRoute>
          <Layout>
            <VersionsPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/pipeline" element={
        <ProtectedRoute>
          <Layout>
            <PipelinePage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/calendar" element={
        <ProtectedRoute>
          <Layout>
            <CalendarPage />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/photo-leads" element={
        <ProtectedRoute>
          <Layout>
            <PhotoLeadsPage />
          </Layout>
        </ProtectedRoute>
      } />
      </Routes>
  )
}

function App() {
  return (
    <ModeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ModeProvider>
  )
}

export default App
