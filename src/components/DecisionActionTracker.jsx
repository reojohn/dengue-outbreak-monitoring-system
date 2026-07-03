import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  MapPin,
  PencilLine,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  UserRoundCheck,
} from 'lucide-react'
import {
  createDecisionAction,
  deleteDecisionAction,
  getDecisionActions,
  updateDecisionAction,
} from '../services/api'

const ACTION_STATUSES = ['Pending', 'In Progress', 'Completed']

const INTERVENTION_TYPES = [
  'Source reduction',
  'Larvicide application',
  'Fogging operation',
  'Health education',
  'House-to-house inspection',
  'Case monitoring',
  'Barangay coordination',
  'Clean-up drive',
]

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatShortDate(value) {
  if (!value) return 'No follow-up date'

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function getRiskBadgeStyle(risk) {
  if (risk === 'High') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
  }

  if (risk === 'Moderate') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
  }

  if (risk === 'Low') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
}

function getStatusBadgeStyle(status) {
  if (status === 'Completed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  if (status === 'In Progress') {
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
}

function getDefaultAction(row) {
  return (
    row?.primaryAction ||
    row?.recommendedAction ||
    row?.decisionSupport?.primaryAction ||
    row?.decisionSupport?.summary ||
    'Review barangay risk profile and coordinate dengue prevention action.'
  )
}

function getRecommendedIntervention(row) {
  const risk = row?.risk || row?.riskLevel
  const action = String(getDefaultAction(row)).toLowerCase()

  if (action.includes('source') || action.includes('cleanup') || action.includes('clean-up')) {
    return 'Source reduction'
  }

  if (action.includes('fog')) return 'Fogging operation'
  if (action.includes('larvicide')) return 'Larvicide application'
  if (action.includes('education') || action.includes('advisory') || action.includes('messaging')) return 'Health education'
  if (action.includes('inspection') || action.includes('house')) return 'House-to-house inspection'
  if (action.includes('monitor')) return 'Case monitoring'
  if (risk === 'High') return 'Source reduction'
  if (risk === 'Moderate') return 'House-to-house inspection'

  return 'Barangay coordination'
}

function getDefaultAssignee(row) {
  if (row?.risk === 'High') return 'CHO / BHW / Barangay Health Committee'
  if (row?.risk === 'Moderate') return 'BHW / Barangay Health Committee'
  return 'Barangay Health Worker'
}

function buildFormFromRow(row) {
  const today = new Date()

  return {
    barangay: normalizeText(row?.barangay, ''),
    risk_level: normalizeText(row?.risk || row?.riskLevel, 'Pending'),
    action: getDefaultAction(row),
    assigned_to: getDefaultAssignee(row),
    status: 'Pending',
    due_date: addDays(today, row?.risk === 'High' ? 3 : 7),
    follow_up_date: addDays(today, row?.risk === 'High' ? 3 : 7),
    intervention_type: getRecommendedIntervention(row),
    remarks: row?.risk === 'High'
      ? 'Coordinate with purok leaders and prioritize field validation.'
      : 'Schedule follow-up based on latest dengue risk ranking.',
    source: 'forecast_decision_support',
  }
}

function buildEmptyForm(priorityRows = []) {
  if (priorityRows.length > 0) {
    return buildFormFromRow(priorityRows[0])
  }

  const dueDate = addDays(new Date(), 7)

  return {
    barangay: '',
    risk_level: 'Pending',
    action: 'Review barangay risk profile and coordinate dengue prevention action.',
    assigned_to: 'BHW / CHO',
    status: 'Pending',
    due_date: dueDate,
    follow_up_date: dueDate,
    intervention_type: 'Barangay coordination',
    remarks: '',
    source: 'manual_decision_action',
  }
}

function StatPill({ icon: Icon, label, value, helper, tone = 'slate' }) {
  const tones = {
    slate: {
      card: 'border-slate-200/80 bg-white/95 text-brand-text shadow-slate-200/70 dark:border-slate-800/80 dark:bg-slate-950/90 dark:text-slate-100 dark:shadow-black/20',
      icon: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      glow: 'bg-slate-400/15',
      line: 'from-slate-500 to-slate-300',
    },
    amber: {
      card: 'border-amber-100 bg-amber-50/90 text-amber-800 shadow-amber-100/70 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:shadow-black/20',
      icon: 'border-amber-200 bg-white text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
      glow: 'bg-amber-400/20',
      line: 'from-amber-500 to-orange-400',
    },
    blue: {
      card: 'border-blue-100 bg-blue-50/90 text-blue-800 shadow-blue-100/70 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300 dark:shadow-black/20',
      icon: 'border-blue-200 bg-white text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
      glow: 'bg-blue-400/20',
      line: 'from-blue-600 to-sky-400',
    },
    emerald: {
      card: 'border-emerald-100 bg-emerald-50/90 text-emerald-800 shadow-emerald-100/70 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:shadow-black/20',
      icon: 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
      glow: 'bg-emerald-400/20',
      line: 'from-emerald-500 to-teal-400',
    },
    red: {
      card: 'border-red-100 bg-red-50/90 text-red-800 shadow-red-100/70 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:shadow-black/20',
      icon: 'border-red-200 bg-white text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
      glow: 'bg-red-400/20',
      line: 'from-red-500 to-rose-400',
    },
  }

  const style = tones[tone] || tones.slate

  return (
    <div className={`group relative overflow-hidden rounded-[26px] border p-4 shadow-[0_18px_42px_rgba(15,23,42,0.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(15,23,42,0.12)] ${style.card}`}>
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-3xl ${style.glow}`} />
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.line}`} />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
            {label}
          </span>

          <p className="mt-2 text-3xl font-black tracking-tight">
            {value}
          </p>

          {helper && (
            <p className="mt-1 text-xs font-semibold leading-5 opacity-70">
              {helper}
            </p>
          )}
        </div>

        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border shadow-sm ${style.icon}`}>
          <Icon className="h-5 w-5" strokeWidth={2.4} />
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }) {
  return (
    <label className="text-[11px] font-black uppercase tracking-[0.15em] text-brand-muted dark:text-slate-500">
      {children}
    </label>
  )
}

function inputClassName() {
  return 'mt-2 w-full rounded-[18px] border border-slate-200/90 bg-white/95 px-4 py-3 text-sm font-semibold text-brand-text shadow-sm outline-none transition duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-blue/50 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700/80 dark:bg-slate-950/90 dark:text-slate-100 dark:placeholder:text-slate-600 dark:hover:border-slate-600 dark:focus:border-blue-400/50 dark:focus:ring-blue-500/10'
}

function DropdownScrollArea({ children, maxHeight = 'max-h-[260px]' }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-white via-white/90 to-transparent dark:from-slate-950 dark:via-slate-950/90" />

      <div className={`${maxHeight} overflow-y-auto overscroll-contain scroll-smooth p-2 pr-1.5 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(96,165,250,0.85)_rgba(226,232,240,0.9)] dark:[scrollbar-color:rgba(96,165,250,0.75)_rgba(15,23,42,0.92)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:my-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100/90 dark:[&::-webkit-scrollbar-track]:bg-slate-900/90 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-white [&::-webkit-scrollbar-thumb]:bg-blue-400/80 hover:[&::-webkit-scrollbar-thumb]:bg-blue-500 dark:[&::-webkit-scrollbar-thumb]:border-slate-950 dark:[&::-webkit-scrollbar-thumb]:bg-blue-400/70 dark:hover:[&::-webkit-scrollbar-thumb]:bg-sky-300`}>
        {children}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-slate-950 dark:via-slate-950/90" />
    </div>
  )
}

function TaskBoardScrollArea({ children }) {
  return (
    <div className="relative mt-5 overflow-hidden rounded-[32px] border border-slate-200/70 bg-slate-50/70 shadow-inner dark:border-slate-800/80 dark:bg-slate-950/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-9 bg-gradient-to-b from-slate-50 via-slate-50/90 to-transparent dark:from-slate-950 dark:via-slate-950/90" />

      <div className="max-h-[1120px] min-h-[720px] space-y-4 overflow-y-auto overscroll-contain scroll-smooth px-3 py-4 pb-10 pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(96,165,250,0.85)_rgba(226,232,240,0.86)] dark:[scrollbar-color:rgba(96,165,250,0.75)_rgba(15,23,42,0.96)] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:my-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-200/70 dark:[&::-webkit-scrollbar-track]:bg-slate-900/95 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-50 [&::-webkit-scrollbar-thumb]:bg-blue-400/85 hover:[&::-webkit-scrollbar-thumb]:bg-blue-500 dark:[&::-webkit-scrollbar-thumb]:border-slate-950 dark:[&::-webkit-scrollbar-thumb]:bg-blue-400/75 dark:hover:[&::-webkit-scrollbar-thumb]:bg-sky-300">
        {children}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-9 bg-gradient-to-t from-slate-50 via-slate-50/90 to-transparent dark:from-slate-950 dark:via-slate-950/90" />
    </div>
  )
}

function PremiumBadge({ children, icon: Icon, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] shadow-sm ${className}`}>
      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />}
      {children}
    </span>
  )
}

function SoftDivider() {
  return (
    <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-800" />
  )
}

function ActionMiniField({ label, value }) {
  return (
    <div className="rounded-[18px] border border-slate-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <p className="text-[10px] font-black uppercase tracking-[0.13em] text-brand-muted dark:text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-brand-text dark:text-slate-200">
        {value || 'Not set'}
      </p>
    </div>
  )
}

function PremiumSelect({
  value,
  options = [],
  onChange,
  placeholder = 'Select option',
  helper = 'Choose one option',
  menuMaxHeight = 'max-h-[260px]',
}) {
  const [isOpen, setIsOpen] = useState(false)

  const normalizedOptions = options.map((option) => {
    if (typeof option === 'string') {
      return {
        label: option,
        value: option,
      }
    }

    return option
  })

  const selectedOption =
    normalizedOptions.find((option) => option.value === value) || null

  const displayLabel = selectedOption?.label || value || placeholder
  const displayHelper = selectedOption?.helper || helper

  function handleSelect(option) {
    onChange(option.value)
    setIsOpen(false)
  }

  return (
    <div className="relative mt-2">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-[22px] border border-blue-200/80 bg-gradient-to-r from-white via-blue-50/70 to-white px-4 py-3.5 text-left text-sm font-black text-slate-950 shadow-[0_12px_30px_rgba(37,95,143,0.12)] outline-none transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_16px_38px_rgba(37,95,143,0.18)] focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-blue-500/30 dark:from-slate-950 dark:via-blue-950/50 dark:to-slate-950 dark:text-white dark:shadow-[0_16px_38px_rgba(0,0,0,0.25)] dark:focus:ring-blue-500/10"
      >
        <span className="min-w-0">
          <span className="block truncate">
            {displayLabel}
          </span>

          <span className="mt-0.5 block truncate text-xs font-semibold text-brand-muted dark:text-slate-400">
            {displayHelper}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {selectedOption?.badge && (
            <span className={`hidden rounded-full border px-2.5 py-1 text-[10px] font-black sm:inline-flex ${selectedOption.badgeClassName || 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'}`}>
              {selectedOption.badge}
            </span>
          )}

          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-white text-brand-blue shadow-sm transition dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-4 w-4" strokeWidth={2.6} />
          </span>
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-[90] mt-2 overflow-hidden rounded-[24px] border border-blue-100 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)] ring-1 ring-white/80 dark:border-blue-500/20 dark:bg-slate-950 dark:ring-white/10">
          <DropdownScrollArea maxHeight={menuMaxHeight}>
            {normalizedOptions.map((option) => {
              const isSelected = option.value === value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`group flex w-full items-center justify-between gap-3 rounded-[18px] px-3.5 py-3 text-left text-sm transition ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_12px_28px_rgba(37,95,143,0.28)]'
                      : 'text-slate-700 hover:bg-blue-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-blue-500/10 dark:hover:text-white'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-black">
                      {option.label}
                    </span>

                    {option.helper && (
                      <span className={`mt-0.5 block truncate text-xs font-semibold ${
                        isSelected
                          ? 'text-white/80'
                          : 'text-brand-muted dark:text-slate-500'
                      }`}>
                        {option.helper}
                      </span>
                    )}
                  </span>

                  {option.badge && (
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black ${
                      isSelected
                        ? 'border-white/25 bg-white/20 text-white'
                        : option.badgeClassName || 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
                    }`}>
                      {option.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </DropdownScrollArea>
        </div>
      )}
    </div>
  )
}

function getRiskOptions() {
  return ['High', 'Moderate', 'Low', 'Pending'].map((risk) => ({
    label: risk,
    value: risk,
    badge: `${risk} risk`,
    badgeClassName: getRiskBadgeStyle(risk),
    helper:
      risk === 'High'
        ? 'Needs faster response'
        : risk === 'Moderate'
          ? 'Needs scheduled checking'
          : risk === 'Low'
            ? 'Continue monitoring'
            : 'Waiting for final risk level',
  }))
}

function getStatusOptions() {
  return ACTION_STATUSES.map((status) => ({
    label: status,
    value: status,
    badge: status,
    badgeClassName: getStatusBadgeStyle(status),
    helper:
      status === 'Completed'
        ? 'Task is already finished'
        : status === 'In Progress'
          ? 'Task is currently being handled'
          : 'Task still needs action',
  }))
}

function getInterventionOptions() {
  return INTERVENTION_TYPES.map((type) => ({
    label: type,
    value: type,
    helper: 'Barangay response action type',
  }))
}

export default function DecisionActionTracker({ priorityRows = [] }) {
  const [actions, setActions] = useState([])
  const [summary, setSummary] = useState({ total: 0, pending: 0, in_progress: 0, completed: 0, overdue: 0 })
  const [form, setForm] = useState(() => buildEmptyForm(priorityRows))
  const [selectedBarangay, setSelectedBarangay] = useState(priorityRows[0]?.barangay || '')
  const [editedActions, setEditedActions] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [isRecommendationOpen, setIsRecommendationOpen] = useState(false)

  const availableRows = useMemo(() => {
    const seen = new Set()

    return priorityRows.filter((row) => {
      const barangay = normalizeText(row?.barangay)
      if (!barangay || seen.has(barangay)) return false
      seen.add(barangay)
      return true
    })
  }, [priorityRows])

  const selectedRow = useMemo(
    () => availableRows.find((row) => row.barangay === selectedBarangay) || availableRows[0] || null,
    [availableRows, selectedBarangay]
  )

  async function loadActions() {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const result = await getDecisionActions()
      setActions(Array.isArray(result?.actions) ? result.actions : [])
      setSummary(result?.summary || { total: 0, pending: 0, in_progress: 0, completed: 0, overdue: 0 })
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to load action records.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadActions()
  }, [])

  useEffect(() => {
    if (!selectedRow) return
    setForm(buildFormFromRow(selectedRow))
  }, [selectedRow])

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'due_date' ? { follow_up_date: value } : {}),
    }))
  }

  function updateEditedAction(actionId, field, value) {
    setEditedActions((current) => ({
      ...current,
      [actionId]: {
        ...(current[actionId] || {}),
        [field]: value,
        ...(field === 'due_date' ? { follow_up_date: value } : {}),
      },
    }))
  }

  async function handleCreateAction(event) {
    event.preventDefault()
    setIsSaving(true)
    setErrorMessage('')
    setStatusMessage('')

    try {
      const result = await createDecisionAction({
        ...form,
        barangay: normalizeText(form.barangay, selectedRow?.barangay || 'Unassigned barangay'),
        action: normalizeText(form.action, getDefaultAction(selectedRow)),
      })
      setStatusMessage(`Action created for ${result?.action?.barangay || form.barangay}.`)
      await loadActions()
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to create action record.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUpdateAction(action) {
    setIsSaving(true)
    setErrorMessage('')
    setStatusMessage('')

    const edits = editedActions[action.id] || {}

    try {
      const result = await updateDecisionAction(action.id, {
        assigned_to: edits.assigned_to ?? action.assigned_to,
        status: edits.status ?? action.status,
        due_date: edits.due_date ?? action.due_date,
        follow_up_date: edits.follow_up_date ?? action.follow_up_date,
        intervention_type: edits.intervention_type ?? action.intervention_type,
        remarks: edits.remarks ?? action.remarks,
      })

      setStatusMessage(`Action for ${result?.action?.barangay || action.barangay} updated.`)
      setEditedActions((current) => {
        const next = { ...current }
        delete next[action.id]
        return next
      })
      await loadActions()
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to update action record.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteAction(action) {
    setIsSaving(true)
    setErrorMessage('')
    setStatusMessage('')

    try {
      await deleteDecisionAction(action.id)
      setStatusMessage(`Action for ${action.barangay} removed.`)
      await loadActions()
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to remove action record.')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredActions = actions.filter((action) => {
    if (statusFilter === 'All') return true
    return action.status === statusFilter
  })

  const recentActions = filteredActions
  const completionRate = summary.total > 0
    ? Math.round((Number(summary.completed || 0) / Number(summary.total || 1)) * 100)
    : 0

  const statusFilters = [
    ['All', summary.total || 0],
    ['Pending', summary.pending || 0],
    ['In Progress', summary.in_progress || 0],
    ['Completed', summary.completed || 0],
  ]

  return (
    <section
      id="decision-action-tracking"
      className="relative overflow-visible rounded-[38px] border border-slate-200/80 bg-white/90 shadow-[0_28px_80px_rgba(15,23,42,0.10)] ring-1 ring-white/70 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/85 dark:ring-white/5"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top_left,rgba(37,95,143,0.18),transparent_38%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_34%)]" />

      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 px-5 py-7 text-white sm:px-6 lg:px-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-16 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_35%,rgba(255,255,255,0.04))]" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
          <div>
            <PremiumBadge
              icon={ClipboardCheck}
              className="border-white/15 bg-white/10 text-white/80 backdrop-blur"
            >
              Action command center
            </PremiumBadge>

            <h2 className="mt-4 max-w-4xl text-3xl font-black tracking-tight sm:text-4xl">
              Barangay Response Action Tracker
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/80 sm:text-base">
              Turn dengue recommendations into assigned response tasks. Track the person in charge, action type, follow-up date, current status, and field remarks in one command-style panel.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/15 bg-white/10 p-4 shadow-[0_20px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/70">
                  Completion rate
                </p>
                <p className="mt-2 text-4xl font-black tracking-tight">
                  {completionRate}%
                </p>
              </div>

              <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-white/15 ring-1 ring-white/20">
                <CheckCircle2 className="h-7 w-7" strokeWidth={2.3} />
              </div>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.45)]"
                style={{ width: `${completionRate}%` }}
              />
            </div>

            <p className="mt-3 text-xs font-semibold leading-5 text-white/70">
              {summary.completed || 0} of {summary.total || 0} action records are completed.
            </p>
          </div>
        </div>

        <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusFilters.map(([filter, count]) => {
              const isActive = statusFilter === filter

              return (
                <button
  key={filter}
  type="button"
  onClick={() => setStatusFilter(filter)}
  style={
    isActive
      ? {
          backgroundColor: '#ffffff',
          color: '#0f172a',
          borderColor: '#ffffff',
        }
      : undefined
  }
  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-black transition ${
    isActive
      ? 'shadow-[0_14px_34px_rgba(255,255,255,0.28)]'
      : 'border-white/15 bg-white/10 text-white/75 hover:bg-white/15 hover:text-white'
  }`}
>
  {filter}

  <span
    style={
      isActive
        ? {
            backgroundColor: '#0f172a',
            color: '#ffffff',
          }
        : undefined
    }
    className={`rounded-full px-2 py-0.5 text-[10px] ${
      isActive ? '' : 'bg-white/15 text-white'
    }`}
  >
    {count}
  </span>
</button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={loadActions}
            disabled={isLoading}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh list
          </button>
        </div>
      </div>

      <div className="relative p-5 sm:p-6 lg:p-7">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatPill icon={ClipboardList} label="Total" value={summary.total || 0} helper="All records" />
          <StatPill icon={AlertTriangle} label="Pending" value={summary.pending || 0} helper="Needs action" tone="amber" />
          <StatPill icon={ShieldAlert} label="Ongoing" value={summary.in_progress || 0} helper="Being handled" tone="blue" />
          <StatPill icon={CheckCircle2} label="Completed" value={summary.completed || 0} helper="Finished tasks" tone="emerald" />
          <StatPill icon={CalendarClock} label="Overdue" value={summary.overdue || 0} helper="Past follow-up" tone="red" />
        </div>

        {(statusMessage || errorMessage) && (
          <div className={`mt-5 overflow-hidden rounded-[24px] border px-4 py-3 text-sm font-semibold shadow-sm ${
            errorMessage
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          }`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm dark:bg-white/10">
                {errorMessage ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              </div>
              <p className="pt-1 leading-6">{errorMessage || statusMessage}</p>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(360px,0.84fr)_minmax(0,1.16fr)]">
          <form
            onSubmit={handleCreateAction}
            className="relative overflow-visible rounded-[34px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-blue-50/50 p-4 shadow-[0_22px_58px_rgba(15,23,42,0.08)] ring-1 ring-white/80 dark:border-slate-800/80 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20 dark:ring-white/5 sm:p-5"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-0 h-44 w-44 rounded-full bg-emerald-500/10 blur-3xl" />

            <div className="relative">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.22)] dark:bg-white dark:text-slate-950">
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </div>

                <div>
                  <h3 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                    Create response action
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                    Start from a forecast recommendation, then assign the task to the right team.
                  </p>
                </div>
              </div>

              {availableRows.length > 0 && (
                <div className="mt-5 rounded-[24px] border border-blue-100 bg-white/80 p-4 shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand-blue dark:text-blue-300">
                        Suggested priority
                      </p>
                      <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                        {selectedRow?.barangay || 'No barangay selected'}
                      </p>
                    </div>

                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${getRiskBadgeStyle(selectedRow?.risk || selectedRow?.riskLevel)}`}>
                      {selectedRow?.risk || selectedRow?.riskLevel || 'Pending'} risk
                    </span>
                  </div>

                  <div className="relative mt-3">
                    <FieldLabel>Use forecast recommendation</FieldLabel>

                    <button
                      type="button"
                      onClick={() => setIsRecommendationOpen((current) => !current)}
                      className="mt-2 flex w-full items-center justify-between gap-3 rounded-[22px] border border-blue-200/80 bg-gradient-to-r from-white via-blue-50/70 to-white px-4 py-3.5 text-left text-sm font-black text-slate-950 shadow-[0_12px_30px_rgba(37,95,143,0.12)] outline-none transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_16px_38px_rgba(37,95,143,0.18)] focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-blue-500/30 dark:from-slate-950 dark:via-blue-950/50 dark:to-slate-950 dark:text-white dark:shadow-[0_16px_38px_rgba(0,0,0,0.25)] dark:focus:ring-blue-500/10"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          {selectedRow?.barangay || 'Select barangay'}
                          <span className="mx-1 text-blue-500 dark:text-blue-300">•</span>
                          {selectedRow?.risk || selectedRow?.riskLevel || 'Pending'} risk
                        </span>

                        <span className="mt-0.5 block text-xs font-semibold text-brand-muted dark:text-slate-400">
                          Choose which forecast result will fill the action form
                        </span>
                      </span>

                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-white text-brand-blue shadow-sm transition dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 ${
                        isRecommendationOpen ? 'rotate-180' : ''
                      }`}>
                        <ChevronDown className="h-4 w-4" strokeWidth={2.6} />
                      </span>
                    </button>

                    {isRecommendationOpen && (
                      <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-[24px] border border-blue-100 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)] ring-1 ring-white/80 dark:border-blue-500/20 dark:bg-slate-950 dark:ring-white/10">
                        <DropdownScrollArea maxHeight="max-h-[260px]">
                          {availableRows.slice(0, 15).map((row) => {
                            const isSelected = row.barangay === selectedBarangay
                            const risk = row.risk || row.riskLevel || 'Pending'

                            return (
                              <button
                                key={row.barangay}
                                type="button"
                                onClick={() => {
                                  setSelectedBarangay(row.barangay)
                                  setIsRecommendationOpen(false)
                                }}
                                className={`group flex w-full items-center justify-between gap-3 rounded-[18px] px-3.5 py-3 text-left text-sm transition ${
                                  isSelected
                                    ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_12px_28px_rgba(37,95,143,0.28)]'
                                    : 'text-slate-700 hover:bg-blue-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-blue-500/10 dark:hover:text-white'
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-black">
                                    {row.barangay}
                                  </span>

                                  <span className={`mt-0.5 block text-xs font-semibold ${
                                    isSelected
                                      ? 'text-white/80'
                                      : 'text-brand-muted dark:text-slate-500'
                                  }`}>
                                    Suggested barangay from forecast ranking
                                  </span>
                                </span>

                                <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black ${
                                  isSelected
                                    ? 'border-white/25 bg-white/20 text-white'
                                    : getRiskBadgeStyle(risk)
                                }`}>
                                  {risk} risk
                                </span>
                              </button>
                            )
                          })}
                        </DropdownScrollArea>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="relative mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Barangay</FieldLabel>
                  <input
                    value={form.barangay}
                    onChange={(event) => updateForm('barangay', event.target.value)}
                    className={inputClassName()}
                    placeholder="Baan KM 3"
                  />
                </div>

                <div>
                  <FieldLabel>Risk level</FieldLabel>
                  <PremiumSelect
                    value={form.risk_level}
                    options={getRiskOptions()}
                    onChange={(value) => updateForm('risk_level', value)}
                    placeholder="Select risk level"
                    helper="Choose the current barangay risk level"
                  />
                </div>
              </div>

              <div className="mt-4">
                <FieldLabel>Recommended action</FieldLabel>
                <textarea
                  value={form.action}
                  onChange={(event) => updateForm('action', event.target.value)}
                  className={`${inputClassName()} min-h-[118px] resize-y leading-6`}
                  placeholder="Conduct source reduction"
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Assigned to</FieldLabel>
                  <input
                    value={form.assigned_to}
                    onChange={(event) => updateForm('assigned_to', event.target.value)}
                    className={inputClassName()}
                    placeholder="BHW / CHO"
                  />
                </div>

                <div>
                  <FieldLabel>Status</FieldLabel>
                  <PremiumSelect
                    value={form.status}
                    options={getStatusOptions()}
                    onChange={(value) => updateForm('status', value)}
                    placeholder="Select status"
                    helper="Choose the current task status"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Action type</FieldLabel>
                  <PremiumSelect
                    value={form.intervention_type}
                    options={getInterventionOptions()}
                    onChange={(value) => updateForm('intervention_type', value)}
                    placeholder="Select action type"
                    helper="Choose the response action type"
                  />
                </div>

                <div>
                  <FieldLabel>Follow-up date</FieldLabel>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(event) => updateForm('due_date', event.target.value)}
                    className={inputClassName()}
                  />
                </div>
              </div>

              <div className="mt-4">
                <FieldLabel>Remarks</FieldLabel>
                <textarea
                  value={form.remarks}
                  onChange={(event) => updateForm('remarks', event.target.value)}
                  className={`${inputClassName()} min-h-[96px] resize-y leading-6`}
                  placeholder="Coordinate with purok leaders"
                />
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <ActionMiniField label="Task owner" value={form.assigned_to} />
                <ActionMiniField label="Action type" value={form.intervention_type} />
                <ActionMiniField label="Follow-up" value={formatShortDate(form.due_date)} />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="group relative mt-5 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-[22px] bg-gradient-to-r from-slate-950 via-blue-950 to-brand-blue px-5 py-3.5 text-sm font-black text-white shadow-[0_18px_40px_rgba(37,95,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_52px_rgba(37,95,143,0.38)] disabled:cursor-not-allowed disabled:opacity-60 dark:from-white dark:via-slate-100 dark:to-blue-100 dark:text-slate-950"
              >
                <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/20 blur-2xl transition group-hover:bg-white/30" />
                <span className="relative inline-flex items-center gap-2">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  Save action record
                </span>
              </button>
            </div>
          </form>

          <div className="relative overflow-visible rounded-[34px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_22px_58px_rgba(15,23,42,0.08)] ring-1 ring-white/80 dark:border-slate-800/80 dark:bg-slate-950/90 dark:ring-white/5 sm:p-5">
            <div className="pointer-events-none absolute -right-20 top-0 h-56 w-56 rounded-full bg-slate-200/60 blur-3xl dark:bg-blue-500/10" />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <PremiumBadge
                  icon={UserRoundCheck}
                  className="border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                >
                  Live task board
                </PremiumBadge>

                <h3 className="mt-3 text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  Active response tracker
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Update the person assigned, task status, follow-up date, action type, and field notes.
                </p>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-right shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                  Showing
                </p>
                <p className="mt-1 text-2xl font-black text-brand-text dark:text-slate-100">
                  {recentActions.length}
                </p>
              </div>
            </div>

            <div className="relative mt-5">
              <SoftDivider />
            </div>

            <TaskBoardScrollArea>
              {isLoading ? (
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-brand-muted dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
                  Loading action records...
                </div>
              ) : recentActions.length > 0 ? (
                recentActions.map((action) => {
                  const edits = editedActions[action.id] || {}
                  const currentStatus = edits.status ?? action.status
                  const currentDueDate = edits.due_date ?? action.due_date
                  const currentAssignee = edits.assigned_to ?? action.assigned_to
                  const currentInterventionType = edits.intervention_type ?? action.intervention_type
                  const currentRemarks = edits.remarks ?? action.remarks

                  return (
                    <article
                      key={action.id}
                      className="group overflow-visible rounded-[30px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-white p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-brand-blue/25 hover:shadow-[0_18px_44px_rgba(15,23,42,0.08)] dark:border-slate-800/80 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-brand-text shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                              <MapPin className="h-3.5 w-3.5" />
                              {action.barangay}
                            </span>
                            <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${getRiskBadgeStyle(action.risk_level)}`}>
                              {action.risk_level} risk
                            </span>
                            <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${getStatusBadgeStyle(currentStatus)}`}>
                              {currentStatus}
                            </span>
                          </div>

                          <p className="mt-3 text-base font-black leading-6 text-brand-text dark:text-slate-100">
                            {action.action}
                          </p>

                          <p className="mt-2 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-500">
                            Due {formatShortDate(currentDueDate)} • Updated {formatDateTime(action.updated_at)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteAction(action)}
                          disabled={isSaving}
                          className="inline-flex w-fit items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div>
                          <FieldLabel>Assigned to</FieldLabel>
                          <input
                            value={currentAssignee || ''}
                            onChange={(event) => updateEditedAction(action.id, 'assigned_to', event.target.value)}
                            className={inputClassName()}
                          />
                        </div>

                        <div>
                          <FieldLabel>Status</FieldLabel>
                          <PremiumSelect
                            value={currentStatus || 'Pending'}
                            options={getStatusOptions()}
                            onChange={(value) => updateEditedAction(action.id, 'status', value)}
                            placeholder="Select status"
                            helper="Update this task status"
                          />
                        </div>

                        <div>
                          <FieldLabel>Action type</FieldLabel>
                          <PremiumSelect
                            value={currentInterventionType || 'Barangay coordination'}
                            options={getInterventionOptions()}
                            onChange={(value) => updateEditedAction(action.id, 'intervention_type', value)}
                            placeholder="Select action type"
                            helper="Update this action type"
                          />
                        </div>

                        <div>
                          <FieldLabel>Follow-up date</FieldLabel>
                          <input
                            type="date"
                            value={currentDueDate || ''}
                            onChange={(event) => updateEditedAction(action.id, 'due_date', event.target.value)}
                            className={inputClassName()}
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <FieldLabel>Remarks / field notes</FieldLabel>
                        <textarea
                          value={currentRemarks || ''}
                          onChange={(event) => updateEditedAction(action.id, 'remarks', event.target.value)}
                          className={`${inputClassName()} min-h-[88px] resize-y leading-6`}
                        />
                      </div>

                      <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/80 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <ActionMiniField label="Owner" value={currentAssignee} />
                          <ActionMiniField label="Follow-up" value={formatShortDate(currentDueDate)} />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleUpdateAction(action)}
                          disabled={isSaving}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_28px_rgba(37,95,143,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(37,95,143,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PencilLine className="h-3.5 w-3.5" />}
                          Update record
                        </button>
                      </div>
                    </article>
                  )
                })
              ) : (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
                  <ClipboardList className="mx-auto h-9 w-9 text-brand-muted dark:text-slate-500" />
                  <p className="mt-3 text-sm font-black text-brand-text dark:text-slate-100">
                    No action records shown
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-brand-muted dark:text-slate-400">
                    Create the first response action or change the status filter to view other records.
                  </p>
                </div>
              )}
            </TaskBoardScrollArea>
          </div>
        </div>
      </div>
    </section>
  )
}
