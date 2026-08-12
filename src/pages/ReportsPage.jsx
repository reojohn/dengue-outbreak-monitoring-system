import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CloudRain,
  Database,
  Download,
  Droplets,
  FileSpreadsheet,
  FileText,
  Gauge,
  MapPin,
  Presentation,
  Printer,
  Send,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Users,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import pptxgen from 'pptxgenjs'
import { useData } from '../context/DataContext'
import { compareCanonicalBarangayPriority, computeDecisionSupport, computeMultiSourceRisk, riskStyles } from '../utils/analytics'
import { createBackendNotificationEvent, getFieldUpdate, saveGeneratedReport } from '../services/api'
import reportsHeroBackground from '../assets/reports.png'
import FieldUpdateReportCard from '../components/FieldUpdateReportCard'

const REPORT_TITLE = 'Four-Month Dengue Response Planning Report'
const REPORT_EXPORT_BASENAME = 'dengue-four-month-response-planning-report'

const exportFormats = [
  {
    id: 'pdf',
    label: 'PDF report',
    desc: 'Downloads a PDF response report',
    icon: FileText,
    style:
      'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
  },
  {
    id: 'excel',
    label: 'Excel workbook',
    desc: 'Downloads an XLSX workbook with response planning sheets',
    icon: FileSpreadsheet,
    style:
      'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  {
    id: 'powerpoint',
    label: 'PowerPoint deck',
    desc: 'Generates a designed briefing presentation',
    icon: Presentation,
    style:
      'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  },
  {
    id: 'print',
    label: 'Print view',
    desc: 'Opens a browser print-ready response report',
    icon: Printer,
    style:
      'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  },
]

const distributionItems = [
  {
    label: 'City Health Office',
    icon: Users,
  },
  {
    label: 'Barangay health workers',
    icon: ShieldAlert,
  },
  {
    label: 'Four-month forecast decision briefing',
    icon: ClipboardList,
  },
  {
    label: 'Map snapshot and action checklist',
    icon: MapPin,
  },
]

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readFirstDefined(source, keys = [], fallback = '') {
  if (!source) return fallback

  for (const key of keys) {
    const value = source[key]

    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return fallback
}

function readNestedLabel(value, fallback = 'Not available') {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (typeof value === 'object') {
    return value.label || value.name || fallback
  }

  return String(value)
}

function readOptionalNumber(source, keys = [], fallback = 0) {
  const value = readFirstDefined(source, keys, fallback)
  const number = Number(value)

  return Number.isFinite(number) ? number : fallback
}

function getCanonicalCombinedRiskScore(row = null) {
  if (!row) return 0

  const directFields = [
    'combined_risk_score',
    'combinedRiskScore',
    'multi_source_risk_score',
    'multiSourceRiskScore',
    'overall_risk_score',
    'overallRiskScore',
  ]

  for (const field of directFields) {
    const number = Number(row?.[field])

    if (Number.isFinite(number) && number > 0) {
      return number
    }
  }

  const decisionSupport = row?.decisionSupport || {}
  const fallbackValues = [
    decisionSupport.multiSourceRiskScore,
    decisionSupport.riskScore,
    row?.riskScore,
    row?.risk_score,
  ]

  for (const value of fallbackValues) {
    const number = Number(value)

    if (Number.isFinite(number) && number > 0) {
      return number
    }
  }

  return 0
}

function formatOptionalNumber(value, suffix = '') {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return 'Not available'
  }

  return `${formatNumber(number)}${suffix}`
}

function getCurrentDateTime() {
  return new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

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

function getDecisionSupport(row) {
  const decisionSupport = row?.decisionSupport || {}

  const summary =
    decisionSupport.summary ||
    row?.recommendedAction ||
    getGenericRecommendedAction(row?.risk)

  const priority =
    decisionSupport.priority ||
    row?.responsePriority ||
    (row ? 'Standard Risk Response' : 'Pending Dataset')

  const score =
    row?.decisionScore ??
    decisionSupport.score ??
    0

  const actions = Array.isArray(decisionSupport.actions)
    ? decisionSupport.actions
    : Array.isArray(row?.recommendedActions)
      ? row.recommendedActions
      : summary
        ? [summary]
        : []

  const rationale = Array.isArray(decisionSupport.rationale)
    ? decisionSupport.rationale
    : Array.isArray(row?.recommendationRationale)
      ? row.recommendationRationale
      : []

  return {
    priority,
    score,
    summary,
    primaryAction: decisionSupport.primaryAction || row?.primaryAction || actions[0] || summary,
    actions,
    rationale,
    trendDirection:
      decisionSupport.trendDirection ||
      row?.trendDirection ||
      row?.trend ||
      'Trend unavailable',
    densityLevel:
      decisionSupport.densityLevel ||
      row?.densityLevel ||
      'Density unavailable',
    populationExposure:
      decisionSupport.populationExposure ||
      row?.populationExposure ||
      'Population exposure unavailable',
    forecastPressure:
      decisionSupport.forecastPressure ||
      row?.forecastPressure ||
      'Forecast pressure unavailable',
    environmentalSuitability:
      readNestedLabel(decisionSupport.environmentalSuitability || row?.environmentalSuitability || row?.environmentalSuitabilityLabel, 'Environmental data unavailable'),
    environmentalScore:
      decisionSupport.environmentalScore ??
      row?.environmentalScore ??
      row?.environmentScore ??
      0,
    rainfallPressure:
      readNestedLabel(decisionSupport.rainfallPressure || row?.rainfallPressure || row?.rainfallPressureLabel, 'Rainfall pressure unavailable'),
    temperatureSuitability:
      readNestedLabel(decisionSupport.temperatureSuitability || row?.temperatureSuitability || row?.temperatureSuitabilityLabel, 'Temperature suitability unavailable'),
    humiditySuitability:
      readNestedLabel(decisionSupport.humiditySuitability || row?.humiditySuitability || row?.humiditySuitabilityLabel, 'Humidity suitability unavailable'),
    multiSourceRiskScore: getCanonicalCombinedRiskScore(row),
    riskComponents:
      decisionSupport.riskComponents ||
      row?.riskComponents ||
      row?.riskScoreBreakdown ||
      {},
  }
}

function getMultiSourceProfile(row = null) {
  const decision = getDecisionSupport(row)
  const score = Number(getCanonicalCombinedRiskScore(row))

  return {
    score: Number.isFinite(score) ? Math.round(score) : 0,
    environmentalSuitability: decision.environmentalSuitability,
    rainfallPressure: decision.rainfallPressure,
    temperatureSuitability: decision.temperatureSuitability,
    humiditySuitability: decision.humiditySuitability,
    forecastPressure: decision.forecastPressure,
    populationExposure: decision.populationExposure,
    densityLevel: decision.densityLevel,
    trendDirection: decision.trendDirection,
    averageRainfall: readOptionalNumber(row, ['averageRainfall', 'avgRainfall', 'rainfall', 'rainfallAverage'], 0),
    averageTemperature: readOptionalNumber(row, ['averageTemperature', 'avgTemperature', 'temperature', 'temperatureAverage'], 0),
    averageHumidity: readOptionalNumber(row, ['averageHumidity', 'avgHumidity', 'humidity', 'humidityAverage'], 0),
    population: readOptionalNumber(row, ['population', 'totalPopulation', 'populationCount'], 0),
    density: readOptionalNumber(row, ['density'], 0),
    components: decision.riskComponents || {},
  }
}

function getAverageMultiSourceScore(rows = []) {
  const scores = rows
    .map((row) => getMultiSourceProfile(row).score)
    .filter((score) => Number.isFinite(score) && score > 0)

  if (!scores.length) return 0

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}

function getRiskCounts(riskRows = []) {
  return {
    highRiskCount: riskRows.filter((row) => row.risk === 'High').length,
    moderateRiskCount: riskRows.filter((row) => row.risk === 'Moderate').length,
    lowRiskCount: riskRows.filter((row) => row.risk === 'Low').length,
  }
}

function getRiskSortValue(risk) {
  if (risk === 'High') return 3
  if (risk === 'Moderate') return 2
  if (risk === 'Low') return 1
  return 0
}

function getPrioritySortValue(priority) {
  const value = String(priority || '').toLowerCase()

  if (value.includes('immediate')) return 7
  if (value.includes('high priority')) return 6
  if (value.includes('escalated')) return 5
  if (value.includes('preventive')) return 4
  if (value.includes('monitoring')) return 3
  if (value.includes('early')) return 2
  if (value.includes('routine')) return 1

  return 0
}

function getDecisionCounts(riskRows = []) {
  return riskRows.reduce(
    (acc, row) => {
      const decision = getDecisionSupport(row)
      const priority = String(decision.priority || '').toLowerCase()

      if (
        priority.includes('immediate') ||
        priority.includes('high priority') ||
        priority.includes('escalated')
      ) {
        acc.urgent += 1
      } else if (priority.includes('preventive')) {
        acc.preventive += 1
      } else if (
        priority.includes('monitoring') ||
        priority.includes('early')
      ) {
        acc.watch += 1
      } else if (priority.includes('routine')) {
        acc.routine += 1
      } else {
        acc.pending += 1
      }

      return acc
    },
    {
      urgent: 0,
      preventive: 0,
      watch: 0,
      routine: 0,
      pending: 0,
    }
  )
}

function getPriorityDistribution(riskRows = []) {
  const priorityMap = new Map()

  riskRows.forEach((row) => {
    const decision = getDecisionSupport(row)
    const priority = decision.priority || 'Pending Dataset'

    priorityMap.set(priority, toNumber(priorityMap.get(priority)) + 1)
  })

  return Array.from(priorityMap.entries())
    .map(([priority, count]) => ({
      priority,
      count,
    }))
    .sort((a, b) => {
      const priorityDifference =
        getPrioritySortValue(b.priority) - getPrioritySortValue(a.priority)

      if (priorityDifference !== 0) return priorityDifference

      return b.count - a.count
    })
}

function getSortedRiskRows(riskRows = []) {
  return [...riskRows].sort(compareCanonicalBarangayPriority)
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

function getHotspotLevelLabel(level) {
  const value = String(level || '').trim()

  if (!value) return 'Not checked'
  if (value === 'Confirmed Hotspot') return 'Confirmed hotspot'
  if (value === 'Emerging Hotspot') return 'Emerging hotspot'
  if (value === 'Watch Area') return 'Watch area'
  if (value === 'Low Spatial Concern') return 'Low map concern'
  if (value === 'Needs Map Review') return 'Needs map name review'

  return value
}

function getHotspotBadgeStyle(level) {
  const value = String(level || '').toLowerCase()

  if (value.includes('confirmed')) {
    return 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
  }

  if (value.includes('emerging')) {
    return 'border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300'
  }

  if (value.includes('watch')) {
    return 'border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  if (value.includes('review')) {
    return 'border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
  }

  if (value.includes('low')) {
    return 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  return 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function formatHotspotScore(value) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return 'Not checked'
  }

  return `${Math.round(number)}/100`
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

function namesMatch(first, second) {
  const a = normalizeBarangayName(first)
  const b = normalizeBarangayName(second)
  const compactA = a.replace(/\s+/g, '')
  const compactB = b.replace(/\s+/g, '')

  if (!a || !b) return false
  if (a === b) return true
  if (compactA === compactB) return true
  if (a.length >= 4 && b.includes(a)) return true
  if (b.length >= 4 && a.includes(b)) return true

  return false
}

function strictBarangayNamesMatch(first, second) {
  const a = normalizeBarangayName(first)
  const b = normalizeBarangayName(second)

  if (!a || !b) return false

  return a === b || a.replace(/\s+/g, '') === b.replace(/\s+/g, '')
}

function isHotspotMapReviewRow(row = null) {
  return Boolean(
    row &&
      (row.hotspot_level === 'Needs Map Review' ||
        row.has_map_boundary === false ||
        row.spatial_influence_source === 'no_map_boundary')
  )
}

function hotspotMatchesRiskRow(hotspot = null, riskRow = null, strict = false) {
  if (!hotspot || !riskRow) return false

  const hotspotNames = [hotspot.barangay, hotspot.barangay_key].filter(Boolean)
  const riskNames = [riskRow.barangay, riskRow.barangayKey, riskRow.barangay_key].filter(Boolean)
  const matcher = strict ? strictBarangayNamesMatch : namesMatch

  return hotspotNames.some((hotspotName) => {
    return riskNames.some((riskName) => matcher(hotspotName, riskName))
  })
}

function chooseBestHotspotCandidate(candidates = [], riskRow = null) {
  if (!candidates.length) return null

  return [...candidates].sort((a, b) => {
    const boundaryDifference =
      Number(!isHotspotMapReviewRow(b.row)) - Number(!isHotspotMapReviewRow(a.row))

    if (boundaryDifference !== 0) return boundaryDifference

    const exactDifference = Number(b.strict) - Number(a.strict)

    if (exactDifference !== 0) return exactDifference

    const scoreDifference =
      Number(b.row?.hotspot_score || b.row?.base_risk_score || 0) -
      Number(a.row?.hotspot_score || a.row?.base_risk_score || 0)

    if (scoreDifference !== 0) return scoreDifference

    const aExactName = strictBarangayNamesMatch(a.row?.barangay, riskRow?.barangay)
    const bExactName = strictBarangayNamesMatch(b.row?.barangay, riskRow?.barangay)

    return Number(bExactName) - Number(aExactName)
  })[0]
}

function reconcileHotspotRows(hotspotRows = [], riskRows = []) {
  if (!Array.isArray(hotspotRows) || hotspotRows.length === 0) return []

  if (!Array.isArray(riskRows) || riskRows.length === 0) {
    const byName = new Map()

    hotspotRows.forEach((row) => {
      const key = normalizeBarangayName(row?.barangay || row?.barangay_key)

      if (!key) return

      const existing = byName.get(key)

      if (!existing) {
        byName.set(key, row)
        return
      }

      const existingReview = isHotspotMapReviewRow(existing)
      const currentReview = isHotspotMapReviewRow(row)

      if ((existingReview && !currentReview) || Number(row?.hotspot_score || 0) > Number(existing?.hotspot_score || 0)) {
        byName.set(key, row)
      }
    })

    return Array.from(byName.values())
  }

  const usedIndexes = new Set()

  return riskRows.map((riskRow) => {
    const strictCandidates = hotspotRows
      .map((row, index) => ({ row, index, strict: true }))
      .filter((candidate) => {
        return !usedIndexes.has(candidate.index) && hotspotMatchesRiskRow(candidate.row, riskRow, true)
      })

    const looseCandidates = strictCandidates.length
      ? []
      : hotspotRows
          .map((row, index) => ({ row, index, strict: false }))
          .filter((candidate) => {
            return !usedIndexes.has(candidate.index) && hotspotMatchesRiskRow(candidate.row, riskRow, false)
          })

    const selected = chooseBestHotspotCandidate(
      strictCandidates.length ? strictCandidates : looseCandidates,
      riskRow
    )

    if (!selected) {
      return {
        barangay: riskRow.barangay || 'Unknown barangay',
        barangay_key: riskRow.barangayKey || riskRow.barangay_key || '',
        hotspot_level: 'Not checked',
        hotspot_score: 0,
        neighbor_influence_score: 0,
        has_map_boundary: null,
        recommended_map_action: 'Hotspot result was not returned for this official barangay.',
      }
    }

    usedIndexes.add(selected.index)

    return {
      ...selected.row,
      barangay: riskRow.barangay || selected.row?.barangay || 'Unknown barangay',
      barangay_key:
        riskRow.barangayKey ||
        riskRow.barangay_key ||
        selected.row?.barangay_key ||
        '',
      forecast_risk: riskRow.risk || selected.row?.forecast_risk || '',
      forecast_cases: Number(riskRow.forecast || selected.row?.forecast_cases || 0),
    }
  })
}

function getFeatureName(feature) {
  const props = feature?.properties || {}

  return (
    props.adm4_name ||
    props.adm4_ref_name ||
    props.name ||
    props.Name ||
    props.NAME ||
    props.barangay ||
    props.barangayName ||
    props.barangay_name ||
    props.brgy ||
    props.brgy_name ||
    props.BARANGAY ||
    props.BRGY ||
    props.BRGY_NAME ||
    props.BGY_NAME ||
    props.BgyName ||
    props.ADM4_EN ||
    props.NAME_3 ||
    props.NAME_4 ||
    props.LOC_NAME ||
    props.LOCALITY ||
    props.MUNICIPALITY ||
    props.detected_barangay_name ||
    props.standardized_barangay ||
    'Unnamed barangay'
  )
}

function getFeatureReferenceName(feature) {
  const props = feature?.properties || {}

  return (
    props.adm4_ref_name ||
    props.adm4_name ||
    props.name ||
    props.Name ||
    props.NAME ||
    props.barangay ||
    props.barangayName ||
    props.barangay_name ||
    props.brgy ||
    props.brgy_name ||
    props.BARANGAY ||
    props.BRGY_NAME ||
    props.BgyName ||
    props.ADM4_EN ||
    props.NAME_3 ||
    props.NAME_4 ||
    props.detected_barangay_name ||
    props.standardized_barangay ||
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

function normalizeDataKey(key = '') {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function readValue(source, keys = [], fallback = undefined) {
  if (!source) return fallback

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key]
    }
  }

  const normalizedLookup = Object.keys(source).reduce((acc, key) => {
    acc[normalizeDataKey(key)] = source[key]
    return acc
  }, {})

  for (const key of keys) {
    const normalizedKey = normalizeDataKey(key)

    if (
      normalizedLookup[normalizedKey] !== undefined &&
      normalizedLookup[normalizedKey] !== null &&
      normalizedLookup[normalizedKey] !== ''
    ) {
      return normalizedLookup[normalizedKey]
    }
  }

  return fallback
}

function toFiniteNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback

  const cleaned = typeof value === 'string'
    ? value.replace(/,/g, '').replace(/%/g, '').trim()
    : value

  const number = Number(cleaned)

  return Number.isFinite(number) ? number : fallback
}

function readNumber(source, keys = [], fallback = 0) {
  return toFiniteNumber(readValue(source, keys), fallback)
}

function readPositiveNumber(source, keys = []) {
  const number = readNumber(source, keys, 0)

  return number > 0 ? number : 0
}

function readText(source, keys = [], fallback = '') {
  const value = readValue(source, keys)
  const text = String(value ?? '').trim()

  return text || fallback
}

function getOverallRiskScore(row) {
  return readNumber(row, [
    'multiSourceRiskScore',
    'multi_source_risk_score',
    'combinedRiskScore',
    'combined_risk_score',
    'overallRiskScore',
    'overall_risk_score',
    'riskScore',
    'risk_score',
  ], 0)
}

function getEnvironmentalSuitabilityValue(row) {
  return readText(row, [
    'environmentalSuitability',
    'environmental_suitability',
    'weatherCondition',
    'weather_condition',
    'environmentalLabel',
    'environmental_label',
  ])
}

function getRainfallPressureValue(row) {
  return readText(row, [
    'rainfallPressure',
    'rainfall_pressure',
    'rainfallRisk',
    'rainfall_risk',
  ])
}

function getTemperatureSuitabilityValue(row) {
  return readText(row, [
    'temperatureSuitability',
    'temperature_suitability',
    'temperatureCondition',
    'temperature_condition',
  ])
}

function getHumiditySuitabilityValue(row) {
  return readText(row, [
    'humiditySuitability',
    'humidity_suitability',
    'humidityCondition',
    'humidity_condition',
  ])
}

function getRecordName(record) {
  if (!record) return ''

  return readText(record, [
    'barangay',
    'barangayName',
    'barangay_name',
    'barangay_raw',
    'barangayRaw',
    'brgy',
    'brgy_name',
    'name',
    'adm4_name',
    'adm4_ref_name',
    'location',
    'area',
    'BgyName',
    'BRGY_NAME',
    'BARANGAY',
  ])
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
    readPositiveNumber(row, ['area_sqkm', 'areaSqKm', 'area_sq_km', 'area', 'areaKm2', 'boundary_area_sqkm', 'boundaryAreaSqKm']) ||
    readPositiveNumber(props, ['area_sqkm', 'areaSqKm', 'area_sq_km', 'area', 'areaKm2', 'boundary_area_sqkm', 'boundaryAreaSqKm'])
  )
}


function getBoundaryFeatureForBarangay(barangay, boundaryFeatures = []) {
  if (!barangay || !Array.isArray(boundaryFeatures) || !boundaryFeatures.length) {
    return null
  }

  return (
    boundaryFeatures.find((feature) => {
      return (
        namesMatch(barangay, getFeatureName(feature)) ||
        namesMatch(barangay, getFeatureReferenceName(feature))
      )
    }) || null
  )
}

function average(values = []) {
  const validValues = values
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value))

  if (!validValues.length) return 0

  return validValues.reduce((total, value) => total + value, 0) / validValues.length
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
  const directDate = readValue(record, [
    'date',
    'reportingDate',
    'reporting_date',
    'weatherDate',
    'weather_date',
    'observationDate',
    'observation_date',
    'recordDate',
    'record_date',
    'period',
  ])

  const parsedDirectDate = parseCoverageDate(directDate)

  if (parsedDirectDate) return parsedDirectDate

  const year = readNumber(record, ['year', 'weatherYear', 'weather_year'], 0)
  const month = readNumber(record, ['month', 'weatherMonth', 'weather_month'], 0)
  const day = readNumber(record, ['day', 'dateDay', 'weatherDay', 'weather_day'], 1)
  const dayOfYear = readNumber(record, ['dayOfYear', 'day_of_year', 'doy', 'julianDay', 'julian_day'], 0)

  if (year > 0 && dayOfYear > 0) {
    const date = new Date(Date.UTC(year, 0, dayOfYear))
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (year > 0 && month > 0) {
    const date = new Date(Date.UTC(year, month - 1, day > 0 ? day : 1))
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
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
        'precipAmount',
        'precip_amount',
      ]),
      temperature: getWeatherNumber(record, [
        'temperature',
        'temperature_c',
        'temperatureC',
        'temp',
        'temp_c',
        'air_temperature',
        'airTemperature',
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
    .map((period) => parseCoverageDate(period.period || period))
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

function getHotspotForBarangay(row = null, hotspotRows = []) {
  if (!row || !Array.isArray(hotspotRows)) return null

  return (
    hotspotRows.find((hotspot) => {
      return (
        namesMatch(hotspot.barangay, row.barangay) ||
        namesMatch(hotspot.barangay_key, row.barangay) ||
        namesMatch(hotspot.barangay, row.barangay_key)
      )
    }) || null
  )
}

function getHotspotCounts(hotspotRows = []) {
  return hotspotRows.reduce(
    (acc, row) => {
      const level = row.hotspot_level || 'Not checked'

      if (level === 'Confirmed Hotspot') acc.confirmed += 1
      else if (level === 'Emerging Hotspot') acc.emerging += 1
      else if (level === 'Watch Area') acc.watch += 1
      else if (level === 'Needs Map Review') acc.needsReview += 1
      else if (level === 'Low Spatial Concern') acc.low += 1
      else acc.notChecked += 1

      return acc
    },
    {
      confirmed: 0,
      emerging: 0,
      watch: 0,
      low: 0,
      needsReview: 0,
      notChecked: 0,
    }
  )
}

function getHotspotCountTotal(counts = {}) {
  return (
    Number(counts.confirmed || 0) +
    Number(counts.emerging || 0) +
    Number(counts.watch || 0) +
    Number(counts.low || 0) +
    Number(counts.needsReview || 0) +
    Number(counts.notChecked || 0)
  )
}

function getRankedHotspotRows(hotspotRows = []) {
  return [...hotspotRows]
    .filter((row) => {
      return !isHotspotMapReviewRow(row) && row.hotspot_level !== 'Not checked'
    })
    .sort((a, b) => Number(b.hotspot_score || 0) - Number(a.hotspot_score || 0))
}

function buildReconciledHotspotSummary(summary = null, counts = {}, officialBarangayCount = 0) {
  return {
    ...(summary || {}),
    official_barangay_count: Number(officialBarangayCount || 0),
    reconciled_total: getHotspotCountTotal(counts),
    level_counts: {
      'Confirmed Hotspot': Number(counts.confirmed || 0),
      'Emerging Hotspot': Number(counts.emerging || 0),
      'Watch Area': Number(counts.watch || 0),
      'Low Spatial Concern': Number(counts.low || 0),
      'Needs Map Review': Number(counts.needsReview || 0),
      'Not checked': Number(counts.notChecked || 0),
    },
    barangays_needing_map_review: Number(counts.needsReview || 0),
  }
}

function getReportDataSourceLabel(usingSavedForecast) {
  return usingSavedForecast
    ? 'Saved forecast with uploaded dengue, weather, population, and map data'
    : 'Current workspace data'
}


function toTitleCase(value = '') {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatReportDateTime(value, fallback = 'Not recorded') {
  if (!value) return fallback

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSourceDateValue(item = {}) {
  return (
    item.uploadedAt ||
    item.uploaded_at ||
    item.uploadDate ||
    item.upload_date ||
    item.createdAt ||
    item.created_at ||
    item.timestamp ||
    item.savedAt ||
    item.saved_at ||
    ''
  )
}

function getReportSourceRows(sourceStatus = {}) {
  return Object.entries(sourceStatus || {}).map(([key, item = {}]) => {
    const totalRecords = Number(item.recordCount || item.totalRecords || item.total_records || 0)
    const validRecords = Number(item.validCount || item.validRecords || item.valid_records || 0)
    const explicitInvalidRecords = Number(item.invalidCount || item.invalidRecords || item.invalid_records || 0)
    const invalidRecords = explicitInvalidRecords > 0
      ? explicitInvalidRecords
      : Math.max(0, totalRecords - validRecords)

    return {
      dataset: toTitleCase(key),
      filename: item.uploadedName || item.filename || item.file_name || 'No file uploaded',
      uploadedAt: formatReportDateTime(getSourceDateValue(item)),
      status: item.badge || item.status || 'No status',
      totalRecords,
      validRecords,
      invalidRecords,
    }
  })
}

function formatThresholds(value) {
  if (!value) {
    return 'Forecast case-risk thresholds (cumulative four-period predicted cases): High = 60 or more; Moderate = 25 to 59; Low = fewer than 25. The 0–100 combined prioritization score is separate.'
  }

  if (typeof value === 'string') return value

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${toTitleCase(key)}: ${item}`)
      .join('; ')
  }

  return String(value)
}

function getTopHighRiskBarangays(rows = []) {
  const names = rows
    .filter((row) => row.risk === 'High')
    .slice(0, 5)
    .map((row) => row.barangay)
    .filter(Boolean)

  return names.length ? names.join(', ') : 'No high-risk barangay in the current report.'
}


function formatModelNameForReport(value = '') {
  if (!value) return 'Not recorded'

  return String(value)
    .replace(/^auto_selected_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}


function getActiveModelPayload(backendForecastResult = null, latestModelMetrics = null) {
  const trainingSummary =
    backendForecastResult?.training_summary ||
    latestModelMetrics?.training_summary ||
    {}

  const modelMetrics =
    backendForecastResult?.model_metrics ||
    latestModelMetrics?.metrics ||
    {}

  const modelComparison = Array.isArray(backendForecastResult?.model_comparison)
    ? backendForecastResult.model_comparison
    : Array.isArray(latestModelMetrics?.model_comparison)
      ? latestModelMetrics.model_comparison
      : []

  const selectionConfidence =
    backendForecastResult?.selection_confidence ||
    latestModelMetrics?.selection_confidence ||
    trainingSummary?.selection_confidence ||
    modelMetrics?.selection_confidence ||
    null

  const selectionExplanation =
    backendForecastResult?.selection_explanation ||
    latestModelMetrics?.selection_explanation ||
    trainingSummary?.selection_explanation ||
    modelMetrics?.selection_explanation ||
    ''

  const featureImportance =
    backendForecastResult?.feature_importance ||
    latestModelMetrics?.feature_importance ||
    modelMetrics?.feature_importance ||
    []

  const selectedModel =
    backendForecastResult?.model_display_name ||
    modelMetrics?.model_name ||
    latestModelMetrics?.best_model_name ||
    trainingSummary?.selected_model_name ||
    backendForecastResult?.best_model_name ||
    backendForecastResult?.model_name ||
    backendForecastResult?.forecast_run?.model_name ||
    backendForecastResult?.forecastRun?.model_name ||
    ''

  const selectedModelKey =
    modelMetrics?.model_key ||
    latestModelMetrics?.best_model_key ||
    backendForecastResult?.best_model_key ||
    backendForecastResult?.model_key ||
    backendForecastResult?.model_name ||
    selectedModel ||
    ''

  const modelVersion =
    modelMetrics?.model_version ||
    backendForecastResult?.model_version ||
    backendForecastResult?.forecast_run?.model_version ||
    backendForecastResult?.forecastRun?.model_version ||
    latestModelMetrics?.model_version ||
    'v1'

  const hasMachineLearningMetadata = Boolean(
    selectedModel ||
      modelComparison.length ||
      featureImportance.length ||
      backendForecastResult?.is_machine_learning ||
      backendForecastResult?.forecast_run?.is_machine_learning ||
      backendForecastResult?.forecastRun?.is_machine_learning ||
      latestModelMetrics?.has_metrics
  )

  return {
    trainingSummary,
    modelMetrics,
    modelComparison,
    selectionConfidence,
    selectionExplanation,
    featureImportance,
    selectedModel,
    selectedModelKey,
    modelVersion,
    hasMachineLearningMetadata,
  }
}

function formatMetricForReport(value, suffix = '') {
  const number = Number(value)

  if (!Number.isFinite(number)) return 'Not recorded'

  return `${number.toFixed(2)}${suffix}`
}

function getModelMetricsSummaryForReport(modelMetrics = {}) {
  const metrics = [
    ['RMSE', modelMetrics?.rmse],
    ['MAE', modelMetrics?.mae],
    ['Risk-class accuracy', modelMetrics?.accuracy, '%'],
    ['Risk-class precision', modelMetrics?.precision, '%'],
    ['Risk-class recall', modelMetrics?.recall, '%'],
    ['Risk-class F1', modelMetrics?.f1_score, '%'],
  ]
    .map(([label, value, type]) => {
      const number = Number(value)

      if (!Number.isFinite(number)) return null

      return type === '%'
        ? `${label}: ${(number * 100).toFixed(2)}%`
        : `${label}: ${number.toFixed(2)}`
    })
    .filter(Boolean)

  return metrics.length ? metrics.join('; ') : 'Not recorded'
}

function getModelComparisonSummaryForReport(modelComparison = []) {
  if (!Array.isArray(modelComparison) || !modelComparison.length) {
    return 'Not recorded'
  }

  return modelComparison
    .slice(0, 8)
    .map((model, index) => {
      const name = formatModelNameForReport(model.model_name || model.model || model.name || model.model_key || `Model ${index + 1}`)
      const rmse = Number(model.rmse)
      const mae = Number(model.mae)
      const rmseLabel = Number.isFinite(rmse) ? rmse.toFixed(2) : 'N/A'
      const maeLabel = Number.isFinite(mae) ? mae.toFixed(2) : 'N/A'

      return `#${index + 1} ${name} (RMSE ${rmseLabel}, MAE ${maeLabel})`
    })
    .join('; ')
}

function getFeatureImportanceSummaryForReport(backendForecastResult = null, latestModelMetrics = null) {
  const { featureImportance } = getActiveModelPayload(backendForecastResult, latestModelMetrics)

  if (!Array.isArray(featureImportance) || !featureImportance.length) {
    return 'Not available yet'
  }

  return featureImportance
    .slice(0, 5)
    .map((item) => `${item.label || formatModelNameForReport(item.feature)} (${Number(item.importance || 0).toFixed(2)}%)`)
    .join('; ')
}

function getOfficialReportMetadata({
  sourceStatus = {},
  backendForecastResult = null,
  latestModelMetrics = null,
  generatedAt = '',
  sortedRiskRows = [],
  usingBackendForecast = false,
  generatedBy = 'CHO user',
  role = 'City Health Office / Barangay Dengue Response Team',
} = {}) {
  const sourceRows = getReportSourceRows(sourceStatus)
  const totalRecords = sourceRows.reduce((sum, row) => sum + Number(row.totalRecords || 0), 0)
  const validRecords = sourceRows.reduce((sum, row) => sum + Number(row.validRecords || 0), 0)
  const invalidRecords = sourceRows.reduce((sum, row) => sum + Number(row.invalidRecords || 0), 0)
  const filenames = sourceRows
    .map((row) => row.filename)
    .filter((filename) => filename && filename !== 'No file uploaded')

  const uploadedDates = sourceRows
    .map((row) => row.uploadedAt)
    .filter((value) => value && value !== 'Not recorded')

  const {
    trainingSummary,
    modelMetrics,
    modelComparison,
    selectionConfidence,
    selectionExplanation,
    selectedModel,
    modelVersion,
    hasMachineLearningMetadata,
  } = getActiveModelPayload(backendForecastResult, latestModelMetrics)

  const forecastPeriodLabels =
    backendForecastResult?.forecast_results?.[0]?.forecast_period_predictions
      ?.map((item) => item?.period_label || item?.period || item?.label)
      .filter(Boolean) || []
  const exactForecastWindow =
    forecastPeriodLabels.length > 1
      ? `${forecastPeriodLabels[0]} to ${forecastPeriodLabels[forecastPeriodLabels.length - 1]}`
      : forecastPeriodLabels[0] || ''
  const rawForecastWindow =
    backendForecastResult?.forecast_window ||
    backendForecastResult?.forecastWindow ||
    backendForecastResult?.forecast_period ||
    backendForecastResult?.forecast_horizon_label ||
    ''
  const forecastWindow = exactForecastWindow ||
    (/^next\s/i.test(rawForecastWindow) || !rawForecastWindow
      ? '4-period forecast after latest available data'
      : rawForecastWindow)

  return {
    reportId: `DR-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`,
    generatedAt,
    generatedBy,
    role,
    dataSourceFilename: filenames.length ? filenames.join('; ') : 'No uploaded file recorded',
    uploadDateTime: uploadedDates.length ? uploadedDates.join('; ') : 'Not recorded in current upload status',
    totalRecords,
    validRecords,
    invalidRecords,
    forecastMethod:
      backendForecastResult?.forecast_method ||
      backendForecastResult?.method ||
      (hasMachineLearningMetadata
        ? 'Saved machine learning forecast using uploaded dengue, weather, population, and barangay map records. The system evaluated multiple algorithms and automatically selected the best model based on forecast error.'
        : usingBackendForecast
          ? 'Saved baseline trend forecast using uploaded dengue, weather, population, and barangay map records.'
          : 'Current workspace forecast and response ranking.'),
    modelVersion,
    selectedModel: selectedModel ? formatModelNameForReport(selectedModel) : 'Not recorded',
    trainTestSplit: trainingSummary?.train_test_split || backendForecastResult?.train_test_split || latestModelMetrics?.train_test_split || 'Chronological 80/20 origin split + 4-period leakage guard',
    randomState: trainingSummary?.random_state ?? backendForecastResult?.random_state ?? latestModelMetrics?.random_state ?? '42',
    modelsEvaluated: trainingSummary?.models_evaluated || modelComparison.length || latestModelMetrics?.models_evaluated || 'Not recorded',
    aiConfidence: selectionConfidence?.score ? `${selectionConfidence.score}/100 · ${selectionConfidence.label || 'Selection strength'} · heuristic model-selection score, not forecast probability` : 'Not available yet',
    featureImportanceSummary: getFeatureImportanceSummaryForReport(backendForecastResult, latestModelMetrics),
    selectedModelMetrics: getModelMetricsSummaryForReport(modelMetrics),
    modelComparisonSummary: getModelComparisonSummaryForReport(modelComparison),
    selectionExplanation: selectionExplanation || 'Not recorded',
    riskThresholds: formatThresholds(
      backendForecastResult?.risk_thresholds || backendForecastResult?.riskThresholds
    ),
    forecastWindow,
    topHighRiskBarangays: getTopHighRiskBarangays(sortedRiskRows),
    sourceRows,
    limitations: [
      'Forecast and risk levels depend on the uploaded records available at report generation time.',
      'The report supports planning and prioritization but does not replace official epidemiological investigation.',
      'Barangay name mismatches, missing map boundaries, or incomplete weather/population records can affect results.',
      'Recommendations should be reviewed by authorized health personnel before field implementation.',
    ],
  }
}

function getOfficialMetadataRows(metadata = {}) {
  return [
    ['Report ID', metadata.reportId || 'Not assigned'],
    ['Data source filename', metadata.dataSourceFilename || 'No uploaded file recorded'],
    ['Upload date/time', metadata.uploadDateTime || 'Not recorded'],
    ['Generated date/time', metadata.generatedAt || 'Not recorded'],
    ['Generated by', metadata.generatedBy || 'CHO user'],
    ['Role', metadata.role || 'City Health Office / Barangay Dengue Response Team'],
    ['Total records', formatNumber(metadata.totalRecords || 0)],
    ['Valid records', formatNumber(metadata.validRecords || 0)],
    ['Invalid records', formatNumber(metadata.invalidRecords || 0)],
    ['Forecast method', metadata.forecastMethod || 'Not recorded'],
    ['Model version', metadata.modelVersion || 'Not recorded'],
    ['Selected model', metadata.selectedModel || 'Not recorded'],
    ['Train/test split', metadata.trainTestSplit || 'Chronological 80/20 origin split + 4-period leakage guard'],
    ['Random state', metadata.randomState || '42'],
    ['Models evaluated', metadata.modelsEvaluated || 'Not recorded'],
    ['Model selection strength', metadata.aiConfidence || 'Not available yet'],
    ['Top feature importance', metadata.featureImportanceSummary || 'Not available yet'],
    ['Selected model metrics', metadata.selectedModelMetrics || 'Not recorded'],
    ['Model ranking summary', metadata.modelComparisonSummary || 'Not recorded'],
    ['Model selection explanation', metadata.selectionExplanation || 'Not recorded'],
    ['Forecast case-risk thresholds', metadata.riskThresholds || 'Not recorded'],
    ['Forecast period/window', metadata.forecastWindow || 'Not recorded'],
    ['Top high-risk barangays', metadata.topHighRiskBarangays || 'No high-risk barangay in the current report.'],
  ]
}

function getStatusStyle(badge = '') {
  const value = String(badge || '').toLowerCase()

  if (value.includes('uploaded') || value.includes('ready') || value.includes('sample')) {
    return 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
  }

  if (value.includes('review') || value.includes('pending') || value.includes('missing')) {
    return 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
  }

  return 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
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
  return 'Waiting for data'
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
      'Place the barangay under intensified reporting-period monitoring to prevent escalation into high-risk status.',
      'Inspect common breeding areas such as stagnant water sites, canals, schools, and dense residential zones.',
      'Strengthen dengue prevention messaging through BHWs, purok leaders, barangay pages, and community announcements.',
      'Prepare targeted cleanup and IEC activities if the next reporting period continues to increase.',
      'Compare new dengue reports against the forecast output during the next reporting-period review.'
    )
  } else if (risk === 'Low') {
    actions.push(
      'Maintain routine dengue surveillance and regular environmental sanitation activities.',
      'Continue household reminders on removing stagnant water and seeking early consultation for fever symptoms.',
      'Check if new cases are clustered in a specific purok or household group before escalating the response.',
      'Keep barangay advisories active during rainy periods and add spatial coordination only when the hotspot check confirms nearby higher-risk influence.',
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
    `Saved forecast classified ${barangay} as ${risk} risk.`,
    `Projected four-period cases: ${formatNumber(forecast)}.`,
    `Forecast for the next period: ${formatNumber(forecastNextPeriod)} cases.`,
    `Recent average cases: ${formatNumber(recentAverage)}.`,
    `Previous average cases: ${formatNumber(previousAverage)}.`,
    `Historical total cases: ${formatNumber(historicalTotalCases)}.`,
    `Recent trend direction: ${trendLabel || 'Not available'}.`,
  ]

  if (latestPeriod) {
    rationale.push(`Latest reporting period used: ${latestPeriod}.`)
  }

  if (recordCount > 0) {
    rationale.push(`${formatNumber(recordCount)} historical record${recordCount === 1 ? '' : 's'} were used for this barangay.`)
  }

  if (forecast >= 100) {
    rationale.push('The forecast is high, so immediate response planning is recommended.')
  }

  if (recentAverage > previousAverage && previousAverage > 0) {
    rationale.push('Recent average is higher than the previous average, indicating possible worsening case movement.')
  }

  if (recentAverage <= previousAverage && previousAverage > 0) {
    rationale.push('Recent average is not higher than the previous average, but risk classification and forecast output still require monitoring.')
  }

  return Array.from(new Set(rationale.filter(Boolean))).slice(0, 9)
}

function buildBackendRiskRows(backendForecastResult = null, context = {}) {
  const backendRows = backendForecastResult?.forecast_results || []
  const {
    populationRecords = [],
    boundaryFeatures = [],
    weatherRecords = [],
  } = context

  const backendPeriods = backendRows.map((row, index) => ({
    period: readText(row, ['latest_period', 'latestPeriod', 'period'], `Forecast period ${index + 1}`),
    index,
    sortValue: index,
  }))

  const sharedWeatherContext = getWeatherContextForPeriods(backendPeriods, weatherRecords)

  return backendRows
    .map((row) => {
      const barangay = row.barangay || row.barangay_name || 'Unspecified barangay'
      const forecast = Number(row.forecast_next_4_periods || row.forecastedCases || row.forecast || 0)
      const forecastNextPeriod = Number(row.forecast_next_period || row.currentCases || row.current_cases || 0)
      const forecastPeriodPredictions = Array.isArray(row.forecast_period_predictions || row.forecastPeriodPredictions)
        ? (row.forecast_period_predictions || row.forecastPeriodPredictions).map((item, index) => ({
            horizon: Number(item?.horizon || index + 1),
            period: String(item?.period || `Forecast period ${index + 1}`),
            predictedCases: Number(item?.predicted_cases ?? item?.predictedCases ?? 0),
          }))
        : []
      const recentAverage = Number(row.recent_average_cases || row.recentAverage || 0)
      const previousAverage = Number(row.previous_average_cases || row.previousAverage || 0)
      const historicalTotalCases = Number(row.historical_total_cases || row.totalCases || row.cases || 0)
      const trendLabel = row.trend_direction || row.trendDirection || row.trend || 'Stable'
      const responsePriority = row.response_priority || row.responsePriority || getBackendResponsePriority(row.risk_level || row.risk)
      const backendRecommendation = row.recommendation || getGenericRecommendedAction(row.risk_level || row.risk)
      const backendDecisionScore = getBackendDecisionScore(row)
      const latestPeriod = row.latest_period || row.latestPeriod || ''
      const recordCount = Number(row.record_count || row.recordCount || 0)

      const boundaryFeature = getBoundaryFeatureForBarangay(barangay, boundaryFeatures)
      const populationRow = getPopulationRowForSelection(barangay, boundaryFeature, populationRecords)
      const boundaryArea = getAreaValue({ row, feature: boundaryFeature })
      const population = getPopulationValue({ row, feature: boundaryFeature, populationRow })
      const density =
        readPositiveNumber(row, [
          'density',
          'populationDensity',
          'population_density',
          'densityPerSqKm',
        ]) ||
        (population > 0 && boundaryArea > 0 ? population / boundaryArea : 0)

      const rowWeatherContext = latestPeriod
        ? getWeatherContextForPeriods([{ period: latestPeriod }], weatherRecords)
        : sharedWeatherContext

      const weatherContext = rowWeatherContext.weatherRecordCount > 0
        ? rowWeatherContext
        : sharedWeatherContext

      const averageRainfall =
        readNumber(row, [
          'average_rainfall',
          'averageRainfall',
          'avgRainfall',
          'rainfall',
          'rainfall_mm',
          'rainfallMm',
        ], 0) || weatherContext.averageRainfall

      const averageTemperature =
        readNumber(row, [
          'average_temperature',
          'averageTemperature',
          'avgTemperature',
          'temperature',
          'temperature_c',
          'temperatureC',
        ], 0) || weatherContext.averageTemperature

      const averageHumidity =
        readNumber(row, [
          'average_humidity',
          'averageHumidity',
          'avgHumidity',
          'humidity',
          'relative_humidity',
          'relativeHumidity',
        ], 0) || weatherContext.averageHumidity

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
          : [{ period: 'Forecast next period', cases: forecastNextPeriod, horizon: 1, isForecast: true }]),
      ]

      const history = [previousAverage, recentAverage, forecastNextPeriod]

      const multiSourceRisk = computeMultiSourceRisk({
        forecast,
        currentCases: forecastNextPeriod,
        previousCases: previousAverage,
        totalCases: historicalTotalCases,
        trend: trendLabel,
        recentAverage,
        previousAverage,
        history,
        weeklyCases: history,
        population,
        areaSqKm: boundaryArea,
        density,
        averageRainfall,
        totalRainfall: weatherContext.totalRainfall,
        averageTemperature,
        averageHumidity,
      })

      const backendRisk = row.risk_level || row.risk || multiSourceRisk.risk || 'Low'
      const baseRiskScore = readNumber(row, [
        'risk_score',
        'riskScore',
        'base_risk_score',
        'baseRiskScore',
      ], 0)
      const combinedRiskScore = readNumber(row, [
        'combined_risk_score',
        'multi_source_risk_score',
        'combinedRiskScore',
        'multiSourceRiskScore',
        'overallRiskScore',
        'overall_risk_score',
      ], multiSourceRisk.score || baseRiskScore)
      const environmentalScore = readNumber(row, [
        'environmental_score',
        'environmentalScore',
      ], multiSourceRisk.environmentalSuitability?.score || 0)
      const environmentalSuitability =
        getEnvironmentalSuitabilityValue(row) ||
        multiSourceRisk.environmentalSuitability?.label ||
        ''
      const rainfallPressure =
        getRainfallPressureValue(row) ||
        multiSourceRisk.environmentalSuitability?.rainfallPressure?.label ||
        ''
      const temperatureSuitability =
        getTemperatureSuitabilityValue(row) ||
        multiSourceRisk.environmentalSuitability?.temperatureSuitability?.label ||
        ''
      const humiditySuitability =
        getHumiditySuitabilityValue(row) ||
        multiSourceRisk.environmentalSuitability?.humiditySuitability?.label ||
        ''
      const populationExposure = readText(row, [
        'population_exposure',
        'populationExposure',
      ])
      const densityLevel = readText(row, [
        'density_level',
        'densityLevel',
      ])
      const riskComponents = row.risk_components || row.riskComponents || multiSourceRisk.components || null

      const rowData = {
        barangay,
        barangayKey: row.barangay_key || row.barangayKey || '',
        risk: backendRisk,
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

        riskScore: combinedRiskScore,
        risk_score: baseRiskScore,
        baseRiskScore,
        combinedRiskScore,
        combined_risk_score: combinedRiskScore,
        multiSourceRiskScore: combinedRiskScore,
        multi_source_risk_score: combinedRiskScore,
        overallRiskScore: combinedRiskScore,

        environmentalScore,
        environmental_score: environmentalScore,
        environmentalSuitability,
        environmental_suitability: environmentalSuitability,
        rainfallPressure,
        rainfall_pressure: rainfallPressure,
        temperatureSuitability,
        temperature_suitability: temperatureSuitability,
        humiditySuitability,
        humidity_suitability: humiditySuitability,
        populationExposure,
        population_exposure: populationExposure,
        densityLevel,
        density_level: densityLevel,

        averageRainfall,
        average_rainfall: averageRainfall,
        avgRainfall: averageRainfall,
        totalRainfall: weatherContext.totalRainfall,
        total_rainfall: weatherContext.totalRainfall,
        averageTemperature,
        average_temperature: averageTemperature,
        avgTemperature: averageTemperature,
        averageHumidity,
        average_humidity: averageHumidity,
        avgHumidity: averageHumidity,
        weatherRecordCount: weatherContext.weatherRecordCount,
        weather_record_count: weatherContext.weatherRecordCount,
        weatherCoverageLabel: weatherContext.weatherCoverageLabel,
        weather_coverage_label: weatherContext.weatherCoverageLabel,

        population,
        density,
        areaSqKm: boundaryArea,
        area_sqkm: boundaryArea,
        boundaryAreaSqKm: boundaryArea,
        boundary_area_sqkm: boundaryArea,
        riskComponents,
        risk_components: riskComponents,

        history,
        weeklyCases: history,
        caseHistory: series,
        series,
        periods: forecastPeriodPredictions.length
          ? forecastPeriodPredictions.map((item) => item.period)
          : [latestPeriod || 'Latest period'],
        forecastPeriodPredictions,
        forecastStrategy: row.forecast_strategy || row.forecastStrategy || '',

        latestPeriod,
        recordCount,
      }

      const computedDecisionSupport = computeDecisionSupport(rowData)

      const fallbackActionPlan = buildBackendActionPlan({
        risk: backendRisk,
        forecast,
        forecastNextPeriod,
        recentAverage,
        previousAverage,
        trendLabel,
        recommendation: backendRecommendation || computedDecisionSupport.primaryAction,
      })

      const actionPlan = Array.from(
        new Set([
          backendRecommendation,
          ...(Array.isArray(computedDecisionSupport.actions)
            ? computedDecisionSupport.actions
            : []),
          ...fallbackActionPlan,
        ].filter(Boolean))
      ).slice(0, 8)

      const backendRationale = buildBackendRationale({
        barangay,
        risk: backendRisk,
        forecast,
        forecastNextPeriod,
        recentAverage,
        previousAverage,
        historicalTotalCases,
        trendLabel,
        latestPeriod,
        recordCount,
      })

      const rationale = Array.from(
        new Set([
          ...backendRationale,
          ...(Array.isArray(computedDecisionSupport.rationale)
            ? computedDecisionSupport.rationale
            : []),
        ].filter(Boolean))
      ).slice(0, 9)

      const decisionSupport = {
        ...computedDecisionSupport,
        summary:
          backendRecommendation ||
          computedDecisionSupport.summary ||
          getGenericRecommendedAction(backendRisk),
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
          'Forecast pressure available',
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

        backendPriorityRank: Number(row.priority_rank || row.priorityRank || 0),
      }
    })
    .sort(compareCanonicalBarangayPriority)
}

function buildBackendDashboardStats(backendForecastResult = null, backendDengueSummary = null) {
  const backendRows = backendForecastResult?.forecast_results || []
  const riskCounts = backendForecastResult?.risk_counts || {}
  const originalRowCount = Number(backendForecastResult?.original_row_count || 0)
  const validRowCount = Number(backendForecastResult?.valid_row_count || 0)

  const totalCases =
    Number(backendDengueSummary?.total_cases || 0) ||
    backendRows.reduce((sum, row) => {
      return sum + Number(row.historical_total_cases || 0)
    }, 0)

  const fourWeekForecast =
    Number(backendForecastResult?.total_forecast_next_4_periods || 0) ||
    backendRows.reduce((sum, row) => {
      return sum + Number(row.forecast_next_4_periods || 0)
    }, 0)

  const highRiskCount =
    Number(riskCounts.High || 0) ||
    backendRows.filter((row) => row.risk_level === 'High').length

  const dataQuality =
    originalRowCount > 0
      ? Math.round((validRowCount / originalRowCount) * 1000) / 10
      : 0

  return {
    totalCases,
    highRiskCount,
    fourWeekForecast,
    dataQuality,
  }
}

function getTopDecisionText(topBarangay) {
  if (!topBarangay) {
    return 'No barangay response planning output is available yet.'
  }

  const decision = getDecisionSupport(topBarangay)
  const profile = getMultiSourceProfile(topBarangay)

  return `${topBarangay.barangay} is the top response priority with ${decision.priority}, ${formatNumber(topBarangay.forecast)} projected cases, a Response score of ${formatNumber(decision.score)}, and a combined priority score of ${formatNumber(profile.score)}/100.`
}

function getReportSummary({ sortedRiskRows, dashboardStats }) {
  if (!sortedRiskRows.length) {
    return [
      'No barangay risk ranking is available yet.',
      'Upload or load dengue case records before generating a complete response planning report.',
      'Upload the official dengue records when they are available, then generate the report again.',
    ]
  }

  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)

  const topProfile = getMultiSourceProfile(topBarangay)

  return [
    decisionCounts.urgent > 0
      ? `${decisionCounts.urgent} barangay${decisionCounts.urgent === 1 ? '' : 's'} require immediate, high-priority, or escalated response planning.`
      : 'No barangay currently requires immediate or escalated response planning.',
    topBarangay
      ? `${topBarangay.barangay} is the highest Response priority with ${topDecision.priority}, ${formatNumber(topBarangay.forecast)} projected cases, and a combined prioritization score of ${formatNumber(topProfile.score)}/100.`
      : 'No top priority barangay is available.',
    `Environmental context used in the report includes ${topProfile.rainfallPressure}, ${topProfile.temperatureSuitability}, and ${topProfile.humiditySuitability}.`,
    `The current workspace has a source valid-row rate of ${dashboardStats?.dataQuality || 0}%.`,
  ]
}

function buildPrintableActionList(actions = []) {
  if (!actions.length) {
    return '<li>No action plan available yet.</li>'
  }

  return actions
    .slice(0, 8)
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join('')
}

function buildPrintableRationaleList(rationale = []) {
  if (!rationale.length) {
    return '<li>No rationale available yet.</li>'
  }

  return rationale
    .slice(0, 9)
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join('')
}

function openPrintableReport({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, title, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const hotspotCounts = getHotspotCounts(hotspotRows)
  const topHotspot = getRankedHotspotRows(hotspotRows)[0] || null
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)
  const officialMetadata = reportMetadata || getOfficialReportMetadata({
    sourceStatus,
    generatedAt,
    sortedRiskRows,
  })

  const metadataHtml = getOfficialMetadataRows(officialMetadata)
    .map(([label, value]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(value)}</td>
      </tr>
    `)
    .join('')

  const sourceDetailHtml = (officialMetadata.sourceRows || [])
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.dataset)}</td>
        <td>${escapeHtml(row.filename)}</td>
        <td>${escapeHtml(row.uploadedAt)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${formatNumber(row.totalRecords)}</td>
        <td>${formatNumber(row.validRecords)}</td>
        <td>${formatNumber(row.invalidRecords)}</td>
      </tr>
    `)
    .join('')

  const limitationHtml = (officialMetadata.limitations || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')

  const rowsHtml = sortedRiskRows
    .map((row, index) => {
      const decision = getDecisionSupport(row)
      const profile = getMultiSourceProfile(row)

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.barangay)}</td>
          <td>${escapeHtml(row.risk || 'Unknown')}</td>
          <td>${escapeHtml(decision.priority)}</td>
          <td>${formatNumber(profile.score)}/100</td>
          <td>${formatNumber(decision.score)}</td>
          <td>${formatNumber(row.forecast)}</td>
          <td>${escapeHtml(getHotspotLevelLabel(getHotspotForBarangay(row, hotspotRows)?.hotspot_level))}</td>
          <td>${escapeHtml(formatHotspotScore(getHotspotForBarangay(row, hotspotRows)?.hotspot_score))}</td>
          <td>${escapeHtml(profile.environmentalSuitability)}</td>
          <td>${escapeHtml(profile.rainfallPressure)}</td>
          <td>${escapeHtml(profile.temperatureSuitability)}</td>
          <td>${escapeHtml(profile.humiditySuitability)}</td>
          <td>${escapeHtml(decision.primaryAction)}</td>
        </tr>
      `
    })
    .join('')

  const priorityHtml = priorityDistribution
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.priority)}</td>
        <td>${formatNumber(item.count)}</td>
      </tr>
    `
    )
    .join('')

  const sourcesHtml = Object.entries(sourceStatus || {})
    .map(([key, item = {}]) => {
      return `
        <tr>
          <td>${escapeHtml(key)}</td>
          <td>${escapeHtml(item.uploadedName || 'No file uploaded')}</td>
          <td>${escapeHtml(item.badge || 'No status')}</td>
          <td>${formatNumber(item.validCount || 0)} / ${formatNumber(item.recordCount || 0)}</td>
        </tr>
      `
    })
    .join('')

  const html = `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            color: #172033;
            margin: 32px;
            line-height: 1.5;
            background: #ffffff;
          }

          h1, h2, h3 {
            margin-bottom: 8px;
          }

          .muted {
            color: #64748b;
          }

          .cards {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin: 20px 0;
          }

          .card {
            border: 1px solid #dbe4ee;
            border-radius: 14px;
            padding: 14px;
            background: #f8fafc;
          }

          .card small {
            color: #64748b;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.08em;
          }

          .card strong {
            display: block;
            font-size: 24px;
            margin-top: 6px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            font-size: 12px;
          }

          th, td {
            border: 1px solid #dbe4ee;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #eef6ff;
          }

          .note {
            margin-top: 20px;
            border: 1px solid #fde68a;
            background: #fffbeb;
            padding: 14px;
            border-radius: 14px;
          }

          .decision {
            margin-top: 20px;
            border: 1px solid #bfdbfe;
            background: #eff6ff;
            padding: 14px;
            border-radius: 14px;
          }

          .decision strong {
            color: #1e4e75;
          }

          li {
            margin-bottom: 6px;
          }

          @media print {
            button {
              display: none;
            }
          }

          @media (max-width: 900px) {
            .cards {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          @media (max-width: 520px) {
            body {
              margin: 18px;
            }

            .cards {
              grid-template-columns: 1fr;
            }

            table {
              font-size: 11px;
            }

            th, td {
              padding: 6px;
            }
          }
        </style>
      </head>

      <body>
        <button onclick="window.print()" style="padding: 10px 16px; border: 0; background: #2563eb; color: white; border-radius: 8px; font-weight: 700;">
          Print Report
        </button>

        <h1>${escapeHtml(title)}</h1>
        <p class="muted">Generated: ${escapeHtml(generatedAt)}</p>
        <p class="muted">Report data: ${escapeHtml(dataSourceLabel)}</p>

        <h2>Official Report Details</h2>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${metadataHtml}
          </tbody>
        </table>

        <div class="cards">
          <div class="card">
            <small>Barangay-Matched Cases</small>
            <strong>${formatNumber(dashboardStats.totalCases)}</strong>
          </div>

          <div class="card">
            <small>Response Alerts</small>
            <strong>${formatNumber(decisionCounts.urgent)}</strong>
          </div>

          <div class="card">
            <small>Forecast Total</small>
            <strong>${formatNumber(dashboardStats.fourWeekForecast)}</strong>
          </div>

          <div class="card">
            <small>Source Valid-Row Rate</small>
            <strong>${escapeHtml(dashboardStats.dataQuality)}%</strong>
          </div>
        </div>

        <h2>Risk Distribution</h2>
        <p>High risk barangays: ${formatNumber(highRiskCount)}</p>
        <p>Moderate risk barangays: ${formatNumber(moderateRiskCount)}</p>
        <p>Low risk barangays: ${formatNumber(lowRiskCount)}</p>

        <h2>Hotspot Summary</h2>
        <p>Confirmed hotspots: ${formatNumber(hotspotCounts.confirmed)}</p>
        <p>Emerging hotspots: ${formatNumber(hotspotCounts.emerging)}</p>
        <p>Watch areas: ${formatNumber(hotspotCounts.watch)}</p>
        <p>Low spatial concern: ${formatNumber(hotspotCounts.low)}</p>
        <p>Barangays needing map name review: ${formatNumber(hotspotCounts.needsReview)}</p>
        <p>Not checked: ${formatNumber(hotspotCounts.notChecked)}</p>
        <p>Official barangays accounted for: ${formatNumber(getHotspotCountTotal(hotspotCounts))}</p>
        <p>Top hotspot: ${escapeHtml(topHotspot?.barangay || 'Not checked')}</p>

        <h2>Response Priority Distribution</h2>
        <table>
          <thead>
            <tr>
              <th>Priority Level</th>
              <th>Barangay Count</th>
            </tr>
          </thead>
          <tbody>
            ${priorityHtml || '<tr><td colspan="2">No Response priority data available.</td></tr>'}
          </tbody>
        </table>

        <h2>Barangay Response Planning Ranking</h2>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Barangay</th>
              <th>Risk</th>
              <th>Response Priority</th>
              <th>Combined Risk Score</th>
              <th>Response Score</th>
              <th>Forecast</th>
              <th>Hotspot</th>
              <th>Hotspot Score</th>
              <th>Environment</th>
              <th>Rainfall</th>
              <th>Temperature</th>
              <th>Humidity</th>
              <th>Primary Action</th>
            </tr>
          </thead>

          <tbody>
            ${rowsHtml || '<tr><td colspan="14">No barangay response planning data available.</td></tr>'}
          </tbody>
        </table>

        <div class="decision">
          <h3>Top Response Plan</h3>
          <p><strong>${escapeHtml(topBarangay?.barangay || 'No barangay selected')}</strong></p>
          <p>${escapeHtml(topDecision.summary || 'No top response recommendation available yet.')}</p>

          <h4>Action Plan</h4>
          <ol>
            ${buildPrintableActionList(topDecision.actions)}
          </ol>

          <h4>Why this recommendation</h4>
          <ul>
            ${buildPrintableRationaleList(topDecision.rationale)}
          </ul>
        </div>

        <h2>Uploaded Data Readiness</h2>
        <table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>File</th>
              <th>Status</th>
              <th>Valid Records</th>
            </tr>
          </thead>

          <tbody>
            ${sourcesHtml || '<tr><td colspan="4">No source status available.</td></tr>'}
          </tbody>
        </table>

        <h2>Official Source Details</h2>
        <table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Filename</th>
              <th>Upload date/time</th>
              <th>Status</th>
              <th>Total</th>
              <th>Valid</th>
              <th>Invalid</th>
            </tr>
          </thead>
          <tbody>
            ${sourceDetailHtml || '<tr><td colspan="7">No uploaded source details available.</td></tr>'}
          </tbody>
        </table>

        <h2>Limitations and Assumptions</h2>
        <ul>
          ${limitationHtml || '<li>No limitations recorded.</li>'}
        </ul>


      </body>
    </html>
  `

  const reportWindow = window.open('', '_blank')

  if (!reportWindow) {
    alert('Popup blocked. Please allow popups to open the printable report.')
    return
  }

  reportWindow.document.write(html)
  reportWindow.document.close()
}

function downloadPdfReport({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, title, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const hotspotCounts = getHotspotCounts(hotspotRows)
  const topHotspot = getRankedHotspotRows(hotspotRows)[0] || null
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)
  const officialMetadata = reportMetadata || getOfficialReportMetadata({
    sourceStatus,
    generatedAt,
    sortedRiskRows,
  })

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  })

  const margin = 36
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(title, margin, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Generated: ${generatedAt}`, margin, 62)

  doc.setFontSize(11)
  doc.text('Barangay-Level Dengue Outbreak Prevention System', margin, 84)

  autoTable(doc, {
    startY: 106,
    head: [['Metric', 'Value']],
    body: [
      ['Total recorded cases', formatNumber(dashboardStats.totalCases)],
      ['Urgent alerts', formatNumber(decisionCounts.urgent)],
      ['High-risk barangays', formatNumber(highRiskCount)],
      ['Moderate-risk barangays', formatNumber(moderateRiskCount)],
      ['Low-risk barangays', formatNumber(lowRiskCount)],
      ['Confirmed hotspots', formatNumber(hotspotCounts.confirmed)],
      ['Emerging hotspots', formatNumber(hotspotCounts.emerging)],
      ['Watch areas', formatNumber(hotspotCounts.watch)],
      ['Low spatial concern', formatNumber(hotspotCounts.low)],
      ['Map names needing review', formatNumber(hotspotCounts.needsReview)],
      ['Hotspot results not checked', formatNumber(hotspotCounts.notChecked)],
      ['Official barangays accounted for', formatNumber(getHotspotCountTotal(hotspotCounts))],
      ['Report data source', dataSourceLabel],
      ['Forecast-horizon total', formatNumber(dashboardStats.fourWeekForecast)],
      ['Source valid-row rate', `${dashboardStats.dataQuality}%`],
      ['Top priority barangay', topBarangay?.barangay || 'No data'],
      ['Top response priority', topDecision.priority || 'No data'],
    ],
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 16,
    head: [['Official Report Detail', 'Value']],
    body: getOfficialMetadataRows(officialMetadata),
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [4, 120, 87],
      textColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 150 },
      1: { cellWidth: 620 },
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  doc.addPage()

  const rankingStartY = 42

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Barangay Response Planning Ranking', margin, rankingStartY)

  autoTable(doc, {
    startY: rankingStartY + 12,
    head: [[
      'Rank',
      'Barangay',
      'Risk',
      'Response Priority',
      'Combined Score',
      'Forecast',
      'Hotspot',
      'Environment',
      'Primary Action',
    ]],
    body:
      sortedRiskRows.length > 0
        ? sortedRiskRows.map((row, index) => {
            const decision = getDecisionSupport(row)
            const profile = getMultiSourceProfile(row)

            return [
              index + 1,
              row.barangay,
              row.risk || 'Unknown',
              decision.priority,
              `${formatNumber(profile.score)}/100`,
              formatNumber(row.forecast),
              getHotspotLevelLabel(getHotspotForBarangay(row, hotspotRows)?.hotspot_level),
              `${profile.environmentalSuitability}; ${profile.rainfallPressure}; ${profile.temperatureSuitability}; ${profile.humiditySuitability}`,
              decision.primaryAction,
            ]
          })
        : [['-', 'No barangay response planning data available', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 4,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 86 },
      2: { cellWidth: 48 },
      3: { cellWidth: 92 },
      4: { cellWidth: 54 },
      5: { cellWidth: 54 },
      6: { cellWidth: 82 },
      7: { cellWidth: 128 },
      8: { cellWidth: 250 },
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  doc.addPage()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Top Response Plan', margin, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const topText = topBarangay
    ? `${topBarangay.barangay}: ${topDecision.summary}`
    : 'No top response recommendation is available yet.'

  const wrappedTopText = doc.splitTextToSize(topText, pageWidth - margin * 2)
  doc.text(wrappedTopText, margin, 62)

  const topProfile = getMultiSourceProfile(topBarangay)

  autoTable(doc, {
    startY: 100,
    head: [['Combined Risk Factor', 'Value']],
    body: [
      ['Combined priority score', `${formatNumber(topProfile.score)}/100`],
      ['Environmental suitability', topProfile.environmentalSuitability],
      ['Rainfall pressure', topProfile.rainfallPressure],
      ['Temperature suitability', topProfile.temperatureSuitability],
      ['Humidity suitability', topProfile.humiditySuitability],
      ['Population exposure', topDecision.populationExposure || 'Not available'],
      ['Density level', topDecision.densityLevel || 'Not available'],
    ],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Action Plan', margin, doc.lastAutoTable.finalY + 22)

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 34,
    head: [['No.', 'Recommended Action']],
    body:
      topDecision.actions?.length > 0
        ? topDecision.actions.slice(0, 8).map((action, index) => [
            index + 1,
            action,
          ])
        : [['-', 'No action plan available.']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 720 },
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  const rationaleStartY = doc.lastAutoTable.finalY + 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Why this recommendation', margin, rationaleStartY)

  autoTable(doc, {
    startY: rationaleStartY + 12,
    head: [['Reason']],
    body:
      topDecision.rationale?.length > 0
        ? topDecision.rationale.slice(0, 9).map((reason) => [reason])
        : [['No rationale available.']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [4, 120, 87],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  const priorityStartY = doc.lastAutoTable.finalY + 22

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Response Priority Distribution', margin, priorityStartY)

  autoTable(doc, {
    startY: priorityStartY + 12,
    head: [['Priority Level', 'Barangay Count']],
    body:
      priorityDistribution.length > 0
        ? priorityDistribution.map((item) => [
            item.priority,
            formatNumber(item.count),
          ])
        : [['No data', '-']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  const sources = Object.entries(sourceStatus || {})

  doc.addPage()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Uploaded Data Readiness', margin, 42)

  autoTable(doc, {
    startY: 58,
    head: [['Dataset', 'File', 'Status', 'Valid Records']],
    body:
      sources.length > 0
        ? sources.map(([key, item = {}]) => [
            key,
            item.uploadedName || 'No file uploaded',
            item.badge || 'No status',
            `${formatNumber(item.validCount || 0)} / ${formatNumber(item.recordCount || 0)}`,
          ])
        : [['-', 'No source status available', '-', '-']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [37, 95, 143],
      textColor: [255, 255, 255],
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 20,
    head: [['Dataset', 'Filename', 'Upload date/time', 'Total', 'Valid', 'Invalid']],
    body:
      officialMetadata.sourceRows?.length > 0
        ? officialMetadata.sourceRows.map((row) => [
            row.dataset,
            row.filename,
            row.uploadedAt,
            formatNumber(row.totalRecords),
            formatNumber(row.validRecords),
            formatNumber(row.invalidRecords),
          ])
        : [['-', 'No uploaded source details available', '-', '-', '-', '-']],
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 4,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [4, 120, 87],
      textColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 82 },
      1: { cellWidth: 230 },
      2: { cellWidth: 130 },
      3: { cellWidth: 70 },
      4: { cellWidth: 70 },
      5: { cellWidth: 70 },
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  doc.addPage()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Limitations and Assumptions', margin, 42)

  autoTable(doc, {
    startY: 58,
    head: [['No.', 'Limitation / Assumption']],
    body: (officialMetadata.limitations || []).map((item, index) => [index + 1, item]),
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 6,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [180, 83, 9],
      textColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 720 },
    },
    margin: {
      left: margin,
      right: margin,
    },
  })

  doc.save(`${REPORT_EXPORT_BASENAME}.pdf`)
}

function downloadExcelWorkbook({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const hotspotCounts = getHotspotCounts(hotspotRows)
  const topHotspot = getRankedHotspotRows(hotspotRows)[0] || null
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)
  const officialMetadata = reportMetadata || getOfficialReportMetadata({
    sourceStatus,
    generatedAt,
    sortedRiskRows,
  })

  const workbook = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.aoa_to_sheet([
    [REPORT_TITLE],
    ['Generated', generatedAt],
    ['Report ID', officialMetadata.reportId],
    ['Generated by', officialMetadata.generatedBy],
    ['Role', officialMetadata.role],
    ['Forecast method', officialMetadata.forecastMethod],
    ['Model version', officialMetadata.modelVersion],
    ['Selected model', officialMetadata.selectedModel],
    ['Train/test split', officialMetadata.trainTestSplit],
    ['Random state', officialMetadata.randomState],
    ['Models evaluated', officialMetadata.modelsEvaluated],
    ['Model selection strength', officialMetadata.aiConfidence],
    ['Top feature importance', officialMetadata.featureImportanceSummary],
    ['Selected model metrics', officialMetadata.selectedModelMetrics],
    ['Model ranking summary', officialMetadata.modelComparisonSummary],
    ['Model selection explanation', officialMetadata.selectionExplanation],
    ['Forecast period/window', officialMetadata.forecastWindow],
    [],
    ['Metric', 'Value'],
    ['Barangay-matched cases used', Number(dashboardStats.totalCases || 0)],
    ['Urgent alerts', decisionCounts.urgent],
    ['Preventive priority barangays', decisionCounts.preventive],
    ['Watch or monitoring barangays', decisionCounts.watch],
    ['Routine monitoring barangays', decisionCounts.routine],
    ['High-risk barangays', highRiskCount],
    ['Moderate-risk barangays', moderateRiskCount],
    ['Low-risk barangays', lowRiskCount],
    ['Confirmed hotspots', hotspotCounts.confirmed],
    ['Emerging hotspots', hotspotCounts.emerging],
    ['Watch areas', hotspotCounts.watch],
    ['Low spatial concern', hotspotCounts.low],
    ['Map names needing review', hotspotCounts.needsReview],
    ['Hotspot results not checked', hotspotCounts.notChecked],
    ['Official barangays accounted for', getHotspotCountTotal(hotspotCounts)],
    ['Top hotspot barangay', topHotspot?.barangay || 'Not checked'],
    ['Report data source', dataSourceLabel],
    ['Forecast-horizon total', Number(dashboardStats.fourWeekForecast || 0)],
    ['Source valid-row rate', `${dashboardStats.dataQuality}%`],
    ['Top priority barangay', topBarangay?.barangay || 'No data'],
    ['top response priority', topDecision.priority || 'No data'],
    ['Top combined priority score', `${getMultiSourceProfile(topBarangay).score}/100`],
    ['Top environmental suitability', getMultiSourceProfile(topBarangay).environmentalSuitability],
    ['Top rainfall pressure', getMultiSourceProfile(topBarangay).rainfallPressure],
    ['Top temperature suitability', getMultiSourceProfile(topBarangay).temperatureSuitability],
    ['Top humidity suitability', getMultiSourceProfile(topBarangay).humiditySuitability],
    ['Top response summary', topDecision.summary || 'No recommendation available'],

  ])

  summarySheet['!cols'] = [{ wch: 34 }, { wch: 110 }]
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  const metadataSheet = XLSX.utils.aoa_to_sheet([
    ['Official Report Metadata', 'Details'],
    ...getOfficialMetadataRows(officialMetadata),
  ])

  metadataSheet['!cols'] = [{ wch: 34 }, { wch: 120 }]
  XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Official Metadata')

  const officialSourcesSheet = XLSX.utils.aoa_to_sheet([
    ['Dataset', 'Filename', 'Upload Date/Time', 'Status', 'Total Records', 'Valid Records', 'Invalid Records'],
    ...(officialMetadata.sourceRows || []).map((row) => [
      row.dataset,
      row.filename,
      row.uploadedAt,
      row.status,
      Number(row.totalRecords || 0),
      Number(row.validRecords || 0),
      Number(row.invalidRecords || 0),
    ]),
  ])

  officialSourcesSheet['!cols'] = [
    { wch: 22 },
    { wch: 54 },
    { wch: 28 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(workbook, officialSourcesSheet, 'Official Sources')

  const assumptionsSheet = XLSX.utils.aoa_to_sheet([
    ['No.', 'Limitation / Assumption'],
    ...(officialMetadata.limitations || []).map((item, index) => [index + 1, item]),
  ])

  assumptionsSheet['!cols'] = [{ wch: 8 }, { wch: 120 }]
  XLSX.utils.book_append_sheet(workbook, assumptionsSheet, 'Limitations')

  const rankingSheet = XLSX.utils.aoa_to_sheet([
    [
      'Rank',
      'Barangay',
      'Risk Level',
      'Response Priority',
      'Combined Risk Score',
      'Decision Score',
      'Projected Cases',
      'Historical Total Cases',
      'Next-Period Forecast',
      'Previous Cases',
      'Trend',
      'Trend Direction',
      'Environmental Suitability',
      'Rainfall Pressure',
      'Temperature Suitability',
      'Humidity Suitability',
      'Forecast Pressure',
      'Population Exposure',
      'Density Level',
      'Hotspot Level',
      'Hotspot Score',
      'Primary Action',
      'Recommendation Summary',
    ],
    ...sortedRiskRows.map((row, index) => {
      const decision = getDecisionSupport(row)
      const profile = getMultiSourceProfile(row)

      return [
        index + 1,
        row.barangay,
        row.risk,
        decision.priority,
        Number(profile.score || 0),
        Number(decision.score || 0),
        Number(row.forecast || 0),
        Number(row.totalCases || 0),
        Number(row.currentCases || 0),
        Number(row.previousCases || 0),
        row.trend || 'Not available',
        decision.trendDirection,
        profile.environmentalSuitability,
        profile.rainfallPressure,
        profile.temperatureSuitability,
        profile.humiditySuitability,
        decision.forecastPressure,
        decision.populationExposure,
        decision.densityLevel,
        getHotspotLevelLabel(getHotspotForBarangay(row, hotspotRows)?.hotspot_level),
        Number(getHotspotForBarangay(row, hotspotRows)?.hotspot_score || 0),
        decision.primaryAction,
        decision.summary,
      ]
    }),
  ])

  rankingSheet['!cols'] = [
    { wch: 8 },
    { wch: 30 },
    { wch: 16 },
    { wch: 26 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
    { wch: 22 },
    { wch: 34 },
    { wch: 30 },
    { wch: 38 },
    { wch: 30 },
    { wch: 26 },
    { wch: 30 },
    { wch: 24 },
    { wch: 24 },
    { wch: 18 },
    { wch: 70 },
    { wch: 90 },
  ]

  XLSX.utils.book_append_sheet(workbook, rankingSheet, 'Response Ranking')

  const factorSheet = XLSX.utils.aoa_to_sheet([
    [
      'Barangay',
      'Combined Risk Score',
      'Environmental Suitability',
      'Rainfall Pressure',
      'Average Rainfall',
      'Temperature Suitability',
      'Average Temperature',
      'Humidity Suitability',
      'Average Humidity',
      'Population Exposure',
      'Population',
      'Density Level',
      'Density',
    ],
    ...sortedRiskRows.map((row) => {
      const decision = getDecisionSupport(row)
      const profile = getMultiSourceProfile(row)

      return [
        row.barangay,
        Number(profile.score || 0),
        profile.environmentalSuitability,
        profile.rainfallPressure,
        Number(profile.averageRainfall || 0),
        profile.temperatureSuitability,
        Number(profile.averageTemperature || 0),
        profile.humiditySuitability,
        Number(profile.averageHumidity || 0),
        decision.populationExposure,
        Number(profile.population || 0),
        decision.densityLevel,
        Number(profile.density || 0),
      ]
    }),
  ])

  factorSheet['!cols'] = [
    { wch: 30 },
    { wch: 24 },
    { wch: 34 },
    { wch: 30 },
    { wch: 18 },
    { wch: 38 },
    { wch: 22 },
    { wch: 30 },
    { wch: 18 },
    { wch: 30 },
    { wch: 16 },
    { wch: 24 },
    { wch: 18 },
  ]

  XLSX.utils.book_append_sheet(workbook, factorSheet, 'Combined Risk Factors')

  const actionRows = []

  sortedRiskRows.forEach((row) => {
    const decision = getDecisionSupport(row)

    if (!decision.actions.length) {
      actionRows.push([
        row.barangay,
        decision.priority,
        '',
        'No action plan available.',
      ])

      return
    }

    decision.actions.forEach((action, index) => {
      actionRows.push([
        row.barangay,
        decision.priority,
        index + 1,
        action,
      ])
    })
  })

  const actionSheet = XLSX.utils.aoa_to_sheet([
    ['Barangay', 'Response Priority', 'Action No.', 'Recommended Action'],
    ...actionRows,
  ])

  actionSheet['!cols'] = [
    { wch: 30 },
    { wch: 26 },
    { wch: 12 },
    { wch: 100 },
  ]

  XLSX.utils.book_append_sheet(workbook, actionSheet, 'Action Plan')

  const rationaleRows = []

  sortedRiskRows.forEach((row) => {
    const decision = getDecisionSupport(row)

    if (!decision.rationale.length) {
      rationaleRows.push([
        row.barangay,
        decision.priority,
        'No rationale available.',
      ])

      return
    }

    decision.rationale.forEach((reason) => {
      rationaleRows.push([
        row.barangay,
        decision.priority,
        reason,
      ])
    })
  })

  const rationaleSheet = XLSX.utils.aoa_to_sheet([
    ['Barangay', 'Response Priority', 'Why this recommendation'],
    ...rationaleRows,
  ])

  rationaleSheet['!cols'] = [
    { wch: 30 },
    { wch: 26 },
    { wch: 100 },
  ]

  XLSX.utils.book_append_sheet(workbook, rationaleSheet, 'Rationale')

  const prioritySheet = XLSX.utils.aoa_to_sheet([
    ['Response Priority', 'Barangay Count'],
    ...priorityDistribution.map((item) => [
      item.priority,
      item.count,
    ]),
  ])

  prioritySheet['!cols'] = [
    { wch: 34 },
    { wch: 18 },
  ]

  XLSX.utils.book_append_sheet(workbook, prioritySheet, 'Priority Distribution')


  const hotspotSheet = XLSX.utils.aoa_to_sheet([
    [
      'Rank',
      'Barangay',
      'Hotspot Level',
      'Hotspot Score',
      'Nearby Barangay Effect',
      'Map Status',
      'Recommended Map Action',
    ],
    ...(hotspotRows.length > 0
      ? hotspotRows.map((row, index) => [
          index + 1,
          row.barangay || 'Unknown barangay',
          getHotspotLevelLabel(row.hotspot_level),
          Number(row.hotspot_score || 0),
          Number(row.neighbor_influence_score || 0),
          row.has_map_boundary === false ? 'Map name needs review' : 'Map area matched',
          row.recommended_map_action || 'Continue routine monitoring.',
        ])
      : [['-', 'No hotspot analysis available', '-', '-', '-', '-', '-']]),
  ])

  hotspotSheet['!cols'] = [
    { wch: 8 },
    { wch: 30 },
    { wch: 24 },
    { wch: 18 },
    { wch: 24 },
    { wch: 24 },
    { wch: 80 },
  ]

  XLSX.utils.book_append_sheet(workbook, hotspotSheet, 'Hotspot Summary')

  const sourceRows = Object.entries(sourceStatus || {}).map(([key, item = {}]) => [
    key,
    item.uploadedName || 'No file uploaded',
    item.badge || 'No status',
    Number(item.validCount || 0),
    Number(item.recordCount || 0),
  ])

  const sourceSheet = XLSX.utils.aoa_to_sheet([
    ['Dataset', 'File', 'Status', 'Valid Records', 'Total Records'],
    ...sourceRows,
  ])

  sourceSheet['!cols'] = [
    { wch: 20 },
    { wch: 45 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
  ]

  XLSX.utils.book_append_sheet(workbook, sourceSheet, 'Uploaded Data')

  XLSX.writeFile(workbook, `${REPORT_EXPORT_BASENAME}.xlsx`)
}

async function downloadPowerPointDeck({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const hotspotCounts = getHotspotCounts(hotspotRows)
  const topHotspot = getRankedHotspotRows(hotspotRows)[0] || null
  const topBarangays = sortedRiskRows.slice(0, 5)
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)
  const sources = Object.entries(sourceStatus || {}).slice(0, 8)
  const officialMetadata = reportMetadata || getOfficialReportMetadata({
    sourceStatus,
    generatedAt,
    sortedRiskRows,
  })

  const pptx = new pptxgen()

  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Barangay-Level Dengue Outbreak Prevention System'
  pptx.subject = REPORT_TITLE
  pptx.title = REPORT_TITLE
  pptx.company = 'Caraga State University'
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'en-US',
  }

  const COLORS = {
    navy: '172033',
    blue: '255F8F',
    blueDark: '1E4E75',
    lightBlue: 'EFF6FF',
    paleBlue: 'DBEAFE',
    red: 'C2410C',
    rose: 'FFF1F2',
    green: '047857',
    emerald: 'ECFDF5',
    amber: 'B45309',
    yellow: 'FFFBEB',
    slate: '64748B',
    line: 'DBE4EE',
    white: 'FFFFFF',
    bg: 'F8FAFC',
  }

  function getRiskPptColor(risk) {
    if (risk === 'High') return COLORS.red
    if (risk === 'Moderate') return COLORS.amber
    if (risk === 'Low') return COLORS.green
    return COLORS.slate
  }

  function getRiskPptFill(risk) {
    if (risk === 'High') return COLORS.rose
    if (risk === 'Moderate') return COLORS.yellow
    if (risk === 'Low') return COLORS.emerald
    return COLORS.bg
  }

  function getPriorityPptColor(priority) {
    const value = String(priority || '').toLowerCase()

    if (value.includes('immediate') || value.includes('high priority')) return COLORS.red
    if (value.includes('escalated') || value.includes('preventive')) return COLORS.amber
    if (value.includes('routine')) return COLORS.green

    return COLORS.blue
  }

  function getPriorityPptFill(priority) {
    const value = String(priority || '').toLowerCase()

    if (value.includes('immediate') || value.includes('high priority')) return COLORS.rose
    if (value.includes('escalated') || value.includes('preventive')) return COLORS.yellow
    if (value.includes('routine')) return COLORS.emerald

    return COLORS.lightBlue
  }

  function addTopBar(slide) {
    slide.addText('', {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.16,
      margin: 0,
      fill: { color: COLORS.blue },
      line: { color: COLORS.blue },
    })
  }

  function addFooter(slide) {
    slide.addText(generatedAt, {
      x: 9.2,
      y: 7.05,
      w: 3.4,
      h: 0.25,
      fontSize: 8,
      color: COLORS.slate,
      align: 'right',
      margin: 0,
    })
  }

  function addSlideTitle(slide, title, subtitle = '') {
    slide.background = { color: COLORS.bg }
    addTopBar(slide)

    slide.addText(title, {
      x: 0.6,
      y: 0.42,
      w: 8.8,
      h: 0.42,
      fontSize: 25,
      bold: true,
      color: COLORS.navy,
      margin: 0,
    })

    if (subtitle) {
      slide.addText(subtitle, {
        x: 0.62,
        y: 0.9,
        w: 9.8,
        h: 0.28,
        fontSize: 10.5,
        color: COLORS.slate,
        margin: 0,
      })
    }

    addFooter(slide)
  }

  function addMetricCard(slide, label, value, x, y, fill, accent) {
    slide.addText(label.toUpperCase(), {
      x,
      y,
      w: 2.55,
      h: 0.3,
      fontSize: 8.5,
      bold: true,
      color: accent,
      margin: 0.12,
      fill: { color: fill },
      line: { color: fill },
    })

    slide.addText(String(value), {
      x,
      y: y + 0.34,
      w: 2.55,
      h: 0.62,
      fontSize: 24,
      bold: true,
      color: COLORS.navy,
      margin: 0.14,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
      fit: 'shrink',
    })
  }

  const titleSlide = pptx.addSlide()
  titleSlide.background = { color: COLORS.lightBlue }

  titleSlide.addText('', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 7.5,
    margin: 0,
    fill: { color: COLORS.lightBlue },
    line: { color: COLORS.lightBlue },
  })

  titleSlide.addText('', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.18,
    margin: 0,
    fill: { color: COLORS.blue },
    line: { color: COLORS.blue },
  })

  titleSlide.addText('DENGUE DECISION SUPPORT', {
    x: 0.8,
    y: 1.15,
    w: 10.5,
    h: 0.38,
    fontSize: 17,
    bold: true,
    color: COLORS.blue,
    margin: 0,
    charSpace: 1.5,
  })

  titleSlide.addText('Four-Month Forecast Briefing', {
    x: 0.8,
    y: 1.7,
    w: 11.2,
    h: 0.85,
    fontSize: 42,
    bold: true,
    color: COLORS.navy,
    margin: 0,
    fit: 'shrink',
  })

  titleSlide.addText('Barangay-Level Dengue Outbreak Prevention System', {
    x: 0.82,
    y: 2.72,
    w: 10.8,
    h: 0.4,
    fontSize: 16,
    color: COLORS.slate,
    margin: 0,
  })

  titleSlide.addText(`Generated: ${generatedAt}`, {
    x: 0.82,
    y: 3.22,
    w: 7.5,
    h: 0.32,
    fontSize: 11.5,
    color: COLORS.slate,
    margin: 0,
  })

  titleSlide.addText('CHO Review  •  Barangay Coordination  •  Response Planning', {
    x: 0.82,
    y: 5.82,
    w: 8.8,
    h: 0.34,
    fontSize: 12.5,
    bold: true,
    color: COLORS.blueDark,
    margin: 0,
  })

  titleSlide.addText('', {
    x: 9.8,
    y: 1.12,
    w: 2.55,
    h: 4.9,
    margin: 0,
    fill: { color: COLORS.white, transparency: 10 },
    line: { color: COLORS.paleBlue },
  })

  titleSlide.addText('Response\nReport', {
    x: 10.1,
    y: 2.35,
    w: 1.95,
    h: 0.9,
    fontSize: 24,
    bold: true,
    align: 'center',
    color: COLORS.blue,
    margin: 0.05,
    fit: 'shrink',
  })

  const metadataSlide = pptx.addSlide()
  addSlideTitle(
    metadataSlide,
    'Official Report Details',
    'Report metadata, source record counts, forecast method, thresholds, and forecast window.'
  )

  metadataSlide.addTable(
    [
      ['Field', 'Details'],
      ...getOfficialMetadataRows(officialMetadata),
    ],
    {
      x: 0.65,
      y: 1.28,
      w: 12,
      h: 5.45,
      fontSize: 7.4,
      color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 },
      fill: { color: COLORS.white },
      margin: 0.05,
    }
  )

  const summarySlide = pptx.addSlide()
  addSlideTitle(
    summarySlide,
    'Response Summary',
    'Key monitoring and response planning indicators from the current workspace.'
  )

  addMetricCard(
    summarySlide,
    'Barangay-matched cases',
    formatNumber(dashboardStats.totalCases),
    0.7,
    1.45,
    COLORS.lightBlue,
    COLORS.blue
  )

  addMetricCard(
    summarySlide,
    'Urgent alerts',
    formatNumber(decisionCounts.urgent),
    3.55,
    1.45,
    COLORS.rose,
    COLORS.red
  )

  addMetricCard(
    summarySlide,
    'Forecast total',
    formatNumber(dashboardStats.fourWeekForecast),
    6.4,
    1.45,
    COLORS.yellow,
    COLORS.amber
  )

  addMetricCard(
    summarySlide,
    'Source valid-row rate',
    `${dashboardStats.dataQuality}%`,
    9.25,
    1.45,
    COLORS.emerald,
    COLORS.green
  )

  summarySlide.addText('Risk Distribution', {
    x: 0.72,
    y: 3.18,
    w: 4.5,
    h: 0.3,
    fontSize: 17,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  })

  summarySlide.addTable(
    [
      ['Risk Level', 'Barangay Count'],
      ['High', highRiskCount],
      ['Moderate', moderateRiskCount],
      ['Low', lowRiskCount],
    ],
    {
      x: 0.72,
      y: 3.66,
      w: 5.4,
      h: 1.55,
      fontSize: 12,
      color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 },
      fill: { color: COLORS.white },
      margin: 0.08,
    }
  )

  summarySlide.addText('Hotspot Summary', {
    x: 0.72,
    y: 5.55,
    w: 4.8,
    h: 0.28,
    fontSize: 14,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  })

  summarySlide.addText(
    `Confirmed: ${formatNumber(hotspotCounts.confirmed)} • Emerging: ${formatNumber(hotspotCounts.emerging)} • Watch: ${formatNumber(hotspotCounts.watch)} • Low concern: ${formatNumber(hotspotCounts.low)} • Needs review: ${formatNumber(hotspotCounts.needsReview)} • Accounted: ${formatNumber(getHotspotCountTotal(hotspotCounts))}`,
    {
      x: 0.72,
      y: 5.92,
      w: 5.4,
      h: 0.46,
      fontSize: 10.5,
      color: COLORS.slate,
      margin: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
      fit: 'shrink',
    }
  )

  summarySlide.addText('Response Guidance', {
    x: 6.72,
    y: 3.18,
    w: 4.5,
    h: 0.3,
    fontSize: 17,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  })

  summarySlide.addText(
    getTopDecisionText(topBarangay),
    {
      x: 6.72,
      y: 3.66,
      w: 5.72,
      h: 1.55,
      fontSize: 13.2,
      bold: true,
      color: COLORS.navy,
      margin: 0.2,
      fill: { color: COLORS.yellow },
      line: { color: 'FDE68A' },
      fit: 'shrink',
    }
  )

  const prioritySlide = pptx.addSlide()
  addSlideTitle(
    prioritySlide,
    'Response Priority Barangays',
    'Top barangays ranked by risk level, combined multi-source score, response priority, and projected dengue cases.'
  )

  prioritySlide.addTable(
    [
      ['Rank', 'Barangay', 'Risk', 'Response Priority', 'Combined Risk', 'Projected'],
      ...(topBarangays.length > 0
        ? topBarangays.map((row, index) => {
            const decision = getDecisionSupport(row)

            return [
              index + 1,
              row.barangay,
              row.risk,
              decision.priority,
              `${formatNumber(getCanonicalCombinedRiskScore(row))}/100`,
              formatNumber(row.forecast),
            ]
          })
        : [['-', 'No barangay Response data available', '-', '-', '-', '-']]),
    ],
    {
      x: 0.65,
      y: 1.35,
      w: 12,
      h: 2.85,
      fontSize: 10,
      color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 },
      fill: { color: COLORS.white },
      margin: 0.08,
    }
  )

  prioritySlide.addText('Priority Snapshot', {
    x: 0.65,
    y: 4.65,
    w: 4,
    h: 0.3,
    fontSize: 17,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  })

  topBarangays.forEach((row, index) => {
    const decision = getDecisionSupport(row)

    prioritySlide.addText(row.risk || 'Unknown', {
      x: 0.65 + index * 2.42,
      y: 5.1,
      w: 2.05,
      h: 0.34,
      fontSize: 9.5,
      bold: true,
      align: 'center',
      color: getRiskPptColor(row.risk),
      margin: 0.05,
      fill: { color: getRiskPptFill(row.risk) },
      line: { color: getRiskPptColor(row.risk) },
      fit: 'shrink',
    })

    prioritySlide.addText(decision.priority || 'Decision pending', {
      x: 0.65 + index * 2.42,
      y: 5.48,
      w: 2.05,
      h: 0.44,
      fontSize: 8.5,
      bold: true,
      align: 'center',
      color: getPriorityPptColor(decision.priority),
      margin: 0.04,
      fill: { color: getPriorityPptFill(decision.priority) },
      line: { color: getPriorityPptColor(decision.priority) },
      fit: 'shrink',
    })

    prioritySlide.addText(row.barangay || 'Unknown', {
      x: 0.65 + index * 2.42,
      y: 5.98,
      w: 2.05,
      h: 0.52,
      fontSize: 10,
      bold: true,
      align: 'center',
      color: COLORS.navy,
      margin: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
      fit: 'shrink',
    })
  })

  const factorSlide = pptx.addSlide()
  addSlideTitle(
    factorSlide,
    'Combined Risk Factors',
    'Environmental, population, density, and forecast factors used by the Response ranking.'
  )

  factorSlide.addTable(
    [
      ['Barangay', 'Combined Score', 'Environment', 'Rainfall', 'Temperature', 'Humidity'],
      ...(topBarangays.length > 0
        ? topBarangays.map((row) => {
            const profile = getMultiSourceProfile(row)

            return [
              row.barangay,
              `${formatNumber(profile.score)}/100`,
              profile.environmentalSuitability,
              profile.rainfallPressure,
              profile.temperatureSuitability,
              profile.humiditySuitability,
            ]
          })
        : [['No barangay Response data available', '-', '-', '-', '-', '-']]),
    ],
    {
      x: 0.65,
      y: 1.35,
      w: 12,
      h: 3.1,
      fontSize: 8.8,
      color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 },
      fill: { color: COLORS.white },
      margin: 0.06,
    }
  )

  factorSlide.addText(
    topBarangay
      ? `${topBarangay.barangay} currently has a combined prioritization score of ${formatNumber(getMultiSourceProfile(topBarangay).score)}/100. This combines dengue forecast, case movement, rainfall, temperature, humidity, population exposure, and density context.`
      : 'Combined risk factors will appear after dengue, weather, population, and boundary records are available.',
    {
      x: 0.75,
      y: 4.95,
      w: 11.7,
      h: 0.82,
      fontSize: 12.5,
      bold: true,
      color: COLORS.navy,
      margin: 0.14,
      fill: { color: COLORS.lightBlue },
      line: { color: COLORS.paleBlue },
      fit: 'shrink',
    }
  )

  const actionSlide = pptx.addSlide()
  addSlideTitle(
    actionSlide,
    'Top Response Plan',
    topBarangay
      ? `${topBarangay.barangay} is currently the top response priority.`
      : 'No top response plan is available yet.'
  )

  actionSlide.addText(topDecision.summary || 'No Recommended response available yet.', {
    x: 0.78,
    y: 1.25,
    w: 11.85,
    h: 0.8,
    fontSize: 15,
    bold: true,
    color: COLORS.navy,
    margin: 0.16,
    fill: { color: COLORS.yellow },
    line: { color: 'FDE68A' },
    fit: 'shrink',
  })

  const actions =
    topDecision.actions?.length > 0
      ? topDecision.actions.slice(0, 5)
      : ['No action plan available yet.']

  actions.forEach((action, index) => {
    actionSlide.addText(String(index + 1), {
      x: 0.85,
      y: 2.35 + index * 0.78,
      w: 0.42,
      h: 0.42,
      fontSize: 14,
      bold: true,
      align: 'center',
      color: COLORS.white,
      margin: 0.05,
      fill: { color: COLORS.blue },
      line: { color: COLORS.blue },
    })

    actionSlide.addText(action, {
      x: 1.45,
      y: 2.28 + index * 0.78,
      w: 10.55,
      h: 0.56,
      fontSize: 12.5,
      color: COLORS.navy,
      margin: 0.12,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
      fit: 'shrink',
    })
  })

  const sourceSlide = pptx.addSlide()
  addSlideTitle(
    sourceSlide,
    'Uploaded Data Readiness',
    'Check status of uploaded or available files.'
  )

  sourceSlide.addTable(
    [
      ['Dataset', 'Filename', 'Upload Date/Time', 'Total', 'Valid', 'Invalid'],
      ...(officialMetadata.sourceRows?.length > 0
        ? officialMetadata.sourceRows.map((row) => [
            row.dataset,
            row.filename,
            row.uploadedAt,
            formatNumber(row.totalRecords),
            formatNumber(row.validRecords),
            formatNumber(row.invalidRecords),
          ])
        : [['-', 'No uploaded source details available', '-', '-', '-', '-']]),
    ],
    {
      x: 0.65,
      y: 1.35,
      w: 12,
      h: 4.4,
      fontSize: 8.4,
      color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 },
      fill: { color: COLORS.white },
      margin: 0.06,
    }
  )

  sourceSlide.addText('Response Priority Distribution', {
    x: 0.65,
    y: 6.04,
    w: 3.5,
    h: 0.3,
    fontSize: 15,
    bold: true,
    color: COLORS.navy,
    margin: 0,
  })

  sourceSlide.addText(
    priorityDistribution.length > 0
      ? priorityDistribution
          .map((item) => `${item.priority}: ${item.count}`)
          .join('  •  ')
      : 'No Response priority data available yet.',
    {
      x: 4.05,
      y: 5.96,
      w: 8.15,
      h: 0.6,
      fontSize: 10.5,
      color: COLORS.slate,
      margin: 0.08,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
      fit: 'shrink',
    }
  )

  const limitationsSlide = pptx.addSlide()
  addSlideTitle(
    limitationsSlide,
    'Limitations and Assumptions',
    'Important notes for interpreting the report before field implementation.'
  )

  limitationsSlide.addTable(
    [
      ['No.', 'Limitation / Assumption'],
      ...(officialMetadata.limitations || []).map((item, index) => [index + 1, item]),
    ],
    {
      x: 0.75,
      y: 1.45,
      w: 11.8,
      h: 3.2,
      fontSize: 11,
      color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 },
      fill: { color: COLORS.white },
      margin: 0.08,
    }
  )

  limitationsSlide.addText(
    `Top high-risk barangays: ${officialMetadata.topHighRiskBarangays}`,
    {
      x: 0.75,
      y: 5.12,
      w: 11.8,
      h: 0.72,
      fontSize: 13,
      bold: true,
      color: COLORS.navy,
      margin: 0.14,
      fill: { color: COLORS.yellow },
      line: { color: 'FDE68A' },
      fit: 'shrink',
    }
  )

  await pptx.writeFile({
    fileName: `${REPORT_EXPORT_BASENAME}.pptx`,
  })
}

function getReportVisualTheme(tone = 'slate') {
  const themes = {
    blue: {
      surface:
        'border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-cyan-50/75 dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5',
      icon:
        'border-blue-200 bg-white text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200',
      line: 'from-blue-600 via-cyan-400 to-sky-300',
      glow: 'bg-blue-400/20',
      meter: 'from-blue-600 via-sky-400 to-cyan-300',
      chip:
        'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200',
      darkCard: 'from-[#071321]/95 via-[#082039]/90 to-[#0a3550]/80',
    },
    rose: {
      surface:
        'border-rose-200/70 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/75 dark:border-rose-400/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/5',
      icon:
        'border-rose-200 bg-white text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
      line: 'from-rose-600 via-orange-400 to-amber-300',
      glow: 'bg-rose-400/20',
      meter: 'from-rose-600 via-orange-400 to-amber-300',
      chip:
        'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200',
      darkCard: 'from-[#17070e]/95 via-[#2a0b16]/90 to-[#451722]/80',
    },
    amber: {
      surface:
        'border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/75 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/5',
      icon:
        'border-amber-200 bg-white text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
      line: 'from-amber-600 via-orange-400 to-yellow-300',
      glow: 'bg-amber-400/20',
      meter: 'from-amber-600 via-orange-400 to-yellow-300',
      chip:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200',
      darkCard: 'from-[#170e06]/95 via-[#2d1707]/90 to-[#493009]/80',
    },
    emerald: {
      surface:
        'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/75 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5',
      icon:
        'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
      line: 'from-emerald-600 via-teal-400 to-cyan-300',
      glow: 'bg-emerald-400/20',
      meter: 'from-emerald-600 via-teal-400 to-cyan-300',
      chip:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200',
      darkCard: 'from-[#06150f]/95 via-[#08251b]/90 to-[#0b3c2e]/80',
    },
    violet: {
      surface:
        'border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white to-indigo-50/75 dark:border-violet-400/20 dark:from-violet-500/10 dark:via-slate-950 dark:to-indigo-500/5',
      icon:
        'border-violet-200 bg-white text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200',
      line: 'from-violet-600 via-indigo-400 to-cyan-300',
      glow: 'bg-violet-400/20',
      meter: 'from-violet-600 via-indigo-400 to-cyan-300',
      chip:
        'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-200',
      darkCard: 'from-[#10091f]/95 via-[#21113e]/90 to-[#302258]/80',
    },
    slate: {
      surface:
        'border-slate-200/80 bg-gradient-to-br from-slate-50/95 via-white to-blue-50/60 dark:border-slate-700 dark:from-slate-900 dark:via-slate-950 dark:to-blue-950/20',
      icon:
        'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
      line: 'from-slate-600 via-blue-400 to-transparent',
      glow: 'bg-slate-400/15',
      meter: 'from-slate-600 via-blue-400 to-cyan-300',
      chip:
        'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
      darkCard: 'from-[#07101c]/95 via-[#0a1728]/90 to-[#12243a]/80',
    },
  }

  return themes[tone] || themes.slate
}

function getRiskCardTheme(risk) {
  if (risk === 'High') return getReportVisualTheme('rose')
  if (risk === 'Moderate') return getReportVisualTheme('amber')
  if (risk === 'Low') return getReportVisualTheme('emerald')
  return getReportVisualTheme('slate')
}

function StatCard({ label, value, helper, icon: Icon, tone = 'blue' }) {
  const theme = getReportVisualTheme(tone)

  return (
    <article
      className={`group relative min-h-[190px] overflow-hidden rounded-[30px] border p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/75 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_68px_rgba(15,23,42,0.15)] dark:ring-white/5 ${theme.surface}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.line}`} />
      <div className={`pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-125 ${theme.glow}`} />
      <div className="pointer-events-none absolute right-5 top-5 h-20 w-20 rounded-full border border-white/70 opacity-60 dark:border-white/5" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${theme.icon}`}>
            <Icon className="h-5 w-5" strokeWidth={2.25} />
          </div>

          <span className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
            Live report
          </span>
        </div>

        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <h3 className="mt-1 break-words text-3xl font-black tracking-[-0.05em] text-slate-950 dark:text-white">
          {value}
        </h3>

        <div className="mt-auto pt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-slate-800">
            <div className={`h-full w-[72%] rounded-full bg-gradient-to-r ${theme.meter}`} />
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-400">
            {helper}
          </p>
        </div>
      </div>
    </article>
  )
}

function HeroMetric({ label, value, helper, tone = 'blue' }) {
  const theme = getReportVisualTheme(tone)

  return (
    <div className="group/hero-metric relative overflow-hidden rounded-[22px] border border-white/15 bg-gradient-to-br from-white/10 via-slate-950/40 to-cyan-400/5 p-4 shadow-[0_16px_36px_rgba(2,6,23,0.30)] ring-1 ring-white/5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/25">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${theme.line}`} />
      <div className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl ${theme.glow}`} />
      <p className="relative text-[9px] font-black uppercase tracking-[0.16em] text-slate-300">
        {label}
      </p>
      <p className="relative mt-2 text-2xl font-black tracking-[-0.04em] text-white">
        {value}
      </p>
      <p className="relative mt-1 text-[11px] font-semibold leading-5 text-slate-300/80">
        {helper}
      </p>
    </div>
  )
}

function SectionBadge({ icon: Icon, children, tone = 'blue' }) {
  const theme = getReportVisualTheme(tone)

  return (
    <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] shadow-sm ${theme.icon}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
      {children}
    </div>
  )
}

function PremiumPanel({ id, children, className = '', tone = 'slate' }) {
  const theme = getReportVisualTheme(tone)

  return (
    <section
      id={id}
      className={`group relative scroll-mt-28 overflow-hidden rounded-[34px] border shadow-[0_22px_68px_rgba(15,23,42,0.08)] ring-1 ring-white/80 backdrop-blur-xl transition duration-300 hover:shadow-[0_30px_82px_rgba(15,23,42,0.13)] dark:ring-white/5 ${theme.surface} ${className}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.line}`} />
      <div className={`pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-110 ${theme.glow}`} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.022] [background-image:linear-gradient(rgba(15,23,42,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.5)_1px,transparent_1px)] [background-size:34px_34px] dark:opacity-[0.035] dark:[background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)]" />
      <div className="relative z-[1]">{children}</div>
    </section>
  )
}

function DisclosureCard({
  id,
  open,
  onToggle,
  icon: Icon,
  title,
  description,
  summary,
  tone = 'slate',
}) {
  const theme = getReportVisualTheme(tone)

  return (
    <PremiumPanel id={id} tone={tone} className="p-4 sm:p-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group/disclosure flex w-full items-start justify-between gap-4 text-left"
      >
        <div className="flex min-w-0 items-start gap-3.5">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-sm ${theme.icon}`}>
            <Icon className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black tracking-tight text-brand-text dark:text-slate-100 sm:text-xl">
                {title}
              </h2>
              <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] ${theme.chip}`}>
                {open ? 'Expanded' : 'Collapsed'}
              </span>
            </div>

            <p className="mt-1 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">
              {description}
            </p>

            {summary && (
              <span className={`mt-3 inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-black ${theme.chip}`}>
                {summary}
              </span>
            )}
          </div>
        </div>

        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border shadow-sm transition group-hover/disclosure:-translate-y-0.5 ${theme.icon}`}>
          {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
      </button>
    </PremiumPanel>
  )
}

function splitMetadataItems(value, separator = ';') {
  const text = String(value || '').trim()

  if (!text) return []

  return text
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitMetadataLabelValue(item = '') {
  const text = String(item || '').trim()
  const colonIndex = text.indexOf(':')

  if (colonIndex <= 0) {
    return {
      label: '',
      value: text,
    }
  }

  return {
    label: text.slice(0, colonIndex).trim(),
    value: text.slice(colonIndex + 1).trim(),
  }
}

function splitFeatureImportanceItem(item = '') {
  const text = String(item || '').trim()
  const match = text.match(/^(.*)\(([^()]+)\)$/)

  if (!match) {
    return {
      label: text,
      value: '',
    }
  }

  return {
    label: match[1].trim(),
    value: match[2].trim(),
  }
}

function MetadataDetailList({
  value,
  separator = ';',
  itemClassName = 'border-slate-200 bg-white text-brand-text dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200',
  labelClassName = 'text-brand-muted dark:text-slate-500',
  valueClassName = 'text-brand-text dark:text-slate-100',
  dotClassName = 'bg-brand-blue',
  columns = 'grid-cols-1',
  variant = 'plain',
}) {
  const items = splitMetadataItems(value, separator)

  if (!items.length) {
    return (
      <p className="mt-2 text-sm font-bold leading-6 text-brand-muted dark:text-slate-400">
        Not recorded
      </p>
    )
  }

  return (
    <div className={`mt-3 grid gap-2 ${columns}`}>
      {items.map((item, index) => {
        const parsed = variant === 'feature'
          ? splitFeatureImportanceItem(item)
          : splitMetadataLabelValue(item)
        const hasLabel = Boolean(parsed.label)
        const hasValue = Boolean(parsed.value)

        return (
          <div
            key={`${item}-${index}`}
            className={`min-w-0 rounded-2xl border px-3 py-2.5 text-sm font-bold leading-5 ${itemClassName}`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClassName}`} />

              <div className="min-w-0 flex-1">
                {hasLabel && (
                  <p className={`break-words text-[10px] font-black uppercase tracking-[0.13em] ${labelClassName}`}>
                    {parsed.label}
                  </p>
                )}

                {hasValue && (
                  <p className={`break-words ${hasLabel ? 'mt-1' : ''} ${valueClassName}`}>
                    {parsed.value}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ReportsPage() {
  const [searchParams] = useSearchParams()
  const selectedFieldUpdateId = searchParams.get('field_update_id') || ''
  const data = useData()

  const {
    dashboardStats = {},
    riskRows = [],
    sourceStatus = {},
    activityLogs = [],
    backendForecastResult = null,
    backendDengueSummary = null,
    addActivityLog,
    boundaryRecords = [],
    loadLatestSavedBoundaryGeoJson,
    latestModelMetrics: cachedLatestModelMetrics = null,
    loadLatestModelMetricsCached,
    geospatialHotspotResult = null,
    loadGeospatialHotspotsCached,
  } = data

  const [selectedFieldUpdate, setSelectedFieldUpdate] = useState(null)
  const [isLoadingSelectedFieldUpdate, setIsLoadingSelectedFieldUpdate] = useState(false)
  const [selectedFieldUpdateError, setSelectedFieldUpdateError] = useState('')
  const [format, setFormat] = useState('pdf')
  const [showAllPriorityBarangays, setShowAllPriorityBarangays] = useState(false)
  const [expandedPriorityBarangay, setExpandedPriorityBarangay] = useState(null)
  const [hotspotResult, setHotspotResult] = useState(() => geospatialHotspotResult || null)
  const [hotspotError, setHotspotError] = useState('')
  const [isLoadingHotspotReport, setIsLoadingHotspotReport] = useState(false)
  const [latestModelMetrics, setLatestModelMetrics] = useState(() => cachedLatestModelMetrics || null)
  const [isAiSnapshotOpen, setIsAiSnapshotOpen] = useState(false)
  const [isAdditionalIndicatorsOpen, setIsAdditionalIndicatorsOpen] = useState(false)
  const [isHotspotDetailsOpen, setIsHotspotDetailsOpen] = useState(false)
  const [isOfficialDetailsOpen, setIsOfficialDetailsOpen] = useState(false)
  const [isExportDetailsOpen, setIsExportDetailsOpen] = useState(false)
  const [isSupportingDetailsOpen, setIsSupportingDetailsOpen] = useState(false)
  const [isActivityOpen, setIsActivityOpen] = useState(false)
  const [isTopResponseDetailsOpen, setIsTopResponseDetailsOpen] = useState(false)

  const boundaryLoadRequestedRef = useRef(false)

  useEffect(() => {
    if (boundaryRecords.length > 0 || boundaryLoadRequestedRef.current) return
    boundaryLoadRequestedRef.current = true
    Promise.resolve(loadLatestSavedBoundaryGeoJson?.({ silent: true })).finally(() => {
      if (!boundaryRecords.length) boundaryLoadRequestedRef.current = false
    })
  }, [boundaryRecords.length])

  useEffect(() => {
    let active = true

    async function loadSelectedFieldUpdate() {
      if (!selectedFieldUpdateId) {
        setSelectedFieldUpdate(null)
        setSelectedFieldUpdateError('')
        return
      }

      setIsLoadingSelectedFieldUpdate(true)
      setSelectedFieldUpdateError('')
      try {
        const result = await getFieldUpdate(selectedFieldUpdateId)
        if (!active) return
        setSelectedFieldUpdate(result?.field_update || null)
      } catch (error) {
        if (!active) return
        setSelectedFieldUpdate(null)
        setSelectedFieldUpdateError(error?.message || 'The submitted field update could not be loaded.')
      } finally {
        if (active) setIsLoadingSelectedFieldUpdate(false)
      }
    }

    loadSelectedFieldUpdate()
    return () => {
      active = false
    }
  }, [selectedFieldUpdateId])

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

  const weatherRecords = useMemo(() => {
    const candidates = [
      data.weatherRecords,
      data.weatherRows,
      data.weatherData,
      data.weatherDataset,
      data.meteorologicalRecords,
      data.meteorologicalRows,
      data.meteorologicalData,
      data.meteorologicalDataset,
    ]

    return candidates.find((candidate) => Array.isArray(candidate)) || []
  }, [
    data.weatherRecords,
    data.weatherRows,
    data.weatherData,
    data.weatherDataset,
    data.meteorologicalRecords,
    data.meteorologicalRows,
    data.meteorologicalData,
    data.meteorologicalDataset,
  ])

  const boundaryGeoJson = useMemo(() => {
    return getBoundaryGeoJson(boundaryRecords)
  }, [boundaryRecords])

  const boundaryFeatures = useMemo(() => {
    return boundaryGeoJson?.features || []
  }, [boundaryGeoJson])

  useEffect(() => {
    let active = true

    async function loadLatestModelMetrics() {
      if (cachedLatestModelMetrics) {
        setLatestModelMetrics(cachedLatestModelMetrics)
        return
      }

      const result = await loadLatestModelMetricsCached?.({ silent: true })

      if (!active) return
      setLatestModelMetrics(result || null)
    }

    loadLatestModelMetrics()

    return () => {
      active = false
    }
  }, [
    cachedLatestModelMetrics,
    backendForecastResult?.database_forecast_run_id,
    backendForecastResult?.forecast_run?.forecast_run_id,
  ])

  const generatedAt = getCurrentDateTime()
  const usingBackendForecast = hasBackendForecastData(backendForecastResult)

  const displayRiskRows = useMemo(() => {
    if (usingBackendForecast) {
      return buildBackendRiskRows(backendForecastResult, {
        populationRecords,
        boundaryFeatures,
        weatherRecords,
      })
    }

    if (Array.isArray(riskRows) && riskRows.length > 0) {
      return riskRows
    }

    return []
  }, [
    usingBackendForecast,
    backendForecastResult,
    riskRows,
    populationRecords,
    boundaryFeatures,
    weatherRecords,
  ])

  const displayDashboardStats = useMemo(() => {
    if (usingBackendForecast) {
      const backendStats = buildBackendDashboardStats(backendForecastResult, backendDengueSummary)
      return {
        ...backendStats,
        dataQuality: Number(dashboardStats?.dataQuality || backendStats.dataQuality || 0),
      }
    }

    return dashboardStats
  }, [
    usingBackendForecast,
    backendForecastResult,
    backendDengueSummary,
    dashboardStats,
  ])

  const sortedRiskRows = useMemo(() => {
    return getSortedRiskRows(displayRiskRows)
  }, [displayRiskRows])

  useEffect(() => {
    let active = true

    async function loadReportHotspots() {
      if (!usingBackendForecast && !Number(sourceStatus?.boundary?.validCount || 0)) {
        return
      }

      if (geospatialHotspotResult) {
        setHotspotResult(geospatialHotspotResult)
        setHotspotError('')
        setIsLoadingHotspotReport(false)
        return
      }

      setIsLoadingHotspotReport(true)

      try {
        const result = await loadGeospatialHotspotsCached?.({ silent: true })

        if (!active) return

        if (!result) {
          throw new Error('Hotspot summary is not available yet.')
        }

        setHotspotResult(result)
        setHotspotError('')
      } catch (error) {
        if (!active) return

        setHotspotError(
          error?.message ||
            'Hotspot summary is not available yet. Upload the map file and generate the dengue forecast first.'
        )
      } finally {
        if (active) {
          setIsLoadingHotspotReport(false)
        }
      }
    }

    loadReportHotspots()

    return () => {
      active = false
    }
  }, [
    usingBackendForecast,
    sourceStatus?.boundary?.validCount,
    geospatialHotspotResult,
    backendForecastResult?.database_forecast_run_id,
    backendForecastResult?.forecast_run?.forecast_run_id,
  ])


  const rawHotspotRows = useMemo(() => {
    return Array.isArray(hotspotResult?.hotspots) ? hotspotResult.hotspots : []
  }, [hotspotResult])

  const hotspotRows = useMemo(() => {
    return reconcileHotspotRows(rawHotspotRows, sortedRiskRows)
  }, [rawHotspotRows, sortedRiskRows])

  const hotspotCounts = getHotspotCounts(hotspotRows)
  const hotspotCountTotal = getHotspotCountTotal(hotspotCounts)
  const hotspotPriorityCount = hotspotCounts.confirmed + hotspotCounts.emerging
  const hotspotSummary = useMemo(() => {
    return buildReconciledHotspotSummary(
      hotspotResult?.summary || null,
      hotspotCounts,
      sortedRiskRows.length
    )
  }, [hotspotResult, hotspotCounts, sortedRiskRows.length])
  const rankedHotspotRows = useMemo(() => {
    return getRankedHotspotRows(hotspotRows)
  }, [hotspotRows])
  const mapReviewHotspotRows = useMemo(() => {
    return hotspotRows.filter((row) => isHotspotMapReviewRow(row))
  }, [hotspotRows])
  const reportDataSourceLabel = getReportDataSourceLabel(usingBackendForecast)
  const officialReportMetadata = useMemo(() => {
    return getOfficialReportMetadata({
      sourceStatus,
      backendForecastResult,
      latestModelMetrics,
      generatedAt,
      sortedRiskRows,
      usingBackendForecast,
    })
  }, [sourceStatus, backendForecastResult, latestModelMetrics, generatedAt, sortedRiskRows, usingBackendForecast])
  const officialSourceRows = officialReportMetadata.sourceRows || []
  const hasUploadedDataIssues = useMemo(() => {
    const sourceEntries = Object.entries(sourceStatus || {})

    if (!sourceEntries.length) return true

    return sourceEntries.some(([, item = {}]) => {
      const badge = String(item.badge || item.status || '').toLowerCase()
      const invalidCount = Number(item.invalidCount || item.invalidRecords || item.invalid_records || 0)
      const hasFile = Boolean(item.uploadedName || item.filename || item.file_name)

      return (
        !hasFile ||
        invalidCount > 0 ||
        badge.includes('review') ||
        badge.includes('pending') ||
        badge.includes('missing') ||
        badge.includes('error') ||
        badge.includes('failed')
      )
    })
  }, [sourceStatus])

  const hasHotspotIssues = Boolean(
    hotspotError ||
      hotspotCounts.needsReview > 0 ||
      (!isLoadingHotspotReport && hotspotRows.length === 0)
  )

  useEffect(() => {
    if (hasUploadedDataIssues) {
      setIsSupportingDetailsOpen(true)
    }
  }, [hasUploadedDataIssues])

  useEffect(() => {
    if (hasHotspotIssues) {
      setIsHotspotDetailsOpen(true)
    }
  }, [hasHotspotIssues])

  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const topBarangays = sortedRiskRows.slice(0, 5)
  const visibleTopBarangays = showAllPriorityBarangays
    ? topBarangays
    : topBarangays.slice(0, 3)

  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)
  const topProfile = getMultiSourceProfile(topBarangay)
  const averageMultiSourceScore = getAverageMultiSourceScore(sortedRiskRows)

  const selectedExport = exportFormats.find((item) => item.id === format) || exportFormats[0]
  const SelectedExportIcon = selectedExport.icon
  const selectedOutputTone =
    format === 'pdf'
      ? 'rose'
      : format === 'excel'
        ? 'emerald'
        : format === 'powerpoint'
          ? 'blue'
          : 'amber'
  const selectedOutputTheme = getReportVisualTheme(selectedOutputTone)

  const reportSummary = useMemo(() => {
    return getReportSummary({
      sortedRiskRows,
      dashboardStats: displayDashboardStats,
    })
  }, [sortedRiskRows, displayDashboardStats])


  function getReportFilePath(formatLabel) {
    if (formatLabel === 'PDF') {
      return `local_download:${REPORT_EXPORT_BASENAME}.pdf`
    }

    if (formatLabel === 'Excel') {
      return `local_download:${REPORT_EXPORT_BASENAME}.xlsx`
    }

    if (formatLabel === 'PowerPoint') {
      return `local_download:${REPORT_EXPORT_BASENAME}.pptx`
    }

    return 'browser_print_view'
  }

  function getForecastRunId() {
    return (
      backendForecastResult?.database_forecast_run_id ||
      backendForecastResult?.forecast_run?.forecast_run_id ||
      backendForecastResult?.forecast_run_id ||
      null
    )
  }

  function buildReportStorageSummary(reportMetadataForExport = {}) {
    const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)

    return {
      totalCases: Number(displayDashboardStats.totalCases || 0),
      forecastTotal: Number(displayDashboardStats.fourWeekForecast || 0),
      dataQuality: Number(displayDashboardStats.dataQuality || 0),
      priorityBarangayCount: sortedRiskRows.length,
      urgentAlertCount: decisionCounts.urgent,
      highRiskBarangayCount: highRiskCount,
      moderateRiskBarangayCount: moderateRiskCount,
      lowRiskBarangayCount: lowRiskCount,
      confirmedHotspotCount: hotspotCounts.confirmed,
      emergingHotspotCount: hotspotCounts.emerging,
      watchAreaCount: hotspotCounts.watch,
      lowSpatialConcernCount: hotspotCounts.low,
      mapReviewCount: hotspotCounts.needsReview,
      hotspotNotCheckedCount: hotspotCounts.notChecked,
      hotspotAccountedBarangayCount: hotspotCountTotal,
      hotspotPriorityCount,
      topBarangay: topBarangay?.barangay || '',
      topPriority: topDecision?.priority || '',
      reportDataSource: reportDataSourceLabel,
      topHighRiskBarangays: reportMetadataForExport.topHighRiskBarangays || '',
    }
  }

  async function recordReportGenerated(formatLabel, exportedAt, exportedAtIso, reportMetadataForExport) {
    const metadataForStorage = {
      ...reportMetadataForExport,
      generatedAtDisplay: exportedAt,
      generatedAtIso: exportedAtIso,
      reportDataSource: reportDataSourceLabel,
      hotspotSummary,
      hotspotCounts,
    }

    try {
      await saveGeneratedReport({
        report_code: reportMetadataForExport.reportId,
        report_type: formatLabel,
        report_title: REPORT_TITLE,
        generated_by: reportMetadataForExport.generatedBy,
        generated_role: reportMetadataForExport.role,
        generated_at: exportedAtIso,
        forecast_run_id: getForecastRunId(),
        file_path: getReportFilePath(formatLabel),
        export_status: 'generated',
        metadata: metadataForStorage,
        summary: buildReportStorageSummary(reportMetadataForExport),
      })
    } catch (error) {
      addActivityLog?.(
        'Report record not saved',
        error?.message || 'The report was exported, but its database record could not be saved.'
      )
    }

    try {
      await createBackendNotificationEvent({
        title: 'Report generated',
        message: `${formatLabel} response planning report was generated at ${exportedAt}.`,
        severity: 'success',
        category: 'report_generated',
        to: '/reports',
        hash: 'export-center',
        meta: {
          format: formatLabel,
          generatedAt: exportedAt,
          priorityBarangayCount: sortedRiskRows.length,
          hotspotCount: hotspotPriorityCount,
          reportDataSource: reportDataSourceLabel,
          reportId: reportMetadataForExport.reportId,
          generatedBy: reportMetadataForExport.generatedBy,
          role: reportMetadataForExport.role,
        },
      })
    } catch {
      // Keep report export usable even when the backend notification service is offline.
    }
  }


  async function handleExport() {
    const title = REPORT_TITLE
    const exportedAt = getCurrentDateTime()
    const exportedAtIso = new Date().toISOString()
    const reportMetadataForExport = getOfficialReportMetadata({
      sourceStatus,
      backendForecastResult,
      latestModelMetrics,
      generatedAt: exportedAt,
      sortedRiskRows,
      usingBackendForecast,
    })

    let exportHotspotRows = hotspotRows
let exportHotspotSummary = hotspotSummary

try {
  const latestHotspotResult = await loadGeospatialHotspotsCached?.({
    silent: true,
  })
  const latestRawHotspotRows = Array.isArray(latestHotspotResult?.hotspots)
    ? latestHotspotResult.hotspots
    : rawHotspotRows

  exportHotspotRows = reconcileHotspotRows(latestRawHotspotRows, sortedRiskRows)

  const exportHotspotCounts = getHotspotCounts(exportHotspotRows)
  exportHotspotSummary = buildReconciledHotspotSummary(
    latestHotspotResult?.summary || hotspotSummary,
    exportHotspotCounts,
    sortedRiskRows.length
  )
} catch {
  exportHotspotRows = hotspotRows
  exportHotspotSummary = hotspotSummary
}

const exportPayload = {
  dashboardStats: displayDashboardStats,
  riskRows: sortedRiskRows,
  sourceStatus,
  generatedAt: exportedAt,
  hotspotRows: exportHotspotRows,
  hotspotSummary: exportHotspotSummary,
  dataSourceLabel: reportDataSourceLabel,
  reportMetadata: reportMetadataForExport,
}

    if (format === 'pdf') {
      downloadPdfReport({
        ...exportPayload,
        title,
      })

      addActivityLog?.('Report exported', 'PDF response planning report downloaded directly.')
      await recordReportGenerated('PDF', exportedAt, exportedAtIso, reportMetadataForExport)
      return
    }

    if (format === 'excel') {
      downloadExcelWorkbook(exportPayload)

      addActivityLog?.('Report exported', 'Excel response planning workbook downloaded as an XLSX file.')
      await recordReportGenerated('Excel', exportedAt, exportedAtIso, reportMetadataForExport)
      return
    }

    if (format === 'powerpoint') {
      await downloadPowerPointDeck(exportPayload)

      addActivityLog?.(
        'Report exported',
        'PowerPoint response planning briefing deck generated and downloaded as a PPTX file.'
      )
      await recordReportGenerated('PowerPoint', exportedAt, exportedAtIso, reportMetadataForExport)

      return
    }

    openPrintableReport({
      ...exportPayload,
      title,
    })

    addActivityLog?.('Print view opened', 'Printable response planning report opened for manual printing.')
    await recordReportGenerated('Printable', exportedAt, exportedAtIso, reportMetadataForExport)
  }


  return (
    <div className="reports-mobile-compact relative space-y-6 pb-10">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 rounded-full bg-blue-100/70 blur-3xl dark:bg-blue-500/10" />


      <style>{`
        @media (max-width: 639px) {
          .reports-mobile-compact {
            gap: 0.75rem;
            padding-bottom: 1.25rem;
          }

          .reports-mobile-compact section,
          .reports-mobile-compact [id="official-report-details"],
          .reports-mobile-compact [id="decision-brief"],
          .reports-mobile-compact [id="export-center"],
          .reports-mobile-compact .rounded-\[34px\],
          .reports-mobile-compact .rounded-\[36px\],
          .reports-mobile-compact .rounded-\[30px\],
          .reports-mobile-compact .rounded-\[28px\] {
            border-radius: 1.25rem !important;
          }

          .reports-mobile-compact section,
          .reports-mobile-compact .p-6,
          .reports-mobile-compact .sm\:p-6,
          .reports-mobile-compact .p-5,
          .reports-mobile-compact .sm\:p-5 {
            padding: 0.85rem !important;
          }

          .reports-mobile-compact h1 {
            font-size: 1.75rem !important;
            line-height: 2.05rem !important;
          }

          .reports-mobile-compact h2 {
            font-size: 1.15rem !important;
            line-height: 1.45rem !important;
          }

          .reports-mobile-compact h3 {
            font-size: 1rem !important;
            line-height: 1.3rem !important;
          }

          .reports-mobile-compact p {
            line-height: 1.35rem;
          }

          .reports-mobile-compact .gap-6 {
            gap: 0.85rem !important;
          }

          .reports-mobile-compact .gap-5,
          .reports-mobile-compact .gap-4 {
            gap: 0.7rem !important;
          }

          .reports-mobile-compact .mt-6,
          .reports-mobile-compact .mt-5,
          .reports-mobile-compact .mt-4 {
            margin-top: 0.75rem !important;
          }

          .reports-mobile-compact .text-3xl {
            font-size: 1.45rem !important;
            line-height: 1.75rem !important;
          }

          .reports-mobile-compact .text-2xl {
            font-size: 1.2rem !important;
            line-height: 1.45rem !important;
          }

          .reports-mobile-compact .text-xl {
            font-size: 1.05rem !important;
            line-height: 1.35rem !important;
          }

          .reports-mobile-compact .h-14,
          .reports-mobile-compact .w-14 {
            height: 2.5rem !important;
            width: 2.5rem !important;
          }

          .reports-mobile-compact .h-12,
          .reports-mobile-compact .w-12,
          .reports-mobile-compact .h-11,
          .reports-mobile-compact .w-11 {
            height: 2.25rem !important;
            width: 2.25rem !important;
          }

          .reports-mobile-compact .h-10,
          .reports-mobile-compact .w-10 {
            height: 2rem !important;
            width: 2rem !important;
          }

          .reports-mobile-compact .p-4 {
            padding: 0.65rem !important;
          }

          .reports-mobile-compact .px-5 {
            padding-left: 0.85rem !important;
            padding-right: 0.85rem !important;
          }

          .reports-mobile-compact .py-4,
          .reports-mobile-compact .py-3\.5,
          .reports-mobile-compact .py-3 {
            padding-top: 0.6rem !important;
            padding-bottom: 0.6rem !important;
          }

          .reports-mobile-compact .min-h-\[78px\] {
            min-height: 3.5rem !important;
          }

          .reports-mobile-compact table {
            font-size: 0.72rem;
          }

          .reports-mobile-compact th,
          .reports-mobile-compact td {
            padding: 0.55rem 0.65rem !important;
          }

          .reports-mobile-compact .overflow-x-auto {
            -webkit-overflow-scrolling: touch;
          }

          .reports-mobile-compact .break-words,
          .reports-mobile-compact .break-all {
            overflow-wrap: anywhere;
          }
        }

        /* =========================================================
           FINAL REPORTS RESPONSIVE STABILIZATION
           Page-local only. Export/report-generation logic unchanged.
           ========================================================= */
        @media (max-width: 639px) {
          .reports-mobile-compact {
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
            padding-bottom: 1rem !important;
          }

          .reports-mobile-compact > * + * {
            margin-top: 0.8rem !important;
          }

          /* HERO */
          .reports-mobile-compact .reports-hero-panel {
            min-height: 0 !important;
            border-radius: 24px !important;
          }

          .reports-mobile-compact .reports-hero-layout {
            min-height: 0 !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 1rem !important;
            padding: 1rem !important;
          }

          .reports-mobile-compact .reports-hero-panel h1 {
            margin-top: 1rem !important;
            max-width: 100% !important;
            font-size: 1.9rem !important;
            line-height: 1.04 !important;
            letter-spacing: -0.045em !important;
          }

          .reports-mobile-compact .reports-hero-panel h1 + p {
            display: block !important;
            margin-top: 0.75rem !important;
            overflow: visible !important;
            -webkit-line-clamp: unset !important;
            font-size: 0.82rem !important;
            line-height: 1.5 !important;
          }

          /* Four hero report indicators = clean 2x2 */
          .reports-mobile-compact .reports-hero-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
            margin-top: 1rem !important;
          }

          .reports-mobile-compact .reports-hero-metrics > div {
            min-width: 0 !important;
            min-height: 116px !important;
            border-radius: 17px !important;
            padding: 0.7rem !important;
          }

          .reports-mobile-compact .reports-hero-metrics p:first-child {
            font-size: 0.64rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.055em !important;
          }

          .reports-mobile-compact .reports-hero-metrics p:nth-child(2) {
            margin-top: 0.4rem !important;
            font-size: 1.15rem !important;
            line-height: 1.05 !important;
            overflow-wrap: anywhere !important;
          }

          .reports-mobile-compact .reports-hero-metrics p:last-child {
            margin-top: 0.3rem !important;
            font-size: 0.68rem !important;
            line-height: 1.28 !important;
          }

          /* Selected output card */
          .reports-mobile-compact .reports-selected-output {
            border-radius: 20px !important;
            padding: 0.85rem !important;
          }

          .reports-mobile-compact .reports-selected-output > .flex.items-start {
            gap: 0.7rem !important;
          }

          .reports-mobile-compact .reports-selected-output .h-14.w-14 {
            width: 2.5rem !important;
            height: 2.5rem !important;
            border-radius: 14px !important;
          }

          .reports-mobile-compact .reports-selected-output h2 {
            font-size: 1.15rem !important;
            line-height: 1.15 !important;
          }

          .reports-mobile-compact .reports-selected-output .relative.mt-5.rounded-\[24px\] {
            border-radius: 15px !important;
            padding: 0.65rem !important;
          }

          .reports-mobile-compact .reports-selected-output > button {
            min-height: 52px !important;
            border-radius: 15px !important;
            padding: 0.65rem !important;
          }

          .reports-mobile-compact .reports-selected-output > button .h-12.w-12 {
            width: 2.15rem !important;
            height: 2.15rem !important;
            border-radius: 12px !important;
          }

          /* DISCLOSURE HEADERS */
          .reports-mobile-compact section > button.group\/disclosure {
            gap: 0.65rem !important;
          }

          .reports-mobile-compact section > button.group\/disclosure .h-12.w-12 {
            width: 2.25rem !important;
            height: 2.25rem !important;
            border-radius: 13px !important;
          }

          .reports-mobile-compact section > button.group\/disclosure h2 {
            font-size: 1rem !important;
            line-height: 1.22 !important;
          }

          .reports-mobile-compact section > button.group\/disclosure h2 + span {
            font-size: 0.58rem !important;
          }

          .reports-mobile-compact section > button.group\/disclosure p {
            margin-top: 0.3rem !important;
            font-size: 0.74rem !important;
            line-height: 1.35 !important;
          }

          .reports-mobile-compact section > button.group\/disclosure .mt-3.inline-flex {
            max-width: 100% !important;
            white-space: normal !important;
            font-size: 0.66rem !important;
            line-height: 1.25 !important;
          }

          /* ADDITIONAL INDICATORS: 5 cards = 2 + 2 + 1 */
          .reports-mobile-compact .reports-additional-indicators {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
          }

          .reports-mobile-compact .reports-additional-indicators > article {
            min-width: 0 !important;
            min-height: 148px !important;
            border-radius: 18px !important;
            padding: 0.7rem !important;
          }

          .reports-mobile-compact .reports-additional-indicators > article:last-child:nth-child(odd) {
            grid-column: 1 / -1 !important;
          }

          .reports-mobile-compact .reports-additional-indicators .h-12.w-12 {
            width: 2rem !important;
            height: 2rem !important;
            border-radius: 12px !important;
          }

          .reports-mobile-compact .reports-additional-indicators .text-3xl {
            font-size: 1.15rem !important;
            line-height: 1.08 !important;
          }

          .reports-mobile-compact .reports-additional-indicators article p:last-child {
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.68rem !important;
            line-height: 1.28 !important;
          }

          /* Readiness / hotspot notification banners */
          .reports-mobile-compact > .relative.overflow-hidden.rounded-\[28px\].border {
            padding: 0.75rem !important;
            border-radius: 17px !important;
          }

          .reports-mobile-compact > .relative.overflow-hidden.rounded-\[28px\].border .relative.flex.items-start {
            gap: 0.6rem !important;
          }

          /* HOTSPOT COUNTS = 2 x 3 */
          .reports-mobile-compact .reports-hotspot-count-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .reports-mobile-compact .reports-hotspot-count-grid > div {
            min-width: 0 !important;
            min-height: 88px !important;
            border-radius: 15px !important;
            padding: 0.65rem !important;
          }

          .reports-mobile-compact .reports-hotspot-count-grid p:first-child {
            font-size: 0.64rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.05em !important;
          }

          .reports-mobile-compact .reports-hotspot-count-grid p:last-child {
            font-size: 1.05rem !important;
          }

          /* Hotspot ranked rows stay one per row because descriptions are long */
          .reports-mobile-compact #hotspot-analysis-details + section .mt-4.space-y-2 > div {
            border-radius: 16px !important;
            padding: 0.7rem !important;
          }

          .reports-mobile-compact #hotspot-analysis-details + section .mt-4.space-y-2 > div .flex.flex-wrap {
            width: 100% !important;
          }

          /* OFFICIAL REPORT METADATA */
          .reports-mobile-compact #official-report-details {
            overflow: hidden !important;
          }

          .reports-mobile-compact #official-report-details > .relative.overflow-hidden {
            padding: 0.8rem !important;
          }

          .reports-mobile-compact .reports-metadata-highlight-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .reports-mobile-compact .reports-metadata-highlight-grid > div {
            min-width: 0 !important;
            min-height: 104px !important;
            border-radius: 15px !important;
            padding: 0.6rem !important;
          }

          .reports-mobile-compact .reports-metadata-highlight-grid .h-9.w-9 {
            width: 1.85rem !important;
            height: 1.85rem !important;
            margin-bottom: 0.45rem !important;
            border-radius: 10px !important;
          }

          .reports-mobile-compact .reports-metadata-highlight-grid p:last-child {
            font-size: 0.72rem !important;
            line-height: 1.25 !important;
            overflow-wrap: anywhere !important;
          }

          .reports-mobile-compact #official-report-details > .p-5 {
            padding: 0.65rem !important;
          }

          /* AI model snapshot metric grid remains 2x2 */
          .reports-mobile-compact #official-report-details .grid.grid-cols-2.gap-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          /* DECISION + EXPORT workspace */
          .reports-mobile-compact .reports-decision-export-layout {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.75rem !important;
          }

          .reports-mobile-compact #decision-brief,
          .reports-mobile-compact #export-center {
            position: static !important;
            width: 100% !important;
            min-width: 0 !important;
            border-radius: 20px !important;
            padding: 0.8rem !important;
          }

          /* Main response summary remains 1 per row because these are sentences */
          .reports-mobile-compact .reports-main-summary-list {
            gap: 0.5rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list > div {
            border-radius: 15px !important;
            padding: 0.65rem !important;
            gap: 0.55rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list .h-8.w-8 {
            width: 1.75rem !important;
            height: 1.75rem !important;
          }

          /* Priority barangays: one wide card per row */
          .reports-mobile-compact #priority-barangays {
            border-radius: 17px !important;
            padding: 0.7rem !important;
          }

          .reports-mobile-compact #priority-barangays > .flex:first-child > div:last-child {
            width: 100% !important;
            justify-content: center !important;
          }

          .reports-mobile-compact .reports-priority-list {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.55rem !important;
          }

          .reports-mobile-compact .reports-priority-card {
            min-width: 0 !important;
            border-radius: 16px !important;
            padding: 0.7rem !important;
          }

          .reports-mobile-compact .reports-priority-card .h-12.w-12 {
            width: 2.25rem !important;
            height: 2.25rem !important;
            border-radius: 12px !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 {
            gap: 0.35rem !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 > span {
            max-width: 100% !important;
            white-space: normal !important;
            padding: 0.3rem 0.45rem !important;
            font-size: 0.64rem !important;
            line-height: 1.15 !important;
          }

          .reports-mobile-compact .reports-priority-card .relative.mt-3.rounded-\[20px\] {
            border-radius: 13px !important;
            padding: 0.6rem !important;
          }

          .reports-mobile-compact .reports-priority-card .mt-3.flex.justify-end > button {
            width: 100% !important;
            min-height: 40px !important;
            justify-content: center !important;
          }

          /* EXPORT FORMAT CARDS = 2x2 */
          .reports-mobile-compact .reports-export-format-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .reports-mobile-compact .reports-export-format-grid > button {
            min-width: 0 !important;
            min-height: 132px !important;
            border-radius: 16px !important;
            padding: 0.65rem !important;
          }

          .reports-mobile-compact .reports-export-format-grid > button .flex.items-start {
            flex-direction: column !important;
            gap: 0.55rem !important;
          }

          .reports-mobile-compact .reports-export-format-grid > button .h-11.w-11 {
            width: 2rem !important;
            height: 2rem !important;
            border-radius: 11px !important;
          }

          .reports-mobile-compact .reports-export-format-grid > button span.font-black {
            font-size: 0.76rem !important;
            line-height: 1.2 !important;
          }

          .reports-mobile-compact .reports-export-format-grid > button span.block {
            display: -webkit-box !important;
            -webkit-line-clamp: 3 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.66rem !important;
            line-height: 1.3 !important;
          }

          .reports-mobile-compact #export-center > button {
            min-height: 46px !important;
            border-radius: 14px !important;
          }

          /* Top Response Plan: six factors = 2 x 3, not 3 cramped columns */
          .reports-mobile-compact .reports-top-factor-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .reports-mobile-compact .reports-top-factor-grid > div {
            min-width: 0 !important;
            min-height: 72px !important;
            border-radius: 12px !important;
            padding: 0.55rem !important;
          }

          .reports-mobile-compact .reports-top-factor-grid p:first-child {
            font-size: 0.61rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.045em !important;
          }

          .reports-mobile-compact .reports-top-factor-grid p:last-child {
            font-size: 0.68rem !important;
            line-height: 1.25 !important;
            overflow-wrap: anywhere !important;
          }

          /* SUPPORTING DETAILS */
          .reports-mobile-compact .reports-supporting-layout {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.75rem !important;
          }

          /* Distribution descriptions are labels, so use a compact 2x2 grid */
          .reports-mobile-compact .reports-distribution-list {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .reports-mobile-compact .reports-distribution-list > div {
            min-width: 0 !important;
            min-height: 110px !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: space-between !important;
            border-radius: 15px !important;
            padding: 0.65rem !important;
          }

          .reports-mobile-compact .reports-distribution-list > div > div {
            align-items: flex-start !important;
            gap: 0.5rem !important;
          }

          .reports-mobile-compact .reports-distribution-list .h-10.w-10 {
            width: 1.9rem !important;
            height: 1.9rem !important;
            border-radius: 10px !important;
          }

          .reports-mobile-compact .reports-distribution-list span.text-sm {
            font-size: 0.72rem !important;
            line-height: 1.25 !important;
            overflow-wrap: anywhere !important;
          }

          .reports-mobile-compact .reports-distribution-list > div > span:last-child {
            padding: 0.28rem 0.45rem !important;
            font-size: 0.62rem !important;
          }

          /* Uploaded datasets = 2 columns where filenames can wrap */
          .reports-mobile-compact .reports-source-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .reports-mobile-compact .reports-source-grid > div {
            min-width: 0 !important;
            border-radius: 15px !important;
            padding: 0.65rem !important;
          }

          .reports-mobile-compact .reports-source-grid p.break-all {
            word-break: break-word !important;
            overflow-wrap: anywhere !important;
            font-size: 0.66rem !important;
            line-height: 1.3 !important;
          }

          .reports-mobile-compact .reports-source-grid .mt-4.rounded-2xl {
            margin-top: 0.55rem !important;
            padding: 0.5rem !important;
            font-size: 0.66rem !important;
            line-height: 1.3 !important;
          }

          /* Activity descriptions stay one card per row */
          .reports-mobile-compact .reports-activity-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.5rem !important;
          }

          .reports-mobile-compact .reports-activity-grid > div {
            border-radius: 15px !important;
            padding: 0.7rem !important;
          }

          /* Maintain readable body text despite original broad mobile shrinking */
          .reports-mobile-compact .text-sm {
            font-size: 0.8rem !important;
            line-height: 1.4 !important;
          }

          .reports-mobile-compact .text-xs {
            font-size: 0.72rem !important;
            line-height: 1.35 !important;
          }

          .reports-mobile-compact .text-\[11px\] {
            font-size: 0.68rem !important;
            line-height: 1.28 !important;
          }

          .reports-mobile-compact .text-\[10px\] {
            font-size: 0.65rem !important;
            line-height: 1.22 !important;
          }

          /* Data tables remain horizontally scrollable rather than squeezed. */
          .reports-mobile-compact .overflow-x-auto {
            max-width: 100% !important;
            overflow-x: auto !important;
            overscroll-behavior-x: contain !important;
            -webkit-overflow-scrolling: touch !important;
            touch-action: pan-x pan-y !important;
          }
        }

        /* Very narrow phones: reduce only the grids that truly need it. */
        @media (max-width: 374px) {
          .reports-mobile-compact .reports-hero-metrics,
          .reports-mobile-compact .reports-additional-indicators,
          .reports-mobile-compact .reports-export-format-grid,
          .reports-mobile-compact .reports-distribution-list,
          .reports-mobile-compact .reports-source-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .reports-mobile-compact .reports-additional-indicators > article:last-child:nth-child(odd) {
            grid-column: auto !important;
          }

          .reports-mobile-compact .reports-hotspot-count-grid,
          .reports-mobile-compact .reports-metadata-highlight-grid,
          .reports-mobile-compact .reports-top-factor-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        /* Tablet portrait / compact laptop: keep the two main workspaces stacked. */
        @media (min-width: 640px) and (max-width: 1023px) {
          .reports-mobile-compact .reports-hero-layout,
          .reports-mobile-compact .reports-decision-export-layout,
          .reports-mobile-compact .reports-supporting-layout {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .reports-mobile-compact .reports-additional-indicators {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .reports-mobile-compact .reports-additional-indicators > article:last-child {
            grid-column: span 1 !important;
          }

          .reports-mobile-compact .reports-activity-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }


        /* =========================================================
           REPORTS MOBILE — PRESERVE CARD GRIDS
           Keeps the dashboard-like grid appearance on phones while
           reducing card chrome and typography enough for content to fit.
           ========================================================= */
        @media (max-width: 639px) {
          /* Main response summary = 2 x 2 */
          .reports-mobile-compact .reports-main-summary-list {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list > div {
            min-width: 0 !important;
            min-height: 132px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.45rem !important;
            border-radius: 14px !important;
            padding: 0.58rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list .h-8.w-8 {
            width: 1.65rem !important;
            height: 1.65rem !important;
            font-size: 0.64rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list p {
            display: -webkit-box !important;
            -webkit-line-clamp: 5 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.68rem !important;
            line-height: 1.3 !important;
          }

          /* Priority barangays = 2-column card grid */
          .reports-mobile-compact .reports-priority-list {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            align-items: stretch !important;
            gap: 0.5rem !important;
          }

          .reports-mobile-compact .reports-priority-card {
            min-width: 0 !important;
            min-height: 250px !important;
            display: flex !important;
            flex-direction: column !important;
            border-radius: 15px !important;
            padding: 0.6rem !important;
          }

          .reports-mobile-compact .reports-priority-card > .flex.flex-col.gap-3 {
            gap: 0.5rem !important;
          }

          .reports-mobile-compact .reports-priority-card > .flex.flex-col.gap-3 > div:first-child {
            min-width: 0 !important;
            gap: 0.45rem !important;
          }

          .reports-mobile-compact .reports-priority-card .h-12.w-12 {
            width: 1.9rem !important;
            height: 1.9rem !important;
            border-radius: 10px !important;
            font-size: 0.65rem !important;
          }

          .reports-mobile-compact .reports-priority-card p.font-black {
            font-size: 0.75rem !important;
            line-height: 1.2 !important;
          }

          .reports-mobile-compact .reports-priority-card p.text-xs {
            font-size: 0.64rem !important;
            line-height: 1.2 !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 {
            gap: 0.25rem !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 > span {
            max-width: 100% !important;
            padding: 0.24rem 0.34rem !important;
            font-size: 0.57rem !important;
            line-height: 1.1 !important;
            letter-spacing: 0 !important;
          }

          .reports-mobile-compact .reports-priority-card .relative.mt-3.rounded-\[20px\] {
            flex: 1 1 auto !important;
            margin-top: 0.5rem !important;
            border-radius: 11px !important;
            padding: 0.5rem !important;
          }

          .reports-mobile-compact .reports-priority-card .relative.mt-3.rounded-\[20px\] p:first-child {
            font-size: 0.57rem !important;
            line-height: 1.1 !important;
          }

          .reports-mobile-compact .reports-priority-card .relative.mt-3.rounded-\[20px\] p:last-child {
            display: -webkit-box !important;
            margin-top: 0.3rem !important;
            -webkit-line-clamp: 4 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.66rem !important;
            line-height: 1.28 !important;
          }

          .reports-mobile-compact .reports-priority-card .mt-3.flex.justify-end {
            margin-top: 0.5rem !important;
          }

          .reports-mobile-compact .reports-priority-card .mt-3.flex.justify-end > button {
            min-height: 36px !important;
            padding: 0.45rem 0.5rem !important;
            font-size: 0.64rem !important;
          }

          /* Recent activity = 2 + 1 grid */
          .reports-mobile-compact .reports-activity-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .reports-mobile-compact .reports-activity-grid > div {
            min-width: 0 !important;
            min-height: 132px !important;
            border-radius: 14px !important;
            padding: 0.58rem !important;
          }

          .reports-mobile-compact .reports-activity-grid > div:last-child:nth-child(odd) {
            grid-column: 1 / -1 !important;
          }

          .reports-mobile-compact .reports-activity-grid p:first-child {
            font-size: 0.72rem !important;
            line-height: 1.22 !important;
          }

          .reports-mobile-compact .reports-activity-grid p:nth-child(2) {
            font-size: 0.61rem !important;
            line-height: 1.2 !important;
          }

          .reports-mobile-compact .reports-activity-grid p:last-child {
            display: -webkit-box !important;
            -webkit-line-clamp: 3 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.66rem !important;
            line-height: 1.28 !important;
          }

          /* Keep the already-useful card grids compact rather than stacking. */
          .reports-mobile-compact .reports-hero-metrics,
          .reports-mobile-compact .reports-additional-indicators,
          .reports-mobile-compact .reports-hotspot-count-grid,
          .reports-mobile-compact .reports-metadata-highlight-grid,
          .reports-mobile-compact .reports-export-format-grid,
          .reports-mobile-compact .reports-top-factor-grid,
          .reports-mobile-compact .reports-distribution-list,
          .reports-mobile-compact .reports-source-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          /* 5 additional indicator cards = 2 + 2 + 1 */
          .reports-mobile-compact .reports-additional-indicators > article:last-child:nth-child(odd) {
            grid-column: 1 / -1 !important;
          }

          /* Export cards: slightly shorter and tighter, still 2 x 2 */
          .reports-mobile-compact .reports-export-format-grid > button {
            min-height: 118px !important;
            padding: 0.55rem !important;
          }

          .reports-mobile-compact .reports-export-format-grid > button span.font-black {
            font-size: 0.72rem !important;
          }

          .reports-mobile-compact .reports-export-format-grid > button span.block {
            -webkit-line-clamp: 2 !important;
            font-size: 0.62rem !important;
            line-height: 1.24 !important;
          }

          /* Distribution remains 2 x 2 but denser */
          .reports-mobile-compact .reports-distribution-list > div {
            min-height: 102px !important;
            padding: 0.55rem !important;
          }

          .reports-mobile-compact .reports-distribution-list span.text-sm {
            font-size: 0.68rem !important;
            line-height: 1.2 !important;
          }

          /* Uploaded source cards remain 2 columns */
          .reports-mobile-compact .reports-source-grid > div {
            min-height: 150px !important;
            padding: 0.55rem !important;
          }

          .reports-mobile-compact .reports-source-grid p.text-sm {
            font-size: 0.72rem !important;
          }

          .reports-mobile-compact .reports-source-grid p.break-all {
            display: -webkit-box !important;
            -webkit-line-clamp: 3 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.61rem !important;
            line-height: 1.25 !important;
          }

          .reports-mobile-compact .reports-source-grid span.rounded-full {
            max-width: 100% !important;
            padding: 0.25rem 0.38rem !important;
            font-size: 0.58rem !important;
            line-height: 1.1 !important;
            white-space: normal !important;
          }

          /* Keep risk-factor cards 2 x 3 and compact. */
          .reports-mobile-compact .reports-top-factor-grid > div {
            min-height: 66px !important;
            padding: 0.48rem !important;
          }

          /* Hotspot count cards = 2 x 3 */
          .reports-mobile-compact .reports-hotspot-count-grid > div {
            min-height: 78px !important;
            padding: 0.55rem !important;
          }
        }

        /* Even on very narrow phones, preserve two-column card grids.
           We reduce spacing/typography instead of removing the grid. */
        @media (max-width: 374px) {
          .reports-mobile-compact .reports-hero-metrics,
          .reports-mobile-compact .reports-additional-indicators,
          .reports-mobile-compact .reports-hotspot-count-grid,
          .reports-mobile-compact .reports-metadata-highlight-grid,
          .reports-mobile-compact .reports-export-format-grid,
          .reports-mobile-compact .reports-top-factor-grid,
          .reports-mobile-compact .reports-distribution-list,
          .reports-mobile-compact .reports-source-grid,
          .reports-mobile-compact .reports-main-summary-list,
          .reports-mobile-compact .reports-priority-list,
          .reports-mobile-compact .reports-activity-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.35rem !important;
          }

          .reports-mobile-compact .reports-additional-indicators > article:last-child:nth-child(odd),
          .reports-mobile-compact .reports-activity-grid > div:last-child:nth-child(odd) {
            grid-column: 1 / -1 !important;
          }

          .reports-mobile-compact .reports-priority-card {
            min-height: 236px !important;
            padding: 0.5rem !important;
          }

          .reports-mobile-compact .reports-priority-card .relative.mt-3.rounded-\[20px\] p:last-child {
            -webkit-line-clamp: 3 !important;
            font-size: 0.62rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list > div {
            min-height: 122px !important;
            padding: 0.5rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list p {
            font-size: 0.64rem !important;
            -webkit-line-clamp: 4 !important;
          }
        }


        /* =========================================================
           PRIORITY BARANGAYS — FULL-WIDTH MOBILE CARDS
           Keep every other Reports grid unchanged.
           ========================================================= */
        @media (max-width: 639px) {
          .reports-mobile-compact .reports-priority-list {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.55rem !important;
          }

          .reports-mobile-compact .reports-priority-card {
            min-height: 0 !important;
            width: 100% !important;
            padding: 0.7rem !important;
            border-radius: 16px !important;
          }

          .reports-mobile-compact .reports-priority-card .h-12.w-12 {
            width: 2.25rem !important;
            height: 2.25rem !important;
            border-radius: 12px !important;
          }

          .reports-mobile-compact .reports-priority-card p.font-black {
            font-size: 0.82rem !important;
            line-height: 1.25 !important;
          }

          .reports-mobile-compact .reports-priority-card p.text-xs {
            font-size: 0.7rem !important;
            line-height: 1.3 !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 {
            gap: 0.35rem !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 > span {
            padding: 0.3rem 0.45rem !important;
            font-size: 0.64rem !important;
            line-height: 1.15 !important;
          }

          .reports-mobile-compact .reports-priority-card .relative.mt-3.rounded-\[20px\] {
            min-height: 0 !important;
            margin-top: 0.55rem !important;
            padding: 0.6rem !important;
            border-radius: 13px !important;
          }

          .reports-mobile-compact .reports-priority-card .relative.mt-3.rounded-\[20px\] p:last-child {
            display: block !important;
            overflow: visible !important;
            -webkit-line-clamp: unset !important;
            font-size: 0.7rem !important;
            line-height: 1.35 !important;
          }

          .reports-mobile-compact .reports-priority-card .mt-3.flex.justify-end > button {
            min-height: 40px !important;
            font-size: 0.68rem !important;
          }
        }

        @media (max-width: 374px) {
          .reports-mobile-compact .reports-priority-list {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .reports-mobile-compact .reports-priority-card {
            min-height: 0 !important;
            padding: 0.6rem !important;
          }

          .reports-mobile-compact .reports-priority-card .relative.mt-3.rounded-\[20px\] p:last-child {
            -webkit-line-clamp: unset !important;
            font-size: 0.68rem !important;
          }
        }

      `}</style>

      {selectedFieldUpdateId && (
        <FieldUpdateReportCard
          fieldUpdate={selectedFieldUpdate}
          isLoading={isLoadingSelectedFieldUpdate}
          error={selectedFieldUpdateError}
        />
      )}

      <section className="reports-hero-panel relative isolate overflow-hidden rounded-[38px] border border-white/10 bg-[#061321] shadow-[0_34px_94px_rgba(2,6,23,0.34)] ring-1 ring-white/10 sm:rounded-[40px]">
        <img
          src={reportsHeroBackground}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover brightness-[0.9] saturate-[1.08]"
          style={{ objectPosition: '62% center' }}
        />

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(2,6,23,0.97)_0%,rgba(3,13,28,0.91)_42%,rgba(4,22,40,0.60)_68%,rgba(2,6,23,0.74)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_24%,rgba(56,189,248,0.18),transparent_27%),radial-gradient(circle_at_92%_90%,rgba(99,102,241,0.14),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-indigo-400/10 blur-3xl" />

        <div className="reports-hero-layout relative z-10 grid min-h-[520px] gap-8 p-6 sm:p-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.62fr)] xl:items-center xl:p-10">
          <div className="flex flex-col justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/90 shadow-sm backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5" />
                Reporting command center
              </div>

              <h1 className="mt-6 max-w-4xl text-[2.15rem] font-black leading-[1.04] tracking-[-0.045em] text-white drop-shadow-[0_5px_24px_rgba(2,6,23,0.65)] sm:text-[3rem] xl:text-[3.45rem]">
                Turn dengue intelligence into review-ready reports.
              </h1>

              <p className="mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/90 sm:text-[15px] sm:leading-8">
                {usingBackendForecast
                  ? 'Ready-to-use reports generated from saved forecast, Response priority ranking, and response recommendations.'
                  : 'Ready-to-use reports for CHO review, barangay coordination, and dengue response planning.'}
              </p>
            </div>

            <div className="reports-hero-metrics mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroMetric
                label="Barangay-matched cases"
                value={formatNumber(displayDashboardStats.totalCases)}
                helper="Official matched cases used for modeling"
                tone="blue"
              />

              <HeroMetric
                label="Urgent alerts"
                value={formatNumber(decisionCounts.urgent)}
                helper="Urgent response priorities"
                tone="rose"
              />

              <HeroMetric
                label="Forecast total"
                value={formatNumber(displayDashboardStats.fourWeekForecast)}
                helper="Projected forecast-horizon cases"
                tone="amber"
              />

              <HeroMetric
                label="Source valid-row rate"
                value={`${displayDashboardStats.dataQuality || 0}%`}
                helper="Valid rows across uploaded sources"
                tone="emerald"
              />
            </div>
          </div>

          <div className={`reports-selected-output group/output relative overflow-hidden rounded-[32px] border border-white/15 bg-gradient-to-br ${selectedOutputTheme.darkCard} p-5 text-white shadow-[0_30px_78px_rgba(2,6,23,0.54)] ring-1 ring-white/10 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-white/25 sm:p-6`}>
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${selectedOutputTheme.line}`} />
            <div className={`pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full ${selectedOutputTheme.glow} blur-3xl`} />
            <div className="flex items-start gap-4">
              <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border shadow-inner ${selectedOutputTheme.icon}`}>
                <SelectedExportIcon className="h-7 w-7" strokeWidth={2.2} />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
                  Selected output
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-white">
                  {selectedExport.label}
                </h2>
                <p className="mt-1 text-sm leading-6 text-white/80">
                  {selectedExport.desc}
                </p>
              </div>
            </div>

            <div className="relative mt-5 rounded-[24px] border border-white/15 bg-black/20 p-4 shadow-inner">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/70">
                Generated timestamp
              </p>

              <p className="mt-2 text-sm font-bold leading-6 text-white">
                {generatedAt}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black text-white/80">
                  CHO briefing ready
                </span>

                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {sortedRiskRows.length > 0 ? 'Report data ready' : 'Waiting for report data'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              style={{
                backgroundColor: '#ffffff',
                color: '#0f172a',
                borderColor: 'rgba(255,255,255,0.45)',
              }}
              className="group relative mt-5 flex min-h-[78px] w-full items-center justify-between gap-4 rounded-[24px] border px-5 py-4 text-left shadow-[0_18px_38px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(0,0,0,0.32)]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-[0_12px_24px_rgba(37,95,143,0.24)]">
                  <Download className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <p
                    style={{ color: '#0f172a' }}
                    className="text-sm font-black leading-5"
                  >
                    Generate selected output
                  </p>

                  <p
                    style={{ color: '#64748b' }}
                    className="mt-1 text-xs font-semibold leading-5"
                  >
                    Export the current Response report.
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
                <Download className="h-4 w-4" />
              </div>
            </button>
          </div>
        </div>
      </section>

      <DisclosureCard
        id="additional-report-indicators"
        open={isAdditionalIndicatorsOpen}
        onToggle={() => setIsAdditionalIndicatorsOpen((current) => !current)}
        icon={Gauge}
        title="Additional report indicators"
        description="Open the supporting indicators only when a more detailed report review is needed."
        summary={`Citywide average combined priority score: ${formatNumber(averageMultiSourceScore)}/100`}
        tone="blue"
      />

      {isAdditionalIndicatorsOpen && (
      <div className="reports-additional-indicators grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
        <StatCard
          label="Barangay-matched cases"
          value={formatNumber(displayDashboardStats.totalCases)}
          helper="Official matched cases used for modeling"
          icon={Database}
          tone="blue"
        />

        <StatCard
          label="Urgent alerts"
          value={formatNumber(decisionCounts.urgent)}
          helper="Immediate, high, or escalated priorities"
          icon={ShieldAlert}
          tone="rose"
        />

        <StatCard
          label="Forecast total"
          value={formatNumber(displayDashboardStats.fourWeekForecast)}
          helper="Projected forecast-horizon cases"
          icon={BarChart3}
          tone="amber"
        />

        <StatCard
          label="Avg combined priority score"
          value={`${formatNumber(averageMultiSourceScore)}/100`}
          helper="Average combined risk"
          icon={Gauge}
          tone="blue"
        />

        <StatCard
          label="Source valid-row rate"
          value={`${displayDashboardStats.dataQuality || 0}%`}
          helper="Valid rows across uploaded sources"
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>

      )}

      {usingBackendForecast && (
        <div className="relative overflow-hidden rounded-[28px] border border-emerald-100 bg-emerald-50/80 px-5 py-4 text-sm leading-6 text-brand-green shadow-[0_18px_40px_rgba(15,23,42,0.07)] dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/60 blur-2xl dark:bg-white/5" />

          <div className="relative flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-white/70 dark:bg-white/10 dark:ring-white/10">
              <CheckCircle2 className="h-5 w-5" />
            </div>

            <div>
              <p className="font-black">Reports ready</p>

              <p className="mt-1">
               The latest dengue risk analysis is ready for review. Reports, exports, priority ranking, and response recommendations now use the uploaded dengue, weather, population, and barangay map records.
                {formatNumber(Number(backendForecastResult?.risk_counts?.High || 0))} high-risk barangay
                {Number(backendForecastResult?.risk_counts?.High || 0) === 1 ? '' : 's'},{' '}
                {formatNumber(Number(backendForecastResult?.risk_counts?.Moderate || 0))} moderate-risk barangay
                {Number(backendForecastResult?.risk_counts?.Moderate || 0) === 1 ? '' : 's'}, and{' '}
                {formatNumber(Number(backendForecastResult?.risk_counts?.Low || 0))} low-risk barangay
                {Number(backendForecastResult?.risk_counts?.Low || 0) === 1 ? '' : 's'}.
              </p>
            </div>
          </div>
        </div>
      )}


      <div className={`relative overflow-hidden rounded-[28px] border px-5 py-4 text-sm leading-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)] ${
        hotspotRows.length > 0
          ? 'border-violet-100 bg-violet-50/80 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300'
          : 'border-amber-100 bg-amber-50/80 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
      }`}>
        <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/60 blur-2xl dark:bg-white/5" />

        <div className="relative flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-white/70 dark:bg-white/10 dark:ring-white/10">
            <MapPin className="h-5 w-5" />
          </div>

          <div>
            <p className="font-black">Hotspot summary {isLoadingHotspotReport ? 'is updating' : hotspotRows.length > 0 ? 'ready' : 'not available yet'}</p>

            <p className="mt-1">
              {hotspotRows.length > 0
                ? `${formatNumber(hotspotPriorityCount)} barangay${hotspotPriorityCount === 1 ? '' : 's'} are confirmed or emerging hotspots. ${formatNumber(hotspotCounts.needsReview)} barangay${hotspotCounts.needsReview === 1 ? '' : 's'} need map name review. ${formatNumber(hotspotCountTotal)} of ${formatNumber(sortedRiskRows.length)} official barangays are accounted for exactly once.`
                : hotspotError || 'Hotspot information will appear after the map file and saved forecast are available.'}
            </p>
          </div>
        </div>
      </div>

      <DisclosureCard
        id="hotspot-analysis-details"
        open={isHotspotDetailsOpen}
        onToggle={() => setIsHotspotDetailsOpen((current) => !current)}
        icon={MapPin}
        title="Hotspot analysis details"
        description="View hotspot categories, map-name review items, and the highest spatial-priority barangays."
        summary={
          hotspotRows.length > 0
            ? `${formatNumber(hotspotPriorityCount)} confirmed or emerging · ${formatNumber(hotspotCounts.needsReview)} need review · ${formatNumber(hotspotCountTotal)}/${formatNumber(sortedRiskRows.length)} accounted`
            : 'Hotspot data not available'
        }
        tone={hasHotspotIssues ? 'amber' : 'blue'}
      />

      {isHotspotDetailsOpen && (
        <PremiumPanel className="p-5 sm:p-6">
          <div className="reports-hotspot-count-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              ['Confirmed', hotspotCounts.confirmed, 'rose'],
              ['Emerging', hotspotCounts.emerging, 'amber'],
              ['Watch areas', hotspotCounts.watch, 'amber'],
              ['Low concern', hotspotCounts.low, 'emerald'],
              ['Needs map review', hotspotCounts.needsReview, 'blue'],
              ['Not checked', hotspotCounts.notChecked, 'slate'],
            ].map(([label, value, tone]) => (
              <div
                key={`hotspot-detail-${label}`}
                className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-black text-brand-text dark:text-slate-100">
                  {formatNumber(value)}
                </p>
              </div>
            ))}
          </div>

          <div className={`mt-4 rounded-[22px] border p-4 text-sm font-bold leading-6 ${
            hotspotCountTotal === sortedRiskRows.length
              ? 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
          }`}>
            Hotspot classification total: {formatNumber(hotspotCountTotal)} of {formatNumber(sortedRiskRows.length)} official barangays. Each official barangay is counted once.
          </div>

          {hotspotRows.length > 0 ? (
            <>
            <div className="mt-4 space-y-2">
              {rankedHotspotRows.slice(0, 5).map((row, index) => (
                <div
                  key={`hotspot-row-${row.barangay || index}`}
                  className="flex flex-col gap-3 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-black text-brand-text dark:text-slate-100">
                      #{index + 1} {row.barangay || 'Unknown barangay'}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
                      {row.recommended_map_action || 'Continue routine monitoring.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${getHotspotBadgeStyle(row.hotspot_level)}`}>
                      {getHotspotLevelLabel(row.hotspot_level)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-brand-text dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      {formatHotspotScore(row.hotspot_score)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {mapReviewHotspotRows.length > 0 && (
              <div className="mt-5 rounded-[24px] border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                <p className="flex items-center gap-2 text-sm font-black text-brand-blue dark:text-blue-300">
                  <AlertTriangle className="h-4 w-4" />
                  Barangays needing map name review
                </p>

                <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  These official barangays are counted inside the 86-barangay total, but their spatial scores are not final until the boundary name match is corrected.
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {mapReviewHotspotRows.map((row) => (
                    <div
                      key={`report-map-review-${row.barangay}`}
                      className="rounded-[20px] border border-blue-100 bg-white p-3 dark:border-blue-500/20 dark:bg-slate-950/70"
                    >
                      <p className="font-black text-brand-text dark:text-slate-100">
                        {row.barangay || 'Unknown barangay'}
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">
                        Local risk before map match: {formatHotspotScore(row.base_risk_score)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
          ) : (
            <div className="mt-4 rounded-[22px] border border-dashed border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              {hotspotError || 'Hotspot analysis will appear after the map file and saved forecast are available.'}
            </div>
          )}
        </PremiumPanel>
      )}

      <DisclosureCard
        id="official-report-details-control"
        open={isOfficialDetailsOpen}
        onToggle={() => setIsOfficialDetailsOpen((current) => !current)}
        icon={FileText}
        title="Official report and technical details"
        description="Report identity, uploaded-source metadata, forecast method, AI evaluation, thresholds, and limitations remain available for official review."
        summary={`${officialReportMetadata.reportId} · ${officialReportMetadata.selectedModel}`}
        tone="slate"
      />

      {isOfficialDetailsOpen && (
      <PremiumPanel id="official-report-details" className="relative p-0">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-5 py-5 sm:px-6 sm:py-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-6 h-52 w-52 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_34%)]" />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/85 backdrop-blur">
                <FileText className="h-3.5 w-3.5" />
                Official report details
              </div>

              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                Report metadata
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
                These details are included in the PDF, Excel, PowerPoint, and print outputs for a more official review-ready report.
              </p>
            </div>

            <div className="w-fit rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-left shadow-sm backdrop-blur">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
                Report ID
              </p>

              <p className="mt-1 text-sm font-black text-white">
                {officialReportMetadata.reportId}
              </p>
            </div>
          </div>

          <div className="reports-metadata-highlight-grid relative mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ['Generated', officialReportMetadata.generatedAt, CalendarDays],
              ['Forecast window', officialReportMetadata.forecastWindow, BarChart3],
              ['Selected model', officialReportMetadata.selectedModel, Sparkles],
              ['Model selection strength', officialReportMetadata.aiConfidence, Gauge],
            ].map(([label, value, Icon]) => (
              <div
                key={`metadata-highlight-${label}`}
                className="rounded-[22px] border border-white/15 bg-white/10 p-3 shadow-sm backdrop-blur"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white">
                  <Icon className="h-4 w-4" />
                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
                  {label}
                </p>

                <p className="mt-1 break-words text-sm font-black leading-5 text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
            <div className="rounded-[30px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/70 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-brand-blue dark:text-blue-300">
                    Issuance details
                  </p>

                  <h3 className="mt-1 text-lg font-black text-brand-text dark:text-slate-100">
                    Official report identity
                  </h3>
                </div>

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-[0_12px_24px_rgba(37,95,143,0.22)]">
                  <FileText className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ['Generated by', officialReportMetadata.generatedBy, Users],
                  ['Role', officialReportMetadata.role, ShieldAlert],
                  ['Generated date/time', officialReportMetadata.generatedAt, CalendarDays],
                  ['Forecast window', officialReportMetadata.forecastWindow, BarChart3],
                ].map(([label, value, Icon]) => (
                  <div
                    key={`issuance-${label}`}
                    className="group rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                          {label}
                        </p>

                        <p className="mt-1 break-words text-sm font-black leading-6 text-brand-text dark:text-slate-100">
                          {value}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-[24px] border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-blue shadow-sm dark:bg-white/10 dark:text-blue-300">
                    <Database className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-blue dark:text-blue-300">
                      Forecast method
                    </p>

                    <p className="mt-1 text-sm font-semibold leading-6 text-brand-text dark:text-slate-300">
                      {officialReportMetadata.forecastMethod}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-4 text-white shadow-[0_18px_44px_rgba(15,23,42,0.18)] dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-200">
                    AI model snapshot
                  </p>

                  <h3 className="mt-1 break-words text-lg font-black">
                    {officialReportMetadata.selectedModel}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAiSnapshotOpen((current) => !current)}
                  aria-expanded={isAiSnapshotOpen}
                  className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-sm transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/15"
                >
                  {isAiSnapshotOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsAiSnapshotOpen((current) => !current)}
                aria-expanded={isAiSnapshotOpen}
                className="mt-4 flex w-full items-center justify-between gap-3 rounded-[24px] border border-white/15 bg-white/10 px-4 py-3 text-left shadow-sm backdrop-blur transition hover:border-white/25 hover:bg-white/15"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
                    Model details
                  </p>

                  <p className="mt-1 break-words text-sm font-black leading-5 text-white">
                    {isAiSnapshotOpen ? 'Hide evaluation metrics and feature importance' : 'View evaluation metrics and feature importance'}
                  </p>
                </div>

                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black text-white/80">
                  {isAiSnapshotOpen ? 'Collapse' : 'Expand'}
                  {isAiSnapshotOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>

              {isAiSnapshotOpen && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Version', officialReportMetadata.modelVersion],
                      ['Split', officialReportMetadata.trainTestSplit],
                      ['Random state', officialReportMetadata.randomState],
                      ['Models', officialReportMetadata.modelsEvaluated],
                    ].map(([label, value]) => (
                      <div
                        key={`model-snapshot-${label}`}
                        className="rounded-2xl border border-white/15 bg-white/10 px-3 py-3 backdrop-blur"
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">
                          {label}
                        </p>

                        <p className="mt-1 break-words text-sm font-black leading-5 text-white">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">
                        Selected model metrics
                      </p>

                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-black text-emerald-100">
                        Evaluation
                      </span>
                    </div>

                    <MetadataDetailList
                      value={officialReportMetadata.selectedModelMetrics}
                      separator=";"
                      itemClassName="border-emerald-300/15 bg-white/10"
                      labelClassName="text-emerald-200"
                      valueClassName="text-white"
                      dotClassName="bg-emerald-300"
                      columns="grid-cols-1 sm:grid-cols-2"
                    />
                  </div>

                  <div className="rounded-[24px] border border-amber-300/20 bg-amber-400/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
                        Top feature importance
                      </p>

                      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black text-amber-100">
                        Top 5
                      </span>
                    </div>

                    <MetadataDetailList
                      value={officialReportMetadata.featureImportanceSummary}
                      separator=";"
                      itemClassName="border-amber-300/15 bg-white/10"
                      labelClassName="text-amber-200"
                      valueClassName="text-white"
                      dotClassName="bg-amber-300"
                      variant="feature"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 2xl:grid-cols-2">
            <div className="rounded-[28px] border border-emerald-100 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-green shadow-sm dark:bg-white/10 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-green dark:text-emerald-300">
                    Forecast case-risk thresholds
                  </p>

                  <MetadataDetailList
                    value={officialReportMetadata.riskThresholds}
                    separator=";"
                    itemClassName="border-emerald-100 bg-white/85 dark:border-emerald-500/20 dark:bg-slate-950/60"
                    labelClassName="text-brand-green dark:text-emerald-300"
                    valueClassName="text-brand-text dark:text-slate-100"
                    dotClassName="bg-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-rose-100 bg-rose-50/80 p-4 shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-red shadow-sm dark:bg-white/10 dark:text-rose-300">
                  <ShieldAlert className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-red dark:text-rose-300">
                    Top high-risk barangays
                  </p>

                  <MetadataDetailList
                    value={officialReportMetadata.topHighRiskBarangays}
                    separator=","
                    itemClassName="border-rose-100 bg-white/85 dark:border-rose-500/20 dark:bg-slate-950/60"
                    labelClassName="text-brand-red dark:text-rose-300"
                    valueClassName="text-brand-text dark:text-slate-100"
                    dotClassName="bg-rose-500"
                    columns="grid-cols-1 sm:grid-cols-2"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-blue-100 bg-blue-50/80 p-4 shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10 2xl:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-blue shadow-sm dark:bg-white/10 dark:text-blue-300">
                    <Gauge className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-blue dark:text-blue-300">
                      Model selection strength
                    </p>

                    <p className="mt-1 break-words text-sm font-bold leading-6 text-brand-text dark:text-slate-300">
                      {officialReportMetadata.aiConfidence}
                    </p>
                  </div>
                </div>

                <span className="w-fit rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-black text-brand-blue shadow-sm dark:border-blue-500/20 dark:bg-slate-950/60 dark:text-blue-300">
                  Model selection note
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-brand-text dark:text-slate-100">
                  Uploaded file record counts
                </p>

                <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-500">
                  Official source details used for export metadata.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Total', officialReportMetadata.totalRecords],
                  ['Valid', officialReportMetadata.validRecords],
                  ['Invalid', officialReportMetadata.invalidRecords],
                ].map(([label, value]) => (
                  <div
                    key={`source-count-${label}`}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-muted dark:text-slate-500">
                      {label}
                    </p>

                    <p className="text-sm font-black text-brand-text dark:text-slate-100">
                      {formatNumber(value || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-brand-muted dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Dataset</th>
                    <th className="px-4 py-3">Filename</th>
                    <th className="px-4 py-3">Upload date/time</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Valid</th>
                    <th className="px-4 py-3">Invalid</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {officialSourceRows.length > 0 ? (
                    officialSourceRows.map((row) => (
                      <tr
                        key={`official-source-${row.dataset}`}
                        className="text-brand-muted transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-950"
                      >
                        <td className="px-4 py-3 font-black text-brand-text dark:text-slate-100">
                          {row.dataset}
                        </td>
                        <td className="max-w-[280px] break-all px-4 py-3">
                          {row.filename}
                        </td>
                        <td className="px-4 py-3">
                          {row.uploadedAt}
                        </td>
                        <td className="px-4 py-3 font-bold">
                          {formatNumber(row.totalRecords)}
                        </td>
                        <td className="px-4 py-3 font-bold text-brand-green dark:text-emerald-300">
                          {formatNumber(row.validRecords)}
                        </td>
                        <td className="px-4 py-3 font-bold text-brand-orange dark:text-amber-300">
                          {formatNumber(row.invalidRecords)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-4 text-brand-muted dark:text-slate-400" colSpan={6}>
                        No uploaded file metadata available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 rounded-[28px] border border-amber-100 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-950">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-brand-orange shadow-sm dark:bg-white/10 dark:text-amber-300">
                <AlertTriangle className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-black text-brand-orange dark:text-amber-300">
                  Limitations and assumptions
                </p>

                <p className="text-xs font-semibold text-brand-muted dark:text-slate-500">
                  These reminders are included for official review and interpretation.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
              {officialReportMetadata.limitations.map((item, index) => (
                <div
                  key={`limitation-${index}`}
                  className="flex gap-2 rounded-2xl border border-white/80 bg-white/85 px-3 py-2 text-sm leading-6 text-brand-muted shadow-sm dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PremiumPanel>

      )}

      <div className="reports-decision-export-layout grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <PremiumPanel id="decision-brief" tone="blue" className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionBadge icon={Sparkles} tone="blue">
                Response brief
              </SectionBadge>

              <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                Four-month dengue response planning brief
              </h2>

              <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
                {usingBackendForecast
                  ? 'Planning-ready report based on saved forecast, risk level, Response priority, and recommended actions.'
                  : 'Planning-ready report based on forecast, risk level, Response priority, and recommended actions.'}
              </p>
            </div>

            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
              <CalendarDays className="h-3.5 w-3.5" />
              {generatedAt}
            </span>
          </div>

          <div className="mt-5 rounded-[26px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 p-5 shadow-inner dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
            <h3 className="flex items-center gap-2 text-lg font-black text-brand-text dark:text-slate-100">
              <ClipboardList className="h-5 w-5 text-brand-blue" />
              Main response summary
            </h3>

            <div className="reports-main-summary-list mt-4 space-y-3">
              {reportSummary.map((item, index) => (
                <div
                  key={item}
                  className="group/summary relative overflow-hidden flex items-start gap-3 rounded-[22px] border border-slate-200/80 bg-gradient-to-br from-white via-white to-blue-50/65 px-4 py-3.5 shadow-[0_10px_26px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-blue-200 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-black text-white">
                    {index + 1}
                  </div>

                  <p className="text-sm leading-6 text-brand-text dark:text-slate-300">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            id="priority-barangays"
            className="scroll-mt-28 mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
  <div className="min-w-0">
    <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
      <MapPin className="h-3.5 w-3.5" />
      Response priority list
    </div>

    <h3 className="mt-3 text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
      Priority barangays
    </h3>

    <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-muted dark:text-slate-400">
      Showing the highest-ranked barangays based on Response score, risk level, forecasted cases, and recommended response priority.
    </p>
  </div>

  <div className="flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-blue text-sm font-black text-white shadow-sm">
      {formatNumber(topBarangays.length)}
    </div>

    <div className="pr-1">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
        Showing
      </p>

      <p className="text-xs font-black text-brand-text dark:text-slate-100">
        Top barangays
      </p>
    </div>
  </div>
</div>

            <div className="reports-priority-list mt-4 space-y-3">
              {visibleTopBarangays.length > 0 ? (
                <>
                  {visibleTopBarangays.map((row, index) => {
                    const decision = getDecisionSupport(row)
                    const profile = getMultiSourceProfile(row)
                    const isExpanded = expandedPriorityBarangay === row.barangay
                    const riskCardTheme = getRiskCardTheme(row.risk)

                    return (
                      <div
                        key={`${row.barangay}-${index}`}
                        className={`reports-priority-card group relative overflow-hidden rounded-[28px] border p-4 shadow-[0_14px_38px_rgba(15,23,42,0.08)] ring-1 ring-white/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_56px_rgba(15,23,42,0.14)] dark:ring-white/5 ${riskCardTheme.surface}`}
                      >
                        <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${riskCardTheme.line}`} />
                        <div className={`pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full blur-3xl ${riskCardTheme.glow}`} />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br ${riskCardTheme.line} text-sm font-black text-white shadow-[0_12px_26px_rgba(15,23,42,0.18)]`}>
                              #{index + 1}
                            </div>

                            <div className="min-w-0">
                              <p className="break-words font-black text-brand-text dark:text-slate-100">
                                {row.barangay}
                              </p>

                              <p className="text-xs leading-5 text-brand-muted dark:text-slate-400">
                                {formatNumber(row.forecast)} projected cases
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${getRiskBadgeStyle(row.risk)}`}>
                              {row.risk || 'Unknown'}
                            </span>

                            <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${getPriorityBadgeStyle(decision.priority)}`}>
                              {decision.priority}
                            </span>
                          </div>
                        </div>

                        <div className={`relative mt-3 rounded-[20px] border bg-white/75 px-4 py-3 shadow-inner dark:bg-slate-950/60 ${riskCardTheme.chip}`}>
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-blue dark:text-blue-300">
                            Recommended response
                          </p>
                          <p className="mt-1 text-sm leading-6 text-brand-text dark:text-slate-300">
                            {decision.summary}
                          </p>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedPriorityBarangay(isExpanded ? null : row.barangay)
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
                          <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-inner dark:border-slate-800 dark:bg-slate-950/80">
                            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {[
                                ['Combined priority score', `${formatNumber(profile.score)}/100`],
                                ['Environment', profile.environmentalSuitability],
                                ['Response score', `${formatNumber(decision.score)} pts`],
                                ['Next-period forecast', `${formatNumber(row.currentCases || 0)} cases`],
                              ].map(([label, value]) => (
                                <div
                                  key={`${row.barangay}-technical-${label}`}
                                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950"
                                >
                                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                                    {label}
                                  </p>
                                  <p className="mt-1 text-sm font-black leading-5 text-brand-text dark:text-slate-100">
                                    {value}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                                combined risk factors
                              </p>

                              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2">
                                {[
                                  ['Rainfall', profile.rainfallPressure, CloudRain],
                                  ['Temperature', profile.temperatureSuitability, Thermometer],
                                  ['Humidity', profile.humiditySuitability, Droplets],
                                  ['Population exposure', decision.populationExposure, Users],
                                  ['Density level', decision.densityLevel, Gauge],
                                  ['Forecast pressure', decision.forecastPressure, BarChart3],
                                  ['Hotspot level', getHotspotLevelLabel(getHotspotForBarangay(row, hotspotRows)?.hotspot_level), MapPin],
                                ].map(([label, value, Icon]) => (
                                  <div
                                    key={`${row.barangay}-${label}`}
                                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950"
                                  >
                                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
                                      <Icon className="h-4 w-4" />
                                    </div>

                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                                      {label}
                                    </p>

                                    <p className="mt-1 text-xs font-black leading-5 text-brand-text dark:text-slate-100">
                                      {value}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {decision.actions.length > 0 && (
                              <div className="mt-3 rounded-[20px] border border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-orange dark:text-amber-300">
                                  Action plan
                                </p>

                                <div className="mt-3 space-y-2">
                                  {decision.actions.slice(0, 8).map((action, actionIndex) => (
                                    <div
                                      key={`${action}-${actionIndex}`}
                                      className="flex gap-2 text-sm leading-6 text-brand-text dark:text-slate-300"
                                    >
                                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                                        {actionIndex + 1}
                                      </span>

                                      <span>{action}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {decision.rationale.length > 0 && (
                              <div className="mt-3 rounded-[20px] border border-emerald-100 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-green dark:text-emerald-300">
                                  Why this priority
                                </p>

                                <div className="mt-3 space-y-2">
                                  {decision.rationale.slice(0, 9).map((reason, reasonIndex) => (
                                    <div
                                      key={`${reason}-${reasonIndex}`}
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
                        )}
                      </div>
                    )
                  })}

                  {topBarangays.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllPriorityBarangays((current) => !current)
                        setExpandedPriorityBarangay(null)
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-black text-brand-text shadow-sm transition hover:border-brand-blue/30 hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300"
                    >
                      {showAllPriorityBarangays
                        ? 'Show less barangays'
                        : `Show all ${topBarangays.length} barangays`}

                      {showAllPriorityBarangays ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  No priority barangay data available.
                </div>
              )}
            </div>
          </div>
        </PremiumPanel>

        <PremiumPanel id="export-center" tone="emerald" className="p-5 sm:p-6 xl:sticky xl:top-24 xl:self-start">
          <SectionBadge icon={Download} tone="emerald">
            Export center
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Export options
          </h2>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Select the output format, then generate the response planning report.
          </p>

          <div className="reports-export-format-grid mt-5 grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2">
            {exportFormats.map((item) => {
              const Icon = item.icon
              const itemTone =
                item.id === 'pdf'
                  ? 'rose'
                  : item.id === 'excel'
                    ? 'emerald'
                    : item.id === 'powerpoint'
                      ? 'blue'
                      : 'amber'
              const itemTheme = getReportVisualTheme(itemTone)
              const isSelected = format === item.id

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id)}
                  className={`group relative overflow-hidden rounded-[26px] border p-4 text-left text-sm font-semibold shadow-[0_12px_30px_rgba(15,23,42,0.07)] ring-1 ring-white/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_48px_rgba(15,23,42,0.14)] dark:ring-white/5 ${itemTheme.surface} ${
                    isSelected
                      ? 'ring-2 ring-cyan-400 ring-offset-2 dark:ring-offset-slate-950'
                      : ''
                  }`}
                >
                  <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${itemTheme.line}`} />
                  <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl ${itemTheme.glow}`} />
                  <div className="flex items-start gap-3">
                    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${itemTheme.icon}`}>
                      <Icon className="h-5 w-5" />
                    </div>

                    <div>
                      <span className="font-black">{item.label}</span>

                      <span className="mt-1 block text-xs font-semibold leading-5 opacity-75">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 p-4 text-sm text-brand-muted shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20 dark:text-slate-400">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${selectedExport.style}`}
              >
                <SelectedExportIcon className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                  Selected output
                </p>

                <p className="font-black text-brand-text dark:text-slate-100">
                  {selectedExport.label}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[22px] bg-brand-blue px-4 py-3.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(37,95,143,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#255f8f] hover:shadow-[0_18px_38px_rgba(37,95,143,0.34)]"
          >
            <Download className="h-4 w-4" />
            Generate selected output
          </button>

          <button
            type="button"
            onClick={() => setIsExportDetailsOpen((current) => !current)}
            aria-expanded={isExportDetailsOpen}
            className="mt-5 flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-left shadow-sm transition hover:border-brand-blue/30 dark:border-slate-800 dark:bg-slate-950"
          >
            <div>
              <p className="text-sm font-black text-brand-text dark:text-slate-100">
                Report contents and priority distribution
              </p>
              <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
                View the technical fields included in exports and the full response-priority breakdown.
              </p>
            </div>
            {isExportDetailsOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>

          {isExportDetailsOpen && (
            <>
          <div className="mt-5 rounded-[24px] border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:to-slate-900">
            <p className="flex items-center gap-2 text-sm font-black text-brand-orange dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Export note
            </p>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {usingBackendForecast
               ? 'PDF, Excel, PowerPoint, and print reports now include forecast totals, response priorities, combined priority score, rainfall, temperature, humidity, population exposure, density level, hotspot summary, recommended actions, and reasons for the recommendation.'
                : 'PDF, Excel, PowerPoint, and print reports include response priority, combined priority score, rainfall, temperature, humidity, population, density, action plan, and reasons for the recommendation.'}
            </p>
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-sm font-black text-brand-text dark:text-slate-100">
              Response priority distribution
            </p>

            <div className="mt-3 space-y-2">
              {priorityDistribution.length > 0 ? (
                priorityDistribution.map((item) => (
                  <div
                    key={item.priority}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${getPriorityBadgeStyle(item.priority)}`}>
                      {item.priority}
                    </span>

                    <span className="text-xs font-black text-brand-text dark:text-slate-100">
                      {formatNumber(item.count)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-brand-muted dark:text-slate-400">
                  Response priority distribution will appear after dengue records are loaded.
                </p>
              )}
            </div>
          </div>
            </>
          )}

          <div className="mt-5 rounded-[26px] border border-amber-100 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-5 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-950">
            <h3 className="flex items-center gap-2 text-lg font-black text-brand-orange dark:text-amber-300">
              <ShieldAlert className="h-5 w-5" />
              Top response plan
            </h3>

            {topBarangay ? (
              <div className="mt-4 space-y-3">
                <div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getPriorityBadgeStyle(topDecision.priority)}`}>
                    {topDecision.priority}
                  </span>

                  <p className="mt-3 text-sm font-semibold leading-6 text-brand-text dark:text-slate-200">
                    {topDecision.summary}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsTopResponseDetailsOpen((current) => !current)}
                  aria-expanded={isTopResponseDetailsOpen}
                  className="flex w-full items-center justify-between gap-3 rounded-[20px] border border-white/80 bg-white/80 px-4 py-3 text-left shadow-sm transition hover:border-brand-blue/30 dark:border-slate-700 dark:bg-slate-950/70"
                >
                  <div>
                    <p className="text-sm font-black text-brand-text dark:text-slate-100">
                      Supporting risk factors
                    </p>
                    <p className="mt-1 text-xs leading-5 text-brand-muted dark:text-slate-400">
                      Combined score, environment, weather, density, and recommendation rationale.
                    </p>
                  </div>
                  {isTopResponseDetailsOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </button>

                {isTopResponseDetailsOpen && (
                  <div className="rounded-[20px] border border-white/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                    Combined risk factors
                  </p>

                  <div className="reports-top-factor-grid mt-3 grid grid-cols-3 gap-2 sm:grid-cols-2">
                    {[
                      ['Combined priority score', `${formatNumber(topProfile.score)}/100`],
                      ['Environment', topProfile.environmentalSuitability],
                      ['Rainfall', topProfile.rainfallPressure],
                      ['Temperature', topProfile.temperatureSuitability],
                      ['Humidity', topProfile.humiditySuitability],
                      ['Density', topDecision.densityLevel],
                    ].map(([label, value]) => (
                      <div
                        key={`top-${label}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                          {label}
                        </p>

                        <p className="mt-1 text-xs font-black leading-5 text-brand-text dark:text-slate-100">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {topDecision.actions.length > 0 && (
                  <div className="rounded-[20px] border border-white/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                      Action plan
                    </p>

                    <div className="mt-3 space-y-2">
                      {topDecision.actions.slice(0, 8).map((action, index) => (
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

                {isTopResponseDetailsOpen && topDecision.rationale.length > 0 && (
                  <div className="rounded-[20px] border border-white/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                      Why this recommendation
                    </p>

                    <div className="mt-3 space-y-2">
                      {topDecision.rationale.slice(0, 9).map((reason, index) => (
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
            ) : (
              <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">
                The response plan will appear after dengue records are uploaded and risk rows are computed.
              </p>
            )}
          </div>
        </PremiumPanel>
      </div>

      <DisclosureCard
        id="report-supporting-details"
        open={isSupportingDetailsOpen}
        onToggle={() => setIsSupportingDetailsOpen((current) => !current)}
        icon={Database}
        title="Report contents and uploaded data"
        description="Review who receives the report and inspect uploaded filenames, statuses, and record counts."
        summary={`${distributionItems.length} included items · ${officialSourceRows.length} datasets${hasUploadedDataIssues ? ' · needs review' : ''}`}
        tone={hasUploadedDataIssues ? 'amber' : 'slate'}
      />

      {isSupportingDetailsOpen && (
      <div className="reports-supporting-layout grid gap-6 xl:grid-cols-[0.7fr_1fr]">
        <PremiumPanel tone="blue" className="p-5 sm:p-6">
          <SectionBadge icon={Send} tone="blue">
            Distribution
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Distribution list
          </h2>

          <div className="reports-distribution-list mt-5 space-y-3">
            {distributionItems.map((item) => {
              const Icon = item.icon

              return (
                <div
                  key={item.label}
                  className="group/distribution relative overflow-hidden flex items-center justify-between gap-3 rounded-[26px] border border-blue-200/70 bg-gradient-to-br from-blue-50/90 via-white to-cyan-50/60 px-4 py-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-md dark:border-blue-400/15 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-blue shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:text-blue-300 dark:ring-slate-700">
                      <Icon className="h-5 w-5" />
                    </div>

                    <span className="text-sm font-black text-brand-text dark:text-slate-100">
                      {item.label}
                    </span>
                  </div>

                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Included
                  </span>
                </div>
              )
            })}
          </div>
        </PremiumPanel>

        <PremiumPanel tone="slate" className="p-5 sm:p-6">
          <SectionBadge icon={Database} tone="slate">
            Uploaded data readiness
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Uploaded data readiness
          </h2>

          <div className="reports-source-grid mt-5 grid grid-cols-2 gap-2 lg:gap-3 lg:grid-cols-2">
            {Object.entries(sourceStatus || {}).length > 0 ? (
              Object.entries(sourceStatus || {}).map(([key, item = {}]) => (
                <div
                  key={key}
                  className="group/source relative min-w-0 overflow-hidden rounded-[26px] border border-slate-200/80 bg-gradient-to-br from-slate-50/95 via-white to-blue-50/60 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-blue-950/20"
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black capitalize text-brand-text dark:text-slate-100">
                        {key}
                      </p>

                      <p className="mt-2 max-w-full break-all text-xs leading-5 text-brand-muted dark:text-slate-400">
                        {item.uploadedName || 'No file uploaded'}
                      </p>
                    </div>

                    <span
                      className={`w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(item.badge)}`}
                    >
                      {item.badge || 'No status'}
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-brand-muted dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    {formatNumber(item.validCount || 0)} valid of {formatNumber(item.recordCount || 0)} records
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 lg:col-span-2">
                No source status available yet.
              </div>
            )}
          </div>
        </PremiumPanel>
      </div>

      )}

      <DisclosureCard
        id="recent-report-activity-control"
        open={isActivityOpen}
        onToggle={() => setIsActivityOpen((current) => !current)}
        icon={Activity}
        title="Recent report activity"
        description="Open the audit trail only when checking recent exports or troubleshooting report generation."
        summary={`${Math.min((activityLogs || []).length, 3)} recent item${Math.min((activityLogs || []).length, 3) === 1 ? '' : 's'}`}
        tone="slate"
      />

      {isActivityOpen && (
      <PremiumPanel className="p-5 sm:p-6">
        <SectionBadge icon={Activity} tone="slate">
          Activity
        </SectionBadge>

        <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
          Recent report activity
        </h2>

        <div className="reports-activity-grid mt-5 grid gap-2 sm:gap-3 lg:grid-cols-3">
          {(activityLogs || []).slice(0, 3).length > 0 ? (
            (activityLogs || []).slice(0, 3).map((log) => (
              <div
                key={log.id}
                className="group/activity relative overflow-hidden rounded-[26px] border border-slate-200/80 bg-gradient-to-br from-slate-50/95 via-white to-blue-50/55 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-blue-950/20"
              >
                <p className="text-sm font-black text-brand-text dark:text-slate-100">
                  {log.action}
                </p>

                <p className="mt-1 text-xs text-brand-muted dark:text-slate-500">
                  {new Date(log.timestamp).toLocaleString()}
                </p>

                <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">
                  {log.details}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-brand-muted dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 lg:col-span-3">
              No recent report activity yet.
            </div>
          )}
        </div>
      </PremiumPanel>
      )}
    </div>
  )
}
