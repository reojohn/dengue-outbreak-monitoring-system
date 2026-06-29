import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import ForecastPage from './pages/ForecastPage'
import MapPage from './pages/MapPage'
import ReportsPage from './pages/ReportsPage'
import AppShell from './components/AppShell'

function ShellPage({ children }) {
  return <AppShell>{children}</AppShell>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ShellPage>
            <DashboardPage />
          </ShellPage>
        }
      />
      <Route
        path="/upload"
        element={
          <ShellPage>
            <UploadPage />
          </ShellPage>
        }
      />
      <Route
        path="/forecast"
        element={
          <ShellPage>
            <ForecastPage />
          </ShellPage>
        }
      />
      <Route
        path="/map"
        element={
          <ShellPage>
            <MapPage />
          </ShellPage>
        }
      />
      <Route
        path="/reports"
        element={
          <ShellPage>
            <ReportsPage />
          </ShellPage>
        }
      />
    </Routes>
  )
}
