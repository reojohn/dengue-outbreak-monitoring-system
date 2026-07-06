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
import { createDemoSession } from '../services/api'
import { getAuthSession, getRoleHome } from '../utils/auth'

const items = [
  {
    title: 'Dengue Data Validation',
    description: 'Upload, clean, and validate dengue records before forecasting.',
    icon: Database,
  },
  {
    title: 'Risk Forecasting',
    description: 'Generate barangay-level dengue risk projections from current records.',
    icon: BarChart3,
  },
  {
    title: 'GIS Hotspot Mapping',
    description: 'Visualize priority barangays using geospatial hotspot monitoring.',
    icon: MapPinned,
  },
]

const demoAccounts = [
  {
    role: 'cho',
    label: 'City Health Office',
    email: 'cityhealth@butuan.gov.ph',
    password: 'demo1234',
    description: 'Can upload datasets, review dashboards, run forecasts, view maps, and generate reports.',
  },
  {
    role: 'bhw',
    label: 'Barangay Health Worker',
    email: 'bhw@butuan.gov.ph',
    password: 'demo1234',
    assignedBarangay: 'Baan KM 3',
    description: 'Can review assigned barangay alerts, hotspot status, and monitoring summaries.',
  },
  {
    role: 'supervisor',
    label: 'Supervisor',
    email: 'supervisor@butuan.gov.ph',
    password: 'demo1234',
    description: 'Can review city-wide risk rankings, forecasts, maps, and reports for planning.',
  },
]

const scanStages = {
  0: {
    title: 'Secure Access Ready',
    message: 'Select a prototype account or enter demo credentials.',
  },
  1: {
    title: 'Initializing Scan...',
    message: 'Preparing the dengue monitoring access workflow.',
  },
  2: {
    title: 'Reading Credentials...',
    message: 'Checking submitted email and password.',
  },
  3: {
    title: 'Verifying User Role...',
    message: 'Detecting the assigned prototype access level.',
  },
  4: {
    title: 'Verified',
    message: 'Access approved. Redirecting to the dashboard.',
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

function getRoleBadgeStyle(role) {
  return roleVisuals[role]?.badge || roleVisuals.viewer.badge
}

function getRoleVisual(role) {
  return roleVisuals[role] || roleVisuals.viewer
}

export default function LoginPage() {
  const existingSession = getAuthSession()
  const navigate = useNavigate()
  const { addActivityLog } = useData()

  const [selectedRole, setSelectedRole] = useState('cho')
  const [email, setEmail] = useState('cityhealth@butuan.gov.ph')
  const [password, setPassword] = useState('demo1234')
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
    setPassword(account.password)
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
      await wait(650)

      setScanStage(2)
      await wait(650)

      const detected = detectRoleFromUsername(email)
      setRoleHint(detected)

      setScanStage(3)
      await wait(700)

      const matchedAccount = demoAccounts.find((account) => {
        return (
          account.email.toLowerCase() === email.trim().toLowerCase() &&
          account.password === password
        )
      })

      if (!matchedAccount) {
        throw new Error('Invalid demo credentials. Please use one of the prototype accounts.')
      }

      setSelectedRole(matchedAccount.role)
      setRoleHint(matchedAccount.role)
      setScanStage(4)

      const session = {
        isAuthenticated: true,
        role: matchedAccount.role,
        label: matchedAccount.label,
        email: matchedAccount.email,
        assignedBarangay: matchedAccount.assignedBarangay || '',
        loginTime: new Date().toISOString(),
      }

      await wait(850)

      try {
        const savedSession = await createDemoSession({
          user_key: 'default_user',
          user_name: matchedAccount.label,
          user_role: matchedAccount.role,
          label: matchedAccount.label,
          email: matchedAccount.email,
        })

        session.session_id = savedSession?.session?.session_id || ''
      } catch {
        session.session_id = ''
      }

      localStorage.setItem('dengue-auth-session', JSON.stringify(session))

      addActivityLog(
        'User signed in',
        `${matchedAccount.label} accessed the prototype system.`
      )

      navigate(getRoleHome(matchedAccount.role), { replace: true })
    } catch (loginError) {
      setError(loginError.message || 'Login failed. Please try again.')
      setScanStage(0)
      setIsSigningIn(false)
    }
  }

  return (
    <div
      className={`relative flex min-h-screen items-center justify-center overflow-hidden p-4 transition-colors duration-300 sm:p-6 ${
        theme === 'dark'
          ? 'bg-[radial-gradient(circle_at_top,_#0a0f1f,_#050816,_#000000)]'
          : 'bg-slate-200'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute h-full w-full animate-pulse bg-[radial-gradient(circle,_rgba(0,255,255,0.15)_0%,_transparent_70%)] opacity-30" />
        <div className="absolute -top-24 left-1/2 h-[460px] w-[460px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-[-120px] left-[-120px] h-[320px] w-[320px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div
        className={`pointer-events-none absolute inset-0 animate-gradient bg-gradient-to-br ${roleTheme} opacity-20 blur-3xl`}
      />

      <button
        type="button"
        onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        className="absolute right-5 top-5 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-lg backdrop-blur-xl transition hover:bg-white/15"
        aria-label="Toggle login theme"
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="relative grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-[34px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-2xl animate-slideIn lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[690px] flex-col justify-center overflow-hidden bg-white/5 p-10 text-white lg:flex xl:p-12">
          {scanStage > 0 && (
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.16)_1px,transparent_1px)] bg-[size:18px_18px] opacity-25 animate-pulse" />
          )}

          <div className="absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
              <Radar className="h-3.5 w-3.5" />
              Secure Access
            </div>

            <div className="mt-8 flex justify-center">
              <div
                className={`relative flex h-52 w-52 items-center justify-center rounded-full border ${currentRoleVisual.ring} ${currentRoleVisual.bg} shadow-[0_0_70px_rgba(34,211,238,0.16)] transition-all duration-300`}
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
                <h1 className="mt-8 text-center text-4xl font-black leading-tight tracking-tight xl:text-[46px]">
                  Barangay-Level Dengue Outbreak Prevention System
                </h1>

                <p className="mx-auto mt-5 max-w-md text-center text-base leading-8 text-slate-300">
                  Secure prototype access for dengue data upload, risk forecasting, GIS hotspot mapping, and monitoring reports.
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
                      className="rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div>
                          <p className="text-sm font-bold text-white">
                            {item.title}
                          </p>

                          <p className="mt-1 text-sm leading-6 text-slate-400">
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
                className={`mx-auto mt-7 w-fit rounded-full border px-4 py-2 text-sm animate-fade ${getRoleBadgeStyle(roleHint)}`}
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

        <section className="flex min-h-[690px] items-center justify-center bg-black/20 p-5 backdrop-blur-xl sm:p-7 lg:p-10">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-[30px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-2xl sm:p-8"
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
                    className={`rounded-[20px] border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${
                      selectedRole === account.role
                        ? `${accountVisual.ring} ${accountVisual.bg} shadow-[0_0_24px_rgba(34,211,238,0.12)]`
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

                    <p className="mt-2 text-xs leading-5 text-slate-400">
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
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3.5 text-sm font-black text-slate-950 shadow-[0_16px_34px_rgba(34,211,238,0.22)] transition-all duration-200 hover:scale-[1.02] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-80"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="animate-spin" size={17} />
                  Scanning...
                </>
              ) : (
                <>
                  Login as {getRoleLabel(selectedRole)}
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div className="mt-5 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Demo Credentials
              </p>

              <p className="mt-2 break-words text-xs text-slate-400">
                Email: {selectedAccount?.email}
              </p>

              <p className="text-xs text-slate-400">
                Password: {selectedAccount?.password}
              </p>
            </div>

            <div className="mt-5 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
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