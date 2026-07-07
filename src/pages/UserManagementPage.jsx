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

const roleOptions = [
  {
    value: 'cho',
    label: 'City Health Office',
    short: 'CHO',
    icon: Building2,
    tone: 'cyan',
    description: 'Upload datasets, run forecasts, view maps, and generate reports.',
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
    description: 'Review city-wide forecasts, maps, reports, and planning outputs.',
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

function StatusMessage({ type, children }) {
  if (!children) return null

  const isError = type === 'error'
  const Icon = isError ? AlertCircle : CheckCircle2

  return (
    <div
      className={`relative overflow-hidden rounded-[24px] border px-4 py-3 text-sm leading-6 shadow-sm ${
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

function StatCard({ icon: Icon, label, value, helper, className = '' }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/60 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70 dark:ring-white/5 ${className}`}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-300/20 blur-2xl dark:bg-cyan-500/10" />

      <div className="relative flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-[0_14px_30px_rgba(14,165,233,0.24)]">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
            {value}
          </p>
          {helper && (
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {helper}
            </p>
          )}
        </div>
      </div>
    </div>
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
          <div className="pointer-events-none absolute -bottom-12 left-6 h-28 w-28 rounded-full bg-blue-300/15 blur-3xl dark:bg-blue-500/10" />

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

  const activeCount = users.filter((user) => user.is_active !== false).length
  const bhwCount = users.filter((user) => user.role === 'bhw').length
  const inactiveCount = users.length - activeCount

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
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[36px] border border-white/70 bg-gradient-to-br from-slate-950 via-[#0f2d4f] to-[#0ea5e9] p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] ring-1 ring-white/20 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-12 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:22px_22px] opacity-25" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-cyan-100 backdrop-blur">
              <ShieldCheck className="h-4 w-4" />
              Secure Administration
            </div>

            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
              User Management
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-cyan-50/85 sm:text-base">
              Create Supabase-backed user accounts, assign access levels, connect BHW users to barangays, reset passwords, and control active access for the dengue monitoring system.
            </p>
          </div>

          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/20 bg-white/12 px-5 py-3 text-sm font-black text-white shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh records
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UsersRound} label="Total users" value={users.length} helper="All registered accounts" />
        <StatCard icon={CheckCircle2} label="Active" value={activeCount} helper="Can sign in" />
        <StatCard icon={UserCheck} label="BHW accounts" value={bhwCount} helper="Barangay-assigned users" />
        <StatCard icon={AlertCircle} label="Inactive" value={inactiveCount} helper="Temporarily disabled" />
      </div>

      <div className="relative z-[50] grid gap-6 xl:grid-cols-[0.85fr_1.45fr]">
        <form
          onSubmit={handleSubmit}
          className="relative z-[80] overflow-visible rounded-[34px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85 dark:ring-white/5"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/10" />

          <div className="relative mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                {editingUserId ? 'Edit Account' : 'Create Account'}
              </p>

              <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
                {editingUserId ? 'Update user details' : 'New system user'}
              </h2>

              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {editingUserId ? 'Modify account information and access status.' : 'Issue credentials for authorized system access.'}
              </p>
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

          <div className="relative space-y-4">
            <StatusMessage type="error">{error}</StatusMessage>
            <StatusMessage>{success}</StatusMessage>

            <Field label="Full Name" icon={UserCog}>
              <input
                required
                value={form.full_name}
                onChange={(event) => updateForm('full_name', event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10"
                placeholder="Example: BHW Ampayon"
              />
            </Field>

            <Field label="Email" icon={Mail}>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => updateForm('email', event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10"
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
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10"
                    placeholder="Type barangay name"
                  />
                )}
              </Field>
            )}

            <label className="flex items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-3.5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-950">
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
              className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-4 text-sm font-black text-slate-950 shadow-[0_18px_38px_rgba(14,165,233,0.24)] transition hover:scale-[1.01] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingUserId ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingUserId ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>

        <section className="relative z-[40] overflow-visible rounded-[34px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85 dark:ring-white/5">
          <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-blue-300/20 blur-3xl dark:bg-blue-500/10" />

          <div className="relative mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                Supabase Accounts
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
                Registered users
              </h2>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-cyan-400/10 sm:w-64"
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
                      className="group relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)] dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-cyan-400/25"
                    >
                      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-slate-900 to-blue-600 text-base font-black text-white shadow-[0_14px_30px_rgba(15,23,42,0.20)] dark:from-cyan-500 dark:to-blue-500">
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

                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
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

                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(user)}
                            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-300"
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
                            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                            title="Reset password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleActive(user)}
                            className={`rounded-2xl border px-3 py-2 text-xs font-black shadow-sm transition hover:-translate-y-0.5 ${
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

      <section className="relative z-0 overflow-hidden rounded-[34px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85 dark:ring-white/5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-slate-300/20 blur-3xl dark:bg-blue-500/10" />

        <div className="relative mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-gradient-to-br from-slate-800 to-slate-600 text-white shadow-[0_14px_30px_rgba(15,23,42,0.20)] dark:from-cyan-500 dark:to-blue-500">
            <Activity className="h-5 w-5" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Audit Log
            </p>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Recent account activity
            </h2>
          </div>
        </div>

        <div className="relative grid gap-3">
          {auditLogs.length === 0 ? (
            <p className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50">
              No user audit records yet.
            </p>
          ) : (
            auditLogs.slice(0, 8).map((log) => (
              <div
                key={log.id || `${log.action}-${log.created_at}`}
                className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 text-sm shadow-sm dark:border-slate-800 dark:from-slate-900/80 dark:to-slate-950"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-black capitalize text-slate-900 dark:text-white">
                    {String(log.action || '').replaceAll('_', ' ')}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {formatDate(log.created_at)}
                  </p>
                </div>

                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  {log.details || 'Account activity recorded.'}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      {resetUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleResetPassword}
            className="relative w-full max-w-md overflow-hidden rounded-[34px] border border-white/10 bg-white p-6 shadow-2xl dark:bg-slate-950"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/10" />

            <div className="relative mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                  Reset Password
                </p>
                <h3 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
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
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-4 text-sm font-black text-slate-950 shadow-[0_18px_38px_rgba(14,165,233,0.24)] disabled:opacity-70"
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
