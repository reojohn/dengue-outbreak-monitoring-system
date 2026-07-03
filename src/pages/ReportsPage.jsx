import { useEffect, useMemo, useState } from 'react'
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
import { riskStyles } from '../utils/analytics'
import { createBackendNotificationEvent, getGeospatialHotspots, saveGeneratedReport } from '../services/api'

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
    label: 'Weekly decision briefing',
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
    return 'Conduct source reduction, coordinate immediate cleanup, and issue a barangay-level dengue alert within 24 to 48 hours.'
  }

  if (risk === 'Moderate') {
    return 'Continue close weekly monitoring, strengthen preventive messaging, and inspect common mosquito breeding areas.'
  }

  if (risk === 'Low') {
    return 'Maintain routine monitoring, public advisories, and regular environmental sanitation activities.'
  }

  return 'Upload and validate dengue records first before generating a complete response recommendation.'
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
    multiSourceRiskScore:
      decisionSupport.multiSourceRiskScore ??
      decisionSupport.riskScore ??
      row?.multiSourceRiskScore ??
      row?.multiSourceScore ??
      row?.riskScore ??
      0,
    riskComponents:
      decisionSupport.riskComponents ||
      row?.riskComponents ||
      row?.riskScoreBreakdown ||
      {},
  }
}

function getMultiSourceProfile(row = null) {
  const decision = getDecisionSupport(row)
  const score = Number(
    decision.multiSourceRiskScore ||
      row?.multiSourceRiskScore ||
      row?.multiSourceScore ||
      row?.riskScore ||
      0
  )

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
  return [...riskRows].sort((a, b) => {
    const decisionA = getDecisionSupport(a)
    const decisionB = getDecisionSupport(b)

    const priorityDifference =
      getPrioritySortValue(decisionB.priority) -
      getPrioritySortValue(decisionA.priority)

    if (priorityDifference !== 0) {
      return priorityDifference
    }

    const scoreDifference =
      Number(decisionB.score || 0) - Number(decisionA.score || 0)

    if (scoreDifference !== 0) {
      return scoreDifference
    }

    const riskDifference = getRiskSortValue(b.risk) - getRiskSortValue(a.risk)

    if (riskDifference !== 0) {
      return riskDifference
    }

    return Number(b.forecast || 0) - Number(a.forecast || 0)
  })
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

function getReportDataSourceLabel(usingSavedForecast) {
  return usingSavedForecast ? 'Saved forecast and uploaded map data' : 'Current workspace data'
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
    return 'High risk: 70 and above; Moderate risk: 45 to 69; Low risk: below 45.'
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

function getOfficialReportMetadata({
  sourceStatus = {},
  backendForecastResult = null,
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

  return {
    reportId: `DR-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
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
      (usingBackendForecast
        ? 'Saved baseline trend forecast using uploaded dengue case records.'
        : 'Current workspace forecast and response ranking.'),
    modelVersion:
      backendForecastResult?.model_version ||
      backendForecastResult?.modelVersion ||
      'Prototype baseline model v1.0',
    riskThresholds: formatThresholds(
      backendForecastResult?.risk_thresholds || backendForecastResult?.riskThresholds
    ),
    forecastWindow:
      backendForecastResult?.forecast_window ||
      backendForecastResult?.forecastWindow ||
      backendForecastResult?.forecast_period ||
      'Next 4 reporting periods',
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
    ['Risk thresholds', metadata.riskThresholds || 'Not recorded'],
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

function getBackendPriorityLabel(row = {}) {
  const risk = row.risk_level || 'Low'
  const trend = row.trend_direction || 'Stable'

  if (risk === 'High') return 'Immediate Response'
  if (risk === 'Moderate' && trend === 'Increasing') return 'Preventive Monitoring'
  if (risk === 'Moderate') return 'Preventive Monitoring'
  if (risk === 'Low' && trend === 'Increasing') return 'Early Monitoring'

  return 'Routine Monitoring'
}

function getBackendDecisionScore(row = {}) {
  const risk = row.risk_level || 'Low'
  const forecast = Number(row.forecast_next_4_periods || 0)
  const priorityRank = Number(row.priority_rank || 0)

  const riskWeight = {
    High: 90,
    Moderate: 60,
    Low: 30,
  }[risk] || 20

  const rankBonus = priorityRank > 0 ? Math.max(0, 20 - priorityRank) : 0
  const forecastBonus = Math.min(60, Math.round(forecast / 2))

  return riskWeight + forecastBonus + rankBonus
}

function getBackendActionPlan(row = {}) {
  const recommendation = row.recommendation || getGenericRecommendedAction(row.risk_level)
  const risk = row.risk_level || 'Low'
  const barangay = row.barangay || 'the barangay'

  if (risk === 'High') {
    return [
      recommendation,
      `Coordinate immediate barangay-level inspection and cleanup activities in ${barangay}.`,
      'Validate recent case reports and check if clustered cases are occurring near possible breeding sites.',
      'Prioritize health education reminders, larval source reduction, and close weekly monitoring.',
    ]
  }

  if (risk === 'Moderate') {
    return [
      recommendation,
      `Schedule preventive inspection and community cleanup activities in ${barangay}.`,
      'Monitor case movement during the next reporting period and prepare escalation if the trend increases.',
      'Continue barangay information drives on dengue prevention and breeding-site removal.',
    ]
  }

  return [
    recommendation,
    `Maintain routine surveillance and sanitation monitoring in ${barangay}.`,
    'Continue public reminders on dengue prevention and household source reduction.',
  ]
}

function getBackendRationale(row = {}) {
  const forecast = Number(row.forecast_next_4_periods || 0)
  const historical = Number(row.historical_total_cases || 0)
  const recentAverage = Number(row.recent_average_cases || 0)
  const previousAverage = Number(row.previous_average_cases || 0)
  const trend = row.trend_direction || 'Stable'
  const risk = row.risk_level || 'Low'

  return [
    `The saved forecast projects ${formatNumber(forecast)} case${forecast === 1 ? '' : 's'} for the next four periods.`,
    `Risk level is classified as ${risk} using the saved forecast result.`,
    `Trend direction is ${trend}, based on a recent average of ${formatNumber(recentAverage)} compared with a previous average of ${formatNumber(previousAverage)}.`,
    `The uploaded dataset contains ${formatNumber(historical)} historical case${historical === 1 ? '' : 's'} for this barangay.`,
  ]
}

function buildBackendRiskRows(backendForecastResult = null) {
  const backendRows = backendForecastResult?.forecast_results || []

  return backendRows
    .map((row) => {
      const priority = getBackendPriorityLabel(row)
      const score = getBackendDecisionScore(row)
      const recommendation = row.recommendation || getGenericRecommendedAction(row.risk_level)
      const actions = getBackendActionPlan(row)
      const rationale = getBackendRationale(row)

      const combinedRiskScore = Number(
        row.multi_source_risk_score ??
          row.combined_risk_score ??
          row.risk_score ??
          0
      )

      const environmentalScore = Number(row.environmental_score || 0)

      const environmentalSuitability =
        row.environmental_suitability ||
        row.environmentalSuitability ||
        'Environmental data unavailable'

      const rainfallPressure =
        row.rainfall_pressure ||
        row.rainfallPressure ||
        'Rainfall pressure unavailable'

      const temperatureSuitability =
        row.temperature_suitability ||
        row.temperatureSuitability ||
        'Temperature suitability unavailable'

      const humiditySuitability =
        row.humidity_suitability ||
        row.humiditySuitability ||
        'Humidity suitability unavailable'

      const populationExposure =
        row.population_exposure ||
        row.populationExposure ||
        'Population exposure unavailable'

      const densityLevel =
        row.density_level ||
        row.densityLevel ||
        'Density unavailable'

      const averageRainfall = Number(row.average_rainfall || row.averageRainfall || 0)
      const averageTemperature = Number(row.average_temperature || row.averageTemperature || 0)
      const averageHumidity = Number(row.average_humidity || row.averageHumidity || 0)
      const population = Number(row.population || 0)
      const density = Number(row.density || 0)
      const riskComponents = row.risk_components || row.riskComponents || {}

      return {
        barangay: row.barangay || 'Unspecified barangay',
        barangayKey: row.barangay_key || '',
        risk: row.risk_level || 'Low',
        forecast: Number(row.forecast_next_4_periods || 0),
        forecastedCases: Number(row.forecast_next_4_periods || 0),
        predictedCases: Number(row.forecast_next_4_periods || 0),
        totalCases: Number(row.historical_total_cases || 0),
        cases: Number(row.historical_total_cases || 0),
        currentCases: Number(row.forecast_next_period || 0),
        previousCases: Number(row.previous_average_cases || 0),
        recentAverage: Number(row.recent_average_cases || 0),
        previousAverage: Number(row.previous_average_cases || 0),
        trend: row.trend_direction || 'Stable',
        trendLabel: row.trend_direction || 'Stable',
        latestPeriod: row.latest_period || '',
        priorityRank: Number(row.priority_rank || 0),
        responsePriority: priority,
        decisionScore: score,
        recommendedAction: recommendation,
        primaryAction: recommendation,
        recommendedActions: actions,
        recommendationRationale: rationale,

        multiSourceRiskScore: combinedRiskScore,
        multiSourceScore: combinedRiskScore,
        riskScore: combinedRiskScore,
        environmentalScore,
        environmentalSuitability,
        environmentalSuitabilityLabel: environmentalSuitability,
        rainfallPressure,
        rainfallPressureLabel: rainfallPressure,
        temperatureSuitability,
        temperatureSuitabilityLabel: temperatureSuitability,
        humiditySuitability,
        humiditySuitabilityLabel: humiditySuitability,
        populationExposure,
        densityLevel,
        averageRainfall,
        averageTemperature,
        averageHumidity,
        population,
        density,
        riskComponents,

        decisionSupport: {
          priority,
          score,
          summary: recommendation,
          primaryAction: recommendation,
          actions,
          rationale,
          trendDirection: row.trend_direction || 'Stable',
          densityLevel,
          populationExposure,
          forecastPressure: `${row.risk_level || 'Low'} forecast pressure`,
          environmentalSuitability,
          environmentalScore,
          rainfallPressure,
          temperatureSuitability,
          humiditySuitability,
          multiSourceRiskScore: combinedRiskScore,
          riskScore: combinedRiskScore,
          riskComponents,
        },
      }
    })
    .sort((a, b) => {
      if (a.priorityRank && b.priorityRank) {
        return a.priorityRank - b.priorityRank
      }

      return b.forecast - a.forecast
    })
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
      ? Math.round((validRowCount / originalRowCount) * 100)
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

  return `${topBarangay.barangay} is the top Response priority with ${decision.priority}, ${formatNumber(topBarangay.forecast)} projected cases, a Response score of ${formatNumber(decision.score)}, and a combined data risk score of ${formatNumber(profile.score)}/100.`
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
      ? `${topBarangay.barangay} is the highest Response priority with ${topDecision.priority}, ${formatNumber(topBarangay.forecast)} projected cases, and a combined data risk score of ${formatNumber(topProfile.score)}/100.`
      : 'No top priority barangay is available.',
    `Environmental context used in the report includes ${topProfile.rainfallPressure}, ${topProfile.temperatureSuitability}, and ${topProfile.humiditySuitability}.`,
    `The current workspace has a data quality score of ${dashboardStats?.dataQuality || 0}%.`,
  ]
}

function buildPrintableActionList(actions = []) {
  if (!actions.length) {
    return '<li>No action plan available yet.</li>'
  }

  return actions
    .slice(0, 6)
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join('')
}

function buildPrintableRationaleList(rationale = []) {
  if (!rationale.length) {
    return '<li>No rationale available yet.</li>'
  }

  return rationale
    .slice(0, 5)
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join('')
}

function openPrintableReport({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, title, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const hotspotCounts = getHotspotCounts(hotspotRows)
  const topHotspot = hotspotRows[0] || null
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
            <small>Total Cases</small>
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
            <small>Data Quality</small>
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
        <p>Barangays needing map name review: ${formatNumber(hotspotCounts.needsReview)}</p>
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
              <th>Combined data Score</th>
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
  const topHotspot = hotspotRows[0] || null
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
      ['Map names needing review', formatNumber(hotspotCounts.needsReview)],
      ['Report data source', dataSourceLabel],
      ['Four-week forecast total', formatNumber(dashboardStats.fourWeekForecast)],
      ['Data quality score', `${dashboardStats.dataQuality}%`],
      ['Top priority barangay', topBarangay?.barangay || 'No data'],
      ['Top Response priority', topDecision.priority || 'No data'],
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
    head: [['Combined data Factor', 'Value']],
    body: [
      ['Combined risk score', `${formatNumber(topProfile.score)}/100`],
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
        ? topDecision.actions.slice(0, 6).map((action, index) => [
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
        ? topDecision.rationale.slice(0, 6).map((reason) => [reason])
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

  doc.save('weekly-dengue-response-planning-report.pdf')
}

function downloadExcelWorkbook({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const hotspotCounts = getHotspotCounts(hotspotRows)
  const topHotspot = hotspotRows[0] || null
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)
  const officialMetadata = reportMetadata || getOfficialReportMetadata({
    sourceStatus,
    generatedAt,
    sortedRiskRows,
  })

  const workbook = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Weekly Dengue Response Planning Report'],
    ['Generated', generatedAt],
    ['Report ID', officialMetadata.reportId],
    ['Generated by', officialMetadata.generatedBy],
    ['Role', officialMetadata.role],
    ['Forecast method', officialMetadata.forecastMethod],
    ['Model version', officialMetadata.modelVersion],
    ['Forecast period/window', officialMetadata.forecastWindow],
    [],
    ['Metric', 'Value'],
    ['Total recorded cases', Number(dashboardStats.totalCases || 0)],
    ['Urgent alerts', decisionCounts.urgent],
    ['Preventive priority barangays', decisionCounts.preventive],
    ['Watch or monitoring barangays', decisionCounts.watch],
    ['Routine monitoring barangays', decisionCounts.routine],
    ['High-risk barangays', highRiskCount],
    ['Moderate-risk barangays', moderateRiskCount],
    ['Low-risk barangays', lowRiskCount],
    ['Confirmed hotspots', hotspotCounts.confirmed],
    ['Emerging hotspots', hotspotCounts.emerging],
    ['Map names needing review', hotspotCounts.needsReview],
    ['Top hotspot barangay', topHotspot?.barangay || 'Not checked'],
    ['Report data source', dataSourceLabel],
    ['Four-week forecast total', Number(dashboardStats.fourWeekForecast || 0)],
    ['Data quality score', `${dashboardStats.dataQuality}%`],
    ['Top priority barangay', topBarangay?.barangay || 'No data'],
    ['Top Response priority', topDecision.priority || 'No data'],
    ['Top combined data risk score', `${getMultiSourceProfile(topBarangay).score}/100`],
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
      'Combined data Risk Score',
      'Decision Score',
      'Projected Cases',
      'Historical Total Cases',
      'Current Cases',
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
      'Combined data Risk Score',
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

  XLSX.utils.book_append_sheet(workbook, factorSheet, 'Combined data Factors')

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

  XLSX.writeFile(workbook, 'weekly-dengue-response planning-report.xlsx')
}

async function downloadPowerPointDeck({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null }) {
  const sortedRiskRows = getSortedRiskRows(riskRows)
  const { highRiskCount, moderateRiskCount, lowRiskCount } = getRiskCounts(sortedRiskRows)
  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const priorityDistribution = getPriorityDistribution(sortedRiskRows)
  const hotspotCounts = getHotspotCounts(hotspotRows)
  const topHotspot = hotspotRows[0] || null
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
  pptx.subject = 'Weekly Dengue Response Planning Report'
  pptx.title = 'Weekly Dengue Response Planning Report'
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

  titleSlide.addText('Weekly Response Briefing', {
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
    'Total cases',
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
    'Data quality',
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
    `Confirmed: ${formatNumber(hotspotCounts.confirmed)} • Emerging: ${formatNumber(hotspotCounts.emerging)} • Needs map name review: ${formatNumber(hotspotCounts.needsReview)}`,
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
    'Top barangays ranked by Response priority, decision score, risk level, and projected dengue cases.'
  )

  prioritySlide.addTable(
    [
      ['Rank', 'Barangay', 'Risk', 'Response Priority', 'Score', 'Projected'],
      ...(topBarangays.length > 0
        ? topBarangays.map((row, index) => {
            const decision = getDecisionSupport(row)

            return [
              index + 1,
              row.barangay,
              row.risk,
              decision.priority,
              formatNumber(decision.score),
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
    'Combined data Risk Factors',
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
      ? `${topBarangay.barangay} currently has a combined data score of ${formatNumber(getMultiSourceProfile(topBarangay).score)}/100. This combines dengue forecast, case movement, rainfall, temperature, humidity, population exposure, and density context.`
      : 'Combined data factors will appear after dengue, weather, population, and boundary records are available.',
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
      ? `${topBarangay.barangay} is currently the top Response priority.`
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
    'Validation status of uploaded or available datasets.'
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
    fileName: 'weekly-dengue-response-planning-report.pptx',
  })
}

function StatCard({ label, value, helper, icon: Icon, tone = 'blue' }) {
  const toneMap = {
    blue: {
      iconWrap:
        'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
      glow: 'from-blue-50/90 to-white dark:from-blue-500/10 dark:to-slate-900',
    },
    rose: {
      iconWrap:
        'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
      glow: 'from-rose-50/90 to-white dark:from-rose-500/10 dark:to-slate-900',
    },
    emerald: {
      iconWrap:
        'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      glow: 'from-emerald-50/90 to-white dark:from-emerald-500/10 dark:to-slate-900',
    },
    amber: {
      iconWrap:
        'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      glow: 'from-amber-50/90 to-white dark:from-amber-500/10 dark:to-slate-900',
    },
  }

  const style = toneMap[tone] || toneMap.blue

  return (
    <div
      className={`group relative overflow-hidden rounded-[26px] border border-brand-line/70 bg-gradient-to-br ${style.glow} p-5 shadow-[0_16px_36px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(15,23,42,0.11)] dark:border-slate-800 dark:bg-slate-900`}
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/60 blur-2xl dark:bg-white/5" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted dark:text-slate-400">
            {label}
          </p>

          <h3 className="mt-3 break-words text-3xl font-black tracking-tight text-brand-text dark:text-slate-100">
            {value}
          </h3>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            {helper}
          </p>
        </div>

        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-sm ${style.iconWrap}`}
        >
          <Icon className="h-6 w-6" strokeWidth={2.2} />
        </div>
      </div>
    </div>
  )
}

function HeroMetric({ label, value, helper }) {
  return (
    <div className="rounded-[24px] border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black tracking-tight text-white">
        {value}
      </p>

      <p className="mt-1 text-xs leading-5 text-white/70">
        {helper}
      </p>
    </div>
  )
}

function SectionBadge({ icon: Icon, children, tone = 'blue' }) {
  const toneMap = {
    blue: 'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
    rose: 'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
    emerald: 'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    slate: 'border-slate-200 bg-slate-50 text-brand-muted dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${toneMap[tone] || toneMap.blue}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
      {children}
    </div>
  )
}

function PremiumPanel({ id, children, className = '' }) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 overflow-hidden rounded-[34px] border border-slate-200/80 bg-white/90 shadow-[0_22px_60px_rgba(15,23,42,0.08)] ring-1 ring-white/70 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80 dark:ring-white/5 ${className}`}
    >
      {children}
    </section>
  )
}

export default function ReportsPage() {
  const [format, setFormat] = useState('pdf')
  const [showAllPriorityBarangays, setShowAllPriorityBarangays] = useState(false)
  const [expandedPriorityBarangay, setExpandedPriorityBarangay] = useState(null)
  const [hotspotResult, setHotspotResult] = useState(null)
  const [hotspotError, setHotspotError] = useState('')
  const [isLoadingHotspotReport, setIsLoadingHotspotReport] = useState(false)

  const {
    dashboardStats = {},
    riskRows = [],
    sourceStatus = {},
    activityLogs = [],
    backendForecastResult = null,
    backendDengueSummary = null,
    addActivityLog,
  } = useData()

  const generatedAt = getCurrentDateTime()
  const usingBackendForecast = hasBackendForecastData(backendForecastResult)

  const displayRiskRows = useMemo(() => {
    if (usingBackendForecast) {
      return buildBackendRiskRows(backendForecastResult)
    }

    if (Array.isArray(riskRows) && riskRows.length > 0) {
      return riskRows
    }

    return []
  }, [usingBackendForecast, backendForecastResult, riskRows])

  const displayDashboardStats = useMemo(() => {
    if (usingBackendForecast) {
      return buildBackendDashboardStats(backendForecastResult, backendDengueSummary)
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

      setIsLoadingHotspotReport(true)

      try {
        const result = await getGeospatialHotspots()

        if (!active) return

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
  }, [usingBackendForecast, sourceStatus?.boundary?.validCount, backendForecastResult])


  const hotspotRows = useMemo(() => {
    return Array.isArray(hotspotResult?.hotspots) ? hotspotResult.hotspots : []
  }, [hotspotResult])

  const hotspotSummary = hotspotResult?.summary || null
  const hotspotCounts = getHotspotCounts(hotspotRows)
  const hotspotPriorityCount = hotspotCounts.confirmed + hotspotCounts.emerging
  const reportDataSourceLabel = getReportDataSourceLabel(usingBackendForecast)
  const officialReportMetadata = useMemo(() => {
    return getOfficialReportMetadata({
      sourceStatus,
      backendForecastResult,
      generatedAt,
      sortedRiskRows,
      usingBackendForecast,
    })
  }, [sourceStatus, backendForecastResult, generatedAt, sortedRiskRows, usingBackendForecast])
  const officialSourceRows = officialReportMetadata.sourceRows || []
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

  const reportSummary = useMemo(() => {
    return getReportSummary({
      sortedRiskRows,
      dashboardStats: displayDashboardStats,
    })
  }, [sortedRiskRows, displayDashboardStats])


  function getReportFilePath(formatLabel) {
    if (formatLabel === 'PDF') {
      return 'local_download:weekly-dengue-response-planning-report.pdf'
    }

    if (formatLabel === 'Excel') {
      return 'local_download:weekly-dengue-response-planning-report.xlsx'
    }

    if (formatLabel === 'PowerPoint') {
      return 'local_download:weekly-dengue-response-planning-report.pptx'
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
      mapReviewCount: hotspotCounts.needsReview,
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
        report_title: 'Weekly Dengue Response Planning Report',
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
    const title = 'Weekly Dengue Response Planning Report'
    const exportedAt = getCurrentDateTime()
    const exportedAtIso = new Date().toISOString()
    const reportMetadataForExport = getOfficialReportMetadata({
      sourceStatus,
      backendForecastResult,
      generatedAt: exportedAt,
      sortedRiskRows,
      usingBackendForecast,
    })

    const exportPayload = {
      dashboardStats: displayDashboardStats,
      riskRows: sortedRiskRows,
      sourceStatus,
      generatedAt: exportedAt,
      hotspotRows,
      hotspotSummary,
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
    <div className="relative space-y-6 pb-10">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 rounded-full bg-blue-100/70 blur-3xl dark:bg-blue-500/10" />

      <section className="relative overflow-hidden rounded-[36px] border border-slate-900/10 bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-900 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.22)] dark:border-slate-800 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_34%)]" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-stretch">
          <div className="flex flex-col justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/90 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Report center
              </div>

              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                Reports and Exports
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/90 sm:text-base">
                {usingBackendForecast
                  ? 'Ready-to-use reports generated from saved forecast, Response priority ranking, and response recommendations.'
                  : 'Ready-to-use reports for CHO review, barangay coordination, and weekly dengue response planning.'}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <HeroMetric
                label="Total cases"
                value={formatNumber(displayDashboardStats.totalCases)}
                helper="Recorded workspace cases"
              />

              <HeroMetric
                label="Urgent alerts"
                value={formatNumber(decisionCounts.urgent)}
                helper="Urgent response priorities"
              />

              <HeroMetric
                label="Forecast total"
                value={formatNumber(displayDashboardStats.fourWeekForecast)}
                helper="Projected four-week cases"
              />

              <HeroMetric
                label="Data quality"
                value={`${displayDashboardStats.dataQuality || 0}%`}
                helper="Validated readiness score"
              />
            </div>
          </div>

          <div className="rounded-[30px] border border-white/20 bg-white/20 p-5 shadow-[0_20px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/20 bg-white/20 text-white shadow-inner">
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

            <div className="mt-5 rounded-[24px] border border-white/20 bg-black/10 p-4">
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
              className="group mt-5 flex min-h-[78px] w-full items-center justify-between gap-4 rounded-[24px] border px-5 py-4 text-left shadow-[0_18px_38px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(15,23,42,0.22)]"
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total cases"
          value={formatNumber(displayDashboardStats.totalCases)}
          helper="Recorded cases in workspace"
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
          helper="Projected four-week cases"
          icon={BarChart3}
          tone="amber"
        />

        <StatCard
          label="Avg Combined score"
          value={`${formatNumber(averageMultiSourceScore)}/100`}
          helper="Average combined data risk"
          icon={Gauge}
          tone="blue"
        />

        <StatCard
          label="Data quality"
          value={`${displayDashboardStats.dataQuality || 0}%`}
          helper="Validated data readiness score"
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>

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
                The latest dengue analysis is ready for review. Reports, exports, priority ranking, and response recommendations now use the uploaded dengue records. The system identified{' '}
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
                ? `${formatNumber(hotspotPriorityCount)} barangay${hotspotPriorityCount === 1 ? '' : 's'} are confirmed or emerging hotspots. ${formatNumber(hotspotCounts.needsReview)} barangay${hotspotCounts.needsReview === 1 ? '' : 's'} need map name review before final hotspot interpretation.`
                : hotspotError || 'Hotspot information will appear after the map file and saved forecast are available.'}
            </p>
          </div>
        </div>
      </div>

      <PremiumPanel id="official-report-details" className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionBadge icon={FileText} tone="slate">
              Official report details
            </SectionBadge>

            <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
              Report metadata
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
              These details are included in the PDF, Excel, PowerPoint, and print outputs for a more official review-ready report.
            </p>
          </div>

          <span className="w-fit rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
            {officialReportMetadata.reportId}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Generated by', officialReportMetadata.generatedBy],
            ['Role', officialReportMetadata.role],
            ['Generated date/time', officialReportMetadata.generatedAt],
            ['Forecast window', officialReportMetadata.forecastWindow],
            ['Forecast method', officialReportMetadata.forecastMethod],
            ['Model version', officialReportMetadata.modelVersion],
            ['Risk thresholds', officialReportMetadata.riskThresholds],
            ['Top high-risk barangays', officialReportMetadata.topHighRiskBarangays],
          ].map(([label, value]) => (
            <div
              key={`metadata-${label}`}
              className="rounded-[22px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                {label}
              </p>

              <p className="mt-2 break-words text-sm font-black leading-6 text-brand-text dark:text-slate-100">
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-black text-brand-text dark:text-slate-100">
              Uploaded file record counts
            </p>
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
                    <tr key={`official-source-${row.dataset}`} className="text-brand-muted dark:text-slate-400">
                      <td className="px-4 py-3 font-black text-brand-text dark:text-slate-100">{row.dataset}</td>
                      <td className="max-w-[280px] break-all px-4 py-3">{row.filename}</td>
                      <td className="px-4 py-3">{row.uploadedAt}</td>
                      <td className="px-4 py-3 font-bold">{formatNumber(row.totalRecords)}</td>
                      <td className="px-4 py-3 font-bold text-brand-green dark:text-emerald-300">{formatNumber(row.validRecords)}</td>
                      <td className="px-4 py-3 font-bold text-brand-orange dark:text-amber-300">{formatNumber(row.invalidRecords)}</td>
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

        <div className="mt-5 rounded-[24px] border border-amber-100 bg-amber-50/80 p-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="text-sm font-black text-brand-orange dark:text-amber-300">
            Limitations and assumptions
          </p>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {officialReportMetadata.limitations.map((item, index) => (
              <div key={`limitation-${index}`} className="flex gap-2 rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm leading-6 text-brand-muted shadow-sm dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                  {index + 1}
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </PremiumPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <PremiumPanel id="decision-brief" className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionBadge icon={Sparkles} tone="blue">
                Response brief
              </SectionBadge>

              <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
                Weekly response planning brief
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

            <div className="mt-4 space-y-3">
              {reportSummary.map((item, index) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
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

            <div className="mt-4 space-y-3">
              {visibleTopBarangays.length > 0 ? (
                <>
                  {visibleTopBarangays.map((row, index) => {
                    const decision = getDecisionSupport(row)
                    const profile = getMultiSourceProfile(row)
                    const isExpanded = expandedPriorityBarangay === row.barangay

                    return (
                      <div
                        key={`${row.barangay}-${index}`}
                        className="group rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue/20 hover:shadow-md dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-sm dark:bg-white dark:text-slate-950">
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

                        <div className="mt-3 grid gap-2 sm:grid-cols-4">
                          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                              Combined score
                            </p>
                            <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                              {formatNumber(profile.score)}/100
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                              Environment
                            </p>
                            <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                              {profile.environmentalSuitability}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                              Response score
                            </p>
                            <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                              {formatNumber(decision.score)} pts
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
                              Current
                            </p>
                            <p className="mt-1 text-sm font-black text-brand-text dark:text-slate-100">
                              {formatNumber(row.currentCases || 0)} cases
                            </p>
                          </div>
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
                            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                                Combined data risk factors
                              </p>

                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
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

                            <div className="mt-3 rounded-[20px] border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-500/20 dark:bg-blue-500/10">
                              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-blue dark:text-blue-300">
                                Recommended response
                              </p>

                              <p className="mt-1 text-sm leading-6 text-brand-text dark:text-slate-300">
                                {decision.summary}
                              </p>
                            </div>

                            {decision.actions.length > 0 && (
                              <div className="mt-3 rounded-[20px] border border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-orange dark:text-amber-300">
                                  Action plan
                                </p>

                                <div className="mt-3 space-y-2">
                                  {decision.actions.slice(0, 3).map((action, actionIndex) => (
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
                                  {decision.rationale.slice(0, 3).map((reason, reasonIndex) => (
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

        <PremiumPanel id="export-center" className="p-5 sm:p-6 xl:sticky xl:top-24 xl:self-start">
          <SectionBadge icon={Download} tone="emerald">
            Export center
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Export options
          </h2>

          <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
            Select the output format, then generate the response planning report.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {exportFormats.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id)}
                  className={`group rounded-[24px] border p-4 text-left text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    format === item.id
                      ? 'ring-2 ring-brand-blue ring-offset-2 dark:ring-offset-slate-900'
                      : ''
                  } ${item.style}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm dark:bg-white/10">
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

          <div className="mt-5 rounded-[24px] border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:to-slate-900">
            <p className="flex items-center gap-2 text-sm font-black text-brand-orange dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Export note
            </p>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {usingBackendForecast
                ? 'PDF, Excel, PowerPoint, and print reports now include saved forecast totals, response priority, recommended actions, reasons for the recommendation, and hotspot summary when available.'
                : 'PDF, Excel, PowerPoint, and print reports include response priority, combined risk score, rainfall, temperature, humidity, population, density, action plan, and reasons for the recommendation.'}
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

                <div className="rounded-[20px] border border-white/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                    Combined data factors
                  </p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      ['Combined score', `${formatNumber(topProfile.score)}/100`],
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

                {topDecision.actions.length > 0 && (
                  <div className="rounded-[20px] border border-white/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                      Action plan
                    </p>

                    <div className="mt-3 space-y-2">
                      {topDecision.actions.slice(0, 5).map((action, index) => (
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

                {topDecision.rationale.length > 0 && (
                  <div className="rounded-[20px] border border-white/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-400">
                      Why this recommendation
                    </p>

                    <div className="mt-3 space-y-2">
                      {topDecision.rationale.slice(0, 4).map((reason, index) => (
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

      <div className="grid gap-6 xl:grid-cols-[0.7fr_1fr]">
        <PremiumPanel className="p-5 sm:p-6">
          <SectionBadge icon={Send} tone="blue">
            Distribution
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Distribution list
          </h2>

          <div className="mt-5 space-y-3">
            {distributionItems.map((item) => {
              const Icon = item.icon

              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3.5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900"
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

        <PremiumPanel className="p-5 sm:p-6">
          <SectionBadge icon={Database} tone="slate">
            Uploaded data readiness
          </SectionBadge>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
            Uploaded data readiness
          </h2>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {Object.entries(sourceStatus || {}).length > 0 ? (
              Object.entries(sourceStatus || {}).map(([key, item = {}]) => (
                <div
                  key={key}
                  className="min-w-0 rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
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

      <PremiumPanel className="p-5 sm:p-6">
        <SectionBadge icon={Activity} tone="slate">
          Activity
        </SectionBadge>

        <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-slate-100">
          Recent report activity
        </h2>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {(activityLogs || []).slice(0, 3).length > 0 ? (
            (activityLogs || []).slice(0, 3).map((log) => (
              <div
                key={log.id}
                className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
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
    </div>
  )
}
