import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
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

function AuthenticatedShell() {
  const session = getAuthSession()

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

function RoleRoute({ allowedRoles = [], children }) {
  const session = getAuthSession()

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!canAccessRole(allowedRoles)) {
    return <Navigate to={getRoleHome(session.role)} replace />
  }

  return children
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
      <Route path="/login" element={<LoginPage />} />

      {/*
        Keep one AppShell mounted for the entire authenticated workspace.
        Route changes now replace only the page inside <Outlet />, so navbar,
        settings, notifications and their server state no longer remount/reload
        every time the user opens Forecast, Map, Reports, etc.
      */}
      <Route element={<AuthenticatedShell />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/dashboard"
          element={
            <RoleRoute allowedRoles={['cho', 'supervisor', 'admin', 'viewer']}>
              <DashboardPage />
            </RoleRoute>
          }
        />
        <Route
          path="/bhw"
          element={
            <RoleRoute allowedRoles={['bhw', 'cho', 'admin']}>
              <BHWPage />
            </RoleRoute>
          }
        />
        <Route
          path="/supervisor"
          element={
            <RoleRoute allowedRoles={['supervisor', 'cho', 'admin']}>
              <SupervisorPage />
            </RoleRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <RoleRoute allowedRoles={['cho', 'admin']}>
              <UploadPage />
            </RoleRoute>
          }
        />
        <Route
          path="/forecast"
          element={
            <RoleRoute allowedRoles={['cho', 'supervisor', 'admin']}>
              <ForecastPage />
            </RoleRoute>
          }
        />
        <Route
          path="/map"
          element={
            <RoleRoute allowedRoles={['cho', 'supervisor', 'bhw', 'admin', 'viewer']}>
              <MapPage />
            </RoleRoute>
          }
        />
        <Route
          path="/users"
          element={
            <RoleRoute allowedRoles={['cho', 'admin']}>
              <UserManagementPage />
            </RoleRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <RoleRoute allowedRoles={['cho', 'supervisor', 'bhw', 'admin', 'viewer']}>
              <ReportsPage />
            </RoleRoute>
          }
        />
      </Route>
    </Routes>
  )
}
