import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
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
import { useData } from './context/DataContext'
import SystemPageSkeleton from './components/SystemSkeleton'

function AuthenticatedShell() {
  const session = getAuthSession()
  const location = useLocation()
  const {
    initialDataLoading = false,
    initialDataError = '',
    refreshAuthenticatedWorkspace,
  } = useData()

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return (
    <AppShell>
      {initialDataLoading ? (
        <SystemPageSkeleton pathname={location.pathname} />
      ) : initialDataError ? (
        <div className="space-y-4">
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 p-5 text-amber-900 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
            <p className="text-base font-black">Saved information could not be refreshed.</p>
            <p className="mt-2 text-sm font-semibold leading-6 opacity-80">{initialDataError}</p>
            <button
              type="button"
              onClick={() => refreshAuthenticatedWorkspace?.({ silent: true, initial: true, force: true })}
              className="mt-4 min-h-[44px] rounded-2xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-black text-amber-800 shadow-sm transition hover:-translate-y-0.5 dark:border-amber-300/20 dark:bg-slate-950 dark:text-amber-100"
            >
              Retry loading
            </button>
          </div>
          <Outlet />
        </div>
      ) : (
        <Outlet />
      )}
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

function PublicHome() {
  const session = getAuthSession()

  if (session) {
    return <Navigate to={getRoleHome(session.role)} replace />
  }

  return <LandingPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/login" element={<LoginPage />} />

      {/*
        Keep one AppShell mounted for the entire authenticated workspace.
        Route changes now replace only the page inside <Outlet />, so navbar,
        settings, notifications and their server state no longer remount/reload
        every time the user opens Forecast, Map, Reports, etc.
      */}
      <Route element={<AuthenticatedShell />}>
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
