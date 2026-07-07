import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import ForecastPage from './pages/ForecastPage'
import MapPage from './pages/MapPage'
import ReportsPage from './pages/ReportsPage'
import BHWPage from './pages/BHWPage'
import SupervisorPage from './pages/SupervisorPage'
import UserManagementPage from './pages/UserManagementPage'
import AppShell from './components/AppShell'
import { canAccessRole, getAuthSession, getRoleHome } from './utils/auth'

function ShellPage({ children }) {
  return <AppShell>{children}</AppShell>
}

function ProtectedRoute({ allowedRoles = [], children }) {
  const session = getAuthSession()

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!canAccessRole(allowedRoles)) {
    return <Navigate to={getRoleHome(session.role)} replace />
  }

  return <ShellPage>{children}</ShellPage>
}

function HomeRedirect() {
  const session = getAuthSession()

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={getRoleHome(session.role)} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={['cho', 'supervisor', 'admin', 'viewer']}>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bhw"
        element={
          <ProtectedRoute allowedRoles={['bhw', 'cho', 'admin']}>
            <BHWPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/supervisor"
        element={
          <ProtectedRoute allowedRoles={['supervisor', 'cho', 'admin']}>
            <SupervisorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload"
        element={
          <ProtectedRoute allowedRoles={['cho', 'admin']}>
            <UploadPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/forecast"
        element={
          <ProtectedRoute allowedRoles={['cho', 'supervisor', 'admin']}>
            <ForecastPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/map"
        element={
          <ProtectedRoute allowedRoles={['cho', 'supervisor', 'bhw', 'admin', 'viewer']}>
            <MapPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/users"
        element={
          <ProtectedRoute allowedRoles={['cho', 'admin']}>
            <UserManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute allowedRoles={['cho', 'supervisor', 'bhw', 'admin', 'viewer']}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
