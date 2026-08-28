import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  Filter,
  Loader2,
  RefreshCcw,
  Search,
  UserRoundCheck,
} from 'lucide-react'
import { getDecisionActions, getFieldUpdates } from '../services/api'

const STATUS_ORDER = [
  'All',
  'Needs Action',
  'Not Assigned',
  'Assigned',
  'In Progress',
  'Action Taken',
  'Follow-up Required',
]

function normalizeBarangay(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function parseDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isInCurrentCycle(value, cycleStart) {
  const cycleDate = parseDate(cycleStart)
  if (!cycleDate) return true
  const itemDate = parseDate(value)
  if (!itemDate) return true
  return itemDate.getTime() >= cycleDate.getTime()
}

function formatCycleDate(value) {
  const parsed = parseDate(value)
  if (!parsed) return 'Current saved forecast'
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function formatDateTime(value) {
  const parsed = parseDate(value)
  if (!parsed) return 'No update yet'
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function getActionTimestamp(action) {
  return action?.updated_at || action?.created_at || ''
}

function getFieldTimestamp(update) {
  return (
    update?.reviewed_at ||
    update?.updated_at ||
    update?.submitted_at ||
    update?.created_at ||
    (update?.reporting_date ? `${String(update.reporting_date).slice(0, 10)}T23:59:59` : '')
  )
}

function latestByTimestamp(items, getTimestamp) {
  return [...items].sort((a, b) => {
    const aTime = parseDate(getTimestamp(a))?.getTime() || 0
    const bTime = parseDate(getTimestamp(b))?.getTime() || 0
    return bTime - aTime
  })[0] || null
}

function getStatusMeta(status) {
  const styles = {
    'Action Taken': {
      icon: CheckCircle2,
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
      dot: 'bg-emerald-500',
      card: 'border-emerald-200/80 bg-emerald-50/75 dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]',
    },
    'In Progress': {
      icon: Clock3,
      badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200',
      dot: 'bg-blue-500',
      card: 'border-blue-200/80 bg-blue-50/75 dark:border-blue-500/20 dark:bg-blue-500/[0.08]',
    },
    Assigned: {
      icon: UserRoundCheck,
      badge: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-200',
      dot: 'bg-cyan-500',
      card: 'border-cyan-200/80 bg-cyan-50/70 dark:border-cyan-500/20 dark:bg-cyan-500/[0.08]',
    },
    'Follow-up Required': {
      icon: AlertCircle,
      badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
      dot: 'bg-amber-500',
      card: 'border-amber-200/80 bg-amber-50/75 dark:border-amber-500/20 dark:bg-amber-500/[0.08]',
    },
    'Not Assigned': {
      icon: CircleDashed,
      badge: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      dot: 'bg-slate-400',
      card: 'border-slate-200/90 bg-white/85 dark:border-slate-700 dark:bg-slate-950/70',
    },
  }

  return styles[status] || styles['Not Assigned']
}

function getRiskBadge(risk) {
  if (risk === 'High') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200'
  if (risk === 'Moderate') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200'
}

function buildActionLabel(actions) {
  if (!actions.length) return 'No response assigned'
  const uniqueTypes = [...new Set(actions.map((item) => String(item?.intervention_type || '').trim()).filter(Boolean))]
  if (!uniqueTypes.length) return `${actions.length} coordinated action${actions.length === 1 ? '' : 's'}`
  if (uniqueTypes.length === 1) return uniqueTypes[0]
  return `${uniqueTypes[0]} + ${uniqueTypes.length - 1} more`
}

function actionBelongsToCurrentCycle(action, cycleStart, cycleId) {
  const source = String(action?.source || '')
  if (cycleId && source.startsWith('forecast_cycle:')) {
    return source === `forecast_cycle:${cycleId}` || source.startsWith(`forecast_cycle:${cycleId}:`)
  }
  return isInCurrentCycle(action?.created_at || action?.updated_at, cycleStart)
}

function buildCoverageRow(row, actions, fieldUpdates, cycleStart, cycleId) {
  const key = normalizeBarangay(row?.barangay)
  const barangayActions = actions.filter((action) => {
    return normalizeBarangay(action?.barangay) === key && actionBelongsToCurrentCycle(action, cycleStart, cycleId)
  })
  const barangayUpdates = fieldUpdates.filter((update) => {
    return normalizeBarangay(update?.barangay) === key && isInCurrentCycle(getFieldTimestamp(update), cycleStart)
  })

  const completed = barangayActions.filter((action) => action?.status === 'Completed').length
  const inProgress = barangayActions.filter((action) => action?.status === 'In Progress').length
  const pending = barangayActions.filter((action) => action?.status === 'Pending').length
  const latestField = latestByTimestamp(barangayUpdates, getFieldTimestamp)
  const followUpRequired = latestField?.status === 'Follow-up Required'

  let responseStatus = 'Not Assigned'
  if (followUpRequired) responseStatus = 'Follow-up Required'
  else if (inProgress > 0) responseStatus = 'In Progress'
  else if (pending > 0) responseStatus = 'Assigned'
  else if (barangayActions.length > 0 && completed === barangayActions.length) responseStatus = 'Action Taken'

  const latestAction = latestByTimestamp(barangayActions, getActionTimestamp)
  const latestTimestamp = [getActionTimestamp(latestAction), getFieldTimestamp(latestField)]
    .filter(Boolean)
    .sort((a, b) => (parseDate(b)?.getTime() || 0) - (parseDate(a)?.getTime() || 0))[0] || ''

  return {
    ...row,
    responseStatus,
    responseActions: barangayActions,
    responseFieldUpdates: barangayUpdates,
    actionCount: barangayActions.length,
    completedCount: completed,
    assignedActionLabel: buildActionLabel(barangayActions),
    lastResponseUpdate: latestTimestamp,
  }
}

function SummaryCard({ label, count, status }) {
  const meta = getStatusMeta(status)
  const Icon = meta.icon
  return (
    <div className={`relative overflow-hidden rounded-[20px] border p-3.5 shadow-sm ${meta.card}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[13px] border border-white/80 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
          <Icon className="h-4 w-4 text-slate-700 dark:text-slate-200" />
        </div>
        <span className="text-2xl font-black tracking-[-0.04em] text-brand-text dark:text-white">{count}</span>
      </div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

export default function BarangayResponseCoverageTracker({
  priorityRows = [],
  forecastCycleStart = '',
  forecastCycleId = '',
}) {
  const [actions, setActions] = useState([])
  const [fieldUpdates, setFieldUpdates] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  async function loadCoverageData({ force = false, quiet = false } = {}) {
    if (!quiet) setIsRefreshing(true)
    setError('')
    try {
      const [actionResult, fieldResult] = await Promise.all([
        getDecisionActions({ force }),
        getFieldUpdates({ limit: 200, force }),
      ])
      setActions(Array.isArray(actionResult?.actions) ? actionResult.actions : [])
      setFieldUpdates(Array.isArray(fieldResult?.field_updates) ? fieldResult.field_updates : [])
    } catch (loadError) {
      setError(loadError?.message || 'Response coverage could not be loaded.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadCoverageData({ quiet: true })

    function handleDecisionData(event) {
      const nextActions = event?.detail?.actions
      if (Array.isArray(nextActions)) {
        setActions(nextActions)
        setIsLoading(false)
      }
    }

    async function handleDecisionChanged() {
      try {
        const result = await getDecisionActions({ force: true })
        setActions(Array.isArray(result?.actions) ? result.actions : [])
      } catch {
        // The action tracker is also subscribed and will publish its refreshed
        // rows when available, so a transient duplicate refresh can fail safely.
      }
    }

    function handleFieldData(event) {
      const nextUpdates = event?.detail?.updates
      if (Array.isArray(nextUpdates)) setFieldUpdates(nextUpdates)
    }

    async function handleFieldChanged() {
      try {
        const result = await getFieldUpdates({ limit: 200, force: true })
        setFieldUpdates(Array.isArray(result?.field_updates) ? result.field_updates : [])
      } catch {
        // The review panel shares the same cached request and may provide the
        // refreshed rows through dengue-field-updates-data.
      }
    }

    window.addEventListener('dengue-decision-actions-data', handleDecisionData)
    window.addEventListener('dengue-decision-actions-changed', handleDecisionChanged)
    window.addEventListener('dengue-field-updates-data', handleFieldData)
    window.addEventListener('dengue-field-updates-changed', handleFieldChanged)

    return () => {
      window.removeEventListener('dengue-decision-actions-data', handleDecisionData)
      window.removeEventListener('dengue-decision-actions-changed', handleDecisionChanged)
      window.removeEventListener('dengue-field-updates-data', handleFieldData)
      window.removeEventListener('dengue-field-updates-changed', handleFieldChanged)
    }
  }, [])

  const coverageRows = useMemo(() => {
    return priorityRows.map((row) => buildCoverageRow(row, actions, fieldUpdates, forecastCycleStart, forecastCycleId))
  }, [priorityRows, actions, fieldUpdates, forecastCycleStart, forecastCycleId])

  const counts = useMemo(() => ({
    actionTaken: coverageRows.filter((row) => row.responseStatus === 'Action Taken').length,
    inProgress: coverageRows.filter((row) => row.responseStatus === 'In Progress').length,
    assigned: coverageRows.filter((row) => row.responseStatus === 'Assigned').length,
    followUp: coverageRows.filter((row) => row.responseStatus === 'Follow-up Required').length,
    notAssigned: coverageRows.filter((row) => row.responseStatus === 'Not Assigned').length,
  }), [coverageRows])

  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeBarangay(query)
    return coverageRows.filter((row) => {
      const matchesSearch = !normalizedQuery || normalizeBarangay(row?.barangay).includes(normalizedQuery)
      const matchesStatus = statusFilter === 'All'
        ? true
        : statusFilter === 'Needs Action'
          ? ['Not Assigned', 'Follow-up Required'].includes(row.responseStatus)
          : row.responseStatus === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [coverageRows, query, statusFilter])

  function focusBarangay(row) {
    window.dispatchEvent(new CustomEvent('dengue-focus-decision-barangay', {
      detail: { barangay: row?.barangay || '' },
    }))
    window.setTimeout(() => {
      document.getElementById('decision-action-tracking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <section id="barangay-response-coverage" className="mt-5 overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-cyan-50/45 shadow-[0_18px_46px_rgba(15,23,42,0.07)] dark:border-slate-700 dark:from-slate-950 dark:via-slate-950 dark:to-cyan-500/[0.05]">
      <div className="border-b border-slate-200/80 p-4 dark:border-slate-800 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-sm dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-200">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Barangay response coverage</p>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Current forecast cycle</span>
              </div>
              <h3 className="mt-1 text-xl font-black tracking-tight text-brand-text dark:text-white">Track which barangays already received coordinated action</h3>
              <p className="mt-1.5 max-w-3xl text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">
                Status is summarized from the response actions already recorded by the supervisor. BHW reviews marked for follow-up are surfaced here automatically.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[10px] font-black text-cyan-800 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-200">
              Cycle: {formatCycleDate(forecastCycleStart)}
            </span>
            {forecastCycleId && (
              <span className="max-w-[190px] truncate rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" title={forecastCycleId}>
                Forecast {forecastCycleId.slice(0, 8)}
              </span>
            )}
            <button type="button" onClick={() => loadCoverageData({ force: true })} disabled={isRefreshing} className="inline-flex min-h-[34px] items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[18px] border border-blue-200/80 bg-blue-50/75 px-3.5 py-3 text-xs font-semibold leading-5 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
          Actions recorded before this forecast cycle remain in history, but they do not mark a barangay as completed for the current forecast response cycle.
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Action taken" count={counts.actionTaken} status="Action Taken" />
          <SummaryCard label="In progress" count={counts.inProgress} status="In Progress" />
          <SummaryCard label="Assigned" count={counts.assigned} status="Assigned" />
          <SummaryCard label="Follow-up" count={counts.followUp} status="Follow-up Required" />
          <SummaryCard label="Not assigned" count={counts.notAssigned} status="Not Assigned" />
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search barangay..." className="min-h-[44px] w-full rounded-[16px] border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-brand-text outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="h-4 w-4 shrink-0 text-slate-400" />
            {STATUS_ORDER.map((status) => (
              <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`shrink-0 rounded-full border px-3 py-2 text-[10px] font-black transition ${statusFilter === status ? 'border-cyan-500 bg-cyan-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}>
                {status}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="mt-4 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">{error}</div>}

        {isLoading ? (
          <div className="mt-4 flex min-h-[170px] items-center justify-center rounded-[22px] border border-dashed border-slate-300 bg-white/60 dark:border-slate-700 dark:bg-slate-950/50">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-600" />
              <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">Building barangay response coverage...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 hidden overflow-hidden rounded-[22px] border border-slate-200 bg-white/90 shadow-inner dark:border-slate-700 dark:bg-slate-950/75 md:block">
              <div className="max-h-[580px] overflow-auto">
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 text-[10px] uppercase tracking-[0.12em] text-slate-500 shadow-sm backdrop-blur dark:bg-slate-950/95 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3.5">Rank</th>
                      <th className="px-4 py-3.5">Barangay</th>
                      <th className="px-4 py-3.5">Risk</th>
                      <th className="px-4 py-3.5">Forecast</th>
                      <th className="px-4 py-3.5">Response status</th>
                      <th className="px-4 py-3.5">Assigned action</th>
                      <th className="px-4 py-3.5">Action progress</th>
                      <th className="px-4 py-3.5">Last update</th>
                      <th className="px-4 py-3.5">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visibleRows.map((row, index) => {
                      const meta = getStatusMeta(row.responseStatus)
                      const Icon = meta.icon
                      const rank = Number(row?.priorityRank ?? row?.priority_rank ?? index + 1)
                      const forecast = Math.round(Number(row?.predictedCases ?? row?.forecastedCases ?? row?.forecast ?? 0))
                      return (
                        <tr key={`${row.barangay}-${rank}`} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/70">
                          <td className="px-4 py-3.5"><span className="inline-flex h-8 min-w-8 items-center justify-center rounded-[12px] bg-slate-950 px-2 text-xs font-black text-white dark:bg-white dark:text-slate-950">{rank}</span></td>
                          <td className="px-4 py-3.5"><p className="font-black text-brand-text dark:text-white">{row.barangay}</p><p className="mt-1 text-[10px] font-bold text-slate-400">Priority #{rank}</p></td>
                          <td className="px-4 py-3.5"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${getRiskBadge(row.risk)}`}>{row.risk || 'Low'}</span></td>
                          <td className="px-4 py-3.5 font-black text-brand-text dark:text-white">{forecast} cases</td>
                          <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${meta.badge}`}><Icon className="h-3.5 w-3.5" />{row.responseStatus}</span></td>
                          <td className="max-w-[230px] px-4 py-3.5"><p className="truncate font-bold text-slate-700 dark:text-slate-200" title={row.assignedActionLabel}>{row.assignedActionLabel}</p></td>
                          <td className="px-4 py-3.5"><p className="font-black text-brand-text dark:text-white">{row.actionCount ? `${row.completedCount}/${row.actionCount} completed` : 'No action yet'}</p></td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{formatDateTime(row.lastResponseUpdate)}</td>
                          <td className="px-4 py-3.5"><button type="button" onClick={() => focusBarangay(row)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[13px] border border-cyan-200 bg-cyan-50 px-3 py-2 text-[10px] font-black text-cyan-800 transition hover:-translate-y-0.5 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-200">{row.actionCount ? 'Manage' : 'Assign'}<ChevronRight className="h-3.5 w-3.5" /></button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 grid gap-2.5 md:hidden">
              {visibleRows.map((row, index) => {
                const meta = getStatusMeta(row.responseStatus)
                const Icon = meta.icon
                const rank = Number(row?.priorityRank ?? row?.priority_rank ?? index + 1)
                const forecast = Math.round(Number(row?.predictedCases ?? row?.forecastedCases ?? row?.forecast ?? 0))
                return (
                  <article key={`${row.barangay}-${rank}`} className={`rounded-[18px] border p-3.5 shadow-sm ${meta.card}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-[10px] bg-slate-950 px-1.5 text-[10px] font-black text-white dark:bg-white dark:text-slate-950">#{rank}</span>
                          <p className="truncate text-sm font-black text-brand-text dark:text-white">{row.barangay}</p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${getRiskBadge(row.risk)}`}>{row.risk || 'Low'} risk</span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black ${meta.badge}`}><Icon className="h-3 w-3" />{row.responseStatus}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => focusBarangay(row)} className="inline-flex h-9 shrink-0 items-center justify-center rounded-[12px] border border-cyan-200 bg-white px-2.5 text-[10px] font-black text-cyan-800 shadow-sm dark:border-cyan-500/25 dark:bg-slate-950 dark:text-cyan-200">{row.actionCount ? 'Manage' : 'Assign'}</button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-[12px] border border-white/80 bg-white/75 p-2.5 dark:border-white/10 dark:bg-slate-950/55"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Forecast</p><p className="mt-1 text-xs font-black text-brand-text dark:text-white">{forecast} cases</p></div>
                      <div className="rounded-[12px] border border-white/80 bg-white/75 p-2.5 dark:border-white/10 dark:bg-slate-950/55"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Progress</p><p className="mt-1 text-xs font-black text-brand-text dark:text-white">{row.actionCount ? `${row.completedCount}/${row.actionCount} completed` : 'No action yet'}</p></div>
                    </div>
                    <p className="mt-2.5 truncate text-xs font-bold text-slate-600 dark:text-slate-300">{row.assignedActionLabel}</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">Last update: {formatDateTime(row.lastResponseUpdate)}</p>
                  </article>
                )
              })}
            </div>

            {!visibleRows.length && (
              <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 p-7 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">No barangays match the current search and response-status filter.</div>
            )}
          </>
        )}

        <div className="mt-4 flex flex-col gap-2 rounded-[18px] border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-xs font-semibold leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {visibleRows.length} of {coverageRows.length} barangays.</span>
          <span className="font-black text-slate-700 dark:text-slate-200">Workflow: Not Assigned → Assigned → In Progress → Action Taken</span>
        </div>
      </div>
    </section>
  )
}
