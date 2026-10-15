import { useEffect, useState } from 'react'
import { BookOpen, X, AlertCircle } from 'lucide-react'
import { getHotspotConfiguration, getRiskThresholdConfiguration } from '../services/api'
import { decisionPriorityLevels } from '../utils/analytics'

const DEFAULT_HOTSPOT = { local_weight: 60, nearby_weight: 25, spatial_weight: 15, radius_km: 3, watch_threshold: 45, emerging_threshold: 60, confirmed_threshold: 75 }
const sections = [
  ['forecast', 'Forecast Risk'],
  ['response', 'Response Priority'],
  ['hotspot', 'Hotspot Levels'],
  ['scoring', 'Scoring & Ranking'],
]
const responseRules = [
  [decisionPriorityLevels.IMMEDIATE, 'High Risk, plus at least one: increasing trend, high/very high density, high environmental suitability, or forecast pressure score of 4 or more.', 'Urgent coordination and targeted response.'],
  [decisionPriorityLevels.HIGH, 'High Risk without the additional Immediate Response triggers.', 'Prioritize prevention and reporting.'],
  [decisionPriorityLevels.ESCALATED, 'Moderate Risk AND increasing trend AND (high/very high density OR high environmental suitability).', 'Intensify monitoring and action.'],
  [decisionPriorityLevels.PREVENTIVE, 'Moderate Risk AND (increasing trend OR high environmental suitability), when Escalated Watch does not apply.', 'Strengthen preventive activities.'],
  [decisionPriorityLevels.MONITORING, 'Moderate Risk without the stronger response-priority triggers.', 'Closely monitor the reporting periods.'],
  [decisionPriorityLevels.EARLY, 'Low Risk AND (increasing trend OR high environmental suitability).', 'Check early warning signals even with a low case forecast.'],
  [decisionPriorityLevels.ROUTINE, 'Low Risk without increasing trend or high environmental suitability.', 'Continue regular surveillance and source reduction.'],
  [decisionPriorityLevels.PENDING, 'No recognized Low, Moderate, or High forecast risk classification is available.', 'Check the data and analysis status.'],
]
const fmt = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—'

export default function ClassificationGuide({ onClose }) {
  const [tab, setTab] = useState('forecast')
  const [risk, setRisk] = useState(null)
  const [hotspot, setHotspot] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    Promise.allSettled([getRiskThresholdConfiguration({ force: true }), getHotspotConfiguration({ force: true })]).then(([r, h]) => {
      if (!active) return
      if (r.status === 'fulfilled') setRisk(r.value)
      if (h.status === 'fulfilled') setHotspot(h.value)
      setError(r.status === 'rejected' || h.status === 'rejected')
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const moderate = Number(risk?.moderate_threshold)
  const high = Number(risk?.high_threshold)
  const riskReady = Number.isFinite(moderate) && Number.isFinite(high) && high > moderate
  const hot = { ...DEFAULT_HOTSPOT, ...hotspot }
  const hotspotReady = !!hotspot
  const line = (label, rule, meaning) => (
    <div key={label} className="rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/80 sm:p-4">
      <h4 className="font-black text-slate-900 dark:text-white">{label}</h4>
      <p className="mt-1 text-sm font-semibold text-cyan-800 dark:text-cyan-200">{rule}</p>
      {meaning && <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{meaning}</p>}
    </div>
  )
  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-sm sm:p-5" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="classification-guide-title" className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-[#0b182a] dark:text-slate-100">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-700 sm:px-6">
          <div className="flex items-start gap-3"><BookOpen className="mt-1 shrink-0 text-cyan-600 dark:text-cyan-300" size={23}/><div><h2 id="classification-guide-title" className="text-lg font-black sm:text-xl">Classification & Scoring Guide</h2><p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">Read-only reference for the system's decision-support rules</p></div></div>
          <button type="button" onClick={onClose} aria-label="Close classification guide" className="rounded-xl border border-slate-300 p-2 hover:bg-slate-200 dark:border-slate-600 dark:hover:bg-slate-800"><X size={20}/></button>
        </div>
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-6" role="tablist" aria-label="Classification guide sections">
          {sections.map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-black transition sm:text-sm ${tab === key ? 'border-cyan-500 bg-cyan-100 text-cyan-900 dark:border-cyan-500/60 dark:bg-cyan-500/20 dark:text-cyan-100' : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{label}</button>)}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6" role="tabpanel">
          {error && <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"><AlertCircle size={18} className="shrink-0"/>Some configuration values could not be loaded. Values marked unavailable should be verified in Configuration.</p>}
          {tab === 'forecast' && <><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">The cumulative predicted case count across four future periods determines the forecast risk. These are configurable case-count boundaries, not confirmed outbreaks.</p>{riskReady ? <>{line('Low Risk', `Below ${fmt(moderate)} forecast cases`, 'Continue routine monitoring unless another response-priority warning signal applies.')}{line('Moderate Risk', `${fmt(moderate)}–${fmt(high - 1)} forecast cases`, 'Calls for closer monitoring and possible preventive activities.')}{line('High Risk', `${fmt(high)} or more forecast cases`, 'Calls for prioritized response planning.')}</> : <p className="text-sm font-bold">Loading active risk thresholds, or thresholds unavailable. Please verify in Configuration.</p>}</>}
          {tab === 'response' && <><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Response Priority is separate from forecast risk. Rules below are checked in order; the first matching condition wins. Trend, population density, environmental suitability and forecast pressure can affect the result.</p>{responseRules.map(([label, rule, meaning]) => line(label, rule, meaning))}</>}
          {tab === 'hotspot' && <><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Hotspot levels categorize the calculated spatial hotspot score. They are not medical or official outbreak confirmations.</p>{hotspotReady ? <>{line('Confirmed Hotspot', `Score ≥ ${fmt(hot.confirmed_threshold)}`, 'Highest system-defined spatial concern; does not mean a confirmed outbreak.')}{line('Emerging Hotspot', `Score ≥ ${fmt(hot.emerging_threshold)} and below ${fmt(hot.confirmed_threshold)}`, 'Elevated spatial concern.')}{line('Watch Area', `Score ≥ ${fmt(hot.watch_threshold)} and below ${fmt(hot.emerging_threshold)}`, 'Requires closer spatial monitoring.')}{line('Low Spatial Concern', `Score below ${fmt(hot.watch_threshold)}`, 'Lower spatial concern; not zero dengue risk.')}</> : <p className="text-sm font-bold">Loading active hotspot thresholds, or thresholds unavailable. Please verify in Configuration.</p>}{line('Needs Map Review', 'Geographic or boundary mapping needs review.', 'Not a hotspot-risk category.')}{line('Not Checked', 'No returned hotspot analysis classification.', 'Not a hotspot-risk category.')}</>}
          {tab === 'scoring' && <>{line('Combined Risk Score (CRS)', 'A contextual prioritization score, distinct from forecast case totals.', 'A ranking can also consider risk level, response priority, forecast cases and other tie-breakers. CRS is not an outbreak probability.')}{line('Response Priority Decision Score', 'Uses risk, forecast pressure, trend, density, population exposure, environmental suitability, and multi-source score.', 'This is an internal comparison signal; the response-priority label follows the conditional rules in the Response Priority tab.')}{hotspotReady ? line('Hotspot Score', `${fmt(hot.local_weight)}% Local Risk + ${fmt(hot.nearby_weight)}% Nearby Influence + ${fmt(hot.spatial_weight)}% Spatial Concentration`, `Configured nearby search radius: ${fmt(hot.radius_km)} km. Local, nearby, and spatial components have their own detailed calculations on the map.`) : line('Hotspot Score', 'Loading active weights and nearby radius, or configuration unavailable.', 'Verify current values in Configuration.')}{line('Forecast Cases', 'Four separate forward-period regression predictions, converted to nonnegative whole-number case estimates.', 'A displayed zero is not proof that no dengue cases will occur.')}</>}
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs font-semibold leading-5 text-slate-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-slate-300">These categories and scoring rules are system-defined decision-support indicators. They do not independently diagnose or confirm a dengue outbreak. Public health interpretation and operational decisions require appropriate CHO review.</div>
        </div>
      </div>
    </div>
  )
}
