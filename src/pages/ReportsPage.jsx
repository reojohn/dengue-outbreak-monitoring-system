import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { createBackendNotificationEvent, getBarangayTrendAnalytics, getCityTrendAnalytics, getFieldUpdate, getFieldUpdates, saveGeneratedReport } from '../services/api'
import reportsHeroBackground from '../assets/reports.png'
import FieldUpdateReportCard from '../components/FieldUpdateReportCard'
import CityTrendAnalyticsPanel from '../components/CityTrendAnalyticsPanel'
import InformationTypeBadge from '../components/InformationTypeBadge'
import { getAuthSession } from '../utils/auth'

const REPORT_TITLE = 'Dengue Situation and Four-Month Response Planning Report'
const REPORT_SYSTEM_NAME = 'Barangay-Level Dengue Outbreak Response System'
const REPORT_EXPORT_BASENAME = 'dengue-four-month-response-planning-report'


function sanitizeReportFileSegment(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'barangay'
}

function getReportScopeConfig(metadata = {}) {
  const isBarangayScoped = metadata?.reportScope === 'assigned_barangay'
  const barangay = String(metadata?.assignedBarangay || '').trim()
  const safeBarangay = sanitizeReportFileSegment(barangay)

  return {
    isBarangayScoped,
    barangay,
    title: isBarangayScoped && barangay
      ? `${barangay} Barangay Dengue Monitoring and Response Report`
      : REPORT_TITLE,
    basename: isBarangayScoped && barangay
      ? `${safeBarangay}-barangay-dengue-monitoring-response-report`
      : REPORT_EXPORT_BASENAME,
    scopeLabel: isBarangayScoped && barangay
      ? `${barangay} only`
      : 'Butuan City citywide',
  }
}

const exportFormats = [
  {
    id: 'pdf',
    label: 'PDF report',
    desc: 'Downloads a PDF response report',
    actionLabel: 'Generate PDF report',
    icon: FileText,
    style:
      'border-rose-100 bg-rose-50 text-brand-red dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
  },
  {
    id: 'excel',
    label: 'Excel workbook',
    desc: 'Downloads an XLSX workbook with response planning sheets',
    actionLabel: 'Generate Excel workbook',
    icon: FileSpreadsheet,
    style:
      'border-emerald-100 bg-emerald-50 text-brand-green dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  {
    id: 'powerpoint',
    label: 'PowerPoint deck',
    desc: 'Generates a designed briefing presentation',
    actionLabel: 'Generate PowerPoint deck',
    icon: Presentation,
    style:
      'border-blue-100 bg-blue-50 text-brand-blue dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
  },
  {
    id: 'print',
    label: 'Print view',
    desc: 'Opens a browser print-ready response report',
    actionLabel: 'Open print view',
    icon: Printer,
    style:
      'border-amber-100 bg-amber-50 text-brand-orange dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  },
]

const exportSelectionThemes = {
  pdf: {
    card:
      'border-rose-400/90 bg-gradient-to-br from-rose-100 via-white to-orange-100/90 ring-2 ring-rose-300/70 shadow-[0_20px_50px_rgba(244,63,94,0.22)] -translate-y-0.5 scale-[1.015] dark:border-rose-400/60 dark:from-rose-500/20 dark:via-slate-950 dark:to-orange-500/10 dark:ring-rose-400/30 dark:shadow-[0_20px_50px_rgba(244,63,94,0.12)]',
    icon:
      'border-rose-300 bg-rose-600 text-white shadow-[0_10px_24px_rgba(225,29,72,0.28)] dark:border-rose-300/30 dark:bg-rose-500 dark:text-white',
    badge:
      'border-rose-300 bg-rose-600 text-white shadow-[0_8px_20px_rgba(225,29,72,0.24)] dark:border-rose-300/30 dark:bg-rose-500',
    summary:
      'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50/80 shadow-[0_14px_34px_rgba(244,63,94,0.12)] dark:border-rose-400/25 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/5',
    summaryLabel: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500 dark:bg-rose-400',
    button:
      'bg-rose-600 shadow-[0_14px_30px_rgba(225,29,72,0.28)] hover:bg-rose-700 hover:shadow-[0_18px_38px_rgba(225,29,72,0.34)] dark:bg-rose-500 dark:hover:bg-rose-400',
  },
  excel: {
    card:
      'border-emerald-400/90 bg-gradient-to-br from-emerald-100 via-white to-teal-100/90 ring-2 ring-emerald-300/70 shadow-[0_20px_50px_rgba(16,185,129,0.22)] -translate-y-0.5 scale-[1.015] dark:border-emerald-400/60 dark:from-emerald-500/20 dark:via-slate-950 dark:to-teal-500/10 dark:ring-emerald-400/30 dark:shadow-[0_20px_50px_rgba(16,185,129,0.12)]',
    icon:
      'border-emerald-300 bg-emerald-600 text-white shadow-[0_10px_24px_rgba(5,150,105,0.28)] dark:border-emerald-300/30 dark:bg-emerald-500 dark:text-white',
    badge:
      'border-emerald-300 bg-emerald-600 text-white shadow-[0_8px_20px_rgba(5,150,105,0.24)] dark:border-emerald-300/30 dark:bg-emerald-500',
    summary:
      'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50/80 shadow-[0_14px_34px_rgba(16,185,129,0.12)] dark:border-emerald-400/25 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5',
    summaryLabel: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500 dark:bg-emerald-400',
    button:
      'bg-emerald-600 shadow-[0_14px_30px_rgba(5,150,105,0.28)] hover:bg-emerald-700 hover:shadow-[0_18px_38px_rgba(5,150,105,0.34)] dark:bg-emerald-500 dark:hover:bg-emerald-400',
  },
  powerpoint: {
    card:
      'border-blue-400/90 bg-gradient-to-br from-blue-100 via-white to-cyan-100/90 ring-2 ring-blue-300/70 shadow-[0_20px_50px_rgba(59,130,246,0.22)] -translate-y-0.5 scale-[1.015] dark:border-blue-400/60 dark:from-blue-500/20 dark:via-slate-950 dark:to-cyan-500/10 dark:ring-blue-400/30 dark:shadow-[0_20px_50px_rgba(59,130,246,0.12)]',
    icon:
      'border-blue-300 bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)] dark:border-blue-300/30 dark:bg-blue-500 dark:text-white',
    badge:
      'border-blue-300 bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.24)] dark:border-blue-300/30 dark:bg-blue-500',
    summary:
      'border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50/80 shadow-[0_14px_34px_rgba(59,130,246,0.12)] dark:border-blue-400/25 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5',
    summaryLabel: 'text-blue-700 dark:text-blue-300',
    bar: 'bg-blue-500 dark:bg-blue-400',
    button:
      'bg-blue-600 shadow-[0_14px_30px_rgba(37,99,235,0.28)] hover:bg-blue-700 hover:shadow-[0_18px_38px_rgba(37,99,235,0.34)] dark:bg-blue-500 dark:hover:bg-blue-400',
  },
  print: {
    card:
      'border-amber-400/90 bg-gradient-to-br from-amber-100 via-white to-orange-100/90 ring-2 ring-amber-300/70 shadow-[0_20px_50px_rgba(245,158,11,0.22)] -translate-y-0.5 scale-[1.015] dark:border-amber-400/60 dark:from-amber-500/20 dark:via-slate-950 dark:to-orange-500/10 dark:ring-amber-400/30 dark:shadow-[0_20px_50px_rgba(245,158,11,0.12)]',
    icon:
      'border-amber-300 bg-amber-500 text-white shadow-[0_10px_24px_rgba(217,119,6,0.28)] dark:border-amber-300/30 dark:bg-amber-500 dark:text-white',
    badge:
      'border-amber-300 bg-amber-500 text-white shadow-[0_8px_20px_rgba(217,119,6,0.24)] dark:border-amber-300/30 dark:bg-amber-500',
    summary:
      'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50/80 shadow-[0_14px_34px_rgba(245,158,11,0.12)] dark:border-amber-400/25 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/5',
    summaryLabel: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500 dark:bg-amber-400',
    button:
      'bg-amber-500 shadow-[0_14px_30px_rgba(217,119,6,0.28)] hover:bg-amber-600 hover:shadow-[0_18px_38px_rgba(217,119,6,0.34)] dark:bg-amber-500 dark:hover:bg-amber-400',
  },
}

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
      } else if (priority.includes('routine')) {
        // Check Routine Monitoring before the generic word "monitoring" so
        // routine barangays are not incorrectly counted as watch barangays.
        acc.routine += 1
      } else if (
        priority.includes('early') ||
        priority.includes('watch') ||
        priority.includes('monitoring')
      ) {
        acc.watch += 1
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
    return 'Forecast case-risk thresholds (cumulative forecast cases across four future periods): High = 60 or more; Moderate = 25 to 59; Low = fewer than 25. The 0–100 combined prioritization score is separate.'
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



function hasMeaningfulValue(value) {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function firstMeaningfulValue(...values) {
  return values.find((value) => hasMeaningfulValue(value))
}

function formatSelectionExplanationForReport(value) {
  if (!hasMeaningfulValue(value)) return 'Not recorded'
  if (typeof value === 'string') return value

  if (typeof value === 'object') {
    const direct = firstMeaningfulValue(
      value.explanation,
      value.summary,
      value.reason,
      value.message,
      value.label
    )
    if (direct) return String(direct)

    const readable = Object.entries(value)
      .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item))
      .map(([key, item]) => `${toTitleCase(key)}: ${item}`)
      .join('; ')

    return readable || 'Not recorded'
  }

  return String(value)
}

function getForecastPeriodDetails(row = {}) {
  const direct = firstMeaningfulValue(
    row.forecastPeriodPredictions,
    row.forecast_period_predictions,
    row.period_predictions,
    row.periodPredictions
  )

  const items = Array.isArray(direct)
    ? direct
    : Array.isArray(row.series)
      ? row.series.filter((item) => item?.isForecast)
      : Array.isArray(row.caseHistory)
        ? row.caseHistory.filter((item) => item?.isForecast)
        : []

  const normalized = items.slice(0, 4).map((item, index) => ({
    horizon: Number(item?.horizon || index + 1),
    label: String(item?.period_label || item?.period || item?.label || `Period ${index + 1}`),
    predictedCases: Number(item?.predicted_cases ?? item?.predictedCases ?? item?.cases ?? 0),
  }))

  while (normalized.length < 4) {
    normalized.push({
      horizon: normalized.length + 1,
      label: `Period ${normalized.length + 1}`,
      predictedCases: 0,
    })
  }

  return normalized
}

function getCitySurveillanceSummary(cityTrendAnalytics = null) {
  const summary = cityTrendAnalytics?.summary || {}
  const filters = cityTrendAnalytics?.filters || {}
  const historicalPeak = cityTrendAnalytics?.historical_peak || null
  const classification = cityTrendAnalytics?.case_classification || null

  return {
    hasData: Boolean(cityTrendAnalytics?.has_data),
    scopeLabel: filters.scope_label || filters.year || 'Latest available year',
    year: filters.year || '',
    totalCases: Number(summary.total_cases || 0),
    highestMonth: summary.peak_month || null,
    lowestMonth: summary.lowest_month || null,
    trendDirection: summary.trend_direction || 'No comparison',
    changeLabel: summary.change_label || 'No previous month available',
    usualPeakMonth: historicalPeak?.month_label || 'Not available',
    usualPeakAverage: Number(historicalPeak?.average_cases || 0),
    interpretation: cityTrendAnalytics?.interpretation || 'No recorded dengue trend interpretation is available yet.',
    monthly: Array.isArray(cityTrendAnalytics?.monthly) ? cityTrendAnalytics.monthly : [],
    classification,
  }
}

function formatCaseClassificationValue(classification, field, availabilityField) {
  if (!classification?.available || !classification?.[availabilityField]) return 'N/A'
  return formatNumber(classification?.[field] || 0)
}

function buildActualTrendSvg(monthly = []) {
  const rows = Array.isArray(monthly) ? monthly.slice(0, 12) : []

  if (!rows.length) {
    return '<div class="trend-empty">No monthly actual case data available.</div>'
  }

  const width = 720
  const height = 230
  const padLeft = 48
  const padRight = 18
  const padTop = 18
  const padBottom = 38
  const plotWidth = width - padLeft - padRight
  const plotHeight = height - padTop - padBottom
  const maxCases = Math.max(1, ...rows.map((row) => Number(row?.cases || 0)))
  const xStep = rows.length > 1 ? plotWidth / (rows.length - 1) : 0
  const points = rows.map((row, index) => {
    const cases = Number(row?.cases || 0)
    const x = padLeft + index * xStep
    const y = padTop + plotHeight - (cases / maxCases) * plotHeight
    return { x, y, cases, label: row?.month_short || row?.month_label || `M${index + 1}` }
  })

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padTop + plotHeight - ratio * plotHeight
    const value = Math.round(maxCases * ratio)
    return `
      <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="#dbe4ee" stroke-width="1" />
      <text x="${padLeft - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b">${value}</text>
    `
  }).join('')

  const labels = points.map((point) => `
    <text x="${point.x.toFixed(1)}" y="${height - 12}" text-anchor="middle" font-size="10" fill="#64748b">${escapeHtml(point.label)}</text>
  `).join('')

  const dots = points.map((point) => `
    <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" fill="#255f8f" stroke="#ffffff" stroke-width="2" />
  `).join('')

  return `
    <div class="trend-chart-card">
      <div class="trend-chart-heading">Jan-Dec actual dengue trend</div>
      <svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly actual dengue case trend">
        ${gridLines}
        <polyline points="${points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#255f8f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
        ${labels}
      </svg>
    </div>
  `
}

const FIELD_OBSERVATION_LABELS = {
  standing_water: 'Standing water observed',
  uncovered_water_containers: 'Uncovered water containers',
  possible_breeding_sites: 'Possible mosquito breeding sites',
  flood_prone_area: 'Flood-prone area',
  low_lying_area: 'Low-lying area',
  waste_accumulation: 'Waste accumulation',
  clogged_drainage: 'Clogged drainage',
}

function getFieldMonitoringSummary(fieldUpdateResult = null) {
  const allRows = Array.isArray(fieldUpdateResult?.field_updates) ? fieldUpdateResult.field_updates : []
  const rows = allRows.filter((item) => item?.status && item.status !== 'Draft')
  const observationCounts = new Map()

  rows.forEach((item) => {
    Object.entries(item?.environmental_observations || {}).forEach(([key, observed]) => {
      if (!observed) return
      const label = FIELD_OBSERVATION_LABELS[key] || toTitleCase(key)
      observationCounts.set(label, Number(observationCounts.get(label) || 0) + 1)
    })
  })

  const commonObservations = Array.from(observationCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5)

  const latestDate = rows
    .map((item) => item.reporting_date || item.submitted_at || item.updated_at || '')
    .filter(Boolean)
    .sort()
    .at(-1) || ''

  return {
    available: Boolean(fieldUpdateResult),
    total: rows.length,
    awaitingReview: rows.filter((item) => item.status === 'Submitted').length,
    reviewed: rows.filter((item) => item.status === 'Reviewed').length,
    followUpRequired: rows.filter((item) => item.status === 'Follow-up Required').length,
    urgent: rows.filter((item) => item.is_urgent || item.risk_level === 'High').length,
    suppliesNeeded: rows.filter((item) => item.supplies_needed).length,
    assistanceNeeded: rows.filter((item) => item.assistance_needed).length,
    latestDate,
    commonObservations,
  }
}

function getActiveModelPayload(backendForecastResult = null, latestModelMetrics = null) {
  const trainingSummary = firstMeaningfulValue(
    backendForecastResult?.training_summary,
    latestModelMetrics?.training_summary,
    latestModelMetrics?.metrics?.training_summary,
    {}
  ) || {}

  const modelMetrics = firstMeaningfulValue(
    backendForecastResult?.model_metrics,
    backendForecastResult?.metrics,
    latestModelMetrics?.metrics,
    latestModelMetrics?.model_metrics,
    {}
  ) || {}

  const modelComparison = firstMeaningfulValue(
    backendForecastResult?.model_comparison,
    backendForecastResult?.modelComparison,
    latestModelMetrics?.model_comparison,
    latestModelMetrics?.modelComparison,
    []
  ) || []

  const selectionConfidence = firstMeaningfulValue(
    backendForecastResult?.selection_confidence,
    backendForecastResult?.selectionConfidence,
    latestModelMetrics?.selection_confidence,
    latestModelMetrics?.selectionConfidence,
    trainingSummary?.selection_confidence,
    modelMetrics?.selection_confidence,
    null
  )

  const selectionExplanation = firstMeaningfulValue(
    backendForecastResult?.selection_explanation,
    backendForecastResult?.selectionExplanation,
    latestModelMetrics?.selection_explanation,
    latestModelMetrics?.selectionExplanation,
    trainingSummary?.selection_explanation,
    modelMetrics?.selection_explanation,
    ''
  )

  const featureImportance = firstMeaningfulValue(
    backendForecastResult?.feature_importance,
    backendForecastResult?.featureImportance,
    latestModelMetrics?.feature_importance,
    latestModelMetrics?.featureImportance,
    modelMetrics?.feature_importance,
    []
  ) || []

  const selectedModel = firstMeaningfulValue(
    backendForecastResult?.model_display_name,
    modelMetrics?.model_name,
    latestModelMetrics?.best_model_name,
    trainingSummary?.selected_model_name,
    backendForecastResult?.best_model_name,
    backendForecastResult?.model_name,
    backendForecastResult?.forecast_run?.model_name,
    backendForecastResult?.forecastRun?.model_name,
    ''
  ) || ''

  const selectedModelKey = firstMeaningfulValue(
    modelMetrics?.model_key,
    latestModelMetrics?.best_model_key,
    backendForecastResult?.best_model_key,
    backendForecastResult?.model_key,
    backendForecastResult?.model_name,
    selectedModel,
    ''
  ) || ''

  const modelVersion = firstMeaningfulValue(
    modelMetrics?.model_version,
    backendForecastResult?.model_version,
    backendForecastResult?.forecast_run?.model_version,
    backendForecastResult?.forecastRun?.model_version,
    latestModelMetrics?.model_version,
    'v1'
  ) || 'v1'

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
    modelComparison: Array.isArray(modelComparison) ? modelComparison : [],
    selectionConfidence,
    selectionExplanation,
    featureImportance: Array.isArray(featureImportance) ? featureImportance : [],
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
    ['R²', modelMetrics?.r2],
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
  reportScope = 'citywide',
  assignedBarangay = '',
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

  const scopedForecastPeriodLabels =
    reportScope === 'assigned_barangay' && sortedRiskRows[0]
      ? getForecastPeriodDetails(sortedRiskRows[0])
          .map((item) => item?.label)
          .filter(Boolean)
      : []
  const forecastPeriodLabels =
    scopedForecastPeriodLabels.length > 0
      ? scopedForecastPeriodLabels
      : backendForecastResult?.forecast_results?.[0]?.forecast_period_predictions
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
    reportScope,
    assignedBarangay,
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
    modelsEvaluated: Number(trainingSummary?.models_evaluated || latestModelMetrics?.models_evaluated || modelComparison.length || 0) || 'Not recorded',
    aiConfidence: selectionConfidence?.score ? `${selectionConfidence.score}/100 · ${selectionConfidence.label || 'Selection strength'} · heuristic model-selection score, not forecast probability` : 'Not available yet',
    featureImportanceSummary: getFeatureImportanceSummaryForReport(backendForecastResult, latestModelMetrics),
    selectedModelMetrics: getModelMetricsSummaryForReport(modelMetrics),
    modelComparisonSummary: getModelComparisonSummaryForReport(modelComparison),
    selectionExplanation: formatSelectionExplanationForReport(selectionExplanation),
    riskThresholds: formatThresholds(
      backendForecastResult?.risk_thresholds || backendForecastResult?.riskThresholds
    ),
    forecastWindow,
    topHighRiskBarangays: getTopHighRiskBarangays(sortedRiskRows),
    assignedBarangayRiskStatus: reportScope === 'assigned_barangay' && sortedRiskRows[0]
      ? `${sortedRiskRows[0].barangay}: ${sortedRiskRows[0].risk || 'Unknown'} risk`
      : '',
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
  const scope = getReportScopeConfig(metadata)

  return [
    ['Report ID', metadata.reportId || 'Not assigned'],
    ['Report scope', scope.scopeLabel],
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
    [scope.isBarangayScoped ? 'Assigned barangay risk status' : 'Top high-risk barangays', scope.isBarangayScoped ? (metadata.assignedBarangayRiskStatus || 'Not available') : (metadata.topHighRiskBarangays || 'No high-risk barangay in the current report.')],
  ]
}


function getOperationalMetadataRows(metadata = {}) {
  const scope = getReportScopeConfig(metadata)
  const totalRecords = Number(metadata.totalRecords || 0)
  const validRecords = Number(metadata.validRecords || 0)

  return [
    ['Report ID', metadata.reportId || 'Not assigned'],
    ['Report scope', scope.scopeLabel],
    ['Generated date/time', metadata.generatedAt || 'Not recorded'],
    ['Generated by', metadata.generatedBy || 'CHO user'],
    ['Role', metadata.role || 'City Health Office / Barangay Dengue Response Team'],
    ['Forecast method', metadata.forecastMethod || 'Not recorded'],
    ['Forecast period/window', metadata.forecastWindow || 'Not recorded'],
    ['Forecast case-risk thresholds', metadata.riskThresholds || 'Not recorded'],
    ['Source records', `${formatNumber(validRecords)} valid of ${formatNumber(totalRecords)} total records`],
    [scope.isBarangayScoped ? 'Assigned barangay risk status' : 'Top high-risk barangays', scope.isBarangayScoped ? (metadata.assignedBarangayRiskStatus || 'Not available') : (metadata.topHighRiskBarangays || 'No high-risk barangay in the current report.')],
  ]
}

function getTechnicalModelMetadataRows(metadata = {}) {
  return [
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
      'Prioritize this barangay in the next CHO coordination meeting because forecast case pressure is high.'
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

function getTopDecisionText(topBarangay, isBarangayScoped = false) {
  if (!topBarangay) {
    return 'No barangay response planning output is available yet.'
  }

  const decision = getDecisionSupport(topBarangay)
  const profile = getMultiSourceProfile(topBarangay)

  if (isBarangayScoped) {
    return `${topBarangay.barangay} currently has a ${decision.priority} response priority, ${formatNumber(topBarangay.forecast)} forecast cases, a Response score of ${formatNumber(decision.score)}, and a combined priority score of ${formatNumber(profile.score)}/100.`
  }

  return `${topBarangay.barangay} is the top response priority with ${decision.priority}, ${formatNumber(topBarangay.forecast)} forecast cases, a Response score of ${formatNumber(decision.score)}, and a combined priority score of ${formatNumber(profile.score)}/100.`
}

function getReportSummary({ sortedRiskRows, dashboardStats, isBarangayScoped = false }) {
  if (!sortedRiskRows.length) {
    return isBarangayScoped
      ? [
          'No assigned-barangay risk result is available yet.',
          'Load the validated dengue records before generating a complete barangay response report.',
          'Generate the report again after the assigned barangay data are available.',
        ]
      : [
          'No barangay risk ranking is available yet.',
          'Upload or load dengue case records before generating a complete response planning report.',
          'Upload the official dengue records when they are available, then generate the report again.',
        ]
  }

  const decisionCounts = getDecisionCounts(sortedRiskRows)
  const topBarangay = sortedRiskRows[0]
  const topDecision = getDecisionSupport(topBarangay)
  const topProfile = getMultiSourceProfile(topBarangay)

  if (isBarangayScoped) {
    return [
      `${topBarangay.barangay} currently has ${topBarangay.risk || 'Unknown'} forecast risk with a ${topDecision.priority} response priority.`,
      `The four-period forecast totals ${formatNumber(topBarangay.forecast)} cases, with a combined prioritization score of ${formatNumber(topProfile.score)}/100.`,
      `Supporting context includes ${topProfile.rainfallPressure}, ${topProfile.temperatureSuitability}, and ${topProfile.humiditySuitability}.`,
      `The report source data have a valid-row rate of ${dashboardStats?.dataQuality || 0}%.`,
    ]
  }

  return [
    decisionCounts.urgent > 0
      ? `${decisionCounts.urgent} barangay${decisionCounts.urgent === 1 ? '' : 's'} require immediate, high-priority, or escalated response planning.`
      : 'No barangay currently requires immediate or escalated response planning.',
    topBarangay
      ? `${topBarangay.barangay} is the highest Response priority with ${topDecision.priority}, ${formatNumber(topBarangay.forecast)} forecast cases, and a combined prioritization score of ${formatNumber(topProfile.score)}/100.`
      : 'No top priority barangay is available.',
    `Environmental context used in the report includes ${topProfile.rainfallPressure}, ${topProfile.temperatureSuitability}, and ${topProfile.humiditySuitability}.`,
    `The current workspace has a source valid-row rate of ${dashboardStats?.dataQuality || 0}%.`,
  ]
}


function getActionCategory(action = '') {
  const value = String(action || '').toLowerCase()

  if (value.includes('surveillance') && (value.includes('sanitation') || value.includes('environmental'))) {
    return 'surveillance-sanitation'
  }

  if (value.includes('household') && (value.includes('stagnant water') || value.includes('remove') || value.includes('eliminat'))) {
    return 'household-source-reduction'
  }

  if (value.includes('monitoring') && value.includes('prevention reminder')) {
    return 'routine-monitoring'
  }

  if (value.includes('bhw coverage') || value.includes('communication channel')) {
    return 'coverage-communication'
  }

  if (value.includes('previously affected') || value.includes('historical case')) {
    return 'historical-comparison'
  }

  if (value.includes('next reporting period') || value.includes('reassess')) {
    return 'next-period-review'
  }

  if (value.includes('cluster') || value.includes('purok')) {
    return 'cluster-check'
  }

  if (value.includes('rainy') && value.includes('advis')) {
    return 'rainy-period-advisory'
  }

  return ''
}

function normalizeActionText(action = '') {
  return String(action || '')
    .toLowerCase()
    .replace(/\b(eliminating|eliminate|removing|removed)\b/g, 'remove')
    .replace(/\b(regularly|regular|routine)\b/g, 'routine')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getPolishedActionList(actions = [], summary = '', limit = 6) {
  const source = Array.isArray(actions) ? actions : []
  const summaryKey = normalizeActionText(summary)
  const seenText = new Set()
  const seenCategories = new Set()
  const polished = []

  source.forEach((action) => {
    const value = String(action || '').trim()
    if (!value) return

    const normalized = normalizeActionText(value)
    if (!normalized || normalized === summaryKey || seenText.has(normalized)) return

    const category = getActionCategory(value)
    if (category && seenCategories.has(category)) return

    seenText.add(normalized)
    if (category) seenCategories.add(category)
    polished.push(value)
  })

  return polished.slice(0, limit)
}

function getBarangayOperationalRationale({ row = null, decision = {}, actualSurveillance = {}, dashboardStats = {} } = {}) {
  const periods = getForecastPeriodDetails(row || {})
  const nextPeriodCases = Number(periods?.[0]?.predictedCases || 0)
  const movement = String(actualSurveillance?.trendDirection || 'No comparison')
  const changeLabel = String(actualSurveillance?.changeLabel || '').trim()
  const modelTrend = String(decision?.trendDirection || 'Trend unavailable')

  return [
    `Forecast risk: ${row?.risk || 'Unknown'}.`,
    `Projected four-period cases: ${formatNumber(row?.forecast || 0)}.`,
    `Forecast for the next period: ${formatNumber(nextPeriodCases)} cases.`,
    `Latest monthly movement: ${movement}${changeLabel ? ` · ${changeLabel}` : ''}.`,
    `Model recent trend signal: ${modelTrend}.`,
    `Historical cases used for model analysis: ${formatNumber(dashboardStats?.totalCases || 0)}.`,
  ]
}

function buildPrintableActionList(actions = [], summary = '') {
  const polishedActions = getPolishedActionList(actions, summary, 6)

  if (!polishedActions.length) {
    return '<li>No additional action steps are available yet.</li>'
  }

  return polishedActions
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

function openPrintableReport({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, title, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null, cityTrendAnalytics = null, fieldMonitoringSummary = null }) {
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
  const actualSurveillance = getCitySurveillanceSummary(cityTrendAnalytics)
  const reportScopeConfig = getReportScopeConfig(officialMetadata)
  const scopedTitle = reportScopeConfig.title
  const barangayLabel = reportScopeConfig.barangay || topBarangay?.barangay || 'Assigned barangay'

  const metadataRows = reportScopeConfig.isBarangayScoped
    ? getOperationalMetadataRows(officialMetadata)
    : getOfficialMetadataRows(officialMetadata)

  const metadataHtml = metadataRows
    .map(([label, value]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(value)}</td>
      </tr>
    `)
    .join('')

  const technicalModelHtml = getTechnicalModelMetadataRows(officialMetadata)
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
      const commonCells = `
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
      `

      return reportScopeConfig.isBarangayScoped
        ? `<tr>${commonCells}</tr>`
        : `<tr><td>${index + 1}</td>${commonCells}</tr>`
    })
    .join('')

  const forecastRowsHtml = sortedRiskRows
    .map((row, index) => {
      const periods = getForecastPeriodDetails(row)
      const commonCells = `
          <td>${escapeHtml(row.barangay)}</td>
          <td>${formatNumber(periods[0]?.predictedCases || 0)}</td>
          <td>${formatNumber(periods[1]?.predictedCases || 0)}</td>
          <td>${formatNumber(periods[2]?.predictedCases || 0)}</td>
          <td>${formatNumber(periods[3]?.predictedCases || 0)}</td>
          <td>${formatNumber(row.forecast || 0)}</td>
          <td>${escapeHtml(row.risk || 'Unknown')}</td>
      `

      return reportScopeConfig.isBarangayScoped
        ? `<tr>${commonCells}</tr>`
        : `<tr><td>${index + 1}</td>${commonCells}</tr>`
    })
    .join('')

  const actualMonthlyHtml = actualSurveillance.monthly
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.month_label || row.month_short || '')}</td>
        <td>${formatNumber(row.cases || 0)}</td>
      </tr>
    `)
    .join('')

  const actualTrendHtml = buildActualTrendSvg(actualSurveillance.monthly)

  const classification = actualSurveillance.classification
  const classificationHtml = classification
    ? `
      <tr><td>Confirmed</td><td>${escapeHtml(formatCaseClassificationValue(classification, 'confirmed_cases', 'confirmed_available'))}</td></tr>
      <tr><td>Probable</td><td>${escapeHtml(formatCaseClassificationValue(classification, 'probable_cases', 'probable_available'))}</td></tr>
      <tr><td>Suspected</td><td>${escapeHtml(formatCaseClassificationValue(classification, 'suspected_cases', 'suspected_available'))}</td></tr>
      <tr><td>Total reported</td><td>${classification.reported_total === null || classification.reported_total === undefined ? 'N/A' : formatNumber(classification.reported_total)}</td></tr>
    `
    : '<tr><td colspan="2">Case classification is not available for this report period.</td></tr>'

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
        <title>${escapeHtml(reportScopeConfig.isBarangayScoped ? scopedTitle : title)}</title>

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

          .trend-chart-card {
            margin: 18px 0 20px;
            border: 1px solid #dbe4ee;
            border-radius: 14px;
            padding: 12px 14px 8px;
            background: #f8fafc;
            break-inside: avoid;
          }

          .trend-chart-heading {
            font-size: 13px;
            font-weight: 700;
            color: #1e4e75;
            margin-bottom: 6px;
          }

          .trend-chart {
            width: 100%;
            height: auto;
            display: block;
          }

          .trend-empty {
            padding: 16px;
            border: 1px dashed #cbd5e1;
            border-radius: 12px;
            color: #64748b;
            background: #f8fafc;
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

        <h1>${escapeHtml(reportScopeConfig.isBarangayScoped ? scopedTitle : title)}</h1>
        <p class="muted">${escapeHtml(REPORT_SYSTEM_NAME)}</p>
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
            <small>${reportScopeConfig.isBarangayScoped ? 'Historical Cases Used for Model Analysis' : 'Historical Cases Used in Analysis'}</small>
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

        <h2>Actual Dengue Surveillance</h2>
        <p class="muted">${escapeHtml(reportScopeConfig.isBarangayScoped ? `Recorded dengue situation for ${barangayLabel}` : `Recorded citywide dengue situation`)} · ${escapeHtml(actualSurveillance.scopeLabel)}. Forecast values are shown separately.</p>
        <div class="cards">
          <div class="card"><small>Actual cases</small><strong>${formatNumber(actualSurveillance.totalCases)}</strong></div>
          <div class="card"><small>Highest month</small><strong>${escapeHtml(actualSurveillance.highestMonth?.month_label || 'No data')}</strong></div>
          <div class="card"><small>Lowest month</small><strong>${escapeHtml(actualSurveillance.lowestMonth?.month_label || 'No data')}</strong></div>
          <div class="card"><small>${reportScopeConfig.isBarangayScoped ? 'Latest monthly movement' : 'Current movement'}</small><strong>${escapeHtml(actualSurveillance.trendDirection)}</strong></div>
        </div>
        <p><strong>Usual peak month:</strong> ${escapeHtml(actualSurveillance.usualPeakMonth)}</p>
        ${actualTrendHtml}
        <p><strong>Simple interpretation:</strong> ${escapeHtml(actualSurveillance.interpretation)}</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start;">
          <div>
            <h3>Monthly Actual Cases</h3>
            <table>
              <thead><tr><th>Month</th><th>Actual Cases</th></tr></thead>
              <tbody>${actualMonthlyHtml || '<tr><td colspan="2">No monthly actual case data available.</td></tr>'}</tbody>
            </table>
          </div>
          <div>
            <h3>Actual Case Classification</h3>
            <table>
              <thead><tr><th>Classification</th><th>Recorded Cases</th></tr></thead>
              <tbody>${classificationHtml}</tbody>
            </table>
          </div>
        </div>

        <h2>Field Monitoring Summary</h2>
        <p class="muted">Summary of submitted BHW field monitoring records. Detailed individual field reports remain available separately.</p>
        <div class="cards">
          <div class="card"><small>Total Field Reports</small><strong>${formatNumber(fieldMonitoringSummary?.total || 0)}</strong></div>
          <div class="card"><small>Awaiting Review</small><strong>${formatNumber(fieldMonitoringSummary?.awaitingReview || 0)}</strong></div>
          <div class="card"><small>Follow-up Required</small><strong>${formatNumber(fieldMonitoringSummary?.followUpRequired || 0)}</strong></div>
          <div class="card"><small>Urgent Reports</small><strong>${formatNumber(fieldMonitoringSummary?.urgent || 0)}</strong></div>
        </div>
        <p><strong>Common observations:</strong> ${escapeHtml((fieldMonitoringSummary?.commonObservations || []).map((item) => `${item.label} (${item.count})`).join(', ') || 'No submitted environmental observations available.')}</p>
        <p><strong>Supplies needed:</strong> ${formatNumber(fieldMonitoringSummary?.suppliesNeeded || 0)} &nbsp; <strong>Assistance needed:</strong> ${formatNumber(fieldMonitoringSummary?.assistanceNeeded || 0)}</p>

        <h2>${reportScopeConfig.isBarangayScoped ? 'Assigned Barangay Risk' : 'Risk Distribution'}</h2>
        ${reportScopeConfig.isBarangayScoped
          ? `<p><strong>${escapeHtml(barangayLabel)}:</strong> ${escapeHtml(topBarangay?.risk || 'Unknown')} risk</p>`
          : `<p>High risk barangays: ${formatNumber(highRiskCount)}</p><p>Moderate risk barangays: ${formatNumber(moderateRiskCount)}</p><p>Low risk barangays: ${formatNumber(lowRiskCount)}</p>`}

        <h2>Hotspot Summary</h2>
        <p>Confirmed hotspots: ${formatNumber(hotspotCounts.confirmed)}</p>
        <p>Emerging hotspots: ${formatNumber(hotspotCounts.emerging)}</p>
        <p>Watch areas: ${formatNumber(hotspotCounts.watch)}</p>
        <p>Low spatial concern: ${formatNumber(hotspotCounts.low)}</p>
        <p>Barangays needing map name review: ${formatNumber(hotspotCounts.needsReview)}</p>
        <p>Not checked: ${formatNumber(hotspotCounts.notChecked)}</p>
        <p>${reportScopeConfig.isBarangayScoped ? 'Assigned barangay hotspot records' : 'Official barangays accounted for'}: ${formatNumber(getHotspotCountTotal(hotspotCounts))}</p>
        <p>${reportScopeConfig.isBarangayScoped ? 'Barangay hotspot status' : 'Top hotspot'}: ${escapeHtml(reportScopeConfig.isBarangayScoped ? getHotspotLevelLabel(getHotspotForBarangay(topBarangay, hotspotRows)?.hotspot_level) : (topHotspot?.barangay || 'Not checked'))}</p>

        ${reportScopeConfig.isBarangayScoped ? '' : `
        <h2>Response Priority Distribution</h2>
        <table>
          <thead><tr><th>Priority Level</th><th>Barangay Count</th></tr></thead>
          <tbody>${priorityHtml || '<tr><td colspan="2">No Response priority data available.</td></tr>'}</tbody>
        </table>`}

        ${reportScopeConfig.isBarangayScoped ? `
        <h2>Assigned Barangay Response Profile</h2>
        <table>
          <thead><tr><th>Indicator</th><th>Current value</th></tr></thead>
          <tbody>
            <tr><td>Assigned barangay</td><td>${escapeHtml(barangayLabel)}</td></tr>
            <tr><td>Forecast risk</td><td>${escapeHtml(topBarangay?.risk || 'Unknown')}</td></tr>
            <tr><td>Response priority</td><td>${escapeHtml(topDecision.priority || 'Not available')}</td></tr>
            <tr><td>Combined priority score</td><td>${formatNumber(getMultiSourceProfile(topBarangay).score)}/100</td></tr>
            <tr><td>Four-period forecast</td><td>${formatNumber(topBarangay?.forecast || 0)} cases</td></tr>
            <tr><td>Hotspot status</td><td>${escapeHtml(getHotspotLevelLabel(getHotspotForBarangay(topBarangay, hotspotRows)?.hotspot_level))}</td></tr>
            <tr><td>Environmental context</td><td>${escapeHtml(`${getMultiSourceProfile(topBarangay).environmentalSuitability}; ${getMultiSourceProfile(topBarangay).rainfallPressure}; ${getMultiSourceProfile(topBarangay).temperatureSuitability}; ${getMultiSourceProfile(topBarangay).humiditySuitability}`)}</td></tr>
            <tr><td>Primary action</td><td>${escapeHtml(topDecision.primaryAction || topDecision.summary || 'No recommendation available')}</td></tr>
          </tbody>
        </table>
        ` : `
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
          <tbody>${rowsHtml || '<tr><td colspan="14">No barangay response planning data available.</td></tr>'}</tbody>
        </table>
        `}

        <h2>Four-Period Forecast Detail</h2>
        <p class="muted">Each future period is forecast separately. The four values are summed for cumulative forecast case-risk classification.</p>
        <table>
          <thead>
            <tr>
              ${reportScopeConfig.isBarangayScoped ? '' : '<th>Rank</th>'}<th>Barangay</th><th>Period 1</th><th>Period 2</th><th>Period 3</th><th>Period 4</th><th>4-Period Total</th><th>Risk</th>
            </tr>
          </thead>
          <tbody>${forecastRowsHtml || `<tr><td colspan="${reportScopeConfig.isBarangayScoped ? 7 : 8}">No forecast detail available.</td></tr>`}</tbody>
        </table>

        <div class="decision">
          <h3>${reportScopeConfig.isBarangayScoped ? 'Assigned Barangay Response Plan' : 'Top Response Plan'}</h3>
          <p><strong>${escapeHtml(topBarangay?.barangay || 'No barangay selected')}</strong></p>
          <p>${escapeHtml(topDecision.summary || (reportScopeConfig.isBarangayScoped ? 'No response recommendation available yet.' : 'No top response recommendation available yet.'))}</p>

          <h4>Action Plan</h4>
          <ol>
            ${buildPrintableActionList(topDecision.actions, topDecision.summary)}
          </ol>

          <h4>Why this recommendation</h4>
          <ul>
            ${buildPrintableRationaleList(reportScopeConfig.isBarangayScoped ? getBarangayOperationalRationale({ row: topBarangay, decision: topDecision, actualSurveillance, dashboardStats }) : topDecision.rationale)}
          </ul>
        </div>

        ${reportScopeConfig.isBarangayScoped ? `
        <h2>Technical Appendix: Model Review</h2>
        <p class="muted">Model selection and evaluation details are separated from the BHW operational summary.</p>
        <table>
          <thead>
            <tr>
              <th>Technical field</th>
              <th>Current model information</th>
            </tr>
          </thead>
          <tbody>
            ${technicalModelHtml}
          </tbody>
        </table>
        ` : ''}

        <h2>${reportScopeConfig.isBarangayScoped ? 'Technical Appendix: Data Readiness' : 'Uploaded Data Readiness'}</h2>
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

        <h2>${reportScopeConfig.isBarangayScoped ? 'Technical Appendix: Official Source Details' : 'Official Source Details'}</h2>
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

function downloadPdfReport({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, title, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null, cityTrendAnalytics = null, fieldMonitoringSummary = null }) {
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
  const actualSurveillance = getCitySurveillanceSummary(cityTrendAnalytics)
  const reportScopeConfig = getReportScopeConfig(officialMetadata)
  const scopedTitle = reportScopeConfig.title
  const scopedBasename = reportScopeConfig.basename
  const barangayLabel = reportScopeConfig.barangay || topBarangay?.barangay || 'Assigned barangay'

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  })

  const margin = 36
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(reportScopeConfig.isBarangayScoped ? scopedTitle : title, margin, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Generated: ${generatedAt}`, margin, 62)

  doc.setFontSize(11)
  doc.text(REPORT_SYSTEM_NAME, margin, 84)

  autoTable(doc, {
    startY: 106,
    head: [['Metric', 'Value']],
    body: [
      [reportScopeConfig.isBarangayScoped ? 'Historical cases used for model analysis' : 'Historical cases used in analysis', formatNumber(dashboardStats.totalCases)],
      ['Urgent alerts', formatNumber(decisionCounts.urgent)],
      ...(reportScopeConfig.isBarangayScoped
        ? [['Assigned barangay', barangayLabel], ['Current risk level', topBarangay?.risk || 'Unknown']]
        : [
            ['High-risk barangays', formatNumber(highRiskCount)],
            ['Moderate-risk barangays', formatNumber(moderateRiskCount)],
            ['Low-risk barangays', formatNumber(lowRiskCount)],
          ]),
      ['Confirmed hotspots', formatNumber(hotspotCounts.confirmed)],
      ['Emerging hotspots', formatNumber(hotspotCounts.emerging)],
      ['Watch areas', formatNumber(hotspotCounts.watch)],
      ['Low spatial concern', formatNumber(hotspotCounts.low)],
      ['Map names needing review', formatNumber(hotspotCounts.needsReview)],
      ['Hotspot results not checked', formatNumber(hotspotCounts.notChecked)],
      [reportScopeConfig.isBarangayScoped ? 'Assigned barangay hotspot records' : 'Official barangays accounted for', formatNumber(getHotspotCountTotal(hotspotCounts))],
      ['Report data source', dataSourceLabel],
      ['Forecast-horizon total', formatNumber(dashboardStats.fourWeekForecast)],
      ['Source valid-row rate', `${dashboardStats.dataQuality}%`],
      ...(reportScopeConfig.isBarangayScoped
        ? [['Current response priority', topDecision.priority || 'No data']]
        : [
            ['Top priority barangay', topBarangay?.barangay || 'No data'],
            ['Top response priority', topDecision.priority || 'No data'],
          ]),
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
    body: reportScopeConfig.isBarangayScoped
      ? getOperationalMetadataRows(officialMetadata)
      : getOfficialMetadataRows(officialMetadata),
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

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Actual Dengue Surveillance', margin, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(
    `${reportScopeConfig.isBarangayScoped ? `Recorded dengue situation for ${barangayLabel}` : 'Recorded citywide dengue situation'} · ${actualSurveillance.scopeLabel}. Forecast values are shown separately.`,
    margin,
    60
  )

  autoTable(doc, {
    startY: 74,
    head: [['Indicator', 'Recorded value']],
    body: [
      ['Actual recorded cases', formatNumber(actualSurveillance.totalCases)],
      ['Highest month', actualSurveillance.highestMonth ? `${actualSurveillance.highestMonth.month_label} · ${formatNumber(actualSurveillance.highestMonth.cases)} cases` : 'No data'],
      ['Lowest month', actualSurveillance.lowestMonth ? `${actualSurveillance.lowestMonth.month_label} · ${formatNumber(actualSurveillance.lowestMonth.cases)} cases` : 'No data'],
      [reportScopeConfig.isBarangayScoped ? 'Latest monthly movement' : 'Current movement', `${actualSurveillance.trendDirection} · ${actualSurveillance.changeLabel}`],
      ['Usual peak month', actualSurveillance.usualPeakMonth === 'Not available' ? 'Not available' : `${actualSurveillance.usualPeakMonth}${actualSurveillance.usualPeakAverage > 0 ? ` · historical average ${actualSurveillance.usualPeakAverage.toFixed(1)} cases` : ''}`],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 180 }, 1: { cellWidth: 590 } },
    margin: { left: margin, right: margin },
  })

  const trendRows = actualSurveillance.monthly.slice(0, 12)
  const trendTop = doc.lastAutoTable.finalY + 18
  const chartX = margin
  const chartY = trendTop + 20
  const chartWidth = 500
  const chartHeight = 150
  const chartPadLeft = 34
  const chartPadRight = 12
  const chartPadTop = 12
  const chartPadBottom = 24
  const plotWidth = chartWidth - chartPadLeft - chartPadRight
  const plotHeight = chartHeight - chartPadTop - chartPadBottom
  const maxCases = Math.max(1, ...trendRows.map((row) => Number(row?.cases || 0)))

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(30, 78, 117)
  doc.text('Jan-Dec actual dengue trend', chartX, trendTop + 8)
  doc.setDrawColor(219, 228, 238)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(chartX, chartY, chartWidth, chartHeight, 6, 6, 'FD')

  if (trendRows.length) {
    const xStep = trendRows.length > 1 ? plotWidth / (trendRows.length - 1) : 0
    const points = trendRows.map((row, index) => {
      const cases = Number(row?.cases || 0)
      return {
        x: chartX + chartPadLeft + index * xStep,
        y: chartY + chartPadTop + plotHeight - (cases / maxCases) * plotHeight,
        label: row?.month_short || row?.month_label || `M${index + 1}`,
      }
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    ;[0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
      const y = chartY + chartPadTop + plotHeight - ratio * plotHeight
      doc.setDrawColor(219, 228, 238)
      doc.line(chartX + chartPadLeft, y, chartX + chartWidth - chartPadRight, y)
      doc.text(String(Math.round(maxCases * ratio)), chartX + chartPadLeft - 6, y + 2, { align: 'right' })
    })

    doc.setDrawColor(37, 95, 143)
    doc.setLineWidth(2)
    for (let index = 1; index < points.length; index += 1) {
      doc.line(points[index - 1].x, points[index - 1].y, points[index].x, points[index].y)
    }

    points.forEach((point) => {
      doc.setFillColor(37, 95, 143)
      doc.circle(point.x, point.y, 2.6, 'F')
      doc.setTextColor(100, 116, 139)
      doc.text(String(point.label).slice(0, 3), point.x, chartY + chartHeight - 7, { align: 'center' })
    })
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('No monthly actual case data available.', chartX + 18, chartY + 34)
  }

  const classification = actualSurveillance.classification
  let classificationBottom = chartY + chartHeight
  autoTable(doc, {
    startY: chartY,
    head: [['Actual Case Classification', 'Recorded Cases']],
    body: classification
      ? [
          ['Confirmed', formatCaseClassificationValue(classification, 'confirmed_cases', 'confirmed_available')],
          ['Probable', formatCaseClassificationValue(classification, 'probable_cases', 'probable_available')],
          ['Suspected', formatCaseClassificationValue(classification, 'suspected_cases', 'suspected_available')],
          ['Total reported', classification.reported_total === null || classification.reported_total === undefined ? 'N/A' : formatNumber(classification.reported_total)],
        ]
      : [['Case classification', 'Not available']],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 95 } },
    margin: { left: 548, right: margin },
  })
  classificationBottom = doc.lastAutoTable?.finalY || classificationBottom

  const interpretationY = Math.max(chartY + chartHeight, classificationBottom) + 20
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(23, 32, 51)
  doc.text('Simple Interpretation', margin, interpretationY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(doc.splitTextToSize(actualSurveillance.interpretation, pageWidth - margin * 2), margin, interpretationY + 14)

  doc.addPage()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Field Monitoring Summary', margin, 42)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Summary of BHW field monitoring submissions. Individual detailed field reports remain separate.', margin, 60)

  autoTable(doc, {
    startY: 76,
    head: [['Field monitoring indicator', 'Count']],
    body: [
      ['Total field reports', formatNumber(fieldMonitoringSummary?.total || 0)],
      ['Awaiting review', formatNumber(fieldMonitoringSummary?.awaitingReview || 0)],
      ['Reviewed', formatNumber(fieldMonitoringSummary?.reviewed || 0)],
      ['Follow-up required', formatNumber(fieldMonitoringSummary?.followUpRequired || 0)],
      ['Urgent reports', formatNumber(fieldMonitoringSummary?.urgent || 0)],
      ['Reports needing supplies', formatNumber(fieldMonitoringSummary?.suppliesNeeded || 0)],
      ['Reports needing assistance', formatNumber(fieldMonitoringSummary?.assistanceNeeded || 0)],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 260 }, 1: { cellWidth: 120 } },
    margin: { left: margin, right: margin },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    head: [['Common observed environmental factors', 'Reports']],
    body: fieldMonitoringSummary?.commonObservations?.length
      ? fieldMonitoringSummary.commonObservations.map((item) => [item.label, formatNumber(item.count)])
      : [['No submitted environmental observations available', '-']],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [37, 95, 143], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 360 }, 1: { cellWidth: 120 } },
    margin: { left: margin, right: margin },
  })

  doc.addPage()

  const rankingStartY = 42

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(reportScopeConfig.isBarangayScoped ? 'Assigned Barangay Response Profile' : 'Barangay Response Planning Ranking', margin, rankingStartY)

  if (reportScopeConfig.isBarangayScoped) {
    const profile = getMultiSourceProfile(topBarangay)
    autoTable(doc, {
      startY: rankingStartY + 12,
      head: [['Indicator', 'Current value']],
      body: [
        ['Assigned barangay', barangayLabel],
        ['Forecast risk', topBarangay?.risk || 'Unknown'],
        ['Response priority', topDecision.priority || 'Not available'],
        ['Combined priority score', `${formatNumber(profile.score)}/100`],
        ['Four-period forecast', `${formatNumber(topBarangay?.forecast || 0)} cases`],
        ['Hotspot status', getHotspotLevelLabel(getHotspotForBarangay(topBarangay, hotspotRows)?.hotspot_level)],
        ['Environmental context', `${profile.environmentalSuitability}; ${profile.rainfallPressure}; ${profile.temperatureSuitability}; ${profile.humiditySuitability}`],
        ['Primary action', topDecision.primaryAction || topDecision.summary || 'No recommendation available'],
      ],
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 5,
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { cellWidth: 175, fontStyle: 'bold' },
        1: { cellWidth: 595 },
      },
      headStyles: {
        fillColor: [37, 95, 143],
        textColor: [255, 255, 255],
      },
      margin: { left: margin, right: margin },
    })
  } else {
    autoTable(doc, {
      startY: rankingStartY + 12,
      head: [['Rank', 'Barangay', 'Risk', 'Response Priority', 'Combined Score', 'Forecast', 'Hotspot', 'Environment', 'Primary Action']],
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
      margin: { left: margin, right: margin },
    })
  }

  if (!reportScopeConfig.isBarangayScoped) {
    doc.addPage()
  }

  const forecastSectionY = reportScopeConfig.isBarangayScoped
    ? (doc.lastAutoTable?.finalY || rankingStartY + 80) + 28
    : 42

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Four-Period Forecast Detail', margin, forecastSectionY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Each period is forecast separately. The four values are summed for the cumulative case-risk classification.', margin, forecastSectionY + 18)

  autoTable(doc, {
    startY: forecastSectionY + 32,
    head: [reportScopeConfig.isBarangayScoped
      ? ['Barangay', 'Period 1', 'Period 2', 'Period 3', 'Period 4', '4-Period Total', 'Risk']
      : ['Rank', 'Barangay', 'Period 1', 'Period 2', 'Period 3', 'Period 4', '4-Period Total', 'Risk']],
    body: sortedRiskRows.length
      ? sortedRiskRows.map((row, index) => {
          const periods = getForecastPeriodDetails(row)
          const values = [
            row.barangay,
            formatNumber(periods[0]?.predictedCases || 0),
            formatNumber(periods[1]?.predictedCases || 0),
            formatNumber(periods[2]?.predictedCases || 0),
            formatNumber(periods[3]?.predictedCases || 0),
            formatNumber(row.forecast || 0),
            row.risk || 'Unknown',
          ]
          return reportScopeConfig.isBarangayScoped ? values : [index + 1, ...values]
        })
      : [reportScopeConfig.isBarangayScoped
          ? ['No forecast data available', '-', '-', '-', '-', '-', '-']
          : ['-', 'No forecast data available', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 4 },
    headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255] },
    columnStyles: reportScopeConfig.isBarangayScoped
      ? {
          0: { cellWidth: 180 },
          1: { cellWidth: 88 },
          2: { cellWidth: 88 },
          3: { cellWidth: 88 },
          4: { cellWidth: 88 },
          5: { cellWidth: 110 },
          6: { cellWidth: 90 },
        }
      : {
          0: { cellWidth: 38 },
          1: { cellWidth: 170 },
          2: { cellWidth: 82 },
          3: { cellWidth: 82 },
          4: { cellWidth: 82 },
          5: { cellWidth: 82 },
          6: { cellWidth: 100 },
          7: { cellWidth: 85 },
        },
    margin: { left: margin, right: margin },
  })

  doc.addPage()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(reportScopeConfig.isBarangayScoped ? 'Assigned Barangay Response Plan' : 'Top Response Plan', margin, 42)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const topText = topBarangay
    ? `${topBarangay.barangay}: ${topDecision.summary}`
    : (reportScopeConfig.isBarangayScoped ? 'No response recommendation is available yet.' : 'No top response recommendation is available yet.')

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
      getPolishedActionList(topDecision.actions, topDecision.summary, 6).length > 0
        ? getPolishedActionList(topDecision.actions, topDecision.summary, 6).map((action, index) => [
            index + 1,
            action,
          ])
        : [['-', 'No additional action steps are available.']],
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

  let rationaleStartY = doc.lastAutoTable.finalY + 20

  if (!reportScopeConfig.isBarangayScoped && rationaleStartY > 450) {
    doc.addPage()
    rationaleStartY = 42
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Why this recommendation', margin, rationaleStartY)

  const rationaleReasons = reportScopeConfig.isBarangayScoped
    ? getBarangayOperationalRationale({
        row: topBarangay,
        decision: topDecision,
        actualSurveillance,
        dashboardStats,
      })
    : (topDecision.rationale || []).slice(0, 9)

  autoTable(doc, {
    startY: rationaleStartY + 12,
    head: [['Reason']],
    body: rationaleReasons.length > 0
      ? rationaleReasons.map((reason) => [reason])
      : [['No rationale available.']],
    theme: 'grid',
    styles: {
      fontSize: reportScopeConfig.isBarangayScoped ? 7.6 : 8,
      cellPadding: reportScopeConfig.isBarangayScoped ? 4 : 5,
    },
    headStyles: {
      fillColor: [4, 120, 87],
      textColor: [255, 255, 255],
    },
    pageBreak: reportScopeConfig.isBarangayScoped ? 'avoid' : 'auto',
    margin: {
      left: margin,
      right: margin,
    },
  })

  if (!reportScopeConfig.isBarangayScoped) {
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
  }

  const sources = Object.entries(sourceStatus || {})

  if (reportScopeConfig.isBarangayScoped) {
    doc.addPage()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Technical Appendix: Model Review', margin, 42)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Model selection and evaluation details are separated from the BHW operational summary.', margin, 60)

    autoTable(doc, {
      startY: 74,
      head: [['Technical field', 'Current model information']],
      body: getTechnicalModelMetadataRows(officialMetadata),
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 5,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [37, 95, 143],
        textColor: [255, 255, 255],
      },
      columnStyles: {
        0: { cellWidth: 170 },
        1: { cellWidth: 600 },
      },
      margin: {
        left: margin,
        right: margin,
      },
    })
  }

  doc.addPage()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(reportScopeConfig.isBarangayScoped ? 'Technical Appendix: Data Readiness' : 'Uploaded Data Readiness', margin, 42)

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

  doc.save(`${scopedBasename}.pdf`)
}

function downloadExcelWorkbook({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null, cityTrendAnalytics = null, fieldMonitoringSummary = null }) {
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
  const actualSurveillance = getCitySurveillanceSummary(cityTrendAnalytics)
  const reportScopeConfig = getReportScopeConfig(officialMetadata)
  const scopedTitle = reportScopeConfig.title
  const scopedBasename = reportScopeConfig.basename
  const barangayLabel = reportScopeConfig.barangay || topBarangay?.barangay || 'Assigned barangay'

  const workbook = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.aoa_to_sheet([
    [scopedTitle],
    ['System', REPORT_SYSTEM_NAME],
    ['Generated', generatedAt],
    ['Report ID', officialMetadata.reportId],
    ['Generated by', officialMetadata.generatedBy],
    ['Role', officialMetadata.role],
    ['Forecast method', officialMetadata.forecastMethod],
    ['Forecast period/window', officialMetadata.forecastWindow],
    ...(reportScopeConfig.isBarangayScoped
      ? []
      : [
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
        ]),
    [],
    ['Metric', 'Value'],
    [reportScopeConfig.isBarangayScoped ? 'Historical cases used for model analysis' : 'Historical cases used in analysis', Number(dashboardStats.totalCases || 0)],
    ['Urgent alerts', decisionCounts.urgent],
    [reportScopeConfig.isBarangayScoped ? 'Preventive response status' : 'Preventive priority barangays', decisionCounts.preventive],
    [reportScopeConfig.isBarangayScoped ? 'Early warning / watch status' : 'Early warning / watch barangays', decisionCounts.watch],
    [reportScopeConfig.isBarangayScoped ? 'Routine monitoring status' : 'Routine monitoring barangays', decisionCounts.routine],
    ...(reportScopeConfig.isBarangayScoped
      ? [['Assigned barangay', barangayLabel], ['Current risk level', topBarangay?.risk || 'Unknown']]
      : [['High-risk barangays', highRiskCount], ['Moderate-risk barangays', moderateRiskCount], ['Low-risk barangays', lowRiskCount]]),
    ['Confirmed hotspots', hotspotCounts.confirmed],
    ['Emerging hotspots', hotspotCounts.emerging],
    ['Watch areas', hotspotCounts.watch],
    ['Low spatial concern', hotspotCounts.low],
    ['Map names needing review', hotspotCounts.needsReview],
    ['Hotspot results not checked', hotspotCounts.notChecked],
    [reportScopeConfig.isBarangayScoped ? 'Assigned barangay hotspot records' : 'Official barangays accounted for', getHotspotCountTotal(hotspotCounts)],
    [reportScopeConfig.isBarangayScoped ? 'Barangay hotspot status' : 'Top hotspot barangay', reportScopeConfig.isBarangayScoped ? getHotspotLevelLabel(getHotspotForBarangay(topBarangay, hotspotRows)?.hotspot_level) : (topHotspot?.barangay || 'Not checked')],
    ['Report data source', dataSourceLabel],
    ['Forecast-horizon total', Number(dashboardStats.fourWeekForecast || 0)],
    ['Source valid-row rate', `${dashboardStats.dataQuality}%`],
    ...(reportScopeConfig.isBarangayScoped
      ? [
          ['Current response priority', topDecision.priority || 'No data'],
          ['Current combined priority score', `${getMultiSourceProfile(topBarangay).score}/100`],
          ['Current environmental suitability', getMultiSourceProfile(topBarangay).environmentalSuitability],
          ['Current rainfall pressure', getMultiSourceProfile(topBarangay).rainfallPressure],
          ['Current temperature suitability', getMultiSourceProfile(topBarangay).temperatureSuitability],
          ['Current humidity suitability', getMultiSourceProfile(topBarangay).humiditySuitability],
          ['Recommended response', topDecision.summary || 'No recommendation available'],
        ]
      : [
          ['Top priority barangay', topBarangay?.barangay || 'No data'],
          ['Top response priority', topDecision.priority || 'No data'],
          ['Top combined priority score', `${getMultiSourceProfile(topBarangay).score}/100`],
          ['Top environmental suitability', getMultiSourceProfile(topBarangay).environmentalSuitability],
          ['Top rainfall pressure', getMultiSourceProfile(topBarangay).rainfallPressure],
          ['Top temperature suitability', getMultiSourceProfile(topBarangay).temperatureSuitability],
          ['Top humidity suitability', getMultiSourceProfile(topBarangay).humiditySuitability],
          ['Top response summary', topDecision.summary || 'No recommendation available'],
        ]),

  ])

  summarySheet['!cols'] = [{ wch: 34 }, { wch: 110 }]
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  const classification = actualSurveillance.classification
  const actualSurveillanceSheet = XLSX.utils.aoa_to_sheet([
    ['Actual Dengue Surveillance'],
    ['Scope', actualSurveillance.scopeLabel],
    ['Actual recorded cases', actualSurveillance.totalCases],
    ['Highest month', actualSurveillance.highestMonth?.month_label || 'No data'],
    ['Highest month cases', actualSurveillance.highestMonth?.cases ?? 'N/A'],
    ['Lowest month', actualSurveillance.lowestMonth?.month_label || 'No data'],
    ['Lowest month cases', actualSurveillance.lowestMonth?.cases ?? 'N/A'],
    [reportScopeConfig.isBarangayScoped ? 'Latest monthly movement' : 'Current movement', actualSurveillance.trendDirection],
    ['Month-to-month change', actualSurveillance.changeLabel],
    ['Usual peak month', actualSurveillance.usualPeakMonth],
    ['Usual peak historical average', actualSurveillance.usualPeakAverage || 'N/A'],
    ['Simple interpretation', actualSurveillance.interpretation],
    [],
    ['Actual Case Classification', 'Value'],
    ['Confirmed', classification?.available && classification?.confirmed_available ? Number(classification.confirmed_cases || 0) : 'N/A'],
    ['Probable', classification?.available && classification?.probable_available ? Number(classification.probable_cases || 0) : 'N/A'],
    ['Suspected', classification?.available && classification?.suspected_available ? Number(classification.suspected_cases || 0) : 'N/A'],
    ['Total reported', classification?.reported_total ?? 'N/A'],
    ['Classification source note', classification?.source_note || 'Not available'],
    [],
    ['Month', 'Actual Recorded Cases', 'Visual Trend'],
    ...(actualSurveillance.monthly.length
      ? (() => {
          const maxCases = Math.max(1, ...actualSurveillance.monthly.map((row) => Number(row?.cases || 0)))
          return actualSurveillance.monthly.map((row) => {
            const cases = Number(row?.cases || 0)
            const barLength = cases > 0 ? Math.max(1, Math.round((cases / maxCases) * 28)) : 0
            return [row.month_label || row.month_short, cases, '█'.repeat(barLength)]
          })
        })()
      : [['No monthly recorded data', 'N/A', '']]),
  ])
  actualSurveillanceSheet['!cols'] = [{ wch: 34 }, { wch: 24 }, { wch: 36 }]
  XLSX.utils.book_append_sheet(workbook, actualSurveillanceSheet, 'Actual Surveillance')

  const fieldMonitoringSheet = XLSX.utils.aoa_to_sheet([
    ['Field Monitoring Summary'],
    ['Total field reports', Number(fieldMonitoringSummary?.total || 0)],
    ['Awaiting review', Number(fieldMonitoringSummary?.awaitingReview || 0)],
    ['Reviewed', Number(fieldMonitoringSummary?.reviewed || 0)],
    ['Follow-up required', Number(fieldMonitoringSummary?.followUpRequired || 0)],
    ['Urgent reports', Number(fieldMonitoringSummary?.urgent || 0)],
    ['Reports needing supplies', Number(fieldMonitoringSummary?.suppliesNeeded || 0)],
    ['Reports needing assistance', Number(fieldMonitoringSummary?.assistanceNeeded || 0)],
    ['Latest reporting date', fieldMonitoringSummary?.latestDate || 'Not available'],
    [],
    ['Common observed environmental factor', 'Reports'],
    ...((fieldMonitoringSummary?.commonObservations || []).length
      ? fieldMonitoringSummary.commonObservations.map((item) => [item.label, Number(item.count || 0)])
      : [['No submitted environmental observations available', 'N/A']]),
  ])
  fieldMonitoringSheet['!cols'] = [{ wch: 52 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(workbook, fieldMonitoringSheet, 'Field Monitoring')

  const metadataSheet = XLSX.utils.aoa_to_sheet([
    ['Official Report Metadata', 'Details'],
    ...(reportScopeConfig.isBarangayScoped
      ? getOperationalMetadataRows(officialMetadata)
      : getOfficialMetadataRows(officialMetadata)),
  ])

  metadataSheet['!cols'] = [{ wch: 34 }, { wch: 120 }]
  XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Official Metadata')

  if (reportScopeConfig.isBarangayScoped) {
    const technicalModelSheet = XLSX.utils.aoa_to_sheet([
      ['Technical Appendix: Model Review', 'Current model information'],
      ...getTechnicalModelMetadataRows(officialMetadata),
    ])
    technicalModelSheet['!cols'] = [{ wch: 34 }, { wch: 120 }]
    XLSX.utils.book_append_sheet(workbook, technicalModelSheet, 'Technical Model')
  }

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

  const rankingHeaders = [
    'Barangay',
    'Risk Level',
    'Response Priority',
    'Combined Risk Score',
    'Decision Score',
    'Forecast Cases',
    'Period 1 Forecast',
    'Period 2 Forecast',
    'Period 3 Forecast',
    'Period 4 Forecast',
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
  ]

  const rankingSheet = XLSX.utils.aoa_to_sheet([
    reportScopeConfig.isBarangayScoped ? rankingHeaders : ['Rank', ...rankingHeaders],
    ...sortedRiskRows.map((row, index) => {
      const decision = getDecisionSupport(row)
      const profile = getMultiSourceProfile(row)
      const values = [
        row.barangay,
        row.risk,
        decision.priority,
        Number(profile.score || 0),
        Number(decision.score || 0),
        Number(row.forecast || 0),
        ...getForecastPeriodDetails(row).map((item) => Number(item.predictedCases || 0)),
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
      return reportScopeConfig.isBarangayScoped ? values : [index + 1, ...values]
    }),
  ])

  rankingSheet['!cols'] = [
    ...(reportScopeConfig.isBarangayScoped ? [] : [{ wch: 8 }]),
    { wch: 30 },
    { wch: 16 },
    { wch: 26 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
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

  XLSX.utils.book_append_sheet(workbook, rankingSheet, reportScopeConfig.isBarangayScoped ? 'Barangay Profile' : 'Response Ranking')

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

    const polishedActions = reportScopeConfig.isBarangayScoped
      ? getPolishedActionList(decision.actions, decision.summary, 6)
      : decision.actions

    if (!polishedActions.length) {
      actionRows.push([
        row.barangay,
        decision.priority,
        '',
        reportScopeConfig.isBarangayScoped ? 'No additional action steps are available.' : 'No action plan available.',
      ])

      return
    }

    polishedActions.forEach((action, index) => {
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
    const reasons = reportScopeConfig.isBarangayScoped
      ? getBarangayOperationalRationale({ row, decision, actualSurveillance, dashboardStats })
      : decision.rationale

    if (!reasons.length) {
      rationaleRows.push([
        row.barangay,
        decision.priority,
        'No rationale available.',
      ])

      return
    }

    reasons.forEach((reason) => {
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

  if (!reportScopeConfig.isBarangayScoped) {
    const prioritySheet = XLSX.utils.aoa_to_sheet([
      ['Response Priority', 'Barangay Count'],
      ...priorityDistribution.map((item) => [item.priority, item.count]),
    ])

    prioritySheet['!cols'] = [
      { wch: 34 },
      { wch: 18 },
    ]

    XLSX.utils.book_append_sheet(workbook, prioritySheet, 'Priority Distribution')
  }


  const hotspotSheet = XLSX.utils.aoa_to_sheet([
    reportScopeConfig.isBarangayScoped
      ? ['Barangay', 'Hotspot Level', 'Hotspot Score', 'Nearby Barangay Effect', 'Map Status', 'Recommended Map Action']
      : ['Rank', 'Barangay', 'Hotspot Level', 'Hotspot Score', 'Nearby Barangay Effect', 'Map Status', 'Recommended Map Action'],
    ...(hotspotRows.length > 0
      ? hotspotRows.map((row, index) => {
          const values = [
            row.barangay || 'Unknown barangay',
            getHotspotLevelLabel(row.hotspot_level),
            Number(row.hotspot_score || 0),
            Number(row.neighbor_influence_score || 0),
            row.has_map_boundary === false ? 'Map name needs review' : 'Map area matched',
            row.recommended_map_action || 'Continue routine monitoring.',
          ]
          return reportScopeConfig.isBarangayScoped ? values : [index + 1, ...values]
        })
      : [reportScopeConfig.isBarangayScoped
          ? ['No hotspot analysis available', '-', '-', '-', '-', '-']
          : ['-', 'No hotspot analysis available', '-', '-', '-', '-', '-']]),
  ])

  hotspotSheet['!cols'] = [
    ...(reportScopeConfig.isBarangayScoped ? [] : [{ wch: 8 }]),
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

  XLSX.writeFile(workbook, `${scopedBasename}.xlsx`)
}

async function downloadPowerPointDeck({ dashboardStats = {}, riskRows, sourceStatus, generatedAt, hotspotRows = [], hotspotSummary = null, dataSourceLabel = 'Current report data', reportMetadata = null, cityTrendAnalytics = null, fieldMonitoringSummary = null }) {
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
  const actualSurveillance = getCitySurveillanceSummary(cityTrendAnalytics)
  const reportScopeConfig = getReportScopeConfig(officialMetadata)
  const scopedTitle = reportScopeConfig.title
  const scopedBasename = reportScopeConfig.basename
  const barangayLabel = reportScopeConfig.barangay || topBarangay?.barangay || 'Assigned barangay'
  const pptMetadataRows = reportScopeConfig.isBarangayScoped
    ? getOperationalMetadataRows(officialMetadata)
    : getOfficialMetadataRows(officialMetadata).filter(([label]) => ![
        'Model selection strength',
        'Top feature importance',
        'Selected model metrics',
        'Model ranking summary',
        'Model selection explanation',
      ].includes(label))

  const pptx = new pptxgen()

  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = REPORT_SYSTEM_NAME
  pptx.subject = scopedTitle
  pptx.title = scopedTitle
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

  titleSlide.addText(reportScopeConfig.isBarangayScoped ? `${barangayLabel} Dengue Monitoring and Response Briefing` : 'Dengue Situation and Four-Month Response Briefing', {
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

  titleSlide.addText(REPORT_SYSTEM_NAME, {
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

  titleSlide.addText(reportScopeConfig.isBarangayScoped ? 'BHW Monitoring  •  Assigned Barangay  •  Field Response' : 'CHO Review  •  Barangay Coordination  •  Response Planning', {
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
      ...pptMetadataRows,
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

  const actualSlide = pptx.addSlide()
  addSlideTitle(
    actualSlide,
    'Actual Dengue Situation',
    `${reportScopeConfig.isBarangayScoped ? `Recorded dengue cases for ${barangayLabel}` : 'Recorded citywide dengue cases'} · ${actualSurveillance.scopeLabel}. Forecast values are presented separately.`
  )

  addMetricCard(actualSlide, 'Actual cases', formatNumber(actualSurveillance.totalCases), 0.72, 1.42, COLORS.lightBlue, COLORS.blue)
  addMetricCard(actualSlide, 'Highest month', actualSurveillance.highestMonth?.month_label || 'No data', 3.55, 1.42, COLORS.yellow, COLORS.amber)
  addMetricCard(actualSlide, 'Lowest month', actualSurveillance.lowestMonth?.month_label || 'No data', 6.38, 1.42, COLORS.emerald, COLORS.green)
  addMetricCard(actualSlide, reportScopeConfig.isBarangayScoped ? 'Latest monthly movement' : 'Current movement', actualSurveillance.trendDirection, 9.21, 1.42, COLORS.lightBlue, COLORS.blueDark)

  const chartRows = actualSurveillance.monthly.slice(0, 12)
  actualSlide.addText('Jan-Dec actual dengue trend', {
    x: 0.72, y: 2.78, w: 6.25, h: 0.28, fontSize: 12, bold: true, color: COLORS.blueDark, margin: 0,
  })

  if (chartRows.length) {
    actualSlide.addChart(
      pptx.ChartType.line,
      [{
        name: 'Actual cases',
        labels: chartRows.map((row) => row.month_short || row.month_label),
        values: chartRows.map((row) => Number(row.cases || 0)),
      }],
      {
        x: 0.72, y: 3.08, w: 6.25, h: 2.15,
        showLegend: false,
        showTitle: false,
        showValue: false,
        chartColors: [COLORS.blue],
        catAxisLabelFontSize: 8,
        valAxisLabelFontSize: 8,
        showCatName: false,
        showValAxisTitle: false,
        showCatAxisTitle: false,
        valGridLine: { color: COLORS.line, pt: 1 },
      }
    )
  } else {
    actualSlide.addText('No monthly actual case data available.', {
      x: 0.72, y: 3.08, w: 6.25, h: 2.15, fontSize: 12, color: COLORS.slate, align: 'center', valign: 'mid',
      fill: { color: COLORS.white }, line: { color: COLORS.line },
    })
  }

  const classification = actualSurveillance.classification
  actualSlide.addTable([
    ['Actual Case Classification', 'Recorded Cases'],
    ['Confirmed', classification?.available && classification?.confirmed_available ? formatNumber(classification.confirmed_cases) : 'N/A'],
    ['Probable', classification?.available && classification?.probable_available ? formatNumber(classification.probable_cases) : 'N/A'],
    ['Suspected', classification?.available && classification?.suspected_available ? formatNumber(classification.suspected_cases) : 'N/A'],
    ['Total reported', classification?.reported_total === null || classification?.reported_total === undefined ? 'N/A' : formatNumber(classification.reported_total)],
  ], {
    x: 7.2, y: 3.0, w: 5.35, h: 1.85, fontSize: 9.5, color: COLORS.navy,
    border: { color: COLORS.line, pt: 1 }, fill: { color: COLORS.white }, margin: 0.06,
  })

  actualSlide.addText(`Usual peak month: ${actualSurveillance.usualPeakMonth}`, {
    x: 7.2, y: 5.02, w: 5.35, h: 0.35, fontSize: 11, bold: true, color: COLORS.amber,
    margin: 0.08, fill: { color: COLORS.yellow }, line: { color: 'FDE68A' }, fit: 'shrink',
  })
  actualSlide.addText(actualSurveillance.interpretation, {
    x: 0.72, y: 5.72, w: 11.83, h: 0.86, fontSize: 10.5, color: COLORS.navy,
    margin: 0.12, fill: { color: COLORS.lightBlue }, line: { color: COLORS.paleBlue }, fit: 'shrink',
  })

  const summarySlide = pptx.addSlide()
  addSlideTitle(
    summarySlide,
    'Response Summary',
    'Key monitoring and response planning indicators from the current workspace.'
  )

  addMetricCard(
    summarySlide,
    reportScopeConfig.isBarangayScoped ? 'Historical cases used for model analysis' : 'Historical cases used in analysis',
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

  summarySlide.addText(reportScopeConfig.isBarangayScoped ? 'Assigned Barangay Risk' : 'Risk Distribution', {
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
      ['Risk Level', reportScopeConfig.isBarangayScoped ? 'Assigned Barangay' : 'Barangay Count'],
      ...(reportScopeConfig.isBarangayScoped
        ? [[topBarangay?.risk || 'Unknown', barangayLabel]]
        : [['High', highRiskCount], ['Moderate', moderateRiskCount], ['Low', lowRiskCount]]),
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

  summarySlide.addText(reportScopeConfig.isBarangayScoped ? 'Assigned Barangay Guidance' : 'Response Guidance', {
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
    getTopDecisionText(topBarangay, reportScopeConfig.isBarangayScoped),
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
    reportScopeConfig.isBarangayScoped ? 'Assigned Barangay Response Profile' : 'Response Priority Barangays',
    reportScopeConfig.isBarangayScoped
      ? `Current risk, response priority, combined score, and projected dengue cases for ${barangayLabel}.`
      : 'Top barangays ranked by risk level, combined priority score, response priority, and projected dengue cases.'
  )

  if (reportScopeConfig.isBarangayScoped) {
    const scopedRow = topBarangay
    const scopedDecision = getDecisionSupport(scopedRow)
    const scopedProfile = getMultiSourceProfile(scopedRow)

    prioritySlide.addTable(
      [
        ['Indicator', 'Current value'],
        ['Assigned barangay', scopedRow?.barangay || barangayLabel],
        ['Forecast risk', scopedRow?.risk || 'Unknown'],
        ['Response priority', scopedDecision.priority || 'Decision pending'],
        ['Combined priority score', `${formatNumber(getCanonicalCombinedRiskScore(scopedRow))}/100`],
        ['Four-period forecast', `${formatNumber(scopedRow?.forecast || 0)} cases`],
        ['Hotspot status', getHotspotLevelLabel(getHotspotForBarangay(scopedRow, hotspotRows)?.hotspot_level)],
        ['Primary field action', scopedDecision.primaryAction || scopedDecision.summary || 'No recommended response available yet.'],
      ],
      {
        x: 0.65,
        y: 1.35,
        w: 7.25,
        h: 5.3,
        colW: [2.15, 5.1],
        fontSize: 11.2,
        color: COLORS.navy,
        border: { color: COLORS.line, pt: 1 },
        fill: { color: COLORS.white },
        margin: 0.09,
      }
    )

    prioritySlide.addText('', {
      x: 8.25,
      y: 1.35,
      w: 4.35,
      h: 5.3,
      margin: 0,
      fill: { color: COLORS.white },
      line: { color: COLORS.line, pt: 1 },
    })

    prioritySlide.addText('AT A GLANCE', {
      x: 8.58,
      y: 1.64,
      w: 3.7,
      h: 0.28,
      fontSize: 10,
      bold: true,
      color: COLORS.blue,
      charSpace: 1.1,
      margin: 0,
    })

    prioritySlide.addText(scopedRow?.risk || 'Unknown', {
      x: 8.58,
      y: 2.08,
      w: 1.7,
      h: 0.72,
      fontSize: 18,
      bold: true,
      align: 'center',
      valign: 'mid',
      color: getRiskPptColor(scopedRow?.risk),
      margin: 0.08,
      fill: { color: getRiskPptFill(scopedRow?.risk) },
      line: { color: getRiskPptColor(scopedRow?.risk), pt: 1 },
      fit: 'shrink',
    })

    prioritySlide.addText('FORECAST RISK', {
      x: 8.58,
      y: 2.82,
      w: 1.7,
      h: 0.22,
      fontSize: 7.8,
      bold: true,
      align: 'center',
      color: COLORS.slate,
      margin: 0,
    })

    prioritySlide.addText(`${formatNumber(scopedRow?.forecast || 0)} cases`, {
      x: 10.48,
      y: 2.08,
      w: 1.78,
      h: 0.72,
      fontSize: 18,
      bold: true,
      align: 'center',
      valign: 'mid',
      color: COLORS.blueDark,
      margin: 0.08,
      fill: { color: COLORS.lightBlue },
      line: { color: COLORS.paleBlue, pt: 1 },
      fit: 'shrink',
    })

    prioritySlide.addText('4-PERIOD FORECAST', {
      x: 10.48,
      y: 2.82,
      w: 1.78,
      h: 0.22,
      fontSize: 7.8,
      bold: true,
      align: 'center',
      color: COLORS.slate,
      margin: 0,
    })

    prioritySlide.addText(scopedDecision.priority || 'Decision pending', {
      x: 8.58,
      y: 3.36,
      w: 3.68,
      h: 0.62,
      fontSize: 14,
      bold: true,
      align: 'center',
      valign: 'mid',
      color: getPriorityPptColor(scopedDecision.priority),
      margin: 0.08,
      fill: { color: getPriorityPptFill(scopedDecision.priority) },
      line: { color: getPriorityPptColor(scopedDecision.priority), pt: 1 },
      fit: 'shrink',
    })

    prioritySlide.addText('CURRENT RESPONSE PRIORITY', {
      x: 8.58,
      y: 4.02,
      w: 3.68,
      h: 0.22,
      fontSize: 7.8,
      bold: true,
      align: 'center',
      color: COLORS.slate,
      margin: 0,
    })

    prioritySlide.addText(`${formatNumber(scopedProfile.score)}/100`, {
      x: 8.58,
      y: 4.62,
      w: 3.68,
      h: 0.7,
      fontSize: 23,
      bold: true,
      align: 'center',
      valign: 'mid',
      color: COLORS.navy,
      margin: 0.06,
      fill: { color: COLORS.bg },
      line: { color: COLORS.line, pt: 1 },
    })

    prioritySlide.addText('COMBINED PRIORITY SCORE', {
      x: 8.58,
      y: 5.36,
      w: 3.68,
      h: 0.22,
      fontSize: 7.8,
      bold: true,
      align: 'center',
      color: COLORS.slate,
      margin: 0,
    })

    prioritySlide.addText('Use this profile with actual case trends and field observations before carrying out response activities.', {
      x: 8.58,
      y: 5.78,
      w: 3.68,
      h: 0.56,
      fontSize: 9.2,
      color: COLORS.slate,
      align: 'center',
      valign: 'mid',
      margin: 0.06,
      fit: 'shrink',
    })
  } else {
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
  }

  const forecastSlide = pptx.addSlide()
  addSlideTitle(
    forecastSlide,
    'Four-Month Forecast Outlook',
    'Period 1 through Period 4 are generated separately; the total is used for forecast case-risk classification.'
  )

  forecastSlide.addTable(
    [
      ['Barangay', 'Period 1', 'Period 2', 'Period 3', 'Period 4', '4-Period Total', 'Risk'],
      ...(topBarangays.length
        ? topBarangays.map((row) => {
            const periods = getForecastPeriodDetails(row)
            return [
              row.barangay,
              formatNumber(periods[0]?.predictedCases || 0),
              formatNumber(periods[1]?.predictedCases || 0),
              formatNumber(periods[2]?.predictedCases || 0),
              formatNumber(periods[3]?.predictedCases || 0),
              formatNumber(row.forecast || 0),
              row.risk || 'Unknown',
            ]
          })
        : [['No forecast data', '-', '-', '-', '-', '-', '-']]),
    ],
    {
      x: 0.72, y: 1.55, w: 11.85, h: 3.2, fontSize: 10.5, color: COLORS.navy,
      border: { color: COLORS.line, pt: 1 }, fill: { color: COLORS.white }, margin: 0.08,
    }
  )

  forecastSlide.addText(
    topBarangay
      ? `${topBarangay.barangay} has ${formatNumber(topBarangay.forecast || 0)} projected cases across the four forecast periods. This forecast is decision-support information and should be reviewed together with actual case trends and field observations.`
      : 'Forecast details will appear after the forecasting workflow is ready.',
    {
      x: 0.72, y: 5.15, w: 11.85, h: 0.9, fontSize: 12, bold: true, color: COLORS.navy,
      margin: 0.14, fill: { color: COLORS.lightBlue }, line: { color: COLORS.paleBlue }, fit: 'shrink',
    }
  )

  const factorSlide = pptx.addSlide()
  addSlideTitle(
    factorSlide,
    'Combined Risk Factors',
    reportScopeConfig.isBarangayScoped
      ? 'Environmental, population, density, and forecast factors supporting the assigned barangay response priority.'
      : 'Environmental, population, density, and forecast factors used by the Response ranking.'
  )

  if (reportScopeConfig.isBarangayScoped) {
    const scopedProfile = getMultiSourceProfile(topBarangay)
    const scopedDecision = getDecisionSupport(topBarangay)

    factorSlide.addTable(
      [
        ['Risk factor', 'Current context'],
        ['Combined priority score', `${formatNumber(scopedProfile.score)}/100`],
        ['Environmental suitability', scopedProfile.environmentalSuitability || 'Not available'],
        ['Rainfall pressure', scopedProfile.rainfallPressure || 'Not available'],
        ['Temperature suitability', scopedProfile.temperatureSuitability || 'Not available'],
        ['Humidity suitability', scopedProfile.humiditySuitability || 'Not available'],
        ['Population exposure', scopedProfile.populationExposure || 'Not available'],
        ['Density level', scopedProfile.densityLevel || 'Not available'],
      ],
      {
        x: 0.65,
        y: 1.35,
        w: 7.45,
        h: 5.25,
        colW: [2.35, 5.1],
        fontSize: 11,
        color: COLORS.navy,
        border: { color: COLORS.line, pt: 1 },
        fill: { color: COLORS.white },
        margin: 0.085,
      }
    )

    factorSlide.addText('', {
      x: 8.45,
      y: 1.35,
      w: 4.15,
      h: 5.25,
      margin: 0,
      fill: { color: COLORS.white },
      line: { color: COLORS.line, pt: 1 },
    })

    factorSlide.addText('COMBINED PRIORITY', {
      x: 8.78,
      y: 1.7,
      w: 3.5,
      h: 0.28,
      fontSize: 10,
      bold: true,
      color: COLORS.blue,
      charSpace: 1.1,
      align: 'center',
      margin: 0,
    })

    factorSlide.addText(`${formatNumber(scopedProfile.score)}/100`, {
      x: 8.78,
      y: 2.12,
      w: 3.5,
      h: 1.02,
      fontSize: 32,
      bold: true,
      color: COLORS.navy,
      align: 'center',
      valign: 'mid',
      margin: 0.05,
      fill: { color: COLORS.lightBlue },
      line: { color: COLORS.paleBlue, pt: 1 },
    })

    factorSlide.addText(scopedDecision.priority || 'Decision pending', {
      x: 8.78,
      y: 3.38,
      w: 3.5,
      h: 0.58,
      fontSize: 13.5,
      bold: true,
      color: getPriorityPptColor(scopedDecision.priority),
      align: 'center',
      valign: 'mid',
      margin: 0.06,
      fill: { color: getPriorityPptFill(scopedDecision.priority) },
      line: { color: getPriorityPptColor(scopedDecision.priority), pt: 1 },
      fit: 'shrink',
    })

    factorSlide.addText('WHAT THIS SCORE MEANS', {
      x: 8.78,
      y: 4.28,
      w: 3.5,
      h: 0.25,
      fontSize: 9,
      bold: true,
      color: COLORS.blueDark,
      margin: 0,
    })

    factorSlide.addText(
      `This combines the dengue forecast, recent case movement, rainfall, temperature, humidity, population exposure, and density for ${barangayLabel}.`,
      {
        x: 8.78,
        y: 4.62,
        w: 3.5,
        h: 0.9,
        fontSize: 10.5,
        color: COLORS.navy,
        margin: 0.05,
        fit: 'shrink',
      }
    )

    factorSlide.addText('Decision-support score only — it is not a forecast probability.', {
      x: 8.78,
      y: 5.65,
      w: 3.5,
      h: 0.5,
      fontSize: 9.5,
      bold: true,
      color: COLORS.amber,
      align: 'center',
      valign: 'mid',
      margin: 0.05,
      fill: { color: COLORS.yellow },
      line: { color: 'FDE68A', pt: 1 },
      fit: 'shrink',
    })
  } else {
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
  }

  const actionSlide = pptx.addSlide()
  addSlideTitle(
    actionSlide,
    reportScopeConfig.isBarangayScoped ? 'Assigned Barangay Response Plan' : 'Top Response Plan',
    topBarangay
      ? (reportScopeConfig.isBarangayScoped
          ? `Recommended response guidance for ${topBarangay.barangay}.`
          : `${topBarangay.barangay} is currently the top response priority.`)
      : (reportScopeConfig.isBarangayScoped ? 'No response plan is available yet.' : 'No top response plan is available yet.')
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

  const polishedPptActions = reportScopeConfig.isBarangayScoped
    ? getPolishedActionList(topDecision.actions, topDecision.summary, 5)
    : (topDecision.actions || []).slice(0, 5)

  const actions =
    polishedPptActions.length > 0
      ? polishedPptActions
      : [reportScopeConfig.isBarangayScoped ? 'No additional action steps are available yet.' : 'No action plan available yet.']

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

  const fieldSlide = pptx.addSlide()
  addSlideTitle(
    fieldSlide,
    'Field Monitoring Summary',
    'BHW submissions are summarized here; detailed individual field reports remain separate.'
  )

  addMetricCard(fieldSlide, 'Total field reports', formatNumber(fieldMonitoringSummary?.total || 0), 0.72, 1.45, COLORS.lightBlue, COLORS.blue)
  addMetricCard(fieldSlide, 'Awaiting review', formatNumber(fieldMonitoringSummary?.awaitingReview || 0), 3.55, 1.45, COLORS.yellow, COLORS.amber)
  addMetricCard(fieldSlide, 'Follow-up required', formatNumber(fieldMonitoringSummary?.followUpRequired || 0), 6.38, 1.45, COLORS.yellow, COLORS.amber)
  addMetricCard(fieldSlide, 'Urgent reports', formatNumber(fieldMonitoringSummary?.urgent || 0), 9.21, 1.45, COLORS.rose, COLORS.red)

  fieldSlide.addTable([
    ['Common observed environmental factor', 'Reports'],
    ...((fieldMonitoringSummary?.commonObservations || []).length
      ? fieldMonitoringSummary.commonObservations.map((item) => [item.label, formatNumber(item.count)])
      : [['No submitted environmental observations available', '-']]),
  ], {
    x: 0.72, y: 3.15, w: 7.2, h: 2.35, fontSize: 10, color: COLORS.navy,
    border: { color: COLORS.line, pt: 1 }, fill: { color: COLORS.white }, margin: 0.07,
  })

  fieldSlide.addTable([
    ['Operational need', 'Reports'],
    ['Supplies needed', formatNumber(fieldMonitoringSummary?.suppliesNeeded || 0)],
    ['Assistance needed', formatNumber(fieldMonitoringSummary?.assistanceNeeded || 0)],
    ['Reviewed', formatNumber(fieldMonitoringSummary?.reviewed || 0)],
  ], {
    x: 8.15, y: 3.15, w: 4.4, h: 1.8, fontSize: 10, color: COLORS.navy,
    border: { color: COLORS.line, pt: 1 }, fill: { color: COLORS.white }, margin: 0.07,
  })

  const technicalSlide = pptx.addSlide()
  addSlideTitle(
    technicalSlide,
    reportScopeConfig.isBarangayScoped ? 'Technical Appendix: Model Review' : 'Technical Model Review',
    'Model evaluation details are kept separate from the health-worker response summary.'
  )

  technicalSlide.addTable([
    ['Technical field', 'Current model information'],
    ['Selected model', officialMetadata.selectedModel || 'Not recorded'],
    ['Models evaluated', String(officialMetadata.modelsEvaluated || 'Not recorded')],
    ['Model selection strength', officialMetadata.aiConfidence || 'Not available yet'],
    ['Selected model metrics', officialMetadata.selectedModelMetrics || 'Not recorded'],
    ['Top feature importance', officialMetadata.featureImportanceSummary || 'Not available yet'],
  ], {
    x: 0.72, y: 1.4, w: 11.85, h: 2.5, fontSize: 9.5, color: COLORS.navy,
    border: { color: COLORS.line, pt: 1 }, fill: { color: COLORS.white }, margin: 0.07,
  })

  technicalSlide.addText('Why this model was selected', {
    x: 0.72, y: 4.18, w: 4.2, h: 0.3, fontSize: 15, bold: true, color: COLORS.navy, margin: 0,
  })
  technicalSlide.addText(officialMetadata.selectionExplanation || 'Not recorded', {
    x: 0.72, y: 4.55, w: 11.85, h: 0.82, fontSize: 10.2, color: COLORS.navy,
    margin: 0.12, fill: { color: COLORS.lightBlue }, line: { color: COLORS.paleBlue }, fit: 'shrink',
  })
  technicalSlide.addText('Model ranking summary', {
    x: 0.72, y: 5.62, w: 4.2, h: 0.3, fontSize: 15, bold: true, color: COLORS.navy, margin: 0,
  })
  technicalSlide.addText(officialMetadata.modelComparisonSummary || 'Not recorded', {
    x: 0.72, y: 5.98, w: 11.85, h: 0.7, fontSize: 8.8, color: COLORS.slate,
    margin: 0.1, fill: { color: COLORS.white }, line: { color: COLORS.line }, fit: 'shrink',
  })

  const sourceSlide = pptx.addSlide()
  addSlideTitle(
    sourceSlide,
    reportScopeConfig.isBarangayScoped ? 'Technical Appendix: Data Readiness' : 'Uploaded Data Readiness',
    reportScopeConfig.isBarangayScoped ? 'Technical source-status information supporting the barangay report.' : 'Check status of uploaded or available files.'
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

  if (!reportScopeConfig.isBarangayScoped) {
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
  }

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
    reportScopeConfig.isBarangayScoped
      ? `Assigned barangay risk status: ${officialMetadata.assignedBarangayRiskStatus || `${barangayLabel}: ${topBarangay?.risk || 'Unknown'} risk`}`
      : `Top high-risk barangays: ${officialMetadata.topHighRiskBarangays}`,
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
    fileName: `${scopedBasename}.pptx`,
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

function HeroMetric({ label, value, helper, tone = 'blue', informationType = '' }) {
  const theme = getReportVisualTheme(tone)

  return (
    <div className="group/hero-metric relative overflow-hidden rounded-[22px] border border-white/15 bg-gradient-to-br from-white/10 via-slate-950/40 to-cyan-400/5 p-4 shadow-[0_16px_36px_rgba(2,6,23,0.30)] ring-1 ring-white/5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/25">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${theme.line}`} />
      <div className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl ${theme.glow}`} />
      <div className="relative flex flex-wrap items-center gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-300">{label}</p>
        {informationType ? (
          <InformationTypeBadge
            type={informationType}
            className={informationType === 'recorded'
              ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100 dark:border-cyan-300/20 dark:bg-cyan-300/10 dark:text-cyan-100'
              : informationType === 'forecast'
                ? 'border-violet-300/20 bg-violet-300/10 text-violet-100 dark:border-violet-300/20 dark:bg-violet-300/10 dark:text-violet-100'
                : 'border-amber-300/20 bg-amber-300/10 text-amber-100 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100'}
          />
        ) : null}
      </div>
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
    <PremiumPanel id={id} tone={tone} className="reports-disclosure-card p-4 sm:p-5">
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
                {open ? 'Hide details' : 'View details'}
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
  const authSession = useMemo(() => getAuthSession(), [])
  const isBhwReport = authSession?.role === 'bhw'
  const assignedBarangay = String(authSession?.assignedBarangay || '').trim()
  const reportGeneratedBy = authSession?.label || authSession?.email || (isBhwReport ? 'BHW user' : 'CHO user')
  const reportRoleLabel = isBhwReport ? 'Barangay Health Worker (BHW)' : 'City Health Office / Barangay Dengue Response Team'

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
  const [isHeroExportMenuOpen, setIsHeroExportMenuOpen] = useState(false)
  const [heroExportMenuPosition, setHeroExportMenuPosition] = useState({ top: 0, left: 0, width: 0 })
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
  const [reportCityTrendAnalytics, setReportCityTrendAnalytics] = useState(null)

  const boundaryLoadRequestedRef = useRef(false)
  const heroExportMenuRef = useRef(null)
  const heroExportMenuPortalRef = useRef(null)

  useEffect(() => {
    if (boundaryRecords.length > 0 || boundaryLoadRequestedRef.current) return
    boundaryLoadRequestedRef.current = true
    Promise.resolve(loadLatestSavedBoundaryGeoJson?.({ silent: true })).finally(() => {
      if (!boundaryRecords.length) boundaryLoadRequestedRef.current = false
    })
  }, [boundaryRecords.length])

  useEffect(() => {
    if (!isHeroExportMenuOpen) return undefined

    function handleClickOutside(event) {
      const clickedTrigger = heroExportMenuRef.current?.contains(event.target)
      const clickedMenu = heroExportMenuPortalRef.current?.contains(event.target)
      if (!clickedTrigger && !clickedMenu) {
        setIsHeroExportMenuOpen(false)
      }
    }

    function handleEscapeKey(event) {
      if (event.key === 'Escape') {
        setIsHeroExportMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleEscapeKey)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isHeroExportMenuOpen])

  useEffect(() => {
    if (!isHeroExportMenuOpen) return undefined

    function updateHeroExportMenuPosition() {
      const trigger = heroExportMenuRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const sideGap = 16
      const menuWidth = Math.min(620, Math.max(280, viewportWidth - sideGap * 2))
      const estimatedMenuHeight = viewportWidth >= 640 ? 315 : 470
      const preferredLeft = rect.right - menuWidth
      const left = Math.min(
        Math.max(sideGap, preferredLeft),
        Math.max(sideGap, viewportWidth - menuWidth - sideGap),
      )
      const belowTop = rect.bottom + 8
      const aboveTop = rect.top - estimatedMenuHeight - 8
      const top = belowTop + estimatedMenuHeight <= viewportHeight - sideGap
        ? belowTop
        : Math.max(sideGap, aboveTop)

      setHeroExportMenuPosition({ top, left, width: menuWidth })
    }

    updateHeroExportMenuPosition()
    window.addEventListener('resize', updateHeroExportMenuPosition)
    window.addEventListener('scroll', updateHeroExportMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateHeroExportMenuPosition)
      window.removeEventListener('scroll', updateHeroExportMenuPosition, true)
    }
  }, [isHeroExportMenuOpen])

  useEffect(() => {
    setIsHeroExportMenuOpen(false)
  }, [format])

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
    let rows = []

    if (usingBackendForecast) {
      rows = buildBackendRiskRows(backendForecastResult, {
        populationRecords,
        boundaryFeatures,
        weatherRecords,
      })
    } else if (Array.isArray(riskRows) && riskRows.length > 0) {
      rows = riskRows
    }

    if (isBhwReport) {
      if (!assignedBarangay) return []
      return rows.filter((row) => namesMatch(row?.barangay, assignedBarangay))
    }

    return rows
  }, [
    usingBackendForecast,
    backendForecastResult,
    riskRows,
    populationRecords,
    boundaryFeatures,
    weatherRecords,
    isBhwReport,
    assignedBarangay,
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

  const reportDashboardStats = useMemo(() => {
    if (!isBhwReport) return displayDashboardStats

    const assignedRow = sortedRiskRows[0]
    return {
      ...displayDashboardStats,
      totalCases: Number(assignedRow?.totalCases || assignedRow?.cases || 0),
      fourWeekForecast: Number(assignedRow?.forecast || 0),
      highRiskBarangays: assignedRow?.risk === 'High' ? 1 : 0,
    }
  }, [displayDashboardStats, isBhwReport, sortedRiskRows])

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
      generatedBy: reportGeneratedBy,
      role: reportRoleLabel,
      reportScope: isBhwReport ? 'assigned_barangay' : 'citywide',
      assignedBarangay: isBhwReport ? assignedBarangay : '',
    })
  }, [sourceStatus, backendForecastResult, latestModelMetrics, generatedAt, sortedRiskRows, usingBackendForecast, reportGeneratedBy, reportRoleLabel, isBhwReport, assignedBarangay])
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
  const selectedExportTheme = exportSelectionThemes[selectedExport.id] || exportSelectionThemes.pdf
  const heroReportReadyLabel = isBhwReport
    ? `${assignedBarangay || 'Barangay'} report ready`
    : authSession?.role === 'supervisor'
      ? 'Supervisor briefing ready'
      : 'CHO briefing ready'
  const selectedOutputTone =
    format === 'pdf'
      ? 'rose'
      : format === 'excel'
        ? 'emerald'
        : format === 'powerpoint'
          ? 'blue'
          : 'amber'
  const selectedOutputTheme = getReportVisualTheme(selectedOutputTone)
  const reportScopeConfig = getReportScopeConfig(officialReportMetadata)
  const activeReportTitle = reportScopeConfig.title
  const activeReportBasename = reportScopeConfig.basename

  const reportSummary = useMemo(() => {
    return getReportSummary({
      sortedRiskRows,
      dashboardStats: reportDashboardStats,
      isBarangayScoped: reportScopeConfig.isBarangayScoped,
    })
  }, [sortedRiskRows, reportDashboardStats, reportScopeConfig.isBarangayScoped])


  function getReportFilePath(formatLabel) {
    if (formatLabel === 'PDF') {
      return `local_download:${activeReportBasename}.pdf`
    }

    if (formatLabel === 'Excel') {
      return `local_download:${activeReportBasename}.xlsx`
    }

    if (formatLabel === 'PowerPoint') {
      return `local_download:${activeReportBasename}.pptx`
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
      totalCases: Number(reportDashboardStats.totalCases || 0),
      forecastTotal: Number(reportDashboardStats.fourWeekForecast || 0),
      dataQuality: Number(reportDashboardStats.dataQuality || 0),
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
      reportScope: isBhwReport ? 'assigned_barangay' : 'citywide',
      assignedBarangay: isBhwReport ? assignedBarangay : '',
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
        report_title: activeReportTitle,
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
    if (isBhwReport && !assignedBarangay) {
      alert('Your BHW account does not have an assigned barangay. Please contact an administrator.')
      return
    }

    const title = activeReportTitle
    const exportedAt = getCurrentDateTime()
    const exportedAtIso = new Date().toISOString()

    let exportModelMetrics = latestModelMetrics
    try {
      const refreshedMetrics = await loadLatestModelMetricsCached?.({ silent: true })
      if (refreshedMetrics?.has_metrics || refreshedMetrics?.metrics) {
        exportModelMetrics = refreshedMetrics
      }
    } catch {
      // Use the already loaded metrics snapshot if the refresh is unavailable.
    }

    const reportMetadataForExport = getOfficialReportMetadata({
      sourceStatus,
      backendForecastResult,
      latestModelMetrics: exportModelMetrics,
      generatedAt: exportedAt,
      sortedRiskRows,
      usingBackendForecast,
      generatedBy: reportGeneratedBy,
      role: reportRoleLabel,
      reportScope: isBhwReport ? 'assigned_barangay' : 'citywide',
      assignedBarangay: isBhwReport ? assignedBarangay : '',
    })

    let exportHotspotRows = hotspotRows
    let exportHotspotSummary = hotspotSummary
    let exportCityTrendAnalytics = null
    let exportFieldMonitoringSummary = getFieldMonitoringSummary(null)

    try {
      const fieldUpdateResult = await getFieldUpdates({
        limit: 200,
        barangay: isBhwReport ? assignedBarangay : '',
      })
      exportFieldMonitoringSummary = getFieldMonitoringSummary(fieldUpdateResult)
    } catch (error) {
      addActivityLog?.(
        'Field monitoring export fallback',
        error?.message || 'BHW field monitoring summary could not be refreshed for this export.'
      )
    }

    try {
      const trendFilters = reportCityTrendAnalytics?.filters || {}
      exportCityTrendAnalytics = isBhwReport
        ? await getBarangayTrendAnalytics({
            barangay: assignedBarangay,
            year: trendFilters.year || undefined,
            quarter: trendFilters.quarter || undefined,
            month: trendFilters.month || undefined,
          })
        : await getCityTrendAnalytics({
            year: trendFilters.year || undefined,
            quarter: trendFilters.quarter || undefined,
            month: trendFilters.month || undefined,
            includeClassification: true,
          })
    } catch (error) {
      addActivityLog?.(
        'Actual surveillance export fallback',
        error?.message || (isBhwReport ? 'Assigned barangay dengue surveillance could not be refreshed for this export.' : 'Citywide actual dengue surveillance could not be refreshed for this export.')
      )
    }

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
  dashboardStats: reportDashboardStats,
  riskRows: sortedRiskRows,
  sourceStatus,
  generatedAt: exportedAt,
  hotspotRows: exportHotspotRows,
  hotspotSummary: exportHotspotSummary,
  dataSourceLabel: reportDataSourceLabel,
  reportMetadata: reportMetadataForExport,
  cityTrendAnalytics: exportCityTrendAnalytics,
  fieldMonitoringSummary: exportFieldMonitoringSummary,
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
    <div className="reports-mobile-compact relative flex flex-col gap-6 pb-10">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 rounded-full bg-blue-100/70 blur-3xl dark:bg-blue-500/10" />


      <style>{`
        @media (max-width: 639px) {
          .reports-mobile-compact {
            display: flex !important;
            flex-direction: column !important;
            gap: 0.75rem !important;
            width: 100% !important;
            min-width: 0 !important;
            padding-bottom: 1.25rem;
          }

          /* Keep collapsed report sections and the response/export workspace in normal document flow.
             This prevents long-screenshot/mobile browsers from reserving large invisible grid space. */
          .reports-mobile-compact > * {
            min-width: 0 !important;
            max-width: 100% !important;
          }

          .reports-mobile-compact .reports-disclosure-card,
          .reports-mobile-compact > .relative.overflow-hidden.rounded-\[28px\].border {
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
          }

          .reports-mobile-compact .reports-decision-export-layout {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 0.75rem !important;
            width: 100% !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
          }

          .reports-mobile-compact #decision-brief,
          .reports-mobile-compact #export-center {
            position: relative !important;
            inset: auto !important;
            transform: none !important;
            align-self: stretch !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
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
            overflow-wrap: break-word;
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
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.055em !important;
          }

          .reports-mobile-compact .reports-hero-metrics p:nth-child(2) {
            margin-top: 0.4rem !important;
            font-size: 1.15rem !important;
            line-height: 1.05 !important;
            overflow-wrap: break-word !important;
          }

          .reports-mobile-compact .reports-hero-metrics p:last-child {
            margin-top: 0.3rem !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
          }

          .reports-mobile-compact section > button.group\/disclosure p {
            margin-top: 0.3rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.35 !important;
          }

          .reports-mobile-compact section > button.group\/disclosure .mt-3.inline-flex {
            max-width: 100% !important;
            white-space: normal !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.25 !important;
            overflow-wrap: break-word !important;
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
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.2 !important;
          }

          .reports-mobile-compact .reports-export-format-grid > button span.block {
            display: -webkit-box !important;
            -webkit-line-clamp: 3 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.045em !important;
          }

          .reports-mobile-compact .reports-top-factor-grid p:last-child {
            font-size: 0.8125rem !important;
            line-height: 1.25 !important;
            overflow-wrap: break-word !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.25 !important;
            overflow-wrap: break-word !important;
          }

          .reports-mobile-compact .reports-distribution-list > div > span:last-child {
            padding: 0.28rem 0.45rem !important;
            font-size: 0.8125rem !important;
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
            overflow-wrap: break-word !important;
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
          }

          .reports-mobile-compact .reports-source-grid .mt-4.rounded-2xl {
            margin-top: 0.55rem !important;
            padding: 0.5rem !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.4 !important;
          }

          .reports-mobile-compact .text-xs {
            font-size: 0.8125rem !important;
            line-height: 1.35 !important;
          }

          .reports-mobile-compact .text-\[11px\] {
            font-size: 0.8125rem !important;
            line-height: 1.28 !important;
          }

          .reports-mobile-compact .text-\[10px\] {
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list p {
            display: -webkit-box !important;
            -webkit-line-clamp: 5 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
          }

          .reports-mobile-compact .reports-priority-card p.font-black {
            font-size: 0.8125rem !important;
            line-height: 1.2 !important;
          }

          .reports-mobile-compact .reports-priority-card p.text-xs {
            font-size: 0.8125rem !important;
            line-height: 1.2 !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 {
            gap: 0.25rem !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 > span {
            max-width: 100% !important;
            padding: 0.24rem 0.34rem !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.1 !important;
          }

          .reports-mobile-compact .reports-priority-card .relative.mt-3.rounded-\[20px\] p:last-child {
            display: -webkit-box !important;
            margin-top: 0.3rem !important;
            -webkit-line-clamp: 4 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.8125rem !important;
            line-height: 1.28 !important;
          }

          .reports-mobile-compact .reports-priority-card .mt-3.flex.justify-end {
            margin-top: 0.5rem !important;
          }

          .reports-mobile-compact .reports-priority-card .mt-3.flex.justify-end > button {
            min-height: 36px !important;
            padding: 0.45rem 0.5rem !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.22 !important;
          }

          .reports-mobile-compact .reports-activity-grid p:nth-child(2) {
            font-size: 0.8125rem !important;
            line-height: 1.2 !important;
          }

          .reports-mobile-compact .reports-activity-grid p:last-child {
            display: -webkit-box !important;
            -webkit-line-clamp: 3 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
          }

          .reports-mobile-compact .reports-export-format-grid > button span.block {
            -webkit-line-clamp: 2 !important;
            font-size: 0.8125rem !important;
            line-height: 1.24 !important;
          }

          /* Distribution remains 2 x 2 but denser */
          .reports-mobile-compact .reports-distribution-list > div {
            min-height: 102px !important;
            padding: 0.55rem !important;
          }

          .reports-mobile-compact .reports-distribution-list span.text-sm {
            font-size: 0.8125rem !important;
            line-height: 1.2 !important;
          }

          /* Uploaded source cards remain 2 columns */
          .reports-mobile-compact .reports-source-grid > div {
            min-height: 150px !important;
            padding: 0.55rem !important;
          }

          .reports-mobile-compact .reports-source-grid p.text-sm {
            font-size: 0.8125rem !important;
          }

          .reports-mobile-compact .reports-source-grid p.break-all {
            display: -webkit-box !important;
            -webkit-line-clamp: 3 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.8125rem !important;
            line-height: 1.25 !important;
          }

          .reports-mobile-compact .reports-source-grid span.rounded-full {
            max-width: 100% !important;
            padding: 0.25rem 0.38rem !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list > div {
            min-height: 122px !important;
            padding: 0.5rem !important;
          }

          .reports-mobile-compact .reports-main-summary-list p {
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.25 !important;
          }

          .reports-mobile-compact .reports-priority-card p.text-xs {
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 {
            gap: 0.35rem !important;
          }

          .reports-mobile-compact .reports-priority-card .flex.flex-wrap.gap-2 > span {
            padding: 0.3rem 0.45rem !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
            line-height: 1.35 !important;
          }

          .reports-mobile-compact .reports-priority-card .mt-3.flex.justify-end > button {
            min-height: 40px !important;
            font-size: 0.8125rem !important;
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
            font-size: 0.8125rem !important;
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

      <section className={`reports-hero-panel relative isolate overflow-visible rounded-[38px] border border-white/10 bg-[#061321] shadow-[0_34px_94px_rgba(2,6,23,0.34)] ring-1 ring-white/10 sm:rounded-[40px] ${isHeroExportMenuOpen ? 'z-[80]' : 'z-0'}`}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[38px] sm:rounded-[40px]">
          <img
            src={reportsHeroBackground}
            alt=""
            aria-hidden="true"
            draggable="false"
            className="absolute inset-0 h-full w-full select-none object-cover brightness-[0.9] saturate-[1.08]"
            style={{ objectPosition: '62% center' }}
          />

          <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(2,6,23,0.97)_0%,rgba(3,13,28,0.91)_42%,rgba(4,22,40,0.60)_68%,rgba(2,6,23,0.74)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_24%,rgba(56,189,248,0.18),transparent_27%),radial-gradient(circle_at_92%_90%,rgba(99,102,241,0.14),transparent_28%)]" />
          <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-indigo-400/10 blur-3xl" />
        </div>

        <div className="reports-hero-layout relative z-10 grid min-h-[520px] gap-8 p-6 sm:p-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.62fr)] xl:items-center xl:p-10">
          <div className="flex flex-col justify-between">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/90 shadow-sm backdrop-blur-md">
                  <Sparkles className="h-3.5 w-3.5" />
                  Reporting command center
                </div>
                <InformationTypeBadge type="decision" className="border-amber-300/20 bg-amber-300/10 text-amber-100 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100" />
              </div>

              <h1 className="dengue-hero-title mt-6 max-w-4xl text-[2.15rem] font-bold leading-[1.08] tracking-[-0.035em] text-white drop-shadow-[0_5px_24px_rgba(2,6,23,0.65)] sm:text-[3rem] xl:text-[3.45rem]">
                Turn dengue intelligence into review-ready reports.
              </h1>

              <p className="dengue-hero-copy mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/90 sm:text-[15px] sm:leading-8">
                {usingBackendForecast
                  ? 'Ready-to-use reports that separate recorded dengue data, forecast results, and decision-support recommendations.'
                  : 'Ready-to-use reports for CHO review, barangay coordination, and dengue response planning.'}
              </p>
            </div>

            <div className="reports-hero-metrics mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroMetric
                label="Barangay-matched cases"
                value={formatNumber(reportDashboardStats.totalCases)}
                helper="Official matched cases used for modeling"
                tone="blue"
                informationType="recorded"
              />

              <HeroMetric
                label="Urgent alerts"
                value={formatNumber(decisionCounts.urgent)}
                helper="Urgent response priorities"
                tone="rose"
                informationType="decision"
              />

              <HeroMetric
                label="Forecast total"
                value={formatNumber(reportDashboardStats.fourWeekForecast)}
                helper="Model-generated cases across the forecast periods"
                tone="amber"
                informationType="forecast"
              />

              <HeroMetric
                label="Source valid-row rate"
                value={`${reportDashboardStats.dataQuality || 0}%`}
                helper="Valid rows across uploaded sources"
                tone="emerald"
              />
            </div>
          </div>

          <div className={`reports-selected-output group/output relative overflow-visible rounded-[32px] border border-white/15 bg-gradient-to-br ${selectedOutputTheme.darkCard} p-5 text-white shadow-[0_30px_78px_rgba(2,6,23,0.54)] ring-1 ring-white/10 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-white/25 sm:p-6 ${isHeroExportMenuOpen ? 'z-[90]' : 'z-10'}`}>
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${selectedOutputTheme.line}`} />
            <div className={`pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full ${selectedOutputTheme.glow} blur-3xl`} />
            <div className="flex items-start gap-4">
              <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border shadow-inner ${selectedOutputTheme.icon}`}>
                <SelectedExportIcon className="h-7 w-7" strokeWidth={2.2} />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">Selected output</p>
                  <InformationTypeBadge type="decision" className="border-amber-300/20 bg-amber-300/10 text-amber-100 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100" />
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-white">
                  {selectedExport.label}
                </h2>
                <p className="mt-1 text-sm leading-6 text-white/80">
                  {selectedExport.desc}
                </p>
              </div>
            </div>

            <div className="relative mt-5">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="hero-report-export-format-button"
                  className="text-[11px] font-black uppercase tracking-[0.16em] text-white/70"
                >
                  Choose export format
                </label>

                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
                  Synced with export center
                </span>
              </div>

              <div className="relative mt-2" ref={heroExportMenuRef}>
                <button
                  id="hero-report-export-format-button"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={isHeroExportMenuOpen}
                  aria-label="Choose report export format"
                  onClick={() => setIsHeroExportMenuOpen((current) => !current)}
                  className="group flex min-h-[72px] w-full items-center justify-between gap-4 rounded-[24px] border border-cyan-200/35 bg-gradient-to-br from-white/16 via-white/12 to-white/8 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_16px_34px_rgba(0,0,0,0.22)] backdrop-blur-md transition hover:border-cyan-200/55 hover:from-white/20 hover:via-white/15 hover:to-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-200/35"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${selectedExportTheme.icon}`}>
                      <SelectedExportIcon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.15em] text-cyan-100/70">
                        {selectedExport.label}
                      </p>
                      <p className="mt-1 truncate text-sm font-bold leading-6 text-white">
                        {selectedExport.actionLabel || 'Generate selected output'}
                      </p>
                      <p className="mt-1 text-xs font-medium leading-5 text-white/65">
                        {selectedExport.desc}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-white/65 sm:inline-flex">
                      4 formats
                    </span>

                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-white/10 text-white/80 shadow-inner transition duration-200 ${isHeroExportMenuOpen ? 'rotate-180 border-cyan-200/40 bg-cyan-400/15 text-cyan-100' : 'group-hover:border-white/25 group-hover:bg-white/14'}`}>
                      <ChevronDown className="h-5 w-5" />
                    </div>
                  </div>
                </button>

                {isHeroExportMenuOpen && typeof document !== 'undefined' ? createPortal(
                  <div
                    ref={heroExportMenuPortalRef}
                    style={{
                      position: 'fixed',
                      top: `${heroExportMenuPosition.top}px`,
                      left: `${heroExportMenuPosition.left}px`,
                      width: `${heroExportMenuPosition.width}px`,
                      zIndex: 2147483647,
                    }}
                    className="overflow-hidden rounded-[28px] border border-cyan-200/90 bg-white/95 text-slate-800 shadow-[0_32px_90px_rgba(2,6,23,0.48)] backdrop-blur-2xl dark:border-cyan-400/20 dark:bg-slate-950/96 dark:text-slate-100"
                  >
                    <div className="relative overflow-hidden border-b border-slate-200/80 px-4 py-3.5 dark:border-white/10 sm:px-5">
                      <span className="pointer-events-none absolute inset-x-8 top-0 h-[2px] rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
                      <span className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-cyan-300/20 blur-2xl dark:bg-cyan-400/10" />

                      <div className="relative flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-800 dark:text-slate-100">
                            Choose export format
                          </p>
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
                            All export choices are visible here, so you can select without scrolling.
                          </p>
                        </div>

                        <span className="shrink-0 rounded-full border border-cyan-300/40 bg-cyan-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
                          4 choices
                        </span>
                      </div>
                    </div>

                    <div role="listbox" aria-label="Report export formats" className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 sm:p-4">
                      {exportFormats.map((item) => {
                        const ItemIcon = item.icon
                        const isActive = item.id === format
                        const activeTone =
                          item.id === 'pdf'
                            ? 'border-rose-300 bg-gradient-to-br from-rose-50 via-white to-orange-50 text-rose-900 shadow-[0_10px_22px_rgba(244,63,94,0.10)] dark:border-rose-400/30 dark:from-rose-500/10 dark:via-slate-900 dark:to-orange-500/10 dark:text-rose-100'
                            : item.id === 'excel'
                              ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-emerald-900 shadow-[0_10px_22px_rgba(16,185,129,0.10)] dark:border-emerald-400/30 dark:from-emerald-500/10 dark:via-slate-900 dark:to-teal-500/10 dark:text-emerald-100'
                              : item.id === 'powerpoint'
                                ? 'border-blue-300 bg-gradient-to-br from-blue-50 via-white to-cyan-50 text-blue-900 shadow-[0_10px_22px_rgba(59,130,246,0.10)] dark:border-blue-400/30 dark:from-blue-500/10 dark:via-slate-900 dark:to-cyan-500/10 dark:text-blue-100'
                                : 'border-amber-300 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-900 shadow-[0_10px_22px_rgba(245,158,11,0.10)] dark:border-amber-400/30 dark:from-amber-500/10 dark:via-slate-900 dark:to-orange-500/10 dark:text-amber-100'

                        const iconTone =
                          item.id === 'pdf'
                            ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200'
                            : item.id === 'excel'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'
                              : item.id === 'powerpoint'
                                ? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200'
                                : 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'

                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onClick={() => {
                              setFormat(item.id)
                              setIsHeroExportMenuOpen(false)
                            }}
                            className={`group relative flex min-h-[86px] w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border px-3 py-3 text-left transition duration-200 ${isActive ? activeTone : 'border-slate-200/80 bg-white/80 text-slate-700 hover:border-cyan-200 hover:bg-cyan-50/70 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-cyan-400/20 dark:hover:bg-cyan-400/10'}`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${iconTone}`}>
                                <ItemIcon className="h-[18px] w-[18px]" />
                              </span>

                              <div className="min-w-0">
                                <p className="break-words text-[13px] font-black leading-5">{item.label}</p>
                                <p className="mt-0.5 break-words text-[10px] font-semibold leading-4 opacity-70">
                                  {item.id === 'pdf'
                                    ? 'Best for printing and formal review'
                                    : item.id === 'excel'
                                      ? 'Best for worksheets and detailed data'
                                      : item.id === 'powerpoint'
                                        ? 'Best for briefings and presentations'
                                        : 'Best for browser-based print preview'}
                                </p>
                              </div>
                            </div>

                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${isActive ? 'border-current bg-white/70 dark:bg-white/10' : 'border-slate-200/90 text-transparent group-hover:border-cyan-300 dark:border-white/10'}`}>
                              <CheckCircle2 className="h-4 w-4" />
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>,
                  document.body,
                ) : null}
              </div>

              <p className="mt-2 text-xs font-semibold leading-5 text-white/65">
                Select PDF, Excel, PowerPoint, or Print. Your choice is also synced with the Export Center below.
              </p>
            </div>

            <div className="relative mt-4 rounded-[24px] border border-white/15 bg-black/20 p-4 shadow-inner">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/70">
                Generated timestamp
              </p>

              <p className="mt-2 text-sm font-bold leading-6 text-white">
                {generatedAt}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-black text-white/80">
                  {heroReportReadyLabel}
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
                    {selectedExport.actionLabel || 'Generate selected output'}
                  </p>

                  <p
                    style={{ color: '#64748b' }}
                    className="mt-1 text-xs font-semibold leading-5"
                  >
                    {selectedExport.desc}
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

      {isBhwReport ? (
        <div className="relative z-0 rounded-[24px] border border-cyan-200/80 bg-cyan-50/80 px-4 py-3 text-sm font-semibold leading-6 text-slate-700 shadow-sm dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-slate-200">
          <span className="font-black text-cyan-800 dark:text-cyan-200">Barangay-specific report:</span>{' '}
          PDF, Excel, PowerPoint, and print exports are limited to <strong>{assignedBarangay || 'your assigned barangay'}</strong>, including its recorded trend, forecast, hotspot status, recommended response, and your field monitoring summary.
        </div>
      ) : (
        <CityTrendAnalyticsPanel context="reports" onAnalyticsChange={setReportCityTrendAnalytics} />
      )}

      <DisclosureCard
        id="additional-report-indicators"
        open={isAdditionalIndicatorsOpen}
        onToggle={() => setIsAdditionalIndicatorsOpen((current) => !current)}
        icon={Gauge}
        title="Additional report indicators"
        description="Open the supporting indicators only when a more detailed report review is needed."
        summary={`${isBhwReport ? `${assignedBarangay || 'Assigned barangay'} combined priority score` : 'Citywide average combined priority score'}: ${formatNumber(averageMultiSourceScore)}/100`}
        tone="blue"
      />

      {isAdditionalIndicatorsOpen && (
      <div className="reports-additional-indicators grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
        <StatCard
          label="Barangay-matched cases"
          value={formatNumber(reportDashboardStats.totalCases)}
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
          value={formatNumber(reportDashboardStats.fourWeekForecast)}
          helper="Model-generated cases across the forecast periods"
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
          value={`${reportDashboardStats.dataQuality || 0}%`}
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
                    {isBhwReport ? 'Assigned barangay risk status' : 'Top high-risk barangays'}
                  </p>

                  <MetadataDetailList
                    value={isBhwReport
                      ? officialReportMetadata.assignedBarangayRiskStatus
                      : officialReportMetadata.topHighRiskBarangays}
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
                {isBhwReport ? 'Assigned barangay dengue response brief' : 'Four-month dengue response planning brief'}
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
      {isBhwReport ? 'Assigned barangay response' : 'Response priority list'}
    </div>

    <h3 className="mt-3 text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
      {isBhwReport ? 'Assigned barangay' : 'Priority barangays'}
    </h3>

    <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-muted dark:text-slate-400">
      {isBhwReport
        ? `Current risk, forecast, hotspot status, and recommended response for ${assignedBarangay || 'your assigned barangay'}.`
        : 'Showing the highest-ranked barangays based on Response score, risk level, forecasted cases, and recommended response priority.'}
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
        {isBhwReport ? (assignedBarangay || 'Assigned barangay') : 'Top barangays'}
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
                                {formatNumber(row.forecast)} forecast cases
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
              const selectionTheme = exportSelectionThemes[item.id] || exportSelectionThemes.pdf
              const isSelected = format === item.id

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id)}
                  aria-pressed={isSelected}
                  className={`group relative overflow-hidden rounded-[26px] border p-4 text-left text-sm font-semibold transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_48px_rgba(15,23,42,0.14)] ${
                    isSelected
                      ? selectionTheme.card
                      : `${itemTheme.surface} opacity-90 shadow-[0_10px_26px_rgba(15,23,42,0.06)] ring-1 ring-white/70 hover:opacity-100 dark:ring-white/5`
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-r ${itemTheme.line} ${
                      isSelected ? 'h-1.5' : 'h-1'
                    }`}
                  />
                  <div
                    className={`pointer-events-none absolute -right-10 -top-10 rounded-full blur-3xl ${itemTheme.glow} ${
                      isSelected ? 'h-36 w-36 opacity-100' : 'h-28 w-28 opacity-60'
                    }`}
                  />

                  {isSelected && (
                    <div className="relative mb-3 flex justify-end">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] shadow-sm ${selectionTheme.badge}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        Selected
                      </span>
                    </div>
                  )}

                  <div className="relative flex items-start gap-3">
                    <div
                      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm transition-all duration-300 ${
                        isSelected ? selectionTheme.icon : itemTheme.icon
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <span
                        className={`block font-black transition-colors ${
                          isSelected ? 'text-brand-text dark:text-white' : ''
                        }`}
                      >
                        {item.label}
                      </span>

                      <span
                        className={`mt-1 block text-xs font-semibold leading-5 transition-opacity ${
                          isSelected ? 'opacity-90' : 'opacity-70'
                        }`}
                      >
                        {item.desc}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div
                      className={`relative mt-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] ${selectionTheme.summaryLabel}`}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Ready to generate
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div
            className={`relative mt-5 overflow-hidden rounded-[24px] border-2 p-4 text-sm text-brand-muted transition-all duration-300 dark:text-slate-400 ${selectedExportTheme.summary}`}
          >
            <div
              className={`pointer-events-none absolute inset-y-0 left-0 w-1.5 ${selectedExportTheme.bar}`}
            />

            <div className="flex items-start gap-3 pl-1">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${selectedExportTheme.icon}`}
              >
                <SelectedExportIcon className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 ${selectedExportTheme.summaryLabel}`}
                  />
                  <p
                    className={`text-xs font-black uppercase tracking-[0.14em] ${selectedExportTheme.summaryLabel}`}
                  >
                    Currently selected
                  </p>
                </div>

                <p className="mt-1 text-base font-black text-brand-text dark:text-slate-100">
                  {selectedExport.label}
                </p>

                <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">
                  {selectedExport.desc}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[22px] px-4 py-3.5 text-sm font-black text-white transition-all duration-200 hover:-translate-y-0.5 ${selectedExportTheme.button}`}
          >
            {format === 'print' ? (
              <Printer className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {selectedExport.actionLabel || 'Generate selected output'}
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
          <div className="mt-5 rounded-[24px] border border-sky-100 bg-gradient-to-r from-sky-50 to-cyan-50 p-4 shadow-sm dark:border-sky-500/20 dark:from-sky-500/10 dark:to-slate-900">
            <p className="text-sm font-black text-brand-text dark:text-slate-100">How to read report values</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <InformationTypeBadge type="recorded" />
                <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Actual values from uploaded and validated records.</p>
              </div>
              <div>
                <InformationTypeBadge type="forecast" />
                <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Model-generated estimates for future periods.</p>
              </div>
              <div>
                <InformationTypeBadge type="decision" />
                <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Planning guidance such as risk, hotspot, priority, and recommended response.</p>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:to-slate-900">
            <p className="flex items-center gap-2 text-sm font-black text-brand-orange dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Export note
            </p>

            <p className="mt-1 text-sm leading-6 text-brand-muted dark:text-slate-400">
              {usingBackendForecast
               ? 'PDF, Excel, PowerPoint, and print reports now include actual dengue trends, case classification, four-period forecasts, response priorities, hotspot context, field-monitoring summaries, model transparency details, recommended actions, and supporting rationale.'
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
              {isBhwReport ? 'Assigned barangay response plan' : 'Top response plan'}
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
