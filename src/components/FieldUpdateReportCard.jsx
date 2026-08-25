import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, Printer, ShieldAlert } from 'lucide-react'
import InformationTypeBadge from './InformationTypeBadge'

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function printFieldUpdate(update) {
  const popup = window.open('', '_blank', 'width=980,height=760')
  if (!popup) return
  const tasks = Object.entries(update.tasks || {}).map(([id, done]) => `
    <tr>
      <td>${escapeHtml(TASK_LABELS[id] || id)}</td>
      <td>${done ? 'Completed' : 'Not completed'}</td>
    </tr>
  `).join('')
  const environmentalLabels = getEnvironmentalObservationLabels(update)
  const environmentalText = environmentalLabels.length
    ? environmentalLabels.map((label) => `• ${escapeHtml(label)}`).join('<br>')
    : 'No structured environmental factor was marked.'

  popup.document.write(`<!doctype html>
  <html><head><meta charset="utf-8"><title>Barangay Field Report - ${escapeHtml(update.barangay)}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#172033;margin:36px;line-height:1.5}
    h1{margin:0;font-size:24px} h2{font-size:16px;margin:24px 0 8px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
    .card{border:1px solid #dbe4ee;border-radius:10px;padding:12px}
    .label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700}
    .value{margin-top:4px;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #dbe4ee;padding:9px;text-align:left;font-size:12px}
    th{background:#eff6ff}.note{white-space:pre-wrap;border:1px solid #dbe4ee;border-radius:10px;padding:14px;background:#f8fafc}
    .footer{margin-top:28px;font-size:11px;color:#64748b}
    @media print{button{display:none}body{margin:18mm}}
  </style></head><body>
    <h1>Barangay Dengue Field Monitoring Report</h1>
    <p>Prepared from the submitted BHW field update stored in the dengue decision-support system.</p>
    <div class="meta">
      <div class="card"><div class="label">Barangay</div><div class="value">${escapeHtml(update.barangay)}</div></div>
      <div class="card"><div class="label">Reporting date</div><div class="value">${escapeHtml(formatDate(update.reporting_date))}</div></div>
      <div class="card"><div class="label">Submitted by</div><div class="value">${escapeHtml(update.submitted_by_name)}</div></div>
      <div class="card"><div class="label">Submission status</div><div class="value">${escapeHtml(update.status)}</div></div>
      <div class="card"><div class="label">Checklist progress</div><div class="value">${update.completed_count}/${update.total_tasks}</div></div>
      <div class="card"><div class="label">Current dengue risk</div><div class="value">${escapeHtml(update.risk_level)}</div></div>
      <div class="card"><div class="label">Forecast cases</div><div class="value">${Math.round(Number(update.predicted_cases || 0))}</div></div>
      <div class="card"><div class="label">Submitted at</div><div class="value">${escapeHtml(update.submitted_at || 'Not recorded')}</div></div>
    </div>
    <h2>Completed Activities</h2>
    <table><thead><tr><th>Field activity</th><th>Status</th></tr></thead><tbody>${tasks}</tbody></table>
    <h2>Observed Environmental Factors</h2><div class="note">${environmentalText}<br><br><strong>Interpretation note:</strong> These are BHW field observations or locally identified conditions, not confirmed causes of dengue transmission.</div>
    <h2>Field Observation</h2><div class="note">${escapeHtml(update.observation_note || 'No observation note was provided.')}</div>
    <h2>Escalation Indicators</h2>
    <div class="note">Urgent: ${update.is_urgent ? 'Yes' : 'No'}<br>Suspected dengue symptoms: ${update.suspected_symptoms ? 'Yes' : 'No'}<br>Supplies needed: ${update.supplies_needed ? 'Yes' : 'No'}<br>Immediate assistance needed: ${update.assistance_needed ? 'Yes' : 'No'}</div>
    <h2>Supervisor Review</h2><div class="note">${escapeHtml(update.supervisor_comment || 'No supervisor comment recorded.')}</div>
    <div class="footer">Field update ID: ${escapeHtml(update.field_update_id)}</div>
    <script>window.addEventListener('load',()=>window.print())</script>
  </body></html>`)
  popup.document.close()
}

function riskTone(risk) {
  if (risk === 'High') return 'text-rose-600 dark:text-rose-300'
  if (risk === 'Moderate') return 'text-amber-600 dark:text-amber-300'
  return 'text-emerald-600 dark:text-emerald-300'
}

export default function FieldUpdateReportCard({ fieldUpdate, isLoading = false, error = '' }) {
  if (isLoading) {
    return <section className="rounded-[30px] border border-blue-200 bg-blue-50/70 p-6 text-sm font-bold text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">Loading the submitted barangay field update…</section>
  }

  if (error) {
    return <section className="rounded-[30px] border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">{error}</section>
  }

  if (!fieldUpdate) return null

  return (
    <section id="field-update-report" className="rounded-[34px] border border-blue-200/80 bg-gradient-to-br from-blue-50 via-white to-cyan-50/70 p-5 shadow-[0_22px_58px_rgba(15,23,42,0.10)] dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-blue-200 bg-white text-blue-700 shadow-sm dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200"><FileText className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.17em] text-blue-600 dark:text-blue-300">Prefilled barangay report</p>
              <InformationTypeBadge type="field" />
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-brand-text dark:text-white">{fieldUpdate.barangay} field monitoring report</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">This report was populated directly from the submitted BHW checklist, so the barangay team does not need to enter the same information again.</p>
          </div>
        </div>
        <button type="button" onClick={() => printFieldUpdate(fieldUpdate)} className="flex min-h-[46px] items-center justify-center gap-2 rounded-[18px] bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-md transition hover:-translate-y-0.5"><Printer className="h-4 w-4" /> Print Field Report</button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Reporting date', formatDate(fieldUpdate.reporting_date)],
          ['Submitted by', fieldUpdate.submitted_by_name || 'BHW account'],
          ['Progress', `${fieldUpdate.completed_count}/${fieldUpdate.total_tasks} completed`],
          ['Review status', fieldUpdate.status || 'Submitted'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[20px] border border-white/80 bg-white/85 p-4 shadow-sm dark:border-white/5 dark:bg-slate-950/75"><p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</p><p className="mt-2 text-sm font-black text-brand-text dark:text-white">{value}</p></div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-brand-text dark:text-white"><ClipboardCheck className="h-4 w-4" /> Checklist activities</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(fieldUpdate.tasks || {}).map(([taskId, done]) => (
              <div key={taskId} className={`flex items-center gap-2 rounded-[16px] border px-3 py-2.5 text-xs font-bold ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'}`}>{done ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}{TASK_LABELS[taskId] || taskId}</div>
            ))}
          </div>
          <div className="mt-4 rounded-[20px] border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-500/20 dark:bg-cyan-500/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-[0.13em] text-cyan-700 dark:text-cyan-300">Observed environmental factors</p>
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Not confirmed causes</span>
            </div>
            {getEnvironmentalObservationLabels(fieldUpdate).length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {getEnvironmentalObservationLabels(fieldUpdate).map((label) => (
                  <span key={label} className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-black text-cyan-800 dark:border-cyan-400/20 dark:bg-slate-950 dark:text-cyan-100">{label}</span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">No structured environmental factor was marked for this report.</p>
            )}
            <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">These entries document field observations and local conditions. They do not establish why a dengue case occurred.</p>
          </div>
          <div className="mt-4 rounded-[20px] border border-slate-200 bg-white/85 p-4 dark:border-slate-700 dark:bg-slate-950/75"><p className="text-xs font-black uppercase tracking-[0.13em] text-slate-500">Field observation</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{fieldUpdate.observation_note || 'No observation note was provided.'}</p></div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[20px] border border-slate-200 bg-white/85 p-4 dark:border-slate-700 dark:bg-slate-950/75"><p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">Current risk</p><p className={`mt-2 text-2xl font-black ${riskTone(fieldUpdate.risk_level)}`}>{fieldUpdate.risk_level}</p><p className="mt-1 text-xs font-semibold text-slate-500">{Math.round(Number(fieldUpdate.predicted_cases || 0))} forecast cases</p></div>
          <div className="rounded-[20px] border border-slate-200 bg-white/85 p-4 dark:border-slate-700 dark:bg-slate-950/75"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.13em] text-slate-500"><ShieldAlert className="h-4 w-4" /> Escalation</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{[fieldUpdate.is_urgent && 'Urgent issue', fieldUpdate.suspected_symptoms && 'Suspected symptoms', fieldUpdate.supplies_needed && 'Supplies needed', fieldUpdate.assistance_needed && 'Immediate assistance needed'].filter(Boolean).join(', ') || 'No escalation indicator was marked.'}</p></div>
          <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/20 dark:bg-amber-500/10"><p className="text-xs font-black uppercase tracking-[0.13em] text-amber-700 dark:text-amber-300">Supervisor comment</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{fieldUpdate.supervisor_comment || 'No supervisor comment recorded.'}</p></div>
        </div>
      </div>
    </section>
  )
}
