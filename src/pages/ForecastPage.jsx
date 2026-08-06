import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CloudRain,
  ChevronDown,
  ChevronUp,
  Database,
  Droplets,
  Gauge,
  LineChart,
  MapPin,
  MousePointerClick,
  Play,
  Search,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Target,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Users,
  CalendarDays,
  X,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import {
  compareCanonicalBarangayPriority,
  computeDecisionSupport,
  computeMultiSourceRisk,
  computeRiskLevel,
  getCanonicalCombinedRiskScore,
  riskStyles,
} from '../utils/analytics'

import {
  getLatestModelMetrics,
} from '../services/api'
import aiGif from '../assets/ai.gif'
import ai1 from '../assets/ai1.png'
import ai2 from '../assets/ai2.png'
import ai3 from '../assets/ai3.png'
import ai4 from '../assets/ai4.png'
import ai5 from '../assets/ai5.png'
import ai6 from '../assets/ai6.png'
import ai7 from '../assets/ai7.png'
import ai8 from '../assets/ai8.png'
import forecastHeroBackground from '../assets/forecast.png'

const modeMeta = {
  caution: {
    label: 'Reduced transmission',
    multiplier: 0.9,
    chip: 'bg-emerald-50 text-brand-green border-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  baseline: {
    label: 'Expected scenario',
    multiplier: 1,
    chip: 'bg-blue-50 text-brand-blue border-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  },
  elevated: {
    label: 'Worsening transmission',
    multiplier: 1.15,
    chip: 'bg-amber-50 text-brand-orange border-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  },
}

const modelIcons = [ai1, ai2, ai3, ai4, ai5, ai6, ai7, ai8]

const modelIconMap = {
  random_forest: ai1,
  extra_trees: ai2,
  gradient_boosting: ai3,
  decision_tree: ai4,
  ridge_regression: ai5,
  xgboost: ai6,
  lightgbm: ai7,
  catboost: ai8,
}

const modelCatalog = [
  { model_key: 'gradient_boosting', model_name: 'Gradient Boosting' },
  { model_key: 'extra_trees', model_name: 'Extra Trees' },
  { model_key: 'random_forest', model_name: 'Random Forest' },
  { model_key: 'ridge_regression', model_name: 'Ridge Regression' },
  { model_key: 'decision_tree', model_name: 'Decision Tree' },
  { model_key: 'xgboost', model_name: 'XGBoost' },
  { model_key: 'lightgbm', model_name: 'LightGBM' },
  { model_key: 'catboost', model_name: 'CatBoost' },
]

function getForecastPeriodDisplay(backendForecastResult = null) {
  const forecastRows = Array.isArray(backendForecastResult?.forecast_results)
    ? backendForecastResult.forecast_results
    : []
  const periodLabels = forecastRows
    .map((row) => String(row?.latest_period || '').trim())
    .filter(Boolean)
  const monthlyPeriodCount = periodLabels.filter((value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)).length
  const weeklyPeriodCount = periodLabels.filter((value) => /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/i.test(value)).length
  const periodsLookMonthly =
    periodLabels.length > 0 && monthlyPeriodCount >= Math.ceil(periodLabels.length * 0.8)
  const periodsLookWeekly =
    periodLabels.length > 0 && weeklyPeriodCount >= Math.ceil(periodLabels.length * 0.8)

  const rawUnit = String(
    backendForecastResult?.forecast_period_unit ||
      backendForecastResult?.validation_summary?.forecast_period_unit ||
      ''
  )
    .trim()
    .toLowerCase()

  const granularity = String(
    backendForecastResult?.temporal_granularity ||
      backendForecastResult?.validation_summary?.temporal_granularity ||
      ''
  )
    .trim()
    .toLowerCase()

  const unit = periodsLookMonthly
    ? 'month'
    : periodsLookWeekly
      ? 'week'
      : rawUnit ||
        (granularity.includes('month')
          ? 'month'
          : granularity.includes('day')
            ? 'day'
            : 'week')

  if (unit.startsWith('month')) {
    return {
      unit: 'month',
      singular: 'month',
      plural: 'months',
      adjective: 'Monthly',
      prefix: 'M',
    }
  }

  if (unit.startsWith('day')) {
    return {
      unit: 'day',
      singular: 'day',
      plural: 'days',
      adjective: 'Daily',
      prefix: 'D',
    }
  }

  if (unit.startsWith('week')) {
    return {
      unit: 'week',
      singular: 'week',
      plural: 'weeks',
      adjective: 'Weekly',
      prefix: 'W',
    }
  }

  return {
    unit: 'period',
    singular: 'period',
    plural: 'periods',
    adjective: 'Forecast-period',
    prefix: 'P',
  }
}

function hasMetricValue(value) {
  const number = Number(value)
  return Number.isFinite(number)
}

function getComparableMetric(model = {}, key = 'rmse') {
  const value = Number(model[key])
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

function normalizeModelKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getModelIcon(model = {}, index = 0) {
  const key = normalizeModelKey(
    model.model_key || model.model_name || model.model || ''
  )

  if (modelIconMap[key]) {
    return modelIconMap[key]
  }

  const matchedKey = key
    ? Object.keys(modelIconMap).find((modelKey) => {
        return key.includes(modelKey) || modelKey.includes(key)
      })
    : ''

  return (
    (matchedKey ? modelIconMap[matchedKey] : null) ||
    modelIcons[index % modelIcons.length]
  )
}

function ForecastFindingsChat({
  messages = [],
  modelName = 'Forecast AI',
  modelImage = null,
}) {
  const messageSeparator = '\u241E'
  const messageSignature = messages
    .map((message) => String(message || '').trim())
    .filter(Boolean)
    .join(messageSeparator)
  const messageList = messageSignature
    ? messageSignature.split(messageSeparator)
    : []

  const [messageIndex, setMessageIndex] = useState(0)
  const [visibleText, setVisibleText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [playbackMode, setPlaybackMode] = useState('auto')
  const autoAdvanceTimeoutRef = useRef(null)
  const autoSwitchTimeoutRef = useRef(null)
  const manualSwitchTimeoutRef = useRef(null)

  useEffect(() => {
    setMessageIndex(0)
  }, [messageSignature])

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) {
        window.clearTimeout(autoAdvanceTimeoutRef.current)
      }

      if (autoSwitchTimeoutRef.current) {
        window.clearTimeout(autoSwitchTimeoutRef.current)
      }

      if (manualSwitchTimeoutRef.current) {
        window.clearTimeout(manualSwitchTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!messageList.length) {
      setVisibleText('')
      setIsTyping(false)
      setIsThinking(false)
      setIsSwitching(false)
      return undefined
    }

    const currentIndex = messageIndex % messageList.length
    const currentMessage = messageList[currentIndex]
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timeoutIds = []

    const schedule = (callback, delay) => {
      const timeoutId = window.setTimeout(callback, delay)
      timeoutIds.push(timeoutId)
      return timeoutId
    }

    setVisibleText('')
    setIsSwitching(false)

    if (prefersReducedMotion) {
      setVisibleText(currentMessage)
      setIsTyping(false)
      setIsThinking(false)

      return () => {
        timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
      }
    }

    setIsTyping(false)
    setIsThinking(true)

    schedule(() => {
      let characterIndex = 0

      setIsThinking(false)
      setIsTyping(true)

      const typeNextCharacter = () => {
        characterIndex = Math.min(currentMessage.length, characterIndex + 1)
        setVisibleText(currentMessage.slice(0, characterIndex))

        if (characterIndex < currentMessage.length) {
          const typedCharacter = currentMessage[characterIndex - 1] || ''
          const nextDelay = /[.!?]/.test(typedCharacter)
            ? 170
            : /[,;:]/.test(typedCharacter)
              ? 90
              : 42

          schedule(typeNextCharacter, nextDelay)
          return
        }

        setIsTyping(false)
      }

      typeNextCharacter()
    }, 850)

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [messageIndex, messageSignature])

  const safeMessageIndex = messageList.length
    ? messageIndex % messageList.length
    : 0
  const currentFullMessage = messageList[safeMessageIndex] || ''
  const conversationProgress = messageList.length
    ? ((safeMessageIndex + 1) / messageList.length) * 100
    : 0
  const isMessageComplete = Boolean(
    currentFullMessage &&
      visibleText === currentFullMessage &&
      !isTyping &&
      !isThinking
  )
  const readingDelay = Math.min(
    9800,
    Math.max(4600, currentFullMessage.length * 26)
  )

  useEffect(() => {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current)
      autoAdvanceTimeoutRef.current = null
    }

    if (
      playbackMode !== 'auto' ||
      !messageList.length ||
      !isMessageComplete
    ) {
      return undefined
    }

    autoAdvanceTimeoutRef.current = window.setTimeout(() => {
      autoAdvanceTimeoutRef.current = null
      setIsSwitching(true)

      autoSwitchTimeoutRef.current = window.setTimeout(() => {
        autoSwitchTimeoutRef.current = null
        setMessageIndex((current) => {
          return (current + 1) % messageList.length
        })
      }, 320)
    }, readingDelay)

    return () => {
      if (autoAdvanceTimeoutRef.current) {
        window.clearTimeout(autoAdvanceTimeoutRef.current)
        autoAdvanceTimeoutRef.current = null
      }
    }
  }, [
    playbackMode,
    messageList.length,
    isMessageComplete,
    readingDelay,
  ])

  function handlePlaybackModeChange(nextMode) {
    if (nextMode === playbackMode) return

    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current)
      autoAdvanceTimeoutRef.current = null
    }

    if (autoSwitchTimeoutRef.current) {
      window.clearTimeout(autoSwitchTimeoutRef.current)
      autoSwitchTimeoutRef.current = null
      setIsSwitching(false)
    }

    setPlaybackMode(nextMode)
  }

  function handleManualNext() {
    if (
      playbackMode !== 'manual' ||
      !messageList.length ||
      !isMessageComplete ||
      isSwitching
    ) {
      return
    }

    if (manualSwitchTimeoutRef.current) {
      window.clearTimeout(manualSwitchTimeoutRef.current)
    }

    setIsSwitching(true)
    manualSwitchTimeoutRef.current = window.setTimeout(() => {
      setMessageIndex((current) => {
        return (current + 1) % messageList.length
      })
      manualSwitchTimeoutRef.current = null
    }, 320)
  }

  const statusMessage = isThinking
    ? 'Reviewing the latest forecast...'
    : isTyping
      ? 'Composing an interpretation slowly...'
      : playbackMode === 'manual'
        ? 'Finding complete. Select Next insight when you are ready.'
        : 'Finding complete. The next insight will play automatically.'

  return (
    <div
      className="relative mt-4 overflow-hidden rounded-[28px] border border-cyan-200/15 bg-slate-950/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_rgba(2,6,23,0.22)] backdrop-blur-xl sm:p-5"
      role="region"
      aria-label={`${modelName} forecast conversation`}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-36 w-36 rounded-full bg-emerald-300/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />

      <div className="relative flex items-start gap-3.5 sm:gap-4">
        <div className="relative -mt-1 h-20 w-20 shrink-0 sm:h-24 sm:w-24">
          <div className="pointer-events-none absolute inset-2 rounded-full bg-cyan-300/20 blur-2xl" />
          {modelImage ? (
            <img
              src={modelImage}
              alt={`${modelName} AI assistant`}
              className="relative h-full w-full object-contain drop-shadow-[0_12px_22px_rgba(34,211,238,0.38)]"
            />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center text-cyan-200">
              <Sparkles className="h-8 w-8" />
            </div>
          )}
          <span className="absolute right-1 top-1 h-4 w-4 rounded-full border-[3px] border-slate-950 bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.95)]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-black text-white">
                  {modelName}
                </span>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.13em] text-emerald-200">
                  Live
                </span>
              </div>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100/45">
                Forecast intelligence assistant
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <div
                className="inline-flex rounded-[14px] border border-white/10 bg-slate-950/55 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                role="group"
                aria-label="AI conversation playback mode"
              >
                <button
                  type="button"
                  onClick={() => handlePlaybackModeChange('auto')}
                  aria-pressed={playbackMode === 'auto'}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.11em] transition ${
                    playbackMode === 'auto'
                      ? 'bg-gradient-to-r from-cyan-300 to-emerald-300 text-slate-950 shadow-[0_8px_20px_rgba(34,211,238,0.20)]'
                      : 'text-white/45 hover:bg-white/5 hover:text-white/75'
                  }`}
                >
                  <Play className="h-3.5 w-3.5" fill={playbackMode === 'auto' ? 'currentColor' : 'none'} />
                  Automatic
                </button>

                <button
                  type="button"
                  onClick={() => handlePlaybackModeChange('manual')}
                  aria-pressed={playbackMode === 'manual'}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.11em] transition ${
                    playbackMode === 'manual'
                      ? 'bg-gradient-to-r from-cyan-300 to-emerald-300 text-slate-950 shadow-[0_8px_20px_rgba(34,211,238,0.20)]'
                      : 'text-white/45 hover:bg-white/5 hover:text-white/75'
                  }`}
                >
                  <MousePointerClick className="h-3.5 w-3.5" />
                  Manual
                </button>
              </div>

              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black text-white/50">
                Insight {messageList.length ? safeMessageIndex + 1 : 0} of {messageList.length}
              </span>
            </div>
          </div>

          <div
            className="relative mt-3 min-h-[112px] overflow-hidden rounded-[24px] rounded-tl-md border border-white/10 bg-gradient-to-br from-white/[0.10] via-white/[0.06] to-cyan-300/[0.06] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-5"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="pointer-events-none absolute right-4 top-4 h-14 w-14 rounded-full border border-white/5" />
            <div
              className={`relative transition-all duration-300 ${
                isSwitching
                  ? 'translate-y-1 opacity-0'
                  : 'translate-y-0 opacity-100'
              }`}
            >
              {isThinking && !visibleText ? (
                <div className="flex min-h-[78px] items-center gap-2.5" aria-hidden="true">
                  <span className="text-sm font-semibold text-white/60">
                    Analyzing forecast signals
                  </span>
                  <span className="flex items-center gap-1">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300"
                        style={{ animationDelay: `${dot * 120}ms` }}
                      />
                    ))}
                  </span>
                </div>
              ) : (
                <p className="min-h-[78px] text-sm font-semibold leading-7 text-white/90 sm:text-[15px]">
                  <span>{visibleText}</span>
                  <span
                    aria-hidden="true"
                    className={`ml-1 inline-block h-4 w-[2px] translate-y-[2px] rounded-full bg-cyan-300 transition-opacity ${
                      isTyping
                        ? 'animate-pulse opacity-100'
                        : 'opacity-0'
                    }`}
                  />
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold text-white/40">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isThinking || isTyping
                  ? 'animate-pulse bg-cyan-300'
                  : 'bg-emerald-300'
              }`} />
              <span>{statusMessage}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              {playbackMode === 'manual' && (
                <button
                  type="button"
                  onClick={handleManualNext}
                  disabled={!isMessageComplete || isSwitching}
                  className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[13px] border border-cyan-200/20 bg-cyan-300/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.11em] text-cyan-100 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200/35 hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
                >
                  <span>{isMessageComplete ? 'Next insight' : 'AI is speaking'}</span>
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              )}

              <div className="flex items-center gap-2" aria-hidden="true">
                <span className="text-[9px] font-black tabular-nums text-white/35">
                  {Math.round(conversationProgress)}%
                </span>
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10 sm:w-32">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-[width] duration-500"
                    style={{ width: `${conversationProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getModelCharacteristics(modelKey = '') {
  const key = normalizeModelKey(modelKey)

  const characteristics = {
    catboost: [
      'Works well with organized spreadsheet-style records.',
      'Handles complex nonlinear relationships well.',
      'Often performs strongly with mixed health and environmental indicators.',
    ],
    xgboost: [
      'High-performance gradient boosting model.',
      'Good at reducing prediction error through sequential tree learning.',
      'Useful when many predictors interact with each other.',
    ],
    lightgbm: [
      'Fast forecast method for larger uploaded files.',
      'Efficient when many rows and features are available.',
      'Balances speed and predictive performance.',
    ],
    random_forest: [
      'Robust ensemble model using many decision trees.',
      'Handles noisy records and nonlinear patterns well.',
      'Stable for public health forecasting prototypes.',
    ],
    extra_trees: [
      'Tree ensemble model with additional randomization.',
      'Useful for comparing stable and randomized tree-based behavior.',
      'Often works well with organized spreadsheet-style records.',
    ],
    gradient_boosting: [
      'Sequential boosting model that improves errors step by step.',
      'Strong baseline for tabular forecasting tasks.',
      'Useful when prediction error must be minimized.',
    ],
    decision_tree: [
      'Simple and interpretable tree-based model.',
      'Useful as a transparent comparison baseline.',
      'Can be less stable than ensemble models.',
    ],
    ridge_regression: [
      'Linear model with regularization.',
      'Useful as a simple statistical baseline.',
      'Works best when relationships are mostly linear.',
    ],
  }

  return characteristics[key] || [
    'Evaluated as part of the automatic model comparison pipeline.',
    'Used to determine whether it can reduce dengue forecast error.',
  ]
}

function getModelFeatureImportance(model = {}, fallback = []) {
  const ownImportance = Array.isArray(model.feature_importance) ? model.feature_importance : []
  return ownImportance.length ? ownImportance : fallback
}

function formatDateTime(value) {
  if (!value) return 'N/A'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatSeconds(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) return 'N/A'

  return `${formatDecimal(number, 2)} sec`
}

function getMetricBarWidth(value, type = 'percent') {
  const number = Number(value)

  if (!Number.isFinite(number)) return '0%'

  if (type === 'error') {
    return `${Math.max(8, Math.min(100, 100 - number * 4))}%`
  }

  return `${Math.max(6, Math.min(100, number * 100))}%`
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function formatDecimal(value, decimals = 2) {
  const number = Number(value || 0)

  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: decimals,
  }).format(number)
}


function formatOptionalDecimal(value, decimals = 2) {
  const number = Number(value)

  if (!Number.isFinite(number)) return 'N/A'

  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: decimals,
  }).format(number)
}


function formatModelName(value = '') {
  if (!value) return 'Auto-selected model'

  return String(value)
    .replace(/^auto_selected_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatForecastStrategy(value = '') {
  const strategy = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')

  if (strategy.includes('direct') && strategy.includes('multi')) {
    return 'Direct multi-step forecasting'
  }

  if (strategy.includes('recursive')) {
    return 'Recursive multi-step forecasting'
  }

  if (strategy.includes('trend') || strategy.includes('fallback')) {
    return 'Trend-projection fallback'
  }

  return strategy ? formatModelName(strategy) : 'Forecast method unavailable'
}

function formatOptionalNumber(value, suffix = '') {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return 'Not available'
  }

  return `${formatDecimal(number)}${suffix}`
}

function formatMetricPercent(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) return 'N/A'

  return `${formatDecimal(number * 100)}%`
}

function getModelRankStyle(index = 0) {
  if (index === 0) {
    return {
      badge: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      card: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-950/20',
      icon: CheckCircle2,
      label: 'Selected',
    }
  }

  if (index === 1) {
    return {
      badge: 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
      card: 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:border-blue-500/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-slate-900',
      icon: BarChart3,
      label: 'Runner-up',
    }
  }

  if (index === 2) {
    return {
      badge: 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      card: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-slate-50 dark:border-amber-500/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-slate-900',
      icon: Gauge,
      label: 'Compared',
    }
  }

  return {
    badge: 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    card: 'border-slate-200 bg-gradient-to-br from-white to-slate-50 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900',
    icon: Activity,
    label: 'Compared',
  }
}

function getModelScoreLabel(model = {}) {
  const rmse = Number(model.rmse)
  const mae = Number(model.mae)

  if (!Number.isFinite(rmse) && !Number.isFinite(mae)) return 'No score available'

  return `RMSE ${formatDecimal(rmse)} • MAE ${formatDecimal(mae)}`
}

function normalizeFieldKey(key = '') {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function readValue(record, keys = []) {
  if (!record) return undefined

  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key]
    }
  }

  const normalizedLookup = Object.keys(record).reduce((acc, key) => {
    acc[normalizeFieldKey(key)] = record[key]
    return acc
  }, {})

  for (const key of keys) {
    const normalizedKey = normalizeFieldKey(key)

    if (
      normalizedLookup[normalizedKey] !== undefined &&
      normalizedLookup[normalizedKey] !== null &&
      normalizedLookup[normalizedKey] !== ''
    ) {
      return normalizedLookup[normalizedKey]
    }
  }

  return undefined
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return 0

  const cleaned =
    typeof value === 'string'
      ? value.replace(/,/g, '').trim()
      : value

  const number = Number(cleaned)

  return Number.isFinite(number) ? number : 0
}

function readNumber(record, keys = [], fallback = 0) {
  const value = readValue(record, keys)

  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const number = toNumber(value)
  return Number.isFinite(number) ? number : fallback
}

function readPositiveNumber(record, keys = []) {
  const number = readNumber(record, keys, 0)

  return number > 0 ? number : 0
}

function readText(record, keys = [], fallback = '') {
  const value = readValue(record, keys)

  if (value === undefined || value === null || value === '') {
    return fallback
  }

  return String(value).trim()
}

const BARANGAY_NAME_ALIASES = {
  'agusan pequenio': 'agusan pequeno',
  'agusan pequino': 'agusan pequeno',
  'baan km3': 'baan km 3',
  'baan kilometer 3': 'baan km 3',
  'brgy baan km 3': 'baan km 3',
  'datu silongan': 'silongan',
  'fort poyohon new asia': 'port poyohon',
  'fort poyohon': 'port poyohon',
  'new society village poblacion': 'new society village',
  nsv: 'new society village',
  'sto nino': 'santo nino',
  'st nino': 'santo nino',
}

function normalizeBarangayName(value = '') {
  const normalized = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bpob\.?\b/gi, ' ')
    .replace(/\bbgy\.?\b/gi, ' ')
    .replace(/\bbrgy\.?\b/gi, ' ')
    .replace(/\bbarangay\b/gi, ' ')
    .replace(/\bsto\.?\b/gi, 'santo')
    .replace(/\bst\.?\b/gi, 'santo')
    .replace(/\bkilometer\b/gi, 'km')
    .replace(/\bkm\.?(\d+)\b/gi, 'km $1')
    .replace(/\./g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  return BARANGAY_NAME_ALIASES[normalized] || normalized
}

function compactBarangayName(value = '') {
  return normalizeBarangayName(value).replace(/\s+/g, '')
}

function namesMatch(first, second) {
  const a = normalizeBarangayName(first)
  const b = normalizeBarangayName(second)
  const compactA = compactBarangayName(first)
  const compactB = compactBarangayName(second)

  if (!a || !b) return false
  if (a === b) return true
  if (compactA === compactB) return true

  if (a.length >= 4 && b.includes(a)) return true
  if (b.length >= 4 && a.includes(b)) return true

  return false
}

function getRecordPeriod(record, index) {
  const year = readText(record, ['year', 'reportingYear'])
  const week = readText(record, ['week', 'epi_week', 'epidemiologicalWeek'])

  if (year && week) {
    return `${year}-W${week}`
  }

  return (
    readText(record, [
      'reportingDate',
      'reporting_date',
      'date',
      'week',
      'epi_week',
      'period',
      'month',
      'quarter',
    ]) || `Period ${index + 1}`
  )
}

function getPeriodSortValue(period, fallbackIndex) {
  const parsedDate = Date.parse(period)

  if (Number.isFinite(parsedDate)) {
    return parsedDate
  }

  const numbers = String(period).match(/\d+/g)

  if (numbers?.length) {
    return Number(numbers.join('').slice(0, 12))
  }

  return fallbackIndex
}

function getRecordBarangay(record) {
  return (
    readText(record, [
      'barangay',
      'barangayName',
      'barangay_name',
      'brgy',
      'brgy_name',
      'location',
      'area',
      'adm4_name',
      'adm4_ref_name',
      'name',
    ]) || 'Unspecified barangay'
  )
}

function getRecordCases(record) {
  return readNumber(record, [
    'cases',
    'case_count',
    'caseCount',
    'dengue_cases',
    'dengueCases',
    'total_cases',
    'totalCases',
    'count',
    'confirmed_cases',
    'confirmedCases',
  ])
}

function average(values) {
  if (!values.length) return 0

  const total = values.reduce((sum, value) => {
    return sum + Number(value || 0)
  }, 0)

  return total / values.length
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function sum(values = []) {
  return values.reduce((total, value) => total + Number(value || 0), 0)
}

function parseCoverageDate(value) {
  if (value === undefined || value === null || value === '') return null

  const raw = String(value).trim()

  if (!raw) return null

  const weekMatch = raw.match(/^(\d{4})-?W(\d{1,2})$/i)

  if (weekMatch) {
    const year = Number(weekMatch[1])
    const week = Number(weekMatch[2])
    const date = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7))

    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = new Date(raw)

  if (Number.isNaN(parsed.getTime())) return null

  return parsed
}

function formatCoverageDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'N/A'

  return date.toISOString().slice(0, 10)
}

function getWeatherDate(record) {
  const value = readValue(record, [
    'reportingDate',
    'reporting_date',
    'date',
    'weatherDate',
    'weather_date',
    'observationDate',
    'observation_date',
  ])

  return parseCoverageDate(value)
}

function getWeatherNumber(record, keys = []) {
  return readNumber(record, keys, 0)
}

function getWeatherContextForPeriods(periods = [], weatherRecords = []) {
  const emptyContext = {
    averageRainfall: 0,
    totalRainfall: 0,
    averageTemperature: 0,
    averageHumidity: 0,
    weatherRecordCount: 0,
    weatherCoverageLabel: 'Weather data unavailable',
  }

  if (!Array.isArray(weatherRecords) || !weatherRecords.length) {
    return emptyContext
  }

  const weatherItems = weatherRecords
    .map((record, index) => ({
      record,
      index,
      date: getWeatherDate(record),
      rainfall: getWeatherNumber(record, [
        'rainfall',
        'rainfall_mm',
        'rainfallMm',
        'rain',
        'rain_mm',
        'precipitation',
        'precipitation_mm',
        'precip',
        'prectotcorr',
      ]),
      temperature: getWeatherNumber(record, [
        'temperature',
        'temperature_c',
        'temperatureC',
        'temp',
        'temp_c',
        'air_temperature',
        't2m',
      ]),
      humidity: getWeatherNumber(record, [
        'humidity',
        'relative_humidity',
        'relativeHumidity',
        'humidity_percent',
        'rh',
        'rh2m',
      ]),
    }))
    .filter((item) => item.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (!weatherItems.length) {
    return emptyContext
  }

  const periodDates = periods
    .map((period) => parseCoverageDate(period.period))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime())

  let selectedWeatherItems = []

  if (periodDates.length) {
    const start = new Date(periodDates[0].getTime())
    const end = new Date(periodDates[periodDates.length - 1].getTime())

    start.setUTCDate(start.getUTCDate() - 14)
    end.setUTCDate(end.getUTCDate() + 7)

    selectedWeatherItems = weatherItems.filter((item) => {
      return item.date.getTime() >= start.getTime() && item.date.getTime() <= end.getTime()
    })
  }

  if (!selectedWeatherItems.length) {
    selectedWeatherItems = weatherItems.slice(-30)
  }

  const rainfallValues = selectedWeatherItems.map((item) => item.rainfall)
  const temperatureValues = selectedWeatherItems
    .map((item) => item.temperature)
    .filter((value) => value !== 0)
  const humidityValues = selectedWeatherItems
    .map((item) => item.humidity)
    .filter((value) => value !== 0)

  const firstDate = selectedWeatherItems[0]?.date
  const lastDate = selectedWeatherItems[selectedWeatherItems.length - 1]?.date

  return {
    averageRainfall: Number(average(rainfallValues).toFixed(2)),
    totalRainfall: Number(sum(rainfallValues).toFixed(2)),
    averageTemperature: Number(average(temperatureValues).toFixed(2)),
    averageHumidity: Number(average(humidityValues).toFixed(2)),
    weatherRecordCount: selectedWeatherItems.length,
    weatherCoverageLabel: firstDate && lastDate
      ? `${formatCoverageDate(firstDate)} to ${formatCoverageDate(lastDate)}`
      : 'Weather data available',
  }
}

function getTrendLabel(rate) {
  if (rate >= 0.25) return 'Increasing'
  if (rate <= -0.15) return 'Decreasing'
  return 'Stable'
}

function getTrendStyle(label) {
  if (label === 'Increasing') {
    return 'bg-rose-50 text-brand-red border-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
  }

  if (label === 'Decreasing') {
    return 'bg-emerald-50 text-brand-green border-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'bg-blue-50 text-brand-blue border-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
}

function getTrendIcon(label) {
  if (label === 'Increasing') return TrendingUp
  if (label === 'Decreasing') return TrendingDown
  return Activity
}

function getRiskBadgeStyle(risk) {
  if (risk === 'High') {
    return `${riskStyles[risk]} dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300`
  }

  if (risk === 'Moderate') {
    return `${riskStyles[risk]} dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300`
  }

  if (risk === 'Low') {
    return `${riskStyles[risk]} dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300`
  }

  return 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function getPriorityBadgeStyle(priority) {
  const value = String(priority || '').toLowerCase()

  if (value.includes('immediate') || value.includes('high priority')) {
    return 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
  }

  if (value.includes('escalated') || value.includes('preventive')) {
    return 'border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  if (value.includes('monitoring') || value.includes('early')) {
    return 'border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
  }

  if (value.includes('routine')) {
    return 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}


function getBarangayCardStyle(risk = '') {
  const value = String(risk || '').trim().toLowerCase()

  if (value === 'high') {
    return {
      surface: 'border-rose-300/70 bg-gradient-to-br from-rose-50 via-white to-orange-50 dark:border-rose-400/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-950/20',
      accent: 'from-rose-500 via-pink-500 to-orange-400',
      glow: 'bg-rose-400/20',
      rank: 'border-rose-200 bg-rose-600 text-white shadow-[0_12px_28px_rgba(225,29,72,0.28)] dark:border-rose-400/30 dark:bg-rose-500',
      metric: 'border-rose-100 bg-white/90 dark:border-rose-400/10 dark:bg-slate-950/80',
      action: 'border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50 dark:border-rose-400/20 dark:from-rose-500/10 dark:to-orange-500/10',
    }
  }

  if (value === 'moderate') {
    return {
      surface: 'border-amber-300/70 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-950/20',
      accent: 'from-amber-500 via-orange-400 to-yellow-300',
      glow: 'bg-amber-400/20',
      rank: 'border-amber-200 bg-amber-500 text-slate-950 shadow-[0_12px_28px_rgba(245,158,11,0.24)] dark:border-amber-300/30 dark:bg-amber-400',
      metric: 'border-amber-100 bg-white/90 dark:border-amber-400/10 dark:bg-slate-950/80',
      action: 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-400/20 dark:from-amber-500/10 dark:to-orange-500/10',
    }
  }

  return {
    surface: 'border-emerald-300/60 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-950/20',
    accent: 'from-emerald-500 via-teal-400 to-cyan-400',
    glow: 'bg-emerald-400/20',
    rank: 'border-emerald-200 bg-emerald-600 text-white shadow-[0_12px_28px_rgba(5,150,105,0.22)] dark:border-emerald-400/30 dark:bg-emerald-500',
    metric: 'border-emerald-100 bg-white/90 dark:border-emerald-400/10 dark:bg-slate-950/80',
    action: 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:to-cyan-500/10',
  }
}

function getRiskPriorityValue(risk = '') {
  const value = String(risk || '').trim().toLowerCase()

  if (value === 'high') return 3
  if (value === 'moderate') return 2
  if (value === 'low') return 1

  return 0
}

function getResponsePriorityValue(priority = '') {
  const value = String(priority || '').trim().toLowerCase()

  if (value.includes('immediate') || value.includes('high priority')) return 4
  if (value.includes('escalated') || value.includes('preventive')) return 3
  if (value.includes('monitoring') || value.includes('early')) return 2
  if (value.includes('routine')) return 1

  return 0
}

function getRowRiskScore(row = {}) {
  return getCanonicalCombinedRiskScore(row)
}

function getRiskComponentItems(row = {}) {
  const components = row?.riskComponents || row?.risk_components || {}
  const hasBackendBreakdown = [
    'risk_level_component',
    'forecast_volume_component',
    'trend_component',
    'rainfall_component',
    'temperature_component',
    'humidity_component',
    'population_component',
    'density_component',
  ].some((key) => Object.prototype.hasOwnProperty.call(components, key))

  if (hasBackendBreakdown) {
    return [
      ['Risk level', readNumber(components, ['risk_level_component'], 0)],
      ['Forecast volume', readNumber(components, ['forecast_volume_component'], 0)],
      ['Recent trend', readNumber(components, ['trend_component'], 0)],
      ['Rainfall', readNumber(components, ['rainfall_component'], 0)],
      ['Temperature', readNumber(components, ['temperature_component'], 0)],
      ['Humidity', readNumber(components, ['humidity_component'], 0)],
      ['Population', readNumber(components, ['population_component'], 0)],
      ['Crowding', readNumber(components, ['density_component'], 0)],
    ]
  }

  const nextPeriodValue = readNumber(
    row,
    ['forecastNextPeriod', 'forecast_next_period'],
    0
  )
  const currentCaseLabel = nextPeriodValue > 0
    ? 'Next-period forecast'
    : 'Current cases'
  const currentCaseValue = nextPeriodValue > 0
    ? nextPeriodValue
    : readNumber(components, ['currentCases', 'current_cases'], 0)

  return [
    ['Expected cases', readNumber(components, ['forecast'], 0)],
    [currentCaseLabel, currentCaseValue],
    ['Recent change', readNumber(components, ['trend'], 0)],
    ['Weather', readNumber(components, ['environment'], 0)],
    ['Population', readNumber(components, ['population'], 0)],
    ['Crowding', readNumber(components, ['density'], 0)],
  ]
}

function compareBarangayRisk(a = {}, b = {}) {
  return compareCanonicalBarangayPriority(a, b)
}

function compareBarangayPriority(a = {}, b = {}) {
  return compareCanonicalBarangayPriority(a, b)
}

function getBoundaryGeoJson(boundaryRecords = []) {
  if (!boundaryRecords) return null

  if (
    boundaryRecords.type === 'FeatureCollection' &&
    Array.isArray(boundaryRecords.features)
  ) {
    return boundaryRecords
  }

  if (Array.isArray(boundaryRecords)) {
    const featureCollection = boundaryRecords.find((item) => {
      return item?.type === 'FeatureCollection' && Array.isArray(item.features)
    })

    if (featureCollection) {
      return featureCollection
    }

    const features = boundaryRecords.filter((item) => {
      return item?.type === 'Feature' && item.geometry
    })

    if (features.length > 0) {
      return {
        type: 'FeatureCollection',
        features,
      }
    }
  }

  return null
}

function getFeatureName(feature) {
  const props = feature?.properties || {}

  return (
    props.adm4_name ||
    props.adm4_ref_name ||
    props.name ||
    props.barangay ||
    props.barangay_name ||
    props.BARANGAY ||
    props.ADM4_EN ||
    ''
  )
}

function getFeatureReferenceName(feature) {
  const props = feature?.properties || {}

  return (
    props.adm4_ref_name ||
    props.adm4_name ||
    props.name ||
    props.barangay ||
    props.barangay_name ||
    ''
  )
}

function getBoundaryFeatureForBarangay(barangay, boundaryRecords = []) {
  const boundaryGeoJson = getBoundaryGeoJson(boundaryRecords)

  if (!boundaryGeoJson?.features?.length) return null

  return (
    boundaryGeoJson.features.find((feature) => {
      return (
        namesMatch(barangay, getFeatureName(feature)) ||
        namesMatch(barangay, getFeatureReferenceName(feature))
      )
    }) || null
  )
}

function getRecordName(record) {
  return (
    readText(record, [
      'barangay',
      'barangayName',
      'barangay_name',
      'brgy',
      'brgy_name',
      'name',
      'adm4_name',
      'adm4_ref_name',
      'location',
    ]) || ''
  )
}

function getPopulationRecordForBarangay(barangay, populationRecords = []) {
  if (!Array.isArray(populationRecords) || !populationRecords.length) {
    return null
  }

  return (
    populationRecords.find((record) => {
      return namesMatch(getRecordName(record), barangay)
    }) || null
  )
}

function getPopulationValue(barangay, populationRecords = [], boundaryFeature = null) {
  const populationRecord = getPopulationRecordForBarangay(
    barangay,
    populationRecords
  )

  const props = boundaryFeature?.properties || {}

  return (
    readPositiveNumber(populationRecord, [
      'population',
      'totalPopulation',
      'populationCount',
      'population_count',
      'pop',
      'total_pop',
      'totalPop',
      'residents',
      'householdPopulation',
    ]) ||
    readPositiveNumber(props, [
      'population',
      'totalPopulation',
      'populationCount',
      'population_count',
      'pop',
      'total_pop',
      'totalPop',
      'POPULATION',
    ])
  )
}

function getAreaValue(boundaryFeature = null) {
  const props = boundaryFeature?.properties || {}

  return readPositiveNumber(props, [
    'area_sqkm',
    'areaSqKm',
    'area',
    'areaKm2',
    'area_km2',
    'sqkm',
  ])
}

function groupDengueRecords(records = []) {
  const periodMap = new Map()
  const barangayMap = new Map()

  records.forEach((record, index) => {
    const barangay = getRecordBarangay(record)
    const period = getRecordPeriod(record, index)
    const periodSortValue = getPeriodSortValue(period, index)
    const cases = getRecordCases(record)

    if (!periodMap.has(period)) {
      periodMap.set(period, {
        period,
        index,
        sortValue: periodSortValue,
        totalCases: 0,
      })
    }

    const periodItem = periodMap.get(period)
    periodItem.totalCases += cases

    const barangayKey = normalizeBarangayName(barangay)

    if (!barangayMap.has(barangayKey)) {
      barangayMap.set(barangayKey, {
        barangay,
        totalCases: 0,
        periodCases: new Map(),
      })
    }

    const barangayItem = barangayMap.get(barangayKey)
    barangayItem.totalCases += cases
    barangayItem.periodCases.set(
      period,
      toNumber(barangayItem.periodCases.get(period)) + cases
    )
  })

  const periods = Array.from(periodMap.values()).sort((a, b) => {
    if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue
    return a.index - b.index
  })

  const barangays = Array.from(barangayMap.values())

  return {
    periods,
    barangays,
  }
}

function buildDynamicForecastRows(
  records = [],
  multiplier = 1,
  populationRecords = [],
  boundaryRecords = [],
  weatherRecords = []
) {
  const { periods, barangays } = groupDengueRecords(records)

  if (!records.length || !periods.length || !barangays.length) {
    return {
      forecastRows: [],
      weeklyTotals: [],
      projectedWeeklyValues: [],
      computedPeriods: [],
    }
  }

  const weeklyTotals = periods.map((period) => period.totalCases)
  const weatherContext = getWeatherContextForPeriods(periods, weatherRecords)

  const forecastRows = barangays.map((barangayItem) => {
    const boundaryFeature = getBoundaryFeatureForBarangay(
      barangayItem.barangay,
      boundaryRecords
    )

    const caseSeries = periods.map((period) => {
      return toNumber(barangayItem.periodCases.get(period.period))
    })

    const series = periods.map((period) => {
      return {
        period: period.period,
        cases: toNumber(barangayItem.periodCases.get(period.period)),
      }
    })

    const recentValues = caseSeries.slice(-3)
    const previousValues = caseSeries.slice(-6, -3)

    const recentAverage = average(recentValues)
    const previousAverage = average(previousValues)

    let trendRate = 0

    if (previousAverage > 0) {
      trendRate = (recentAverage - previousAverage) / previousAverage
    } else if (recentAverage > 0) {
      trendRate = 0.15
    }

    const cappedTrendRate = clamp(trendRate, -0.5, 0.75)

    const forecastPeriodPredictions = Array.from({ length: 4 }).map((_, index) => {
      const horizon = index + 1
      return {
        horizon,
        period: `Forecast period ${horizon}`,
        predictedCases: Math.max(
          0,
          Math.round(recentAverage * multiplier * Math.pow(1 + cappedTrendRate, horizon))
        ),
      }
    })

    const projectedFourWeekCases = forecastPeriodPredictions.reduce(
      (sum, item) => sum + item.predictedCases,
      0
    )

    const trendLabel = getTrendLabel(cappedTrendRate)

    const firstValue = caseSeries[0] || 0
    const lastValue = caseSeries[caseSeries.length - 1] || 0

    const population = getPopulationValue(
      barangayItem.barangay,
      populationRecords,
      boundaryFeature
    )

    const area = getAreaValue(boundaryFeature)
    const density = population > 0 && area > 0 ? population / area : 0

    const previousCases =
      caseSeries.length >= 2 ? caseSeries[caseSeries.length - 2] : 0

    const currentCases =
      caseSeries.length >= 1 ? caseSeries[caseSeries.length - 1] : 0

    const multiSourceRisk = computeMultiSourceRisk({
      forecast: projectedFourWeekCases,
      currentCases,
      forecastNextPeriod: Number(forecastPeriodPredictions[0]?.predictedCases || 0),
      forecast_next_period: Number(forecastPeriodPredictions[0]?.predictedCases || 0),
      previousCases,
      totalCases: barangayItem.totalCases,
      trend: trendLabel,
      trendRate: cappedTrendRate,
      recentAverage,
      previousAverage,
      history: caseSeries,
      weeklyCases: caseSeries,
      population,
      areaSqKm: area,
      density,
      averageRainfall: weatherContext.averageRainfall,
      totalRainfall: weatherContext.totalRainfall,
      averageTemperature: weatherContext.averageTemperature,
      averageHumidity: weatherContext.averageHumidity,
    })

    const risk = multiSourceRisk.risk
    const riskScore = multiSourceRisk.score

    const rowData = {
      barangay: barangayItem.barangay,
      totalCases: barangayItem.totalCases,
      cases: barangayItem.totalCases,
      currentCases,
      previousCases,
      recentAverage: Number(recentAverage.toFixed(2)),
      previousAverage: Number(previousAverage.toFixed(2)),
      trendRate: cappedTrendRate,
      trendPercent: Math.round(cappedTrendRate * 100),
      trend: trendLabel,
      trendLabel,
      firstValue,
      lastValue,
      forecast: projectedFourWeekCases,
      forecastedCases: projectedFourWeekCases,
      predictedCases: projectedFourWeekCases,
      risk,
      history: caseSeries,
      weeklyCases: caseSeries,
      caseHistory: series,
      series,
      periods: periods.map((period) => period.period),
      forecastPeriodPredictions,
      forecastStrategy: 'trend_projection_fallback',
      population,
      area_sqkm: area,
      areaSqKm: area,
      density,
      averageRainfall: weatherContext.averageRainfall,
      avgRainfall: weatherContext.averageRainfall,
      totalRainfall: weatherContext.totalRainfall,
      averageTemperature: weatherContext.averageTemperature,
      avgTemperature: weatherContext.averageTemperature,
      averageHumidity: weatherContext.averageHumidity,
      avgHumidity: weatherContext.averageHumidity,
      weatherRecordCount: weatherContext.weatherRecordCount,
      weatherCoverageLabel: weatherContext.weatherCoverageLabel,
      riskScore,
      multiSourceRiskScore: riskScore,
      riskComponents: multiSourceRisk.components,
      environmentalSuitability: multiSourceRisk.environmentalSuitability.label,
      environmentalScore: multiSourceRisk.environmentalSuitability.score,
      rainfallPressure: multiSourceRisk.environmentalSuitability.rainfallPressure.label,
      temperatureSuitability: multiSourceRisk.environmentalSuitability.temperatureSuitability.label,
      humiditySuitability: multiSourceRisk.environmentalSuitability.humiditySuitability.label,
    }

    const decisionSupport = computeDecisionSupport(rowData)

    return {
      ...rowData,
      decisionSupport,
      recommendedAction: decisionSupport.summary,
      primaryAction: decisionSupport.primaryAction,
      recommendedActions: decisionSupport.actions,
      recommendationRationale: decisionSupport.rationale,
      responsePriority: decisionSupport.priority,
      decisionScore: decisionSupport.score,
      trendDirection: decisionSupport.trendDirection,
      densityLevel: decisionSupport.densityLevel,
      populationExposure: decisionSupport.populationExposure,
      forecastPressure: decisionSupport.forecastPressure,
      environmentalSuitability: decisionSupport.environmentalSuitability,
      environmentalScore: decisionSupport.environmentalScore,
      rainfallPressure: decisionSupport.rainfallPressure,
      temperatureSuitability: decisionSupport.temperatureSuitability,
      humiditySuitability: decisionSupport.humiditySuitability,
      multiSourceRiskScore: decisionSupport.multiSourceRiskScore,
      riskScore: decisionSupport.riskScore,
      riskComponents: decisionSupport.riskComponents,
    }
  })

  const totalRecentAverage = average(weeklyTotals.slice(-3))
  const totalPreviousAverage = average(weeklyTotals.slice(-6, -3))

  let totalTrendRate = 0

  if (totalPreviousAverage > 0) {
    totalTrendRate = (totalRecentAverage - totalPreviousAverage) / totalPreviousAverage
  } else if (totalRecentAverage > 0) {
    totalTrendRate = 0.15
  }

  const cappedTotalTrendRate = clamp(totalTrendRate, -0.5, 0.75)

  const projectedWeeklyValues = Array.from({ length: 6 }).map((_, index) => {
    const growthFactor = 1 + cappedTotalTrendRate * ((index + 1) / 6)
    return Math.max(0, Math.round(totalRecentAverage * multiplier * growthFactor))
  })

  return {
    forecastRows: forecastRows.sort(compareBarangayPriority),
    weeklyTotals,
    projectedWeeklyValues,
    computedPeriods: periods,
  }
}

function hasBackendForecastData(backendForecastResult) {
  return Array.isArray(backendForecastResult?.forecast_results) &&
    backendForecastResult.forecast_results.length > 0
}

function getTrendRateFromLabel(label = '') {
  if (label === 'Increasing') return 0.25
  if (label === 'Decreasing') return -0.15
  return 0
}

function buildBackendForecastRows(
  backendForecastResult = null,
  multiplier = 1,
  populationRecords = [],
  boundaryRecords = [],
  weatherRecords = []
) {
  const backendRows = backendForecastResult?.forecast_results || []

  if (!backendRows.length) {
    return {
      forecastRows: [],
      weeklyTotals: [],
      projectedWeeklyValues: [],
      computedPeriods: [],
    }
  }

  const backendPeriods = backendRows.map((backendRow, index) => ({
    period: readText(backendRow, ['latest_period'], `Forecast period ${index + 1}`),
    index,
    sortValue: index,
  }))

  const weatherContext = getWeatherContextForPeriods(backendPeriods, weatherRecords)

  const forecastRows = backendRows.map((backendRow) => {
    const baseForecast = readNumber(backendRow, ['forecast_next_4_periods'], 0)
    const adjustedBaseForecast = Math.max(0, Math.round(baseForecast * multiplier))
    const barangay = readText(backendRow, ['barangay'], 'Unspecified barangay')
    const trendLabel = readText(backendRow, ['trend_direction'], 'Stable')
    const trendRate = getTrendRateFromLabel(trendLabel)
    const savedForecastNextPeriod = Math.max(
      0,
      Math.round(readNumber(backendRow, ['forecast_next_period'], 0) * multiplier)
    )
    const recentAverage = readNumber(backendRow, ['recent_average_cases'], 0)
    const previousAverage = readNumber(backendRow, ['previous_average_cases'], 0)
    const historicalTotalCases = readNumber(backendRow, ['historical_total_cases'], 0)
    const latestPeriod = readText(backendRow, ['latest_period'], 'Latest period')
    const rawPeriodPredictions = readValue(backendRow, [
      'forecast_period_predictions',
      'forecastPeriodPredictions',
    ])
    const forecastPeriodPredictions = Array.isArray(rawPeriodPredictions)
      ? rawPeriodPredictions
          .map((item, index) => ({
            horizon: Number(item?.horizon || index + 1),
            period: String(item?.period || `Forecast period ${index + 1}`),
            predictedCases: Math.max(
              0,
              Math.round(Number(item?.predicted_cases ?? item?.predictedCases ?? 0) * multiplier)
            ),
          }))
          .filter((item) => Number.isFinite(item.predictedCases))
      : []

    // When direct multi-step outputs are available, they are the source of truth.
    // This keeps the displayed cumulative total, risk classification, and the four
    // horizon cards mathematically consistent after scenario adjustments.
    const forecastNextPeriod = forecastPeriodPredictions.length
      ? Number(forecastPeriodPredictions[0]?.predictedCases || 0)
      : savedForecastNextPeriod
    const adjustedForecast = forecastPeriodPredictions.length
      ? forecastPeriodPredictions.reduce(
          (total, item) => total + Number(item.predictedCases || 0),
          0
        )
      : adjustedBaseForecast

    const caseSeries = [
      previousAverage,
      recentAverage,
      forecastNextPeriod,
    ].filter((value) => Number.isFinite(Number(value)))

    const series = [
      {
        period: 'Previous average',
        cases: previousAverage,
      },
      {
        period: 'Recent average',
        cases: recentAverage,
      },
      ...(forecastPeriodPredictions.length
        ? forecastPeriodPredictions.map((item) => ({
            period: item.period,
            cases: item.predictedCases,
            horizon: item.horizon,
            isForecast: true,
          }))
        : [
            {
              period: 'Forecast next period',
              cases: forecastNextPeriod,
              horizon: 1,
              isForecast: true,
            },
          ]),
    ]

    const boundaryFeature = getBoundaryFeatureForBarangay(barangay, boundaryRecords)
    const boundaryPopulation = getPopulationValue(
      barangay,
      populationRecords,
      boundaryFeature
    )
    const area = getAreaValue(boundaryFeature)
    const population =
      readPositiveNumber(backendRow, [
        'population',
        'total_population',
        'totalPopulation',
        'population_count',
        'populationCount',
      ]) || boundaryPopulation
    const density =
      readPositiveNumber(backendRow, [
        'density',
        'population_density',
        'populationDensity',
      ]) ||
      (population > 0 && area > 0 ? population / area : 0)
    const averageRainfall =
      readNumber(backendRow, [
        'average_rainfall',
        'averageRainfall',
        'avg_rainfall',
        'avgRainfall',
      ], 0) || weatherContext.averageRainfall
    const averageTemperature =
      readNumber(backendRow, [
        'average_temperature',
        'averageTemperature',
        'avg_temperature',
        'avgTemperature',
      ], 0) || weatherContext.averageTemperature
    const averageHumidity =
      readNumber(backendRow, [
        'average_humidity',
        'averageHumidity',
        'avg_humidity',
        'avgHumidity',
      ], 0) || weatherContext.averageHumidity

    const multiSourceRisk = computeMultiSourceRisk({
      forecast: adjustedForecast,
      currentCases: forecastNextPeriod,
      forecastNextPeriod,
      forecast_next_period: forecastNextPeriod,
      previousCases: previousAverage,
      totalCases: historicalTotalCases,
      trend: trendLabel,
      trendRate,
      recentAverage,
      previousAverage,
      history: caseSeries,
      weeklyCases: caseSeries,
      population,
      areaSqKm: area,
      density,
      averageRainfall,
      totalRainfall: weatherContext.totalRainfall,
      averageTemperature,
      averageHumidity,
    })

    const isBaselineScenario = Math.abs(Number(multiplier || 1) - 1) < 0.0001
    const savedMapRisk = readText(backendRow, ['risk_level', 'risk'], '')
    const risk = isBaselineScenario
      ? savedMapRisk || multiSourceRisk.risk || computeRiskLevel(adjustedForecast)
      : multiSourceRisk.risk || computeRiskLevel(adjustedForecast)
    const baseRiskScore = readNumber(
      backendRow,
      ['risk_score'],
      adjustedForecast
    )
    const savedCombinedRiskScore = readNumber(
      backendRow,
      [
        'combined_risk_score',
        'multi_source_risk_score',
        'combinedRiskScore',
        'multiSourceRiskScore',
        'overall_risk_score',
        'overallRiskScore',
      ],
      multiSourceRisk.score || baseRiskScore
    )
    const combinedRiskScore = isBaselineScenario
      ? savedCombinedRiskScore
      : multiSourceRisk.score
    const savedRiskComponents = readValue(
      backendRow,
      ['risk_components', 'riskComponents']
    )
    const backendRiskComponents = isBaselineScenario
      ? savedRiskComponents || multiSourceRisk.components
      : multiSourceRisk.components
    const environmentalScore = readNumber(
      backendRow,
      ['environmental_score', 'environmentalScore'],
      multiSourceRisk.environmentalSuitability.score
    )
    const environmentalSuitability = readText(
      backendRow,
      ['environmental_suitability', 'environmentalSuitability'],
      multiSourceRisk.environmentalSuitability.label
    )
    const rainfallPressure = readText(
      backendRow,
      ['rainfall_pressure', 'rainfallPressure'],
      multiSourceRisk.environmentalSuitability.rainfallPressure.label
    )
    const temperatureSuitability = readText(
      backendRow,
      ['temperature_suitability', 'temperatureSuitability'],
      multiSourceRisk.environmentalSuitability.temperatureSuitability.label
    )
    const humiditySuitability = readText(
      backendRow,
      ['humidity_suitability', 'humiditySuitability'],
      multiSourceRisk.environmentalSuitability.humiditySuitability.label
    )
    const populationExposure = readText(
      backendRow,
      ['population_exposure', 'populationExposure'],
      ''
    )
    const densityLevel = readText(
      backendRow,
      ['density_level', 'densityLevel'],
      ''
    )

    const rowData = {
      barangay,
      totalCases: historicalTotalCases,
      cases: historicalTotalCases,
      currentCases: forecastNextPeriod,
      previousCases: previousAverage,
      recentAverage: Number(recentAverage.toFixed(2)),
      previousAverage: Number(previousAverage.toFixed(2)),
      trendRate,
      trendPercent: Math.round(trendRate * 100),
      trend: trendLabel,
      trendLabel,
      firstValue: caseSeries[0] || 0,
      lastValue: caseSeries[caseSeries.length - 1] || 0,
      forecast: adjustedForecast,
      forecastedCases: adjustedForecast,
      predictedCases: adjustedForecast,
      risk,
      history: caseSeries,
      weeklyCases: caseSeries,
      caseHistory: series,
      series,
      periods: forecastPeriodPredictions.length
        ? forecastPeriodPredictions.map((item) => item.period)
        : [latestPeriod],
      forecastPeriodPredictions,
      forecastStrategy: readText(
        backendRow,
        ['forecast_strategy', 'forecastStrategy'],
        forecastPeriodPredictions.length ? 'direct_multi_step' : ''
      ),
      population,
      area_sqkm: area,
      areaSqKm: area,
      density,
      averageRainfall,
      avgRainfall: averageRainfall,
      totalRainfall: weatherContext.totalRainfall,
      averageTemperature,
      avgTemperature: averageTemperature,
      averageHumidity,
      avgHumidity: averageHumidity,
      weatherRecordCount: weatherContext.weatherRecordCount,
      weatherCoverageLabel: weatherContext.weatherCoverageLabel,
      riskScore: combinedRiskScore,
      risk_score: baseRiskScore,
      baseRiskScore,
      combinedRiskScore,
      combined_risk_score: combinedRiskScore,
      multiSourceRiskScore: combinedRiskScore,
      multi_source_risk_score: combinedRiskScore,
      overallRiskScore: combinedRiskScore,
      overall_risk_score: combinedRiskScore,
      riskComponents: backendRiskComponents,
      risk_components: backendRiskComponents,
      environmentalSuitability,
      environmentalScore,
      rainfallPressure,
      temperatureSuitability,
      humiditySuitability,
      populationExposure,
      densityLevel,
      backendPriorityRank: readNumber(backendRow, ['priority_rank'], 0),
      backendRecommendation: readText(backendRow, ['recommendation'], ''),
      backendRiskLevel: risk,
    }

    const decisionSupportBase = computeDecisionSupport(rowData)
    const backendRecommendation = rowData.backendRecommendation || decisionSupportBase.summary

    const decisionSupport = {
      ...decisionSupportBase,
      summary: backendRecommendation,
      risk,
      riskScore: combinedRiskScore,
      multiSourceRiskScore: combinedRiskScore,
      riskComponents: backendRiskComponents,
      environmentalSuitability,
      environmentalScore,
      rainfallPressure,
      temperatureSuitability,
      humiditySuitability,
      populationExposure:
        populationExposure || decisionSupportBase.populationExposure,
      densityLevel: densityLevel || decisionSupportBase.densityLevel,
    }

    return {
      ...rowData,
      decisionSupport,
      recommendedAction: backendRecommendation,
      primaryAction: decisionSupport.primaryAction,
      recommendedActions: decisionSupport.actions,
      recommendationRationale: decisionSupport.rationale,
      responsePriority: decisionSupport.priority,
      decisionScore: decisionSupport.score,
      trendDirection: decisionSupport.trendDirection,
      densityLevel: decisionSupport.densityLevel,
      populationExposure: decisionSupport.populationExposure,
      forecastPressure: decisionSupport.forecastPressure,
      environmentalSuitability: decisionSupport.environmentalSuitability,
      environmentalScore: decisionSupport.environmentalScore,
      rainfallPressure: decisionSupport.rainfallPressure,
      temperatureSuitability: decisionSupport.temperatureSuitability,
      humiditySuitability: decisionSupport.humiditySuitability,
      multiSourceRiskScore: combinedRiskScore,
      combinedRiskScore,
      overallRiskScore: combinedRiskScore,
      riskScore: combinedRiskScore,
      baseRiskScore,
      risk_score: baseRiskScore,
      riskComponents: backendRiskComponents,
      risk_components: backendRiskComponents,
    }
  })

  const sortedForecastRows = forecastRows.sort(compareBarangayPriority)

  const directHorizonCount = Math.max(
    0,
    ...sortedForecastRows.map((row) =>
      Array.isArray(row.forecastPeriodPredictions)
        ? row.forecastPeriodPredictions.length
        : 0
    )
  )
  const horizonCount = directHorizonCount || 4

  const projectedWeeklyValues = Array.from({ length: horizonCount }).map((_, index) => {
    const horizonTotal = sortedForecastRows.reduce((sum, row) => {
      const prediction = Array.isArray(row.forecastPeriodPredictions)
        ? row.forecastPeriodPredictions[index]
        : null

      return sum + Number(prediction?.predictedCases || 0)
    }, 0)

    if (directHorizonCount > 0) {
      return Math.max(0, Math.round(horizonTotal))
    }

    return Math.max(
      0,
      Math.round(
        sortedForecastRows.reduce((sum, row) => {
          const fallbackValue = Number(row.forecast || 0) / horizonCount
          return sum + fallbackValue
        }, 0)
      )
    )
  })

  const referencePredictions = sortedForecastRows.find(
    (row) => Array.isArray(row.forecastPeriodPredictions) && row.forecastPeriodPredictions.length
  )?.forecastPeriodPredictions || []

  const computedPeriods = Array.from({ length: horizonCount }).map((_, index) => ({
    period: referencePredictions[index]?.period || `Forecast period ${index + 1}`,
    index,
    sortValue: index,
    totalCases: projectedWeeklyValues[index] || 0,
  }))

  return {
    forecastRows: sortedForecastRows,
    weeklyTotals: projectedWeeklyValues,
    projectedWeeklyValues,
    computedPeriods,
  }
}

function getRiskDistribution(rows) {
  const total = rows.length || 1

  const counts = {
    High: rows.filter((row) => row.risk === 'High').length,
    Moderate: rows.filter((row) => row.risk === 'Moderate').length,
    Low: rows.filter((row) => row.risk === 'Low').length,
  }

  return [
    {
      label: 'High risk',
      level: 'High',
      count: counts.High,
      width: `${Math.round((counts.High / total) * 100)}%`,
      bar: 'bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400',
      badge: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300',
      surface: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50 dark:border-rose-400/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-950/20',
      glow: 'bg-rose-400/20',
      accent: 'from-rose-500 via-pink-500 to-orange-400',
      icon: ShieldAlert,
    },
    {
      label: 'Moderate risk',
      level: 'Moderate',
      count: counts.Moderate,
      width: `${Math.round((counts.Moderate / total) * 100)}%`,
      bar: 'bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-300',
      badge: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300',
      surface: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-950/20',
      glow: 'bg-amber-400/20',
      accent: 'from-amber-500 via-orange-400 to-yellow-300',
      icon: AlertTriangle,
    },
    {
      label: 'Low risk',
      level: 'Low',
      count: counts.Low,
      width: `${Math.round((counts.Low / total) * 100)}%`,
      bar: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400',
      badge: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      surface: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-950/20',
      glow: 'bg-emerald-400/20',
      accent: 'from-emerald-500 via-teal-400 to-cyan-400',
      icon: CheckCircle2,
    },
  ]
}

function getPriorityDistribution(rows) {
  const priorityMap = new Map()

  rows.forEach((row) => {
    const priority =
      row.responsePriority ||
      row.decisionSupport?.priority ||
      'Pending Dataset'

    priorityMap.set(priority, toNumber(priorityMap.get(priority)) + 1)
  })

  return Array.from(priorityMap.entries())
    .map(([priority, count]) => ({
      priority,
      count,
    }))
    .sort((a, b) => b.count - a.count)
}

function getComputationStatus(records, sourceStatus, backendForecastResult = null) {
  if (hasBackendForecastData(backendForecastResult)) {
    const processedRecordCount = Number(
  backendForecastResult.valid_row_count || records.length || 0
)

const highRiskCount = Number(backendForecastResult?.risk_counts?.High || 0)
const moderateRiskCount = Number(backendForecastResult?.risk_counts?.Moderate || 0)
const lowRiskCount = Number(backendForecastResult?.risk_counts?.Low || 0)

return {
  title: 'Forecast ready',
  message: `${formatNumber(processedRecordCount)} dengue record${processedRecordCount === 1 ? '' : 's'} were analyzed. The system identified ${formatNumber(highRiskCount)} high-risk barangay${highRiskCount === 1 ? '' : 's'}, ${formatNumber(moderateRiskCount)} moderate-risk barangay${moderateRiskCount === 1 ? '' : 's'}, and ${formatNumber(lowRiskCount)} low-risk barangay${lowRiskCount === 1 ? '' : 's'}. Review the priority barangays and recommended actions below.`,
  style: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  icon: CheckCircle2,
}
  }

  if (!records.length) {
    return {
      title: 'No dengue records available',
      message: 'Upload dengue case records first before generating a forecast.',
      style: 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      icon: AlertTriangle,
    }
  }

  return {
    title: 'Forecast ready',
    message: `${formatNumber(records.length)} dengue record${records.length === 1 ? '' : 's'} loaded from ${sourceStatus?.dengue?.uploadedName || 'current dataset'}. The system prepared the forecast, checked recent changes, weather, population, and barangay size, then ranked the barangays by priority.`,
    style: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    icon: CheckCircle2,
  }
}

function PremiumPanel({ id, children, className = '', allowOverflow = false }) {
  return (
    <section
      id={id}
      className={`group/panel relative scroll-mt-28 ${allowOverflow ? 'overflow-visible' : 'overflow-hidden'} rounded-[30px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/80 shadow-[0_20px_58px_rgba(15,23,42,0.08)] ring-1 ring-white/90 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200/80 hover:shadow-[0_28px_72px_rgba(15,23,42,0.13)] dark:border-white/10 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/90 dark:ring-white/5 ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-7 top-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl transition-transform duration-500 group-hover/panel:scale-125 dark:bg-sky-400/10" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-indigo-400/5 blur-3xl dark:bg-indigo-400/10" />
      <div className="pointer-events-none absolute right-5 top-5 h-16 w-16 rounded-full border border-slate-200/60 opacity-50 dark:border-white/10" />
      <div className="pointer-events-none absolute right-9 top-9 h-8 w-8 rounded-full border border-slate-200/60 opacity-50 dark:border-white/10" />
      <div className="relative z-10">{children}</div>
    </section>
  )
}

function SearchableSelect({
  label,
  value,
  options = [],
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search options',
  emptyMessage = 'No matching options found.',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef(null)

  const normalizedOptions = useMemo(() => {
    return options.map((option) => {
      if (typeof option === 'string' || typeof option === 'number') {
        return {
          value: String(option),
          label: String(option),
          helper: '',
          searchText: String(option),
        }
      }

      const optionValue = String(option?.value ?? '')
      const optionLabel = String(option?.label ?? optionValue)
      const optionHelper = String(option?.helper ?? '')

      return {
        ...option,
        value: optionValue,
        label: optionLabel,
        helper: optionHelper,
        searchText: String(
          option?.searchText || `${optionLabel} ${optionHelper} ${optionValue}`
        ),
      }
    })
  }, [options])

  const selectedOption = normalizedOptions.find((option) => {
    return option.value === String(value ?? '')
  })

  const filteredOptions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    if (!normalizedQuery) return normalizedOptions

    return normalizedOptions.filter((option) => {
      return option.searchText.toLowerCase().includes(normalizedQuery)
    })
  }, [normalizedOptions, searchQuery])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
          {label}
        </span>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`group flex min-h-[50px] w-full items-center justify-between gap-3 rounded-[18px] border bg-white px-4 py-3 text-left shadow-[0_8px_22px_rgba(15,23,42,0.045)] outline-none transition dark:bg-slate-950/90 ${
          isOpen
            ? 'border-brand-blue ring-2 ring-blue-100 dark:border-blue-400 dark:ring-blue-500/20'
            : 'border-slate-200 hover:border-brand-blue/40 hover:shadow-md dark:border-slate-700 dark:hover:border-blue-400/50'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-brand-text dark:text-slate-100">
            {selectedOption?.label || placeholder}
          </span>

          {selectedOption?.helper && (
            <span className="mt-0.5 block truncate text-[11px] font-semibold text-brand-muted dark:text-slate-500">
              {selectedOption.helper}
            </span>
          )}
        </span>

        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition ${
          isOpen
            ? 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
            : 'border-slate-200 bg-slate-50 text-brand-muted group-hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
        }`}>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {isOpen && (
        <div className="forecast-searchable-menu absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[80] overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.20)] ring-1 ring-white/80 backdrop-blur-xl dark:border-slate-700/90 dark:bg-slate-950/95 dark:ring-white/5">
          <div className="border-b border-slate-200 bg-slate-50/90 p-3 dark:border-slate-800 dark:bg-slate-900/90">
            <label className="relative block">
              <span className="sr-only">{searchPlaceholder}</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted dark:text-slate-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredOptions.length === 1) {
                    onChange(filteredOptions[0].value)
                    setIsOpen(false)
                  }
                }}
                autoFocus
                placeholder={searchPlaceholder}
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-brand-text outline-none transition placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/20"
              />
            </label>
          </div>

          <div
            role="listbox"
            className="forecast-custom-scrollbar max-h-64 overflow-y-auto overscroll-contain p-2"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === String(value ?? '')

                return (
                  <button
                    type="button"
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value)
                      setIsOpen(false)
                    }}
                    className={`mb-1 flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition last:mb-0 ${
                      isSelected
                        ? 'border-blue-100 bg-blue-50 text-brand-blue shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
                        : 'border-transparent text-brand-text hover:border-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">
                        {option.label}
                      </span>

                      {option.helper && (
                        <span className={`mt-0.5 block truncate text-[11px] font-semibold ${
                          isSelected
                            ? 'text-brand-blue/75 dark:text-blue-300/75'
                            : 'text-brand-muted dark:text-slate-500'
                        }`}>
                          {option.helper}
                        </span>
                      )}
                    </span>

                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                )
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SectionBadge({ icon: Icon, children, tone = 'blue' }) {
  const toneMap = {
    blue: 'border-sky-200/80 bg-sky-50/80 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300',
    rose: 'border-rose-200/80 bg-rose-50/80 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300',
    emerald: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300',
    amber: 'border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300',
    slate: 'border-slate-200/90 bg-slate-50/90 text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300',
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.19em] shadow-sm ${toneMap[tone] || toneMap.blue}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
      {children}
    </div>
  )
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'blue',
  onClick = null,
  actionLabel = 'View barangay list',
  ariaLabel = '',
}) {
  const toneMap = {
    blue: {
      iconWrap: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300',
      glow: 'bg-sky-400/20',
      accent: 'from-sky-500 via-cyan-400 to-blue-500',
      surface: 'from-sky-50/80 via-white to-blue-50/70 dark:from-sky-500/10 dark:via-slate-950 dark:to-blue-950/20',
      signal: 'bg-sky-500',
    },
    rose: {
      iconWrap: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300',
      glow: 'bg-rose-400/20',
      accent: 'from-rose-500 via-pink-500 to-orange-400',
      surface: 'from-rose-50/80 via-white to-orange-50/70 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-950/20',
      signal: 'bg-rose-500',
    },
    emerald: {
      iconWrap: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300',
      glow: 'bg-emerald-400/20',
      accent: 'from-emerald-500 via-teal-400 to-cyan-400',
      surface: 'from-emerald-50/80 via-white to-cyan-50/70 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-950/20',
      signal: 'bg-emerald-500',
    },
    amber: {
      iconWrap: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300',
      glow: 'bg-amber-400/20',
      accent: 'from-amber-500 via-orange-400 to-rose-400',
      surface: 'from-amber-50/80 via-white to-orange-50/70 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-950/20',
      signal: 'bg-amber-500',
    },
  }

  const style = toneMap[tone] || toneMap.blue
  const isInteractive = typeof onClick === 'function'
  const cardClassName = `group relative min-h-[168px] w-full overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br ${style.surface} p-5 text-left shadow-[0_16px_42px_rgba(15,23,42,0.075)] ring-1 ring-white/90 transition-all duration-300 hover:-translate-y-1.5 hover:border-slate-300 hover:shadow-[0_28px_64px_rgba(15,23,42,0.15)] dark:border-white/10 dark:ring-white/5 ${isInteractive ? 'cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-sky-300/35 dark:focus-visible:ring-sky-400/30' : ''}`

  const cardContent = (
    <>
      <div className={`pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full ${style.glow} blur-3xl transition-transform duration-500 group-hover:scale-125`} />
      <div className={`absolute inset-y-6 left-0 w-1 rounded-r-full bg-gradient-to-b ${style.accent}`} />
      <div className="pointer-events-none absolute right-4 top-4 h-20 w-20 rounded-full border border-white/80 shadow-inner dark:border-white/10" />
      <div className="pointer-events-none absolute right-8 top-8 h-12 w-12 rounded-full border border-white/80 dark:border-white/10" />

      <div className="relative flex h-full flex-col justify-between gap-5 pl-1">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.19em] text-slate-500 dark:text-slate-400">
              {label}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${style.signal} shadow-[0_0_12px_currentColor]`} />
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                Live forecast signal
              </span>
            </div>
          </div>

          <div className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-[0_10px_24px_rgba(15,23,42,0.10)] ${style.iconWrap}`}>
            <Icon className="h-5 w-5" strokeWidth={2.3} />
          </div>
        </div>

        <div>
          <h3 className="break-words text-[1.85rem] font-black leading-none tracking-[-0.045em] text-slate-950 dark:text-white">
            {value}
          </h3>
          <p className="mt-2 max-w-[92%] text-sm leading-5 text-slate-500 dark:text-slate-400">
            {helper}
          </p>

          {isInteractive && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">
              <span>{actionLabel}</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          )}

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-white/10">
            <div className={`h-full w-2/3 rounded-full bg-gradient-to-r ${style.accent} opacity-80 transition-all duration-500 group-hover:w-full`} />
          </div>
        </div>
      </div>
    </>
  )

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cardClassName}
        aria-label={ariaLabel || `${label}: ${value}. ${actionLabel}`}
      >
        {cardContent}
      </button>
    )
  }

  return <div className={cardClassName}>{cardContent}</div>
}

function SummaryBarangayListModal({
  open,
  title,
  description,
  rows = [],
  tone = 'blue',
  emptyMessage = 'No barangays match this summary.',
  onClose,
  onSelectBarangay,
}) {
  const [searchQuery, setSearchQuery] = useState('')

  const toneMap = {
    blue: {
      badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300',
      icon: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300',
      accent: 'from-sky-500 via-cyan-400 to-blue-500',
      glow: 'bg-sky-400/20',
    },
    rose: {
      badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300',
      icon: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300',
      accent: 'from-rose-500 via-pink-500 to-orange-400',
      glow: 'bg-rose-400/20',
    },
    amber: {
      badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300',
      icon: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300',
      accent: 'from-amber-500 via-orange-400 to-rose-400',
      glow: 'bg-amber-400/20',
    },
    emerald: {
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300',
      icon: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300',
      accent: 'from-emerald-500 via-teal-400 to-cyan-400',
      glow: 'bg-emerald-400/20',
    },
  }

  const style = toneMap[tone] || toneMap.blue

  const filteredRows = useMemo(() => {
    const query = normalizeBarangayName(searchQuery)

    if (!query) return rows

    return rows.filter((row) => {
      const searchableText = normalizeBarangayName(
        `${row.barangay || ''} ${row.risk || ''} ${row.responsePriority || ''} ${row.trendLabel || ''}`
      )

      return searchableText.includes(query)
    })
  }, [rows, searchQuery])

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forecast-summary-list-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.()
        }
      }}
    >
      <div className="relative flex max-h-[min(88vh,860px)] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_36px_110px_rgba(2,6,23,0.48)] ring-1 ring-slate-200/70 dark:border-slate-700/90 dark:bg-slate-950 dark:ring-white/10 sm:rounded-[36px]">
        <div className={`pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full ${style.glow} blur-3xl`} />
        <div className="pointer-events-none absolute -bottom-24 left-8 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className={`pointer-events-none absolute inset-x-10 top-0 h-[2px] bg-gradient-to-r from-transparent ${style.accent} to-transparent`} />

        <div className="relative border-b border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-sky-50/70 px-5 py-5 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-sky-950/20 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border shadow-sm ${style.icon}`}>
                <MapPin className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${style.badge}`}>
                    Barangay list
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {formatNumber(rows.length)} total
                  </span>
                </div>

                <h2 id="forecast-summary-list-title" className="mt-3 text-2xl font-black tracking-[-0.035em] text-slate-950 dark:text-white sm:text-3xl">
                  {title}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500/30 dark:hover:text-rose-300"
              aria-label="Close barangay list"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <label className="relative mt-5 block">
            <span className="sr-only">Search barangay in this list</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search barangay, risk, priority, or trend"
              autoFocus
              className="w-full rounded-[18px] border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/15"
            />
          </label>
        </div>

        <div className="forecast-custom-scrollbar relative flex-1 overflow-y-auto p-3 sm:p-5">
          {filteredRows.length > 0 ? (
            <div className="space-y-3">
              {filteredRows.map((row, index) => (
                <button
                  key={`${row.barangay}-${index}`}
                  type="button"
                  onClick={() => onSelectBarangay?.(row)}
                  className="group/summary-row relative w-full overflow-hidden rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50 p-4 text-left shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_40px_rgba(14,165,233,0.12)] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/60 dark:border-white/10 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:hover:border-sky-400/30 dark:focus-visible:ring-sky-500/20"
                >
                  <div className={`pointer-events-none absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b ${style.accent}`} />
                  <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-slate-200 bg-slate-950 text-sm font-black text-white shadow-sm dark:border-white/10 dark:bg-white dark:text-slate-950">
                        #{index + 1}
                      </span>

                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-slate-950 dark:text-white">
                          {row.barangay}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {formatNumber(row.forecast || 0)} projected cases · {formatNumber(getRowRiskScore(row))}/100 risk score
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${getRiskBadgeStyle(row.risk)}`}>
                        {row.risk || 'Pending'}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${getPriorityBadgeStyle(row.responsePriority)}`}>
                        {row.responsePriority || 'Pending priority'}
                      </span>
                    </div>
                  </div>

                  <div className="relative mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
                      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">Trend</p>
                      <p className="mt-1 text-xs font-black text-slate-800 dark:text-slate-200">{row.trendLabel || 'Stable'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
                      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">Historical total</p>
                      <p className="mt-1 text-xs font-black text-slate-800 dark:text-slate-200">{formatNumber(row.totalCases || 0)} cases</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
                      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">Priority points</p>
                      <p className="mt-1 text-xs font-black text-slate-800 dark:text-slate-200">{formatNumber(row.decisionScore || 0)} points</p>
                    </div>
                  </div>

                  <div className="relative mt-3 flex items-center justify-end gap-1.5 text-xs font-black text-sky-700 dark:text-sky-300">
                    Open in priority list
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/summary-row:translate-x-0.5 group-hover/summary-row:-translate-y-0.5" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 px-5 text-center dark:border-slate-700 dark:bg-slate-900/70">
              <div>
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="mt-3 text-base font-black text-slate-900 dark:text-white">
                  {searchQuery ? 'No matching barangay found' : 'No barangays in this category'}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {searchQuery ? 'Try a different barangay name or keyword.' : emptyMessage}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="relative border-t border-slate-200/80 bg-slate-50/90 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400 sm:px-6">
          Select a barangay to close this list and open its detailed priority card below.
        </div>
      </div>
    </div>
  )
}

function HeroMetric({ label, value, helper, icon: Icon = Activity }) {
  return (
    <div className="group relative overflow-hidden rounded-[22px] border border-white/20 bg-slate-950/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_16px_34px_rgba(0,0,0,0.18)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-slate-950/55">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-300/10 blur-2xl transition-transform duration-500 group-hover:scale-125" />
      <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b from-cyan-300 via-sky-400 to-blue-500" />
      <div className="relative flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.19em] text-white/60">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tracking-[-0.045em] text-white">
            {value}
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-white/20 bg-white/10 text-cyan-200 shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
          <Icon className="h-4 w-4" strokeWidth={2.35} />
        </div>
      </div>
      <p className="relative mt-2 pl-1 text-[11px] leading-4 text-white/70">
        {helper}
      </p>
    </div>
  )
}


function createSmoothTrendPath(points = []) {
  if (!points.length) return ''

  if (points.length === 1) {
    const point = points[0]
    return `M ${point.x} ${point.y}`
  }

  return points.reduce((path, point, index, list) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`
    }

    const previous = list[index - 1]
    const previousPrevious = list[index - 2] || previous
    const next = list[index + 1] || point
    const controlPointOneX = previous.x + (point.x - previousPrevious.x) / 6
    const controlPointOneY = previous.y + (point.y - previousPrevious.y) / 6
    const controlPointTwoX = point.x - (next.x - previous.x) / 6
    const controlPointTwoY = point.y - (next.y - previous.y) / 6

    return `${path} C ${controlPointOneX} ${controlPointOneY}, ${controlPointTwoX} ${controlPointTwoY}, ${point.x} ${point.y}`
  }, '')
}

function getNiceChartMaximum(value) {
  const maximum = Math.max(0, Number(value || 0))

  if (maximum <= 10) return 10
  if (maximum <= 50) return Math.ceil(maximum / 10) * 10
  if (maximum <= 100) return Math.ceil(maximum / 20) * 20
  if (maximum <= 500) return Math.ceil(maximum / 50) * 50

  const magnitude = 10 ** Math.floor(Math.log10(maximum))
  return Math.ceil(maximum / magnitude) * magnitude
}

function ForecastThreeDTrendChart({
  values = [],
  labels = [],
  title = 'Projected dengue case trend',
  subtitle = 'Projected dengue case values for the selected planning scenario',
}) {
  const chart = useMemo(() => {
    const numericValues = values.map((value) => Math.max(0, toNumber(value)))
    const width = 1000
    const height = 620
    const left = 92
    const right = 934
    const top = 190
    const baseline = 445
    const maximum = getNiceChartMaximum(Math.max(...numericValues, 0))
    const count = numericValues.length
    const step = count > 1 ? (right - left) / (count - 1) : 0

    const points = numericValues.map((value, index) => ({
      x: count === 1 ? (left + right) / 2 : left + step * index,
      y: baseline - (value / maximum) * (baseline - top),
      value,
      label: labels[index] || `P${index + 1}`,
    }))

    const linePath = createSmoothTrendPath(points)
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
      : ''

    const ticks = Array.from({ length: 5 }, (_, index) => {
      const value = maximum - (maximum / 4) * index

      return {
        value,
        y: top + ((baseline - top) / 4) * index,
      }
    })

    return {
      width,
      height,
      left,
      right,
      top,
      baseline,
      points,
      linePath,
      areaPath,
      ticks,
    }
  }, [values, labels])

  if (!chart.points.length) return null

  return (
    <div className="h-full w-full overflow-x-auto overscroll-x-contain rounded-[24px]">
      <div className="h-full min-w-[720px]">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label={`${title}. ${chart.points
            .map((point) => `${point.label}: ${formatNumber(point.value)} cases`)
            .join(', ')}`}
          className="h-full w-full select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <title>{title}</title>
          <desc>{subtitle}</desc>

          <defs>
            <linearGradient id="forecast-trend-card-background" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#020617" />
              <stop offset="45%" stopColor="#071827" />
              <stop offset="100%" stopColor="#03111f" />
            </linearGradient>

            <linearGradient id="forecast-trend-line-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="55%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>

            <linearGradient id="forecast-trend-area-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.46" />
              <stop offset="55%" stopColor="#0ea5e9" stopOpacity="0.56" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.68" />
            </linearGradient>

            <linearGradient id="forecast-trend-depth-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
              <stop offset="55%" stopColor="#0369a1" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="forecast-trend-floor-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
              <stop offset="45%" stopColor="#0f2c42" stopOpacity="0.94" />
              <stop offset="100%" stopColor="#020617" stopOpacity="1" />
            </linearGradient>

            <linearGradient id="forecast-trend-floor-edge-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.78" />
              <stop offset="50%" stopColor="#f8fafc" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.96" />
            </linearGradient>

            <radialGradient id="forecast-trend-spotlight" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>

            <pattern id="forecast-trend-surface-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 0 24 L 24 0" stroke="#ffffff" strokeOpacity="0.035" strokeWidth="1" />
              <path d="M -6 18 L 6 6 M 18 30 L 30 18" stroke="#38bdf8" strokeOpacity="0.035" strokeWidth="1" />
            </pattern>

            <filter id="forecast-trend-soft-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="forecast-trend-strong-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="13" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1.2 0"
                result="glow"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="forecast-trend-platform-shadow" x="-20%" y="-50%" width="140%" height="220%">
              <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#000000" floodOpacity="0.65" />
            </filter>

            <clipPath id="forecast-trend-area-clip">
              <path d={chart.areaPath} />
            </clipPath>
          </defs>

          <rect
            x="2"
            y="2"
            width={chart.width - 4}
            height={chart.height - 4}
            rx="34"
            fill="url(#forecast-trend-card-background)"
            stroke="#0ea5e9"
            strokeOpacity="0.18"
          />

          <ellipse
            cx="760"
            cy="250"
            rx="300"
            ry="220"
            fill="url(#forecast-trend-spotlight)"
          />

          <text
            x="36"
            y="56"
            fill="#f8fafc"
            fontSize="24"
            fontWeight="800"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            {title}
          </text>

          <text
            x="36"
            y="82"
            fill="#94a3b8"
            fontSize="13"
            fontWeight="600"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            {subtitle}
          </text>

          <text
            x="38"
            y={chart.top - 42}
            fill="#94a3b8"
            fontSize="13"
            fontWeight="700"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            Cases
          </text>

          <g opacity="0.5">
            {chart.ticks.map((tick) => (
              <line
                key={`forecast-grid-${tick.value}`}
                x1={chart.left}
                y1={tick.y}
                x2={chart.right}
                y2={tick.y}
                stroke="#7dd3fc"
                strokeOpacity="0.18"
                strokeDasharray="6 9"
              />
            ))}
          </g>

          {chart.ticks.map((tick) => (
            <text
              key={`forecast-tick-${tick.value}`}
              x={chart.left - 24}
              y={tick.y + 5}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="12"
              fontWeight="700"
              fontFamily="Inter, ui-sans-serif, system-ui"
            >
              {formatNumber(Math.round(tick.value))}
            </text>
          ))}

          <g filter="url(#forecast-trend-platform-shadow)">
            <path
              d={`M 52 ${chart.baseline} L 948 ${chart.baseline} L 982 ${chart.baseline + 44} L 22 ${chart.baseline + 44} Z`}
              fill="url(#forecast-trend-floor-gradient)"
              stroke="#38bdf8"
              strokeOpacity="0.25"
            />
            <path
              d={`M 22 ${chart.baseline + 44} L 982 ${chart.baseline + 44} L 966 ${chart.baseline + 70} L 40 ${chart.baseline + 70} Z`}
              fill="#020617"
              stroke="#0ea5e9"
              strokeOpacity="0.26"
            />
            <line
              x1="52"
              y1={chart.baseline}
              x2="948"
              y2={chart.baseline}
              stroke="url(#forecast-trend-floor-edge-gradient)"
              strokeWidth="3"
              filter="url(#forecast-trend-soft-glow)"
            />
          </g>

          <g opacity="0.2">
            {Array.from({ length: 14 }, (_, index) => {
              const x = 70 + index * 66

              return (
                <line
                  key={`forecast-floor-grid-${index}`}
                  x1={x}
                  y1={chart.baseline}
                  x2={x - 28}
                  y2={chart.baseline + 44}
                  stroke="#7dd3fc"
                  strokeOpacity="0.45"
                />
              )
            })}

            {[14, 28, 42].map((offset) => {
              const y = chart.baseline + offset

              return (
                <line
                  key={`forecast-floor-line-${offset}`}
                  x1={40 - offset * 0.5}
                  y1={y}
                  x2={960 + offset * 0.5}
                  y2={y}
                  stroke="#7dd3fc"
                  strokeOpacity="0.36"
                />
              )
            })}
          </g>

          <path
            d={chart.areaPath}
            transform="translate(0 16)"
            fill="url(#forecast-trend-depth-gradient)"
            opacity="0.52"
            filter="url(#forecast-trend-soft-glow)"
          />

          <path
            d={chart.areaPath}
            fill="url(#forecast-trend-area-gradient)"
            stroke="url(#forecast-trend-line-gradient)"
            strokeWidth="2"
            opacity="0.94"
          />

          <rect
            x={chart.left}
            y={chart.top}
            width={chart.right - chart.left}
            height={chart.baseline - chart.top}
            fill="url(#forecast-trend-surface-pattern)"
            clipPath="url(#forecast-trend-area-clip)"
          />

          <path
            d={chart.linePath}
            fill="none"
            stroke="url(#forecast-trend-line-gradient)"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.2"
            filter="url(#forecast-trend-strong-glow)"
          />

          <path
            d={chart.linePath}
            fill="none"
            stroke="url(#forecast-trend-line-gradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#forecast-trend-soft-glow)"
          />

          {chart.points.map((point, index) => (
            <g key={`${point.label}-${index}`}>
              <title>{`${point.label}: ${formatNumber(point.value)} cases`}</title>

              <line
                x1={point.x}
                y1={point.y + 10}
                x2={point.x}
                y2={chart.baseline}
                stroke="#22d3ee"
                strokeOpacity="0.58"
                strokeWidth="1.5"
                strokeDasharray="4 6"
              />

              <ellipse
                cx={point.x}
                cy={chart.baseline + 4}
                rx="17"
                ry="5"
                fill="#38bdf8"
                fillOpacity="0.16"
                filter="url(#forecast-trend-soft-glow)"
              />

              <circle
                cx={point.x}
                cy={point.y}
                r="15"
                fill="#38bdf8"
                fillOpacity="0.22"
                filter="url(#forecast-trend-strong-glow)"
              />

              <circle
                cx={point.x}
                cy={point.y}
                r="7"
                fill="#f8fafc"
                stroke="#22d3ee"
                strokeWidth="4"
              />

              <text
                x={point.x}
                y={Math.max(118, point.y - 21)}
                textAnchor="middle"
                fill="#67e8f9"
                fontSize="18"
                fontWeight="900"
                fontFamily="Inter, ui-sans-serif, system-ui"
                style={{ filter: 'drop-shadow(0 0 8px #38bdf8)' }}
              >
                {formatNumber(point.value)}
              </text>

              <text
                x={point.x}
                y={chart.baseline + 112}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="13"
                fontWeight="700"
                fontFamily="Inter, ui-sans-serif, system-ui"
              >
                {point.label}
              </text>
            </g>
          ))}

          <g transform={`translate(350 ${chart.baseline + 150})`}>
            <rect
              x="0"
              y="-14"
              width="22"
              height="14"
              rx="4"
              fill="url(#forecast-trend-line-gradient)"
            />
            <rect
              x="0"
              y="-14"
              width="22"
              height="14"
              rx="4"
              fill="none"
              stroke="#bae6fd"
              strokeOpacity="0.5"
            />
            <text
              x="34"
              y="-2"
              fill="#e2e8f0"
              fontSize="14"
              fontWeight="800"
              fontFamily="Inter, ui-sans-serif, system-ui"
            >
              Projected dengue cases
            </text>
          </g>
        </svg>
      </div>
    </div>
  )
}


function getModelTypeBadges(modelKey = '') {
  const key = normalizeModelKey(modelKey)

  if (['catboost', 'xgboost', 'lightgbm', 'gradient_boosting'].includes(key)) {
    return ['Boosting', 'Tree ensemble', 'Supervised ML']
  }

  if (['random_forest', 'extra_trees'].includes(key)) {
    return ['Tree ensemble', 'Bagging', 'Robust baseline']
  }

  if (key === 'decision_tree') {
    return ['Tree-based', 'Interpretable', 'Baseline']
  }

  if (key === 'ridge_regression') {
    return ['Linear model', 'Regularized', 'Baseline']
  }

  return ['AI model', 'Compared', 'Forecasting']
}

function getModelCardAccent(index = 0, isSelected = false) {
  if (isSelected || index === 0) {
    return {
      card: 'legendary-model-card legendary-model-card-rank-1 border-emerald-300/80 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 ring-1 ring-emerald-300/60 dark:border-emerald-300/40 dark:from-emerald-500/15 dark:via-slate-950 dark:to-cyan-950/30 dark:ring-emerald-300/20',
      rankBadge: 'border-yellow-300/80 bg-slate-950 text-yellow-300 shadow-[0_0_28px_rgba(250,204,21,0.78),inset_0_0_18px_rgba(250,204,21,0.18)] ring-2 ring-yellow-300/45 dark:border-yellow-300/80 dark:bg-slate-950 dark:text-yellow-300 dark:ring-yellow-300/45',
      bar: 'from-emerald-400 via-cyan-300 to-sky-400',
    }
  }

  if (index === 1) {
    return {
      card: 'legendary-model-card legendary-model-card-rank-2 border-sky-300/80 bg-gradient-to-br from-sky-50 via-white to-indigo-50 ring-1 ring-sky-300/50 dark:border-sky-300/35 dark:from-sky-500/15 dark:via-slate-950 dark:to-indigo-950/30 dark:ring-sky-300/20',
      rankBadge: 'border-slate-300/90 bg-slate-950 text-slate-100 shadow-[0_0_28px_rgba(226,232,240,0.62),inset_0_0_18px_rgba(226,232,240,0.16)] ring-2 ring-slate-200/45 dark:border-slate-300/90 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-200/45',
      bar: 'from-sky-400 via-cyan-300 to-indigo-400',
    }
  }

  if (index === 2) {
    return {
      card: 'legendary-model-card legendary-model-card-rank-3 border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 ring-1 ring-amber-300/55 dark:border-amber-300/40 dark:from-amber-500/15 dark:via-slate-950 dark:to-orange-950/30 dark:ring-amber-300/20',
      rankBadge: 'border-orange-400/90 bg-slate-950 text-orange-400 shadow-[0_0_28px_rgba(180,83,9,0.72),inset_0_0_18px_rgba(180,83,9,0.18)] ring-2 ring-orange-500/40 dark:border-orange-400/90 dark:bg-slate-950 dark:text-orange-400 dark:ring-orange-500/40',
      bar: 'from-orange-400 via-amber-300 to-yellow-300',
    }
  }

  return {
    card: 'border-slate-200 bg-gradient-to-br from-white via-slate-50 to-white dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950',
    rankBadge: 'border-slate-200 bg-white text-brand-text dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
    bar: 'from-brand-blue to-cyan-400',
  }
}

function getFeatureIcon(feature = '') {
  const value = String(feature).toLowerCase()

  if (value.includes('rain')) return CloudRain
  if (value.includes('temp')) return Thermometer
  if (value.includes('humid')) return Droplets
  if (value.includes('pop')) return Users
  if (value.includes('month') || value.includes('period') || value.includes('week')) return CalendarDays
  if (value.includes('case') || value.includes('moving') || value.includes('rolling')) return TrendingUp

  return Sparkles
}

function getModelBoardOrder(index = 0, totalModels = 0) {
  const total = Number(totalModels) || 0
  const splitPoint = Math.ceil(total / 2)

  if (splitPoint <= 0) return index

  return index < splitPoint
    ? index * 2
    : (index - splitPoint) * 2 + 1
}


export default function ForecastPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('baseline')
  const [showAllTopBarangays, setShowAllTopBarangays] = useState(false)
  const [expandedBarangay, setExpandedBarangay] = useState(null)
  const [expandedModelKey, setExpandedModelKey] = useState(null)
  const [showAiSection, setShowAiSection] = useState(false)
  const [showRiskDetails, setShowRiskDetails] = useState(false)
  const [showDataDetails, setShowDataDetails] = useState(false)
  const [showForecastCalculationDetails, setShowForecastCalculationDetails] = useState(false)
  const [showScenarioDetails, setShowScenarioDetails] = useState(false)
  const [barangaySearch, setBarangaySearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('All')
  const [trendFilter, setTrendFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [sortOption, setSortOption] = useState('priority')
  const [selectedResponseBarangay, setSelectedResponseBarangay] = useState('')
  const [selectedRiskExplanationBarangay, setSelectedRiskExplanationBarangay] = useState('')
  const [summaryListType, setSummaryListType] = useState(null)

  const {
    dengueRecords = [],
    populationRecords = [],
    boundaryRecords = [],
    weatherRecords = [],
    sourceStatus,
    backendForecastResult = null,
  } = useData()

  const selectedMode = modeMeta[mode]
  const usingBackendForecast = hasBackendForecastData(backendForecastResult)
  const forecastPeriodDisplay = getForecastPeriodDisplay(backendForecastResult)
  const forecastHorizonPeriods = Number(
    backendForecastResult?.forecast_horizon_periods ||
      backendForecastResult?.validation_summary?.forecast_horizon_periods ||
      4
  )
  const forecastHorizonLabel = `Next ${forecastHorizonPeriods} ${
    forecastHorizonPeriods === 1
      ? forecastPeriodDisplay.singular
      : forecastPeriodDisplay.plural
  }`
  const forecastHorizonHelper = `Expected cases in ${forecastHorizonLabel.toLowerCase()}`
  const projectedHorizonHelper = `Projected cases for ${forecastHorizonLabel.toLowerCase()}`
  const [latestModelMetrics, setLatestModelMetrics] = useState(null)
  const [showModelDetails, setShowModelDetails] = useState(false)

  const selectedModelName = formatModelName(
    backendForecastResult?.model_display_name ||
      backendForecastResult?.model_name ||
      backendForecastResult?.forecast_run?.model_name ||
      backendForecastResult?.forecastRun?.model_name ||
      ''
  )

  const selectedModelVersion =
    backendForecastResult?.model_version ||
    backendForecastResult?.forecast_run?.model_version ||
    backendForecastResult?.forecastRun?.model_version ||
    'v1'

  const isMachineLearningForecast = Boolean(
    backendForecastResult?.is_machine_learning ||
      backendForecastResult?.forecast_run?.is_machine_learning ||
      backendForecastResult?.forecastRun?.is_machine_learning
  )

  const {
    forecastRows,
    weeklyTotals,
    projectedWeeklyValues,
    computedPeriods,
  } = useMemo(() => {
    if (hasBackendForecastData(backendForecastResult)) {
      return buildBackendForecastRows(
        backendForecastResult,
        selectedMode.multiplier,
        populationRecords,
        boundaryRecords,
        weatherRecords
      )
    }

    return buildDynamicForecastRows(
      dengueRecords,
      selectedMode.multiplier,
      populationRecords,
      boundaryRecords,
      weatherRecords
    )
  }, [
    backendForecastResult,
    dengueRecords,
    selectedMode,
    populationRecords,
    boundaryRecords,
    weatherRecords,
  ])

  const forecastChartLabels = projectedWeeklyValues.map((_, index) => {
    return `${forecastPeriodDisplay.prefix}${index + 1}`
  })

  const filteredForecastRows = useMemo(() => {
    const searchValue = normalizeBarangayName(barangaySearch)

    const rows = forecastRows.filter((row) => {
      const matchesSearch = !searchValue || normalizeBarangayName(row.barangay).includes(searchValue)
      const matchesRisk = riskFilter === 'All' || row.risk === riskFilter
      const matchesTrend = trendFilter === 'All' || row.trendLabel === trendFilter
      const priorityText = String(row.responsePriority || row.decisionSupport?.priority || '')
        .toLowerCase()
      const matchesPriority =
        priorityFilter === 'All' ||
        (priorityFilter === 'Immediate' &&
          (priorityText.includes('immediate') || priorityText.includes('high priority'))) ||
        (priorityFilter === 'Preventive' &&
          (priorityText.includes('preventive') || priorityText.includes('escalated'))) ||
        (priorityFilter === 'Monitoring' &&
          (priorityText.includes('monitoring') || priorityText.includes('early'))) ||
        (priorityFilter === 'Routine' && priorityText.includes('routine'))

      return matchesSearch && matchesRisk && matchesTrend && matchesPriority
    })

    return [...rows].sort((a, b) => {
      if (sortOption === 'forecast') {
        const forecastDifference = Number(b.forecast || 0) - Number(a.forecast || 0)

        if (forecastDifference !== 0) return forecastDifference

        return compareBarangayPriority(a, b)
      }

      if (sortOption === 'risk') {
        return compareBarangayRisk(a, b)
      }

      if (sortOption === 'barangay') {
        return String(a.barangay || '').localeCompare(String(b.barangay || ''))
      }

      return compareBarangayPriority(a, b)
    })
  }, [
    forecastRows,
    barangaySearch,
    riskFilter,
    trendFilter,
    priorityFilter,
    sortOption,
  ])

  const topBarangays = filteredForecastRows
  const visibleTopBarangays = showAllTopBarangays
    ? topBarangays
    : topBarangays.slice(0, 5)

  const riskDistribution = getRiskDistribution(forecastRows)
  const priorityDistribution = getPriorityDistribution(forecastRows)
  const highRiskCount = riskDistribution.find((item) => item.level === 'High')?.count || 0
  const moderateRiskCount = riskDistribution.find((item) => item.level === 'Moderate')?.count || 0
  const attentionRiskCount = highRiskCount + moderateRiskCount

  const projectedTotal = forecastRows.reduce((sum, row) => {
    return sum + Number(row.forecast || 0)
  }, 0)

  const actualTotal = usingBackendForecast
    ? Number(backendForecastResult?.forecast_results?.reduce((sum, row) => {
        return sum + Number(row.historical_total_cases || 0)
      }, 0) || 0)
    : dengueRecords.reduce((sum, record) => {
        return sum + getRecordCases(record)
      }, 0)

  const loadedRecordCount = usingBackendForecast
    ? Number(backendForecastResult?.valid_row_count || 0)
    : dengueRecords.length

  const latestSourceTotal = weeklyTotals.length
    ? weeklyTotals[weeklyTotals.length - 1]
    : 0
  const finalForecastPeriodTotal = projectedWeeklyValues.length
    ? projectedWeeklyValues[projectedWeeklyValues.length - 1]
    : 0
  const periodSummaryLabel = usingBackendForecast
    ? `Final forecast ${forecastPeriodDisplay.singular} total`
    : 'Latest case total'
  const periodSummaryValue = usingBackendForecast
    ? finalForecastPeriodTotal
    : latestSourceTotal
  const periodSummaryHelper = usingBackendForecast
    ? `${forecastPeriodDisplay.prefix}${Math.max(projectedWeeklyValues.length, 1)} citywide projected cases`
    : 'Most recent source period'

  const highestRiskBarangay = useMemo(() => {
    return forecastRows.length
      ? [...forecastRows].sort(compareBarangayPriority)[0]
      : null
  }, [forecastRows])
  const selectedResponseRow =
    forecastRows.find((row) => row.barangay === selectedResponseBarangay) ||
    highestRiskBarangay
  const responseDecisionSupport = selectedResponseRow?.decisionSupport || null
  const selectedResponsePeriodPredictions = Array.isArray(
    selectedResponseRow?.forecastPeriodPredictions
  )
    ? selectedResponseRow.forecastPeriodPredictions
    : []
  const selectedResponsePredictionTotal = selectedResponsePeriodPredictions.reduce(
    (total, item) => total + Number(item?.predictedCases || 0),
    0
  )
  const selectedResponseForecastTotal = Number(selectedResponseRow?.forecast || 0)
  const selectedResponseTotalsMatch =
    selectedResponsePeriodPredictions.length > 0 &&
    Math.abs(selectedResponsePredictionTotal - selectedResponseForecastTotal) < 0.5
  const selectedResponseForecastStrategy = formatForecastStrategy(
    selectedResponseRow?.forecastStrategy
  )
  const selectedResponseUsesDirectMultiStep =
    selectedResponsePeriodPredictions.length >= forecastHorizonPeriods ||
    selectedResponseForecastStrategy === 'Direct multi-step forecasting'
  const topRiskScore = getRowRiskScore(highestRiskBarangay)
  const topWeatherCoverage = highestRiskBarangay?.weatherCoverageLabel || 'Weather data unavailable'
  const topWeatherRecordCount = Number(highestRiskBarangay?.weatherRecordCount || 0)

  const selectedRiskExplanationRow =
    forecastRows.find((row) => row.barangay === selectedRiskExplanationBarangay) ||
    highestRiskBarangay

  const riskExplanationScore = getRowRiskScore(selectedRiskExplanationRow)
  const riskExplanationEnvironmentalSuitability =
    selectedRiskExplanationRow?.environmentalSuitability ||
    'Weather data unavailable'
  const riskExplanationRainfallPressure =
    selectedRiskExplanationRow?.rainfallPressure ||
    'Rainfall unavailable'
  const riskExplanationTemperatureSuitability =
    selectedRiskExplanationRow?.temperatureSuitability ||
    'Temperature unavailable'
  const riskExplanationHumiditySuitability =
    selectedRiskExplanationRow?.humiditySuitability ||
    'Humidity unavailable'
  const riskExplanationWeatherCoverage =
    selectedRiskExplanationRow?.weatherCoverageLabel ||
    'Weather data unavailable'
  const riskExplanationAverageRainfall = Number(
    selectedRiskExplanationRow?.averageRainfall ||
      selectedRiskExplanationRow?.avgRainfall ||
      0
  )
  const riskExplanationAverageTemperature = Number(
    selectedRiskExplanationRow?.averageTemperature ||
      selectedRiskExplanationRow?.avgTemperature ||
      0
  )
  const riskExplanationAverageHumidity = Number(
    selectedRiskExplanationRow?.averageHumidity ||
      selectedRiskExplanationRow?.avgHumidity ||
      0
  )
  const riskExplanationWeatherRecordCount = Number(
    selectedRiskExplanationRow?.weatherRecordCount || 0
  )
  const riskExplanationComponentItems = getRiskComponentItems(
    selectedRiskExplanationRow
  )

  const riskExplanationOptions = useMemo(() => {
    return [...forecastRows]
      .sort(compareBarangayPriority)
      .map((row, index) => ({
        value: row.barangay,
        label: row.barangay,
        helper: `#${index + 1} priority · ${formatNumber(getRowRiskScore(row))}/100 · ${row.risk || 'Pending'} risk`,
        searchText: `${row.barangay} ${row.risk || ''} ${row.responsePriority || ''} ${getRowRiskScore(row)} ${index + 1}`,
      }))
  }, [forecastRows])

  useEffect(() => {
    if (!selectedRiskExplanationBarangay) return

    const selectedBarangayStillExists = forecastRows.some((row) => {
      return row.barangay === selectedRiskExplanationBarangay
    })

    if (!selectedBarangayStillExists) {
      setSelectedRiskExplanationBarangay('')
    }
  }, [forecastRows, selectedRiskExplanationBarangay])

  const computationStatus = getComputationStatus(
    dengueRecords,
    sourceStatus,
    backendForecastResult
  )
  const StatusIcon = computationStatus.icon

  const immediatePriorityCount = forecastRows.filter((row) => {
    const priority = String(row.responsePriority || '').toLowerCase()
    return (
      priority.includes('immediate') ||
      priority.includes('high priority') ||
      priority.includes('escalated')
    )
  }).length

  const increasingBarangays = forecastRows.filter((row) => {
    return row.trendLabel === 'Increasing'
  }).length

  const summaryListConfig = useMemo(() => {
    const rankedRows = [...forecastRows].sort(compareBarangayPriority)

    if (summaryListType === 'attention') {
      const attentionRows = rankedRows.filter((row) => {
        return row.risk === 'High' || row.risk === 'Moderate'
      })

      return {
        title: 'Barangays needing attention',
        description: 'High- and moderate-risk barangays are shown in the same canonical priority order used across the Forecast, Map, Dashboard, and Reports pages.',
        rows: attentionRows,
        tone: attentionRows.length > 0 ? 'amber' : 'emerald',
        emptyMessage: 'No barangays are currently classified as High or Moderate risk.',
      }
    }

    if (summaryListType === 'increasing') {
      const increasingRows = rankedRows.filter((row) => {
        return row.trendLabel === 'Increasing'
      })

      return {
        title: 'Barangays with increasing cases',
        description: 'These barangays have a rising recent case trend. They remain ordered by the system’s canonical response-priority ranking.',
        rows: increasingRows,
        tone: increasingRows.length > 0 ? 'amber' : 'emerald',
        emptyMessage: 'No barangays currently have an increasing recent case trend.',
      }
    }

    return {
      title: 'Priority barangay ranking',
      description: 'All barangays are ranked by risk level, combined multi-source score, response priority, projected cases, and deterministic tie-breakers.',
      rows: rankedRows,
      tone: 'rose',
      emptyMessage: 'No priority ranking is available until forecast results are ready.',
    }
  }, [forecastRows, summaryListType])

  const multiSourceFactorCards = [
    {
      label: 'Overall risk score',
      value:
        riskExplanationScore > 0
          ? `${formatNumber(riskExplanationScore)}/100`
          : 'No data',
      helper: 'Combined case, weather, population, and crowding score',
      icon: Gauge,
      tone:
        riskExplanationScore >= 60
          ? 'rose'
          : riskExplanationScore >= 25
            ? 'amber'
            : 'blue',
    },
    {
      label: 'Rainfall level',
      value:
        riskExplanationAverageRainfall > 0
          ? `${formatDecimal(riskExplanationAverageRainfall)} mm average`
          : 'No data',
      helper: riskExplanationRainfallPressure,
      icon: CloudRain,
      tone: 'blue',
    },
    {
      label: 'Temperature condition',
      value:
        riskExplanationAverageTemperature > 0
          ? `${formatDecimal(riskExplanationAverageTemperature)} °C`
          : 'No data',
      helper: riskExplanationTemperatureSuitability,
      icon: Thermometer,
      tone: 'amber',
    },
    {
      label: 'Humidity level',
      value:
        riskExplanationAverageHumidity > 0
          ? `${formatDecimal(riskExplanationAverageHumidity)}%`
          : 'No data',
      helper: riskExplanationHumiditySuitability,
      icon: Droplets,
      tone: 'emerald',
    },
  ]

  useEffect(() => {
  async function loadMetrics() {
    try {
      const result = await getLatestModelMetrics()

      if (result?.has_metrics) {
        setLatestModelMetrics(result)
      }
    } catch {
      setLatestModelMetrics(null)
    }
  }

  loadMetrics()
}, [])

const activeModelMetrics =
  backendForecastResult?.model_metrics ||
  latestModelMetrics?.metrics ||
  null

const activeTrainingSummary =
  backendForecastResult?.training_summary ||
  latestModelMetrics?.training_summary ||
  null

const activeSelectionConfidence =
  backendForecastResult?.selection_confidence ||
  latestModelMetrics?.selection_confidence ||
  activeTrainingSummary?.selection_confidence ||
  activeModelMetrics?.selection_confidence ||
  null

const activeSelectionExplanation =
  backendForecastResult?.selection_explanation ||
  latestModelMetrics?.selection_explanation ||
  activeTrainingSummary?.selection_explanation ||
  activeModelMetrics?.selection_explanation ||
  ''

const activeFeatureImportance =
  backendForecastResult?.feature_importance ||
  latestModelMetrics?.feature_importance ||
  activeModelMetrics?.feature_importance ||
  []

const selectedModelDisplayName =
  activeModelMetrics?.model_name ||
  latestModelMetrics?.best_model_name ||
  selectedModelName ||
  'The selected model'

const importantFeatureLabels = Array.isArray(activeFeatureImportance)
  ? [...activeFeatureImportance]
      .sort((a, b) => Number(b?.importance || 0) - Number(a?.importance || 0))
      .map((item) => String(item?.label || formatModelName(item?.feature || '')).trim())
      .filter(Boolean)
      .slice(0, 3)
  : []

const importantFeatureSummary = importantFeatureLabels.length
  ? importantFeatureLabels.length === 1
    ? importantFeatureLabels[0]
    : importantFeatureLabels.length === 2
      ? `${importantFeatureLabels[0]} and ${importantFeatureLabels[1]}`
      : `${importantFeatureLabels[0]}, ${importantFeatureLabels[1]}, and ${importantFeatureLabels[2]}`
  : ''

const evaluatedModelRecordCount =
  Number(activeTrainingSummary?.training_row_count || activeModelMetrics?.training_row_count || 0) +
  Number(activeTrainingSummary?.testing_row_count || activeModelMetrics?.testing_row_count || 0)

const findingRecordCount = Number(loadedRecordCount) > 0
  ? Number(loadedRecordCount)
  : evaluatedModelRecordCount

const attentionRiskParts = [
  highRiskCount > 0
    ? `${formatNumber(highRiskCount)} High-risk ${highRiskCount === 1 ? 'barangay' : 'barangays'}`
    : '',
  moderateRiskCount > 0
    ? `${formatNumber(moderateRiskCount)} Moderate-risk ${moderateRiskCount === 1 ? 'barangay' : 'barangays'}`
    : '',
].filter(Boolean)

const lowRiskCount = riskDistribution.find((item) => item.level === 'Low')?.count || 0

const attentionFindingMessage = attentionRiskParts.length
  ? `I found ${attentionRiskParts.length === 2 ? `${attentionRiskParts[0]} and ${attentionRiskParts[1]}` : attentionRiskParts[0]} that currently ${attentionRiskCount === 1 ? 'needs' : 'need'} closer attention.`
  : 'I did not find any barangays currently classified as High or Moderate risk, but the priority ranking should still be monitored for early changes.'

const rankedForecastRowsForInsights = [...forecastRows].sort(compareBarangayPriority)
const secondaryPriorityRows = rankedForecastRowsForInsights.slice(1, 4)
const increasingForecastRows = rankedForecastRowsForInsights.filter((row) => {
  return row.trendLabel === 'Increasing'
})
const decreasingForecastRows = rankedForecastRowsForInsights.filter((row) => {
  return row.trendLabel === 'Decreasing'
})
const stableForecastRows = rankedForecastRowsForInsights.filter((row) => {
  return row.trendLabel === 'Stable'
})

const firstProjectedPeriodTotal = Number(projectedWeeklyValues[0] || 0)
const lastProjectedPeriodInsightTotal = Number(
  projectedWeeklyValues[projectedWeeklyValues.length - 1] || 0
)
const projectedPeriodDifference =
  lastProjectedPeriodInsightTotal - firstProjectedPeriodTotal
const projectedPeriodPercentChange = firstProjectedPeriodTotal > 0
  ? Math.round((projectedPeriodDifference / firstProjectedPeriodTotal) * 100)
  : 0
const citywideProjectionDirection = projectedPeriodDifference > 0
  ? 'increase'
  : projectedPeriodDifference < 0
    ? 'decrease'
    : 'remain stable'
const citywideProjectionValues = projectedWeeklyValues
  .map((value, index) => {
    return `${forecastChartLabels[index] || `${forecastPeriodDisplay.prefix}${index + 1}`}: ${formatNumber(value)}`
  })
  .join(', ')

const topBarangayRecentAverage = Number(highestRiskBarangay?.recentAverage || 0)
const topBarangayPreviousAverage = Number(highestRiskBarangay?.previousAverage || 0)
const topBarangayAverageDifference =
  topBarangayRecentAverage - topBarangayPreviousAverage
const topBarangayAveragePercentChange = topBarangayPreviousAverage > 0
  ? Math.round((topBarangayAverageDifference / topBarangayPreviousAverage) * 100)
  : 0

const topBarangayConditionParts = [
  Number(highestRiskBarangay?.averageRainfall || highestRiskBarangay?.avgRainfall || 0) > 0
    ? `${formatDecimal(highestRiskBarangay?.averageRainfall || highestRiskBarangay?.avgRainfall)} mm average rainfall, described as ${String(highestRiskBarangay?.rainfallPressure || 'available rainfall context').toLowerCase()}`
    : '',
  Number(highestRiskBarangay?.averageTemperature || highestRiskBarangay?.avgTemperature || 0) > 0
    ? `${formatDecimal(highestRiskBarangay?.averageTemperature || highestRiskBarangay?.avgTemperature)} °C average temperature, described as ${String(highestRiskBarangay?.temperatureSuitability || 'available temperature context').toLowerCase()}`
    : '',
  Number(highestRiskBarangay?.averageHumidity || highestRiskBarangay?.avgHumidity || 0) > 0
    ? `${formatDecimal(highestRiskBarangay?.averageHumidity || highestRiskBarangay?.avgHumidity)}% average humidity, described as ${String(highestRiskBarangay?.humiditySuitability || 'available humidity context').toLowerCase()}`
    : '',
].filter(Boolean)

const topBarangayExposureParts = [
  Number(highestRiskBarangay?.population || 0) > 0
    ? `${formatNumber(highestRiskBarangay.population)} residents`
    : '',
  Number(highestRiskBarangay?.density || 0) > 0
    ? `${formatNumber(Math.round(highestRiskBarangay.density))} people per square kilometer`
    : '',
  highestRiskBarangay?.populationExposure
    ? String(highestRiskBarangay.populationExposure)
    : '',
  highestRiskBarangay?.densityLevel
    ? `${String(highestRiskBarangay.densityLevel)} crowding level`
    : '',
].filter(Boolean)

const topRiskDriverItems = highestRiskBarangay
  ? getRiskComponentItems(highestRiskBarangay)
      .filter(([, value]) => Number(value || 0) > 0)
      .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
      .slice(0, 3)
  : []
const topRiskDriverSummary = topRiskDriverItems
  .map(([label, value]) => `${label} (${formatNumber(value)} points)`)
  .join(', ')

const normalizeRecommendationText = (item) => {
  if (!item) return ''
  if (typeof item === 'string') return item.trim()

  return String(
    item.title ||
      item.action ||
      item.label ||
      item.description ||
      item.summary ||
      ''
  ).trim()
}

const topBarangayRecommendationSummary = normalizeRecommendationText(
  highestRiskBarangay?.decisionSupport?.summary ||
    highestRiskBarangay?.recommendedAction ||
    highestRiskBarangay?.primaryAction
)

const topBarangayRecommendedActions = [
  highestRiskBarangay?.primaryAction,
  ...(Array.isArray(highestRiskBarangay?.recommendedActions)
    ? highestRiskBarangay.recommendedActions
    : []),
]
  .map(normalizeRecommendationText)
  .filter(Boolean)
  .filter((item, index, list) => list.indexOf(item) === index)
  .slice(0, 3)

const topBarangayRecommendationRationale = normalizeRecommendationText(
  highestRiskBarangay?.recommendationRationale ||
    highestRiskBarangay?.decisionSupport?.rationale
)

const secondaryPrioritySummary = secondaryPriorityRows
  .map((row, index) => {
    return `#${index + 2} ${row.barangay}, ${row.risk || 'Pending'} risk, ${formatNumber(row.forecast || 0)} projected cases, and a ${formatNumber(getRowRiskScore(row))}/100 combined score`
  })
  .join('; ')

const increasingBarangaySummary = increasingForecastRows
  .slice(0, 5)
  .map((row) => row.barangay)
  .join(', ')

const topBarangayPeriodPredictions = Array.isArray(
  highestRiskBarangay?.forecastPeriodPredictions
)
  ? highestRiskBarangay.forecastPeriodPredictions
  : []
const topBarangayPeriodSummary = topBarangayPeriodPredictions
  .slice(0, forecastHorizonPeriods)
  .map((item, index) => {
    return `${item?.period || `${forecastPeriodDisplay.prefix}${index + 1}`}: ${formatNumber(item?.predictedCases || 0)}`
  })
  .join(', ')

const modelReliabilityParts = [
  hasMetricValue(activeModelMetrics?.rmse)
    ? `an RMSE of ${formatDecimal(activeModelMetrics.rmse)}`
    : '',
  hasMetricValue(activeModelMetrics?.f1_score)
    ? `an F1-score of ${formatMetricPercent(activeModelMetrics.f1_score)}`
    : '',
  Number(activeSelectionConfidence?.score || 0) > 0
    ? `${formatNumber(activeSelectionConfidence.score)}% selection confidence`
    : '',
].filter(Boolean)

const forecastFindingMessages = forecastRows.length
  ? [
      `Hello, I’m the forecast assistant using ${selectedModelDisplayName}. I will walk through the citywide outlook, priority barangays, local conditions, and recommended response actions one finding at a time.`,
      findingRecordCount > 0
        ? `I reviewed ${formatNumber(findingRecordCount)} validated ${findingRecordCount === 1 ? 'record' : 'records'} and prepared the ${forecastHorizonLabel.toLowerCase()} outlook for ${formatNumber(forecastRows.length)} ${forecastRows.length === 1 ? 'barangay' : 'barangays'}.`
        : `I prepared the ${forecastHorizonLabel.toLowerCase()} outlook for ${formatNumber(forecastRows.length)} ${forecastRows.length === 1 ? 'barangay' : 'barangays'}.`,
      `Across Butuan City, I project ${formatNumber(projectedTotal)} dengue ${projectedTotal === 1 ? 'case' : 'cases'} over the ${forecastHorizonLabel.toLowerCase()} under the ${selectedMode.label.toLowerCase()} planning scenario.`,
      projectedWeeklyValues.length > 1
        ? `The citywide period totals are ${citywideProjectionValues}. From the first to the final forecast period, the projected total is expected to ${citywideProjectionDirection}${projectedPeriodDifference !== 0 ? ` by ${formatNumber(Math.abs(projectedPeriodDifference))} cases${firstProjectedPeriodTotal > 0 ? `, or about ${formatNumber(Math.abs(projectedPeriodPercentChange))}%` : ''}` : ''}.`
        : '',
      `The current risk distribution is ${formatNumber(highRiskCount)} High, ${formatNumber(moderateRiskCount)} Moderate, and ${formatNumber(lowRiskCount)} Low-risk ${forecastRows.length === 1 ? 'barangay' : 'barangays'}.`,
      attentionFindingMessage,
      highestRiskBarangay
        ? `My top-ranked barangay is ${highestRiskBarangay.barangay}. It has ${formatNumber(highestRiskBarangay.forecast)} projected ${Number(highestRiskBarangay.forecast || 0) === 1 ? 'case' : 'cases'}, a combined risk score of ${formatNumber(topRiskScore)}/100, a ${highestRiskBarangay.risk || 'Pending'} risk classification, and a ${highestRiskBarangay.responsePriority || 'pending'} response priority.`
        : 'I do not have a priority barangay to discuss yet.',
      highestRiskBarangay && topBarangayPeriodSummary
        ? `For ${highestRiskBarangay.barangay}, the horizon-specific forecast is ${topBarangayPeriodSummary}. These period estimates add up to the cumulative value used in its ranking.`
        : '',
      highestRiskBarangay
        ? topBarangayPreviousAverage > 0
          ? `${highestRiskBarangay.barangay} has a ${String(highestRiskBarangay.trendLabel || 'Stable').toLowerCase()} recent trend. Its recent average is ${formatDecimal(topBarangayRecentAverage)} cases compared with ${formatDecimal(topBarangayPreviousAverage)} previously, a ${topBarangayAverageDifference >= 0 ? 'rise' : 'decline'} of about ${formatNumber(Math.abs(topBarangayAveragePercentChange))}%.`
          : `${highestRiskBarangay.barangay} has a ${String(highestRiskBarangay.trendLabel || 'Stable').toLowerCase()} recent trend, with a recent average of ${formatDecimal(topBarangayRecentAverage)} cases.`
        : '',
      highestRiskBarangay && topBarangayConditionParts.length
        ? `The environmental context considered for ${highestRiskBarangay.barangay} includes ${topBarangayConditionParts.join('; ')}. These conditions support the risk interpretation but do not prove that weather directly caused the projected cases.`
        : highestRiskBarangay
          ? `Weather measurements were not complete enough for a detailed environmental explanation for ${highestRiskBarangay.barangay}.`
          : '',
      highestRiskBarangay && topBarangayExposureParts.length
        ? `The exposure context for ${highestRiskBarangay.barangay} includes ${topBarangayExposureParts.join(', ')}. Population and crowding help the system estimate how many people may be affected if transmission increases.`
        : '',
      highestRiskBarangay && topRiskDriverSummary
        ? `The strongest contributors in ${highestRiskBarangay.barangay}’s combined score were ${topRiskDriverSummary}. The score is multi-source, so no single factor determines the final priority by itself.`
        : '',
      highestRiskBarangay && highestRiskBarangay.risk === 'Low'
        ? `${highestRiskBarangay.barangay} is still ranked first even though it is classified as Low risk. That is because the priority order also considers its combined score, projected cases, recent trend, and response-priority indicators relative to the other barangays.`
        : '',
      topBarangayRecommendationSummary
        ? `My main recommendation for ${highestRiskBarangay?.barangay || 'the top barangay'} is: ${topBarangayRecommendationSummary}`
        : '',
      topBarangayRecommendedActions.length
        ? `The suggested action sequence for ${highestRiskBarangay?.barangay || 'the top barangay'} includes ${topBarangayRecommendedActions.join('; ')}.`
        : '',
      topBarangayRecommendationRationale
        ? `The reason for that recommendation is: ${topBarangayRecommendationRationale}`
        : '',
      secondaryPrioritySummary
        ? `After ${highestRiskBarangay?.barangay || 'the first-ranked barangay'}, the next priorities are ${secondaryPrioritySummary}. These should be reviewed in order rather than treated as equal.`
        : '',
      increasingForecastRows.length > 0
        ? `I detected ${formatNumber(increasingForecastRows.length)} ${increasingForecastRows.length === 1 ? 'barangay' : 'barangays'} with an increasing recent trend. The first names in the priority order are ${increasingBarangaySummary}${increasingForecastRows.length > 5 ? ', and others' : ''}.`
        : 'I did not detect any barangays with an increasing recent case trend.',
      `For comparison, ${formatNumber(stableForecastRows.length)} ${stableForecastRows.length === 1 ? 'barangay has' : 'barangays have'} a stable trend and ${formatNumber(decreasingForecastRows.length)} ${decreasingForecastRows.length === 1 ? 'barangay has' : 'barangays have'} a decreasing trend. Stable or decreasing areas still require routine surveillance because the forecast can change when new records are uploaded.`,
      importantFeatureSummary
        ? `At the model level, the inputs that influenced this forecast most were ${importantFeatureSummary}. Feature importance shows predictive influence, not direct causation.`
        : 'Feature-importance results are not available yet, so I cannot reliably name the strongest model inputs for this run.',
      modelReliabilityParts.length
        ? `${selectedModelDisplayName} was selected with ${modelReliabilityParts.join(', ')}. These values describe model performance and selection reliability, but they do not guarantee that every barangay forecast will be exact.`
        : `${selectedModelDisplayName} was selected from the evaluated models, but complete reliability metrics are not available for this run.`,
      `The current display uses the ${selectedMode.label.toLowerCase()} scenario at ${formatDecimal(selectedMode.multiplier, 2)}x. Changing the scenario adjusts the planning estimates, but it does not retrain or replace ${selectedModelDisplayName}.`,
      `My final operational advice is to review the top-ranked barangays first, confirm the forecast with current field observations, carry out the listed response actions, and update the analysis whenever newer dengue or environmental records become available.`,
    ].filter(Boolean)
  : [
      `Hello, I’m the forecast assistant using ${selectedModelDisplayName} for this forecast run.`,
      'I am ready to explain the citywide outlook, barangay conditions, and response recommendations, but validated forecast results must be processed first.',
    ]

const selectedModelKey = normalizeModelKey(
  activeModelMetrics?.model_key ||
    backendForecastResult?.best_model_key ||
    latestModelMetrics?.best_model_key ||
    backendForecastResult?.model_name ||
    selectedModelName
)

const selectedModelImage = getModelIcon(
  {
    model_key: selectedModelKey,
    model_name: selectedModelDisplayName,
  },
  0
)

const activeModelComparison = (() => {
  const rawComparison =
    backendForecastResult?.model_comparison ||
    latestModelMetrics?.model_comparison ||
    []

  const comparisonMap = new Map()

  rawComparison.forEach((model) => {
    const rawName = model.model_name || model.model || model.name || 'Auto-selected model'
    const normalizedKey = normalizeModelKey(model.model_key || rawName)

    comparisonMap.set(normalizedKey, {
      ...model,
      model_key: normalizedKey,
      model_name: formatModelName(rawName),
      random_state: model.random_state ?? activeTrainingSummary?.random_state ?? backendForecastResult?.random_state ?? latestModelMetrics?.random_state,
      train_test_split: model.train_test_split || activeTrainingSummary?.train_test_split || backendForecastResult?.train_test_split || latestModelMetrics?.train_test_split || '80% / 20%',
      training_row_count: model.training_row_count ?? activeTrainingSummary?.training_row_count ?? latestModelMetrics?.training_row_count,
      testing_row_count: model.testing_row_count ?? activeTrainingSummary?.testing_row_count ?? latestModelMetrics?.testing_row_count,
      feature_importance: Array.isArray(model.feature_importance) && model.feature_importance.length
        ? model.feature_importance
        : normalizedKey === selectedModelKey
          ? activeFeatureImportance
          : [],
      is_available: true,
    })
  })

  modelCatalog.forEach((catalogModel) => {
    if (!comparisonMap.has(catalogModel.model_key)) {
      comparisonMap.set(catalogModel.model_key, {
        ...catalogModel,
        rmse: null,
        mae: null,
        accuracy: null,
        precision: null,
        recall: null,
        f1_score: null,
        random_state: activeTrainingSummary?.random_state || backendForecastResult?.random_state || latestModelMetrics?.random_state || 42,
        train_test_split: activeTrainingSummary?.train_test_split || backendForecastResult?.train_test_split || latestModelMetrics?.train_test_split || '80% / 20%',
        feature_importance: [],
        is_available: false,
      })
    }
  })

  return Array.from(comparisonMap.values()).sort((a, b) => {
    const rmseDifference = getComparableMetric(a, 'rmse') - getComparableMetric(b, 'rmse')

    if (rmseDifference !== 0) return rmseDifference

    const maeDifference = getComparableMetric(a, 'mae') - getComparableMetric(b, 'mae')

    if (maeDifference !== 0) return maeDifference

    const aCatalogIndex = modelCatalog.findIndex((item) => item.model_key === a.model_key)
    const bCatalogIndex = modelCatalog.findIndex((item) => item.model_key === b.model_key)

    return (aCatalogIndex === -1 ? 99 : aCatalogIndex) - (bCatalogIndex === -1 ? 99 : bCatalogIndex)
  })
})()

  function handleSummaryBarangaySelect(row) {
    if (!row?.barangay) return

    setSummaryListType(null)
    setBarangaySearch(row.barangay)
    setRiskFilter('All')
    setTrendFilter('All')
    setPriorityFilter('All')
    setSortOption('priority')
    setShowAllTopBarangays(true)
    setExpandedBarangay(row.barangay)
    setSelectedResponseBarangay(row.barangay)
    setSelectedRiskExplanationBarangay(row.barangay)

    window.setTimeout(() => {
      document.getElementById('top-barangays')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 160)
  }

  return (
    <div className="forecast-mobile-compact relative space-y-6 pb-10">
      <div className="pointer-events-none absolute inset-x-0 -top-20 -z-10 h-[420px] bg-[radial-gradient(circle_at_18%_24%,rgba(56,189,248,0.12),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(16,185,129,0.10),transparent_28%)] blur-2xl dark:opacity-70" />

      <SummaryBarangayListModal
        open={Boolean(summaryListType)}
        title={summaryListConfig.title}
        description={summaryListConfig.description}
        rows={summaryListConfig.rows}
        tone={summaryListConfig.tone}
        emptyMessage={summaryListConfig.emptyMessage}
        onClose={() => setSummaryListType(null)}
        onSelectBarangay={handleSummaryBarangaySelect}
      />

      <section className="forecast-premium-hero relative isolate overflow-hidden rounded-[34px] border border-white/10 bg-slate-950 p-5 shadow-[0_32px_86px_rgba(2,8,23,0.34)] sm:p-7 lg:p-9">
        <img
          src={forecastHeroBackground}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center brightness-[0.78] saturate-[1.08]"
          style={{ objectPosition: '60% center' }}
        />

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.96)_0%,rgba(2,6,23,0.88)_36%,rgba(2,6,23,0.42)_66%,rgba(2,6,23,0.52)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.10)_0%,rgba(2,6,23,0.16)_48%,rgba(2,6,23,0.80)_100%)]" />
        <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-[35%] h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative z-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-stretch">
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.19em] text-cyan-100 shadow-sm backdrop-blur-md">
                  <Sparkles className="h-3.5 w-3.5" />
                  Predictive command center
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] text-emerald-100 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
                  Forecast ready
                </div>
              </div>

              <h1 className="mt-7 max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.055em] text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.46)] sm:text-5xl lg:text-[4rem]">
                Anticipate dengue pressure before it becomes an outbreak.
              </h1>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200/90 sm:text-base">
                {usingBackendForecast
                  ? 'The latest validated dengue, weather, population, and barangay boundary records are combined into one decision-ready forecast for Butuan City.'
                  : 'Upload validated records to estimate future cases, identify priority barangays, and prepare targeted response decisions from one coordinated view.'}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('top-barangays')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    })
                  }}
                  style={{
                    backgroundColor: '#ffffff',
                    backgroundImage: 'none',
                    color: '#0f172a',
                  }}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[16px] border border-white px-5 py-3 text-sm font-black shadow-[0_16px_34px_rgba(255,255,255,0.16)] transition hover:-translate-y-0.5 hover:bg-slate-100"
                >
                  Review priority barangays
                  <ArrowUpRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/map')}
                  style={{ backgroundImage: 'none' }}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[16px] border border-white/20 bg-slate-950/50 px-5 py-3 text-sm font-black text-white shadow-sm backdrop-blur-md transition hover:-translate-y-0.5 hover:border-white/35 hover:bg-slate-900/65"
                >
                  Open risk map
                  <MapPin className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              <HeroMetric
                label="Expected cases"
                value={formatNumber(projectedTotal)}
                helper={forecastHorizonHelper}
                icon={LineChart}
              />
              <HeroMetric
                label="Needs attention"
                value={formatNumber(attentionRiskCount)}
                helper="High and moderate risk"
                icon={ShieldAlert}
              />
              <HeroMetric
                label="Selected model"
                value={selectedModelName}
                helper={forecastHorizonLabel}
                icon={Sparkles}
              />
            </div>
          </div>

          <div className="relative flex flex-col rounded-[28px] border border-white/15 bg-slate-950/60 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.42)] ring-1 ring-white/5 backdrop-blur-xl sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.19em] text-cyan-100/70">
                  Scenario control
                </p>
                <h2 className="mt-2 text-xl font-black tracking-[-0.035em] text-white">
                  {selectedMode.label}
                </h2>
                <p className="mt-1 text-xs leading-5 text-white/55">
                  Adjust the planning view without changing the selected AI model.
                </p>
              </div>
              <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">
                {formatDecimal(selectedMode.multiplier, 2)}x
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              {[
                ['caution', 'Reduced transmission', '0.90x', TrendingDown],
                ['baseline', 'Expected scenario', '1.00x', Activity],
                ['elevated', 'Worsening transmission', '1.15x', TrendingUp],
              ].map(([key, label, helper, ScenarioIcon]) => {
                const isActive = mode === key

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMode(key)}
                    style={isActive ? { backgroundColor: '#ffffff', backgroundImage: 'none', color: '#0f172a' } : { backgroundImage: 'none' }}
                    className={`group/scenario flex items-center justify-between gap-3 rounded-[18px] border px-3.5 py-3 text-left transition ${
                      isActive
                        ? 'border-white shadow-[0_12px_28px_rgba(255,255,255,0.13)]'
                        : 'border-white/10 bg-white/5 text-white hover:border-white/25 hover:bg-white/10'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border ${isActive ? 'border-slate-200 bg-slate-100 text-slate-700' : 'border-white/10 bg-white/5 text-cyan-200'}`}>
                        <ScenarioIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black">{label}</span>
                        <span className={`mt-0.5 block text-[10px] font-bold ${isActive ? 'text-slate-500' : 'text-white/45'}`}>
                          {key === 'caution' ? 'Improvement planning' : key === 'baseline' ? 'Most likely outlook' : 'Escalation planning'}
                        </span>
                      </span>
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${isActive ? 'bg-slate-900 text-white' : 'bg-white/10 text-white/70'}`}>
                      {helper}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.17em] text-white/45">
                    Current top priority
                  </p>
                  <p className="mt-1 text-lg font-black text-white">
                    {highestRiskBarangay?.barangay || 'No forecast data'}
                  </p>
                </div>
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full p-[5px]"
                  style={{
                    background: `conic-gradient(#22d3ee ${Math.min(100, Math.max(0, topRiskScore)) * 3.6}deg, rgba(255,255,255,0.10) 0deg)`,
                  }}
                >
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950 text-white">
                    <span className="text-sm font-black leading-none">{formatNumber(topRiskScore)}</span>
                    <span className="mt-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-white/45">risk</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[15px] border border-white/10 bg-slate-950/35 px-3 py-2.5">
                  <p className="text-[8px] font-black uppercase tracking-[0.15em] text-white/40">Risk level</p>
                  <p className="mt-1 text-xs font-black text-white">{highestRiskBarangay?.risk || 'Pending'}</p>
                </div>
                <div className="rounded-[15px] border border-white/10 bg-slate-950/35 px-3 py-2.5">
                  <p className="text-[8px] font-black uppercase tracking-[0.15em] text-white/40">Expected</p>
                  <p className="mt-1 text-xs font-black text-white">{formatNumber(highestRiskBarangay?.forecast || 0)} cases</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowScenarioDetails((current) => !current)}
              className="mt-3 inline-flex items-center justify-between gap-2 rounded-[16px] border border-white/10 bg-transparent px-3 py-2.5 text-left text-[11px] font-black text-white/70 transition hover:border-white/20 hover:text-white"
            >
              <span>{showScenarioDetails ? 'Hide scenario explanation' : 'How scenario adjustments work'}</span>
              {showScenarioDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showScenarioDetails && (
              <p className="mt-2 rounded-[16px] border border-white/10 bg-slate-950/35 px-3 py-2.5 text-[10px] leading-4 text-white/55">
                Reduced transmission applies 0.90x, the expected scenario keeps the original 1.00x forecast, and worsening transmission applies 1.15x. These are planning adjustments, not separate AI models.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mobile-field-grid-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Top priority barangay"
          value={highestRiskBarangay?.barangay || 'No data'}
          helper={highestRiskBarangay?.responsePriority || 'Highest priority barangay'}
          icon={Target}
          tone="rose"
          onClick={() => setSummaryListType('priority')}
          actionLabel="View priority ranking"
          ariaLabel="Open the complete priority barangay ranking"
        />

        <StatCard
          label="Barangays needing attention"
          value={formatNumber(attentionRiskCount)}
          helper="High and moderate risk barangays"
          icon={ShieldAlert}
          tone={attentionRiskCount > 0 ? 'amber' : 'emerald'}
          onClick={() => setSummaryListType('attention')}
          actionLabel="View attention list"
          ariaLabel={`Open the list of ${formatNumber(attentionRiskCount)} barangays needing attention`}
        />

        <StatCard
          label="Increasing barangays"
          value={formatNumber(increasingBarangays)}
          helper="Barangays with a rising recent trend"
          icon={TrendingUp}
          tone={increasingBarangays > 0 ? 'amber' : 'emerald'}
          onClick={() => setSummaryListType('increasing')}
          actionLabel="View increasing list"
          ariaLabel={`Open the list of ${formatNumber(increasingBarangays)} barangays with increasing cases`}
        />

        <StatCard
          label="Forecast period"
          value={forecastHorizonLabel}
          helper={selectedMode.label}
          icon={CalendarDays}
          tone="blue"
        />
      </div>

      <div className={`relative overflow-hidden rounded-[24px] border px-5 py-4 shadow-[0_14px_38px_rgba(15,23,42,0.06)] ring-1 ring-white/70 dark:ring-white/5 ${computationStatus.style}`}>
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-white/50 blur-3xl dark:bg-white/5" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-white shadow-sm ring-1 ring-white/80 dark:bg-white/10 dark:ring-white/10">
              <StatusIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black">{computationStatus.title}</p>
              <p className="mt-1 max-w-5xl text-sm leading-6 opacity-85">{computationStatus.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              document.getElementById('forecast-model')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              })
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-current/15 bg-white/50 px-4 py-2 text-xs font-black shadow-sm transition hover:bg-white dark:bg-white/10 dark:hover:bg-white/10"
          >
            Review forecast
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <PremiumPanel id="forecast-data-used" className="p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setShowDataDetails((current) => !current)}
          className="flex w-full items-center justify-between gap-4 text-left"
          aria-expanded={showDataDetails}
        >
          <div>
            <SectionBadge icon={Database} tone="slate">
              Supporting information
            </SectionBadge>
            <h2 className="mt-3 text-xl font-black tracking-tight text-brand-text dark:text-slate-100 sm:text-2xl">
              Data used for this forecast
            </h2>
            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {formatNumber(loadedRecordCount)} records were checked. Open this section to review source totals, weather coverage, and technical forecast inputs.
            </p>
          </div>

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-brand-text dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {showDataDetails ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </button>

        {showDataDetails && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Cases in uploaded records', formatNumber(actualTotal), 'Historical total used as context'],
              ['Records checked', formatNumber(loadedRecordCount), usingBackendForecast ? 'Valid backend records used' : 'Dengue records used'],
              [periodSummaryLabel, formatNumber(periodSummaryValue), periodSummaryHelper],
              ['Weather records used', formatNumber(topWeatherRecordCount), topWeatherCoverage],
            ].map(([label, value, helper], index) => {
              const accents = [
                'from-sky-500 to-cyan-400',
                'from-indigo-500 to-sky-400',
                'from-amber-500 to-orange-400',
                'from-emerald-500 to-teal-400',
              ]

              return (
                <div key={label} className="group relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(15,23,42,0.11)] dark:border-white/10 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
                  <div className={`absolute inset-x-4 top-0 h-[2px] rounded-full bg-gradient-to-r ${accents[index % accents.length]}`} />
                  <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-sky-400/10 blur-2xl" />
                  <p className="relative text-[10px] font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-500">{label}</p>
                  <p className="relative mt-3 text-2xl font-black tracking-[-0.04em] text-brand-text dark:text-slate-100">{value}</p>
                  <p className="relative mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">{helper}</p>
                </div>
              )
            })}
          </div>
        )}
      </PremiumPanel>

      <PremiumPanel className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <SectionBadge icon={Sparkles} tone="blue">
              Forecast method
            </SectionBadge>
            <h2 className="mt-3 text-xl font-black tracking-tight text-brand-text dark:text-slate-100 sm:text-2xl">
              {selectedModelName} prepared the current forecast
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
              Model details are available for technical review, but they are hidden by default so users can focus on barangay priorities and recommended actions.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAiSection((current) => !current)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-black text-brand-blue transition hover:border-brand-blue/30 hover:bg-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
            aria-expanded={showAiSection}
          >
            {showAiSection ? 'Hide AI and model details' : 'View AI and model details'}
            {showAiSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </PremiumPanel>

      {showAiSection && (
<PremiumPanel id="machine-learning-controls" className="p-5 sm:p-6">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div>
      <SectionBadge icon={Sparkles} tone="blue">
        Explainable AI forecast
      </SectionBadge>

      <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
        AI and model details
      </h2>

      <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
        The system automatically compares all available machine learning models, selects the model with the lowest forecast error, and explains the training setup, metrics, confidence, and important predictors.
      </p>
    </div>

    <div className="w-fit rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-black text-brand-green shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
      {isMachineLearningForecast ? 'AutoML selection active' : 'Forecast available'}
    </div>
  </div>

  <div className="mobile-field-grid-6 mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
    {[
      ['Selected model', activeModelMetrics?.model_name || latestModelMetrics?.best_model_name || selectedModelName, 'Best evaluated algorithm'],
      ['Models compared', activeTrainingSummary?.models_evaluated || activeModelComparison.filter((model) => model.is_available !== false).length, 'Candidate models evaluated'],
      ['Train/test split', activeTrainingSummary?.train_test_split || '80% / 20%', 'Documented methodology'],
      ['Random state', activeTrainingSummary?.random_state ?? backendForecastResult?.random_state ?? latestModelMetrics?.random_state ?? 42, 'Reproducible results'],
      ['Best RMSE', activeModelMetrics?.rmse ? formatDecimal(activeModelMetrics.rmse) : 'N/A', 'Lower error is better'],
      ['AI confidence', activeSelectionConfidence?.score ? `${activeSelectionConfidence.score}%` : 'N/A', activeSelectionConfidence?.label || 'Selection confidence'],
    ].map(([label, value, helper], index) => (
      <div
        key={label}
        className={`group relative overflow-hidden rounded-[24px] border px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${index === 0 ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-950/20' : 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:border-blue-500/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-slate-900'}`}
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-cyan-400/10 blur-2xl" />
        <p className="relative text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
          {label}
        </p>
        <p className="relative mt-2 truncate text-xl font-black text-brand-text dark:text-slate-100">
          {value || 'N/A'}
        </p>
        <p className="relative mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
          {helper}
        </p>
      </div>
    ))}
  </div>

  <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
    <div className="relative overflow-hidden rounded-[34px] border border-cyan-200/15 bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-950 p-5 text-white shadow-[0_28px_80px_rgba(2,6,23,0.30)] ring-1 ring-white/5 dark:border-emerald-500/20 sm:p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-8 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
      <div className="pointer-events-none absolute right-8 top-8 h-28 w-28 rounded-full border border-white/5" />
      <div className="pointer-events-none absolute right-14 top-14 h-16 w-16 rounded-full border border-white/5" />

      <div className="relative grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)_220px] lg:items-center">
        <div className="relative mx-auto flex h-[168px] w-[168px] items-center justify-center lg:mx-0">
          <div className="absolute inset-0 rounded-full border border-cyan-200/15" />
          <div className="absolute inset-4 rounded-full border border-emerald-200/15" />
          <div className="absolute inset-7 rounded-full bg-cyan-300/15 blur-2xl" />

          <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-[36px] border border-white/20 bg-slate-950/70 shadow-[0_0_46px_rgba(34,211,238,0.32)] ring-1 ring-white/10">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-cyan-300/10" />
            <img
              src={aiGif}
              alt="Animated AI forecast assistant"
              className="relative h-full w-full object-cover"
            />
          </div>

          <span className="absolute bottom-1 rounded-full border border-emerald-300/25 bg-slate-950/90 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-200 shadow-lg backdrop-blur">
            Selected AI
          </span>
        </div>

        <div className="min-w-0 text-center lg:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Auto-selected model
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.95)]" />
              Forecast engine online
            </div>
          </div>

          <h3 className="mt-4 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
            {selectedModelDisplayName}
          </h3>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
            Version {selectedModelVersion}. This model earned the current forecast run after the system compared the available algorithms using the latest validated combined dataset.
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
            {getModelTypeBadges(selectedModelKey).map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-[10px] font-black text-white/75 shadow-sm"
              >
                {badge}
              </span>
            ))}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {[
              ['Model version', selectedModelVersion],
              ['Forecast scenario', selectedMode.label],
              ['Forecast horizon', forecastHorizonLabel],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[18px] border border-white/10 bg-white/[0.06] px-3 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <p className="text-[8px] font-black uppercase tracking-[0.15em] text-white/40">
                  {label}
                </p>
                <p className="mt-1 truncate text-[11px] font-black text-white/80" title={String(value)}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {[
            [
              'RMSE',
              activeModelMetrics?.rmse
                ? formatDecimal(activeModelMetrics.rmse)
                : 'N/A',
              'Lower forecast error is better',
              'from-cyan-300 to-sky-400',
            ],
            [
              'F1-score',
              formatMetricPercent(activeModelMetrics?.f1_score),
              'Balanced classification performance',
              'from-emerald-300 to-cyan-300',
            ],
            [
              'AI confidence',
              activeSelectionConfidence?.score
                ? `${activeSelectionConfidence.score}%`
                : 'N/A',
              activeSelectionConfidence?.label || 'Selection confidence',
              'from-violet-300 to-cyan-300',
            ],
          ].map(([label, value, helper, accent]) => (
            <div
              key={label}
              className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.11]"
            >
              <div className={`absolute inset-x-4 top-0 h-[2px] rounded-full bg-gradient-to-r ${accent}`} />
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">
                {label}
              </p>
              <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                {value}
              </p>
              <p className="mt-1 text-[10px] font-semibold leading-4 text-white/50">
                {helper}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mt-6 overflow-hidden rounded-[30px] border border-cyan-200/15 bg-gradient-to-br from-slate-950/55 via-blue-950/45 to-emerald-950/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm sm:p-5">
        <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-cyan-300/10 blur-3xl" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.95)]" />
              Forecast AI conversation
            </div>
            <p className="mt-1 text-xs leading-5 text-white/45">
              Choose Automatic for continuous playback or Manual to advance each forecast finding with the Next insight button.
            </p>
          </div>

          <span className="w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/50">
            Auto or manual playback
          </span>
        </div>

        <ForecastFindingsChat
          messages={forecastFindingMessages}
          modelName={selectedModelDisplayName}
          modelImage={selectedModelImage}
        />

        <div className="relative mt-4 flex items-start gap-2 border-t border-white/10 pt-3 text-[11px] leading-5 text-white/50">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
          <span>
            Decision-support interpretation only. Review these patterns together with current surveillance and field observations.
          </span>
        </div>
      </div>
    </div>

    <div className="relative overflow-hidden rounded-[34px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-[0_24px_64px_rgba(15,23,42,0.09)] ring-1 ring-white/80 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-blue-950/20 dark:ring-white/5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-blue-400/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />

      <div className="relative flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border border-emerald-100 bg-white text-brand-green shadow-[0_14px_32px_rgba(15,23,42,0.10)] dark:border-emerald-500/20 dark:bg-white/10 dark:text-emerald-300">
          <Sparkles className="h-6 w-6" />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-black tracking-[-0.025em] text-brand-text dark:text-slate-100">
              Explainable AI control center
            </p>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              Enabled
            </span>
          </div>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Review how the model was selected, how reproducibility was maintained, and which inputs influenced the forecast.
          </p>
        </div>
      </div>

      <div className="relative mt-6 grid gap-3">
        {[
          [
            'Validation method',
            activeTrainingSummary?.train_test_split || '80% / 20%',
            'Hold-out evaluation',
            BarChart3,
          ],
          [
            'Random state',
            activeTrainingSummary?.random_state ??
              backendForecastResult?.random_state ??
              latestModelMetrics?.random_state ??
              42,
            'Reproducible training',
            Activity,
          ],
          [
            'Feature importance',
            activeFeatureImportance?.length ? 'Available' : 'Pending',
            activeFeatureImportance?.length
              ? `${formatNumber(activeFeatureImportance.length)} ranked inputs`
              : 'Retrain to populate',
            Sparkles,
          ],
          [
            'Models evaluated',
            activeModelComparison.filter((model) => {
              return model.is_available !== false && hasMetricValue(model.rmse)
            }).length,
            'Ranked by RMSE and MAE',
            Gauge,
          ],
        ].map(([label, value, helper, Icon]) => (
          <div
            key={label}
            className="group flex items-center gap-3 rounded-[22px] border border-white/80 bg-white/90 p-3.5 shadow-[0_10px_26px_rgba(15,23,42,0.055)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-950/75 dark:hover:border-emerald-500/25"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.13em] text-brand-muted dark:text-slate-500">
                  {label}
                </span>
                <span className="text-sm font-black text-brand-text dark:text-slate-100">
                  {value}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-semibold text-brand-muted dark:text-slate-500">
                {helper}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-5 rounded-[22px] border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-blue-100 bg-white text-brand-blue shadow-sm dark:border-blue-500/20 dark:bg-white/10 dark:text-blue-300">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-black text-brand-text dark:text-slate-100">
              Transparent and reproducible
            </p>
            <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
              The AI dashboard keeps model rankings, evaluation metrics, training settings, and feature importance available for technical review.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowModelDetails((current) => !current)}
        className="relative mt-5 flex w-full items-center justify-between rounded-[22px] border border-slate-200 bg-slate-950 px-4 py-3.5 text-left text-sm font-black text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-slate-900 hover:shadow-lg dark:border-white/10"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-300" />
          {showModelDetails ? 'Hide technical AI dashboard' : 'Open technical AI dashboard'}
        </span>
        {showModelDetails ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
    </div>
  </div>

  {showModelDetails && (
    <div className="mt-5 space-y-5">
      {activeSelectionExplanation && (
        <div className="relative overflow-hidden rounded-[32px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5 shadow-sm dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-950/20">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-emerald-100 bg-white text-brand-green shadow-sm dark:border-emerald-500/20 dark:bg-white/10 dark:text-emerald-300">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-black text-brand-text dark:text-slate-100">
                  Why {activeModelMetrics?.model_name || selectedModelName} was selected
                </p>
                <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  {activeSelectionExplanation}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModelComparison.length > 0 && (
        <div className="rounded-[32px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-base font-black text-brand-text dark:text-slate-100">
                Model comparison board
              </p>
              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                Models are ranked by RMSE and MAE. Open a card to review reproducibility, metrics, model characteristics, and feature importance.
              </p>
            </div>
            <span className="w-fit rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-black text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
              {activeModelComparison.filter((model) => model.is_available !== false && hasMetricValue(model.rmse)).length} evaluated models
            </span>
          </div>

          <div className="mobile-model-comparison-grid mt-5 grid gap-4 xl:grid-cols-2">
            {activeModelComparison.map((model, index) => {
              const isAvailable = model.is_available !== false && hasMetricValue(model.rmse)
              const isSelected = index === 0 && isAvailable
              const isExpandedModel = expandedModelKey === model.model_key
              const importanceItems = getModelFeatureImportance(model, isSelected ? activeFeatureImportance : []).slice(0, 6)
              const modelCharacteristics = getModelCharacteristics(model.model_key)
              const accent = getModelCardAccent(index, isSelected)

              return (
                <div
                  key={model.model_key || model.model_name}
                  style={{ '--model-board-order': getModelBoardOrder(index, activeModelComparison.length) }}
                  className={`model-board-card relative overflow-hidden rounded-[30px] border shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${accent.card}`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedModelKey(isExpandedModel ? null : model.model_key)}
                    className="block w-full p-4 text-left"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-base font-black shadow-sm ${accent.rankBadge}`}>
                          #{index + 1}
                        </div>

                        <img
                          src={getModelIcon(model, index)}
                          alt={`${model.model_name} AI icon`}
                          className="h-32 w-32 shrink-0 object-contain drop-shadow-[0_16px_28px_rgba(15,23,42,0.30)]"
                        />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-black text-brand-text dark:text-slate-100">
                              {model.model_name}
                            </p>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${isSelected ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : isAvailable ? 'border-slate-200 bg-white text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'}`}>
                              {isSelected ? 'Selected' : isAvailable ? 'Compared' : 'Not evaluated'}
                            </span>
                          </div>

                          <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-500">
                            {getModelScoreLabel(model)}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {getModelTypeBadges(model.model_key).map((badge) => (
                              <span key={badge} className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[10px] font-bold text-brand-muted dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
                                {badge}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:min-w-[300px]">
                        {[
                          ['RMSE', formatOptionalDecimal(model.rmse)],
                          ['Accuracy', formatMetricPercent(model.accuracy)],
                          ['F1', formatMetricPercent(model.f1_score)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-[18px] border border-white/70 bg-white px-3 py-2 text-center shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">{label}</p>
                            <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end text-xs font-black text-brand-muted dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        {isExpandedModel ? 'Hide details' : 'View details'}
                        {isExpandedModel ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    </div>
                  </button>

                  {isExpandedModel && (
                    <div className="border-t border-white/70 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/65">
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                        <div className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                              ['Train/Test', model.train_test_split || '80% / 20%'],
                              ['Random State', model.random_state ?? 'N/A'],
                              ['Training Samples', formatNumber(model.training_row_count)],
                              ['Testing Samples', formatNumber(model.testing_row_count)],
                              ['Training Time', formatSeconds(model.training_duration_seconds)],
                              ['Evaluated', formatDateTime(model.evaluated_at || activeTrainingSummary?.evaluated_at)],
                              ['RMSE', formatOptionalDecimal(model.rmse)],
                              ['MAE', formatOptionalDecimal(model.mae)],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-[20px] border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">{label}</p>
                                <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">{value || 'N/A'}</p>
                              </div>
                            ))}
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-[24px] border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                              <p className="text-sm font-black text-brand-blue dark:text-blue-300">Performance profile</p>
                              <div className="mt-3 space-y-3">
                                {[
                                  ['RMSE', model.rmse, 'error'],
                                  ['MAE', model.mae, 'error'],
                                  ['Accuracy', model.accuracy, 'percent'],
                                  ['Precision', model.precision, 'percent'],
                                  ['Recall', model.recall, 'percent'],
                                  ['F1-score', model.f1_score, 'percent'],
                                ].map(([label, value, type]) => (
                                  <div key={label}>
                                    <div className="flex items-center justify-between gap-3 text-xs font-bold text-brand-muted dark:text-slate-400">
                                      <span>{label}</span>
                                      <span>{type === 'percent' ? formatMetricPercent(value) : formatOptionalDecimal(value)}</span>
                                    </div>
                                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white dark:bg-slate-800">
                                      <div
                                        className={`h-full rounded-full bg-gradient-to-r ${accent.bar}`}
                                        style={{ width: getMetricBarWidth(value, type) }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                              <p className="text-sm font-black text-brand-green dark:text-emerald-300">Model characteristics</p>
                              <div className="mt-3 space-y-2">
                                {modelCharacteristics.map((item) => (
                                  <div key={item} className="flex gap-2 text-xs leading-5 text-brand-muted dark:text-slate-400">
                                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-green dark:text-emerald-300" />
                                    <span>{item}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-sm font-black text-brand-text dark:text-slate-100">
                            Feature importance
                          </p>
                          <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
                            Inputs that influenced this model most during forecasting.
                          </p>

                          <div className="mt-4 space-y-3">
                            {importanceItems.length > 0 ? (
                              importanceItems.map((item) => (
                                <div key={`${model.model_key}-${item.feature}`} className="rounded-[18px] border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-brand-muted dark:text-slate-400">
                                    <span className="flex min-w-0 items-center gap-2 truncate">
                                      {(() => {
  const FeatureIcon = getFeatureIcon(item.feature || item.label)

  return (
    <FeatureIcon className="h-4 w-4 shrink-0 text-brand-blue dark:text-blue-300" />
  )
})()}
                                      <span className="truncate">{item.label || formatModelName(item.feature)}</span>
                                    </span>
                                    <span>{formatDecimal(item.importance)}%</span>
                                  </div>
                                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-white dark:bg-slate-800">
                                    <div
                                      className={`h-full rounded-full bg-gradient-to-r ${accent.bar}`}
                                      style={{ width: `${Math.max(4, Math.min(100, Number(item.importance || 0)))}%` }}
                                    />
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                Feature importance is not available for this model yet. Retraining with the latest backend upgrade will populate this section.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-[32px] border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
        <p className="text-base font-black text-brand-text dark:text-slate-100">
          Model pipeline
        </p>
        <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
          The AI process follows the uploaded data from integration to model selection and forecast generation.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {[
            ['Dataset', 'Integrated dengue, weather, population, and boundary data'],
            ['Training', '80/20 split with reproducible random state'],
            ['8 Models', 'Tree, ensemble, boosting, and linear algorithms'],
            ['Evaluation', 'RMSE, MAE, Accuracy, Precision, Recall, and F1'],
            ['Forecast', 'Best model generates barangay priority results'],
          ].map(([title, body], index) => (
            <div key={title} className="relative rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black text-white dark:bg-white dark:text-slate-950">
                {index + 1}
              </div>
              <p className="mt-3 text-sm font-black text-brand-text dark:text-slate-100">{title}</p>
              <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )}
</PremiumPanel>
      )}

      <PremiumPanel className="p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setShowRiskDetails((current) => !current)}
          className="flex w-full items-center justify-between gap-4 text-left"
          aria-expanded={showRiskDetails}
        >
          <div>
            <SectionBadge icon={Gauge} tone="emerald">
              Risk explanation
            </SectionBadge>
            <h2 className="mt-3 text-xl font-black tracking-tight text-brand-text dark:text-slate-100 sm:text-2xl">
              Why {selectedRiskExplanationRow?.barangay || 'the top barangay'} received{' '}
              {selectedRiskExplanationRow?.risk || 'its'} risk level
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
              The score combines expected cases, recent activity, weather, population exposure, and crowding. Open the breakdown only when supporting details are needed.
            </p>
          </div>

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            {showRiskDetails ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </button>
      </PremiumPanel>

      {showRiskDetails && (
      <PremiumPanel
        id="multi-source-risk-factors"
        className="p-5 sm:p-6"
        allowOverflow
      >
        <div className="relative z-20 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <SectionBadge icon={Gauge} tone="emerald">
              Factors used for risk level
            </SectionBadge>

            <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Why {selectedRiskExplanationRow?.barangay || 'the top barangay'} received{' '}
              {selectedRiskExplanationRow?.risk || 'its'} risk level
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
              The current #1 ranked barangay is selected by default. Search for another barangay to review how expected cases, recent changes, rainfall, temperature, humidity, population, crowding, and land area affected its score.
            </p>
          </div>

          <div className="relative z-30 w-full space-y-3 lg:max-w-[390px]">
            <SearchableSelect
              label="Barangay risk explanation"
              value={selectedRiskExplanationRow?.barangay || ''}
              onChange={setSelectedRiskExplanationBarangay}
              placeholder="Select a barangay"
              searchPlaceholder="Search barangay"
              emptyMessage="No barangay matches your search."
              options={riskExplanationOptions}
            />

            <div className="w-fit max-w-full rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-black text-brand-green shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              {riskExplanationEnvironmentalSuitability}
            </div>
          </div>
        </div>

        <div className="mobile-field-grid-4 mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {multiSourceFactorCards.map((item) => (
            <StatCard
              key={item.label}
              label={item.label}
              value={item.value}
              helper={item.helper}
              icon={item.icon}
              tone={item.tone}
            />
          ))}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-sm font-black text-brand-text dark:text-slate-100">
              What affected the score
            </p>

            <div className="mobile-field-grid-6 mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {riskExplanationComponentItems.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[20px] border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                      {label}
                    </span>
                    <span className="text-sm font-black text-brand-text dark:text-slate-100">
                      {formatNumber(value)}
                    </span>
                  </div>

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-blue to-cyan-400"
                      style={{ width: `${Math.min(Math.max(Number(value || 0), 0), 40) * 2.5}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
            <p className="text-sm font-black text-brand-blue dark:text-blue-300">
              Weather records used
            </p>

            <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {riskExplanationWeatherCoverage}. The system used {formatNumber(riskExplanationWeatherRecordCount)} weather record{riskExplanationWeatherRecordCount === 1 ? '' : 's'} near the dengue reporting period.
            </p>

            <p className="mt-3 text-xs leading-5 text-brand-muted dark:text-slate-500">
              These weather values help estimate risk. The warning levels can still be improved when more dengue records are available.
            </p>
          </div>
        </div>
      </PremiumPanel>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.24fr)_minmax(360px,0.76fr)]">
        <PremiumPanel id="forecast-model" className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionBadge icon={Sparkles} tone="amber">
                Forecast details
              </SectionBadge>

              <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                Expected {forecastPeriodDisplay.adjective.toLowerCase()} cases
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-muted dark:text-slate-400">
                {usingBackendForecast
                  ? 'Loaded from the latest checked forecast after upload review.'
                  : 'Estimated from recent dengue case changes in the uploaded records.'}
              </p>
            </div>

            <span className={`w-fit rounded-full border px-4 py-2 text-xs font-black shadow-sm ${selectedMode.chip}`}>
              {selectedMode.label}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowForecastCalculationDetails((current) => !current)}
            className="mt-5 inline-flex w-full items-center justify-between rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-left text-sm font-black text-brand-text transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
            aria-expanded={showForecastCalculationDetails}
          >
            <span>Forecast calculation details</span>
            {showForecastCalculationDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showForecastCalculationDetails && (
          <>
          <div className="mobile-field-grid-4 mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand-muted dark:text-slate-500">
                {periodSummaryLabel}
              </p>
              <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                {formatNumber(periodSummaryValue)}
              </p>
              <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-400">
                {periodSummaryHelper}
              </p>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand-muted dark:text-slate-500">
                Forecast {forecastPeriodDisplay.plural}
              </p>
              <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                {formatNumber(computedPeriods.length)}
              </p>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand-muted dark:text-slate-500">
                Forecast adjustment
              </p>
              <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                {formatDecimal(selectedMode.multiplier, 2)}x
              </p>
            </div>

            <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/80 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand-green dark:text-emerald-300">
                Model used
              </p>
              <p className="mt-2 text-xl font-black text-brand-text dark:text-slate-100">
                {selectedModelName}
              </p>
              <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-400">
                {isMachineLearningForecast ? `Machine learning • ${selectedModelVersion}` : 'Baseline forecast'}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[26px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/50 px-4 py-4 text-sm leading-6 text-brand-text shadow-inner dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20 dark:text-slate-300">
            <span className="font-black text-brand-text dark:text-slate-100">
              Forecast basis:
            </span>{' '}
            {usingBackendForecast && selectedResponseUsesDirectMultiStep
              ? `${selectedModelName} uses direct multi-step forecasting. A horizon-specific model output is generated for each of the next ${forecastHorizonPeriods} ${forecastHorizonPeriods === 1 ? forecastPeriodDisplay.singular : forecastPeriodDisplay.plural}, and the individual predictions are summed to produce the cumulative barangay forecast used for risk classification.`
              : usingBackendForecast
                ? `${selectedModelName} is used for this forecast. Recent case changes, weather, population, crowding level, and the selected forecast setting are used to show priority recommendations.`
                : 'Recent case averages, case changes, rainfall, temperature, humidity, population, crowding level, and barangay map details are used to estimate risk and rank barangays by priority.'}
          </div>

          <div className="relative mt-5 overflow-visible rounded-[28px] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-4 shadow-[0_18px_42px_rgba(79,70,229,0.10)] dark:border-violet-400/20 dark:from-violet-500/10 dark:via-slate-950 dark:to-sky-950/20 sm:p-5">
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet-400/15 blur-3xl" />

            <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                  Selected barangay horizon breakdown
                </p>
                <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-brand-text dark:text-slate-100">
                  {selectedResponseRow?.barangay || 'No barangay selected'} direct forecast
                </h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Each card shows one horizon-specific prediction. The four values are added to obtain the cumulative forecast used by the risk and decision-support sections.
                </p>
              </div>

              <SearchableSelect
                label="Barangay forecast breakdown"
                value={selectedResponseRow?.barangay || ''}
                onChange={setSelectedResponseBarangay}
                placeholder="Select a barangay"
                searchPlaceholder="Search barangay"
                emptyMessage="No barangay matches your search."
                options={forecastRows.map((row) => ({
                  value: row.barangay,
                  label: row.barangay,
                  helper: `${formatNumber(row.forecast)} cases · ${row.risk} risk`,
                  searchText: `${row.barangay} ${row.risk} ${row.forecast}`,
                }))}
              />
            </div>

            {selectedResponsePeriodPredictions.length > 0 ? (
              <>
                <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {selectedResponsePeriodPredictions.map((item, index) => (
                    <div
                      key={`${selectedResponseRow?.barangay || 'barangay'}-${item.horizon || index + 1}`}
                      className="group relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-white/10 dark:bg-slate-950/80"
                    >
                      <div className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-gradient-to-r from-violet-500 via-sky-400 to-cyan-400" />
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-brand-muted dark:text-slate-500">
                        Horizon {formatNumber(item.horizon || index + 1)}
                      </p>
                      <p className="mt-2 truncate text-xs font-bold text-violet-700 dark:text-violet-300" title={item.period}>
                        {item.period || `${forecastPeriodDisplay.adjective} ${index + 1}`}
                      </p>
                      <p className="mt-3 text-3xl font-black tracking-[-0.045em] text-brand-text dark:text-white">
                        {formatNumber(item.predictedCases)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-400">
                        Predicted dengue cases
                      </p>
                    </div>
                  ))}
                </div>

                <div className="relative mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[20px] border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-400/20 dark:bg-sky-500/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-blue dark:text-blue-300">
                      Horizon sum
                    </p>
                    <p className="mt-1 text-xl font-black text-brand-text dark:text-slate-100">
                      {formatNumber(selectedResponsePredictionTotal)} cases
                    </p>
                  </div>

                  <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-400/20 dark:bg-amber-500/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                      Cumulative forecast
                    </p>
                    <p className="mt-1 text-xl font-black text-brand-text dark:text-slate-100">
                      {formatNumber(selectedResponseForecastTotal)} cases
                    </p>
                  </div>

                  <div className={`rounded-[20px] border px-4 py-3 ${selectedResponseTotalsMatch ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-400/20 dark:bg-emerald-500/10' : 'border-rose-200 bg-rose-50/80 dark:border-rose-400/20 dark:bg-rose-500/10'}`}>
                    <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${selectedResponseTotalsMatch ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                      Total validation
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-black text-brand-text dark:text-slate-100">
                      {selectedResponseTotalsMatch ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-rose-500" />}
                      {selectedResponseTotalsMatch ? 'Four horizons match' : 'Review forecast total'}
                    </p>
                  </div>
                </div>

                <div className="relative mt-4 flex flex-col gap-2 rounded-[20px] border border-slate-200 bg-white/80 px-4 py-3 text-xs leading-5 text-brand-muted dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <strong className="text-brand-text dark:text-slate-200">Method:</strong>{' '}
                    {selectedResponseForecastStrategy}
                  </span>
                  <span>
                    <strong className="text-brand-text dark:text-slate-200">Model:</strong>{' '}
                    {selectedModelName} · {selectedModelVersion}
                  </span>
                </div>
              </>
            ) : (
              <div className="relative mt-5 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                The current API response does not include separate horizon predictions for this barangay. The cumulative forecast is available, but individual period values cannot be verified on this page until <code>forecast_period_predictions</code> is returned.
              </div>
            )}
          </div>
          </>
          )}

          <div className="mt-5 overflow-hidden rounded-[30px] border border-cyan-400/15 bg-gradient-to-b from-[#061321] via-[#06111d] to-[#020817] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.42)] sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300/80">
                  Expected citywide {forecastPeriodDisplay.adjective.toLowerCase()} case values
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Aggregated case pattern across all barangays for the selected planning scenario.
                </p>
              </div>

              <div className="w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-black text-cyan-200">
                {computedPeriods.length} {computedPeriods.length === 1 ? forecastPeriodDisplay.singular : forecastPeriodDisplay.plural} forecast
              </div>
            </div>

            <div className="forecast-3d-chart-wrap h-[430px] sm:h-[500px]">
              {projectedWeeklyValues.length > 0 ? (
                <ForecastThreeDTrendChart
                  values={projectedWeeklyValues}
                  labels={forecastChartLabels}
                  title={`Citywide ${forecastPeriodDisplay.adjective.toLowerCase()} dengue case trend`}
                  subtitle={`Projected citywide cases across the next ${computedPeriods.length} ${computedPeriods.length === 1 ? forecastPeriodDisplay.singular : forecastPeriodDisplay.plural}`}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-700 bg-slate-950 px-5 text-center text-sm leading-6 text-slate-400">
                  No chart available until dengue records are uploaded.
                </div>
              )}
            </div>
          </div>

          {showForecastCalculationDetails && (
          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-stretch">
  <div className="grid gap-3 sm:grid-cols-2">
    <div className="rounded-[22px] border border-blue-100 bg-blue-50/80 px-4 py-3 dark:border-blue-500/20 dark:bg-blue-500/10">
      <p className="text-sm font-black text-brand-blue dark:text-blue-300">
        Forecast setting
      </p>

      <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
        {selectedMode.label} uses a {selectedMode.multiplier}x adjustment on the case estimate.
      </p>
    </div>

    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
      <p className="text-sm font-black text-brand-text dark:text-slate-100">
        How barangays are ranked
      </p>

      <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
        Barangays are ranked by risk level, combined multi-source score, response priority, and expected cases.
      </p>
    </div>
  </div>

  <div className="relative flex min-h-[96px] w-full overflow-hidden rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-5 py-4 text-left shadow-sm dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-blue-950/20">
    <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-400/20 blur-2xl" />

    <div className="relative flex w-full items-center gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-brand-green shadow-sm dark:border-emerald-500/20 dark:bg-white/10 dark:text-emerald-300">
        <CheckCircle2 className="h-5 w-5" />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-black leading-5 text-brand-text dark:text-slate-100">
          Latest forecast available
        </p>

        <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
          The latest machine learning forecast is available for review together with the priority barangay results.
        </p>
      </div>
    </div>
  </div>
</div>
          )}
        </PremiumPanel>

        <PremiumPanel id="risk-summary" className="p-5 sm:p-6">
          <SectionBadge icon={ShieldAlert} tone="rose">
            Risk overview
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Risk summary
          </h2>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Barangays grouped by their estimated risk level.
          </p>

          <div className="mt-5 space-y-4">
            {riskDistribution.map((item) => {
              const Icon = item.icon

              return (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => {
                    setRiskFilter((current) => current === item.level ? 'All' : item.level)
                    setShowAllTopBarangays(true)
                  }}
                  className={`group relative w-full overflow-hidden rounded-[26px] border p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.07)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_rgba(15,23,42,0.13)] ${item.surface} ${riskFilter === item.level ? 'ring-2 ring-brand-blue/30 dark:ring-blue-400/30' : ''}`}
                >
                  <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full ${item.glow} blur-3xl transition-transform duration-500 group-hover:scale-125`} />
                  <div className={`absolute inset-y-5 left-0 w-1 rounded-r-full bg-gradient-to-b ${item.accent}`} />

                  <div className="relative flex items-center justify-between gap-3 pl-1">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-[18px] shadow-sm ${item.badge}`}>
                        <Icon className="h-5 w-5" />
                      </div>

                      <div>
                        <p className="font-black text-brand-text dark:text-slate-100">
                          {item.label}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-brand-muted dark:text-slate-400">
                          Click to filter this risk level
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-black tracking-[-0.04em] text-brand-text dark:text-white">
                        {formatNumber(item.count)}
                      </p>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                        {item.width} of barangays
                      </p>
                    </div>
                  </div>

                  <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-white/10">
                    <div
                      className={`h-full rounded-full shadow-[0_0_14px_rgba(14,165,233,0.20)] ${item.bar}`}
                      style={{ width: item.width }}
                    />
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-5 rounded-[26px] border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-sm font-black text-brand-text dark:text-slate-100">
              Priority overview
            </p>

            <div className="mt-3 space-y-2">
              {priorityDistribution.length > 0 ? (
                priorityDistribution.map((item, index) => (
                  <div
                    key={item.priority}
                    className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-[20px] border border-slate-200/80 bg-gradient-to-r from-white to-slate-50 px-3 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md dark:border-white/10 dark:from-slate-950 dark:to-slate-900"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-950 text-[10px] font-black text-white dark:border-white/10 dark:bg-white dark:text-slate-950">
                        {index + 1}
                      </span>
                      <span
                        className={`truncate rounded-full border px-3 py-1 text-[11px] font-black ${getPriorityBadgeStyle(item.priority)}`}
                      >
                        {item.priority}
                      </span>
                    </div>

                    <span className="flex h-9 min-w-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-2 text-sm font-black text-brand-text shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-slate-100">
                      {formatNumber(item.count)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  Priority levels will appear after dengue records are uploaded.
                </p>
              )}
            </div>
          </div>
        </PremiumPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.94fr)_minmax(380px,1.06fr)]">
        <PremiumPanel id="top-barangays" allowOverflow className="relative z-20 p-5 sm:p-6">
          <SectionBadge icon={MapPin} tone="slate">
            Priority barangay list
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Priority barangays
          </h2>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Search, filter, and sort all barangays. Recommended actions remain visible while supporting data stays inside each details panel.
          </p>

          <div className="relative mt-5 grid gap-3 overflow-visible rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-sky-50/60 p-4 shadow-inner dark:border-white/10 dark:from-slate-900 dark:via-slate-950 dark:to-sky-950/20 sm:grid-cols-2 xl:grid-cols-1">
            <label className="relative block sm:col-span-2 xl:col-span-1">
              <span className="sr-only">Search barangay</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted dark:text-slate-500" />
              <input
                type="search"
                value={barangaySearch}
                onChange={(event) => {
                  setBarangaySearch(event.target.value)
                  setShowAllTopBarangays(true)
                }}
                placeholder="Search barangay"
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-brand-text outline-none transition placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/20"
              />
            </label>

            {[
              {
                label: 'Risk',
                value: riskFilter,
                setter: setRiskFilter,
                searchPlaceholder: 'Search risk level',
                options: [
                  { value: 'All', label: 'All risk levels', helper: 'Show every barangay' },
                  { value: 'High', label: 'High risk', helper: 'Highest warning level' },
                  { value: 'Moderate', label: 'Moderate risk', helper: 'Needs closer monitoring' },
                  { value: 'Low', label: 'Low risk', helper: 'Routine prevention' },
                ],
              },
              {
                label: 'Trend',
                value: trendFilter,
                setter: setTrendFilter,
                searchPlaceholder: 'Search case trend',
                options: [
                  { value: 'All', label: 'All trends', helper: 'Show every trend direction' },
                  { value: 'Increasing', label: 'Increasing', helper: 'Recent cases are rising' },
                  { value: 'Stable', label: 'Stable', helper: 'Recent cases are steady' },
                  { value: 'Decreasing', label: 'Decreasing', helper: 'Recent cases are falling' },
                ],
              },
              {
                label: 'Priority',
                value: priorityFilter,
                setter: setPriorityFilter,
                searchPlaceholder: 'Search response priority',
                options: [
                  { value: 'All', label: 'All priorities', helper: 'Show every response level' },
                  { value: 'Immediate', label: 'Immediate', helper: 'Urgent or high-priority action' },
                  { value: 'Preventive', label: 'Preventive', helper: 'Escalated prevention measures' },
                  { value: 'Monitoring', label: 'Monitoring', helper: 'Early observation and follow-up' },
                  { value: 'Routine', label: 'Routine', helper: 'Continue standard prevention' },
                ],
              },
              {
                label: 'Sort',
                value: sortOption,
                setter: setSortOption,
                searchPlaceholder: 'Search sorting method',
                options: [
                  { value: 'priority', label: 'Priority', helper: 'Highest response priority first' },
                  { value: 'forecast', label: 'Expected cases', helper: 'Highest expected cases first' },
                  { value: 'risk', label: 'Risk score', helper: 'Highest risk level and score first' },
                  { value: 'barangay', label: 'Barangay name', helper: 'Alphabetical order' },
                ],
              },
            ].map((filter) => (
              <SearchableSelect
                key={filter.label}
                label={filter.label}
                value={filter.value}
                options={filter.options}
                searchPlaceholder={filter.searchPlaceholder}
                onChange={(nextValue) => {
                  filter.setter(nextValue)
                  setShowAllTopBarangays(true)
                  setExpandedBarangay(null)
                }}
              />
            ))}

            <div className="flex items-end sm:col-span-2 xl:col-span-1">
              <button
                type="button"
                onClick={() => {
                  setBarangaySearch('')
                  setRiskFilter('All')
                  setTrendFilter('All')
                  setPriorityFilter('All')
                  setSortOption('priority')
                  setShowAllTopBarangays(false)
                  setExpandedBarangay(null)
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-brand-muted transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              >
                Clear filters
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-brand-muted dark:text-slate-400">
            <span>{formatNumber(filteredForecastRows.length)} barangay{filteredForecastRows.length === 1 ? '' : 's'} found</span>
            {(riskFilter !== 'All' || trendFilter !== 'All' || priorityFilter !== 'All' || barangaySearch) && (
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">Filtered view</span>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {visibleTopBarangays.length > 0 ? (
              <>
                {visibleTopBarangays.map((row, index) => {
                  const TrendIcon = getTrendIcon(row.trendLabel)
                  const isExpanded = expandedBarangay === row.barangay
                  const cardStyle = getBarangayCardStyle(row.risk)

                  return (
                    <div
                      key={row.barangay}
                      className={`group relative overflow-hidden rounded-[28px] border p-4 shadow-[0_16px_38px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_58px_rgba(15,23,42,0.15)] ${cardStyle.surface}`}
                    >
                      <div className={`pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full ${cardStyle.glow} blur-3xl transition-transform duration-500 group-hover:scale-125`} />
                      <div className={`absolute inset-x-5 top-0 h-[3px] rounded-full bg-gradient-to-r ${cardStyle.accent}`} />
                      <div className="pointer-events-none absolute right-5 top-5 h-16 w-16 rounded-full border border-white/80 dark:border-white/10" />
                      <div className="relative z-10">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border text-sm font-black ${cardStyle.rank}`}>
                            #{index + 1}
                          </div>

                          <div className="min-w-0">
                            <span className="break-words text-base font-black text-brand-text dark:text-slate-100">
                              {row.barangay}
                            </span>

                            <p className="text-xs font-semibold text-brand-muted dark:text-slate-400">
                              Forecast: {formatNumber(row.forecast)} cases • Risk: {formatNumber(getRowRiskScore(row))}/100
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${getRiskBadgeStyle(row.risk)}`}>
                            {row.risk}
                          </span>

                          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${getPriorityBadgeStyle(row.responsePriority)}`}>
                            {row.responsePriority}
                          </span>
                        </div>
                      </div>

                      <div className="mobile-field-grid-4 mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <div className={`rounded-[18px] border px-3 py-2.5 shadow-sm ${cardStyle.metric}`}>
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                            Priority points
                          </p>
                          <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                            {formatNumber(row.decisionScore)} points
                          </p>
                        </div>

                        <div className={`rounded-[18px] border px-3 py-2.5 shadow-sm ${cardStyle.metric}`}>
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                            Trend
                          </p>
                          <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                            {row.trendLabel}
                          </p>
                        </div>

                        <div className={`rounded-[18px] border px-3 py-2.5 shadow-sm ${cardStyle.metric}`}>
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                            Total
                          </p>
                          <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                            {formatNumber(row.totalCases)} cases
                          </p>
                        </div>

                        <div className={`rounded-[18px] border px-3 py-2.5 shadow-sm ${cardStyle.metric}`}>
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                            Weather status
                          </p>
                          <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                            {row.environmentalSuitability || 'Unavailable'}
                          </p>
                        </div>
                      </div>

                      <div className={`relative mt-3 overflow-hidden rounded-[20px] border px-4 py-3 shadow-sm ${cardStyle.action}`}>
                        <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand-blue dark:text-blue-300">
                          <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${cardStyle.accent}`} />
                          Recommended action
                        </p>
                        <p className="mt-1 text-sm leading-6 text-brand-text dark:text-slate-300">
                          {row.recommendedAction}
                        </p>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedBarangay(isExpanded ? null : row.barangay)
                          }}
                          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-brand-text shadow-sm transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300"
                        >
                          {isExpanded ? 'Hide details' : 'View details'}
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-inner dark:border-slate-800 dark:bg-slate-950/80">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black ${getTrendStyle(row.trendLabel)}`}>
                              <TrendIcon className="h-3.5 w-3.5" />
                              {row.trendLabel}
                            </span>

                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              Crowding: {formatOptionalNumber(row.density, ' people/sq km')}
                            </span>

                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              Recent average: {formatDecimal(row.recentAverage)}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
                                Rainfall
                              </p>
                              <p className="mt-1 text-xs font-bold text-brand-text dark:text-slate-300">
                                {formatOptionalNumber(row.averageRainfall || row.avgRainfall, ' mm average')}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
                                Temperature
                              </p>
                              <p className="mt-1 text-xs font-bold text-brand-text dark:text-slate-300">
                                {formatOptionalNumber(row.averageTemperature || row.avgTemperature, ' °C')}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
                                Humidity
                              </p>
                              <p className="mt-1 text-xs font-bold text-brand-text dark:text-slate-300">
                                {formatOptionalNumber(row.averageHumidity || row.avgHumidity, '%')}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  )
                })}

                {topBarangays.length > 5 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllTopBarangays((current) => !current)
                      setExpandedBarangay(null)
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-black text-brand-text shadow-sm transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300"
                  >
                    {showAllTopBarangays ? 'Show top 5 barangays' : `View all ${topBarangays.length} barangays`}
                    {showAllTopBarangays ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                )}
              </>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                No forecast ranking available yet. Upload historical dengue records first.
              </div>
            )}
          </div>
        </PremiumPanel>

        <PremiumPanel id="recommended-actions" allowOverflow className="relative z-30 p-5 sm:p-6 xl:sticky xl:top-24 xl:self-start">
          <SectionBadge icon={Target} tone="emerald">
            Forecast priority summary
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Forecast summary for {selectedResponseRow?.barangay || 'the selected barangay'}
          </h2>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Review the barangay forecast and its main recommended focus here. Open the Map page for the complete location-based response plan, hotspot context, and supporting reasons.
          </p>

          <SearchableSelect
            className="mt-4"
            label="View forecast summary for"
            value={selectedResponseRow?.barangay || ''}
            onChange={setSelectedResponseBarangay}
            placeholder="Select a barangay"
            searchPlaceholder="Search barangay or risk level"
            emptyMessage="No barangay matches your search."
            options={forecastRows.map((row) => ({
              value: row.barangay,
              label: row.barangay,
              helper: `${row.risk} risk · ${row.responsePriority || 'Priority available'}`,
              searchText: `${row.barangay} ${row.risk} ${row.responsePriority || ''}`,
            }))}
          />

          {selectedResponseRow ? (
            <>
              <div className="mobile-field-grid-4 mt-5 grid gap-3 sm:grid-cols-2">
                <div className="group relative overflow-hidden rounded-[24px] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-4 py-4 shadow-[0_12px_28px_rgba(14,165,233,0.10)] dark:border-sky-400/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-cyan-950/20">
                  <div className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" />
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-blue dark:text-blue-300">
                    Expected cases
                  </p>
                  <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                    {formatNumber(selectedResponseRow.forecast)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-400">
                    {forecastHorizonLabel}
                  </p>
                </div>

                <div className="group relative overflow-hidden rounded-[24px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 px-4 py-4 shadow-[0_12px_28px_rgba(99,102,241,0.10)] dark:border-violet-400/20 dark:from-violet-500/10 dark:via-slate-950 dark:to-indigo-950/20">
                  <div className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-gradient-to-r from-violet-500 to-indigo-400" />
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                    Overall risk score
                  </p>
                  <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                    {formatNumber(getRowRiskScore(selectedResponseRow))}/100
                  </p>
                  <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-400">
                    Combined multi-source score
                  </p>
                </div>

                <div className="group relative overflow-hidden rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4 py-4 shadow-[0_12px_28px_rgba(245,158,11,0.10)] dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-950/20">
                  <div className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-gradient-to-r from-amber-500 to-orange-400" />
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                    Risk level
                  </p>
                  <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black ${getRiskBadgeStyle(selectedResponseRow.risk)}`}>
                    {selectedResponseRow.risk}
                  </span>
                  <p className="mt-2 text-xs font-semibold text-brand-muted dark:text-slate-400">
                    Forecast warning classification
                  </p>
                </div>

                <div className="group relative overflow-hidden rounded-[24px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-4 py-4 shadow-[0_12px_28px_rgba(5,150,105,0.10)] dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-950/20">
                  <div className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" />
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                    Response priority
                  </p>
                  <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black ${getPriorityBadgeStyle(selectedResponseRow.responsePriority)}`}>
                    {selectedResponseRow.responsePriority}
                  </span>
                  <p className="mt-2 text-xs font-semibold text-brand-muted dark:text-slate-400">
                    Trend: {selectedResponseRow.trendLabel}
                  </p>
                </div>
              </div>

              <div className="relative mt-5 overflow-hidden rounded-[28px] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-5 shadow-[0_18px_40px_rgba(14,165,233,0.12)] dark:border-sky-400/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-cyan-950/20">
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-400/20 blur-3xl" />
                <div className="absolute inset-y-5 left-0 w-1 rounded-r-full bg-gradient-to-b from-sky-500 to-cyan-400" />
                <p className="flex items-center gap-2 text-sm font-black text-brand-blue dark:text-blue-300">
                  <Target className="h-4 w-4" />
                  Main recommended focus
                </p>

                <p className="mt-3 text-sm font-semibold leading-6 text-brand-text dark:text-slate-200">
                  {responseDecisionSupport?.summary ||
                    selectedResponseRow.recommendedAction ||
                    'Continue monitoring this barangay using the latest validated forecast.'}
                </p>
              </div>

              <div className="relative mt-3 overflow-hidden rounded-[26px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 shadow-inner dark:border-white/10 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
                <div className="pointer-events-none absolute right-3 top-3 h-14 w-14 rounded-full border border-slate-200/80 dark:border-white/10" />
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                  Why it appears in this position
                </p>

                <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-300">
                  {selectedResponseRow.barangay} is ranked using its {String(selectedResponseRow.risk || 'current').toLowerCase()} risk level, {formatNumber(selectedResponseRow.forecast)} expected cases, {String(selectedResponseRow.trendLabel || 'stable').toLowerCase()} case trend, and {String(selectedResponseRow.environmentalSuitability || 'available weather context').toLowerCase()}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  navigate(
                    `/map?barangay=${encodeURIComponent(selectedResponseRow.barangay)}`
                  )
                }}
                className="group mt-5 flex w-full items-center justify-between gap-4 rounded-[24px] bg-slate-950 px-5 py-4 text-left text-white shadow-[0_18px_38px_rgba(15,23,42,0.20)] transition hover:-translate-y-0.5 hover:bg-brand-blue hover:shadow-[0_22px_46px_rgba(37,95,143,0.24)] dark:bg-white dark:text-slate-950 dark:hover:bg-blue-300"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 dark:bg-slate-950 dark:text-white dark:ring-slate-900">
                    <MapPin className="h-5 w-5" />
                  </span>

                  <span className="min-w-0">
                    <span className="block text-sm font-black">
                      View full response on Map
                    </span>
                    <span className="mt-1 block text-xs font-semibold leading-5 text-white/70 dark:text-slate-600">
                      Opens {selectedResponseRow.barangay} with its complete response plan and geographic context.
                    </span>
                  </span>
                </span>

                <ArrowUpRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </>
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              Upload and validate dengue records to generate a barangay forecast summary.
            </div>
          )}
        </PremiumPanel>
      </div>

      <style>{`
        .forecast-premium-hero {
          isolation: isolate;
        }

        .forecast-premium-hero::after {
          content: '';
          pointer-events: none;
          position: absolute;
          inset: 0;
          border-radius: inherit;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(56,189,248,0.08);
        }

        .forecast-premium-hero > .relative.z-10 {
          position: relative;
          z-index: 10;
        }

        @media (min-width: 1280px) {
          .forecast-premium-hero {
            min-height: 510px;
          }
        }


        .forecast-searchable-menu {
          transform-origin: top center;
          animation: forecast-dropdown-enter 160ms ease-out;
        }

        .forecast-custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(37, 95, 143, 0.62) rgba(226, 232, 240, 0.72);
        }

        .forecast-custom-scrollbar::-webkit-scrollbar {
          width: 9px;
        }

        .forecast-custom-scrollbar::-webkit-scrollbar-track {
          margin-block: 0.45rem;
          border-radius: 999px;
          background: rgba(226, 232, 240, 0.72);
        }

        .forecast-custom-scrollbar::-webkit-scrollbar-thumb {
          min-height: 38px;
          border: 2px solid transparent;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(37, 95, 143, 0.82), rgba(14, 165, 233, 0.72));
          background-clip: padding-box;
        }

        .forecast-custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(30, 64, 175, 0.92), rgba(2, 132, 199, 0.88));
          background-clip: padding-box;
        }

        .dark .forecast-custom-scrollbar {
          scrollbar-color: rgba(96, 165, 250, 0.72) rgba(30, 41, 59, 0.88);
        }

        .dark .forecast-custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.88);
        }

        .dark .forecast-custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(96, 165, 250, 0.82), rgba(34, 211, 238, 0.72));
          background-clip: padding-box;
        }

        @keyframes forecast-dropdown-enter {
          from {
            opacity: 0;
            transform: translateY(-6px) scale(0.985);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .legendary-model-card {
          isolation: isolate;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.08),
            0 22px 60px rgba(15, 23, 42, 0.18),
            0 0 36px rgba(34, 211, 238, 0.22);
        }

        .legendary-model-card::before {
          content: '';
          pointer-events: none;
          position: absolute;
          inset: -2px;
          z-index: 0;
          border-radius: inherit;
          opacity: 0.78;
          animation: dengue-legendary-card-pulse 2.8s ease-in-out infinite;
        }

        .legendary-model-card::after {
          content: '';
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          background: linear-gradient(115deg, transparent 0%, transparent 32%, rgba(255, 255, 255, 0.24) 45%, transparent 58%, transparent 100%);
          transform: translateX(-115%);
          animation: dengue-legendary-card-shine 4.4s ease-in-out infinite;
        }

        .legendary-model-card > * {
          position: relative;
          z-index: 1;
        }

        .legendary-model-card .h-12.w-12 {
          filter: saturate(1.2) contrast(1.08);
        }

        @media (min-width: 1280px) {
          .model-board-card {
            order: var(--model-board-order);
          }
        }

        .legendary-model-card-rank-1 {
          box-shadow:
            0 0 0 1px rgba(110, 231, 183, 0.34),
            0 0 32px rgba(45, 212, 191, 0.36),
            0 0 72px rgba(34, 211, 238, 0.22),
            0 26px 68px rgba(15, 23, 42, 0.20);
        }

        .legendary-model-card-rank-1::before {
          background:
            radial-gradient(circle at 14% 18%, rgba(250, 204, 21, 0.30), transparent 22%),
            radial-gradient(circle at 86% 10%, rgba(34, 211, 238, 0.28), transparent 28%),
            radial-gradient(circle at 50% 110%, rgba(16, 185, 129, 0.28), transparent 34%);
        }

        .legendary-model-card-rank-2 {
          box-shadow:
            0 0 0 1px rgba(125, 211, 252, 0.34),
            0 0 30px rgba(56, 189, 248, 0.34),
            0 0 68px rgba(99, 102, 241, 0.22),
            0 26px 68px rgba(15, 23, 42, 0.18);
        }

        .legendary-model-card-rank-2::before {
          background:
            radial-gradient(circle at 15% 15%, rgba(125, 211, 252, 0.30), transparent 24%),
            radial-gradient(circle at 88% 12%, rgba(129, 140, 248, 0.24), transparent 30%),
            radial-gradient(circle at 50% 112%, rgba(14, 165, 233, 0.24), transparent 34%);
        }

        .legendary-model-card-rank-3 {
          box-shadow:
            0 0 0 1px rgba(251, 191, 36, 0.34),
            0 0 32px rgba(251, 146, 60, 0.34),
            0 0 68px rgba(245, 158, 11, 0.22),
            0 26px 68px rgba(15, 23, 42, 0.18);
        }

        .legendary-model-card-rank-3::before {
          background:
            radial-gradient(circle at 14% 18%, rgba(252, 211, 77, 0.34), transparent 24%),
            radial-gradient(circle at 88% 14%, rgba(251, 113, 133, 0.22), transparent 30%),
            radial-gradient(circle at 50% 112%, rgba(249, 115, 22, 0.24), transparent 34%);
        }

        @keyframes dengue-legendary-card-pulse {
          0%, 100% {
            opacity: 0.55;
            filter: saturate(1);
          }

          50% {
            opacity: 0.95;
            filter: saturate(1.35);
          }
        }

        @keyframes dengue-legendary-card-shine {
          0%, 45% {
            transform: translateX(-115%);
          }

          72%, 100% {
            transform: translateX(115%);
          }
        }

        @media (max-width: 639px) {
          .forecast-premium-hero {
            min-height: 0 !important;
          }

          .forecast-premium-hero .mt-7.flex.flex-wrap {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 0.5rem !important;
          }

          .forecast-premium-hero .mt-7.flex.flex-wrap > button {
            min-height: 42px !important;
            padding: 0.55rem 0.65rem !important;
            font-size: 0.72rem !important;
          }

          .forecast-premium-hero .mt-9.grid {
            margin-top: 0.75rem !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .forecast-premium-hero .mt-9.grid > div {
            min-height: 84px !important;
            border-radius: 15px !important;
            padding: 0.55rem !important;
          }

          .forecast-premium-hero .mt-9.grid .h-9.w-9 {
            display: none !important;
          }

          .forecast-premium-hero .mt-9.grid p:nth-child(2) {
            margin-top: 0.3rem !important;
            font-size: 0.92rem !important;
            line-height: 1.02 !important;
            overflow-wrap: anywhere !important;
          }

          .forecast-premium-hero .mt-9.grid p:last-child {
            margin-top: 0.25rem !important;
            font-size: 0.66rem !important;
            line-height: 1.15 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .forecast-mobile-compact,
          .forecast-mobile-compact * {
            min-width: 0;
          }

          .forecast-mobile-compact {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            padding-bottom: 1.25rem !important;
          }

          .forecast-mobile-compact > .pointer-events-none.absolute {
            display: none !important;
          }

          .forecast-mobile-compact.space-y-6 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.82rem !important;
          }

          .forecast-mobile-compact section,
          .forecast-mobile-compact [id="machine-learning-controls"],
          .forecast-mobile-compact [id="multi-source-risk-factors"],
          .forecast-mobile-compact [id="forecast-model"],
          .forecast-mobile-compact [id="risk-summary"],
          .forecast-mobile-compact [id="top-barangays"] {
            max-width: 100% !important;
            overflow: hidden !important;
            border-radius: 22px !important;
            padding: 0.85rem !important;
          }

          .forecast-mobile-compact > section:first-of-type {
            border-radius: 22px !important;
            padding: 0.9rem !important;
            box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22) !important;
          }

          .forecast-mobile-compact > section:first-of-type .relative.grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.75rem !important;
          }

          .forecast-mobile-compact > section:first-of-type h1 {
            font-size: 1.55rem !important;
            line-height: 1.05 !important;
            letter-spacing: -0.045em !important;
          }

          .forecast-mobile-compact > section:first-of-type h1 + p {
            margin-top: 0.55rem !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
            font-size: 0.78rem !important;
            line-height: 1.35 !important;
          }

          .forecast-mobile-compact > section:first-of-type .mb-4.inline-flex,
          .forecast-mobile-compact .inline-flex.items-center.gap-2.rounded-full.border {
            padding: 0.32rem 0.58rem !important;
            font-size: 0.75rem !important;
            letter-spacing: 0.1em !important;
          }

          .forecast-mobile-compact > section:first-of-type .mt-6.grid {
            margin-top: 0.75rem !important;
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .forecast-mobile-compact > section:first-of-type .mt-6.grid > div {
            min-height: 76px !important;
            border-radius: 16px !important;
            padding: 0.6rem !important;
          }

          .forecast-mobile-compact > section:first-of-type .mt-6.grid p:first-child {
            font-size: 0.75rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.075em !important;
          }

          .forecast-mobile-compact > section:first-of-type .mt-6.grid p:nth-child(2) {
            margin-top: 0.35rem !important;
            font-size: 1.15rem !important;
            line-height: 1 !important;
          }

          .forecast-mobile-compact > section:first-of-type .mt-6.grid p:last-child {
            margin-top: 0.2rem !important;
            font-size: 0.75rem !important;
            line-height: 1.18 !important;
          }

          .forecast-mobile-compact > section:first-of-type .rounded-\[28px\] {
            border-radius: 18px !important;
            padding: 0.65rem !important;
          }

          .forecast-mobile-compact > section:first-of-type .rounded-\[28px\] .mt-3.grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.38rem !important;
          }

          .forecast-mobile-compact > section:first-of-type .rounded-\[28px\] button {
            min-height: 42px !important;
            border-radius: 13px !important;
            padding: 0.48rem !important;
            font-size: 0.75rem !important;
            line-height: 1.15 !important;
            justify-content: center !important;
            text-align: center !important;
            flex-direction: column !important;
            gap: 0.25rem !important;
          }

          .forecast-mobile-compact > section:first-of-type .rounded-\[28px\] button span:last-child {
            padding: 0.2rem 0.38rem !important;
            font-size: 0.75rem !important;
          }

          .forecast-mobile-compact > section:first-of-type .rounded-\[28px\] .mt-4.rounded-2xl {
            display: none !important;
          }

          .forecast-mobile-compact > .grid.gap-4.sm\:grid-cols-2.xl\:grid-cols-4 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
          }

          .forecast-mobile-compact .group.relative.overflow-hidden.rounded-\[28px\] {
            border-radius: 18px !important;
            padding: 0.68rem !important;
            min-height: 112px !important;
          }

          .forecast-mobile-compact .group.relative.overflow-hidden.rounded-\[28px\] .relative.flex {
            align-items: flex-start !important;
            gap: 0.5rem !important;
          }

          .forecast-mobile-compact .group.relative.overflow-hidden.rounded-\[28px\] p:first-child {
            font-size: 0.75rem !important;
            line-height: 1.12 !important;
            letter-spacing: 0.08em !important;
          }

          .forecast-mobile-compact .group.relative.overflow-hidden.rounded-\[28px\] h3 {
            margin-top: 0.45rem !important;
            font-size: 1.12rem !important;
            line-height: 1.05 !important;
            word-break: break-word !important;
          }

          .forecast-mobile-compact .group.relative.overflow-hidden.rounded-\[28px\] p:last-child {
            font-size: 0.75rem !important;
            line-height: 1.2 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .forecast-mobile-compact .group.relative.overflow-hidden.rounded-\[28px\] .h-12.w-12 {
            height: 1.9rem !important;
            width: 1.9rem !important;
            border-radius: 11px !important;
          }

          .forecast-mobile-compact .group.relative.overflow-hidden.rounded-\[28px\] svg {
            height: 0.9rem !important;
            width: 0.9rem !important;
          }

          .forecast-mobile-compact > .relative.overflow-hidden.rounded-\[28px\].border {
            border-radius: 18px !important;
            padding: 0.72rem !important;
          }

          .forecast-mobile-compact > .relative.overflow-hidden.rounded-\[28px\].border .h-11.w-11 {
            height: 2rem !important;
            width: 2rem !important;
            border-radius: 12px !important;
          }

          .forecast-mobile-compact > .relative.overflow-hidden.rounded-\[28px\].border p {
            font-size: 0.75rem !important;
            line-height: 1.32 !important;
          }

          .forecast-mobile-compact h2,
          .forecast-mobile-compact .text-2xl.font-black.tracking-tight {
            margin-top: 0.6rem !important;
            font-size: 1.08rem !important;
            line-height: 1.14 !important;
            letter-spacing: -0.035em !important;
          }

          .forecast-mobile-compact h3,
          .forecast-mobile-compact .text-3xl.font-black,
          .forecast-mobile-compact .sm\:text-4xl {
            font-size: 1.08rem !important;
            line-height: 1.12 !important;
            letter-spacing: -0.03em !important;
          }

          .forecast-mobile-compact p {
            font-size: 0.75rem !important;
            line-height: 1.32 !important;
          }

          .forecast-mobile-compact .mt-6 { margin-top: 0.9rem !important; }
          .forecast-mobile-compact .mt-5 { margin-top: 0.75rem !important; }
          .forecast-mobile-compact .mt-4 { margin-top: 0.6rem !important; }
          .forecast-mobile-compact .mt-3 { margin-top: 0.48rem !important; }
          .forecast-mobile-compact .gap-6 { gap: 0.8rem !important; }
          .forecast-mobile-compact .gap-5 { gap: 0.75rem !important; }
          .forecast-mobile-compact .gap-4 { gap: 0.6rem !important; }
          .forecast-mobile-compact .gap-3 { gap: 0.5rem !important; }

          .forecast-mobile-compact [id="machine-learning-controls"] > .mt-5.grid.gap-3.md\:grid-cols-2.xl\:grid-cols-6 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] > .mt-5.grid.gap-3.md\:grid-cols-2.xl\:grid-cols-6 > div {
            min-height: 72px !important;
            border-radius: 15px !important;
            padding: 0.52rem !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] > .mt-5.grid.gap-3.md\:grid-cols-2.xl\:grid-cols-6 p:first-of-type {
            font-size: 0.75rem !important;
            letter-spacing: 0.07em !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] > .mt-5.grid.gap-3.md\:grid-cols-2.xl\:grid-cols-6 p:nth-of-type(2) {
            font-size: 0.84rem !important;
            line-height: 1.05 !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] > .mt-5.grid.gap-3.md\:grid-cols-2.xl\:grid-cols-6 p:nth-of-type(3) {
            font-size: 0.75rem !important;
            line-height: 1.14 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] .relative.overflow-hidden.rounded-\[32px\] {
            border-radius: 18px !important;
            padding: 0.7rem !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] .h-28.w-28 {
            height: 4.4rem !important;
            width: 4.4rem !important;
            border-radius: 18px !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] .relative.flex.flex-col.gap-5.lg\:flex-row {
            gap: 0.7rem !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] .flex.items-start.gap-4 {
            gap: 0.6rem !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] .grid.min-w-\[220px\] {
            min-width: 0 !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] .grid.min-w-\[220px\] > div {
            border-radius: 14px !important;
            padding: 0.55rem !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] .grid.min-w-\[220px\] p:nth-child(2) {
            font-size: 1.05rem !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] .relative.mt-5.grid.gap-2 > div {
            padding: 0.48rem 0.55rem !important;
            border-radius: 13px !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] button.relative.mt-5 {
            min-height: 42px !important;
            border-radius: 16px !important;
            padding: 0.65rem 0.8rem !important;
            font-size: 0.76rem !important;
          }

          .forecast-mobile-compact [id="machine-learning-controls"] .mt-5.space-y-5 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.75rem !important;
          }

          .forecast-mobile-compact .mt-5.grid.gap-4.xl\:grid-cols-2 {
            gap: 0.6rem !important;
          }

          .forecast-mobile-compact .mt-5.grid.gap-4.xl\:grid-cols-2 > div {
            border-radius: 18px !important;
          }

          .forecast-mobile-compact .mt-5.grid.gap-4.xl\:grid-cols-2 > div > button {
            padding: 0.65rem !important;
          }

          .forecast-mobile-compact .mt-5.grid.gap-4.xl\:grid-cols-2 img.h-32.w-32 {
            height: 3.6rem !important;
            width: 3.6rem !important;
          }

          .forecast-mobile-compact .mt-5.grid.gap-4.xl\:grid-cols-2 .h-12.w-12 {
            height: 2rem !important;
            width: 2rem !important;
            border-radius: 12px !important;
          }

          .forecast-mobile-compact .mt-5.grid.gap-4.xl\:grid-cols-2 .grid.grid-cols-3.gap-2 {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.35rem !important;
            min-width: 0 !important;
          }

          .forecast-mobile-compact .mt-5.grid.gap-4.xl\:grid-cols-2 .grid.grid-cols-3.gap-2 > div {
            border-radius: 12px !important;
            padding: 0.42rem !important;
          }

          .forecast-mobile-compact .border-t.border-white\/70.bg-white\/70.p-4 {
            padding: 0.62rem !important;
          }

          .forecast-mobile-compact .border-t .grid.gap-3.sm\:grid-cols-2.lg\:grid-cols-4 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .forecast-mobile-compact .border-t .grid.gap-3.sm\:grid-cols-2.lg\:grid-cols-4 > div,
          .forecast-mobile-compact .border-t .rounded-\[24px\] {
            border-radius: 15px !important;
            padding: 0.55rem !important;
          }

          .forecast-mobile-compact .rounded-\[32px\].border.border-slate-200\/80.bg-gradient-to-br .mt-5.grid.gap-3.md\:grid-cols-5 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .forecast-mobile-compact .rounded-\[32px\].border.border-slate-200\/80.bg-gradient-to-br .mt-5.grid.gap-3.md\:grid-cols-5 > div {
            min-height: 92px !important;
            border-radius: 15px !important;
            padding: 0.6rem !important;
          }

          .forecast-mobile-compact [id="multi-source-risk-factors"] .mt-5.grid.gap-3.md\:grid-cols-2.xl\:grid-cols-4,
          .forecast-mobile-compact [id="forecast-model"] .mt-5.grid.gap-3.md\:grid-cols-2.xl\:grid-cols-4 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .forecast-mobile-compact [id="multi-source-risk-factors"] .mt-4.grid.gap-2.sm\:grid-cols-2.lg\:grid-cols-3 {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.4rem !important;
          }

          .forecast-mobile-compact [id="multi-source-risk-factors"] .mt-4.grid.gap-2.sm\:grid-cols-2.lg\:grid-cols-3 > div {
            min-height: 70px !important;
            border-radius: 13px !important;
            padding: 0.5rem !important;
          }

          .forecast-mobile-compact [id="forecast-model"] .h-\[300px\] {
            height: 220px !important;
          }

          .forecast-mobile-compact [id="forecast-model"] .overflow-hidden.rounded-\[30px\] {
            border-radius: 18px !important;
            padding: 0.65rem !important;
          }

          .forecast-mobile-compact [id="forecast-model"] .mt-5.grid.gap-3.xl\:grid-cols-\[minmax\(0\,1fr\)_260px\] {
            gap: 0.5rem !important;
          }

          .forecast-mobile-compact [id="forecast-model"] .mt-5.grid.gap-3.xl\:grid-cols-\[minmax\(0\,1fr\)_260px\] .grid.gap-3.sm\:grid-cols-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .forecast-mobile-compact [id="forecast-model"] .relative.flex.min-h-\[96px\] {
            min-height: 78px !important;
            border-radius: 16px !important;
            padding: 0.6rem !important;
          }

          .forecast-mobile-compact [id="risk-summary"] .mt-5.space-y-4 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.55rem !important;
          }

          .forecast-mobile-compact [id="risk-summary"] .rounded-\[26px\] {
            border-radius: 16px !important;
            padding: 0.65rem !important;
          }

          .forecast-mobile-compact [id="risk-summary"] .h-11.w-11 {
            height: 2rem !important;
            width: 2rem !important;
            border-radius: 12px !important;
          }

          .forecast-mobile-compact [id="risk-summary"] .mt-4.h-3\.5 {
            height: 0.45rem !important;
            margin-top: 0.55rem !important;
          }

          .forecast-mobile-compact [id="top-barangays"] .mt-5.space-y-3 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.55rem !important;
          }

          .forecast-mobile-compact [id="top-barangays"] .group.rounded-\[26px\] {
            border-radius: 16px !important;
            padding: 0.65rem !important;
          }

          .forecast-mobile-compact [id="top-barangays"] .h-12.w-12 {
            height: 2rem !important;
            width: 2rem !important;
            border-radius: 12px !important;
            font-size: 0.75rem !important;
          }

          .forecast-mobile-compact [id="top-barangays"] .mt-4.grid.gap-2.sm\:grid-cols-2.xl\:grid-cols-4 {
            margin-top: 0.55rem !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.4rem !important;
          }

          .forecast-mobile-compact [id="top-barangays"] .mt-4.grid.gap-2.sm\:grid-cols-2.xl\:grid-cols-4 > div,
          .forecast-mobile-compact [id="top-barangays"] .mt-4.grid.gap-2.sm\:grid-cols-3 > div,
          .forecast-mobile-compact [id="top-barangays"] .mt-4.grid.gap-2.sm\:grid-cols-3 > span {
            border-radius: 12px !important;
            padding: 0.48rem !important;
          }

          .forecast-mobile-compact [id="top-barangays"] .mt-4.grid.gap-2.sm\:grid-cols-3 {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.35rem !important;
          }

          .forecast-mobile-compact [id="top-barangays"] .mt-4.rounded-\[22px\] {
            border-radius: 15px !important;
            padding: 0.6rem !important;
          }

          .forecast-mobile-compact [id="top-barangays"] .flex.flex-wrap.items-center.gap-2 span,
          .forecast-mobile-compact [id="top-barangays"] button.inline-flex {
            font-size: 0.75rem !important;
            padding: 0.38rem 0.55rem !important;
          }

          .forecast-mobile-compact .xl\:sticky {
            position: static !important;
          }

          .forecast-mobile-compact .grid.gap-6.xl\:grid-cols-\[minmax\(0\,1\.24fr\)_minmax\(360px\,0\.76fr\)\],
          .forecast-mobile-compact .grid.gap-6.xl\:grid-cols-\[minmax\(0\,0\.94fr\)_minmax\(380px\,1\.06fr\)\] {
            gap: 0.82rem !important;
          }

          .forecast-mobile-compact .grid.gap-3.md\:grid-cols-3.xl\:grid-cols-1 {
            grid-template-columns: 1fr !important;
            gap: 0.5rem !important;
          }

          .forecast-mobile-compact .grid.gap-3.md\:grid-cols-3.xl\:grid-cols-1 > div,
          .forecast-mobile-compact .rounded-\[28px\].border.border-amber-100 {
            border-radius: 16px !important;
            padding: 0.65rem !important;
          }

          .forecast-mobile-compact .rounded-\[20px\] {
            border-radius: 13px !important;
          }

          .forecast-mobile-compact .px-4.py-3,
          .forecast-mobile-compact .px-4.py-3\.5,
          .forecast-mobile-compact .px-5.py-4,
          .forecast-mobile-compact .p-4,
          .forecast-mobile-compact .p-5 {
            padding: 0.65rem !important;
          }

          .forecast-mobile-compact .text-xl { font-size: 0.98rem !important; line-height: 1.12 !important; }
          .forecast-mobile-compact .text-lg { font-size: 0.9rem !important; line-height: 1.12 !important; }
          .forecast-mobile-compact .text-base { font-size: 0.82rem !important; line-height: 1.18 !important; }
          .forecast-mobile-compact .text-sm { font-size: 0.875rem !important; line-height: 1.3 !important; }
          .forecast-mobile-compact .text-xs { font-size: 0.75rem !important; line-height: 1.25 !important; }
          .forecast-mobile-compact .text-\[11px\] { font-size: 0.75rem !important; line-height: 1.12 !important; }
          .forecast-mobile-compact .text-\[10px\] { font-size: 0.75rem !important; line-height: 1.12 !important; }


          .forecast-mobile-compact .mobile-field-grid-4 {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.48rem !important;
          }

          .forecast-mobile-compact .mobile-field-grid-6 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.4rem !important;
          }

          .forecast-mobile-compact .mobile-field-grid-4 > *,
          .forecast-mobile-compact .mobile-field-grid-6 > * {
            min-width: 0 !important;
            max-width: 100% !important;
            overflow: hidden !important;
          }

          .forecast-mobile-compact .mobile-field-grid-4 > div,
          .forecast-mobile-compact .mobile-field-grid-4 > section,
          .forecast-mobile-compact .mobile-field-grid-6 > div,
          .forecast-mobile-compact .mobile-field-grid-6 > section {
            border-radius: 14px !important;
            padding: 0.5rem !important;
            min-height: 68px !important;
          }

          .forecast-mobile-compact .mobile-field-grid-4 p,
          .forecast-mobile-compact .mobile-field-grid-6 p,
          .forecast-mobile-compact .mobile-field-grid-4 span,
          .forecast-mobile-compact .mobile-field-grid-6 span {
            overflow-wrap: anywhere !important;
          }

          .forecast-mobile-compact .mobile-field-grid-4 h3,
          .forecast-mobile-compact .mobile-field-grid-4 .text-2xl,
          .forecast-mobile-compact .mobile-field-grid-4 .text-xl {
            font-size: 1rem !important;
            line-height: 1.05 !important;
          }

          .forecast-mobile-compact .mobile-field-grid-6 h3,
          .forecast-mobile-compact .mobile-field-grid-6 .text-2xl,
          .forecast-mobile-compact .mobile-field-grid-6 .text-xl,
          .forecast-mobile-compact .mobile-field-grid-6 .text-sm {
            font-size: 0.75rem !important;
            line-height: 1.1 !important;
          }

          .forecast-mobile-compact .mobile-field-grid-6 p:first-child,
          .forecast-mobile-compact .mobile-field-grid-6 .text-\[11px\],
          .forecast-mobile-compact .mobile-field-grid-6 .text-\[10px\] {
            font-size: 0.75rem !important;
            letter-spacing: 0.055em !important;
            line-height: 1.1 !important;
          }

          .forecast-mobile-compact .mobile-field-grid-4 p:first-child,
          .forecast-mobile-compact .mobile-field-grid-4 .text-\[11px\],
          .forecast-mobile-compact .mobile-field-grid-4 .text-\[10px\] {
            font-size: 0.75rem !important;
            letter-spacing: 0.065em !important;
            line-height: 1.1 !important;
          }

          .forecast-mobile-compact .mobile-field-grid-4 p:last-child,
          .forecast-mobile-compact .mobile-field-grid-6 p:last-child {
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }


          .forecast-mobile-compact [id="forecast-model"] .forecast-3d-chart-wrap {
            height: 360px !important;
            min-height: 360px !important;
            max-height: 360px !important;
          }

          .forecast-mobile-compact [id="forecast-model"] .forecast-3d-chart-wrap svg {
            width: 100% !important;
            height: 100% !important;
            max-width: none !important;
            max-height: none !important;
            display: block !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.55rem !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid > div {
            min-width: 0 !important;
            border-radius: 15px !important;
            overflow: hidden !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid > div > button {
            padding: 0.5rem !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid > div > button > .flex {
            gap: 0.45rem !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid .flex.items-center.gap-4 {
            align-items: flex-start !important;
            gap: 0.45rem !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid .h-12.w-12 {
            width: 1.75rem !important;
            height: 1.75rem !important;
            border-radius: 10px !important;
            font-size: 0.75rem !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid img.h-32.w-32 {
            width: 2.5rem !important;
            height: 2.5rem !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid p.text-lg {
            font-size: 0.75rem !important;
            line-height: 1.08 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid .mt-2.flex.flex-wrap {
            display: none !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid .grid.grid-cols-3.gap-2 {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.25rem !important;
            min-width: 0 !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid .grid.grid-cols-3.gap-2 > div {
            border-radius: 9px !important;
            padding: 0.28rem !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid .grid.grid-cols-3.gap-2 p:first-child {
            font-size: 0.75rem !important;
            line-height: 1 !important;
            letter-spacing: 0.04em !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid .grid.grid-cols-3.gap-2 p:last-child {
            font-size: 0.75rem !important;
            line-height: 1.05 !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid .mt-4.flex.items-center.justify-end {
            margin-top: 0.35rem !important;
            justify-content: flex-start !important;
          }

          .forecast-mobile-compact .mobile-model-comparison-grid .border-t {
            grid-column: 1 / -1 !important;
          }


          .forecast-mobile-compact .truncate {
            max-width: 100% !important;
          }

          .forecast-mobile-compact [id="top-barangays"],
          .forecast-mobile-compact [id="recommended-actions"] {
            overflow: visible !important;
          }

          .forecast-mobile-compact .forecast-searchable-menu {
            border-radius: 18px !important;
          }

          .forecast-mobile-compact .forecast-custom-scrollbar {
            max-height: 13.5rem !important;
          }
        }
      `}</style>

    </div>
  )
}
