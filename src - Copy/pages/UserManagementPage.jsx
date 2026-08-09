import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Edit3,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
  X,
  Search,
  Mail,
  MapPinned,
  Activity,
  LockKeyhole,
  Shield,
  UserCheck,
  Building2,
  Eye,
  EyeOff,
  Filter,
  Clock3,
} from 'lucide-react'
import {
  createUserAccount,
  deleteUserAccount,
  getAuthBarangays,
  getUserAccounts,
  getUserAuditLogs,
  resetUserPassword,
  updateUserAccount,
} from '../services/api'
import { getAuthSession } from '../utils/auth'


function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

const roleOptions = [
  {
    value: 'cho',
    label: 'City Health Office',
    short: 'CHO',
    icon: Building2,
    tone: 'cyan',
    description: 'Upload needed files, run forecasts, view maps, and create reports.',
  },
  {
    value: 'bhw',
    label: 'Barangay Health Worker',
    short: 'BHW',
    icon: UserCheck,
    tone: 'emerald',
    description: 'View assigned barangay alerts, hotspot status, and monitoring summaries.',
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    short: 'SUP',
    icon: ShieldCheck,
    tone: 'blue',
    description: 'Review city-wide forecasts, maps, reports, and planning summaries.',
  },
  {
    value: 'admin',
    label: 'System Administrator',
    short: 'ADMIN',
    icon: Shield,
    tone: 'violet',
    description: 'Manage users, account security, passwords, and access status.',
  },
  {
    value: 'viewer',
    label: 'Viewer',
    short: 'VIEW',
    icon: Eye,
    tone: 'slate',
    description: 'Read-only monitoring access for general review.',
  },
]

const initialForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'bhw',
  assigned_barangay: '',
  is_active: true,
}

function getRoleMeta(role) {
  return roleOptions.find((item) => item.value === role) || roleOptions[4]
}

function getRoleLabel(role) {
  return getRoleMeta(role).label
}

function formatDate(value) {
  if (!value) return 'Not yet'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Not yet'

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getRoleChipClass(role) {
  const tone = getRoleMeta(role).tone

  if (tone === 'cyan') return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-500/10 dark:text-cyan-200'
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200'
  if (tone === 'blue') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-500/10 dark:text-blue-200'
  if (tone === 'violet') return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-200'

  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
}

function getRoleIconWrapClass(role) {
  const tone = getRoleMeta(role).tone

  if (tone === 'cyan') return 'from-cyan-400 to-blue-500 shadow-cyan-500/20'
  if (tone === 'emerald') return 'from-emerald-400 to-cyan-500 shadow-emerald-500/20'
  if (tone === 'blue') return 'from-blue-500 to-indigo-500 shadow-blue-500/20'
  if (tone === 'violet') return 'from-violet-500 to-fuchsia-500 shadow-violet-500/20'

  return 'from-slate-600 to-slate-800 shadow-slate-500/20'
}

function StatusMessage({ type = 'success', children }) {
  if (!children) return null

  const isError = type === 'error'
  const Icon = isError ? AlertCircle : CheckCircle2

  return (
    <div
      className={`relative overflow-hidden rounded-[18px] border px-3 py-2.5 text-xs sm:rounded-[24px] sm:px-4 sm:py-3 sm:text-sm leading-6 shadow-sm ${
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-100'
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="font-semibold">{children}</p>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, helper, tone = 'cyan', className = '' }) {
  const themes = {
    cyan: {
      surface: 'border-cyan-200/70 bg-gradient-to-br from-cyan-50/95 via-white to-blue-50/80 dark:border-cyan-400/20 dark:from-cyan-500/10 dark:via-slate-950 dark:to-blue-500/5',
      icon: 'from-cyan-400 to-blue-500 shadow-cyan-500/20',
      line: 'from-cyan-500 via-sky-400 to-blue-500',
      glow: 'bg-cyan-300/25 dark:bg-cyan-500/10',
      meter: 'from-cyan-500 to-blue-500',
    },
    emerald: {
      surface: 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/80 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5',
      icon: 'from-emerald-400 to-teal-500 shadow-emerald-500/20',
      line: 'from-emerald-500 via-teal-400 to-cyan-400',
      glow: 'bg-emerald-300/25 dark:bg-emerald-500/10',
      meter: 'from-emerald-500 to-teal-500',
    },
    blue: {
      surface: 'border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-indigo-50/80 dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-indigo-500/5',
      icon: 'from-blue-500 to-indigo-500 shadow-blue-500/20',
      line: 'from-blue-500 via-indigo-400 to-cyan-400',
      glow: 'bg-blue-300/25 dark:bg-blue-500/10',
      meter: 'from-blue-500 to-indigo-500',
    },
    rose: {
      surface: 'border-rose-200/70 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/80 dark:border-rose-400/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/5',
      icon: 'from-rose-500 to-orange-500 shadow-rose-500/20',
      line: 'from-rose-500 via-orange-400 to-amber-400',
      glow: 'bg-rose-300/25 dark:bg-rose-500/10',
      meter: 'from-rose-500 to-orange-500',
    },
  }
  const theme = themes[tone] || themes.cyan

  return (
    <article
      className={`group relative min-h-[160px] overflow-hidden rounded-[24px] border p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/80 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_68px_rgba(15,23,42,0.15)] dark:ring-white/5 sm:rounded-[30px] sm:p-5 ${theme.surface} ${className}`}
    >
      <div className={`pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-125 ${theme.glow}`} />
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.line}`} />
      <div className="pointer-events-none absolute right-5 top-5 h-20 w-20 rounded-full border border-white/70 opacity-60 dark:border-white/5" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] bg-gradient-to-br text-white shadow-lg sm:h-12 sm:w-12 sm:rounded-[19px] ${theme.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
          <span className="rounded-full border border-white/80 bg-white/[0.07]5 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
            Live
          </span>
        </div>

        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white sm:text-3xl">{value}</p>

        <div className="mt-auto pt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-slate-800">
            <div className={`h-full w-[72%] rounded-full bg-gradient-to-r ${theme.meter}`} />
          </div>
          {helper && <p className="mt-3 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-400">{helper}</p>}
        </div>
      </div>
    </article>
  )
}

function Field({ label, icon: Icon, children }) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      {children}
    </label>
  )
}

function SearchableDropdown({
  value,
  options = [],
  onChange,
  placeholder = 'Select option',
  searchPlaceholder = 'Search...',
  emptyTitle = 'No result found',
  emptyMessage = 'Try a different search.',
  getLabel = (option) => option?.label || String(option || ''),
  getValue = (option) => option?.value || String(option || ''),
  renderOption,
  renderSelected,
  icon: Icon = Search,
  required = false,
  wideMenu = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedOption = useMemo(() => {
    return options.find((option) => getValue(option) === value) || null
  }, [options, value, getValue])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return options.filter((option) => {
      const label = getLabel(option).toLowerCase()
      const optionValue = getValue(option).toLowerCase()

      if (!normalizedQuery) return true

      return label.includes(normalizedQuery) || optionValue.includes(normalizedQuery)
    })
  }, [options, query, getLabel, getValue])

  function handleSelect(option) {
    onChange(getValue(option))
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative mt-2 min-w-0">
      {required && (
        <input
          tabIndex={-1}
          required
          value={value || ''}
          onChange={() => {}}
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`group flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold outline-none transition ${
          open
            ? 'border-cyan-300 bg-cyan-50 text-slate-950 shadow-[0_0_0_4px_rgba(34,211,238,0.12)] dark:border-cyan-400/60 dark:bg-cyan-500/10 dark:text-white'
            : 'border-slate-200 bg-white text-slate-900 hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-cyan-400/40'
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          {selectedOption ? (
            renderSelected ? (
              renderSelected(selectedOption)
            ) : (
              <span className="truncate">{getLabel(selectedOption)}</span>
            )
          ) : (
            <span className="truncate text-slate-400">{placeholder}</span>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] transition ${
              open
                ? 'border-cyan-300 bg-cyan-400 text-slate-950'
                : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {open ? 'Close' : 'Search'}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180 text-cyan-500' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div
          className={`absolute top-full z-[99999] mt-3 overflow-hidden rounded-[28px] border border-cyan-300/40 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)] ring-1 ring-cyan-100/80 backdrop-blur-2xl dark:border-cyan-400/25 dark:bg-slate-950 dark:ring-white/10 ${
            wideMenu
              ? 'right-0 w-[420px] max-w-[calc(100vw-2rem)]'
              : 'left-0 right-0'
          }`}
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/10" />
          <div className="pointer-events-none absolute -bottom-12 left-6 h-28 w-28 rounded-full bg-blue-300/[0.15] blur-3xl dark:bg-blue-500/10" />

          <div className="relative border-b border-slate-100 bg-gradient-to-br from-cyan-50 via-white to-slate-50 p-3 dark:border-slate-800 dark:from-slate-950 dark:via-blue-950/40 dark:to-slate-950">
            <div className="relative">
              <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-600 dark:text-cyan-300" />

              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-2xl border border-cyan-200 bg-white py-3 pl-11 pr-10 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-cyan-400/20 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-cyan-400/10"
              />

              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              <span>
                {filteredOptions.length} result{filteredOptions.length === 1 ? '' : 's'}
              </span>

              {selectedOption && (
                <span className="truncate text-cyan-600 dark:text-cyan-300">
                  Selected: {getLabel(selectedOption)}
                </span>
              )}
            </div>
          </div>

          <div className="relative max-h-[340px] overflow-y-auto p-2 [scrollbar-color:rgba(34,211,238,0.75)_rgba(15,23,42,0.12)] [scrollbar-width:thin]">
            {filteredOptions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-900/60">
                <Icon className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  {emptyTitle}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {emptyMessage}
                </p>
              </div>
            ) : (
              filteredOptions.map((option) => {
                const optionValue = getValue(option)
                const isSelected = value === optionValue

                return (
                  <button
                    key={optionValue}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={`group/item mb-1 flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition last:mb-0 ${
                      isSelected
                        ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-[0_12px_26px_rgba(14,165,233,0.22)]'
                        : 'text-slate-700 hover:bg-cyan-50 hover:text-cyan-800 dark:text-slate-200 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-100'
                    }`}
                  >
                    {renderOption ? (
                      renderOption(option, isSelected)
                    ) : (
                      <span className="truncate">{getLabel(option)}</span>
                    )}

                    {isSelected ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <Icon className="h-4 w-4 shrink-0 opacity-0 transition group-hover/item:opacity-60" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RoleSearchSelect({ value, onChange }) {
  return (
    <SearchableDropdown
      value={value}
      options={roleOptions}
      onChange={onChange}
      placeholder="Select user role"
      searchPlaceholder="Search role name..."
      emptyTitle="No role found"
      emptyMessage="Try searching CHO, BHW, Supervisor, Admin, or Viewer."
      icon={ShieldCheck}
      getLabel={(role) => role.label}
      getValue={(role) => role.value}
      renderSelected={(role) => {
        const RoleIcon = role.icon

        return (
          <span className="flex min-w-0 items-center gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${getRoleIconWrapClass(role.value)} text-white shadow-lg`}>
              <RoleIcon className="h-4 w-4" />
            </span>

            <span className="min-w-0">
              <span className="block truncate">{role.label}</span>
              <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                {role.short} access
              </span>
            </span>
          </span>
        )
      }}
      renderOption={(role) => {
        const RoleIcon = role.icon

        return (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${getRoleIconWrapClass(role.value)} text-white shadow-lg`}>
              <RoleIcon className="h-4 w-4" />
            </span>

            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate">{role.label}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${getRoleChipClass(role.value)}`}>
                  {role.short}
                </span>
              </span>

              <span className="mt-0.5 block truncate text-xs font-semibold opacity-70">
                {role.description}
              </span>
            </span>
          </span>
        )
      }}
      required
    />
  )
}

function RoleFilterSelect({ value, onChange }) {
  const filterOptions = [
    {
      value: 'all',
      label: 'All roles',
      short: 'ALL',
      icon: Filter,
      tone: 'slate',
      description: 'Show every registered account.',
    },
    ...roleOptions,
  ]

  return (
    <SearchableDropdown
      value={value}
      options={filterOptions}
      onChange={onChange}
      placeholder="All roles"
      searchPlaceholder="Search role filter..."
      emptyTitle="No role filter found"
      emptyMessage="Try searching CHO, BHW, Supervisor, Admin, Viewer, or All."
      icon={Filter}
      getLabel={(role) => role.label}
      getValue={(role) => role.value}
      wideMenu
      renderSelected={(role) => {
        const RoleIcon = role.icon
        const isAll = role.value === 'all'

        return (
          <span className="flex min-w-0 items-center gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isAll ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : `bg-gradient-to-br ${getRoleIconWrapClass(role.value)} text-white shadow-lg`}`}>
              <RoleIcon className="h-4 w-4" />
            </span>

            <span className="min-w-0">
              <span className="block truncate">{role.label}</span>
              <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                {isAll ? 'Filter view' : `${role.short} filter`}
              </span>
            </span>
          </span>
        )
      }}
      renderOption={(role) => {
        const RoleIcon = role.icon
        const isAll = role.value === 'all'

        return (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isAll ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : `bg-gradient-to-br ${getRoleIconWrapClass(role.value)} text-white shadow-lg`}`}>
              <RoleIcon className="h-4 w-4" />
            </span>

            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate">{role.label}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${isAll ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300' : getRoleChipClass(role.value)}`}>
                  {role.short}
                </span>
              </span>

              <span className="mt-0.5 block truncate text-xs font-semibold opacity-70">
                {role.description}
              </span>
            </span>
          </span>
        )
      }}
    />
  )
}

function BarangaySearchSelect({ value, barangays = [], onChange }) {
  const options = barangays
    .filter((barangay) => String(barangay || '').trim())
    .map((barangay) => ({
      value: String(barangay),
      label: String(barangay),
    }))

  return (
    <SearchableDropdown
      value={value}
      options={options}
      onChange={onChange}
      placeholder="Select barangay"
      searchPlaceholder="Search barangay name..."
      emptyTitle="No barangay found"
      emptyMessage="Try a different spelling or clear the search."
      icon={MapPinned}
      getLabel={(barangay) => barangay.label}
      getValue={(barangay) => barangay.value}
      renderSelected={(barangay) => (
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 ring-1 ring-cyan-400/20 dark:text-cyan-300">
            <MapPinned className="h-4 w-4" />
          </span>
          <span className="truncate">{barangay.label}</span>
        </span>
      )}
      renderOption={(barangay) => (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 ring-1 ring-cyan-400/20 dark:text-cyan-300">
            <MapPinned className="h-4 w-4" />
          </span>
          <span className="truncate">{barangay.label}</span>
        </span>
      )}
      required
    />
  )
}

export default function UserManagementPage() {
  const session = getAuthSession()
  const [users, setUsers] = useState([])
  const [barangays, setBarangays] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingUserId, setEditingUserId] = useState('')
  const [resetUser, setResetUser] = useState(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [auditExpanded, setAuditExpanded] = useState(false)

  const activeCount = users.filter((user) => user.is_active !== false).length
  const bhwCount = users.filter((user) => user.role === 'bhw').length
  const inactiveCount = users.length - activeCount
  const activeRate = users.length ? Math.round((activeCount / users.length) * 100) : 0
  const roleCoverage = new Set(users.map((user) => user.role).filter(Boolean)).size

  const sortedUsers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return [...users]
      .filter((user) => {
        const matchesRole = roleFilter === 'all' || user.role === roleFilter
        const haystack = `${user.full_name || ''} ${user.email || ''} ${user.role || ''} ${user.assigned_barangay || ''}`.toLowerCase()

        return matchesRole && (!search || haystack.includes(search))
      })
      .sort((a, b) => `${a.role}-${a.full_name}`.localeCompare(`${b.role}-${b.full_name}`))
  }, [users, searchTerm, roleFilter])

  async function loadAll() {
    setLoading(true)
    setError('')

    try {
      const [userResult, barangayResult, auditResult] = await Promise.all([
        getUserAccounts(),
        getAuthBarangays().catch(() => ({ barangays: [] })),
        getUserAuditLogs().catch(() => ({ logs: [] })),
      ])

      setUsers(userResult.users || [])
      setBarangays(barangayResult.barangays || [])
      setAuditLogs(auditResult.logs || [])
    } catch (loadError) {
      setError(loadError.message || 'User management data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  function updateForm(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'role' && value !== 'bhw' ? { assigned_barangay: '' } : {}),
    }))
    setError('')
    setSuccess('')
  }

  function startEdit(user) {
    setEditingUserId(user.id)
    setForm({
      full_name: user.full_name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'viewer',
      assigned_barangay: user.assigned_barangay || '',
      is_active: user.is_active !== false,
    })
    setError('')
    setSuccess('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingUserId('')
    setForm(initialForm)
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        assigned_barangay: form.role === 'bhw' ? form.assigned_barangay.trim() : '',
        is_active: form.is_active,
      }

      if (editingUserId) {
        await updateUserAccount(editingUserId, payload)
        setSuccess('User account updated successfully.')
      } else {
        await createUserAccount({ ...payload, password: form.password })
        setSuccess('User account created successfully.')
      }

      setForm(initialForm)
      setEditingUserId('')
      await loadAll()
    } catch (saveError) {
      setError(saveError.message || 'The account could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(user) {
    setError('')
    setSuccess('')

    try {
      await updateUserAccount(user.id, {
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        assigned_barangay: user.assigned_barangay || '',
        is_active: !user.is_active,
      })

      setSuccess(user.is_active ? 'Account disabled.' : 'Account activated.')
      await loadAll()
    } catch (toggleError) {
      setError(toggleError.message || 'Account status could not be changed.')
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault()

    if (!resetUser) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await resetUserPassword(resetUser.id, resetPasswordValue)
      setSuccess(`Password reset for ${resetUser.full_name}.`)
      setResetUser(null)
      setResetPasswordValue('')
      await loadAll()
    } catch (resetError) {
      setError(resetError.message || 'Password could not be reset.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(user) {
    const confirmed = window.confirm(`Delete ${user.full_name}? This cannot be undone.`)

    if (!confirmed) return

    setError('')
    setSuccess('')

    try {
      await deleteUserAccount(user.id)
      setSuccess('User account deleted.')
      await loadAll()
    } catch (deleteError) {
      setError(deleteError.message || 'User account could not be deleted.')
    }
  }

  return (
    <div className="user-mobile-compact space-y-6">
      <section className="user-hero-panel relative isolate overflow-hidden rounded-[34px] border border-white/10 bg-[#061321] text-white shadow-[0_34px_94px_rgba(2,6,23,0.30)] ring-1 ring-white/10 sm:rounded-[40px]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_22%,rgba(34,211,238,0.23),transparent_27%),radial-gradient(circle_at_92%_92%,rgba(99,102,241,0.18),transparent_28%),linear-gradient(104deg,rgba(2,6,23,0.99)_0%,rgba(4,18,33,0.96)_48%,rgba(7,34,56,0.84)_100%)]" />
          <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-violet-500/[0.15] blur-3xl" />
          <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/55 to-transparent" />
        </div>

        <div className="relative z-10 grid min-h-[450px] gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.65fr)] lg:items-center lg:p-10 xl:p-12">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100 shadow-lg backdrop-blur-xl">
                <ShieldCheck className="h-3.5 w-3.5" />
                Identity and access command center
              </span>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">
                PostgreSQL secured
              </span>
            </div>

            <h1 className="mt-6 max-w-3xl text-[2.15rem] font-black leading-[1.04] tracking-[-0.045em] text-white drop-shadow-[0_5px_24px_rgba(2,6,23,0.65)] sm:text-[3rem] xl:text-[3.55rem]">
              Manage every account from one secure workspace.
            </h1>

            <p className="mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/90 sm:text-[15px] sm:leading-8">
              Create authorized accounts, assign role-based access, connect BHW users to barangays, reset credentials, and review account activity without leaving the administration workspace.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
  type="button"
  onClick={loadAll}
  disabled={loading}
  style={{
    backgroundColor: loading ? '#e2e8f0' : '#ffffff',
    color: loading ? '#64748b' : '#0f172a',
  }}
  className="relative z-20 inline-flex items-center justify-center gap-2 rounded-[18px] border border-white px-4 py-2.5 text-xs font-black shadow-[0_16px_36px_rgba(2,6,23,0.22)] transition hover:-translate-y-0.5 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-100 sm:rounded-[22px] sm:px-5 sm:py-3 sm:text-sm"
>
  {loading ? (
    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
  ) : (
    <RefreshCcw className="h-4 w-4 text-slate-700" />
  )}

  <span>{loading ? 'Refreshing records...' : 'Refresh records'}</span>
</button>
              <button
                type="button"
                onClick={() => setAuditExpanded(true)}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[18px] border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-50 transition hover:-translate-y-0.5 hover:bg-cyan-300/[0.15]"
              >
                <Activity className="h-4 w-4" />
                Open audit trail
              </button>
            </div>

            <div className="user-hero-metrics mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                { label: 'Registered users', value: formatNumber(users.length), helper: 'All system accounts', icon: UsersRound },
                { label: 'Active access', value: `${activeRate}%`, helper: `${activeCount} accounts enabled`, icon: UserCheck },
                { label: 'Role coverage', value: `${roleCoverage}/5`, helper: 'Access groups represented', icon: Shield },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="group/hero-metric relative overflow-hidden rounded-[22px] border border-white/[0.15] bg-gradient-to-br from-white/[0.12] via-slate-950/[0.35] to-cyan-400/[0.07] p-4 shadow-[0_16px_36px_rgba(2,6,23,0.30)] ring-1 ring-white/5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[9px] font-black uppercase tracking-[0.15em]">{item.label}</span>
                    </div>
                    <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{item.value}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">{item.helper}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="w-full justify-self-end lg:max-w-[390px]">
            <div className="group relative overflow-hidden rounded-[32px] border border-cyan-300/20 bg-gradient-to-br from-slate-950/80 via-slate-950/[0.66] to-cyan-950/[0.48] p-5 shadow-[0_30px_78px_rgba(2,6,23,0.52)] ring-1 ring-white/10 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 sm:p-6">
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-400/[0.12] blur-3xl" />

              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70">Access health</p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{activeRate}% active</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-400">Current account availability</p>
                </div>

                <div
                  className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full p-[8px] shadow-[0_0_42px_rgba(34,211,238,0.18)]"
                  style={{ background: `conic-gradient(#22d3ee ${activeRate * 3.6}deg, rgba(255,255,255,0.10) 0deg)` }}
                >
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#071525]">
                    <span className="text-2xl font-black leading-none">{activeCount}</span>
                    <span className="mt-1 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100/70">active</span>
                  </div>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-2 gap-2.5">
                <div className="rounded-[18px] border border-white/[0.15] bg-white/[0.07] p-3 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Inactive</p>
                  <p className="mt-1 text-lg font-black text-white">{inactiveCount}</p>
                </div>
                <div className="rounded-[18px] border border-white/[0.15] bg-white/[0.07] p-3 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Audit events</p>
                  <p className="mt-1 text-lg font-black text-white">{auditLogs.length}</p>
                </div>
              </div>

              <div className="relative mt-5 overflow-hidden rounded-full bg-white/10">
                <div className="h-2.5 rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" style={{ width: `${activeRate}%` }} />
              </div>

              <p className="relative mt-4 text-xs font-semibold leading-5 text-slate-400">
                Administrators can create, update, disable, reset, and remove accounts based on operational requirements.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="user-stat-grid grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UsersRound} label="Total users" value={formatNumber(users.length)} helper="All registered accounts." tone="cyan" />
        <StatCard icon={CheckCircle2} label="Active" value={formatNumber(activeCount)} helper="Accounts currently allowed to sign in." tone="emerald" />
        <StatCard icon={UserCheck} label="BHW accounts" value={formatNumber(bhwCount)} helper="Users connected to barangay assignments." tone="blue" />
        <StatCard icon={AlertCircle} label="Inactive" value={formatNumber(inactiveCount)} helper="Accounts temporarily disabled." tone="rose" />
      </div>

      <div className="relative z-[50] grid gap-6 xl:grid-cols-[0.85fr_1.45fr]">
        <form
          onSubmit={handleSubmit}
          className="user-form-panel group relative z-[80] overflow-visible rounded-[24px] border border-cyan-200/70 bg-gradient-to-br from-white/95 via-white/90 to-cyan-50/70 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-white/80 backdrop-blur-xl dark:border-cyan-400/20 dark:from-slate-950/95 dark:via-slate-950/90 dark:to-cyan-950/30 dark:ring-white/5 sm:rounded-[34px] sm:p-6"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500" />
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/10" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.022] [background-image:linear-gradient(rgba(15,23,42,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.5)_1px,transparent_1px)] [background-size:34px_34px] dark:opacity-[0.035]" />

          <div className="relative mb-3 flex items-center justify-between gap-3 sm:mb-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-[0_14px_30px_rgba(14,165,233,0.24)]">
                {editingUserId ? <Edit3 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </div>
              <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                {editingUserId ? 'Edit Account' : 'Create Account'}
              </p>

              <h2 className="mt-2 text-xl font-black sm:text-2xl text-slate-950 dark:text-white">
                {editingUserId ? 'Update user details' : 'New system user'}
              </h2>

              <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6 dark:text-slate-400">
                {editingUserId ? 'Modify account information and access status.' : 'Issue credentials for authorized system access.'}
              </p>
              </div>
            </div>

            {editingUserId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="relative space-y-3 sm:space-y-4">
            <StatusMessage type="error">{error}</StatusMessage>
            <StatusMessage>{success}</StatusMessage>

            <Field label="Full Name" icon={UserCog}>
              <input
                required
                value={form.full_name}
                onChange={(event) => updateForm('full_name', event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm sm:px-4 sm:py-3.5 font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10"
                placeholder="Example: BHW Ampayon"
              />
            </Field>

            <Field label="Email" icon={Mail}>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => updateForm('email', event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm sm:px-4 sm:py-3.5 font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10"
                placeholder="user@butuan.gov.ph"
              />
            </Field>

            {!editingUserId && (
              <Field label="Temporary Password" icon={LockKeyhole}>
                <div className="relative mt-2">
                  <input
                    required
                    minLength={6}
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => updateForm('password', event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 pr-12 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10"
                    placeholder="Minimum 6 characters"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-cyan-600 dark:hover:text-cyan-300"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </Field>
            )}

            <Field label="Role" icon={ShieldCheck}>
              <RoleSearchSelect
                value={form.role}
                onChange={(value) => updateForm('role', value)}
              />
            </Field>

            {form.role === 'bhw' && (
              <Field label="Assigned Barangay" icon={MapPinned}>
                {barangays.length > 0 ? (
                  <BarangaySearchSelect
                    value={form.assigned_barangay}
                    barangays={barangays}
                    onChange={(value) => updateForm('assigned_barangay', value)}
                  />
                ) : (
                  <input
                    required
                    value={form.assigned_barangay}
                    onChange={(event) => updateForm('assigned_barangay', event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm sm:px-4 sm:py-3.5 font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10"
                    placeholder="Type barangay name"
                  />
                )}
              </Field>
            )}

            <label className="flex items-center justify-between gap-4 rounded-[18px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-3 py-2.5 sm:rounded-[24px] sm:px-4 sm:py-3.5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-950">
              <span>
                <span className="block text-sm font-black text-slate-900 dark:text-white">
                  Active Account
                </span>
                <span className="block text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Inactive users cannot sign in.
                </span>
              </span>

              <button
                type="button"
                onClick={() => updateForm('is_active', !form.is_active)}
                className={`relative h-8 w-[58px] rounded-full border transition ${
                  form.is_active
                    ? 'border-emerald-300 bg-gradient-to-r from-emerald-400 to-cyan-300 shadow-[0_0_18px_rgba(16,185,129,0.28)]'
                    : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-800'
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition ${
                    form.is_active ? 'left-[28px]' : 'left-1'
                  }`}
                />
              </button>
            </label>

            <button
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 sm:rounded-[22px] sm:py-4 text-sm font-black text-slate-950 shadow-[0_18px_38px_rgba(14,165,233,0.24)] transition hover:scale-[1.01] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingUserId ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingUserId ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>

        <section className="user-list-panel group relative z-[40] overflow-visible rounded-[24px] border border-blue-200/70 bg-gradient-to-br from-white/95 via-white/90 to-blue-50/70 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-white/80 backdrop-blur-xl dark:border-blue-400/20 dark:from-slate-950/95 dark:via-slate-950/90 dark:to-blue-950/30 dark:ring-white/5 sm:rounded-[34px] sm:p-6">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-400 to-cyan-400" />
          <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-blue-300/20 blur-3xl dark:bg-blue-500/10" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.02] [background-image:linear-gradient(rgba(15,23,42,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.5)_1px,transparent_1px)] [background-size:36px_36px] dark:opacity-[0.035]" />

          <div className="relative mb-3 flex flex-col gap-3 sm:mb-5 sm:gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                Local PostgreSQL Accounts
              </p>
              <h2 className="mt-2 text-xl font-black sm:text-2xl text-slate-950 dark:text-white">
                Registered users
              </h2>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="relative self-start">
  <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />

  <input
    value={searchTerm}
    onChange={(event) => setSearchTerm(event.target.value)}
    className="h-[50px] w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10 sm:w-64"
    placeholder="Search users..."
  />
</div>

              <div className="relative z-[70] min-w-0 sm:w-[260px]">
                <RoleFilterSelect
                  value={roleFilter}
                  onChange={(value) => setRoleFilter(value)}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[430px] items-center justify-center rounded-[30px] border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-500" />
                <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">
                  Loading user accounts...
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {sortedUsers.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
                  <UsersRound className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">
                    No users found
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Try changing the search or role filter.
                  </p>
                </div>
              ) : (
                sortedUsers.map((user) => {
                  const roleMeta = getRoleMeta(user.role)
                  const RoleIcon = roleMeta.icon

                  return (
                    <div
                      key={user.id}
                      className="group/user relative overflow-hidden rounded-[22px] border border-white/80 bg-gradient-to-br from-white via-white to-slate-50/80 p-3 shadow-[0_12px_34px_rgba(15,23,42,0.07)] ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-[0_22px_54px_rgba(15,23,42,0.13)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 dark:ring-white/5 dark:hover:border-cyan-400/25 sm:rounded-[28px] sm:p-4"
                    >
                      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${getRoleIconWrapClass(user.role)}`} />
                      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-300/10 blur-3xl dark:bg-cyan-500/5" />
                      <div className="relative flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br text-base font-black text-white shadow-lg sm:h-14 sm:w-14 sm:rounded-[22px] ${getRoleIconWrapClass(user.role)}`}>
                            {String(user.full_name || user.email || 'U').slice(0, 1).toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-black text-slate-950 dark:text-white">
                                {user.full_name}
                              </p>

                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${getRoleChipClass(user.role)}`}>
                                <RoleIcon className="h-3.5 w-3.5" />
                                {roleMeta.short}
                              </span>

                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                                  user.is_active
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
                                    : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200'
                                }`}
                              >
                                {user.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>

                            <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              <Mail className="h-3.5 w-3.5" />
                              {user.email}
                            </p>

                            <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs sm:mt-3 sm:flex sm:flex-wrap sm:gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <MapPinned className="h-3.5 w-3.5" />
                                {user.assigned_barangay || 'City-wide'}
                              </span>

                              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <Clock3 className="h-3.5 w-3.5" />
                                {formatDate(user.last_login_at)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                          <button
                            type="button"
                            onClick={() => startEdit(user)}
                            className="rounded-xl border border-slate-200 bg-white p-2 sm:rounded-2xl sm:p-2.5 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-300"
                            title="Edit user"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setResetUser(user)
                              setResetPasswordValue('')
                              setShowResetPassword(false)
                            }}
                            className="rounded-xl border border-slate-200 bg-white p-2 sm:rounded-2xl sm:p-2.5 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                            title="Reset password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleActive(user)}
                            className={`rounded-xl border px-2 py-2 text-[10px] sm:rounded-2xl sm:px-3 sm:text-xs font-black shadow-sm transition hover:-translate-y-0.5 ${
                              user.is_active
                                ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200'
                            }`}
                          >
                            {user.is_active ? 'Disable' : 'Activate'}
                          </button>

                          {session?.userId !== user.id && (
                            <button
                              type="button"
                              onClick={() => handleDelete(user)}
                              className="rounded-2xl border border-rose-200 bg-white p-2.5 text-rose-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-50 dark:border-rose-400/20 dark:bg-slate-900 dark:hover:bg-rose-500/10"
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </section>
      </div>

      <section className="user-audit-panel group relative z-0 overflow-hidden rounded-[24px] border border-violet-200/70 bg-gradient-to-br from-white/95 via-white/90 to-violet-50/70 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-white/80 backdrop-blur-xl dark:border-violet-400/20 dark:from-slate-950/95 dark:via-slate-950/90 dark:to-violet-950/25 dark:ring-white/5 sm:rounded-[34px]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-indigo-400 to-cyan-400" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.022] [background-image:linear-gradient(rgba(15,23,42,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.5)_1px,transparent_1px)] [background-size:34px_34px] dark:opacity-[0.035]" />

        <button
          type="button"
          onClick={() => setAuditExpanded((current) => !current)}
          className="relative flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-white/40 dark:hover:bg-white/[0.025] sm:p-6"
          aria-expanded={auditExpanded}
          aria-controls="user-audit-log-trail"
        >
          <span className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)] sm:h-12 sm:w-12 sm:rounded-[20px]">
              <Activity className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">Audit log trail</span>
              <span className="mt-1 block text-lg font-black tracking-tight text-slate-950 dark:text-white sm:text-xl">Recent account activity</span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                Review account creation, edits, access changes, password resets, and administrative activity.
              </span>
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-black text-violet-700 shadow-sm dark:border-violet-400/20 dark:bg-slate-950 dark:text-violet-300 sm:inline-flex">
              {auditLogs.length} record{auditLogs.length === 1 ? '' : 's'}
            </span>
            <span className={`flex h-10 w-10 items-center justify-center rounded-full border transition duration-300 ${auditExpanded ? 'rotate-180 border-violet-300 bg-violet-500 text-white shadow-[0_10px_24px_rgba(124,58,237,0.22)]' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
              <ChevronDown className="h-4 w-4" />
            </span>
          </span>
        </button>

        {auditExpanded && (
          <div id="user-audit-log-trail" className="relative border-t border-violet-100/80 p-4 dark:border-violet-400/10 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                <Clock3 className="h-4 w-4 text-violet-500" />
                Latest recorded actions
              </div>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                Showing up to 10 events
              </span>
            </div>

            <div className="user-audit-scroll relative grid max-h-[520px] gap-3 overflow-y-auto pr-1">
              {auditLogs.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/[0.07]0 p-7 text-center dark:border-slate-700 dark:bg-slate-900/50">
                  <Activity className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">No user audit records yet</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Account changes will appear here after administrators perform an action.</p>
                </div>
              ) : (
                auditLogs.slice(0, 10).map((log, index) => (
                  <article
                    key={log.id || `${log.action}-${log.created_at}`}
                    className="group/log relative overflow-hidden rounded-[22px] border border-white/80 bg-gradient-to-br from-white via-white to-violet-50/60 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60 transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/20 dark:ring-white/5"
                  >
                    <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-violet-500 via-indigo-400 to-cyan-400" />
                    <div className="flex items-start gap-3 pl-1">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-violet-500/10 text-xs font-black text-violet-700 ring-1 ring-violet-400/20 dark:text-violet-300">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-black capitalize text-slate-900 dark:text-white">{String(log.action || '').replace(/_/g, ' ')}</p>
                          <p className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatDate(log.created_at)}
                          </p>
                        </div>
                        <p className="mt-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">{log.details || 'Account activity recorded.'}</p>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        )}
      </section>


      <style>{`
        @media (max-width: 639px) {
          .user-mobile-compact {
            --mobile-radius: 1.125rem;
          }

          .user-mobile-compact section,
          .user-mobile-compact form {
            max-width: 100%;
          }

          .user-mobile-compact input,
          .user-mobile-compact button {
            min-width: 0;
          }

          .user-mobile-compact .grid {
            min-width: 0;
          }

          .user-mobile-compact [class*="tracking-[0.18em]"],
          .user-mobile-compact [class*="tracking-[0.16em]"] {
            letter-spacing: .08em;
          }

          .user-mobile-compact [class*="rounded-[34px]"],
          .user-mobile-compact [class*="rounded-[36px]"] {
            border-radius: 1.35rem;
          }

          .user-mobile-compact .absolute.top-full {
            left: 0 !important;
            right: 0 !important;
            width: min(100%, calc(100vw - 2rem)) !important;
            max-width: calc(100vw - 2rem) !important;
          }

          .user-mobile-compact [class*="max-h-[340px]"] {
            max-height: 260px;
          }

          .user-mobile-compact .text-sm.leading-7,
          .user-mobile-compact .text-sm.leading-6 {
            line-height: 1.35rem;
          }



          .user-mobile-compact .user-hero-panel {
            border-radius: 1.45rem !important;
          }

          .user-mobile-compact .user-hero-panel > .relative.grid {
            min-height: 0 !important;
            grid-template-columns: minmax(0, 1fr) !important;
            padding: 1rem !important;
          }

          .user-mobile-compact .user-hero-panel h1 {
            font-size: 1.65rem !important;
            line-height: 1.06 !important;
          }

          .user-mobile-compact .user-hero-metrics {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: .45rem !important;
          }

          .user-mobile-compact .user-hero-metrics > div {
            border-radius: 1rem !important;
            padding: .65rem !important;
          }

          .user-mobile-compact .user-hero-metrics p:last-child {
            display: none !important;
          }

          .user-mobile-compact .user-stat-grid article {
            min-height: 132px !important;
            padding: .75rem !important;
          }

          .user-mobile-compact .user-audit-panel button {
            padding: .9rem !important;
          }

          .user-mobile-compact [class*="shadow-[0_24px_70px"],
          .user-mobile-compact [class*="shadow-[0_28px_80px"] {
            box-shadow: 0 14px 34px rgba(15,23,42,.12);
          }
        }

        .user-audit-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(124, 58, 237, 0.72) transparent;
          overscroll-behavior: contain;
        }

        .user-audit-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .user-audit-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .user-audit-scroll::-webkit-scrollbar-thumb {
          border: 2px solid transparent;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(139, 92, 246, 0.9), rgba(59, 130, 246, 0.65));
          background-clip: padding-box;
        }

      `}</style>

      {resetUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleResetPassword}
            className="relative w-full max-w-md overflow-hidden rounded-[26px] border border-cyan-200/70 bg-gradient-to-br from-white via-white to-cyan-50 p-4 shadow-[0_34px_100px_rgba(2,6,23,0.45)] ring-1 ring-white/80 dark:border-cyan-400/20 dark:from-slate-950 dark:via-slate-950 dark:to-cyan-950/30 dark:ring-white/5 sm:rounded-[34px] sm:p-6"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/10" />

            <div className="relative mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                  Reset Password
                </p>
                <h3 className="mt-2 text-xl font-black sm:text-2xl text-slate-950 dark:text-white">
                  {resetUser.full_name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {resetUser.email}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <Field label="New Temporary Password" icon={KeyRound}>
              <div className="relative mt-2">
                <input
                  required
                  minLength={6}
                  type={showResetPassword ? 'text' : 'password'}
                  value={resetPasswordValue}
                  onChange={(event) => setResetPasswordValue(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 pr-12 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10"
                  placeholder="Minimum 6 characters"
                />

                <button
                  type="button"
                  onClick={() => setShowResetPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-cyan-600 dark:hover:text-cyan-300"
                >
                  {showResetPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </Field>

            <button
              disabled={saving}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 sm:rounded-[22px] sm:py-4 text-sm font-black text-slate-950 shadow-[0_18px_38px_rgba(14,165,233,0.24)] disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Reset Password
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
