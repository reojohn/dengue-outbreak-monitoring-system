import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Gauge,
  Layers3,
  Map as MapIcon,
  MapPin,
  MapPinned,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Moon,
  Navigation,
  Radar,
  Satellite,
  ShieldAlert,
  Sun,
  TrendingUp,
  Users,
} from 'lucide-react'
import LeafletRiskMap from '../components/LeafletRiskMap'
import { useData } from '../context/DataContext'
import { computeDecisionSupport, riskStyles } from '../utils/analytics'

const mapStyleOptions = [
  {
    value: 'dark',
    label: 'Dark',
    icon: Moon,
    description: 'Dark map for dashboard viewing',
  },
  {
    value: 'light',
    label: 'Light',
    icon: Sun,
    description: 'Soft light map view',
  },
  {
    value: 'street',
    label: 'Street',
    icon: MapIcon,
    description: 'Street map with road and place labels',
  },
  {
    value: 'satellite',
    label: 'Satellite',
    icon: Satellite,
    description: 'Satellite imagery layer',
  },
]

function getGenericRecommendedAction(risk) {
  if (risk === 'High') {
    return 'Conduct source reduction, coordinate immediate cleanup, and issue a barangay-level dengue alert within 48 hours.'
  }

  if (risk === 'Moderate') {
    return 'Continue close weekly monitoring, strengthen preventive messaging, and inspect common mosquito breeding areas.'
  }

  if (risk === 'Low') {
    return 'Maintain routine monitoring, public advisories, and regular environmental sanitation activities.'
  }

  return 'Upload and validate dengue records first before generating a recommended barangay response.'
}

function getRiskLabel(risk) {
  if (!risk) return 'Pending risk data'
  return `${risk} risk`
}

function getLegendDescription(risk) {
  if (risk === 'High') return 'Immediate response'
  if (risk === 'Moderate') return 'Close monitoring'
  return 'Routine watch'
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

function formatOptionalNumber(value, suffix = '') {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return 'Not available'
  }

  return `${formatDecimal(number)}${suffix}`
}

function normalizeBarangayName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bpob\.?\b/gi, ' ')
    .replace(/\bbgy\.?\b/gi, ' ')
    .replace(/\bbarangay\b/gi, ' ')
    .replace(/\./g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
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
    'Unnamed barangay'
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


function getSelectedBarangayName(value) {
  if (!value) return ''

  if (typeof value === 'string') {
    return value
  }

  if (value?.type === 'Feature') {
    return getFeatureName(value)
  }

  if (value?.feature) {
    return getSelectedBarangayName(value.feature)
  }

  if (value?.target?.feature) {
    return getSelectedBarangayName(value.target.feature)
  }

  if (value?.layer?.feature) {
    return getSelectedBarangayName(value.layer.feature)
  }

  if (value?.properties) {
    return getFeatureName(value)
  }

  return (
    value.barangay ||
    value.name ||
    value.adm4_name ||
    value.adm4_ref_name ||
    value.barangay_name ||
    value.BARANGAY ||
    value.ADM4_EN ||
    value.label ||
    value.value ||
    ''
  )
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

function countBoundaryFeatures(boundaryRecords) {
  const geoJson = getBoundaryGeoJson(boundaryRecords)

  return geoJson?.features?.length || 0
}

function readNumber(source, keys = [], fallback = 0) {
  if (!source) return fallback

  for (const key of keys) {
    const value = Number(source[key])

    if (Number.isFinite(value)) {
      return value
    }
  }

  return fallback
}

function readPositiveNumber(source, keys = []) {
  if (!source) return 0

  for (const key of keys) {
    const value = Number(source[key])

    if (Number.isFinite(value) && value > 0) {
      return value
    }
  }

  return 0
}

function getRecordName(record) {
  if (!record) return ''

  return (
    record.barangay ||
    record.name ||
    record.adm4_name ||
    record.adm4_ref_name ||
    record.barangay_name ||
    record.BARANGAY ||
    ''
  )
}

function getPopulationRowForSelection(selected, feature, populationRecords = []) {
  const featureName = getFeatureName(feature)
  const referenceName = getFeatureReferenceName(feature)

  return (
    populationRecords.find((record) => {
      const recordName = getRecordName(record)

      return (
        namesMatch(recordName, selected) ||
        namesMatch(recordName, featureName) ||
        namesMatch(recordName, referenceName)
      )
    }) || null
  )
}

function getPopulationValue({ row, feature, populationRow }) {
  const props = feature?.properties || {}

  return (
    readPositiveNumber(row, [
      'population',
      'totalPopulation',
      'populationCount',
      'pop',
      'total_pop',
      'totalPop',
    ]) ||
    readPositiveNumber(populationRow, [
      'population',
      'totalPopulation',
      'populationCount',
      'pop',
      'total_pop',
      'totalPop',
    ]) ||
    readPositiveNumber(props, [
      'population',
      'totalPopulation',
      'populationCount',
      'pop',
      'total_pop',
      'totalPop',
      'POPULATION',
    ])
  )
}

function getAreaValue({ row, feature }) {
  const props = feature?.properties || {}

  return (
    readPositiveNumber(row, ['area_sqkm', 'areaSqKm', 'area', 'areaKm2']) ||
    readPositiveNumber(props, ['area_sqkm', 'areaSqKm', 'area', 'areaKm2'])
  )
}

function getTrendValues(row) {
  const candidates = [
    row?.history,
    row?.historicalTrend,
    row?.weeklyCases,
    row?.caseHistory,
    row?.casesByWeek,
    row?.series,
    row?.values,
  ]

  const array = candidates.find((item) => Array.isArray(item))

  if (!array) return []

  return array
    .map((item) => {
      if (typeof item === 'number') return item

      return Number(
        item?.cases ||
          item?.caseCount ||
          item?.value ||
          item?.total ||
          item?.count ||
          item?.dengueCases
      )
    })
    .filter((value) => Number.isFinite(value))
}

function getHistoricalTrend(row) {
  if (!row) return 'Pending dengue records'

  const directTrend =
    row.trend ||
    row.trendLabel ||
    row.trendStatus ||
    row.historicalTrendLabel

  if (directTrend && typeof directTrend === 'string') {
    return directTrend
  }

  const values = getTrendValues(row)

  if (values.length >= 2) {
    const first = values[0]
    const last = values[values.length - 1]
    const difference = last - first

    if (difference > 0) {
      return `Increasing (${formatNumber(first)} to ${formatNumber(last)})`
    }

    if (difference < 0) {
      return `Decreasing (${formatNumber(first)} to ${formatNumber(last)})`
    }

    return `Stable (${formatNumber(last)} cases)`
  }

  const previous = Number(row.previousCases || row.lastPeriodCases || row.previousTotal)
  const current = Number(row.totalCases || row.cases || row.currentCases)

  if (Number.isFinite(previous) && Number.isFinite(current) && previous > 0) {
    if (current > previous) return `Increasing (${formatNumber(previous)} to ${formatNumber(current)})`
    if (current < previous) return `Decreasing (${formatNumber(previous)} to ${formatNumber(current)})`
    return `Stable (${formatNumber(current)} cases)`
  }

  return 'Not available'
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

function getMapStatusStyle(hasRiskData, hasBoundaryData) {
  if (hasRiskData) {
    return 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  if (hasBoundaryData) {
    return 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
  }

  return 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
}

function getMapStatusLabel(hasRiskData, hasBoundaryData) {
  if (hasRiskData) return 'Risk data ready'
  if (hasBoundaryData) return 'Boundary layer ready'
  return 'Waiting for dataset'
}

function getDefaultPanelPosition() {
  if (typeof window === 'undefined') {
    return {
      x: 32,
      y: 120,
    }
  }

  return {
    x: Math.max(16, window.innerWidth - 460),
    y: 120,
  }
}

function clampPanelPosition(position) {
  if (typeof window === 'undefined') return position

  const panelWidth = Math.min(430, window.innerWidth - 24)
  const minX = 12
  const minY = 12
  const maxX = Math.max(minX, window.innerWidth - panelWidth - 12)
  const maxY = Math.max(minY, window.innerHeight - 96)

  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  }
}

function getClientPoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]

  return {
    clientX: touch?.clientX ?? event.clientX,
    clientY: touch?.clientY ?? event.clientY,
  }
}

function hasBackendForecastData(backendForecastResult) {
  return (
    Array.isArray(backendForecastResult?.forecast_results) &&
    backendForecastResult.forecast_results.length > 0
  )
}

function getBackendResponsePriority(risk) {
  if (risk === 'High') return 'Immediate Response'
  if (risk === 'Moderate') return 'Preventive Monitoring'
  if (risk === 'Low') return 'Routine Monitoring'
  return 'Pending Dataset'
}

function getBackendDecisionScore(row) {
  const risk = row.risk_level || 'Low'
  const riskScore = risk === 'High' ? 70 : risk === 'Moderate' ? 45 : 20
  const forecastScore = Math.min(Number(row.forecast_next_4_periods || 0), 100)
  const rankPenalty = Number(row.priority_rank || 0) > 0 ? Number(row.priority_rank || 0) : 0

  return Math.max(0, Math.round(riskScore + forecastScore - rankPenalty))
}

function buildBackendActionPlan({
  risk,
  forecast,
  forecastNextPeriod,
  recentAverage,
  previousAverage,
  trendLabel,
  recommendation,
}) {
  const actions = []
  const trendText = String(trendLabel || '').toLowerCase()
  const isIncreasing = trendText.includes('increasing')
  const isDecreasing = trendText.includes('decreasing')

  if (recommendation) {
    actions.push(recommendation)
  }

  if (risk === 'High') {
    actions.push(
      'Activate barangay-level dengue alert and coordinate response within 24 to 48 hours.',
      'Prioritize source reduction in households, drainage areas, water storage containers, and other mosquito breeding sites.',
      'Deploy BHWs for focused fever case checking, household advisories, and immediate reporting of new suspected dengue cases.',
      'Coordinate cleanup activities with barangay officials, sanitation personnel, and community volunteers.',
      'Review updated case reports after 7 days to determine if the response reduced case movement.'
    )
  } else if (risk === 'Moderate') {
    actions.push(
      'Place the barangay under intensified weekly monitoring to prevent escalation into high-risk status.',
      'Inspect common breeding areas such as stagnant water sites, canals, schools, and dense residential zones.',
      'Strengthen dengue prevention messaging through BHWs, purok leaders, barangay pages, and community announcements.',
      'Prepare targeted cleanup and IEC activities if the next reporting period continues to increase.',
      'Compare new dengue reports against the forecast output during the next weekly review.'
    )
  } else if (risk === 'Low') {
    actions.push(
      'Maintain routine dengue surveillance and regular environmental sanitation activities.',
      'Continue household reminders on removing stagnant water and seeking early consultation for fever symptoms.',
      'Check if new cases are clustered in a specific purok or household group before escalating the response.',
      'Keep barangay advisories active during rainy periods or when nearby barangays show higher risk.',
      'Reassess the barangay after the next reporting period.'
    )
  } else {
    actions.push(
      'Upload and validate dengue records before generating a full response action plan.',
      'Use boundary and population context as supporting information once case records are available.'
    )
  }

  if (isIncreasing) {
    actions.push(
      'Escalate surveillance because the recent trend indicates increasing case movement.'
    )
  }

  if (isDecreasing && risk !== 'Low') {
    actions.push(
      'Continue monitoring despite the decreasing trend because the barangay still has non-low risk classification.'
    )
  }

  if (forecast >= 100 || forecastNextPeriod >= 25) {
    actions.push(
      'Prioritize this barangay in the next CHO coordination meeting because projected case pressure is high.'
    )
  }

  if (recentAverage > previousAverage && previousAverage > 0) {
    actions.push(
      'Validate recent case reports because the recent average is higher than the previous baseline period.'
    )
  }

  return Array.from(new Set(actions.filter(Boolean))).slice(0, 8)
}

function buildBackendRationale({
  barangay,
  risk,
  forecast,
  forecastNextPeriod,
  recentAverage,
  previousAverage,
  historicalTotalCases,
  trendLabel,
  latestPeriod,
  recordCount,
}) {
  const rationale = [
    `Backend forecast classified ${barangay} as ${risk} risk.`,
    `Projected four-period cases: ${formatNumber(forecast)}.`,
    `Forecast for the next period: ${formatNumber(forecastNextPeriod)} cases.`,
    `Recent average cases: ${formatNumber(recentAverage)}.`,
    `Previous average cases: ${formatNumber(previousAverage)}.`,
    `Historical total cases: ${formatNumber(historicalTotalCases)}.`,
    `Recent trend direction: ${trendLabel || 'Not available'}.`,
  ]

  if (latestPeriod) {
    rationale.push(`Latest source period used by the backend: ${latestPeriod}.`)
  }

  if (recordCount > 0) {
    rationale.push(`${formatNumber(recordCount)} historical record${recordCount === 1 ? '' : 's'} were used for this barangay.`)
  }

  if (forecast >= 100) {
    rationale.push('The forecast is above the high-pressure threshold, so immediate operational planning is recommended.')
  }

  if (recentAverage > previousAverage && previousAverage > 0) {
    rationale.push('Recent average is higher than the previous average, indicating possible worsening case movement.')
  }

  if (recentAverage <= previousAverage && previousAverage > 0) {
    rationale.push('Recent average is not higher than the previous average, but risk classification and forecast output still require monitoring.')
  }

  return Array.from(new Set(rationale.filter(Boolean))).slice(0, 9)
}

function buildBackendRiskRows(backendForecastResult = null) {
  const backendRows = backendForecastResult?.forecast_results || []

  return backendRows
    .map((row) => {
      const barangay = row.barangay || 'Unspecified barangay'
      const risk = row.risk_level || 'Low'
      const forecast = Number(row.forecast_next_4_periods || 0)
      const forecastNextPeriod = Number(row.forecast_next_period || 0)
      const recentAverage = Number(row.recent_average_cases || 0)
      const previousAverage = Number(row.previous_average_cases || 0)
      const historicalTotalCases = Number(row.historical_total_cases || 0)
      const trendLabel = row.trend_direction || 'Stable'
      const responsePriority = getBackendResponsePriority(risk)
      const backendRecommendation = row.recommendation || getGenericRecommendedAction(risk)
      const backendDecisionScore = getBackendDecisionScore(row)
      const latestPeriod = row.latest_period || ''
      const recordCount = Number(row.record_count || 0)

      const series = [
        {
          period: 'Previous average',
          cases: previousAverage,
        },
        {
          period: 'Recent average',
          cases: recentAverage,
        },
        {
          period: 'Forecast next period',
          cases: forecastNextPeriod,
        },
      ]

      const history = series.map((item) => item.cases)

      const rowData = {
        barangay,
        risk,
        forecast,
        forecastedCases: forecast,
        predictedCases: forecast,

        totalCases: historicalTotalCases,
        cases: historicalTotalCases,
        currentCases: forecastNextPeriod,
        previousCases: previousAverage,

        recentAverage,
        previousAverage,
        trend: trendLabel,
        trendLabel,
        trendDirection: trendLabel,

        history,
        weeklyCases: history,
        caseHistory: series,
        series,
        periods: [latestPeriod || 'Latest period'],

        latestPeriod,
        recordCount,
      }

      const computedDecisionSupport = computeDecisionSupport(rowData)

      const actionPlan = buildBackendActionPlan({
        risk,
        forecast,
        forecastNextPeriod,
        recentAverage,
        previousAverage,
        trendLabel,
        recommendation: backendRecommendation || computedDecisionSupport.primaryAction,
      })

      const rationale = buildBackendRationale({
        barangay,
        risk,
        forecast,
        forecastNextPeriod,
        recentAverage,
        previousAverage,
        historicalTotalCases,
        trendLabel,
        latestPeriod,
        recordCount,
      })

      const decisionSupport = {
        ...computedDecisionSupport,
        summary:
          backendRecommendation ||
          computedDecisionSupport.summary ||
          getGenericRecommendedAction(risk),
        priority:
          computedDecisionSupport.priority ||
          responsePriority,
        actions: actionPlan,
        rationale,
        score: Math.max(
          Number(computedDecisionSupport.score || 0),
          Number(backendDecisionScore || 0)
        ),
        primaryAction: actionPlan[0] || backendRecommendation,
        trendDirection: trendLabel,
        forecastPressure:
          computedDecisionSupport.forecastPressure ||
          'Backend forecast pressure available',
      }

      return {
        ...rowData,

        recommendedAction: decisionSupport.summary,
        primaryAction: decisionSupport.primaryAction,
        recommendedActions: decisionSupport.actions,
        responsePriority: decisionSupport.priority,
        recommendationRationale: decisionSupport.rationale,
        decisionScore: decisionSupport.score,
        decisionSupport,

        backendPriorityRank: Number(row.priority_rank || 0),
      }
    })
    .sort((a, b) => {
      if (a.backendPriorityRank && b.backendPriorityRank) {
        return a.backendPriorityRank - b.backendPriorityRank
      }

      if (Number(b.decisionScore || 0) !== Number(a.decisionScore || 0)) {
        return Number(b.decisionScore || 0) - Number(a.decisionScore || 0)
      }

      return b.forecast - a.forecast
    })
}

function buildBackendPeriodCount(backendForecastResult = null) {
  const backendRows = backendForecastResult?.forecast_results || []

  if (!backendRows.length) return 0

  return 4
}

export default function MapPage() {
  const data = useData()

  const {
    riskRows = [],
    dashboardStats,
    sourceStatus,
    backendForecastResult = null,
    addActivityLog,
    boundaryRecords = [],
    loadMockDengueData,
    clearMockDengueData,
  } = data

  const populationRecords = useMemo(() => {
    const candidates = [
      data.populationRecords,
      data.populationRows,
      data.populationData,
      data.populationDataset,
    ]

    return candidates.find((candidate) => Array.isArray(candidate)) || []
  }, [
    data.populationRecords,
    data.populationRows,
    data.populationData,
    data.populationDataset,
  ])

  const usingBackendForecast = hasBackendForecastData(backendForecastResult)

  const backendRiskRows = useMemo(() => {
    return buildBackendRiskRows(backendForecastResult)
  }, [backendForecastResult])

  const displayRiskRows = usingBackendForecast ? backendRiskRows : riskRows
  const displayPeriodCount = usingBackendForecast
    ? buildBackendPeriodCount(backendForecastResult)
    : dashboardStats?.weeklyTotals?.length || 0

  const [selected, setSelected] = useState('')
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(false)
  const [selectedPanelPosition, setSelectedPanelPosition] = useState(() => getDefaultPanelPosition())
  const [dragState, setDragState] = useState(null)
  const [legendOpen, setLegendOpen] = useState(true)
  const [mapStyle, setMapStyle] = useState('dark')
  const [isMapExpanded, setIsMapExpanded] = useState(false)

  const boundaryGeoJson = useMemo(() => {
    return getBoundaryGeoJson(boundaryRecords)
  }, [boundaryRecords])

  const boundaryFeatures = useMemo(() => {
    return boundaryGeoJson?.features || []
  }, [boundaryGeoJson])

  const boundaryFeatureCount = countBoundaryFeatures(boundaryRecords)

  const hasRiskData = displayRiskRows.length > 0
  const hasBoundaryData =
    Number(sourceStatus?.boundary?.validCount || 0) > 0 ||
    boundaryFeatureCount > 0

  const canShowMap = hasRiskData || hasBoundaryData

  useEffect(() => {
    if (!dragState) return undefined

    function handleMove(event) {
      event.preventDefault()

      const { clientX, clientY } = getClientPoint(event)

      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return

      setSelectedPanelPosition(
        clampPanelPosition({
          x: clientX - dragState.offsetX,
          y: clientY - dragState.offsetY,
        })
      )
    }

    function handleEnd() {
      setDragState(null)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleEnd)
    window.addEventListener('touchcancel', handleEnd)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
      window.removeEventListener('touchcancel', handleEnd)
    }
  }, [dragState])

  useEffect(() => {
    function handleResize() {
      setSelectedPanelPosition((current) => clampPanelPosition(current))
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (displayRiskRows.length) {
      const riskExists = displayRiskRows.some((row) => namesMatch(row.barangay, selected))
      const boundaryExists = boundaryFeatures.some((feature) => {
        return (
          namesMatch(selected, getFeatureName(feature)) ||
          namesMatch(selected, getFeatureReferenceName(feature))
        )
      })

      if (!selected || (!riskExists && !boundaryExists)) {
        setSelected(displayRiskRows[0].barangay)
      }

      return
    }

    if (boundaryFeatures.length) {
      const boundaryExists = boundaryFeatures.some((feature) => {
        return (
          namesMatch(selected, getFeatureName(feature)) ||
          namesMatch(selected, getFeatureReferenceName(feature))
        )
      })

      if (!selected || !boundaryExists) {
        setSelected(getFeatureName(boundaryFeatures[0]))
      }

      return
    }

    if (selected) {
      setSelected('')
      setSelectedPanelOpen(false)
    }
  }, [displayRiskRows, selected, boundaryFeatures])

  const details = useMemo(() => {
    if (!hasRiskData || !selected) return null

    return displayRiskRows.find((row) => namesMatch(row.barangay, selected)) || null
  }, [displayRiskRows, selected, hasRiskData])

  const selectedBoundaryFeature = useMemo(() => {
    if (!selected || !boundaryFeatures.length) return null

    return (
      boundaryFeatures.find((feature) => {
        return (
          namesMatch(selected, getFeatureName(feature)) ||
          namesMatch(selected, getFeatureReferenceName(feature))
        )
      }) || null
    )
  }, [selected, boundaryFeatures])

  const selectedPopulationRow = useMemo(() => {
    return getPopulationRowForSelection(
      selected,
      selectedBoundaryFeature,
      populationRecords
    )
  }, [selected, selectedBoundaryFeature, populationRecords])

  const selectedLabel =
    details?.barangay ||
    selected ||
    (selectedBoundaryFeature ? getFeatureName(selectedBoundaryFeature) : 'No barangay selected')

  const selectedArea = getAreaValue({
    row: details,
    feature: selectedBoundaryFeature,
  })

  const selectedPopulation = getPopulationValue({
    row: details,
    feature: selectedBoundaryFeature,
    populationRow: selectedPopulationRow,
  })

  const selectedDensity =
    selectedPopulation > 0 && selectedArea > 0
      ? selectedPopulation / selectedArea
      : 0

  const selectedTrend = getHistoricalTrend(details)

  const selectedDecisionSupport = details?.decisionSupport || null

  const selectedRecommendation =
    selectedDecisionSupport?.summary ||
    details?.recommendedAction ||
    getGenericRecommendedAction(details?.risk)

  const selectedPriority =
    selectedDecisionSupport?.priority ||
    details?.responsePriority ||
    (details ? 'Standard Risk Response' : 'Pending Dataset')

  const selectedDecisionScore =
    details?.decisionScore ??
    selectedDecisionSupport?.score ??
    0

  const selectedActionPlan = useMemo(() => {
    const actions = Array.isArray(selectedDecisionSupport?.actions)
      ? selectedDecisionSupport.actions
      : Array.isArray(details?.recommendedActions)
        ? details.recommendedActions
        : selectedRecommendation
          ? [selectedRecommendation]
          : []

    if (actions.length >= 3) {
      return actions
    }

    if (!details) {
      return actions
    }

    return buildBackendActionPlan({
      risk: details.risk,
      forecast: Number(details.forecast || details.forecastedCases || details.predictedCases || 0),
      forecastNextPeriod: Number(details.currentCases || 0),
      recentAverage: Number(details.recentAverage || 0),
      previousAverage: Number(details.previousAverage || 0),
      trendLabel: details.trend || details.trendLabel || details.trendDirection,
      recommendation: selectedRecommendation,
    })
  }, [details, selectedDecisionSupport, selectedRecommendation])

  const selectedRationale = useMemo(() => {
    const rationale = Array.isArray(selectedDecisionSupport?.rationale)
      ? selectedDecisionSupport.rationale
      : Array.isArray(details?.recommendationRationale)
        ? details.recommendationRationale
        : []

    if (rationale.length >= 4) {
      return rationale
    }

    if (!details) {
      return rationale
    }

    return buildBackendRationale({
      barangay: details.barangay || selectedLabel,
      risk: details.risk,
      forecast: Number(details.forecast || details.forecastedCases || details.predictedCases || 0),
      forecastNextPeriod: Number(details.currentCases || 0),
      recentAverage: Number(details.recentAverage || 0),
      previousAverage: Number(details.previousAverage || 0),
      historicalTotalCases: Number(details.totalCases || details.cases || 0),
      trendLabel: details.trend || details.trendLabel || details.trendDirection,
      latestPeriod: details.latestPeriod,
      recordCount: Number(details.recordCount || 0),
    })
  }, [details, selectedDecisionSupport, selectedLabel])

  const summary = hasRiskData ? displayRiskRows.slice(0, 5) : []

  function openSelectedPanel() {
    setSelectedPanelPosition((current) => {
      if (selectedPanelOpen) return clampPanelPosition(current)

      return clampPanelPosition(getDefaultPanelPosition())
    })

    setSelectedPanelOpen(true)
  }

  function handleStartPanelDrag(event) {
    const target = event.target

    if (target?.closest?.('button, a, input, textarea, select')) return

    const { clientX, clientY } = getClientPoint(event)

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return

    setDragState({
      offsetX: clientX - selectedPanelPosition.x,
      offsetY: clientY - selectedPanelPosition.y,
    })
  }

  function handleSelectBarangay(value) {
    const name = getSelectedBarangayName(value)

    if (!name) return

    setSelected(name)
    openSelectedPanel()

    const selectedRow = displayRiskRows.find((row) => namesMatch(row.barangay, name))
    const selectedFeature = boundaryFeatures.find((feature) => {
      return (
        namesMatch(name, getFeatureName(feature)) ||
        namesMatch(name, getFeatureReferenceName(feature))
      )
    })

    addActivityLog?.(
      'Map barangay selected',
      `${name} was selected on the geospatial hotspot map. Current risk: ${selectedRow?.risk || (selectedFeature ? 'Boundary only' : 'No risk data')}.`
    )
  }

  const highRiskCount = displayRiskRows.filter((row) => row.risk === 'High').length
  const moderateRiskCount = displayRiskRows.filter((row) => row.risk === 'Moderate').length
  const lowRiskCount = displayRiskRows.filter((row) => row.risk === 'Low').length

  const legendItems = [
    {
      risk: 'High',
      count: highRiskCount,
      dot: 'bg-rose-500',
      badge: 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
      icon: ShieldAlert,
    },
    {
      risk: 'Moderate',
      count: moderateRiskCount,
      dot: 'bg-amber-500',
      badge: 'border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      icon: AlertTriangle,
    },
    {
      risk: 'Low',
      count: lowRiskCount,
      dot: 'bg-emerald-500',
      badge: 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      icon: CheckCircle2,
    },
  ]

  const activeMapStyle =
    mapStyleOptions.find((item) => item.value === mapStyle) || mapStyleOptions[0]

  const selectedMetrics = [
    {
      label: 'Total dengue cases',
      value: details
        ? `${formatNumber(readNumber(details, ['totalCases', 'cases', 'currentCases'], 0))} cases`
        : 'Pending dengue records',
      icon: Activity,
      tone: 'text-rose-500 bg-rose-50 border-rose-100 dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-500/20',
    },
    {
      label: 'Forecasted cases',
      value: details
        ? `${formatNumber(readNumber(details, ['forecast', 'forecastedCases', 'predictedCases'], 0))} cases`
        : 'Pending forecast',
      icon: BarChart3,
      tone: 'text-blue-500 bg-blue-50 border-blue-100 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-500/20',
    },
    {
      label: 'Historical trend',
      value: selectedTrend,
      icon: TrendingUp,
      tone: 'text-amber-500 bg-amber-50 border-amber-100 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/20',
    },
    {
      label: 'Risk level',
      value: details?.risk || 'Pending risk data',
      icon: ShieldAlert,
      tone: 'text-emerald-500 bg-emerald-50 border-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20',
    },
    {
      label: 'DSS priority',
      value: selectedPriority,
      icon: Navigation,
      tone: 'text-orange-500 bg-orange-50 border-orange-100 dark:text-orange-300 dark:bg-orange-500/10 dark:border-orange-500/20',
    },
    {
      label: 'Decision score',
      value: details ? `${formatNumber(selectedDecisionScore)} points` : 'Pending dataset',
      icon: Gauge,
      tone: 'text-indigo-500 bg-indigo-50 border-indigo-100 dark:text-indigo-300 dark:bg-indigo-500/10 dark:border-indigo-500/20',
    },
    {
      label: 'Area',
      value: formatOptionalNumber(selectedArea, ' sq km'),
      icon: MapIcon,
      tone: 'text-cyan-500 bg-cyan-50 border-cyan-100 dark:text-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-500/20',
    },
    {
      label: 'Population',
      value: formatOptionalNumber(selectedPopulation),
      icon: Users,
      tone: 'text-violet-500 bg-violet-50 border-violet-100 dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-500/20',
    },
    {
      label: 'Density',
      value: formatOptionalNumber(selectedDensity, ' people/sq km'),
      icon: Gauge,
      tone: 'text-teal-500 bg-teal-50 border-teal-100 dark:text-teal-300 dark:bg-teal-500/10 dark:border-teal-500/20',
    },
  ]

  function renderMapControls() {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          {mapStyleOptions.map((option) => {
            const Icon = option.icon
            const active = mapStyle === option.value

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMapStyle(option.value)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                  active
                    ? 'bg-brand-blue text-white shadow-sm dark:bg-blue-500'
                    : 'text-brand-muted hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
                title={option.description}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            )
          })}
        </div>

       <button
  type="button"
  onClick={() => setIsMapExpanded((current) => !current)}
  style={{
    backgroundColor: '#ffffff',
    color: '#0f172a',
    borderColor: 'rgba(255,255,255,0.45)',
  }}
  className="group inline-flex w-fit max-w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)]"
>
  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-blue text-white shadow-[0_8px_18px_rgba(37,95,143,0.22)]">
    {isMapExpanded ? (
      <Minimize2 className="h-4 w-4" />
    ) : (
      <Maximize2 className="h-4 w-4" />
    )}
  </div>

  <span
    style={{ color: '#0f172a' }}
    className="whitespace-nowrap text-xs font-black uppercase tracking-[0.12em]"
  >
    {isMapExpanded ? 'Compact map' : 'Expand map'}
  </span>

  <ArrowUpRight className="h-4 w-4 shrink-0 text-brand-blue transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
</button>

        <button
          type="button"
          onClick={() => loadMockDengueData?.()}
          className="inline-flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-green transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
        >
          Load mock data
        </button>

        <button
          type="button"
          onClick={() => clearMockDengueData?.()}
          className="inline-flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
        >
          Clear mock data
        </button>
      </div>
    )
  }

  const mapContent = (
    <div
      className={
        isMapExpanded
          ? 'h-[calc(100vh-190px)] min-h-[720px] max-h-[920px] overflow-hidden rounded-[30px] border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-blue-50 p-2 shadow-inner dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20'
          : 'h-[560px] overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-blue-50 p-2 shadow-inner dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20 sm:h-[680px] 2xl:h-[780px]'
      }
    >
      <div className="h-full overflow-hidden rounded-[22px] dark:[&_.leaflet-container]:bg-slate-950">
        {canShowMap ? (
          <LeafletRiskMap
            key={`${mapStyle}-${isMapExpanded ? 'expanded' : 'normal'}`}
            selected={selected}
            onSelect={handleSelectBarangay}
            onBarangaySelect={handleSelectBarangay}
            onFeatureSelect={handleSelectBarangay}
            onPolygonClick={handleSelectBarangay}
            rows={displayRiskRows}
            mapStyle={mapStyle}
            layoutKey={isMapExpanded ? 'expanded' : 'normal'}
            showDetailsPanel={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-white/80 p-8 text-center dark:border-slate-700 dark:bg-slate-950">
            <div>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-xl font-black text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
                GIS
              </div>

              <h4 className="mt-4 text-lg font-black text-brand-text dark:text-slate-100">
                No map layer available yet
              </h4>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-brand-muted dark:text-slate-400">
                Upload the Butuan barangay boundary GeoJSON first. After dengue records are validated, the map will color each barangay polygon by risk level.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative space-y-6 pb-10">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 rounded-full bg-blue-100/70 blur-3xl dark:bg-blue-500/10" />

      {selectedPanelOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          (
        <div
          className={`fixed z-[9999] w-[min(430px,calc(100vw-24px))] overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.30)] ring-1 ring-white/70 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 dark:ring-white/10 ${
            dragState ? 'select-none ring-2 ring-brand-blue/30' : ''
          }`}
          style={{
            left: `${selectedPanelPosition.x}px`,
            top: `${selectedPanelPosition.y}px`,
            zIndex: 99999,
          }}
        >
          <div
            role="button"
            tabIndex={0}
            onMouseDown={handleStartPanelDrag}
            onTouchStart={handleStartPanelDrag}
            className="flex cursor-move items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-blue-50 px-5 py-4 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900"
            title="Drag this panel"
          >
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <Crosshair className="h-3.5 w-3.5" />
                Selected area
              </div>

              <p className="mt-2 text-xs font-semibold text-brand-muted dark:text-slate-400">
                Drag this panel anywhere on the screen.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedPanelOpen(false)}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-brand-muted transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Close selected barangay panel"
            >
              ×
            </button>
          </div>

          <div className="max-h-[calc(100vh-170px)] overflow-y-auto p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-muted dark:text-slate-500">
              Selected barangay
            </p>

            <h3 className="mt-2 break-words text-3xl font-black tracking-tight text-brand-blue dark:text-blue-300">
              {selectedLabel}
            </h3>

            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getRiskBadgeStyle(details?.risk)}`}
              >
                {getRiskLabel(details?.risk)}
              </span>

              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getPriorityBadgeStyle(selectedPriority)}`}
              >
                {selectedPriority}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {selectedMetrics.map((metric) => {
                const Icon = metric.icon

                return (
                  <div
                    key={metric.label}
                    className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
                  >
                    <div
                      className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border ${metric.tone}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                      {metric.label}
                    </p>

                    <p className="mt-2 text-sm font-black leading-6 text-brand-text dark:text-slate-100">
                      {metric.value}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-950 dark:shadow-none">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-orange dark:text-amber-300">
                    Decision support recommendation
                  </p>

                  <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-400">
                    Based on forecast, trend, risk, population exposure, and density.
                  </p>
                </div>

                <span
                  className={`w-fit rounded-full border px-3 py-1 text-[11px] font-black ${getPriorityBadgeStyle(selectedPriority)}`}
                >
                  {selectedPriority}
                </span>
              </div>

              <p className="mt-3 text-sm font-semibold leading-6 text-brand-text dark:text-slate-200">
                {selectedRecommendation}
              </p>

              {selectedActionPlan.length > 0 && (
                <div className="mt-4 rounded-[20px] border border-white/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                    Action plan
                  </p>

                  <div className="mt-3 space-y-2">
                    {selectedActionPlan.slice(0, 8).map((action, index) => (
                      <div
                        key={`${action}-${index}`}
                        className="flex gap-2 text-sm leading-6 text-brand-text dark:text-slate-300"
                      >
                        <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                          {index + 1}
                        </span>

                        <span>{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRationale.length > 0 && (
                <div className="mt-3 rounded-[20px] border border-white/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                    Why this recommendation
                  </p>

                  <div className="mt-3 space-y-2">
                    {selectedRationale.slice(0, 8).map((reason, index) => (
                      <div
                        key={`${reason}-${index}`}
                        className="flex gap-2 text-xs leading-5 text-brand-muted dark:text-slate-400"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green dark:text-emerald-300" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-brand-muted dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <span className="font-black text-brand-text dark:text-slate-200">
                  Boundary:
                </span>{' '}
                {selectedBoundaryFeature ? 'Matched to uploaded polygon' : 'Not matched yet'}
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-brand-muted dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <span className="font-black text-brand-text dark:text-slate-200">
                  Population:
                </span>{' '}
                {selectedPopulationRow || selectedPopulation > 0
                  ? 'Available'
                  : 'Pending population data'}
              </div>
            </div>
          </div>
        </div>
        ),
        document.body
      )}

      <section className="relative overflow-hidden rounded-[36px] border border-slate-900/10 bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-900 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.22)] dark:border-slate-800 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_34%)]" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-stretch">
          <div className="flex flex-col justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/90 backdrop-blur">
                <Radar className="h-3.5 w-3.5" />
                Geospatial intelligence
              </div>

              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                Geospatial Hotspot Map
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/90 sm:text-base">
                {usingBackendForecast
                  ? 'Barangay-level hotspot monitoring generated from backend forecast output and uploaded boundary data.'
                  : 'Barangay-level hotspot monitoring generated from validated dengue records and uploaded boundary data.'}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
                  Source periods
                </p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">
                  {formatNumber(displayPeriodCount)}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  Historical or forecast periods
                </p>
              </div>

              <div className="rounded-[24px] border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
                  Mapped barangays
                </p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">
                  {formatNumber(hasRiskData ? displayRiskRows.length : boundaryFeatureCount)}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  Areas available for mapping
                </p>
              </div>

              <div className="rounded-[24px] border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
                  High-risk areas
                </p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">
                  {formatNumber(highRiskCount)}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  Barangays requiring attention
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/20 bg-white/15 p-5 shadow-[0_20px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/20 bg-white/20 text-white shadow-inner">
                <MapPinned className="h-7 w-7" strokeWidth={2.2} />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
                  Map status
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-white">
                  {getMapStatusLabel(hasRiskData, hasBoundaryData)}
                </h2>
                <p className="mt-1 text-sm leading-6 text-white/80">
                  Current base layer: {activeMapStyle.label}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/20 bg-black/10 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/70">
                Boundary source
              </p>

              <p className="mt-2 break-words text-sm font-bold leading-6 text-white">
                {sourceStatus?.boundary?.uploadedName || 'No boundary file uploaded yet'}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black text-white/80">
                  {formatNumber(boundaryFeatureCount || sourceStatus?.boundary?.validCount || 0)} features
                </span>

                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-black ${getMapStatusStyle(
                    hasRiskData,
                    hasBoundaryData
                  )}`}
                >
                  {getMapStatusLabel(hasRiskData, hasBoundaryData)}
                </span>
              </div>
            </div>

            <button
  type="button"
  onClick={() => setIsMapExpanded((current) => !current)}
  style={{
    backgroundColor: '#ffffff',
    color: '#0f172a',
    borderColor: 'rgba(255,255,255,0.45)',
  }}
  className="group mt-5 flex min-h-[82px] w-full items-center justify-between gap-4 rounded-[24px] border px-5 py-4 text-left shadow-[0_18px_38px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(15,23,42,0.22)]"
>
  <div className="flex min-w-0 items-center gap-3">
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-[0_12px_24px_rgba(37,95,143,0.24)]">
      {isMapExpanded ? (
        <Minimize2 className="h-5 w-5" />
      ) : (
        <Maximize2 className="h-5 w-5" />
      )}
    </div>

    <div className="min-w-0">
      <p
        style={{ color: '#0f172a' }}
        className="text-sm font-black leading-5"
      >
        {isMapExpanded ? 'Compact map view' : 'Expand map workspace'}
      </p>

      <p
        style={{ color: '#64748b' }}
        className="mt-1 text-xs font-semibold leading-5"
      >
        {isMapExpanded
          ? 'Return to split map and summary layout.'
          : 'Use more space for barangay polygon analysis.'}
      </p>
    </div>
  </div>

  <div
    style={{
      backgroundColor: '#f1f5f9',
      color: '#255f8f',
    }}
    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition group-hover:translate-x-0.5"
  >
    <ArrowUpRight className="h-4 w-4" />
  </div>
</button>
          </div>
        </div>
      </section>

      <div
        className={
          isMapExpanded
            ? 'grid gap-6'
            : 'grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.75fr)]'
        }
      >
        <div
          id="hotspot-map"
          className={
            isMapExpanded
              ? 'scroll-mt-28 rounded-[34px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_22px_60px_rgba(15,23,42,0.08)] ring-1 ring-white/70 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80 dark:ring-white/5 sm:p-4'
              : 'scroll-mt-28 rounded-[34px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_22px_60px_rgba(15,23,42,0.08)] ring-1 ring-white/70 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80 dark:ring-white/5 sm:p-5'
          }
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <MapPinned className="h-3.5 w-3.5" />
                Geospatial view
              </div>

              <h2 className="text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                Barangay hotspot map
              </h2>

              <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
                {usingBackendForecast
                  ? 'Boundary polygons are displayed from the uploaded GeoJSON. Risk colors now follow the backend forecast result.'
                  : 'Boundary polygons are displayed from the uploaded GeoJSON. Risk colors appear after dengue records are validated.'}
              </p>
            </div>

            <div
              className={`w-fit rounded-full border px-3 py-1.5 text-[11px] font-black ${getMapStatusStyle(
                hasRiskData,
                hasBoundaryData
              )}`}
            >
              {getMapStatusLabel(hasRiskData, hasBoundaryData)}
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 p-3 shadow-inner dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
            <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-500">
                  Hotspot monitoring layer
                </div>

                <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-500">
                  Current base layer: {activeMapStyle.label}
                </p>
              </div>

              <div className="flex flex-col gap-2 xl:items-end">
                <div className="flex flex-wrap gap-2">
                  <div className="w-fit rounded-full bg-white px-3 py-1 text-[11px] font-bold text-brand-muted shadow-sm dark:bg-slate-800 dark:text-slate-300 dark:shadow-none">
                    {hasBoundaryData ? 'Boundary layer available' : 'Boundary pending'}
                  </div>

                  <div className="w-fit rounded-full bg-white px-3 py-1 text-[11px] font-bold text-brand-muted shadow-sm dark:bg-slate-800 dark:text-slate-300 dark:shadow-none">
                    {hasRiskData ? 'Risk layer active' : 'Boundary-only view'}
                  </div>
                </div>

                {renderMapControls()}
              </div>
            </div>

            {mapContent}
          </div>

          <div className="mt-4 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <button
              type="button"
              onClick={() => setLegendOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">
                  Dengue Risk Legend
                </p>

                <p className="mt-0.5 text-xs text-brand-muted dark:text-slate-500">
                  Color guide for barangay-level dengue risk once data is available.
                </p>
              </div>

              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {legendOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </span>
            </button>

            {legendOpen && (
              <div className="grid gap-3 border-t border-slate-100 px-4 py-4 dark:border-slate-800 sm:grid-cols-3">
                {legendItems.map((item) => {
                  const Icon = item.icon

                  return (
                    <div
                      key={item.risk}
                      className="rounded-[20px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:shadow-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${item.dot}`} />

                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${item.badge}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {item.risk} Risk
                        </span>
                      </div>

                      <p className="mt-2 text-xs font-black text-brand-text dark:text-slate-100">
                        {getLegendDescription(item.risk)}
                      </p>

                      <p className="mt-1 text-xs text-brand-muted dark:text-slate-400">
                        {formatNumber(item.count)} barangay{item.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <p className="mt-3 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">
            {hasRiskData
              ? 'Click a barangay polygon on the map to open a draggable details panel outside the map.'
              : hasBoundaryData
                ? 'Boundary polygons are now visible. Upload or validate dengue records to color barangays by risk level.'
                : 'Map interaction will be enabled once barangay boundary and dengue records are uploaded.'}
          </p>

          <div className="mt-4 rounded-[24px] border border-amber-100 bg-amber-50/80 p-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10 dark:shadow-none">
            <p className="flex items-center gap-2 text-sm font-black text-brand-orange dark:text-amber-300">
              <Layers3 className="h-4 w-4" />
              Boundary data note
            </p>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {hasBoundaryData
                ? `Current boundary source: ${sourceStatus?.boundary?.uploadedName || 'Uploaded boundary file'}`
                : 'No official barangay boundary file has been uploaded yet. Upload the prepared Butuan GeoJSON boundary file to enable polygon mapping.'}
            </p>

            {hasBoundaryData && (
              <p className="mt-2 text-xs font-semibold text-brand-muted dark:text-slate-500">
                Loaded boundary features: {formatNumber(boundaryFeatureCount || sourceStatus?.boundary?.validCount || 0)}
              </p>
            )}
          </div>
        </div>

        <div
          className={
            isMapExpanded
              ? 'grid gap-5 lg:grid-cols-[0.75fr_1fr]'
              : 'space-y-5'
          }
        >
          <div className="rounded-[30px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-5 text-sm leading-6 text-brand-muted shadow-sm dark:border-blue-500/20 dark:from-blue-500/10 dark:via-slate-900 dark:to-slate-950 dark:text-slate-400 sm:p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-white text-brand-blue shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
              <Navigation className="h-5 w-5" />
            </div>

            <p className="mt-4 font-black text-brand-blue dark:text-blue-300">
              Draggable barangay panel
            </p>

            <p className="mt-1">
              Click a barangay on the map. A floating details panel will appear outside the map and can be dragged anywhere on the screen.
            </p>
          </div>

          <div className="rounded-[34px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] ring-1 ring-white/70 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80 dark:ring-white/5 sm:p-6">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <Navigation className="h-3.5 w-3.5" />
              Hotspot priority
            </div>

            <h2 className="text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Hotspot summary
            </h2>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {usingBackendForecast
                ? 'Top barangays are ranked using the backend forecast priority output.'
                : 'Top barangays will appear after risk scores are computed.'}
            </p>

            <div className="mt-5 space-y-3">
              {summary.length > 0 ? (
                summary.map((row, index) => (
                  <button
                    key={row.barangay}
                    type="button"
                    onClick={() => handleSelectBarangay(row.barangay)}
                    className={`group flex w-full flex-col gap-3 rounded-[24px] border px-4 py-3.5 text-left shadow-sm transition-all duration-200 sm:flex-row sm:items-center sm:justify-between ${
                      namesMatch(selected, row.barangay)
                        ? 'border-brand-blue bg-blue-50/80 ring-2 ring-brand-blue/15 dark:border-blue-500/40 dark:bg-blue-500/10 dark:ring-blue-500/20'
                        : 'border-slate-200 bg-gradient-to-r from-slate-50 to-white hover:-translate-y-0.5 hover:border-brand-blue/20 hover:shadow-md dark:border-slate-800 dark:from-slate-950 dark:to-slate-900 dark:hover:shadow-none'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-sm dark:bg-white dark:text-slate-950">
                        {index + 1}
                      </div>

                      <div>
                        <span className="font-black text-brand-text dark:text-slate-100">
                          {row.barangay}
                        </span>

                        <p className="text-xs font-semibold text-brand-muted dark:text-slate-400">
                          Forecast: {formatNumber(row.forecast)} cases
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-brand-muted dark:text-slate-500">
                          {row.responsePriority || row.decisionSupport?.priority || 'Decision pending'}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${getRiskBadgeStyle(row.risk)}`}
                    >
                      {row.risk}
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  {hasBoundaryData
                    ? 'Boundary layer is available. Upload dengue records to generate the hotspot summary.'
                    : 'No hotspot summary available yet. Upload dengue records and barangay boundaries first.'}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-[24px] border border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50 p-4 shadow-sm dark:border-blue-500/20 dark:from-blue-500/10 dark:to-slate-900 dark:shadow-none">
              <p className="flex items-center gap-2 text-sm font-black text-brand-blue dark:text-blue-300">
                <MapPinned className="h-4 w-4" />
                Map note
              </p>

              <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                {hasRiskData
                  ? usingBackendForecast
                    ? 'The hotspot map is using backend forecast rows, backend recommendations, and the uploaded barangay boundary polygons.'
                    : 'The hotspot map is using computed dengue risk rows, decision support outputs, and the uploaded barangay boundary polygons.'
                  : hasBoundaryData
                    ? 'The map is currently showing barangay boundary polygons only. Risk coloring and decision support will activate after dengue records are processed.'
                    : 'The hotspot map will become interactive after the system receives boundary data and computes barangay-level risk rows.'}
              </p>
            </div>

            <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
              <p className="flex items-center gap-2 text-sm font-black text-brand-text dark:text-slate-100">
                <Layers3 className="h-4 w-4 text-brand-blue dark:text-blue-300" />
                Boundary source
              </p>

              <p className="mt-1 break-words text-sm leading-6 text-brand-muted dark:text-slate-400">
                {sourceStatus?.boundary?.uploadedName || 'No boundary file uploaded yet'}
              </p>

              <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-500">
                Boundary features: {formatNumber(boundaryFeatureCount || sourceStatus?.boundary?.validCount || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}