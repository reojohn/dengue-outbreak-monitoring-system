import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  CloudRain,
  Database,
  FileText,
  Loader2,
  Map as MapIcon,
  Sparkles,
  Users,
} from 'lucide-react'
import ai1 from '../../assets/ai1.png'
import ai2 from '../../assets/ai2.png'
import ai3 from '../../assets/ai3.png'
import ai4 from '../../assets/ai4.png'
import ai5 from '../../assets/ai5.png'
import ai6 from '../../assets/ai6.png'
import ai7 from '../../assets/ai7.png'
import ai8 from '../../assets/ai8.png'

const MODEL_CATALOG = [
  { key: 'gradient_boosting', name: 'Gradient Boosting', image: ai3 },
  { key: 'extra_trees', name: 'Extra Trees', image: ai2 },
  { key: 'random_forest', name: 'Random Forest', image: ai1 },
  { key: 'ridge_regression', name: 'Ridge Regression', image: ai5 },
  { key: 'decision_tree', name: 'Decision Tree', image: ai4 },
  { key: 'xgboost', name: 'XGBoost', image: ai6 },
  { key: 'lightgbm', name: 'LightGBM', image: ai7 },
  { key: 'catboost', name: 'CatBoost', image: ai8 },
]

const FALLBACK_BARANGAYS = [
  'Ampayon',
  'Baan KM 3',
  'Baan Riverside',
  'Bancasi',
  'Bonbon',
  'Doongan',
  'Libertad',
  'Obrero',
  'San Vicente',
  'Villa Kananga',
]

const STEPS = [
  {
    id: 'combine',
    shortLabel: 'Combine',
    label: 'Combining files',
    message: 'Creating one clean table from dengue, weather, population, and map files.',
    icon: Database,
  },
  {
    id: 'names',
    shortLabel: 'Barangays',
    label: 'Checking barangay names',
    message: 'Making sure dengue barangays match the population file and map boundary file.',
    icon: ClipboardCheck,
  },
  {
    id: 'model',
    shortLabel: 'Models',
    label: 'Choosing the best forecast method',
    message: 'The system is evaluating the available machine learning models for the current dataset.',
    icon: Bot,
  },
  {
    id: 'forecast',
    shortLabel: 'Forecast',
    label: 'Creating dengue forecast',
    message: 'The selected model is generating the four-step dengue forecast and saving the results.',
    icon: Sparkles,
  },
  {
    id: 'done',
    shortLabel: 'Ready',
    label: 'Forecast ready',
    message: 'Automatic preparation is complete. The latest forecast is ready to use.',
    icon: CheckCircle2,
  },
]

function normalizeModelKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^auto_selected_/, '')
    .replace(/regression$/, 'regression')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getSelectedModelMeta(selectedModel = '') {
  const key = normalizeModelKey(selectedModel)

  const directMatch = MODEL_CATALOG.find((model) => model.key === key)
  if (directMatch) return directMatch

  const text = String(selectedModel || '').toLowerCase()
  const fuzzyMatch = MODEL_CATALOG.find((model) => {
    const modelText = model.name.toLowerCase()
    return text.includes(modelText) || modelText.includes(text)
  })

  return fuzzyMatch || null
}

function SourceMergeVisual() {
  const sources = [
    { label: 'Dengue', helper: 'Case records', icon: FileText, delay: '0ms' },
    { label: 'Weather', helper: 'Climate fields', icon: CloudRain, delay: '180ms' },
    { label: 'Population', helper: 'Demographics', icon: Users, delay: '360ms' },
    { label: 'Boundary', helper: 'Map geometry', icon: MapIcon, delay: '540ms' },
  ]

  return (
    <div className="relative flex min-h-[450px] flex-col justify-center overflow-hidden rounded-[34px] border border-white/10 bg-slate-950/60 p-6 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(34,211,238,0.15),transparent_44%)]" />

      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-4">
        {sources.map((source) => {
          const Icon = source.icon

          return (
            <div
              key={source.label}
              className="ap-source-card rounded-[22px] border border-white/10 bg-white/[0.055] p-3.5 text-center shadow-[0_12px_30px_rgba(2,6,23,0.28)]"
              style={{ animationDelay: source.delay }}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border border-cyan-300/15 bg-cyan-300/10 text-cyan-100">
                <Icon className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-black text-white">{source.label}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{source.helper}</p>
            </div>
          )
        })}
      </div>

      <div className="relative mx-auto my-4 flex w-[86%] items-center gap-2 sm:w-[72%]">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-300/45 to-cyan-300/20" />
        <span className="ap-merge-dot h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
        <span className="h-px flex-1 bg-gradient-to-r from-cyan-300/20 via-cyan-300/45 to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[560px] items-center gap-4 rounded-[24px] border border-cyan-300/20 bg-cyan-300/[0.08] p-4 shadow-[0_0_34px_rgba(34,211,238,0.10)]">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
          <span className="ap-database-ring absolute inset-[-7px] rounded-[25px] border border-cyan-300/20" />
          <Database className="relative h-8 w-8" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.12em] text-cyan-200/80">Integrated dataset</p>
          <p className="mt-1 text-xl font-black text-white">Merging validated records</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="ap-indeterminate-bar h-full w-[42%] rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-emerald-300" />
          </div>
        </div>
      </div>
    </div>
  )
}

function BarangayCheckVisual({ names = [], nameIndex = 0 }) {
  const normalizedNames = names.length ? names : FALLBACK_BARANGAYS
  const visibleRows = Array.from({ length: Math.min(5, normalizedNames.length) }, (_, offset) => {
    const index = (nameIndex + offset) % normalizedNames.length
    return {
      name: normalizedNames[index],
      active: offset === 2,
      complete: offset < 2,
    }
  })

  return (
    <div className="relative min-h-[400px] overflow-hidden rounded-[34px] border border-white/10 bg-slate-950/60 p-5 sm:p-6">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.11),transparent_58%)]" />

      <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.13em] text-violet-200/80">Name alignment engine</p>
          <p className="mt-1.5 text-lg font-black text-white">Checking canonical barangay names</p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-violet-300/20 bg-violet-300/10 text-violet-200">
          <ClipboardCheck className="h-5 w-5" />
        </div>
      </div>

      <div className="relative mt-5 grid gap-2.5">
        {visibleRows.map((row, index) => (
          <div
            key={`${row.name}-${index}`}
            className={`flex items-center justify-between gap-3 rounded-[20px] border px-4 py-3.5 transition-all duration-300 ${
              row.active
                ? 'ap-name-active border-cyan-300/30 bg-cyan-300/10 shadow-[0_0_26px_rgba(34,211,238,0.10)]'
                : row.complete
                  ? 'border-emerald-300/15 bg-emerald-300/[0.06]'
                  : 'border-white/[0.08] bg-white/[0.035]'
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border ${
                  row.complete
                    ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
                    : row.active
                      ? 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100'
                      : 'border-white/10 bg-white/5 text-slate-500'
                }`}
              >
                {row.complete ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : row.active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-black text-slate-100">{row.name}</p>
                <p className="mt-1 text-sm font-semibold text-slate-300">
                  {row.complete ? 'Name matched' : row.active ? 'Comparing aliases and map names...' : 'Queued for checking'}
                </p>
              </div>
            </div>
            <span className={`shrink-0 text-xs font-black uppercase tracking-[0.10em] ${row.complete ? 'text-emerald-300' : row.active ? 'text-cyan-200' : 'text-slate-600'}`}>
              {row.complete ? 'Matched' : row.active ? 'Checking' : 'Waiting'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModelCarouselVisual({ modelIndex = 0, selectedModel = '', selectionFinalized = false }) {
  const previous = MODEL_CATALOG[(modelIndex - 1 + MODEL_CATALOG.length) % MODEL_CATALOG.length]
  const current = MODEL_CATALOG[modelIndex % MODEL_CATALOG.length]
  const next = MODEL_CATALOG[(modelIndex + 1) % MODEL_CATALOG.length]

  return (
    <div className="relative flex min-h-[400px] flex-col justify-center overflow-hidden rounded-[34px] border border-white/10 bg-slate-950/60 p-5 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.13),transparent_46%)]" />

      <div className="relative mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-blue-200/80">Candidate model evaluation</p>
          <p className="mt-1.5 text-lg font-black text-white">Comparing forecasting algorithms</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/15 bg-blue-300/[0.08] px-4 py-2.5 text-sm font-black text-blue-100">
          {selectionFinalized ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-200" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {selectionFinalized ? 'Best model selected' : 'Evaluating models'}
        </span>
      </div>

      <div className="relative grid grid-cols-[0.78fr_1.35fr_0.78fr] items-center gap-3 sm:gap-4">
        {[previous, current, next].map((model, index) => {
          const isCurrent = index === 1

          return (
            <div
              key={`${model.key}-${index}`}
              className={`ap-carousel-enter relative overflow-hidden rounded-[26px] border text-center transition-all duration-500 ${
                isCurrent
                  ? 'ap-model-current min-h-[320px] border-cyan-300/30 bg-gradient-to-b from-cyan-300/10 to-blue-500/[0.08] p-4 shadow-[0_0_42px_rgba(34,211,238,0.14)]'
                  : 'min-h-[245px] scale-[0.94] border-white/[0.08] bg-white/[0.035] p-4 opacity-50'
              }`}
            >
              <div className={`mx-auto flex items-center justify-center ${isCurrent ? 'h-52' : 'h-36'}`}>
                <img
                  src={model.image}
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                  className={`${isCurrent ? 'h-48 w-48' : 'h-32 w-32'} select-none object-contain drop-shadow-[0_14px_24px_rgba(2,6,23,0.55)]`}
                />
              </div>
              <p className={`${isCurrent ? 'mt-2 text-2xl' : 'mt-3 text-base'} font-black text-white`}>{model.name}</p>
              {isCurrent ? (
                <p className="mx-auto mt-2 max-w-[330px] text-sm font-semibold leading-6 text-cyan-100/85">
                  {selectionFinalized
                    ? 'Selected as the best-performing model for the current dataset.'
                    : 'Testing predictive performance and ranking candidate models.'}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="relative mt-5 flex items-center justify-center gap-1.5">
        {MODEL_CATALOG.map((model, index) => (
          <span
            key={model.key}
            className={`h-1.5 rounded-full transition-all duration-300 ${index === modelIndex ? 'w-6 bg-cyan-300' : 'w-1.5 bg-white/15'}`}
          />
        ))}
      </div>
    </div>
  )
}

function ForecastVisual({ selectedModel = '', pulseTick = 0 }) {
  const selected = getSelectedModelMeta(selectedModel) || MODEL_CATALOG[7]
  const heights = [44, 68, 54, 78]

  return (
    <div className="relative flex min-h-[400px] flex-col justify-center overflow-hidden rounded-[34px] border border-white/10 bg-slate-950/60 p-5 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_50%,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_75%_50%,rgba(16,185,129,0.09),transparent_38%)]" />

      <div className="relative grid gap-5 lg:grid-cols-[270px_1fr] lg:items-center">
        <div className="rounded-[26px] border border-cyan-300/20 bg-cyan-300/[0.07] p-4 text-center">
          <div className="ap-selected-model mx-auto flex h-44 w-44 items-center justify-center rounded-full border border-cyan-300/15 bg-slate-950/55">
            <img
              src={selected.image}
              alt=""
              aria-hidden="true"
              draggable="false"
              className="h-36 w-36 select-none object-contain drop-shadow-[0_14px_28px_rgba(2,6,23,0.55)]"
            />
          </div>
          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200/65">Selected model</p>
          <p className="mt-1.5 text-xl font-black text-white">{selected.name}</p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.13em] text-emerald-200/80">Direct multi-step forecast</p>
              <p className="mt-1.5 text-lg font-black text-white">Generating four forecast horizons</p>
            </div>
            <Sparkles className="h-5 w-5 text-emerald-200" />
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2.5">
            {heights.map((height, index) => {
              const active = index === pulseTick % heights.length

              return (
                <div
                  key={`forecast-horizon-${index}`}
                  className={`relative overflow-hidden rounded-[22px] border p-3.5 text-center transition-all duration-300 ${
                    active
                      ? 'border-emerald-300/25 bg-emerald-300/[0.09] shadow-[0_0_22px_rgba(16,185,129,0.10)]'
                      : 'border-white/[0.08] bg-white/[0.035]'
                  }`}
                >
                  <div className="flex h-28 items-end justify-center">
                    <div
                      className="ap-forecast-bar w-9 rounded-t-xl bg-gradient-to-t from-blue-500 via-cyan-300 to-emerald-300 shadow-[0_0_16px_rgba(34,211,238,0.18)]"
                      style={{ height: `${height}%`, animationDelay: `${index * 140}ms` }}
                    />
                  </div>
                  <p className="mt-3 text-sm font-black uppercase tracking-[0.09em] text-slate-300">Month +{index + 1}</p>
                  <p className="mt-1.5 text-sm font-bold text-slate-100">Generating</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function DoneVisual({ selectedModel = '' }) {
  const selected = getSelectedModelMeta(selectedModel)

  return (
    <div className="relative flex min-h-[400px] items-center justify-center overflow-hidden rounded-[34px] border border-emerald-300/15 bg-slate-950/60 p-6 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.16),transparent_48%)]" />

      <div className="relative">
        <div className="ap-ready-ring mx-auto flex h-32 w-32 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-emerald-200 shadow-[0_0_48px_rgba(16,185,129,0.18)]">
          <CheckCircle2 className="h-14 w-14" strokeWidth={2.3} />
        </div>
        <p className="mt-6 text-sm font-black uppercase tracking-[0.16em] text-emerald-200/80">Processing complete</p>
        <p className="mt-2 text-2xl font-black text-white">Forecast results are ready</p>
        {selected ? (
          <div className="mx-auto mt-4 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.045] px-4 py-2">
            <img src={selected.image} alt="" aria-hidden="true" className="h-14 w-14 object-contain" />
            <span className="text-base font-black text-slate-100">{selected.name} selected</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function AutoProcessingModal({
  visible,
  step = 'combine',
  detail = '',
  selectedModel = '',
  barangayNames = [],
}) {
  const [modelIndex, setModelIndex] = useState(0)
  const [nameIndex, setNameIndex] = useState(0)
  const [pulseTick, setPulseTick] = useState(0)

  const activeIndex = Math.max(0, STEPS.findIndex((item) => item.id === step))
  const activeStep = STEPS[activeIndex] || STEPS[0]

  const selectedModelMeta = getSelectedModelMeta(selectedModel)
  const normalizedDetail = String(detail || '').toLowerCase()
  const modelSelectionFinalized = Boolean(
    selectedModelMeta &&
    (
      normalizedDetail.includes('was selected') ||
      normalizedDetail.includes('best model selected') ||
      normalizedDetail.includes('selected for the current integrated dataset') ||
      normalizedDetail.includes('preparing the four forecast horizons')
    )
  )

  const safeBarangayNames = useMemo(() => {
    const unique = Array.from(
      new Set(
        (Array.isArray(barangayNames) ? barangayNames : [])
          .map((name) => String(name || '').trim())
          .filter(Boolean)
      )
    )

    return unique.length >= 5 ? unique.slice(0, 18) : FALLBACK_BARANGAYS
  }, [barangayNames])

  useEffect(() => {
    if (!visible || step !== 'model') return undefined

    const selectedMeta = getSelectedModelMeta(selectedModel)
    const normalizedDetail = String(detail || '').toLowerCase()

    const selectionFinalized = Boolean(
      selectedMeta &&
      (
        normalizedDetail.includes('was selected') ||
        normalizedDetail.includes('best model selected') ||
        normalizedDetail.includes('selected for the current integrated dataset') ||
        normalizedDetail.includes('preparing the four forecast horizons')
      )
    )

    if (selectionFinalized) {
      const selectedIndex = MODEL_CATALOG.findIndex(
        (model) => model.key === selectedMeta.key
      )

      if (selectedIndex >= 0) {
        setModelIndex(selectedIndex)
      }

      return undefined
    }

    // Keep cycling while the backend is genuinely evaluating models.
    // selectedModel may contain a previous/stale value, so it must not
    // freeze the carousel until the detail text confirms selection is done.
    const timer = window.setInterval(() => {
      setModelIndex((current) => (current + 1) % MODEL_CATALOG.length)
    }, 950)

    return () => window.clearInterval(timer)
  }, [visible, step, selectedModel, detail])

  useEffect(() => {
    if (!visible || step !== 'names') return undefined

    const timer = window.setInterval(() => {
      setNameIndex((current) => (current + 1) % safeBarangayNames.length)
    }, 760)

    return () => window.clearInterval(timer)
  }, [visible, step, safeBarangayNames.length])

  useEffect(() => {
    if (!visible || step !== 'forecast') return undefined

    const timer = window.setInterval(() => {
      setPulseTick((current) => current + 1)
    }, 650)

    return () => window.clearInterval(timer)
  }, [visible, step])

  useEffect(() => {
    if (!visible) {
      setModelIndex(0)
      setNameIndex(0)
      setPulseTick(0)
    }
  }, [visible])

  if (!visible || typeof document === 'undefined') return null

  const progressWidth = step === 'done' ? 100 : [18, 38, 64, 88, 100][activeIndex] || 18

  const stageVisual = (() => {
    if (step === 'combine') return <SourceMergeVisual />
    if (step === 'names') return <BarangayCheckVisual names={safeBarangayNames} nameIndex={nameIndex} />
    if (step === 'model') {
      return (
        <ModelCarouselVisual
          modelIndex={modelIndex}
          selectedModel={selectedModel}
          selectionFinalized={modelSelectionFinalized}
        />
      )
    }
    if (step === 'forecast') return <ForecastVisual selectedModel={selectedModel} pulseTick={pulseTick} />
    return <DoneVisual selectedModel={selectedModel} />
  })()

  const modal = (
    <div className="fixed inset-0 z-[99999] flex min-h-dvh items-center justify-center overflow-y-auto bg-slate-950/80 px-3 py-5 backdrop-blur-md sm:px-5 sm:py-7">
      <style>{`
        @keyframes apSourcePulse {
          0%, 100% { transform: translateY(0) scale(1); border-color: rgba(255,255,255,.10); }
          50% { transform: translateY(-8px) scale(1.02); border-color: rgba(34,211,238,.34); box-shadow: 0 18px 42px rgba(34,211,238,.10); }
        }
        @keyframes apMergeDot {
          0% { transform: translateX(-120px) scale(.65); opacity: 0; }
          18% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateX(120px) scale(1.25); opacity: 0; }
        }
        @keyframes apRing {
          0%, 100% { transform: scale(.92); opacity: .24; }
          50% { transform: scale(1.18); opacity: .92; }
        }
        @keyframes apIndeterminate {
          0% { transform: translateX(-115%); }
          100% { transform: translateX(260%); }
        }
        @keyframes apNameGlow {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(34,211,238,0); }
          50% { transform: scale(1.018); box-shadow: 0 0 34px rgba(34,211,238,.14); }
        }
        @keyframes apModelFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: drop-shadow(0 16px 24px rgba(2,6,23,.55)); }
          50% { transform: translateY(-10px) scale(1.035); filter: drop-shadow(0 24px 34px rgba(34,211,238,.20)); }
        }
        @keyframes apForecastBar {
          0%, 100% { transform: scaleY(.58); opacity: .58; filter: brightness(.85); }
          50% { transform: scaleY(1); opacity: 1; filter: brightness(1.25); }
        }

        @keyframes apCarouselEnter {
          0% { opacity: .25; transform: translateX(18px) scale(.96); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }

        @keyframes apReady {
          0% { transform: scale(.72); opacity: 0; }
          70% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes apSheenSweep {
          0% { transform: translateX(-180%) skewX(-18deg); opacity: 0; }
          25% { opacity: .75; }
          75% { opacity: .75; }
          100% { transform: translateX(420%) skewX(-18deg); opacity: 0; }
        }
        @keyframes apRowScan {
          0% { transform: translateX(-120%); opacity: 0; }
          25% { opacity: 1; }
          100% { transform: translateX(820%); opacity: 0; }
        }
        @keyframes apModelHalo {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,.10), inset 0 0 0 1px rgba(34,211,238,.10); }
          50% { box-shadow: 0 0 52px 10px rgba(34,211,238,.13), inset 0 0 0 1px rgba(34,211,238,.30); }
        }
        .ap-source-card, .ap-model-current, .ap-name-active { position: relative; overflow: hidden; }
        .ap-carousel-enter { animation: apCarouselEnter .34s ease-out both; }
        .ap-source-card::after, .ap-model-current::after {
          content: ''; position: absolute; inset-block: 0; left: -45%; width: 28%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent);
          transform: skewX(-18deg); pointer-events: none; animation: apSheenSweep 2.8s ease-in-out infinite;
        }
        .ap-name-active::after {
          content: ''; position: absolute; top: 0; bottom: 0; left: -18%; width: 14%;
          background: linear-gradient(90deg, transparent, rgba(103,232,249,.11), transparent);
          pointer-events: none; animation: apRowScan 1.5s ease-in-out infinite;
        }
        .ap-model-current { animation: apModelFloat 1.8s ease-in-out infinite, apModelHalo 1.8s ease-in-out infinite; }
        .ap-source-card { animation: apSourcePulse 2.2s ease-in-out infinite; }
        .ap-merge-dot { animation: apMergeDot 1.35s ease-in-out infinite; }
        .ap-database-ring { animation: apRing 1.7s ease-in-out infinite; }
        .ap-indeterminate-bar { animation: apIndeterminate 1.45s ease-in-out infinite; }
        .ap-name-active { animation: apNameGlow 1.05s ease-in-out infinite; }
        .ap-selected-model { animation: apModelFloat 2s ease-in-out infinite; }
        .ap-forecast-bar { transform-origin: bottom; animation: apForecastBar 1.15s ease-in-out infinite; }
        .ap-ready-ring { animation: apReady .55s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .ap-source-card,
          .ap-carousel-enter,
          .ap-merge-dot,
          .ap-database-ring,
          .ap-indeterminate-bar,
          .ap-name-active,
          .ap-model-current,
          .ap-selected-model,
          .ap-forecast-bar,
          .ap-ready-ring { animation: none !important; }
        }
      `}</style>

      <div className="relative w-full max-w-[1120px] overflow-hidden rounded-[42px] border border-white/[0.14] bg-[#040b1b] p-5 text-white shadow-[0_38px_120px_rgba(0,0,0,0.62)] ring-1 ring-white/[0.06] sm:p-7 lg:p-9">
        <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-cyan-400/[0.16] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-emerald-400/[0.10] blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.055)_1px,transparent_1px)] bg-[size:24px_24px] opacity-35" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

        <div className="relative">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] border border-cyan-300/20 bg-cyan-300/[0.09] text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.12)]">
                {step === 'done' ? (
                  <CheckCircle2 className="h-9 w-9 text-emerald-200" />
                ) : (
                  <Loader2 className="h-9 w-9 animate-spin" />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-cyan-200/80">Automatic data preparation</p>
                <h3 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-[2.6rem]">{activeStep.label}</h3>
                <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-slate-300 sm:text-lg sm:leading-8">
                  {detail || activeStep.message}
                </p>
              </div>
            </div>

            <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-5 py-2.5 text-sm font-black uppercase tracking-[0.12em] text-slate-200">
              Stage {activeIndex + 1} of {STEPS.length}
            </div>
          </div>

          <div className="mt-7">{stageVisual}</div>

          <div className="mt-7 grid grid-cols-5 gap-2 sm:gap-3">
            {STEPS.map((item, index) => {
              const StepIcon = item.icon
              const isDone = index < activeIndex || step === 'done'
              const isActive = index === activeIndex && step !== 'done'

              return (
                <div
                  key={item.id}
                  className={`rounded-[22px] border px-3 py-3.5 text-center transition sm:rounded-[24px] sm:px-4 sm:py-4 ${
                    isDone
                      ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200'
                      : isActive
                        ? 'border-cyan-300/25 bg-cyan-300/[0.09] text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.08)]'
                        : 'border-white/[0.07] bg-white/[0.025] text-slate-500'
                  }`}
                >
                  <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-[12px] bg-white/[0.055] sm:h-9 sm:w-9 sm:rounded-[14px]">
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <StepIcon className="h-4 w-4" />
                    )}
                  </div>
                  <p className="mt-2 text-[11px] font-black uppercase tracking-[0.08em] sm:text-xs sm:tracking-[0.10em]">
                    {item.shortLabel}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-emerald-300 shadow-[0_0_18px_rgba(34,211,238,0.38)] transition-all duration-700"
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 text-sm font-semibold text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
