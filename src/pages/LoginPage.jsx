import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Loader2,
  Fingerprint,
  Radar,
  UserCheck,
  LockKeyhole,
  Mail,
  Eye,
  EyeOff,
  Database,
  MapPinned,
  BarChart3,
  Sun,
  Moon,
  Building2,
} from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { loginUser } from '../services/api'
import { getAuthSession, getRoleHome } from '../utils/auth'
import dengueBackground from '../assets/dengue.png'
import denguePageBackground from '../assets/denguebg.png'
import loginButtonImage from '../assets/login1.png'

const items = [
  {
    title: 'Dengue File Check',
    description: 'Upload dengue records and let the system check them before making a forecast.',
    icon: Database,
  },
  {
    title: 'Dengue Forecast',
    description: 'Show expected dengue risk for each barangay using the latest records.',
    icon: BarChart3,
  },
  {
    title: 'Hotspot Map',
    description: 'Show priority barangays on the map so teams can respond faster.',
    icon: MapPinned,
  },
]

const demoAccounts = [
  {
    role: 'cho',
    label: 'City Health Office',
    email: 'cityhealth@butuan.gov.ph',
    description: 'Can upload files, review the dashboard, run forecasts, view maps, and create reports.',
  },
  {
    role: 'bhw',
    label: 'Barangay Health Worker',
    email: 'bhw@butuan.gov.ph',
    assignedBarangay: 'Baan KM 3',
    description: 'Can review assigned barangay alerts, hotspot status, and monitoring summaries.',
  },
  {
    role: 'supervisor',
    label: 'Supervisor',
    email: 'supervisor@butuan.gov.ph',
    description: 'Can review city-wide priority barangays, forecasts, maps, and reports for planning.',
  },
]

const scanStages = {
  0: {
    title: 'Ready to sign in',
    message: 'Select an account or enter registered credentials.',
  },
  1: {
    title: 'Preparing sign in...',
    message: 'Preparing the dengue monitoring access workflow.',
  },
  2: {
    title: 'Checking account...',
    message: 'Checking submitted email and password.',
  },
  3: {
    title: 'Checking user access...',
    message: 'Checking which pages this account can open.',
  },
  4: {
    title: 'Verified',
    message: 'Access approved. Opening your page.',
  },
}

const scanStepLabels = [
  {
    stage: 1,
    label: 'Initialize',
  },
  {
    stage: 2,
    label: 'Credentials',
  },
  {
    stage: 3,
    label: 'Role Check',
  },
  {
    stage: 4,
    label: 'Approved',
  },
]

const roleVisuals = {
  cho: {
    label: 'City Health Office',
    shortLabel: 'CHO',
    icon: Building2,
    glow: 'from-cyan-500 via-blue-600 to-indigo-700',
    iconColor: 'text-cyan-300',
    ring: 'border-cyan-400/30',
    bg: 'bg-cyan-500/10',
    badge: 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200',
  },
  bhw: {
    label: 'Barangay Health Worker',
    shortLabel: 'BHW',
    icon: UserCheck,
    glow: 'from-emerald-500 via-teal-600 to-cyan-700',
    iconColor: 'text-emerald-300',
    ring: 'border-emerald-400/30',
    bg: 'bg-emerald-500/10',
    badge: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
  },
  supervisor: {
    label: 'Supervisor',
    shortLabel: 'SUPERVISOR',
    icon: ShieldCheck,
    glow: 'from-blue-500 via-indigo-600 to-violet-700',
    iconColor: 'text-blue-300',
    ring: 'border-blue-400/30',
    bg: 'bg-blue-500/10',
    badge: 'border-blue-400/40 bg-blue-500/15 text-blue-200',
  },
  admin: {
    label: 'System Administrator',
    shortLabel: 'ADMIN',
    icon: ShieldCheck,
    glow: 'from-rose-500 via-pink-600 to-purple-700',
    iconColor: 'text-rose-300',
    ring: 'border-rose-400/30',
    bg: 'bg-rose-500/10',
    badge: 'border-rose-400/40 bg-rose-500/15 text-rose-200',
  },
  viewer: {
    label: 'Viewer',
    shortLabel: 'VIEWER',
    icon: Fingerprint,
    glow: 'from-cyan-500 via-blue-600 to-indigo-700',
    iconColor: 'text-cyan-300',
    ring: 'border-cyan-400/30',
    bg: 'bg-cyan-500/10',
    badge: 'border-slate-400/30 bg-white/10 text-slate-300',
  },
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function detectRoleFromUsername(value) {
  const key = String(value || '').trim().toLowerCase()

  if (key.includes('supervisor') || key.includes('coordinator')) return 'supervisor'
  if (key.includes('bhw') || key.includes('barangay')) return 'bhw'

  if (
    key.includes('cho') ||
    key.includes('cityhealth') ||
    key.includes('health') ||
    key.includes('butuan')
  ) {
    return 'cho'
  }

  return 'viewer'
}

function getRoleLabel(role) {
  return roleVisuals[role]?.label || roleVisuals.viewer.label
}

function getLoginButtonRoleLabel(role) {
  if (role === 'cho') return 'CHO'
  if (role === 'bhw') return 'BHW'
  if (role === 'supervisor') return 'Supervisor'
  return roleVisuals[role]?.shortLabel || getRoleLabel(role)
}

function getRoleBadgeStyle(role) {
  return roleVisuals[role]?.badge || roleVisuals.viewer.badge
}

function getRoleVisual(role) {
  return roleVisuals[role] || roleVisuals.viewer
}

export default function LoginPage() {
  const existingSession = getAuthSession()
  const navigate = useNavigate()
  const { addActivityLog, refreshAuthenticatedWorkspace, warmNavigationCache } = useData()

  const [selectedRole, setSelectedRole] = useState('cho')
  const [email, setEmail] = useState('cityhealth@butuan.gov.ph')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [scanStage, setScanStage] = useState(0)
  const [roleHint, setRoleHint] = useState('cho')
  const [theme, setTheme] = useState('dark')

  const selectedAccount = useMemo(() => {
    return demoAccounts.find((account) => account.role === selectedRole) || demoAccounts[0]
  }, [selectedRole])

  const detectedRole = useMemo(() => {
    return detectRoleFromUsername(email)
  }, [email])

  const currentScan = scanStages[scanStage] || scanStages[0]
  const currentRoleVisual = getRoleVisual(roleHint || selectedRole)
  const RoleIcon = currentRoleVisual.icon

  if (existingSession) {
    return <Navigate to={getRoleHome(existingSession.role)} replace />
  }

  const displayIcon =
    scanStage === 4
      ? CheckCircle2
      : isSigningIn
        ? Fingerprint
        : RoleIcon

  const DisplayIcon = displayIcon

  const roleTheme = currentRoleVisual.glow
  const progressWidth = `${Math.max(18, scanStage * 25)}%`

  function handleSelectAccount(account) {
    if (isSigningIn) return

    setSelectedRole(account.role)
    setRoleHint(account.role)
    setEmail(account.email)
    setPassword('')
    setError('')
    setScanStage(0)
  }

  function handleEmailChange(event) {
    const value = event.target.value
    const role = detectRoleFromUsername(value)

    setEmail(value)
    setRoleHint(role)
    setError('')

    if (demoAccounts.some((account) => account.role === role)) {
      setSelectedRole(role)
    }
  }

  async function handleSubmit(event) {
  event.preventDefault()

  if (isSigningIn) return

  setError('')
  setIsSigningIn(true)
  setScanStage(1)

  try {
    const detected = detectRoleFromUsername(email)
    setRoleHint(detected)

    await wait(350)

    setScanStage(2)

    const loginResult = await loginUser({
      email: email.trim(),
      password,
    })

    await wait(350)

    setScanStage(3)
    await wait(350)

    const authenticatedUser = loginResult?.user

    if (!authenticatedUser?.role || !loginResult?.access_token) {
      throw new Error('Login succeeded, but the server did not return a complete session.')
    }

    const matchedAccount = demoAccounts.find((account) => account.role === authenticatedUser.role)
    const displayName = authenticatedUser.full_name || matchedAccount?.label || authenticatedUser.email

    setSelectedRole(authenticatedUser.role)
    setRoleHint(authenticatedUser.role)
    setScanStage(4)

    const session = {
      isAuthenticated: true,
      userId: authenticatedUser.id,
      role: authenticatedUser.role,
      label: displayName,
      email: authenticatedUser.email,
      assignedBarangay: authenticatedUser.assigned_barangay || authenticatedUser.assignedBarangay || '',
      accessToken: loginResult.access_token,
      tokenType: loginResult.token_type || 'bearer',
      expiresAt: loginResult.expires_at || '',
      session_id: loginResult.session_id || '',
      loginTime: new Date().toISOString(),
    }

    await wait(450)

    localStorage.setItem('dengue-auth-session', JSON.stringify(session))

    addActivityLog(
      'User signed in',
      `${displayName} accessed the dengue monitoring system.`
    )

    // DataProvider is already mounted on the login page. Its protected
    // database requests therefore ran before a token existed. Refresh the
    // small persisted state now that authentication is available so the
    // dashboard and Forecast workflow status are correct without a manual
    // browser refresh.
    // Start restoring the small saved workspace immediately, but do not keep
    // the user waiting on the login screen. The authenticated route shows a
    // page-shaped skeleton until this first refresh is ready.
    const initialRefreshPromise = Promise.resolve(
      refreshAuthenticatedWorkspace?.({ silent: true, initial: true })
    )

    navigate(getRoleHome(authenticatedUser.role), { replace: true })

    // Warm shared route data after the first refresh. These session-only
    // caches let Forecast, Map and Reports reuse data on later navigation
    // instead of replaying the initial loading state.
    initialRefreshPromise.finally(() => {
      window.setTimeout(() => {
        Promise.resolve(
          warmNavigationCache?.({ role: authenticatedUser.role })
        ).catch(() => {})
      }, 0)
    })
  } catch (loginError) {
    setError(loginError.message || 'Login failed. Please try again.')
    setScanStage(0)
    setIsSigningIn(false)
  }
}

  return (
    <div
      className="dengue-login-page relative flex min-h-screen items-center justify-center overflow-hidden bg-[#061426] p-4 transition-colors duration-300 sm:p-6"
      style={{
        backgroundImage: `url(${denguePageBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Clean readability treatment over denguebg.png.
          The image stays visible while the login card remains easy to read. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,8,23,0.68)_0%,rgba(2,12,30,0.52)_38%,rgba(3,15,35,0.42)_62%,rgba(2,8,23,0.62)_100%)]" />
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          theme === 'dark'
            ? 'bg-slate-950/18'
            : 'bg-slate-950/8'
        }`}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_0%,rgba(2,8,23,0.06)_42%,rgba(2,8,23,0.42)_100%)]" />

      <div
        className={`pointer-events-none absolute inset-0 animate-gradient bg-gradient-to-br ${roleTheme} opacity-[0.07]`}
      />

      {isSigningIn && (
        <section
          className="absolute inset-0 z-[70] flex min-h-screen overflow-y-auto text-white lg:hidden"
          style={{
            backgroundImage: `url(${dengueBackground})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
          }}
          aria-live="polite"
          aria-busy="true"
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,13,33,0.34)_0%,rgba(2,19,46,0.48)_32%,rgba(2,18,45,0.74)_72%,rgba(1,8,23,0.92)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(34,211,238,0.13),transparent_31%),radial-gradient(circle_at_50%_78%,rgba(37,99,235,0.14),transparent_40%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.09)_1px,transparent_1px)] bg-[size:18px_18px] opacity-45" />

          <div className="relative z-10 flex min-h-screen w-full flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.35rem,env(safe-area-inset-top))]">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/35 bg-slate-950/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] text-cyan-100 shadow-[0_12px_32px_rgba(2,6,23,0.38)] backdrop-blur-md">
              <Radar className="h-3.5 w-3.5" />
              Secure Access
            </div>

            <div className="flex flex-1 flex-col items-center justify-center py-6">
              <div
                className={`relative flex h-40 w-40 items-center justify-center rounded-full border ${currentRoleVisual.ring} ${currentRoleVisual.bg} bg-slate-950/35 shadow-[0_0_68px_rgba(34,211,238,0.22),0_20px_46px_rgba(2,6,23,0.40)] backdrop-blur-sm`}
              >
                <div className={`absolute inset-4 rounded-full border ${currentRoleVisual.ring}`} />
                <div className={`absolute inset-8 rounded-full border ${currentRoleVisual.ring}`} />
                <div className={`absolute inset-0 rounded-full border-2 ${currentRoleVisual.ring} animate-ping`} />
                <div className="absolute h-[88%] w-1 bg-gradient-to-b from-transparent via-cyan-300/80 to-transparent animate-scanLine" />

                <DisplayIcon
                  className={`relative z-10 h-[78px] w-[78px] transition-all duration-300 ${
                    scanStage === 4
                      ? 'text-emerald-300 animate-pop'
                      : 'text-cyan-300 animate-pulse'
                  }`}
                  strokeWidth={1.65}
                />
              </div>

              <div
                className={`mt-6 max-w-[92vw] rounded-full border px-4 py-2 text-center text-[11px] font-medium shadow-[0_12px_30px_rgba(2,6,23,0.35)] backdrop-blur-md ${getRoleBadgeStyle(roleHint)}`}
              >
                SELECTED ROLE:{' '}
                <b>{getRoleLabel(roleHint).toUpperCase()}</b>
              </div>

              <div className="mt-5 w-full max-w-sm overflow-hidden rounded-[26px] border border-cyan-400/25 bg-slate-950/68 p-4 text-center shadow-[0_28px_80px_rgba(0,0,0,0.42)] ring-1 ring-white/5 backdrop-blur-xl">
                <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.15em] text-cyan-100">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      scanStage === 4
                        ? 'bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]'
                        : 'bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.9)] animate-pulse'
                    }`}
                  />
                  Access Verification
                </div>

                <h2 className="text-lg font-black leading-tight text-white">
                  {currentScan.title}
                </h2>

                <p className="mx-auto mt-2 max-w-[280px] text-[12px] leading-5 text-slate-300">
                  {currentScan.message}
                </p>

                <div className="mt-4 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      scanStage === 4
                        ? 'bg-gradient-to-r from-emerald-300 to-cyan-300'
                        : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                    }`}
                    style={{ width: progressWidth }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-4 gap-1.5">
                  {scanStepLabels.map((step) => (
                    <div
                      key={`mobile-${step.stage}`}
                      className={`min-w-0 rounded-xl border px-1 py-2 text-center transition-all duration-300 ${
                        scanStage >= step.stage
                          ? scanStage === 4
                            ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                            : 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200'
                          : 'border-white/10 bg-white/[0.03] text-slate-500'
                      }`}
                    >
                      <div
                        className={`mx-auto mb-1 h-1.5 w-1.5 rounded-full ${
                          scanStage >= step.stage
                            ? scanStage === 4
                              ? 'bg-emerald-300'
                              : 'bg-cyan-300'
                            : 'bg-slate-600'
                        }`}
                      />
                      <p className="truncate text-[8px] font-black uppercase tracking-[0.035em]">
                        {step.label}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-[18px] border border-cyan-400/20 bg-slate-950/45 p-3 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan-300">
                        Verified Access Level
                      </p>
                      <p className="mt-1 truncate text-[12px] font-bold text-white">
                        {getRoleLabel(roleHint)}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${getRoleBadgeStyle(roleHint)}`}
                    >
                      {currentRoleVisual.shortLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        className="absolute right-5 top-5 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-lg backdrop-blur-xl transition hover:bg-white/15"
        aria-label="Toggle login theme"
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="relative grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-[34px] border border-white/15 bg-slate-950/25 shadow-[0_32px_100px_rgba(2,6,23,0.48)] ring-1 ring-white/5 backdrop-blur-xl animate-slideIn lg:grid-cols-[1.05fr_0.95fr]">
        <section
          className="relative hidden min-h-[690px] flex-col justify-center overflow-hidden p-10 text-white lg:flex xl:p-12"
          style={{
            backgroundImage: `url(${dengueBackground})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,12,30,0.34)_0%,rgba(3,17,43,0.48)_30%,rgba(4,20,50,0.68)_68%,rgba(2,8,23,0.86)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(34,211,238,0.10),transparent_34%),radial-gradient(circle_at_50%_78%,rgba(37,99,235,0.12),transparent_38%)]" />
          <div className="pointer-events-none absolute inset-0 bg-slate-950/10" />

          {scanStage > 0 && (
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.16)_1px,transparent_1px)] bg-[size:18px_18px] opacity-25 animate-pulse" />
          )}

          <div className="absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-slate-950/45 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_10px_28px_rgba(2,6,23,0.24)] backdrop-blur-md">
              <Radar className="h-3.5 w-3.5" />
              Secure Access
            </div>

            <div className="mt-8 flex justify-center">
              <div
                className={`relative flex h-52 w-52 items-center justify-center rounded-full border ${currentRoleVisual.ring} ${currentRoleVisual.bg} bg-slate-950/28 shadow-[0_0_70px_rgba(34,211,238,0.18),0_18px_42px_rgba(2,6,23,0.34)] backdrop-blur-sm transition-all duration-300`}
              >
                <div className={`absolute inset-4 rounded-full border ${currentRoleVisual.ring}`} />
                <div className={`absolute inset-8 rounded-full border ${currentRoleVisual.ring}`} />

                {!isSigningIn && scanStage === 0 && (
                  <div className="absolute -bottom-4 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white backdrop-blur">
                    {currentRoleVisual.shortLabel} Access
                  </div>
                )}

                {scanStage > 0 && (
                  <>
                    <div className={`absolute inset-0 rounded-full border-2 ${currentRoleVisual.ring} animate-ping`} />
                    <div className="absolute h-full w-1 bg-gradient-to-b from-transparent via-cyan-300/70 to-transparent animate-scanLine" />
                  </>
                )}

                <DisplayIcon
                  className={`relative z-10 h-24 w-24 transition-all duration-300 ${
                    scanStage === 4
                      ? 'text-emerald-300 animate-pop'
                      : isSigningIn
                        ? 'text-cyan-300 animate-pulse'
                        : currentRoleVisual.iconColor
                  }`}
                  strokeWidth={1.7}
                />
              </div>
            </div>

            {!isSigningIn && (
              <>
                <h1 className="mt-8 text-center text-4xl font-black leading-tight tracking-tight text-white drop-shadow-[0_5px_20px_rgba(2,6,23,0.95)] xl:text-[46px]">
                  Barangay-Level Dengue Outbreak Response System
                </h1>

                <p className="mx-auto mt-5 max-w-md text-center text-base font-medium leading-8 text-slate-100 drop-shadow-[0_3px_12px_rgba(2,6,23,0.95)]">
                  Secure access for dengue data upload, predictive forecasting, GIS hotspot mapping, decision support, and response coordination.
                </p>
              </>
            )}

            {!isSigningIn && (
              <div className="mt-8 grid gap-3">
                {items.map((item) => {
                  const Icon = item.icon

                  return (
                    <div
                      key={item.title}
                      className="rounded-[24px] border border-cyan-300/15 bg-slate-950/48 p-4 shadow-[0_16px_42px_rgba(2,6,23,0.28)] ring-1 ring-white/5 backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-slate-950/58"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div>
                          <p className="text-sm font-bold text-white">
                            {item.title}
                          </p>

                          <p className="mt-1 text-sm leading-6 text-slate-200/85">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {roleHint && (
              <div
                className={`mx-auto mt-7 w-fit rounded-full border px-4 py-2 text-sm shadow-[0_12px_30px_rgba(2,6,23,0.32)] backdrop-blur-md animate-fade ${getRoleBadgeStyle(roleHint)}`}
              >
                SELECTED ROLE:{' '}
                <b>{getRoleLabel(roleHint).toUpperCase()}</b>
              </div>
            )}

            {isSigningIn && (
              <div className="mx-auto mt-7 w-full max-w-md animate-fade">
                <div className="relative overflow-hidden rounded-[30px] border border-cyan-400/20 bg-slate-950/45 p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-cyan-400/20 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-16 left-0 h-36 w-36 rounded-full bg-blue-500/20 blur-3xl" />

                  <div className="relative mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        scanStage === 4
                          ? 'bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]'
                          : 'bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.9)] animate-pulse'
                      }`}
                    />
                    Access Verification
                  </div>

                  <h3 className="relative text-xl font-black text-white">
                    {currentScan.title}
                  </h3>

                  <p className="relative mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-300">
                    {currentScan.message}
                  </p>

                  <div className="relative mt-5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        scanStage === 4
                          ? 'bg-gradient-to-r from-emerald-300 to-cyan-300'
                          : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                      }`}
                      style={{ width: progressWidth }}
                    />
                  </div>

                  <div className="relative mt-5 grid grid-cols-4 gap-2">
                    {scanStepLabels.map((step) => (
                      <div
                        key={step.stage}
                        className={`rounded-2xl border px-2 py-2 text-center transition-all duration-300 ${
                          scanStage >= step.stage
                            ? scanStage === 4
                              ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                              : 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200'
                            : 'border-white/10 bg-white/[0.03] text-slate-500'
                        }`}
                      >
                        <div
                          className={`mx-auto mb-1 h-1.5 w-1.5 rounded-full ${
                            scanStage >= step.stage
                              ? scanStage === 4
                                ? 'bg-emerald-300'
                                : 'bg-cyan-300'
                              : 'bg-slate-600'
                          }`}
                        />

                        <p className="text-[10px] font-bold uppercase tracking-[0.08em]">
                          {step.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="relative mt-5 rounded-[22px] border border-cyan-400/20 bg-slate-950/35 p-4 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                          Verified Access Level
                        </p>

                        <p className="mt-1 text-sm font-bold text-white">
                          {getRoleLabel(roleHint)}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${getRoleBadgeStyle(roleHint)}`}
                      >
                        {currentRoleVisual.shortLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[690px] items-center justify-center bg-slate-950/38 p-5 backdrop-blur-xl sm:p-7 lg:p-10">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-[30px] border border-white/12 bg-slate-900/58 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.38)] ring-1 ring-white/5 backdrop-blur-2xl sm:p-8"
          >
            <div className="mb-7 text-center">
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[22px] border ${currentRoleVisual.ring} ${currentRoleVisual.bg} ${currentRoleVisual.iconColor}`}
              >
                <RoleIcon className="h-7 w-7" />
              </div>

              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                Secure Access
              </p>

              <h2 className="mt-3 text-3xl font-black text-white">
                Welcome Back
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Sign in to continue to the dengue monitoring dashboard.
              </p>
            </div>

            <div className="mb-5 rounded-[22px] border border-cyan-400/20 bg-cyan-500/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                    Auto Role Detection
                  </p>

                  <p className="mt-1 text-sm font-bold text-white">
                    {getRoleLabel(detectedRole)}
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${getRoleBadgeStyle(detectedRole)}`}
                >
                  {getRoleVisual(detectedRole).shortLabel}
                </span>
              </div>
            </div>

            <div className="mb-5 grid gap-3">
              {demoAccounts.map((account) => {
                const accountVisual = getRoleVisual(account.role)
                const AccountIcon = accountVisual.icon

                return (
                  <button
                    key={account.role}
                    type="button"
                    onClick={() => handleSelectAccount(account)}
                    disabled={isSigningIn}
                    className={`login-role-card rounded-[20px] border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${
                      selectedRole === account.role
                        ? `login-role-card-selected ${accountVisual.ring} ${accountVisual.bg} shadow-[0_0_24px_rgba(34,211,238,0.12)]`
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${accountVisual.ring} ${accountVisual.bg} ${accountVisual.iconColor}`}
                        >
                          <AccountIcon className="h-4.5 w-4.5" />
                        </div>

                        <p className="text-sm font-bold text-white">
                          {account.label}
                        </p>
                      </div>

                      {selectedRole === account.role && (
                        <span className="rounded-full bg-cyan-400 px-3 py-1 text-[11px] font-black text-slate-950">
                          Selected
                        </span>
                      )}
                    </div>

                    <p className="login-role-description mt-2 text-xs leading-5 text-slate-400">
                      {account.description}
                    </p>
                  </button>
                )
              })}
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-500/20 px-4 py-3 text-sm leading-6 text-red-100 animate-shake">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="relative mb-4">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />

              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 p-3.5 pl-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-70"
                value={email}
                onChange={handleEmailChange}
                placeholder="Email or username"
                disabled={isSigningIn}
              />
            </div>

            <div className="relative">
              <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />

              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 p-3.5 pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-70"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError('')
                }}
                placeholder="Password"
                disabled={isSigningIn}
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                disabled={isSigningIn}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-white disabled:cursor-not-allowed"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={isSigningIn}
              className="group relative mt-4 flex h-[108px] w-full items-center justify-center overflow-visible bg-transparent px-5 text-sm font-black text-white transition-all duration-200 hover:scale-[1.015] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-75 sm:h-[116px]"
              aria-label={`Login as ${getLoginButtonRoleLabel(selectedRole)}`}
            >
              <img
                src={loginButtonImage}
                alt=""
                aria-hidden="true"
                draggable="false"
                className="pointer-events-none absolute left-1/2 top-1/2 h-[138%] w-[104%] -translate-x-1/2 -translate-y-1/2 select-none object-fill drop-shadow-[0_16px_32px_rgba(34,211,238,0.28)] transition-transform duration-200 group-hover:scale-[1.02]"
              />

              <span className="relative z-10 flex items-center justify-center gap-2 pt-[1px] text-[14px] font-black tracking-[0.02em] text-white drop-shadow-[0_0_9px_rgba(34,211,238,0.98)] sm:text-[15px]">
                {isSigningIn ? (
                  <>
                    <Loader2 className="animate-spin" size={17} />
                    Scanning...
                  </>
                ) : (
                  <>
                    Login as {getLoginButtonRoleLabel(selectedRole)}
                    <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" size={16} />
                  </>
                )}
              </span>
            </button>

            <details className="login-mobile-access-details mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:hidden">
              <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-[0.14em] text-slate-300">
                Account & access information
              </summary>
              <div className="mt-2 space-y-2 text-xs leading-5 text-slate-400">
                <p>Use an account created in User Management. Role cards only help fill the expected email format. Passwords are not stored or shown in the browser.</p>
                <p>Role-based access separates City Health Office, Barangay Health Worker, and Supervisor workflows.</p>
              </div>
            </details>

            <div className="login-access-note mt-5 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Account Access
              </p>

              <p className="mt-2 break-words text-xs leading-5 text-slate-400">
                Use an account created in User Management. Role cards only help fill the expected email format. Passwords are not stored or shown in the browser.
              </p>
            </div>

            <div className="login-access-note mt-5 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Access Notice
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Role-based access helps separate City Health Office, Barangay Health Worker, and Supervisor workflows within the dengue monitoring system.
              </p>
            </div>
          </form>
        </section>
      </div>

      <style>{`
        .animate-slideIn {
          animation: slideIn 0.8s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-gradient {
          background-size: 400% 400%;
          animation: gradientMove 12s ease infinite;
        }

        @keyframes gradientMove {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .animate-fade {
          animation: fade 0.3s ease-in-out;
        }

        @keyframes fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .animate-pop {
          animation: pop 0.5s ease;
        }

        @keyframes pop {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .animate-shake {
          animation: shake 0.3s ease;
        }

        @keyframes shake {
          0%, 100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-5px);
          }
          50% {
            transform: translateX(5px);
          }
          75% {
            transform: translateX(-5px);
          }
        }

        .animate-scanLine {
          animation: scanLine 2.4s ease-in-out infinite;
        }

        @keyframes scanLine {
          0% {
            transform: translateX(-72px);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          50% {
            transform: translateX(72px);
            opacity: 1;
          }
          80% {
            opacity: 1;
          }
          100% {
            transform: translateX(-72px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}