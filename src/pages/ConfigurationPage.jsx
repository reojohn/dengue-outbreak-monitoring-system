import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw, Save, Settings2, ShieldCheck } from 'lucide-react'
import { useData } from '../context/DataContext'
import {
  getHotspotConfiguration, getRiskThresholdConfiguration,
  resetHotspotConfiguration, resetRiskThresholdConfiguration,
  updateHotspotConfiguration, updateRiskThresholdConfiguration,
} from '../services/api'
import { configureRiskThresholds } from '../utils/analytics'

const RISK_DEFAULTS = { moderate_threshold: 25, high_threshold: 60 }
const HOTSPOT_DEFAULTS = { local_weight: 60, nearby_weight: 25, spatial_weight: 15, radius_km: 3, watch_threshold: 45, emerging_threshold: 60, confirmed_threshold: 75 }

const Field = ({ label, value, onChange, suffix, min = 0, max, step = 1 }) => (
  <label className="block"><span className="text-sm font-black text-slate-800 dark:text-slate-200">{label}</span>
    <div className="mt-2 flex items-center rounded-2xl border border-slate-300 bg-white px-4 dark:border-slate-700 dark:bg-slate-950">
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-[50px] w-full bg-transparent text-lg font-black outline-none dark:text-white" />
      <span className="text-sm font-bold text-slate-400">{suffix}</span>
    </div>
  </label>
)

export default function ConfigurationPage() {
  const { riskConfiguration, setRiskConfiguration, refreshAuthenticatedWorkspace } = useData()
  const [risk, setRisk] = useState({ ...RISK_DEFAULTS, ...riskConfiguration })
  const [hotspot, setHotspot] = useState(HOTSPOT_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [notice, setNotice] = useState({ type: '', text: '' })
  const [resetTarget, setResetTarget] = useState('')

  useEffect(() => {
    Promise.all([getRiskThresholdConfiguration({ force: true }), getHotspotConfiguration({ force: true })])
      .then(([r, h]) => { setRiskConfiguration(r); configureRiskThresholds(r); setRisk(r); setHotspot(h) })
      .catch((e) => setNotice({ type: 'error', text: e?.message || 'Configuration could not be loaded.' }))
      .finally(() => setLoading(false))
  }, [])

  const riskError = useMemo(() => {
    const m = Number(risk.moderate_threshold), h = Number(risk.high_threshold)
    if (!Number.isInteger(m) || m < 0) return 'Moderate threshold must be a non-negative whole number.'
    if (!Number.isInteger(h) || h <= m) return 'High threshold must be greater than Moderate.'
    return ''
  }, [risk])

  const hotspotError = useMemo(() => {
    const l=Number(hotspot.local_weight), n=Number(hotspot.nearby_weight), s=Number(hotspot.spatial_weight), r=Number(hotspot.radius_km)
    const w=Number(hotspot.watch_threshold), e=Number(hotspot.emerging_threshold), c=Number(hotspot.confirmed_threshold)
    if (![l,n,s].every(Number.isInteger) || Math.min(l,n,s)<0 || l+n+s!==100) return 'Local, Nearby, and Spatial weights must total exactly 100%.'
    if (!Number.isFinite(r) || r<0.5 || r>15) return 'Nearby radius must be between 0.5 km and 15 km.'
    if (![w,e,c].every(Number.isInteger) || w<0 || !(w<e && e<c && c<=100)) return 'Hotspot thresholds must increase in order: Watch < Emerging < Confirmed ≤ 100.'
    return ''
  }, [hotspot])

  const saveRisk = async () => { if(riskError)return; setSaving('risk'); setNotice({type:'',text:''}); try { const r=await updateRiskThresholdConfiguration({moderateThreshold:risk.moderate_threshold,highThreshold:risk.high_threshold}); setRisk(r); setRiskConfiguration(r); configureRiskThresholds(r); await refreshAuthenticatedWorkspace?.({silent:true,force:true}).catch(()=>{}); setNotice({type:'ok',text:'Risk classification thresholds saved.'}) } catch(e){setNotice({type:'error',text:e?.message||'Risk thresholds could not be saved.'})} finally{setSaving('')} }
  const saveHotspot = async () => { if(hotspotError)return; setSaving('hotspot'); setNotice({type:'',text:''}); try { const h=await updateHotspotConfiguration({local_weight:Number(hotspot.local_weight),nearby_weight:Number(hotspot.nearby_weight),spatial_weight:Number(hotspot.spatial_weight),radius_km:Number(hotspot.radius_km),watch_threshold:Number(hotspot.watch_threshold),emerging_threshold:Number(hotspot.emerging_threshold),confirmed_threshold:Number(hotspot.confirmed_threshold)}); setHotspot(h); setNotice({type:'ok',text:'Hotspot settings saved. The previous derived hotspot cache was cleared. Run Hotspot Check on the Map page once to calculate results with the new settings.'}) } catch(e){setNotice({type:'error',text:e?.message||'Hotspot settings could not be saved.'})} finally{setSaving('')} }
  const doReset = async () => { setSaving(resetTarget); try { if(resetTarget==='risk'){const r=await resetRiskThresholdConfiguration();setRisk(r);setRiskConfiguration(r);configureRiskThresholds(r);await refreshAuthenticatedWorkspace?.({silent:true,force:true}).catch(()=>{});setNotice({type:'ok',text:'Risk thresholds reset to 25 / 60.'})} else {const h=await resetHotspotConfiguration();setHotspot(h);setNotice({type:'ok',text:'Hotspot settings reset to 60 / 25 / 15, 3 km, and 45 / 60 / 75. Run Hotspot Check once to rebuild the saved result.'})} setResetTarget('') } catch(e){setNotice({type:'error',text:e?.message||'Configuration could not be reset.'})} finally{setSaving('')} }

  const card='overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950'
  const panel='rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/60'
  return <div className="mx-auto max-w-5xl space-y-6 pb-10">
    {notice.text && <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold ${notice.type==='error'?'border-rose-200 bg-rose-50 text-rose-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{notice.type==='error'?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}<span>{notice.text}</span></div>}

    <section className={card}>
      <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-brand-blue px-6 py-7 text-white sm:px-8"><div className="flex gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><Settings2/></div><div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">CHO / Admin Configuration</p><h2 className="mt-2 text-2xl font-black">Risk Classification Thresholds</h2><p className="mt-2 text-sm font-semibold text-slate-200">Controls how the cumulative four-period forecast becomes Low, Moderate, or High. It does not change forecast case values.</p></div></div></div>
      <div className="space-y-5 p-6 sm:p-8"><div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><b>LOW RISK</b><p className="mt-2 text-xl font-black">&lt; {risk.moderate_threshold} cases</p></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><b>MODERATE RISK</b><p className="mt-2 text-xl font-black">{risk.moderate_threshold}–{Number(risk.high_threshold)-1} cases</p></div><div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><b>HIGH RISK</b><p className="mt-2 text-xl font-black">≥ {risk.high_threshold} cases</p></div></div>
        <div className={panel}><div className="grid gap-4 md:grid-cols-2"><Field label="Moderate Risk starts at" value={risk.moderate_threshold} onChange={v=>setRisk({...risk,moderate_threshold:v})} suffix="cases"/><Field label="High Risk starts at" value={risk.high_threshold} onChange={v=>setRisk({...risk,high_threshold:v})} suffix="cases"/></div>{riskError&&<p className="mt-3 text-sm font-bold text-rose-600">{riskError}</p>}<div className="mt-5 flex gap-3"><button disabled={loading||saving||riskError} onClick={saveRisk} className="rounded-2xl bg-brand-blue px-5 py-3 text-sm font-black text-white"><Save size={17} className="mr-2 inline"/>Save Risk Configuration</button><button disabled={saving} onClick={()=>setResetTarget('risk')} className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-black"><RotateCcw size={17} className="mr-2 inline"/>Reset to Default</button></div></div>
      </div>
    </section>

    <section className={card}>
      <div className="bg-gradient-to-r from-violet-950 via-indigo-950 to-violet-700 px-6 py-7 text-white sm:px-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200">Spatial Decision Support</p><h2 className="mt-2 text-2xl font-black">Hotspot Analysis Configuration</h2><p className="mt-2 text-sm font-semibold text-violet-100">Controls the hotspot formula, nearby search radius, and hotspot-level boundaries. Source dengue and forecast records are not changed.</p></div>
      <div className="space-y-5 p-6 sm:p-8">
        <div className={panel}><div className="mb-4"><h3 className="font-black">Hotspot score weights</h3><p className="text-sm font-semibold text-slate-500">The three weights must always total 100%.</p></div><div className="grid gap-4 md:grid-cols-3"><Field label="Local Barangay Risk" value={hotspot.local_weight} onChange={v=>setHotspot({...hotspot,local_weight:v})} suffix="%" max={100}/><Field label="Nearby Influence" value={hotspot.nearby_weight} onChange={v=>setHotspot({...hotspot,nearby_weight:v})} suffix="%" max={100}/><Field label="Spatial Concentration" value={hotspot.spatial_weight} onChange={v=>setHotspot({...hotspot,spatial_weight:v})} suffix="%" max={100}/></div><p className="mt-4 rounded-xl bg-violet-50 p-3 text-sm font-black text-violet-700">{hotspot.local_weight}% Local + {hotspot.nearby_weight}% Nearby + {hotspot.spatial_weight}% Spatial = {Number(hotspot.local_weight||0)+Number(hotspot.nearby_weight||0)+Number(hotspot.spatial_weight||0)}%</p></div>
        <div className={panel}><div className="grid gap-4 md:grid-cols-2"><Field label="Nearby barangay radius" value={hotspot.radius_km} onChange={v=>setHotspot({...hotspot,radius_km:v})} suffix="km" min={0.5} max={15} step={0.5}/><div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-sky-900"><b>What this changes:</b> barangays inside this distance can contribute to Nearby Influence. If none are inside the radius, the existing nearest-barangay fallback remains available.</div></div></div>
        <div className={panel}><h3 className="mb-4 font-black">Hotspot level thresholds</h3><div className="grid gap-4 md:grid-cols-3"><Field label="Watch Area starts at" value={hotspot.watch_threshold} onChange={v=>setHotspot({...hotspot,watch_threshold:v})} suffix="score" max={100}/><Field label="Emerging Hotspot starts at" value={hotspot.emerging_threshold} onChange={v=>setHotspot({...hotspot,emerging_threshold:v})} suffix="score" max={100}/><Field label="Confirmed Hotspot starts at" value={hotspot.confirmed_threshold} onChange={v=>setHotspot({...hotspot,confirmed_threshold:v})} suffix="score" max={100}/></div>{hotspotError&&<p className="mt-3 text-sm font-bold text-rose-600">{hotspotError}</p>}<div className="mt-5 flex flex-wrap gap-3"><button disabled={loading||saving||hotspotError} onClick={saveHotspot} className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"><Save size={17} className="mr-2 inline"/>Save Hotspot Configuration</button><button disabled={saving} onClick={()=>setResetTarget('hotspot')} className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-black"><RotateCcw size={17} className="mr-2 inline"/>Reset Hotspot Defaults</button></div></div>
        <div className="flex gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-semibold text-violet-900"><ShieldCheck className="shrink-0" size={20}/><p><strong>Original hotspot defaults:</strong> 60% Local Risk + 25% Nearby Influence + 15% Spatial Concentration, 3 km radius, Watch at 45, Emerging at 60, Confirmed at 75. Saving or resetting invalidates only the derived hotspot cache, not the uploaded datasets or forecast model.</p></div>
      </div>
    </section>

    <section className={card}><div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Transparency only</p><h2 className="mt-2 text-xl font-black">Combined Priority Score (CRS)</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">CRS remains read-only in this version. Its factor scores and thresholds stay visible in the Risk Explanation panels, but CHO/Admin cannot change the scoring model here. This prevents accidental changes to barangay ranking and response priority until an official CRS weighting policy is established.</p></div></section>

    {resetTarget&&<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl dark:bg-slate-950"><h3 className="text-xl font-black">Reset {resetTarget==='risk'?'risk thresholds':'hotspot settings'}?</h3><p className="mt-3 text-sm font-semibold text-slate-600">This restores the original system defaults. It does not delete uploaded data or retrain the forecasting model.</p><div className="mt-6 flex justify-end gap-3"><button onClick={()=>setResetTarget('')} className="rounded-2xl border px-4 py-2.5 text-sm font-black">Cancel</button><button onClick={doReset} className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white">Reset to Default</button></div></div></div>}
  </div>
}
