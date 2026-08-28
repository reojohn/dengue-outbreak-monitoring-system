import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react'
import { getDecisionActions, startDecisionActionProgress } from '../services/api'

function normalizeBarangay(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
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

function actionBelongsToCurrentCycle(action, cycleStart, cycleId) {
  const source = String(action?.source || '')

  if (cycleId && source.startsWith('forecast_cycle:')) {
    return source === `forecast_cycle:${cycleId}` || source.startsWith(`forecast_cycle:${cycleId}:`)
  }

  return isInCurrentCycle(action?.created_at || action?.updated_at, cycleStart)
}

function formatDate(value, fallback = 'No due date') {
  if (!value) return fallback
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getStatusMeta(status) {
  if (status === 'Completed') {
    return {
      label: 'Action Taken',
      Icon: CheckCircle2,
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
      panel: 'border-emerald-200/80 bg-emerald-50/65 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07]',
    }
  }

  if (status === 'In Progress') {
    return {
      label: 'In Progress',
      Icon: Clock3,
      badge: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200',
      panel: 'border-blue-200/80 bg-blue-50/65 dark:border-blue-500/20 dark:bg-blue-500/[0.07]',
    }
  }

  return {
    label: 'Assigned',
    Icon: UserRoundCheck,
    badge: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-200',
    panel: 'border-slate-200/90 bg-white/90 dark:border-slate-700 dark:bg-slate-950/75',
  }
}

function WorkflowStep({ label, helper, active, complete, Icon }) {
  return (
    <div className={`relative rounded-[18px] border p-3 transition ${complete ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/25 dark:bg-emerald-500/10' : active ? 'border-cyan-200 bg-cyan-50/80 shadow-sm dark:border-cyan-500/25 dark:bg-cyan-500/10' : 'border-slate-200 bg-white/75 dark:border-slate-700 dark:bg-slate-950/65'}`}>
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] ${complete ? 'bg-emerald-600 text-white' : active ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
          {complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className={`text-xs font-black ${complete ? 'text-emerald-800 dark:text-emerald-200' : active ? 'text-cyan-800 dark:text-cyan-200' : 'text-brand-text dark:text-slate-200'}`}>{label}</p>
          <p className="mt-0.5 text-[10px] font-semibold leading-4 text-brand-muted dark:text-slate-400">{helper}</p>
        </div>
      </div>
    </div>
  )
}

export default function AssignedResponseActions({
  barangay = '',
  forecastCycleId = '',
  forecastCycleStart = '',
  currentRole = 'viewer',
  fieldUpdateStatus = 'Draft',
}) {
  const [actions, setActions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [busyActionId, setBusyActionId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadActions({ force = false, quiet = false } = {}) {
    if (!barangay) return
    if (!quiet) setIsRefreshing(true)
    setError('')

    try {
      // BHW scope is enforced by the backend from the authenticated account.
      // Do not send the UI-formatted barangay label for BHWs because labels can
      // legitimately differ only by punctuation (e.g. Km. 3 vs KM 3).
      const result = await getDecisionActions({
        barangay: currentRole === 'bhw' ? '' : barangay,
        force,
      })
      setActions(Array.isArray(result?.actions) ? result.actions : [])
    } catch (loadError) {
      setError(loadError?.message || 'Assigned response actions could not be loaded.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    setIsLoading(true)
    setMessage('')
    loadActions({ quiet: true })
  }, [barangay, forecastCycleId])

  useEffect(() => {
    function handleRealtimeDecisionAction(event) {
      const eventBarangay = event?.detail?.barangay
      if (eventBarangay && normalizeBarangay(eventBarangay) !== normalizeBarangay(barangay)) return
      loadActions({ force: true, quiet: true })
    }

    window.addEventListener('dengue-decision-actions-changed', handleRealtimeDecisionAction)
    return () => window.removeEventListener('dengue-decision-actions-changed', handleRealtimeDecisionAction)
  }, [barangay, forecastCycleId, currentRole])

  const currentActions = useMemo(() => {
    const barangayKey = normalizeBarangay(barangay)
    return actions
      .filter((action) => normalizeBarangay(action?.barangay) === barangayKey)
      .filter((action) => actionBelongsToCurrentCycle(action, forecastCycleStart, forecastCycleId))
      .sort((a, b) => {
        const aTime = parseDate(a?.updated_at || a?.created_at)?.getTime() || 0
        const bTime = parseDate(b?.updated_at || b?.created_at)?.getTime() || 0
        return bTime - aTime
      })
  }, [actions, barangay, forecastCycleId, forecastCycleStart])

  const pendingCount = currentActions.filter((action) => action?.status === 'Pending').length
  const inProgressCount = currentActions.filter((action) => action?.status === 'In Progress').length
  const completedCount = currentActions.filter((action) => action?.status === 'Completed').length
  const allComplete = currentActions.length > 0 && completedCount === currentActions.length
  const hasStarted = inProgressCount > 0 || completedCount > 0
  const fieldSubmitted = ['Submitted', 'Reviewed', 'Follow-up Required'].includes(fieldUpdateStatus)
  const fieldReviewed = fieldUpdateStatus === 'Reviewed'
  const followUpRequired = fieldUpdateStatus === 'Follow-up Required'
  const canStartActions = currentRole === 'bhw'

  async function startAction(action) {
    if (!canStartActions || action?.status !== 'Pending') return
    setBusyActionId(action.id)
    setMessage('')
    setError('')

    try {
      const result = await startDecisionActionProgress(action.id)
      const updated = result?.action
      if (updated) {
        setActions((current) => current.map((item) => item.id === updated.id ? updated : item))
      }
      setMessage(result?.message || 'Response action marked as In Progress.')
    } catch (startError) {
      setError(startError?.message || 'The response action could not be started.')
    } finally {
      setBusyActionId('')
    }
  }

  let guidanceTitle = 'Assigned response actions'
  let guidanceText = 'Review the supervisor assignment, begin the response, then record the work in today\'s field update.'
  let GuidanceIcon = ClipboardList

  if (followUpRequired) {
    guidanceTitle = 'Supervisor requested follow-up'
    guidanceText = 'Review the supervisor comment in today\'s field update, complete the requested follow-up, and submit an updated field report.'
    GuidanceIcon = AlertTriangle
  } else if (allComplete) {
    guidanceTitle = 'Response verified complete'
    guidanceText = 'All current response actions for this barangay are marked completed by the supervisor.'
    GuidanceIcon = ShieldCheck
  } else if (fieldReviewed) {
    guidanceTitle = 'Field update reviewed'
    guidanceText = 'The supervisor reviewed the submitted field update. Any remaining response action stays open until the supervisor verifies it as completed.'
    GuidanceIcon = ShieldCheck
  } else if (fieldSubmitted) {
    guidanceTitle = 'Field update submitted'
    guidanceText = 'Your field report is waiting for supervisor review. Continue any response action that is still marked In Progress.'
    GuidanceIcon = Send
  } else if (hasStarted) {
    guidanceTitle = 'Response work is underway'
    guidanceText = 'Complete the assigned work, record today\'s observations and checklist activities, then submit the field update to the supervisor.'
    GuidanceIcon = Clock3
  }

  return (
    <section id="assigned-response-actions" className="scroll-mt-28 overflow-hidden rounded-[30px] border border-cyan-200/70 bg-gradient-to-br from-cyan-50/90 via-white to-blue-50/75 shadow-[0_20px_54px_rgba(15,23,42,0.08)] dark:border-cyan-400/20 dark:from-cyan-500/[0.08] dark:via-slate-950 dark:to-blue-500/[0.05]">
      <div className="border-b border-slate-200/80 p-5 dark:border-slate-800 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-cyan-200 bg-white text-cyan-700 shadow-sm dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.17em] text-cyan-700 dark:text-cyan-300">Supervisor assignments</p>
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-800 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-200">Current forecast cycle</span>
              </div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-brand-text dark:text-white">Assigned response actions</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">Actions coordinated by the Supervisor for {barangay}. Starting an action changes it to In Progress; only the Supervisor can verify it as completed.</p>
            </div>
          </div>

          <button type="button" onClick={() => loadActions({ force: true })} disabled={isRefreshing} className="inline-flex min-h-[38px] w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[10px] font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh assignments
          </button>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {[
            ['Assigned', pendingCount, 'text-cyan-700 dark:text-cyan-300'],
            ['In progress', inProgressCount, 'text-blue-700 dark:text-blue-300'],
            ['Action taken', completedCount, 'text-emerald-700 dark:text-emerald-300'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-[18px] border border-slate-200 bg-white/85 p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p>
              <p className={`mt-1 text-2xl font-black tracking-[-0.04em] ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className={`rounded-[20px] border px-4 py-3.5 ${followUpRequired ? 'border-amber-200 bg-amber-50/85 dark:border-amber-500/25 dark:bg-amber-500/10' : allComplete ? 'border-emerald-200 bg-emerald-50/85 dark:border-emerald-500/25 dark:bg-emerald-500/10' : 'border-blue-200 bg-blue-50/75 dark:border-blue-500/20 dark:bg-blue-500/10'}`}>
          <div className="flex items-start gap-3">
            <GuidanceIcon className={`mt-0.5 h-5 w-5 shrink-0 ${followUpRequired ? 'text-amber-600' : allComplete ? 'text-emerald-600' : 'text-blue-600 dark:text-blue-300'}`} />
            <div>
              <p className="text-sm font-black text-brand-text dark:text-white">{guidanceTitle}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">{guidanceText}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <WorkflowStep label="1. Assigned" helper="Supervisor creates the response action." active={currentActions.length > 0 && !hasStarted} complete={hasStarted || allComplete} Icon={UserRoundCheck} />
          <WorkflowStep label="2. In progress" helper="BHW begins the assigned field response." active={hasStarted && !fieldSubmitted && !allComplete} complete={fieldSubmitted || allComplete} Icon={Play} />
          <WorkflowStep label="3. Field update" helper="BHW submits observations and activities." active={fieldSubmitted && !fieldReviewed && !followUpRequired && !allComplete} complete={fieldReviewed || allComplete} Icon={Send} />
          <WorkflowStep label="4. Supervisor verify" helper="Supervisor reviews and closes the response." active={fieldReviewed && !allComplete} complete={allComplete} Icon={ShieldCheck} />
        </div>

        {error && <div className="mt-4 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">{error}</div>}
        {message && <div className="mt-4 rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">{message}</div>}

        {isLoading ? (
          <div className="mt-4 flex min-h-[150px] items-center justify-center rounded-[22px] border border-dashed border-slate-300 bg-white/60 dark:border-slate-700 dark:bg-slate-950/50">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-600" />
              <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">Loading assigned response actions...</p>
            </div>
          </div>
        ) : currentActions.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {currentActions.map((action, index) => {
              const meta = getStatusMeta(action?.status)
              const StatusIcon = meta.Icon
              const isPending = action?.status === 'Pending'
              return (
                <article key={action.id || `${action.barangay}-${index}`} className={`relative overflow-hidden rounded-[24px] border p-4 shadow-sm ${meta.panel}`}>
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400" />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${meta.badge}`}><StatusIcon className="h-3.5 w-3.5" />{meta.label}</span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Action {index + 1}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-black tracking-tight text-brand-text dark:text-white">{action?.intervention_type || 'Barangay response action'}</h3>
                      <p className="mt-1.5 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">{action?.action || 'Carry out the assigned barangay response.'}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[16px] border border-white/80 bg-white/80 p-3 dark:border-white/5 dark:bg-slate-950/55">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Assigned to</p>
                      <p className="mt-1 text-xs font-black text-brand-text dark:text-slate-200">{action?.assigned_to || 'Barangay response team'}</p>
                    </div>
                    <div className="rounded-[16px] border border-white/80 bg-white/80 p-3 dark:border-white/5 dark:bg-slate-950/55">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Due date</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-black text-brand-text dark:text-slate-200"><CalendarDays className="h-3.5 w-3.5 text-cyan-600" />{formatDate(action?.due_date)}</p>
                    </div>
                  </div>

                  {action?.remarks && (
                    <div className="mt-3 rounded-[16px] border border-slate-200/80 bg-white/70 px-3.5 py-3 text-xs font-semibold leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-400">
                      <span className="font-black text-brand-text dark:text-slate-200">Supervisor note:</span> {action.remarks}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[10px] font-bold text-slate-400">Assigned for the current forecast response cycle.</p>
                    {canStartActions && isPending ? (
                      <button type="button" onClick={() => startAction(action)} disabled={Boolean(busyActionId)} className="inline-flex min-h-[40px] items-center gap-2 rounded-[14px] bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_28px_rgba(8,145,178,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
                        {busyActionId === action.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        Start Action
                      </button>
                    ) : action?.status === 'In Progress' ? (
                      <span className="inline-flex items-center gap-2 rounded-[14px] border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-black text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200"><Clock3 className="h-4 w-4" />Continue field response</span>
                    ) : action?.status === 'Completed' ? (
                      <span className="inline-flex items-center gap-2 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-black text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />Verified by Supervisor</span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-[14px] border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-black text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><CircleDashed className="h-4 w-4" />Read-only preview</span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-[22px] border border-dashed border-slate-300 bg-white/65 p-5 text-center dark:border-slate-700 dark:bg-slate-950/45">
            <CircleDashed className="mx-auto h-7 w-7 text-slate-400" />
            <p className="mt-2 text-sm font-black text-brand-text dark:text-white">No response action assigned for this forecast cycle</p>
            <p className="mx-auto mt-1 max-w-xl text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">Continue routine monitoring. When the Supervisor assigns an action for {barangay}, it will appear here after opening or refreshing the BHW Workspace.</p>
          </div>
        )}
      </div>
    </section>
  )
}
