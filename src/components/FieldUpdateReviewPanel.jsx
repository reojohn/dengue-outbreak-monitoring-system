import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileText,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldAlert,
  UserRoundCheck,
} from 'lucide-react'
import {
  createDecisionAction,
  getFieldUpdates,
  reviewFieldUpdate,
} from '../services/api'
import InformationTypeBadge from './InformationTypeBadge'
import { getAuthSession } from '../utils/auth'

const TASK_LABELS = {
  'inspect-water': 'Inspect stagnant water areas',
  'cleanup-drive': 'Coordinate cleanup drive',
  'community-reminders': 'Issue community reminders',
  'field-observations': 'Record field observations',
  'monitoring-summary': 'Prepare monitoring summary',
}

const ENVIRONMENTAL_OBSERVATION_LABELS = {
  standing_water: 'Standing water observed',
  uncovered_water_containers: 'Uncovered water containers',
  possible_breeding_sites: 'Possible mosquito breeding sites',
  flood_prone_area: 'Flood-prone area',
  low_lying_area: 'Low-lying area',
  waste_accumulation: 'Waste accumulation',
  clogged_drainage: 'Clogged drainage',
}

function getEnvironmentalObservationLabels(update) {
  return Object.entries(update?.environmental_observations || {})
    .filter(([, observed]) => Boolean(observed))
    .map(([key]) => ENVIRONMENTAL_OBSERVATION_LABELS[key] || key)
}

let fieldUpdateReviewCache = null
const FIELD_UPDATE_CACHE_TTL_MS = 30_000

function formatDate(value) {
  if (!value) return 'Not recorded'
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusTone(status) {
  if (status === 'Reviewed') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200'
  if (status === 'Follow-up Required') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200'
  if (status === 'Submitted') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200'
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function riskTone(risk) {
  if (risk === 'High') return 'text-rose-600 dark:text-rose-300'
  if (risk === 'Moderate') return 'text-amber-600 dark:text-amber-300'
  return 'text-emerald-600 dark:text-emerald-300'
}

export default function FieldUpdateReviewPanel() {
  const session = getAuthSession()
  const sessionCacheKey = String(session?.userId || session?.email || '').toLowerCase()
  const usableReviewCache = fieldUpdateReviewCache?.sessionCacheKey === sessionCacheKey
    ? fieldUpdateReviewCache
    : null
  const [updates, setUpdates] = useState(() => usableReviewCache?.rows || [])
  const [selectedId, setSelectedId] = useState('')
  const [comment, setComment] = useState('')
  const [filter, setFilter] = useState('Active')
  const [isLoading, setIsLoading] = useState(() => !usableReviewCache)
  const [busyAction, setBusyAction] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadUpdates({ preserveSelection = true, force = false } = {}) {
    const matchingCache = fieldUpdateReviewCache?.sessionCacheKey === sessionCacheKey
      ? fieldUpdateReviewCache
      : null
    const cacheAge = matchingCache
      ? Date.now() - Number(matchingCache.savedAt || 0)
      : Number.POSITIVE_INFINITY

    if (!force && matchingCache && cacheAge < FIELD_UPDATE_CACHE_TTL_MS) {
      const rows = matchingCache.rows || []
      setUpdates(rows)
      setSelectedId((current) => {
        if (preserveSelection && rows.some((item) => item.field_update_id === current)) return current
        return rows[0]?.field_update_id || ''
      })
      setIsLoading(false)
      return
    }

    if (!matchingCache) setIsLoading(true)
    setError('')
    try {
      const result = await getFieldUpdates({ limit: 200 })
      const rows = Array.isArray(result?.field_updates) ? result.field_updates : []
      fieldUpdateReviewCache = { sessionCacheKey, rows, savedAt: Date.now() }
      setUpdates(rows)
      setSelectedId((current) => {
        if (preserveSelection && rows.some((item) => item.field_update_id === current)) return current
        return rows[0]?.field_update_id || ''
      })
    } catch (loadError) {
      setError(loadError?.message || 'Barangay field updates could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUpdates({ preserveSelection: false })
  }, [])

  const selected = useMemo(
    () => updates.find((item) => item.field_update_id === selectedId) || null,
    [selectedId, updates]
  )

  useEffect(() => {
    setComment(selected?.supervisor_comment || '')
    setMessage('')
  }, [selected?.field_update_id])

  const visibleUpdates = useMemo(() => {
    if (filter === 'Submitted') return updates.filter((item) => item.status === 'Submitted')
    if (filter === 'Follow-up') return updates.filter((item) => item.status === 'Follow-up Required')
    if (filter === 'Reviewed') return updates.filter((item) => item.status === 'Reviewed')
    if (filter === 'Urgent') return updates.filter((item) => item.is_urgent || item.risk_level === 'High')
    return updates.filter((item) => item.status !== 'Draft')
  }, [filter, updates])

  const summary = useMemo(() => ({
    awaiting: updates.filter((item) => item.status === 'Submitted').length,
    followUp: updates.filter((item) => item.status === 'Follow-up Required').length,
    reviewed: updates.filter((item) => item.status === 'Reviewed').length,
    urgent: updates.filter((item) => item.is_urgent || item.risk_level === 'High').length,
  }), [updates])

  async function applyReview(status) {
    if (!selected) return
    setBusyAction(status)
    setError('')
    setMessage('')
    try {
      const result = await reviewFieldUpdate(selected.field_update_id, {
        status,
        supervisorComment: comment,
      })
      setMessage(result?.message || `Field update marked as ${status}.`)
      await loadUpdates({ force: true })
    } catch (reviewError) {
      setError(reviewError?.message || 'The field update could not be reviewed.')
    } finally {
      setBusyAction('')
    }
  }

  async function createResponseAction() {
    if (!selected) return
    setBusyAction('action')
    setError('')
    setMessage('')
    try {
      const urgent = selected.is_urgent || selected.risk_level === 'High'
      const environmentalLabels = getEnvironmentalObservationLabels(selected)
      const environmentalSummary = environmentalLabels.length
        ? ` Observed environmental factors: ${environmentalLabels.join(', ')}.`
        : ''
      const responseActionText = selected.observation_note
        ? `Respond to BHW field report: ${selected.observation_note}${environmentalSummary}`
        : `Review the submitted BHW checklist and coordinate the required barangay response.${environmentalSummary}`
      const result = await createDecisionAction({
        barangay: selected.barangay,
        risk_level: selected.risk_level,
        action: responseActionText.slice(0, 1200),
        assigned_to: 'Barangay response team',
        status: 'Pending',
        intervention_type: urgent ? 'Urgent field response' : 'Barangay field follow-up',
        remarks: `Created from field update ${selected.field_update_id}. Progress: ${selected.completed_count}/${selected.total_tasks}. Environmental factors are field observations, not confirmed causes.`,
        source: 'bhw_field_update',
      })
      setMessage(result?.message || 'A response action was created from this field update.')
    } catch (actionError) {
      setError(actionError?.message || 'The response action could not be created.')
    } finally {
      setBusyAction('')
    }
  }

  return (
    <section id="barangay-field-updates" className="scroll-mt-28 rounded-[32px] border border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-cyan-50/70 p-5 shadow-[0_22px_58px_rgba(15,23,42,0.09)] dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-blue-200 bg-white text-blue-700 shadow-sm dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.17em] text-blue-600 dark:text-blue-300">Barangay field updates</p>
              <InformationTypeBadge type="field" />
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-brand-text dark:text-white">Review BHW monitoring submissions</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">Open a submitted checklist, review the field observation, request follow-up, or turn the report into a response action.</p>
          </div>
        </div>
        <button type="button" onClick={() => loadUpdates({ force: true })} disabled={isLoading} className="flex min-h-[44px] items-center justify-center gap-2 rounded-[18px] border border-blue-200 bg-white px-4 py-2 text-sm font-black text-blue-700 shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-400/20 dark:bg-slate-950 dark:text-blue-200">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh submissions
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Awaiting review', summary.awaiting, 'text-blue-700 dark:text-blue-300'],
          ['Follow-up required', summary.followUp, 'text-amber-700 dark:text-amber-300'],
          ['Reviewed', summary.reviewed, 'text-emerald-700 dark:text-emerald-300'],
          ['Urgent or High Risk', summary.urgent, 'text-rose-700 dark:text-rose-300'],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-[22px] border border-white/80 bg-white/80 p-4 shadow-sm dark:border-white/5 dark:bg-slate-950/70">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`mt-2 text-3xl font-black ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {['Active', 'Submitted', 'Follow-up', 'Reviewed', 'Urgent'].map((item) => (
          <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full border px-3.5 py-2 text-xs font-black transition ${filter === item ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}>{item}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">{error}</div>}
      {message && <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">{message}</div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white/90 shadow-sm dark:border-slate-700 dark:bg-slate-950/80">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-black text-brand-text dark:text-white">{visibleUpdates.length} submission{visibleUpdates.length === 1 ? '' : 's'}</p>
          </div>
          <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {isLoading ? (
              <div className="space-y-3 p-4" role="status" aria-label="Loading field updates" aria-busy="true">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="system-skeleton-shimmer h-10 w-10 shrink-0 rounded-2xl bg-slate-200 dark:bg-slate-800" />
                      <div className="min-w-0 flex-1">
                        <div className="system-skeleton-shimmer h-4 w-32 rounded-full bg-slate-200 dark:bg-slate-800" />
                        <div className="system-skeleton-shimmer mt-2 h-3 w-3/5 rounded-full bg-slate-200 dark:bg-slate-800" />
                      </div>
                      <div className="system-skeleton-shimmer h-7 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleUpdates.length ? visibleUpdates.map((item) => {
              const selectedRow = item.field_update_id === selectedId
              return (
                <button key={item.field_update_id} type="button" onClick={() => setSelectedId(item.field_update_id)} className={`w-full p-4 text-left transition ${selectedRow ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-brand-text dark:text-white">{item.barangay}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{item.submitted_by_name} • {formatDate(item.reporting_date)}</p>
                    </div>
                    {selectedRow ? <ChevronUp className="h-4 w-4 shrink-0 text-blue-600" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusTone(item.status)}`}>{item.status}</span>
                    <span className={`text-xs font-black ${riskTone(item.risk_level)}`}>{item.risk_level} Risk</span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{item.completed_count}/{item.total_tasks}</span>
                    {item.is_urgent && <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black text-white">Urgent</span>}
                  </div>
                </button>
              )
            }) : (
              <div className="p-8 text-center text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">No field updates match this filter.</div>
            )}
          </div>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950/80">
          {selected ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Selected field report</p>
                    <InformationTypeBadge type="field" />
                  </div>
                  <h3 className="mt-1 text-2xl font-black text-brand-text dark:text-white">{selected.barangay}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Submitted by {selected.submitted_by_name} for {formatDate(selected.reporting_date)}</p>
                </div>
                <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-black ${statusTone(selected.status)}`}>{selected.status}</span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"><p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Progress</p><p className="mt-2 text-xl font-black text-brand-text dark:text-white">{selected.completed_count}/{selected.total_tasks}</p></div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"><p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Current risk</p><p className={`mt-2 text-xl font-black ${riskTone(selected.risk_level)}`}>{selected.risk_level}</p></div>
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"><p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Forecast cases</p><p className="mt-2 text-xl font-black text-brand-text dark:text-white">{Math.round(Number(selected.predicted_cases || 0))}</p></div>
              </div>

              <div className="mt-5">
                <p className="text-sm font-black text-brand-text dark:text-white">Checklist activities</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {Object.entries(selected.tasks || {}).map(([taskId, done]) => (
                    <div key={taskId} className={`flex items-center gap-2 rounded-[16px] border px-3 py-2 text-xs font-bold ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'}`}>
                      {done ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                      {TASK_LABELS[taskId] || taskId}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-[20px] border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-500/20 dark:bg-cyan-500/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.13em] text-cyan-700 dark:text-cyan-300">Observed environmental factors</p>
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Field observations only</span>
                </div>
                {getEnvironmentalObservationLabels(selected).length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getEnvironmentalObservationLabels(selected).map((label) => (
                      <span key={label} className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-black text-cyan-800 dark:border-cyan-400/20 dark:bg-slate-950 dark:text-cyan-100">{label}</span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">No structured environmental factor was marked for this update.</p>
                )}
                <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">These entries describe what the BHW observed or locally identified. They should not be interpreted as proven causes of dengue transmission.</p>
              </div>

              <div className="mt-5 rounded-[20px] border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                <p className="text-xs font-black uppercase tracking-[0.13em] text-blue-700 dark:text-blue-300">Field observation</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{selected.observation_note || 'No observation note was provided.'}</p>
              </div>

              {(selected.is_urgent || selected.suspected_symptoms || selected.supplies_needed || selected.assistance_needed) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selected.is_urgent && <span className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-black text-white">Urgent issue</span>}
                  {selected.suspected_symptoms && <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">Suspected symptoms</span>}
                  {selected.supplies_needed && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">Supplies needed</span>}
                  {selected.assistance_needed && <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200">Assistance needed</span>}
                </div>
              )}

              <label className="mt-5 block">
                <span className="flex items-center gap-2 text-sm font-black text-brand-text dark:text-white"><MessageSquareText className="h-4 w-4" /> Supervisor comment</span>
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={1200} placeholder="Add review notes or explain what the BHW should follow up." className="mt-2 w-full resize-y rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-brand-text outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              </label>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => applyReview('Reviewed')} disabled={Boolean(busyAction) || selected.status === 'Draft'} className="flex min-h-[48px] items-center justify-center gap-2 rounded-[18px] bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">{busyAction === 'Reviewed' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />} Mark Reviewed</button>
                <button type="button" onClick={() => applyReview('Follow-up Required')} disabled={Boolean(busyAction) || selected.status === 'Draft'} className="flex min-h-[48px] items-center justify-center gap-2 rounded-[18px] bg-amber-500 px-4 py-3 text-sm font-black text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">{busyAction === 'Follow-up Required' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Request Follow-up</button>
                <button type="button" onClick={createResponseAction} disabled={Boolean(busyAction)} className="flex min-h-[48px] items-center justify-center gap-2 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">{busyAction === 'action' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} Create Response Action</button>
                <Link to={`/reports?field_update_id=${encodeURIComponent(selected.field_update_id)}`} className="flex min-h-[48px] items-center justify-center gap-2 rounded-[18px] border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-black text-blue-700 transition hover:-translate-y-0.5 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200"><FileText className="h-4 w-4" /> Prepare Official Report</Link>
              </div>
            </>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <ClipboardCheck className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-base font-black text-brand-text dark:text-white">Select a field update</p>
              <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">Choose a BHW submission to view its checklist, observation, risk, and review actions.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
