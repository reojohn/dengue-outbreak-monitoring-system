import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Droplets,
  FileText,
  Home,
  Loader2,
  Save,
  Send,
  MapPinned,
  Megaphone,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import SparkChart from '../components/SparkChart'
import InformationTypeBadge from '../components/InformationTypeBadge'
import AssignedResponseActions from '../components/AssignedResponseActions'
import BarangayRiskExplanation from '../components/BarangayRiskExplanation'
import { TrendPanelSkeleton } from '../components/SystemSkeleton'
import TrendFilterDropdown from '../components/TrendFilterDropdown'
import TrendMetricCard from '../components/TrendMetricCard'
import {
  getBarangayTrendAnalytics,
  getCurrentFieldUpdate,
  getTrendAnalyticsBarangays,
  saveFieldUpdateDraft,
  submitFieldUpdate,
  subscribeWorkflowRealtime,
} from '../services/api'
import { getAuthSession } from '../utils/auth'
import {
  compareCanonicalBarangayPriority,
  computeDecisionSupport,
  getCanonicalCombinedRiskScore,
} from '../utils/analytics'

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function normalizeName(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const ENVIRONMENTAL_OBSERVATION_OPTIONS = [
  { key: 'standing_water', label: 'Standing water observed' },
  { key: 'uncovered_water_containers', label: 'Uncovered water containers' },
  { key: 'possible_breeding_sites', label: 'Possible mosquito breeding sites' },
  { key: 'flood_prone_area', label: 'Flood-prone area' },
  { key: 'low_lying_area', label: 'Low-lying area' },
  { key: 'waste_accumulation', label: 'Waste accumulation' },
  { key: 'clogged_drainage', label: 'Clogged drainage' },
]

const TREND_PERIOD_OPTIONS = [
  { value: 'all', label: 'Full year', note: 'Show all recorded months for the selected year' },
  { value: 'q1', label: 'Q1 · Jan–Mar', note: 'First quarter trend' },
  { value: 'q2', label: 'Q2 · Apr–Jun', note: 'Second quarter trend' },
  { value: 'q3', label: 'Q3 · Jul–Sep', note: 'Third quarter trend' },
  { value: 'q4', label: 'Q4 · Oct–Dec', note: 'Fourth quarter trend' },
  { value: 'm1', label: 'January', note: 'Recorded cases for January' },
  { value: 'm2', label: 'February', note: 'Recorded cases for February' },
  { value: 'm3', label: 'March', note: 'Recorded cases for March' },
  { value: 'm4', label: 'April', note: 'Recorded cases for April' },
  { value: 'm5', label: 'May', note: 'Recorded cases for May' },
  { value: 'm6', label: 'June', note: 'Recorded cases for June' },
  { value: 'm7', label: 'July', note: 'Recorded cases for July' },
  { value: 'm8', label: 'August', note: 'Recorded cases for August' },
  { value: 'm9', label: 'September', note: 'Recorded cases for September' },
  { value: 'm10', label: 'October', note: 'Recorded cases for October' },
  { value: 'm11', label: 'November', note: 'Recorded cases for November' },
  { value: 'm12', label: 'December', note: 'Recorded cases for December' },
]

function getTrendPeriodParams(value = 'all') {
  const normalized = String(value || 'all').toLowerCase()

  if (/^q[1-4]$/.test(normalized)) {
    return { quarter: Number(normalized.slice(1)), month: null }
  }

  if (/^m(?:[1-9]|1[0-2])$/.test(normalized)) {
    return { quarter: null, month: Number(normalized.slice(1)) }
  }

  return { quarter: null, month: null }
}

function formatOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  return Number.isFinite(number) ? formatNumber(number) : '—'
}

function getCaseShare(value, total) {
  const numericValue = Number(value || 0)
  const numericTotal = Number(total || 0)
  if (!Number.isFinite(numericValue) || !Number.isFinite(numericTotal) || numericTotal <= 0) return 0
  return Math.max(0, Math.min(100, (numericValue / numericTotal) * 100))
}

function getTrendDirectionStyle(direction = '') {
  if (direction === 'Increasing') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200'
  }

  if (direction === 'Decreasing') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200'
  }

  if (direction === 'Stable') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200'
  }

  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
}

function getForecastTrendDirection(rows = []) {
  const values = rows
    .map((row) => Number(row?.predicted_cases))
    .filter((value) => Number.isFinite(value))

  if (values.length < 2) {
    return {
      label: 'Not enough data',
      change: 0,
      className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      Icon: Activity,
    }
  }

  const meanX = (values.length - 1) / 2
  const meanY = values.reduce((sum, value) => sum + value, 0) / values.length
  const denominator = values.reduce((sum, _, index) => sum + ((index - meanX) ** 2), 0)
  const slope = denominator > 0
    ? values.reduce((sum, value, index) => sum + ((index - meanX) * (value - meanY)), 0) / denominator
    : 0
  const change = values[values.length - 1] - values[0]

  if (slope > 0.15) {
    return {
      label: 'Increasing',
      change,
      className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200',
      Icon: TrendingUp,
    }
  }

  if (slope < -0.15) {
    return {
      label: 'Decreasing',
      change,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
      Icon: TrendingDown,
    }
  }

  return {
    label: 'Stable',
    change,
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
    Icon: Activity,
  }
}

function ForecastTrendMiniChart({ rows = [], barangayName = 'Barangay' }) {
  const pointsData = rows
    .map((row, index) => ({
      value: Number(row?.predicted_cases),
      label: String(row?.period || `Period ${index + 1}`),
    }))
    .filter((item) => Number.isFinite(item.value))

  if (pointsData.length < 2) return null

  const direction = getForecastTrendDirection(rows)
  const DirectionIcon = direction.Icon
  const values = pointsData.map((item) => item.value)
  const labels = pointsData.map((item) => item.label)
  const firstValue = values[0] ?? 0
  const lastValue = values[values.length - 1] ?? 0
  const changeText = direction.change === 0
    ? 'No net change from first to last period'
    : `${direction.change > 0 ? '+' : ''}${formatNumber(direction.change)} case${Math.abs(direction.change) === 1 ? '' : 's'} from first to last period`

  return (
    <div className="mt-4">
      <div className="relative -mx-2 min-w-0 overflow-hidden rounded-[24px] border border-cyan-400/[0.15] bg-gradient-to-b from-[#061321] via-[#06111d] to-[#020817] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.42)] sm:mx-0 sm:rounded-[30px] sm:p-5">
        <div className="mb-3 flex flex-col gap-2 px-1 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:px-0">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300/80">
              Barangay predicted dengue trend
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Forecast cases only. Recorded dengue cases are shown separately in the historical trend above.
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black ${direction.className}`}>
            <DirectionIcon className="h-3.5 w-3.5" />
            {direction.label}
          </span>
        </div>

        <div className="w-full min-h-[300px] sm:min-h-[360px] lg:min-h-[420px]">
          <SparkChart
            values={values}
            labels={labels}
            title={`${barangayName} predicted dengue cases`}
            subtitle="Four future-period dengue case predictions · direct multi-step forecast"
            emptyLabel="No future-period forecast values are available"
            legendLabel="Predicted dengue cases"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-blue-200/70 bg-blue-50/70 px-4 py-3 text-[11px] font-bold text-brand-muted dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-slate-300">
        <span>{formatNumber(firstValue)} → {formatNumber(lastValue)} predicted cases</span>
        <span>{changeText}</span>
      </div>
    </div>
  )
}

function getBoundaryGeoJson(boundaryRecords = []) {
  if (!boundaryRecords) return null

  if (
    boundaryRecords?.type === 'FeatureCollection' &&
    Array.isArray(boundaryRecords.features)
  ) {
    return boundaryRecords
  }

  if (Array.isArray(boundaryRecords)) {
    const featureCollection = boundaryRecords.find((item) => (
      item?.type === 'FeatureCollection' &&
      Array.isArray(item.features)
    ))

    if (featureCollection) {
      return featureCollection
    }

    const features = boundaryRecords.filter((item) => (
      item?.type === 'Feature' &&
      item?.geometry
    ))

    if (features.length) {
      return {
        type: 'FeatureCollection',
        features,
      }
    }
  }

  return null
}

function countBoundaryFeatures(boundaryRecords = []) {
  return getBoundaryGeoJson(boundaryRecords)?.features?.length || 0
}

function getBoundaryFeatureName(feature) {
  const properties = feature?.properties || {}

  return String(
    properties.adm4_name ||
      properties.adm4_ref_name ||
      properties.name ||
      properties.barangay ||
      properties.barangay_name ||
      properties.BARANGAY ||
      properties.ADM4_EN ||
      ''
  ).trim()
}

function getBoundaryFeatureForBarangay(boundaryRecords = [], barangayName = '') {
  const featureCollection = getBoundaryGeoJson(boundaryRecords)
  const targetKey = normalizeName(barangayName)

  if (!featureCollection?.features?.length || !targetKey) return null

  const exactMatch = featureCollection.features.find((feature) => (
    normalizeName(getBoundaryFeatureName(feature)) === targetKey
  ))

  if (exactMatch) return exactMatch

  return featureCollection.features.find((feature) => {
    const featureKey = normalizeName(getBoundaryFeatureName(feature))

    return (
      featureKey &&
      targetKey &&
      (featureKey.includes(targetKey) || targetKey.includes(featureKey))
    )
  }) || null
}

function getGeometryRings(geometry) {
  if (!geometry) return []

  if (geometry.type === 'Polygon') {
    return Array.isArray(geometry.coordinates)
      ? geometry.coordinates.filter(Array.isArray)
      : []
  }

  if (geometry.type === 'MultiPolygon') {
    return Array.isArray(geometry.coordinates)
      ? geometry.coordinates.flatMap((polygon) => (
          Array.isArray(polygon) ? polygon.filter(Array.isArray) : []
        ))
      : []
  }

  if (geometry.type === 'GeometryCollection') {
    return Array.isArray(geometry.geometries)
      ? geometry.geometries.flatMap(getGeometryRings)
      : []
  }

  return []
}

function getBoundaryRiskPalette(risk) {
  if (risk === 'High') {
    return {
      fill: '#f43f5e',
      fillSoft: '#fb7185',
      stroke: '#fecdd3',
      glow: 'rgba(244, 63, 94, 0.58)',
      label: 'High risk',
    }
  }

  if (risk === 'Moderate') {
    return {
      fill: '#f59e0b',
      fillSoft: '#fbbf24',
      stroke: '#fde68a',
      glow: 'rgba(245, 158, 11, 0.56)',
      label: 'Moderate risk',
    }
  }

  if (risk === 'Low') {
    return {
      fill: '#10b981',
      fillSoft: '#34d399',
      stroke: '#a7f3d0',
      glow: 'rgba(16, 185, 129, 0.52)',
      label: 'Low risk',
    }
  }

  return {
    fill: '#64748b',
    fillSoft: '#94a3b8',
    stroke: '#cbd5e1',
    glow: 'rgba(100, 116, 139, 0.46)',
    label: 'Risk pending',
  }
}

function BarangayBoundaryShape({
  feature,
  barangayName,
  risk,
  score,
}) {
  const shape = useMemo(() => {
    const rings = getGeometryRings(feature?.geometry)
      .map((ring) => (
        Array.isArray(ring)
          ? ring.filter((coordinate) => (
              Array.isArray(coordinate) &&
              Number.isFinite(Number(coordinate[0])) &&
              Number.isFinite(Number(coordinate[1]))
            ))
          : []
      ))
      .filter((ring) => ring.length >= 3)

    const coordinates = rings.flat()

    if (!coordinates.length) return null

    const longitudes = coordinates.map((coordinate) => Number(coordinate[0]))
    const latitudes = coordinates.map((coordinate) => Number(coordinate[1]))
    const minLongitude = Math.min(...longitudes)
    const maxLongitude = Math.max(...longitudes)
    const minLatitude = Math.min(...latitudes)
    const maxLatitude = Math.max(...latitudes)

    const viewWidth = 1000
    const viewHeight = 700

    // Keep the complete polygon visible below the top HUD and above
    // the bottom barangay label, including its 3D extrusion.
    const horizontalPadding = 68
    const topSafeArea = 118
    const bottomSafeArea = 122
    const usableHeight = viewHeight - topSafeArea - bottomSafeArea

    const longitudeRange = Math.max(maxLongitude - minLongitude, 0.000001)
    const latitudeRange = Math.max(maxLatitude - minLatitude, 0.000001)
    const scale = Math.min(
      (viewWidth - horizontalPadding * 2) / longitudeRange,
      usableHeight / latitudeRange
    )
    const drawnWidth = longitudeRange * scale
    const drawnHeight = latitudeRange * scale
    const offsetX = (viewWidth - drawnWidth) / 2
    const offsetY = topSafeArea + (usableHeight - drawnHeight) / 2

    const projectCoordinate = ([longitude, latitude]) => {
      const x = offsetX + (Number(longitude) - minLongitude) * scale
      const y = offsetY + (maxLatitude - Number(latitude)) * scale

      return [x, y]
    }

    const projectedRings = rings.map((ring) => ring.map(projectCoordinate))
    const allProjected = projectedRings.flat()
    const xs = allProjected.map(([x]) => x)
    const ys = allProjected.map(([, y]) => y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    const path = projectedRings
      .map((ring) => (
        ring
          .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
          .join(' ') + ' Z'
      ))
      .join(' ')

    const depthOffsets = Array.from({ length: 11 }, (_, index) => ({
      x: 28 - index * 2.2,
      y: 26 - index * 1.9,
      opacity: 0.12 + index * 0.022,
    }))

    const clamp = (value, minimum, maximum) => (
      Math.min(maximum, Math.max(minimum, value))
    )

    const lowerNodeY = clamp(maxY + 22, 112, viewHeight - 82)
    const platformTopY = Math.min(viewHeight - 90, maxY + 18)
    const platformBottomY = Math.min(viewHeight - 30, platformTopY + 62)

    const orbitNodes = [
      { x: clamp(minX - 76, 42, viewWidth - 42), y: lowerNodeY, radius: 28, inner: 11, opacity: 0.92 },
      { x: clamp(minX + 28, 42, viewWidth - 42), y: clamp(minY + 58, 108, viewHeight - 82), radius: 24, inner: 9, opacity: 0.78 },
      { x: clamp(maxX + 78, 42, viewWidth - 42), y: clamp(minY + 108, 108, viewHeight - 82), radius: 26, inner: 10, opacity: 0.82 },
      { x: clamp(maxX + 58, 42, viewWidth - 42), y: clamp(maxY - 8, 108, viewHeight - 82), radius: 30, inner: 12, opacity: 0.9 },
      { x: clamp(centerX + 138, 42, viewWidth - 42), y: clamp(centerY + 50, 108, viewHeight - 82), radius: 22, inner: 8, opacity: 0.72 },
      { x: clamp(centerX - 136, 42, viewWidth - 42), y: clamp(centerY - 54, 108, viewHeight - 82), radius: 18, inner: 7, opacity: 0.65 },
    ]

    const platformPath = [
      `M ${(minX - 112).toFixed(2)} ${platformTopY.toFixed(2)}`,
      `L ${(maxX + 142).toFixed(2)} ${platformTopY.toFixed(2)}`,
      `L ${(maxX + 96).toFixed(2)} ${platformBottomY.toFixed(2)}`,
      `L ${(minX - 164).toFixed(2)} ${platformBottomY.toFixed(2)}`,
      'Z',
    ].join(' ')

    return {
      path,
      viewBox: `0 0 ${viewWidth} ${viewHeight}`,
      centerX,
      centerY,
      markerX: centerX,
      markerY: centerY,
      minX,
      maxX,
      minY,
      maxY,
      shadowCx: centerX + 30,
      shadowCy: Math.min(viewHeight - 58, maxY + 46),
      depthOffsets,
      orbitNodes,
      platformPath,
    }
  }, [feature])

  const palette = getBoundaryRiskPalette(risk)
  const idKey = `${normalizeName(barangayName) || 'barangay'}-${String(risk || 'pending').toLowerCase()}`

  if (!shape) {
    return (
      <div className="bhw-boundary-svg flex h-full items-center justify-center bg-slate-950 p-6 text-center">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/10 text-amber-300">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-black text-white">Polygon geometry unavailable</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
            The boundary file contains the barangay name, but its Polygon or MultiPolygon geometry could not be drawn.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bhw-boundary-svg relative h-full w-full overflow-hidden bg-slate-950"
      aria-label={`${barangayName} boundary shape with ${String(risk || 'pending').toLowerCase()} dengue risk`}
    >
      <svg
        viewBox={shape.viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={`${barangayName} official barangay boundary polygon`}
      >
        <defs>
          <radialGradient id={`background-${idKey}`} cx="50%" cy="38%" r="80%">
            <stop offset="0%" stopColor="#16366d" stopOpacity="0.46" />
            <stop offset="50%" stopColor="#071427" stopOpacity="0.90" />
            <stop offset="100%" stopColor="#020617" stopOpacity="1" />
          </radialGradient>

          <linearGradient id={`fill-${idKey}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.fillSoft} />
            <stop offset="100%" stopColor={palette.fill} />
          </linearGradient>

          <linearGradient id={`side-${idKey}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={palette.fill} stopOpacity="0.92" />
            <stop offset="100%" stopColor="#071220" stopOpacity="0.98" />
          </linearGradient>

          <linearGradient id={`beam-${idKey}`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={palette.fillSoft} stopOpacity="0.18" />
            <stop offset="35%" stopColor={palette.fillSoft} stopOpacity="0.48" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.96" />
          </linearGradient>

          <radialGradient id={`pulse-${idKey}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.88" />
            <stop offset="30%" stopColor={palette.fillSoft} stopOpacity="0.55" />
            <stop offset="100%" stopColor={palette.fillSoft} stopOpacity="0" />
          </radialGradient>

          <radialGradient id={`node-${idKey}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
            <stop offset="36%" stopColor={palette.fillSoft} stopOpacity="0.58" />
            <stop offset="100%" stopColor={palette.fillSoft} stopOpacity="0" />
          </radialGradient>

          <linearGradient id={`platform-${idKey}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#061321" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#0b1d34" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#08111f" stopOpacity="0.98" />
          </linearGradient>

          <filter id={`glow-${idKey}`} x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="18" floodColor={palette.glow} />
            <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#000000" floodOpacity="0.54" />
          </filter>
        </defs>

        <rect width="1000" height="620" fill={`url(#background-${idKey})`} />
        <rect x="22" y="22" width="956" height="576" rx="28" fill="none" stroke="rgba(96,165,250,0.12)" strokeWidth="1.5" />

        <g opacity="0.32">
          {Array.from({ length: 19 }).map((_, index) => {
            const y = 96 + index * 26
            return (
              <line
                key={`h-${index}`}
                x1="0"
                y1={y}
                x2="1000"
                y2={y + index * 7.5}
                stroke="#3b82f6"
                strokeOpacity="0.22"
                strokeWidth="1"
              />
            )
          })}
          {Array.from({ length: 24 }).map((_, index) => {
            const x = 16 + index * 44
            return (
              <line
                key={`v-${index}`}
                x1={x}
                y1="64"
                x2={x - 140}
                y2="620"
                stroke="#60a5fa"
                strokeOpacity="0.14"
                strokeWidth="1"
              />
            )
          })}
        </g>

        <path d={shape.platformPath} fill={`url(#platform-${idKey})`} opacity="0.96" stroke="rgba(96,165,250,0.18)" strokeWidth="1.3" />
        <path d={shape.platformPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" strokeDasharray="6 8" />

        {shape.orbitNodes.map((node, index) => (
          <g key={`orbit-${index}`} opacity={node.opacity}>
            <line
              x1={node.x}
              y1={node.y}
              x2={shape.markerX}
              y2={shape.markerY}
              stroke={palette.fillSoft}
              strokeOpacity="0.18"
              strokeWidth="1.2"
            />
            <ellipse cx={node.x} cy={node.y} rx={node.radius} ry={node.radius * 0.45} fill={`url(#node-${idKey})`} />
            <ellipse cx={node.x} cy={node.y} rx={node.radius} ry={node.radius * 0.45} fill="none" stroke={palette.fillSoft} strokeOpacity="0.72" strokeWidth="1.8" />
            <ellipse cx={node.x} cy={node.y} rx={node.inner} ry={node.inner * 0.45} fill="none" stroke="#ffffff" strokeOpacity="0.58" strokeWidth="1.4" />
          </g>
        ))}

        <ellipse
          cx={shape.shadowCx}
          cy={shape.shadowCy}
          rx={Math.max(120, (shape.maxX - shape.minX) * 0.36)}
          ry={36}
          fill={palette.glow}
          opacity="0.34"
          filter={`url(#glow-${idKey})`}
        />

        {shape.depthOffsets.map((layer, index) => (
          <path
            key={`depth-${index}`}
            d={shape.path}
            transform={`translate(${layer.x} ${layer.y})`}
            fill={`url(#side-${idKey})`}
            opacity={layer.opacity}
            stroke="#0b1120"
            strokeOpacity="0.26"
            strokeWidth="1.3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            fillRule="evenodd"
            clipRule="evenodd"
          />
        ))}

        <path
          d={shape.path}
          transform="translate(28 26)"
          fill="#091729"
          opacity="0.9"
          stroke="#0f172a"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          fillRule="evenodd"
          clipRule="evenodd"
        />

        <path
          d={shape.path}
          fill={palette.fill}
          opacity="0.16"
          stroke="none"
          filter={`url(#glow-${idKey})`}
          fillRule="evenodd"
          clipRule="evenodd"
        />

        <path
          d={shape.path}
          fill={`url(#fill-${idKey})`}
          fillOpacity="0.94"
          stroke={palette.stroke}
          strokeWidth="6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          filter={`url(#glow-${idKey})`}
          fillRule="evenodd"
          clipRule="evenodd"
        />

        <path
          d={shape.path}
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.3"
          strokeWidth="1.8"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          fillRule="evenodd"
          clipRule="evenodd"
        />

        <g transform={`translate(${shape.markerX} ${shape.markerY})`}>
          <ellipse rx="88" ry="28" fill={`url(#pulse-${idKey})`} opacity="0.36" />
          <circle r="48" fill="none" stroke={palette.fillSoft} strokeOpacity="0.72" strokeWidth="2.8" />
          <circle r="28" fill="none" stroke="#ffffff" strokeOpacity="0.42" strokeWidth="1.8" />
          <circle r="11" fill="#ffffff" fillOpacity="0.96" />
          <circle r="6" fill={palette.fillSoft} />
          <line x1="0" y1="-12" x2="0" y2="-86" stroke={`url(#beam-${idKey})`} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="0" cy="-94" r="7" fill="#ffffff" fillOpacity="0.96" />
          <rect x="-56" y="-142" width="112" height="36" rx="10" fill="#071427" fillOpacity="0.92" stroke={palette.stroke} strokeOpacity="0.82" />
          <text x="0" y="-120" fill="#ffffff" textAnchor="middle" fontSize="13" fontWeight="800" letterSpacing="1.5">
            TARGET AREA
          </text>
        </g>
      </svg>

      <div className="pointer-events-none absolute left-5 top-[4.9rem] z-20 rounded-full border border-white/10 bg-slate-950/85 px-3 py-1.5 text-xs font-black text-white shadow-lg backdrop-blur">
        {palette.label} · {score}/100
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent px-5 pb-5 pt-10">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          Selected barangay boundary
        </p>
        <p className="mt-1 text-lg font-black text-white sm:text-xl">
          {barangayName}
        </p>
      </div>
    </div>
  )
}

function normalizeRiskLevel(value, fallback = 'Pending') {
  const normalized = String(value || '').trim().toLowerCase()

  if (normalized === 'high') return 'High'
  if (normalized === 'moderate') return 'Moderate'
  if (normalized === 'low') return 'Low'

  return fallback
}

function getCases(row) {
  return (
    row?.forecast_next_4_periods ??
    row?.forecasted_cases ??
    row?.predictedCases ??
    row?.predicted_cases ??
    row?.forecast ??
    row?.forecastCases ??
    row?.forecast_cases ??
    row?.cases ??
    row?.totalCases ??
    row?.total_cases ??
    0
  )
}


function parseForecastPeriodPredictions(row) {
  const rawPredictions =
    row?.forecast_period_predictions ??
    row?.forecastPeriodPredictions ??
    []

  if (Array.isArray(rawPredictions)) {
    return rawPredictions
  }

  if (typeof rawPredictions === 'string' && rawPredictions.trim()) {
    try {
      const parsed = JSON.parse(rawPredictions)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function formatForecastPeriodLabel(value = '', horizon = 1, latestPeriod = '') {
  const rawValue = String(value || '').trim()

  const monthlyMatch = rawValue.match(/^(\d{4})-(0[1-9]|1[0-2])$/)

  if (monthlyMatch) {
    const date = new Date(Date.UTC(
      Number(monthlyMatch[1]),
      Number(monthlyMatch[2]) - 1,
      1
    ))

    return new Intl.DateTimeFormat('en-PH', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date)
  }

  if (rawValue) {
    return rawValue
  }

  const latestMonthlyMatch = String(latestPeriod || '')
    .trim()
    .match(/^(\d{4})-(0[1-9]|1[0-2])$/)

  if (latestMonthlyMatch) {
    const date = new Date(Date.UTC(
      Number(latestMonthlyMatch[1]),
      Number(latestMonthlyMatch[2]) - 1 + Math.max(1, Number(horizon || 1)),
      1
    ))

    return new Intl.DateTimeFormat('en-PH', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date)
  }

  return `Forecast period ${Math.max(1, Number(horizon || 1))}`
}

function getDirectForecastHorizons(row) {
  if (!row) return []

  const latestPeriod =
    row?.latest_period ??
    row?.latestPeriod ??
    ''

  return parseForecastPeriodPredictions(row)
    .map((item, index) => {
      const horizon = Math.max(
        1,
        Number(item?.horizon ?? item?.forecast_horizon ?? index + 1) || index + 1
      )

      const rawCases =
        item?.predicted_cases ??
        item?.predictedCases ??
        item?.forecast_cases ??
        item?.forecastCases ??
        item?.cases

      const numericCases = Number(rawCases)

      if (!Number.isFinite(numericCases)) {
        return null
      }

      return {
        horizon,
        period: formatForecastPeriodLabel(
          item?.period ?? item?.forecast_period ?? item?.date ?? '',
          horizon,
          latestPeriod
        ),
        predicted_cases: Math.max(0, Math.round(numericCases)),
        source: 'direct_multi_step',
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.horizon - b.horizon)
    .slice(0, 4)
}

function getHorizonRowsFromForecastRows(rows = [], barangayName = '', latestPeriod = '') {
  const barangayKey = normalizeName(barangayName)

  if (!barangayKey || !Array.isArray(rows)) return []

  return rows
    .filter((row) => normalizeName(row?.barangay) === barangayKey)
    .map((row, index) => {
      const explicitHorizon = Number(
        row?.horizon ??
        row?.forecast_horizon ??
        row?.forecastHorizon ??
        0
      )

      const rawPeriod =
        row?.period ??
        row?.forecast_period ??
        row?.forecastPeriod ??
        row?.date ??
        ''

      const hasHorizonIdentity = explicitHorizon > 0 || String(rawPeriod || '').trim()

      if (!hasHorizonIdentity) {
        return null
      }

      const rawCases =
        row?.predicted_cases ??
        row?.predictedCases ??
        row?.forecast_cases ??
        row?.forecastCases ??
        row?.cases

      const numericCases = Number(rawCases)

      if (!Number.isFinite(numericCases)) {
        return null
      }

      const horizon = explicitHorizon > 0 ? explicitHorizon : index + 1

      return {
        horizon,
        period: formatForecastPeriodLabel(rawPeriod, horizon, latestPeriod),
        predicted_cases: Math.max(0, Math.round(numericCases)),
        source: 'horizon_row',
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.horizon - b.horizon)
    .slice(0, 4)
}

function getScore(row) {
  const combinedScore = getCanonicalCombinedRiskScore(row)

  if (combinedScore > 0) {
    return Math.round(combinedScore)
  }

  const risk = normalizeRiskLevel(row?.risk_level ?? row?.risk)

  if (risk === 'High') return 90
  if (risk === 'Moderate') return 60
  if (risk === 'Low') return 30

  return 0
}

function getAction(risk) {
  if (risk === 'High') {
    return 'Immediate barangay response is recommended. Prioritize cleanup drives, larval source reduction, household advisories, and close coordination with the City Health Office.'
  }

  if (risk === 'Moderate') {
    return 'Continue weekly monitoring, inspect possible breeding sites, prepare community reminders, and monitor the barangay for possible escalation.'
  }

  if (risk === 'Low') {
    return 'Maintain routine surveillance, sanitation reminders, household awareness, and regular reporting of possible dengue symptoms.'
  }

  return 'Run the CHO forecast process first so this barangay can receive updated monitoring recommendations.'
}

function getRiskTone(risk) {
  if (risk === 'High') {
    return {
      gradient: 'from-rose-500 via-red-500 to-orange-400',
      soft: 'from-rose-50 via-white to-orange-50 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/10',
      heroSurface: 'from-[#17070e] via-[#270a14] to-[#3b121b]',
      heroBeam: 'from-transparent via-rose-500/12 to-orange-400/18',
      heroCard: 'from-[#14060c]/95 via-[#1f0a11]/92 to-[#3a111a]/78',
      text: 'text-rose-600 dark:text-rose-300',
      border: 'border-rose-200 dark:border-rose-500/25',
      chip: 'border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/12 dark:text-rose-100',
      heroChip: 'border-rose-300/35 bg-rose-500/15 text-rose-100 shadow-[0_10px_28px_rgba(244,63,94,0.18)]',
      glow: 'bg-rose-500/[0.20]',
      accentGlow: 'bg-orange-400/[0.16]',
      status: 'Priority response required',
    }
  }

  if (risk === 'Moderate') {
    return {
      gradient: 'from-amber-400 via-orange-400 to-yellow-300',
      soft: 'from-amber-50 via-white to-yellow-50 dark:from-amber-500/10 dark:via-slate-950 dark:to-yellow-500/10',
      heroSurface: 'from-[#170e06] via-[#281507] to-[#3d2608]',
      heroBeam: 'from-transparent via-amber-400/12 to-yellow-300/18',
      heroCard: 'from-[#140b05]/95 via-[#231305]/92 to-[#3d2608]/78',
      text: 'text-amber-600 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-500/25',
      chip: 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/12 dark:text-amber-100',
      heroChip: 'border-amber-300/35 bg-amber-400/15 text-amber-100 shadow-[0_10px_28px_rgba(245,158,11,0.18)]',
      glow: 'bg-amber-500/[0.20]',
      accentGlow: 'bg-yellow-300/[0.16]',
      status: 'Active monitoring advised',
    }
  }

  if (risk === 'Low') {
    return {
      gradient: 'from-emerald-400 via-teal-400 to-cyan-300',
      soft: 'from-emerald-50 via-white to-cyan-50 dark:from-emerald-500/10 dark:via-slate-950 dark:to-cyan-500/10',
      heroSurface: 'from-[#06150f] via-[#082018] to-[#0b3529]',
      heroBeam: 'from-transparent via-emerald-400/12 to-cyan-300/18',
      heroCard: 'from-[#05130f]/95 via-[#08211a]/92 to-[#0c372b]/78',
      text: 'text-emerald-600 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-500/25',
      chip: 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/12 dark:text-emerald-100',
      heroChip: 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100 shadow-[0_10px_28px_rgba(16,185,129,0.18)]',
      glow: 'bg-emerald-500/[0.20]',
      accentGlow: 'bg-cyan-300/[0.16]',
      status: 'Routine surveillance',
    }
  }

  return {
    gradient: 'from-slate-500 via-slate-600 to-slate-700',
    soft: 'from-slate-50 via-white to-blue-50 dark:from-slate-800 dark:via-slate-950 dark:to-blue-950/40',
    heroSurface: 'from-[#08101b] via-[#0b1625] to-[#14253a]',
    heroBeam: 'from-transparent via-sky-400/10 to-blue-400/14',
    heroCard: 'from-[#08101b]/95 via-[#0b1625]/92 to-[#16283f]/80',
    text: 'text-slate-600 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    chip: 'border-slate-300/70 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
    heroChip: 'border-slate-300/25 bg-slate-400/10 text-slate-100 shadow-[0_10px_28px_rgba(100,116,139,0.16)]',
    glow: 'bg-sky-500/[0.18]',
    accentGlow: 'bg-blue-400/[0.12]',
    status: 'Waiting for forecast',
  }
}

function BarangaySelector({
  value,
  options = [],
  onChange,
}) {
  const selectorRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredOptions = useMemo(() => {
    const query = normalizeName(searchQuery)

    if (!query) return options

    return options.filter((name) => normalizeName(name).includes(query))
  }, [options, searchQuery])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!selectorRef.current?.contains(event.target)) {
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

  function selectBarangay(name) {
    onChange(name)
    setSearchQuery('')
    setIsOpen(false)
  }

  return (
    <div ref={selectorRef} className="bhw-barangay-selector relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-3 rounded-[22px] border bg-white/90 px-4 py-3.5 text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)] outline-none transition dark:bg-slate-950/[0.85] ${
          isOpen
            ? 'border-sky-400 ring-4 ring-sky-400/15 dark:border-sky-500'
            : 'border-white/80 hover:border-sky-300 hover:bg-white dark:border-slate-700 dark:hover:border-sky-500/70'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Choose barangay to view"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
            <MapPinned className="h-5 w-5" />
          </span>

          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-brand-muted dark:text-slate-500">
              Selected barangay
            </span>
            <span className="mt-0.5 block truncate text-sm font-black text-brand-text dark:text-white">
              {value || 'Choose a barangay'}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 sm:inline-flex">
            {options.length} available
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform duration-200 dark:text-slate-400 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-50 overflow-hidden rounded-[24px] border border-slate-200/90 bg-white/95 p-2 shadow-[0_28px_72px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/60 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-950/95 dark:ring-white/5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search barangay..."
              className="w-full rounded-[18px] border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-bold text-brand-text outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-400/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:bg-slate-950"
              autoFocus
              aria-label="Search barangays"
            />
          </div>

          <div className="mt-2 flex items-center justify-between px-2 py-1">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand-muted dark:text-slate-500">
              Barangay results
            </p>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500">
              {filteredOptions.length} match{filteredOptions.length === 1 ? '' : 'es'}
            </p>
          </div>

          <div
            className="bhw-barangay-scroll max-h-72 space-y-1 overflow-y-auto pr-1"
            role="listbox"
            aria-label="Available barangays"
          >
            {filteredOptions.length ? (
              filteredOptions.map((name) => {
                const isSelected = normalizeName(name) === normalizeName(value)

                return (
                  <button
                    type="button"
                    key={normalizeName(name)}
                    onClick={() => selectBarangay(name)}
                    className={`group flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left transition ${
                      isSelected
                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200'
                        : 'text-brand-text hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900'
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                          isSelected
                            ? 'bg-sky-500 text-white shadow-[0_8px_20px_rgba(14,165,233,0.28)]'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-white dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-950'
                        }`}
                      >
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate text-sm font-black">{name}</span>
                    </span>

                    {isSelected ? (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null}
                  </button>
                )
              })
            ) : (
              <div className="rounded-[18px] border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                <Search className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm font-black text-brand-text dark:text-white">
                  No barangay found
                </p>
                <p className="mt-1 text-xs font-bold text-brand-muted dark:text-slate-500">
                  Try a different spelling or shorter search.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function getMetricTheme(tone = 'blue') {
  const themes = {
    blue: {
      surface: 'border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-cyan-50/80 dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5',
      icon: 'border-blue-200 bg-white text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200',
      line: 'from-blue-600 via-cyan-400 to-sky-300',
      glow: 'bg-blue-400/20',
      meter: 'from-blue-600 to-cyan-400',
    },
    rose: {
      surface: 'border-rose-200/70 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/80 dark:border-rose-400/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/5',
      icon: 'border-rose-200 bg-white text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
      line: 'from-rose-600 via-orange-400 to-amber-300',
      glow: 'bg-rose-400/20',
      meter: 'from-rose-600 to-orange-400',
    },
    amber: {
      surface: 'border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/80 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/5',
      icon: 'border-amber-200 bg-white text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
      line: 'from-amber-600 via-orange-400 to-yellow-300',
      glow: 'bg-amber-400/20',
      meter: 'from-amber-600 to-orange-400',
    },
    emerald: {
      surface: 'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/80 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5',
      icon: 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
      line: 'from-emerald-600 via-teal-400 to-cyan-300',
      glow: 'bg-emerald-400/20',
      meter: 'from-emerald-600 to-teal-400',
    },
    sky: {
      surface: 'border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white to-blue-50/80 dark:border-sky-400/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-blue-500/5',
      icon: 'border-sky-200 bg-white text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200',
      line: 'from-sky-600 via-blue-400 to-cyan-300',
      glow: 'bg-sky-400/20',
      meter: 'from-sky-600 to-blue-400',
    },
  }

  return themes[tone] || themes.blue
}

function MetricCard({ icon: Icon, label, value, helper, tone = 'blue', informationType = '' }) {
  const theme = getMetricTheme(tone)

  return (
    <article className={`bhw-summary-metric-card group relative min-h-[176px] overflow-hidden rounded-[30px] border p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/75 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_68px_rgba(15,23,42,0.15)] dark:ring-white/5 ${theme.surface}`}>
      <div className={`pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-125 ${theme.glow}`} />
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.line}`} />
      <div className="pointer-events-none absolute right-5 top-5 h-20 w-20 rounded-full border border-white/70 opacity-60 dark:border-white/5" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${theme.icon}`}>
            <Icon className="h-5 w-5" strokeWidth={2.25} />
          </div>

          {informationType ? (
            <InformationTypeBadge type={informationType} />
          ) : (
            <span className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
              Live
            </span>
          )}
        </div>

        <p className="bhw-summary-metric-label mt-4 text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">{label}</p>
        <p className="bhw-summary-metric-value mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950 dark:text-white">{value}</p>

        <div className="mt-auto pt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-slate-800">
            <div className={`h-full w-[72%] rounded-full bg-gradient-to-r ${theme.meter}`} />
          </div>
          <p className="bhw-summary-metric-helper mt-3 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-400">{helper}</p>
        </div>
      </div>
    </article>
  )
}

function PremiumPanel({ children, tone = 'blue', className = '' }) {
  const theme = getMetricTheme(tone)

  return (
    <section className={`group relative overflow-hidden rounded-[34px] border bg-gradient-to-br from-white/95 via-white/90 to-slate-50/[0.85] shadow-[0_22px_68px_rgba(15,23,42,0.08)] ring-1 ring-white/80 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_30px_82px_rgba(15,23,42,0.12)] dark:from-slate-950/95 dark:via-slate-950/90 dark:to-slate-900/80 dark:border-slate-800/80 dark:ring-white/5 ${theme.surface.split(' ')[0]} ${className}`}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.line}`} />
      <div className={`pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-110 ${theme.glow}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.08),transparent_28%)] opacity-70 dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.08),transparent_28%)] dark:opacity-90" />
      <div className="relative z-[1]">{children}</div>
    </section>
  )
}

function SectionBadge({ icon: Icon, children, tone = 'blue' }) {
  const theme = getMetricTheme(tone)

  return (
    <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] shadow-sm ${theme.icon}`}>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  )
}

function BHWPageStyles() {
  return (
    <style>{`

        .bhw-barangay-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(14, 165, 233, 0.55) transparent;
          overscroll-behavior: contain;
        }

        .bhw-barangay-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .bhw-barangay-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .bhw-barangay-scroll::-webkit-scrollbar-thumb {
          border: 2px solid transparent;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(56, 189, 248, 0.8), rgba(14, 165, 233, 0.5));
          background-clip: padding-box;
        }

        .bhw-barangay-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(14, 165, 233, 0.95), rgba(2, 132, 199, 0.75));
          background-clip: padding-box;
        }

        @media (max-width: 639px) {
          .bhw-barangay-scroll::-webkit-scrollbar { width: 6px; }

          .bhw-mobile-compact,
          .bhw-mobile-compact * {
            min-width: 0;
          }

          .bhw-mobile-compact {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            padding-bottom: 1.25rem !important;
          }

          .bhw-mobile-compact.space-y-6 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.82rem !important;
          }

          .bhw-mobile-compact section,
          .bhw-mobile-compact .rounded-\[34px\],
          .bhw-mobile-compact .rounded-\[38px\],
          .bhw-mobile-compact .rounded-\[30px\] {
            max-width: 100% !important;
            overflow: hidden !important;
            border-radius: 20px !important;
          }

          .bhw-mobile-compact > section:first-of-type {
            padding: 0.85rem !important;
            border-radius: 22px !important;
          }

          .bhw-mobile-compact > section:first-of-type > .absolute,
          .bhw-mobile-compact .pointer-events-none.absolute {
            opacity: 0.65 !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.75rem !important;
          }

          .bhw-mobile-compact .inline-flex.items-center.gap-2.rounded-full,
          .bhw-mobile-compact .rounded-full.border {
            padding: 0.32rem 0.55rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.05 !important;
            letter-spacing: 0.075em !important;
          }

          .bhw-mobile-compact h1 {
            margin-top: 0.75rem !important;
            font-size: 1.45rem !important;
            line-height: 1.05 !important;
            letter-spacing: -0.045em !important;
          }

          .bhw-mobile-compact h2,
          .bhw-mobile-compact .text-xl.font-black,
          .bhw-mobile-compact .text-lg.font-black {
            font-size: 0.98rem !important;
            line-height: 1.12 !important;
            letter-spacing: -0.025em !important;
          }

          .bhw-mobile-compact h3 {
            font-size: 0.95rem !important;
            line-height: 1.12 !important;
          }

          .bhw-mobile-compact p {
            font-size: 0.8125rem !important;
            line-height: 1.28 !important;
          }

          .bhw-mobile-compact .text-sm { font-size: 0.875rem !important; line-height: 1.28 !important; }
          .bhw-mobile-compact .text-xs { font-size: 0.8125rem !important; line-height: 1.18 !important; }
          .bhw-mobile-compact .text-2xl { font-size: 1.08rem !important; line-height: 1.05 !important; }
          .bhw-mobile-compact .text-3xl { font-size: 1.25rem !important; line-height: 1.05 !important; }
          .bhw-mobile-compact .text-4xl { font-size: 1.65rem !important; line-height: 1.05 !important; }

          .bhw-mobile-compact h1 + p,
          .bhw-mobile-compact section:first-of-type p.leading-7 {
            margin-top: 0.5rem !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .bhw-mobile-grid-3 {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 0.45rem !important;
          }

          .bhw-mobile-grid-4 {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .bhw-mobile-grid-3 > *,
          .bhw-mobile-grid-4 > * {
            min-width: 0 !important;
            max-width: 100% !important;
            overflow: hidden !important;
          }

          .bhw-mobile-grid-3 > div,
          .bhw-mobile-grid-4 > div,
          .bhw-mobile-grid-3 > a,
          .bhw-mobile-grid-4 > a {
            border-radius: 15px !important;
            padding: 0.52rem !important;
            min-height: 72px !important;
          }

          .bhw-mobile-grid-3 p:first-child,
          .bhw-mobile-grid-4 p:first-child {
            font-size: 0.8125rem !important;
            line-height: 1.08 !important;
            letter-spacing: 0.055em !important;
          }

          .bhw-mobile-grid-3 p:nth-child(2),
          .bhw-mobile-grid-4 p:nth-child(2),
          .bhw-mobile-grid-4 .text-3xl {
            margin-top: 0.3rem !important;
            font-size: 0.98rem !important;
            line-height: 1.05 !important;
          }

          .bhw-mobile-grid-3 p:last-child,
          .bhw-mobile-grid-4 p:last-child {
            font-size: 0.8125rem !important;
            line-height: 1.16 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] {
            display: grid !important;
            grid-template-columns: auto minmax(0, 1fr) !important;
            align-items: center !important;
            gap: 0.75rem !important;
            text-align: left !important;
            padding: 0.72rem !important;
            border-radius: 18px !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.mx-auto.flex.h-24.w-24 {
            margin: 0 !important;
            height: 3.4rem !important;
            width: 3.4rem !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.mx-auto.flex.h-24.w-24 svg {
            height: 1.55rem !important;
            width: 1.55rem !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] .mt-4,
          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] .mt-2,
          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] .mt-1 {
            margin-top: 0.28rem !important;
          }

          .bhw-mobile-compact > section:first-of-type .relative.overflow-hidden.rounded-\[34px\] .overflow-hidden.rounded-full {
            grid-column: 1 / -1 !important;
            height: 0.45rem !important;
            margin-top: 0.2rem !important;
          }

          .bhw-mobile-compact .group.relative.overflow-hidden.rounded-\[30px\] {
            border-radius: 16px !important;
            padding: 0.6rem !important;
            min-height: 96px !important;
          }

          .bhw-mobile-compact .group.relative.overflow-hidden.rounded-\[30px\] .relative.flex {
            gap: 0.5rem !important;
          }

          .bhw-mobile-compact .group.relative.overflow-hidden.rounded-\[30px\] .h-12.w-12 {
            height: 2rem !important;
            width: 2rem !important;
            border-radius: 12px !important;
          }

          .bhw-mobile-compact .group.relative.overflow-hidden.rounded-\[30px\] svg {
            height: 0.95rem !important;
            width: 0.95rem !important;
          }

          .bhw-mobile-compact section.grid.gap-5,
          .bhw-mobile-compact section.grid.gap-4,
          .bhw-mobile-compact .grid.gap-5,
          .bhw-mobile-compact .grid.gap-4 {
            gap: 0.75rem !important;
          }

          .bhw-mobile-compact .relative.overflow-hidden.rounded-\[34px\],
          .bhw-mobile-compact .rounded-\[34px\].border {
            padding: 0.75rem !important;
            border-radius: 20px !important;
          }

          .bhw-mobile-compact .flex.h-12.w-12,
          .bhw-mobile-compact .flex.h-10.w-10 {
            height: 2rem !important;
            width: 2rem !important;
            border-radius: 12px !important;
          }

          .bhw-mobile-compact .flex.h-12.w-12 svg,
          .bhw-mobile-compact .flex.h-10.w-10 svg,
          .bhw-mobile-compact svg.h-7.w-7,
          .bhw-mobile-compact svg.h-5.w-5 {
            height: 0.95rem !important;
            width: 0.95rem !important;
          }

          .bhw-mobile-compact .relative.mt-5.rounded-\[28px\] {
            margin-top: 0.65rem !important;
            border-radius: 16px !important;
            padding: 0.65rem !important;
          }

          .bhw-mobile-compact .relative.mt-5.space-y-3 > :not([hidden]) ~ :not([hidden]),
          .bhw-mobile-compact .mt-5.space-y-3 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.45rem !important;
          }

          .bhw-mobile-compact .relative.mt-5.space-y-3 .rounded-\[24px\],
          .bhw-mobile-compact .mt-5.space-y-3 .rounded-\[22px\] {
            border-radius: 15px !important;
            padding: 0.55rem !important;
          }

          .bhw-mobile-compact .relative.mt-5.space-y-3 .rounded-\[24px\] .mt-3 {
            margin-top: 0.45rem !important;
          }

          .bhw-mobile-compact .rounded-\[24px\],
          .bhw-mobile-compact .rounded-\[22px\] {
            border-radius: 15px !important;
          }

          .bhw-mobile-compact .mt-6 { margin-top: 0.8rem !important; }
          .bhw-mobile-compact .mt-5 { margin-top: 0.68rem !important; }
          .bhw-mobile-compact .mt-4 { margin-top: 0.55rem !important; }
          .bhw-mobile-compact .mt-3 { margin-top: 0.45rem !important; }
          .bhw-mobile-compact .mb-4 { margin-bottom: 0.55rem !important; }
          .bhw-mobile-compact .mb-3 { margin-bottom: 0.45rem !important; }

          .bhw-mobile-compact .p-6,
          .bhw-mobile-compact .p-5,
          .bhw-mobile-compact .p-4 {
            padding: 0.65rem !important;
          }

          .bhw-mobile-compact .px-4.py-3,
          .bhw-mobile-compact .px-4.py-3\.5 {
            padding: 0.55rem 0.65rem !important;
          }

          .bhw-mobile-compact a.group.relative.overflow-hidden {
            min-height: 92px !important;
          }

          .bhw-mobile-compact a.group.relative.overflow-hidden h3,
          .bhw-mobile-compact .bhw-mobile-grid-3 h3 {
            font-size: 0.8125rem !important;
            line-height: 1.1 !important;
          }

          .bhw-mobile-compact a.group.relative.overflow-hidden p,
          .bhw-mobile-compact .bhw-mobile-grid-3 p {
            font-size: 0.8125rem !important;
            line-height: 1.16 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden !important;
          }

          .bhw-mobile-compact a.group.relative.overflow-hidden .absolute.right-5.top-5 {
            right: 0.55rem !important;
            top: 0.55rem !important;
          }

          .bhw-mobile-compact .bhw-risk-shield {
            height: 3.7rem !important;
            width: 3.7rem !important;
            border-radius: 18px !important;
          }

          .bhw-mobile-compact .bhw-risk-shield svg {
            height: 1.8rem !important;
            width: 1.8rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-map {
            height: 19rem !important;
            min-height: 19rem !important;
            padding: 0.35rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-map .bhw-boundary-svg {
            height: 100% !important;
            min-height: 18.3rem !important;
            width: 100% !important;
          }

          .bhw-mobile-compact .truncate,
          .bhw-mobile-compact p,
          .bhw-mobile-compact span,
          .bhw-mobile-compact h1,
          .bhw-mobile-compact h2,
          .bhw-mobile-compact h3 {
            overflow-wrap: break-word !important;
          }
        }


      .bhw-premium-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(14, 165, 233, 0.55) transparent;
      }

      .bhw-premium-scrollbar::-webkit-scrollbar {
        width: 8px;
      }

      .bhw-premium-scrollbar::-webkit-scrollbar-thumb {
        border: 2px solid transparent;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(56, 189, 248, 0.85), rgba(14, 165, 233, 0.48));
        background-clip: padding-box;
      }

        /* =========================================================
           FINAL BHW RESPONSIVE STABILIZATION
           Keeps desktop styling and workflow logic unchanged.
           ========================================================= */
        @media (max-width: 639px) {
          .bhw-mobile-compact {
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
            border-radius: 22px !important;
            padding-bottom: 1rem !important;
          }

          /* HERO */
          .bhw-mobile-compact .bhw-premium-hero {
            min-height: 0 !important;
            border-radius: 24px !important;
          }

          .bhw-mobile-compact .bhw-hero-layout {
            min-height: 0 !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 1rem !important;
            padding: 1rem !important;
          }

          .bhw-mobile-compact .bhw-premium-hero h1 {
            margin-top: 1rem !important;
            max-width: 100% !important;
            font-size: 1.9rem !important;
            line-height: 1.04 !important;
            letter-spacing: -0.045em !important;
          }

          .bhw-mobile-compact .bhw-premium-hero h1 + p {
            display: block !important;
            margin-top: 0.75rem !important;
            overflow: visible !important;
            -webkit-line-clamp: unset !important;
            font-size: 0.8125rem !important;
            line-height: 1.5 !important;
          }

          .bhw-mobile-compact .bhw-selector-shell {
            margin-top: 1rem !important;
            max-width: 100% !important;
            border-radius: 18px !important;
            padding: 0.7rem !important;
          }

          /* Searchable barangay selector */
          .bhw-mobile-compact .bhw-barangay-selector > button {
            min-height: 52px !important;
            border-radius: 16px !important;
            padding: 0.65rem 0.75rem !important;
          }

          .bhw-mobile-compact .bhw-barangay-selector > button .h-10.w-10 {
            width: 2.25rem !important;
            height: 2.25rem !important;
            border-radius: 12px !important;
          }

          .bhw-mobile-compact .bhw-barangay-selector > button .block.text-\[10px\] {
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
          }

          .bhw-mobile-compact .bhw-barangay-selector > button .text-sm {
            font-size: 0.8125rem !important;
            line-height: 1.25 !important;
          }

          .bhw-mobile-compact .bhw-barangay-selector > div.absolute {
            max-height: min(60dvh, 24rem) !important;
            border-radius: 18px !important;
            padding: 0.5rem !important;
          }

          .bhw-mobile-compact .bhw-barangay-scroll {
            max-height: min(46dvh, 18rem) !important;
          }

          /* Hero metrics: 2 + 1, not three cramped cards */
          .bhw-mobile-compact .bhw-hero-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.55rem !important;
            margin-top: 1rem !important;
          }

          .bhw-mobile-compact .bhw-hero-metrics > div {
            min-width: 0 !important;
            min-height: 98px !important;
            border-radius: 17px !important;
            padding: 0.7rem !important;
          }

          .bhw-mobile-compact .bhw-hero-metrics > div:nth-child(3) {
            grid-column: 1 / -1 !important;
          }

          .bhw-mobile-compact .bhw-hero-metrics span {
            font-size: 0.8125rem !important;
            line-height: 1.15 !important;
            letter-spacing: 0.06em !important;
          }

          .bhw-mobile-compact .bhw-hero-metrics p:nth-child(2) {
            margin-top: 0.45rem !important;
            font-size: 1.2rem !important;
            line-height: 1.05 !important;
          }

          .bhw-mobile-compact .bhw-hero-metrics p:last-child {
            display: block !important;
            margin-top: 0.35rem !important;
            overflow: visible !important;
            -webkit-line-clamp: unset !important;
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
          }

          /* Risk hero card */
          .bhw-mobile-compact .bhw-hero-risk-wrap > div {
            border-radius: 20px !important;
            padding: 0.85rem !important;
          }

          .bhw-mobile-compact .bhw-hero-risk-wrap .relative.grid.grid-cols-\[minmax\(0\,1fr\)_auto\] {
            gap: 0.75rem !important;
          }

          .bhw-mobile-compact .bhw-risk-shield {
            width: 4.25rem !important;
            height: 4.25rem !important;
            border-radius: 20px !important;
          }

          .bhw-mobile-compact .bhw-risk-shield svg {
            width: 2rem !important;
            height: 2rem !important;
          }

          .bhw-mobile-compact .bhw-hero-risk-wrap .h-24.w-24 {
            width: 4.75rem !important;
            height: 4.75rem !important;
          }

          .bhw-mobile-compact .bhw-hero-risk-wrap h2 {
            font-size: 1.55rem !important;
            line-height: 1.05 !important;
          }

          .bhw-mobile-compact .bhw-hero-risk-wrap .relative.mt-5.grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .bhw-mobile-compact .bhw-hero-risk-wrap .relative.mt-5.grid > div {
            min-width: 0 !important;
            padding: 0.65rem !important;
          }

          .bhw-mobile-compact .bhw-hero-risk-wrap .relative.mt-5.grid p {
            overflow-wrap: break-word !important;
          }

          .bhw-mobile-compact .bhw-hero-risk-wrap a {
            min-height: 48px !important;
            margin-top: 0.8rem !important;
          }

          /* Four summary cards stay 2 x 2 */
          .bhw-mobile-compact .bhw-summary-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.6rem !important;
          }

          .bhw-mobile-compact .bhw-summary-metrics article {
            min-width: 0 !important;
            min-height: 150px !important;
            border-radius: 20px !important;
            padding: 0.8rem !important;
          }

          .bhw-mobile-compact .bhw-summary-metrics article .h-12.w-12 {
            width: 2.15rem !important;
            height: 2.15rem !important;
            border-radius: 13px !important;
          }

          .bhw-mobile-compact .bhw-summary-metrics article .text-3xl {
            font-size: 1.2rem !important;
          }

          .bhw-mobile-compact .bhw-summary-metrics article p:last-child {
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
          }

          /* Boundary workspace */
          .bhw-mobile-compact .bhw-boundary-panel {
            border-radius: 20px !important;
            padding: 0.8rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-panel > .flex:first-child {
            gap: 0.7rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-panel h2 {
            font-size: 1.25rem !important;
            line-height: 1.15 !important;
          }

          .bhw-mobile-compact .bhw-boundary-panel h2 + p {
            font-size: 0.8125rem !important;
            line-height: 1.45 !important;
          }

          .bhw-mobile-compact .bhw-boundary-map {
            height: clamp(320px, 48dvh, 420px) !important;
            min-height: 320px !important;
            border-radius: 18px !important;
            padding: 0.35rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-map > .relative.h-full {
            border-radius: 15px !important;
          }

          /* Top HUD: keep one readable label on phone */
          .bhw-mobile-compact .bhw-boundary-map .absolute.inset-x-4.top-3 {
            left: 0.55rem !important;
            right: 0.55rem !important;
            min-height: 36px !important;
            justify-content: center !important;
            padding: 0.45rem 0.65rem !important;
            font-size: 0.8125rem !important;
            letter-spacing: 0.08em !important;
            text-align: center !important;
          }

          .bhw-mobile-compact .bhw-boundary-map .absolute.inset-x-4.top-3 > span:last-child {
            display: none !important;
          }

          .bhw-mobile-compact .bhw-boundary-svg > .absolute.left-5 {
            left: 0.65rem !important;
            top: 3.8rem !important;
            padding: 0.35rem 0.55rem !important;
            font-size: 0.8125rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-svg > .absolute.inset-x-0.bottom-0 {
            padding: 2rem 0.75rem 0.75rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-svg > .absolute.inset-x-0.bottom-0 p:first-child {
            font-size: 0.8125rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-svg > .absolute.inset-x-0.bottom-0 p:last-child {
            font-size: 1rem !important;
            line-height: 1.15 !important;
          }

          .bhw-mobile-compact .bhw-boundary-side {
            gap: 0.55rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-side > div,
          .bhw-mobile-compact .bhw-boundary-side > a {
            border-radius: 16px !important;
          }

          .bhw-mobile-compact .bhw-boundary-side > .grid.grid-cols-2 {
            gap: 0.5rem !important;
          }

          .bhw-mobile-compact .bhw-boundary-side > .grid.grid-cols-2 > div {
            min-width: 0 !important;
            padding: 0.65rem !important;
          }

          /* Recommended today: full-width list, not 3 tiny columns */
          .bhw-mobile-compact .bhw-recommended-actions {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.55rem !important;
          }

          .bhw-mobile-compact .bhw-recommended-actions > div {
            min-height: 92px !important;
            border-radius: 17px !important;
            padding: 0.75rem !important;
          }

          .bhw-mobile-compact .bhw-recommended-actions > div .h-11.w-11 {
            width: 2.25rem !important;
            height: 2.25rem !important;
            border-radius: 12px !important;
          }

          .bhw-mobile-compact .bhw-recommended-actions > div p {
            margin-top: 0.65rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.35 !important;
          }

          /* Forecast timeline */
          .bhw-mobile-compact .bhw-forecast-timeline > div {
            border-radius: 17px !important;
            padding: 0.75rem !important;
          }

          .bhw-mobile-compact .bhw-forecast-timeline .flex.items-center.gap-3 {
            align-items: flex-start !important;
          }

          .bhw-mobile-compact .bhw-forecast-timeline .h-10.w-10 {
            width: 2.25rem !important;
            height: 2.25rem !important;
            border-radius: 12px !important;
          }

          .bhw-mobile-compact .bhw-forecast-timeline .flex.items-center.justify-between.gap-3.text-sm {
            align-items: flex-start !important;
            flex-direction: column !important;
            gap: 0.15rem !important;
          }

          .bhw-mobile-compact .bhw-forecast-timeline .flex.items-center.justify-between.gap-3.text-sm > span:first-child {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
          }

          .bhw-mobile-compact .bhw-forecast-timeline .flex.items-center.justify-between.gap-3.text-sm > span:last-child {
            font-size: 0.8125rem !important;
          }

          /* Field update/checklist */
          .bhw-mobile-compact .bhw-field-update-panel {
            border-radius: 20px !important;
            padding: 0.8rem !important;
          }

          .bhw-mobile-compact .bhw-field-update-panel h2 {
            font-size: 1.25rem !important;
            line-height: 1.15 !important;
          }

          .bhw-mobile-compact .bhw-field-update-panel .mt-4.space-y-3 > button {
            min-height: 64px !important;
            border-radius: 16px !important;
            padding: 0.7rem !important;
            gap: 0.6rem !important;
          }

          .bhw-mobile-compact .bhw-field-update-panel .mt-4.space-y-3 > button .h-11.w-11 {
            width: 2.25rem !important;
            height: 2.25rem !important;
            border-radius: 12px !important;
          }

          .bhw-mobile-compact .bhw-field-update-panel .mt-4.space-y-3 > button .h-8.w-8 {
            width: 1.8rem !important;
            height: 1.8rem !important;
          }

          .bhw-mobile-compact .bhw-field-update-panel textarea {
            min-height: 120px !important;
            border-radius: 16px !important;
            font-size: 0.8125rem !important;
            line-height: 1.45 !important;
          }

          /* Escalation remains 2 columns on normal phones */
          .bhw-mobile-compact .bhw-escalation-panel {
            border-radius: 16px !important;
            padding: 0.75rem !important;
          }

          .bhw-mobile-compact .bhw-escalation-panel .mt-3.grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important;
          }

          .bhw-mobile-compact .bhw-escalation-panel label {
            min-width: 0 !important;
            min-height: 54px !important;
            align-items: flex-start !important;
            border-radius: 13px !important;
            padding: 0.65rem !important;
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
          }

          .bhw-mobile-compact .bhw-submit-actions {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.55rem !important;
          }

          .bhw-mobile-compact .bhw-submit-actions > * {
            width: 100% !important;
            min-height: 50px !important;
            border-radius: 15px !important;
            font-size: 0.8125rem !important;
          }

          /* Bottom support links */
          .bhw-mobile-compact .bhw-support-links {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.6rem !important;
          }

          .bhw-mobile-compact .bhw-support-links > * {
            min-height: 118px !important;
            border-radius: 18px !important;
            padding: 0.8rem !important;
          }

          /* Restore readable body type after the earlier broad shrinking rules */
          .bhw-mobile-compact p {
            font-size: 0.8125rem !important;
            line-height: 1.45 !important;
          }

          .bhw-mobile-compact .text-base {
            font-size: 0.875rem !important;
            line-height: 1.45 !important;
          }

          .bhw-mobile-compact .text-sm {
            font-size: 0.8125rem !important;
            line-height: 1.4 !important;
          }

          .bhw-mobile-compact .text-xs {
            font-size: 0.8125rem !important;
            line-height: 1.35 !important;
          }

          .bhw-mobile-compact .text-\[11px\] {
            font-size: 0.8125rem !important;
            line-height: 1.3 !important;
          }

          .bhw-mobile-compact .text-\[10px\] {
            font-size: 0.8125rem !important;
            line-height: 1.22 !important;
          }
        }

        /* Very small phones: reduce density further before content becomes cramped */
        @media (max-width: 374px) {
          .bhw-mobile-compact .bhw-hero-metrics {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .bhw-mobile-compact .bhw-hero-metrics > div:nth-child(3) {
            grid-column: auto !important;
          }

          .bhw-mobile-compact .bhw-summary-metrics {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .bhw-mobile-compact .bhw-escalation-panel .mt-3.grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .bhw-mobile-compact .bhw-boundary-side > .grid.grid-cols-2 {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }

        /* Tablets: keep stacked composition until the existing desktop breakpoints */
        @media (min-width: 640px) and (max-width: 1023px) {
          .bhw-mobile-compact .bhw-hero-layout {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .bhw-mobile-compact .bhw-boundary-map {
            height: 560px !important;
          }
        }

    `}</style>
  )
}

export default function BHWPage() {
  const {
    riskRows = [],
    backendForecastResult,
    boundaryRecords = [],
    loadLatestSavedBoundaryGeoJson,
  } = useData()

  const boundaryLoadRequestedRef = useRef(false)

  useEffect(() => {
    if (boundaryRecords.length > 0 || boundaryLoadRequestedRef.current) return
    boundaryLoadRequestedRef.current = true
    Promise.resolve(loadLatestSavedBoundaryGeoJson?.({ silent: true })).finally(() => {
      if (!boundaryRecords.length) boundaryLoadRequestedRef.current = false
    })
  }, [boundaryRecords.length])

  const session = getAuthSession()
  const currentRole = session?.role || 'viewer'
  const assignedBarangay = session?.assignedBarangay || 'Baan KM 3'
  const canSelectBarangay = currentRole === 'admin' || currentRole === 'cho'
  const [trendBarangays, setTrendBarangays] = useState([])

  useEffect(() => {
    if (!['bhw', 'cho', 'admin'].includes(currentRole)) return undefined

    const unsubscribe = subscribeWorkflowRealtime({
      onEvent: (event) => {
        if (event?.topic === 'decision_actions') {
          window.dispatchEvent(new CustomEvent('dengue-decision-actions-changed', { detail: event }))
        }
        if (event?.topic === 'field_updates') {
          window.dispatchEvent(new CustomEvent('dengue-field-updates-changed', { detail: event }))
        }
      },
    })

    return unsubscribe
  }, [currentRole])

  useEffect(() => {
    if (!canSelectBarangay) {
      setTrendBarangays([])
      return undefined
    }

    let active = true

    getTrendAnalyticsBarangays()
      .then((result) => {
        if (!active) return
        const names = (result?.barangays || [])
          .map((item) => String(item?.barangay || '').trim())
          .filter(Boolean)
        setTrendBarangays(names)
      })
      .catch(() => {
        if (active) setTrendBarangays([])
      })

    return () => {
      active = false
    }
  }, [canSelectBarangay])

  const savedForecastRows = useMemo(() => (
    Array.isArray(backendForecastResult?.forecast_results)
      ? backendForecastResult.forecast_results
      : []
  ), [backendForecastResult])

  const forecastRows = useMemo(() => (
    backendForecastResult?.forecast_rows ||
    backendForecastResult?.predictions ||
    backendForecastResult?.forecastRows ||
    []
  ), [backendForecastResult])

  const forecastCycle = useMemo(() => {
    const forecastRun = backendForecastResult?.forecast_run || {}
    const firstForecastRow = Array.isArray(backendForecastResult?.forecast_results)
      ? backendForecastResult.forecast_results[0]
      : null

    return {
      id: String(
        backendForecastResult?.database_forecast_run_id ||
          forecastRun?.forecast_run_id ||
          backendForecastResult?.forecast_run_id ||
          ''
      ),
      startedAt:
        forecastRun?.completed_at ||
        forecastRun?.started_at ||
        backendForecastResult?.generated_at ||
        backendForecastResult?.updated_at ||
        firstForecastRow?.created_at ||
        '',
    }
  }, [backendForecastResult])

  const availableBarangays = useMemo(() => {
    const namesByKey = new Map()

    ;[...riskRows, ...savedForecastRows, ...forecastRows].forEach((row) => {
      const name = String(row?.barangay || '').trim()
      const key = normalizeName(name)

      if (name && key && !namesByKey.has(key)) {
        namesByKey.set(key, name)
      }
    })

    trendBarangays.forEach((nameValue) => {
      const name = String(nameValue || '').trim()
      const key = normalizeName(name)

      if (name && key && !namesByKey.has(key)) {
        namesByKey.set(key, name)
      }
    })

    if (assignedBarangay) {
      const assignedKey = normalizeName(assignedBarangay)

      if (assignedKey && !namesByKey.has(assignedKey)) {
        namesByKey.set(assignedKey, assignedBarangay)
      }
    }

    return [...namesByKey.values()].sort((a, b) => a.localeCompare(b))
  }, [assignedBarangay, forecastRows, riskRows, savedForecastRows, trendBarangays])

  const [selectedBarangay, setSelectedBarangay] = useState(() => {
    if (!canSelectBarangay) return assignedBarangay

    try {
      return localStorage.getItem('dengue-bhw-view-barangay') || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    if (!canSelectBarangay) {
      if (selectedBarangay !== assignedBarangay) {
        setSelectedBarangay(assignedBarangay)
      }
      return
    }

    const selectedExists = availableBarangays.some(
      (name) => normalizeName(name) === normalizeName(selectedBarangay)
    )

    if (!selectedExists && availableBarangays.length) {
      setSelectedBarangay(availableBarangays[0])
    }
  }, [assignedBarangay, availableBarangays, canSelectBarangay, selectedBarangay])

  useEffect(() => {
    if (!canSelectBarangay || !selectedBarangay) return

    try {
      localStorage.setItem('dengue-bhw-view-barangay', selectedBarangay)
    } catch {
      // The selector still works when browser storage is unavailable.
    }
  }, [canSelectBarangay, selectedBarangay])

  const activeBarangay = canSelectBarangay
    ? selectedBarangay || availableBarangays[0] || ''
    : assignedBarangay

  const [trendAnalytics, setTrendAnalytics] = useState(null)
  const [trendYear, setTrendYear] = useState('')
  const [trendPeriod, setTrendPeriod] = useState('all')
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState('')

  useEffect(() => {
    if (!activeBarangay) {
      setTrendAnalytics(null)
      setTrendError('')
      return undefined
    }

    let active = true
    const { quarter, month } = getTrendPeriodParams(trendPeriod)

    setTrendLoading(true)
    setTrendError('')

    getBarangayTrendAnalytics({
      barangay: activeBarangay,
      year: trendYear ? Number(trendYear) : null,
      quarter,
      month,
    })
      .then((result) => {
        if (!active) return
        setTrendAnalytics(result)

        const resolvedYear = result?.filters?.year
        if (trendYear && resolvedYear && String(resolvedYear) !== String(trendYear)) {
          setTrendYear(String(resolvedYear))
        }
      })
      .catch((error) => {
        if (!active) return
        const message = String(error?.message || '').toLowerCase()
        setTrendAnalytics(null)
        setTrendError(
          message.includes('authentication') || message.includes('token')
            ? 'Your session has expired. Please sign in again to refresh the recorded dengue trend.'
            : message.includes('fetch') || message.includes('network') || message.includes('backend')
              ? 'The recorded dengue trend could not be reached. Check that the backend is running, then try again.'
              : 'The recorded dengue trend could not be loaded. Please try again.'
        )
      })
      .finally(() => {
        if (active) setTrendLoading(false)
      })

    return () => {
      active = false
    }
  }, [activeBarangay, trendPeriod, trendYear])

  const barangayRisk = useMemo(() => {
    const activeKey = normalizeName(activeBarangay)

    if (!activeKey) return null

    const savedRow =
      savedForecastRows.find((row) => normalizeName(row?.barangay) === activeKey) ||
      null

    const localRow =
      riskRows.find((row) => normalizeName(row?.barangay) === activeKey) ||
      null

    if (savedRow && localRow) {
      const savedRisk = normalizeRiskLevel(
        savedRow?.risk_level ?? savedRow?.risk,
        normalizeRiskLevel(localRow?.risk_level ?? localRow?.risk)
      )

      return {
        ...localRow,
        ...savedRow,
        risk: savedRisk,
        risk_level: savedRisk,
      }
    }

    return savedRow || localRow
  }, [activeBarangay, riskRows, savedForecastRows])

  const rankedBarangays = useMemo(() => {
    const rowsByBarangay = new Map()

    riskRows.forEach((row) => {
      const name = String(row?.barangay || '').trim()
      const key = normalizeName(name)
      if (!key) return
      rowsByBarangay.set(key, { ...row, barangay: name || row?.barangay })
    })

    savedForecastRows.forEach((row) => {
      const name = String(row?.barangay || '').trim()
      const key = normalizeName(name)
      if (!key) return
      rowsByBarangay.set(key, { ...(rowsByBarangay.get(key) || {}), ...row, barangay: name || row?.barangay })
    })

    return [...rowsByBarangay.values()].sort(compareCanonicalBarangayPriority)
  }, [riskRows, savedForecastRows])

  const activeBarangayPriorityIndex = rankedBarangays.findIndex(
    (row) => normalizeName(row?.barangay) === normalizeName(activeBarangay)
  )

  // The backend calculates priority_rank before BHW results are scoped to the
  // worker's assigned barangay. Prefer that persisted citywide rank so a BHW
  // account shows the same value as CHO/Admin instead of re-ranking a one-row
  // list as "1 of 1".
  const persistedCitywidePriorityRank = Number(
    barangayRisk?.priority_rank ?? barangayRisk?.priorityRank ?? 0
  )
  const citywidePriorityRank = persistedCitywidePriorityRank > 0
    ? persistedCitywidePriorityRank
    : activeBarangayPriorityIndex >= 0
      ? activeBarangayPriorityIndex + 1
      : null

  const persistedCitywidePriorityTotal = Number(
    backendForecastResult?.total_barangay_count ??
      backendForecastResult?.city_summary?.barangay_count ??
      backendForecastResult?.barangay_count ??
      0
  )
  const citywidePriorityTotal = persistedCitywidePriorityTotal > 0
    ? persistedCitywidePriorityTotal
    : rankedBarangays.length

  const barangayName = barangayRisk?.barangay || activeBarangay || 'Select a barangay'
  const risk = normalizeRiskLevel(
    barangayRisk?.risk_level ?? barangayRisk?.risk,
    barangayRisk ? 'Low' : 'Pending'
  )
  const tone = getRiskTone(risk)
  const score = getScore(barangayRisk)
  const predictedCases = getCases(barangayRisk)
  const scorePercent = Math.min(100, Math.max(0, score))

  const trendSummary = trendAnalytics?.summary || {}
  const trendMonthlyRows = Array.isArray(trendAnalytics?.monthly) ? trendAnalytics.monthly : []
  const trendAvailableYears = Array.isArray(trendAnalytics?.filters?.available_years)
    ? trendAnalytics.filters.available_years
    : []
  const activeTrendYear = String(trendYear || trendAnalytics?.filters?.year || '')
  const trendScopeLabel = trendAnalytics?.filters?.scope_label || activeTrendYear || 'Selected period'
  const trendHighestMonthLabel = String(trendPeriod).startsWith('m')
    ? 'Selected month'
    : `Highest month in ${trendScopeLabel}`
  const trendTotalCases = trendSummary?.total_cases
  const trendPeakMonth = trendSummary?.peak_month || null
  const trendLowestMonth = trendSummary?.lowest_month || null
  const trendDirection = trendSummary?.trend_direction || 'No comparison'
  const trendMovementTone = trendDirection === 'Increasing' ? 'rose' : trendDirection === 'Decreasing' ? 'emerald' : 'slate'
  const TrendMovementIcon = trendDirection === 'Increasing' ? TrendingUp : trendDirection === 'Decreasing' ? TrendingDown : Activity
  const trendHistoricalPeak = trendAnalytics?.historical_peak || null
  const trendCaseClassification = trendAnalytics?.case_classification || {}
  const caseClassificationAvailable = Boolean(trendCaseClassification?.available)
  const confirmedAvailable = Boolean(trendCaseClassification?.confirmed_available)
  const probableAvailable = Boolean(trendCaseClassification?.probable_available)
  const suspectedAvailable = Boolean(trendCaseClassification?.suspected_available)
  const confirmedCases = confirmedAvailable ? Number(trendCaseClassification?.confirmed_cases || 0) : null
  const probableCases = probableAvailable ? Number(trendCaseClassification?.probable_cases || 0) : null
  const suspectedCases = suspectedAvailable ? Number(trendCaseClassification?.suspected_cases || 0) : null
  const classifiedCaseTotal = Number(trendCaseClassification?.classified_total || 0)
  const reportedClassificationTotal = Number(trendCaseClassification?.reported_total || 0)
  const unclassifiedCases = Number(trendCaseClassification?.unclassified_cases || 0)
  const confirmedShare = confirmedAvailable ? getCaseShare(confirmedCases, classifiedCaseTotal) : 0
  const probableShare = probableAvailable ? getCaseShare(probableCases, classifiedCaseTotal) : 0
  const suspectedShare = suspectedAvailable ? getCaseShare(suspectedCases, classifiedCaseTotal) : 0
  const classificationYearLabel = activeTrendYear || trendScopeLabel || 'the selected year'
  const classificationHasUnavailableFields = !confirmedAvailable || !probableAvailable || !suspectedAvailable
  const trendChartValues = trendMonthlyRows.map((row) => Number(row?.cases || 0))
  const trendChartLabels = trendMonthlyRows.map((row) => row?.month_short || row?.month_label || '')

  const riskIconTone = risk === 'High'
    ? {
        wrap: 'border-rose-300/30 bg-rose-500/15 text-rose-300 shadow-[0_14px_34px_rgba(244,63,94,0.24)]',
        glow: 'bg-rose-400/30',
        dot: 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.95)]',
      }
    : risk === 'Moderate'
      ? {
          wrap: 'border-amber-300/30 bg-amber-500/15 text-amber-300 shadow-[0_14px_34px_rgba(245,158,11,0.24)]',
          glow: 'bg-amber-300/30',
          dot: 'bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.95)]',
        }
      : risk === 'Low'
        ? {
            wrap: 'border-emerald-300/30 bg-emerald-500/15 text-emerald-300 shadow-[0_14px_34px_rgba(16,185,129,0.24)]',
            glow: 'bg-emerald-300/30',
            dot: 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.95)]',
          }
        : {
            wrap: 'border-slate-400/30 bg-slate-500/15 text-slate-300 shadow-[0_14px_34px_rgba(100,116,139,0.20)]',
            glow: 'bg-slate-300/20',
            dot: 'bg-slate-300 shadow-[0_0_12px_rgba(203,213,225,0.80)]',
          }

  const boundaryFeatureCount = useMemo(() => (
    countBoundaryFeatures(boundaryRecords)
  ), [boundaryRecords])

  const selectedBoundaryFeature = useMemo(() => (
    getBoundaryFeatureForBarangay(boundaryRecords, barangayName)
  ), [barangayName, boundaryRecords])

  const selectedSavedForecastRow = useMemo(() => {
    const activeKey = normalizeName(barangayName)

    if (!activeKey) return null

    return (
      savedForecastRows.find((row) => normalizeName(row?.barangay) === activeKey) ||
      null
    )
  }, [barangayName, savedForecastRows])

  const localForecasts = useMemo(() => {
    const directHorizons = getDirectForecastHorizons(
      selectedSavedForecastRow || barangayRisk
    )

    if (directHorizons.length) {
      return directHorizons
    }

    const latestPeriod =
      selectedSavedForecastRow?.latest_period ??
      selectedSavedForecastRow?.latestPeriod ??
      barangayRisk?.latest_period ??
      barangayRisk?.latestPeriod ??
      ''

    return getHorizonRowsFromForecastRows(
      forecastRows,
      barangayName,
      latestPeriod
    )
  }, [
    barangayName,
    barangayRisk,
    forecastRows,
    selectedSavedForecastRow,
  ])

  const localForecastTotal = localForecasts.reduce(
    (total, row) => total + Number(row?.predicted_cases || 0),
    0
  )

  const localForecastMatchesCumulative =
    localForecasts.length === 4 &&
    Math.abs(localForecastTotal - Number(predictedCases || 0)) < 0.5

  const maxForecast = Math.max(
    1,
    ...localForecasts.map((row) => Number(row?.predicted_cases || 0))
  )

  const barangayDecisionSupport = useMemo(() => {
    const source = barangayRisk || {}
    const inheritedSupport = source?.decisionSupport || {}

    const computedSupport = computeDecisionSupport({
      ...source,
      risk,
      forecast: Number(predictedCases || 0),
      forecastedCases: Number(predictedCases || 0),
      predictedCases: Number(predictedCases || 0),
      currentCases:
        source?.currentCases ??
        source?.current_cases ??
        source?.forecast_next_period ??
        0,
      previousCases:
        source?.previousCases ??
        source?.previous_cases ??
        source?.previous_average_cases ??
        source?.previousAverage ??
        0,
      totalCases:
        source?.totalCases ??
        source?.total_cases ??
        source?.historical_total_cases ??
        source?.cases ??
        0,
      recentAverage:
        source?.recentAverage ??
        source?.recent_average_cases ??
        0,
      previousAverage:
        source?.previousAverage ??
        source?.previous_average_cases ??
        0,
      trend:
        source?.trend_direction ??
        source?.trendDirection ??
        source?.trend ??
        'Stable',
    })

    const sourceActions = Array.isArray(source?.recommendedActions)
      ? source.recommendedActions
      : Array.isArray(inheritedSupport?.actions)
        ? inheritedSupport.actions
        : []

    const sourceRationale = Array.isArray(source?.recommendationRationale)
      ? source.recommendationRationale
      : Array.isArray(inheritedSupport?.rationale)
        ? inheritedSupport.rationale
        : []

    const actions = Array.from(new Set([
      ...(Array.isArray(computedSupport?.actions) ? computedSupport.actions : []),
      ...sourceActions,
    ].filter(Boolean))).slice(0, 4)

    const rationale = Array.from(new Set([
      ...(Array.isArray(computedSupport?.rationale) ? computedSupport.rationale : []),
      ...sourceRationale,
    ].filter(Boolean))).slice(0, 4)

    return {
      ...computedSupport,
      summary:
        source?.recommendation ||
        computedSupport?.summary ||
        source?.recommendedAction ||
        getAction(risk),
      priority:
        computedSupport?.priority ||
        source?.response_priority ||
        source?.responsePriority ||
        inheritedSupport?.priority ||
        'Routine Monitoring',
      actions,
      rationale,
    }
  }, [barangayRisk, predictedCases, risk])

  const checklist = [
    { id: 'inspect-water', label: 'Inspect stagnant water areas', icon: Droplets },
    { id: 'cleanup-drive', label: 'Coordinate cleanup drive', icon: Home },
    { id: 'community-reminders', label: 'Issue community reminders', icon: Megaphone },
    { id: 'field-observations', label: 'Record field observations', icon: ClipboardCheck },
    { id: 'monitoring-summary', label: 'Prepare monitoring summary', icon: FileText },
  ]

  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const emptyFieldUpdate = {
    fieldUpdateId: '',
    tasks: {},
    note: '',
    environmentalObservations: {},
    status: 'Draft',
    savedAt: '',
    submittedAt: '',
    supervisorComment: '',
    isUrgent: false,
    suspectedSymptoms: false,
    suppliesNeeded: false,
    assistanceNeeded: false,
  }
  const [fieldUpdate, setFieldUpdate] = useState(emptyFieldUpdate)
  const [fieldSaveMessage, setFieldSaveMessage] = useState('')
  const [fieldSaveTone, setFieldSaveTone] = useState('info')
  const [fieldUpdateBusy, setFieldUpdateBusy] = useState('')
  const [isLoadingFieldUpdate, setIsLoadingFieldUpdate] = useState(true)
  const canEditFieldUpdate = currentRole === 'bhw' && !['Submitted', 'Reviewed'].includes(fieldUpdate.status)

  useEffect(() => {
    let active = true

    async function loadFieldUpdate() {
      if (!barangayName || barangayName === 'Select a barangay') return
      setIsLoadingFieldUpdate(true)
      setFieldSaveMessage('')
      try {
        const result = await getCurrentFieldUpdate({
          barangay: barangayName,
          reportingDate: todayKey,
        })
        if (!active) return
        const saved = result?.field_update
        setFieldUpdate(saved ? {
          fieldUpdateId: saved.field_update_id || '',
          tasks: saved.tasks || {},
          note: saved.observation_note || '',
          environmentalObservations: saved.environmental_observations || {},
          status: saved.status || 'Draft',
          savedAt: saved.saved_at || '',
          submittedAt: saved.submitted_at || '',
          supervisorComment: saved.supervisor_comment || '',
          isUrgent: Boolean(saved.is_urgent),
          suspectedSymptoms: Boolean(saved.suspected_symptoms),
          suppliesNeeded: Boolean(saved.supplies_needed),
          assistanceNeeded: Boolean(saved.assistance_needed),
        } : { ...emptyFieldUpdate })
      } catch (error) {
        if (!active) return
        setFieldUpdate({ ...emptyFieldUpdate })
        setFieldSaveTone('error')
        setFieldSaveMessage(error?.message || 'The field update could not be loaded from Supabase.')
      } finally {
        if (active) setIsLoadingFieldUpdate(false)
      }
    }

    loadFieldUpdate()
    return () => {
      active = false
    }
  }, [barangayName, todayKey])

  function toggleFieldTask(taskId) {
    if (!canEditFieldUpdate) return
    setFieldUpdate((current) => ({
      ...current,
      tasks: {
        ...(current.tasks || {}),
        [taskId]: !current.tasks?.[taskId],
      },
    }))
    setFieldSaveMessage('')
  }

  function toggleEnvironmentalObservation(key) {
    if (!canEditFieldUpdate) return
    setFieldUpdate((current) => ({
      ...current,
      environmentalObservations: {
        ...(current.environmentalObservations || {}),
        [key]: !current.environmentalObservations?.[key],
      },
    }))
    setFieldSaveMessage('')
  }

  function buildFieldUpdatePayload() {
    return {
      barangay: barangayName,
      reporting_date: todayKey,
      tasks: Object.fromEntries(checklist.map((item) => [item.id, Boolean(fieldUpdate.tasks?.[item.id])])),
      total_tasks: checklist.length,
      observation_note: fieldUpdate.note || '',
      environmental_observations: Object.fromEntries(
        ENVIRONMENTAL_OBSERVATION_OPTIONS.map((item) => [item.key, Boolean(fieldUpdate.environmentalObservations?.[item.key])])
      ),
      risk_level: risk,
      predicted_cases: Number(predictedCases || 0),
      is_urgent: Boolean(fieldUpdate.isUrgent),
      suspected_symptoms: Boolean(fieldUpdate.suspectedSymptoms),
      supplies_needed: Boolean(fieldUpdate.suppliesNeeded),
      assistance_needed: Boolean(fieldUpdate.assistanceNeeded),
    }
  }

  function applySavedFieldUpdate(saved) {
    setFieldUpdate((current) => ({
      ...current,
      fieldUpdateId: saved?.field_update_id || current.fieldUpdateId,
      tasks: saved?.tasks || current.tasks,
      note: saved?.observation_note ?? current.note,
      environmentalObservations: saved?.environmental_observations || current.environmentalObservations || {},
      status: saved?.status || current.status,
      savedAt: saved?.saved_at || current.savedAt,
      submittedAt: saved?.submitted_at || current.submittedAt,
      supervisorComment: saved?.supervisor_comment || '',
      isUrgent: Boolean(saved?.is_urgent),
      suspectedSymptoms: Boolean(saved?.suspected_symptoms),
      suppliesNeeded: Boolean(saved?.supplies_needed),
      assistanceNeeded: Boolean(saved?.assistance_needed),
    }))
  }

  useEffect(() => {
    let active = true

    async function handleRealtimeFieldUpdate(event) {
      const detail = event?.detail || {}
      if (detail?.reporting_date && String(detail.reporting_date) !== String(todayKey)) return
      if (detail?.barangay && normalizeName(detail.barangay) !== normalizeName(barangayName)) return
      if (!barangayName || barangayName === 'Select a barangay') return

      try {
        const result = await getCurrentFieldUpdate({
          barangay: barangayName,
          reportingDate: todayKey,
        })
        if (!active) return
        if (result?.field_update) {
          applySavedFieldUpdate(result.field_update)
          if (['Reviewed', 'Follow-up Required'].includes(result.field_update.status)) {
            setFieldSaveTone(result.field_update.status === 'Reviewed' ? 'success' : 'info')
            setFieldSaveMessage(
              result.field_update.status === 'Reviewed'
                ? 'Supervisor review received in real time.'
                : 'Supervisor requested follow-up. Review the comment and update the field report.'
            )
          }
        }
      } catch {
        // Keep the current form visible. The normal page load/manual actions can
        // recover if a transient realtime refresh fails.
      }
    }

    window.addEventListener('dengue-field-updates-changed', handleRealtimeFieldUpdate)
    return () => {
      active = false
      window.removeEventListener('dengue-field-updates-changed', handleRealtimeFieldUpdate)
    }
  }, [barangayName, todayKey])

  async function saveFieldUpdate() {
    if (!canEditFieldUpdate) return
    setFieldUpdateBusy('draft')
    setFieldSaveMessage('')
    try {
      const result = await saveFieldUpdateDraft(buildFieldUpdatePayload())
      applySavedFieldUpdate(result?.field_update)
      setFieldSaveTone('success')
      setFieldSaveMessage('Draft saved to Supabase. No notification was sent.')
    } catch (error) {
      setFieldSaveTone('error')
      setFieldSaveMessage(error?.message || 'The draft could not be saved.')
    } finally {
      setFieldUpdateBusy('')
    }
  }

  async function submitToSupervisor() {
    if (!canEditFieldUpdate) return
    const incomplete = completedTaskCount < checklist.length
    if (incomplete && !window.confirm(`Only ${completedTaskCount} of ${checklist.length} activities are complete. Submit this update anyway?`)) return

    setFieldUpdateBusy('submit')
    setFieldSaveMessage('')
    try {
      const result = await submitFieldUpdate(buildFieldUpdatePayload())
      applySavedFieldUpdate(result?.field_update)
      setFieldSaveTone('success')
      setFieldSaveMessage('Field update submitted. The supervisor received one notification.')
    } catch (error) {
      setFieldSaveTone('error')
      setFieldSaveMessage(error?.message || 'The field update could not be submitted.')
    } finally {
      setFieldUpdateBusy('')
    }
  }

  const completedTaskCount = checklist.filter((item) => fieldUpdate.tasks?.[item.id]).length
  const taskProgress = Math.round((completedTaskCount / checklist.length) * 100)

  return (
    <div className="bhw-mobile-compact relative isolate space-y-7 overflow-hidden rounded-[36px] bg-[radial-gradient(circle_at_8%_2%,rgba(14,165,233,0.08),transparent_28%),radial-gradient(circle_at_92%_8%,rgba(16,185,129,0.07),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.72),rgba(248,250,252,0))] pb-7 dark:bg-[radial-gradient(circle_at_8%_2%,rgba(14,165,233,0.08),transparent_28%),radial-gradient(circle_at_92%_8%,rgba(16,185,129,0.06),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.35),rgba(15,23,42,0))]">
      <section className="bhw-premium-hero relative isolate overflow-visible rounded-[36px] border border-white/10 bg-[#061321] shadow-[0_34px_94px_rgba(2,6,23,0.30)] ring-1 ring-white/10 sm:rounded-[40px]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className={`absolute inset-0 bg-gradient-to-br ${tone.heroSurface}`} />
          <div className={`absolute inset-y-0 right-0 w-[58%] bg-gradient-to-l ${tone.heroBeam}`} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.10),transparent_26%),radial-gradient(circle_at_80%_30%,rgba(34,211,238,0.10),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_40%)] opacity-90" />
          <div className={`absolute -right-24 -top-28 h-80 w-80 rounded-full ${tone.glow} blur-3xl`} />
          <div className={`absolute -bottom-32 left-10 h-80 w-80 rounded-full ${tone.accentGlow} blur-3xl`} />
          <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
        </div>

        <div className="bhw-hero-layout relative z-10 grid min-h-[520px] gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.62fr)] lg:items-center lg:p-10 xl:min-h-[550px] xl:p-12">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100 shadow-lg backdrop-blur-xl">
                <Sparkles className="h-3.5 w-3.5" />
                BHW field command center
              </span>

              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur-xl ${tone.heroChip}`}
              >
                <span
                  className={`h-2 w-2 rounded-full bg-gradient-to-r ${tone.gradient} shadow-[0_0_14px_currentColor]`}
                  aria-hidden="true"
                />
                {tone.status}
              </span>
            </div>

            <h1 className="dengue-hero-title mt-6 max-w-3xl text-[2.15rem] font-bold leading-[1.08] tracking-[-0.035em] text-white drop-shadow-[0_5px_24px_rgba(2,6,23,0.65)] sm:text-[3rem] xl:text-[3.55rem]">
              {barangayName} dengue field intelligence.
            </h1>

            <p className="dengue-hero-copy mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/90 sm:text-[15px] sm:leading-8">
              Review actual dengue cases and historical trends first, then use the forecast, risk score, boundary coverage, and field tasks to support barangay response.
            </p>

            <div className="bhw-selector-shell relative z-40 mt-6 max-w-xl rounded-[28px] border border-white/[0.15] bg-slate-950/[0.45] p-4 shadow-[0_18px_46px_rgba(2,6,23,0.34)] backdrop-blur-xl">
              {canSelectBarangay ? (
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.17em] text-cyan-100/75">
                    <MapPinned className="h-4 w-4 text-cyan-300" />
                    Viewing barangay
                  </span>
                  <BarangaySelector
                    value={activeBarangay}
                    options={availableBarangays}
                    onChange={setSelectedBarangay}
                  />
                  <span className="mt-2 block text-xs font-semibold leading-5 text-slate-400">
                    Admin and CHO accounts can review every barangay. All information below follows the current selection.
                  </span>
                </label>
              ) : (
                <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.06] p-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-cyan-300/[0.15] bg-cyan-300/10 text-cyan-200">
                    <MapPinned className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Assigned barangay</p>
                    <p className="mt-1 truncate text-sm font-black text-white">{assignedBarangay}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">Locked to this BHW account assignment.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bhw-hero-metrics bhw-mobile-grid-3 mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                { label: 'Actual cases', value: trendLoading ? '…' : formatOptionalNumber(trendTotalCases), helper: trendScopeLabel, icon: Activity },
                { label: trendHighestMonthLabel, value: trendLoading ? '…' : (trendPeakMonth?.month_label || 'No data'), helper: trendPeakMonth ? `${formatNumber(trendPeakMonth.cases)} recorded cases` : 'No recorded cases in this period', icon: CalendarDays },
                { label: 'Current trend', value: trendLoading ? '…' : trendDirection, helper: trendSummary?.change_label || 'Monthly movement from actual records', icon: TrendingUp },
              ].map((item) => {
                const Icon = item.icon

                return (
                  <div key={item.label} className="group/hero-metric relative overflow-hidden rounded-[22px] border border-white/[0.15] bg-gradient-to-br from-white/[0.12] via-slate-950/[0.35] to-cyan-400/[0.07] p-4 shadow-[0_16px_36px_rgba(2,6,23,0.30)] ring-1 ring-white/5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[9px] font-black uppercase tracking-[0.15em]">{item.label}</span>
                    </div>
                    <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{item.value}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">{item.helper}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bhw-hero-risk-wrap w-full self-end justify-self-end lg:max-w-[390px]">
            <div className={`group/risk-card relative overflow-hidden rounded-[32px] border border-white/15 bg-gradient-to-br ${tone.heroCard} p-5 text-white shadow-[0_30px_78px_rgba(2,6,23,0.52)] ring-1 ring-white/10 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-white/25 sm:p-6`}>
              <div className={`pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full ${tone.glow} blur-3xl`} />

              <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-5">
                <div className="min-w-0">
                  <div
                    className={`bhw-risk-shield relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-[26px] border sm:h-24 sm:w-24 sm:rounded-[30px] ${riskIconTone.wrap}`}
                    aria-hidden="true"
                  >
                    <span className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl ${riskIconTone.glow}`} />
                    <span className="pointer-events-none absolute inset-2 rounded-[20px] border border-white/10 bg-white/[0.04]" />
                    <ShieldAlert className="relative h-10 w-10 sm:h-12 sm:w-12" strokeWidth={2.25} />
                    <span className={`absolute bottom-2.5 right-2.5 h-3.5 w-3.5 rounded-full ring-[3px] ring-[#071525] ${riskIconTone.dot}`} />
                  </div>

                  <div className="mt-4 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70">Current barangay risk</p>
                    <h2 className={`mt-2 text-3xl font-black tracking-[-0.04em] ${tone.text}`}>{risk}</h2>
                    {citywidePriorityRank && citywidePriorityTotal > 0 ? (
                      <div
                        className="mt-4 max-w-[230px] overflow-hidden rounded-[20px] border border-cyan-300/20 bg-gradient-to-br from-cyan-300/[0.11] via-white/[0.05] to-sky-400/[0.07] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(2,8,23,0.16)]"
                        title={`Citywide priority rank ${citywidePriorityRank} of ${citywidePriorityTotal}. Rank 1 is the highest priority.`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[8px] font-black uppercase tracking-[0.16em] text-cyan-100/60">Citywide priority</p>
                            <div className="mt-1 flex items-end gap-1.5">
                              <span className="text-[32px] font-black leading-none tracking-[-0.06em] text-white">#{citywidePriorityRank}</span>
                              <span className="pb-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-cyan-100/55">rank</span>
                            </div>
                          </div>
                          <div className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1.5 text-center shadow-inner">
                            <span className="block text-[8px] font-black uppercase tracking-[0.12em] text-cyan-100/50">of</span>
                            <span className="block text-sm font-black leading-none text-cyan-50">{citywidePriorityTotal}</span>
                          </div>
                        </div>
                        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300" style={{ width: `${Math.max(4, Math.min(100, ((citywidePriorityTotal - citywidePriorityRank + 1) / citywidePriorityTotal) * 100))}%` }} />
                        </div>
                      </div>
                    ) : null}
                    <p className="mt-3 max-w-[230px] text-xs font-semibold leading-5 text-slate-400">{tone.status}</p>
                  </div>
                </div>

                <div
                  className="dengue-hero-score-ring relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full p-[8px] shadow-[0_0_42px_rgba(56,189,248,0.18)]"
                  style={{
                    background: `conic-gradient(${risk === 'High' ? '#f43f5e' : risk === 'Moderate' ? '#f59e0b' : risk === 'Low' ? '#10b981' : '#64748b'} ${scorePercent * 3.6}deg, rgba(255,255,255,0.10) 0deg)`,
                  }}
                >
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#071525]">
                    <span className="dengue-hero-score-value text-2xl font-black leading-none">{score}</span>
                    <span className="dengue-hero-score-label mt-1 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100/70">of 100</span>
                  </div>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-2 gap-2.5">
                <div className="rounded-[18px] border border-white/[0.15] bg-white/[0.07] p-3 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Predicted</p>
                  <p className="mt-1 text-lg font-black text-white">{formatNumber(predictedCases)} cases</p>
                </div>
                <div className="rounded-[18px] border border-white/[0.15] bg-white/[0.07] p-3 shadow-inner">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Boundary</p>
                  <p className="mt-1 text-sm font-black leading-6 text-white">{selectedBoundaryFeature ? 'Matched' : 'Needs review'}</p>
                </div>
              </div>

              <div className="relative mt-5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-2.5 rounded-full bg-gradient-to-r ${tone.gradient}`} style={{ width: `${scorePercent}%` }} />
              </div>

              <Link to="/map" className="relative mt-5 flex w-full items-center justify-between rounded-[18px] border border-cyan-300/[0.15] bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/[0.15]">
                Open full hotspot map
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <BarangayRiskExplanation
        row={barangayRisk}
        barangayName={barangayName}
        priorityRank={citywidePriorityRank}
        priorityTotal={citywidePriorityTotal}
      />

      {trendLoading && !trendAnalytics ? (
        <TrendPanelSkeleton className="bhw-trend-panel" />
      ) : (
      <PremiumPanel tone="blue" className="bhw-trend-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SectionBadge icon={TrendingUp} tone="blue">Actual dengue situation</SectionBadge>
              <InformationTypeBadge type="recorded" />
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-white">Historical dengue trend</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
              See the recorded dengue pattern for {barangayName}, including the highest month, lowest month, and month-to-month movement before reviewing the forecast.
            </p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[440px]">
            <TrendFilterDropdown
              label="Year"
              value={activeTrendYear}
              options={trendAvailableYears.map((yearValue) => ({
                value: String(yearValue),
                label: String(yearValue),
                note: `Recorded dengue cases for ${barangayName} in ${yearValue}`,
              }))}
              onChange={setTrendYear}
              emptyLabel="No years available"
              tone="cyan"
              disabled={trendLoading || !trendAvailableYears.length}
            />

            <TrendFilterDropdown
              label="Period"
              value={trendPeriod}
              options={TREND_PERIOD_OPTIONS}
              onChange={setTrendPeriod}
              emptyLabel="Choose a period"
              tone="amber"
              disabled={trendLoading}
            />
          </div>
        </div>

        {trendError ? (
          <div className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
            {trendError}
          </div>
        ) : null}

        <div className="bhw-trend-metrics mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <TrendMetricCard
            label="Actual cases"
            value={trendLoading ? '…' : formatOptionalNumber(trendTotalCases)}
            helper={trendScopeLabel}
            icon={Activity}
            tone="blue"
            badge="Recorded"
          />

          <TrendMetricCard
            label={trendHighestMonthLabel}
            value={trendLoading ? '…' : (trendPeakMonth?.month_label || 'No data')}
            helper={trendPeakMonth ? `${formatNumber(trendPeakMonth.cases)} recorded cases` : 'No cases recorded in this period'}
            icon={TrendingUp}
            tone="amber"
            badge="Peak"
          />

          <TrendMetricCard
            label="Lowest month"
            value={trendLoading ? '…' : (trendLowestMonth?.month_label || '—')}
            helper={trendLowestMonth ? `${formatNumber(trendLowestMonth.cases)} recorded cases` : 'No monthly record available'}
            icon={TrendingDown}
            tone="emerald"
            badge="Lowest"
          />

          <TrendMetricCard
            label="Current movement"
            value={trendLoading ? '…' : trendDirection}
            helper={trendSummary?.change_label || 'No previous month available'}
            icon={TrendMovementIcon}
            tone={trendMovementTone}
            badge="Trend"
          />
        </div>

        <div className="mt-5">
          <div className="relative -mx-2 min-w-0 overflow-hidden rounded-[24px] border border-cyan-400/[0.15] bg-gradient-to-b from-[#061321] via-[#06111d] to-[#020817] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.42)] sm:mx-0 sm:rounded-[30px] sm:p-5">
            <div className="mb-3 flex flex-col gap-2 px-1 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:px-0">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300/80">
                  Barangay actual dengue trend
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Recorded cases only. Forecast values are shown separately below.
                </p>
              </div>
              <div className="w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
                {trendScopeLabel}
              </div>
            </div>

            <div className="w-full min-h-[300px] sm:min-h-[430px] lg:min-h-[560px] xl:min-h-[620px]">
              <SparkChart
                values={trendChartValues}
                labels={trendChartLabels}
                title={`${barangayName} actual dengue cases`}
                subtitle={`Recorded monthly dengue cases · ${trendScopeLabel}`}
                emptyLabel="No monthly dengue records for this period"
                loading={trendLoading}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-[26px] border border-blue-200/70 bg-blue-50/70 p-5 dark:border-blue-400/20 dark:bg-blue-500/10">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Simple interpretation</p>
              </div>
              <p className="mt-3 text-sm font-semibold leading-7 text-brand-text dark:text-slate-200">
                {trendLoading
                  ? 'Reading the actual monthly dengue pattern…'
                  : (trendAnalytics?.interpretation || 'No trend interpretation is available yet.')}
              </p>
            </div>

            <div className="rounded-[26px] border border-amber-200/70 bg-amber-50/70 p-5 dark:border-amber-400/20 dark:bg-amber-500/10">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Usual peak month</p>
              {trendHistoricalPeak ? (
                <>
                  <p className="mt-2 text-xl font-black text-brand-text dark:text-white">{trendHistoricalPeak.month_label}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">
                    Based on past records, dengue cases are usually highest in {trendHistoricalPeak.month_label}.
                    <span className="mt-1 block text-xs font-bold text-amber-700/80 dark:text-amber-200/70">Historical monthly average: {trendHistoricalPeak.average_cases} cases.</span>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted dark:text-slate-400">A usual peak month cannot be identified from the available records yet.</p>
              )}
            </div>
          </div>

          <div className="bhw-case-classification-panel mt-4 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/80 shadow-sm dark:border-white/10 dark:bg-slate-950/55">
            <div className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Actual case classification</p>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Confirmed, probable, and suspected recorded dengue cases.</p>
              </div>
              <span className="w-fit rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
                {trendScopeLabel}
              </span>
            </div>

            {trendLoading ? (
              <div className="flex min-h-[180px] items-center justify-center px-5 py-8 text-sm font-bold text-slate-500 dark:text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading recorded case classifications…
              </div>
            ) : caseClassificationAvailable ? (
              <div className="p-4 sm:p-5">
                <div className="bhw-case-classification-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-[22px] border border-emerald-200/80 bg-emerald-50/70 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Confirmed</p>
                    <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{confirmedAvailable ? formatNumber(confirmedCases) : 'N/A'}</p>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
                      {confirmedAvailable
                        ? `${confirmedShare.toFixed(1)}% of classified cases`
                        : `Not separately reported in the source for ${classificationYearLabel}.`}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">Probable</p>
                    <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{probableAvailable ? formatNumber(probableCases) : 'N/A'}</p>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
                      {probableAvailable
                        ? `${probableShare.toFixed(1)}% of classified cases`
                        : `Not separately reported in the source for ${classificationYearLabel}.`}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-rose-200/80 bg-rose-50/70 p-4 dark:border-rose-400/20 dark:bg-rose-500/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-700 dark:text-rose-300">Suspected</p>
                    <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{suspectedAvailable ? formatNumber(suspectedCases) : 'N/A'}</p>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
                      {suspectedAvailable
                        ? `${suspectedShare.toFixed(1)}% of classified cases`
                        : `Not separately reported in the source for ${classificationYearLabel}.`}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-sky-200/80 bg-sky-50/70 p-4 dark:border-sky-400/20 dark:bg-sky-500/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">Total reported</p>
                    <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{formatNumber(reportedClassificationTotal)}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Recorded cases in {trendScopeLabel}</p>
                  </div>
                </div>

                <div className="bhw-case-mix-panel mt-4 rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-900/70">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Case mix comparison</p>
                      <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Share of the cases that have an official classification.</p>
                    </div>
                    <span className="text-xs font-black text-slate-700 dark:text-slate-200">{formatNumber(classifiedCaseTotal)} classified</span>
                  </div>

                  <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    {classifiedCaseTotal > 0 ? (
                      <>
                        {confirmedAvailable ? <div className="h-full bg-emerald-500" style={{ width: `${confirmedShare}%` }} title={`Confirmed ${confirmedShare.toFixed(1)}%`} /> : null}
                        {probableAvailable ? <div className="h-full bg-amber-400" style={{ width: `${probableShare}%` }} title={`Probable ${probableShare.toFixed(1)}%`} /> : null}
                        {suspectedAvailable ? <div className="h-full bg-rose-500" style={{ width: `${suspectedShare}%` }} title={`Suspected ${suspectedShare.toFixed(1)}%`} /> : null}
                      </>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    <span className={`inline-flex items-center gap-1.5 ${confirmedAvailable ? '' : 'opacity-50'}`}><span className="h-2 w-2 rounded-full bg-emerald-500" />Confirmed{confirmedAvailable ? '' : ' — N/A'}</span>
                    <span className={`inline-flex items-center gap-1.5 ${probableAvailable ? '' : 'opacity-50'}`}><span className="h-2 w-2 rounded-full bg-amber-400" />Probable{probableAvailable ? '' : ' — N/A'}</span>
                    <span className={`inline-flex items-center gap-1.5 ${suspectedAvailable ? '' : 'opacity-50'}`}><span className="h-2 w-2 rounded-full bg-rose-500" />Suspected{suspectedAvailable ? '' : ' — N/A'}</span>
                  </div>

                  {classificationHasUnavailableFields ? (
                    <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold leading-5 text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200">
                      N/A means that classification was not separately reported in the official source for {classificationYearLabel}. It is not counted as zero.
                    </p>
                  ) : null}

                  {unclassifiedCases > 0 ? (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                      {formatNumber(unclassifiedCases)} reported case{unclassifiedCases === 1 ? '' : 's'} are not represented by the available classification values in the source for this period.
                    </p>
                  ) : null}
                </div>

                <p className="mt-3 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                  {trendCaseClassification?.source_note}
                </p>
              </div>
            ) : (
              <div className="px-5 py-6">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100">Case classification is unavailable for this source.</p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                    {trendCaseClassification?.source_note || 'The uploaded dengue dataset does not provide confirmed, probable, and suspected case fields. No values are estimated.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </PremiumPanel>

      )}

      <section className="bhw-summary-metrics bhw-mobile-grid-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Activity} label="Actual cases" value={trendLoading ? '…' : formatOptionalNumber(trendTotalCases)} helper={`Recorded dengue cases for ${trendScopeLabel}.`} tone="sky" informationType="recorded" />
        <MetricCard icon={CalendarDays} label={trendHighestMonthLabel} value={trendLoading ? '…' : (trendPeakMonth?.month_label || 'No data')} helper={trendPeakMonth ? `${formatNumber(trendPeakMonth.cases)} recorded cases.` : 'No recorded cases in the selected period.'} tone="amber" informationType="recorded" />
        <MetricCard icon={ShieldAlert} label="Forecast cases" value={formatNumber(predictedCases)} helper="Forecast total across the four future periods." tone="rose" informationType="forecast" />
        <MetricCard icon={TrendingUp} label="Combined priority score" value={`${score}/100`} helper="Overall planning priority based on forecast, weather, trend, population, and density." tone="blue" informationType="decision" />
      </section>

      <PremiumPanel tone="sky" className="bhw-boundary-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <SectionBadge icon={MapPinned} tone="sky">Barangay boundary workspace</SectionBadge>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-brand-text dark:text-white">{barangayName} coverage boundary</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
              The focused map shows only the official polygon of the selected barangay so field teams can concentrate on their assigned inspection, cleanup, advisory, and reporting area.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${tone.chip}`}>{risk} risk</span>
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {selectedBoundaryFeature ? 'Polygon matched' : `${formatNumber(boundaryFeatureCount)} boundaries loaded`}
            </span>
          </div>
        </div>

        <div className="mt-5 grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bhw-boundary-map relative h-[510px] overflow-hidden rounded-[32px] border border-cyan-300/20 bg-[radial-gradient(circle_at_50%_20%,rgba(56,189,248,0.12),transparent_26%),linear-gradient(180deg,#030712_0%,#05111f_100%)] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_30px_90px_rgba(2,6,23,0.42)] ring-1 ring-cyan-300/10 sm:h-[670px] 2xl:h-[710px]">
            <div className="relative h-full overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_50%_16%,rgba(59,130,246,0.12),transparent_24%),linear-gradient(180deg,#030712_0%,#07101d_100%)]">
              <div className="pointer-events-none absolute inset-x-4 top-3 z-30 flex min-h-[44px] items-center justify-between rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/75 shadow-[0_12px_30px_rgba(2,6,23,0.26)] backdrop-blur-xl">
                <span>3D geospatial focus</span>
                <span>Barangay hologram view</span>
              </div>
              {selectedBoundaryFeature ? (
                <BarangayBoundaryShape
                  key={`bhw-boundary-shape-${normalizeName(barangayName)}`}
                  feature={selectedBoundaryFeature}
                  barangayName={barangayName}
                  risk={risk}
                  score={score}
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-slate-950 p-6 text-center">
                  <div>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/10 text-amber-300">
                      <AlertTriangle className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-lg font-black text-white">Barangay polygon not found</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                      The boundary file is loaded, but no matching polygon was found for {barangayName}. Check that the barangay name in the GeoJSON matches the forecast record.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bhw-boundary-side flex h-full flex-col gap-3">
            <div className="relative overflow-hidden rounded-[26px] border border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white to-blue-50/75 p-5 shadow-[0_16px_40px_rgba(14,165,233,0.10)] dark:border-sky-400/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-blue-500/5">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-600 via-blue-400 to-cyan-300" />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Coverage area</p>
              <p className="mt-2 break-words text-xl font-black tracking-tight text-brand-text dark:text-white">{barangayName}</p>
              <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Use the highlighted polygon as the official reference for inspections, cleanup activities, advisories, and field reporting.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[24px] border border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-orange-50 p-4 shadow-sm dark:border-rose-400/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/5">
                <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">Forecast cases</p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{formatNumber(predictedCases)}</p>
              </div>
              <div className="rounded-[24px] border border-blue-200/70 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4 shadow-sm dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5">
                <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">Combined priority score</p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{score}/100</p>
              </div>
            </div>

            <div className="flex-1 rounded-[26px] border border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-cyan-50/70 p-5 shadow-sm dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700 dark:text-blue-300">How to read this map</p>
              <p className="mt-2 text-sm leading-6 text-brand-text dark:text-slate-300">Red means High risk, amber means Moderate risk, green means Low risk, and gray means the forecast is still pending. Nearby barangays are intentionally hidden.</p>
            </div>

            <Link to="/map" className="group flex min-h-[54px] items-center justify-between gap-3 rounded-[22px] border border-sky-200 bg-white px-4 py-3 text-sm font-black text-brand-text shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-sky-400 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
              <span className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-sky-500" />Open full hotspot map</span>
              <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </PremiumPanel>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <PremiumPanel tone="emerald" className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Recommended response</p>
                  <InformationTypeBadge type="decision" />
                </div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-brand-text dark:text-white">Barangay decision support</h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">
                  Based on forecast, trend, risk level, weather, population, and density for {barangayName}.
                </p>
              </div>
            </div>

            <span className={`w-fit rounded-full border px-3 py-1.5 text-[11px] font-black ${tone.chip}`}>
              {barangayDecisionSupport.priority}
            </span>
          </div>

          <div className={`relative mt-5 overflow-hidden rounded-[28px] border p-5 shadow-sm ${tone.border} bg-gradient-to-br ${tone.soft}`}>
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.gradient}`} />
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border ${tone.chip}`}>
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Recommended field focus</p>
                <p className="mt-2 text-sm font-bold leading-7 text-brand-text dark:text-slate-100">
                  {barangayDecisionSupport.summary}
                </p>
              </div>
            </div>
          </div>

          {barangayDecisionSupport.actions.length > 0 && (
            <div className="mt-4 rounded-[24px] border border-emerald-100 bg-white/80 p-4 shadow-sm dark:border-emerald-400/15 dark:bg-slate-950/60">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-300">Field response plan</p>
              <div className="mt-3 space-y-2.5">
                {barangayDecisionSupport.actions.map((action, index) => (
                  <div key={`${action}-${index}`} className="flex gap-3 rounded-[18px] border border-slate-100 bg-slate-50/80 px-3 py-3 text-sm leading-6 text-brand-text dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      {index + 1}
                    </span>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {barangayDecisionSupport.rationale.length > 0 && (
            <div className="mt-4 rounded-[24px] border border-blue-100 bg-blue-50/55 p-4 dark:border-blue-400/15 dark:bg-blue-500/[0.06]">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700 dark:text-blue-300">Why this is recommended</p>
              <div className="mt-3 space-y-2">
                {barangayDecisionSupport.rationale.map((reason, index) => (
                  <div key={`${reason}-${index}`} className="flex gap-2.5 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-300" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-[20px] border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs font-semibold leading-5 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/[0.08] dark:text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Decision support only. Use these recommendations as field guidance and follow CHO or supervisor coordination for final response activities.</span>
          </div>
        </PremiumPanel>

        <PremiumPanel tone="blue" className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-blue-200 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Four-period forecast</p>
                <InformationTypeBadge type="forecast" />
              </div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-brand-text dark:text-white">Local forecast timeline</h2>
            </div>
          </div>

          <div className="mt-3 rounded-[20px] border border-blue-200/70 bg-blue-50/70 px-4 py-3 text-xs font-semibold leading-5 text-blue-800 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
            {localForecasts.length === 4 ? (
              <>
                These are four future periods predicted separately for {barangayName} using the direct multi-step method. The four values total{' '}
                <span className="font-black">{formatNumber(localForecastTotal)} cases</span>
                {localForecastMatchesCumulative
                  ? ', matching the cumulative barangay forecast.'
                  : '.'}
              </>
            ) : (
              <>
                Separate future-period predictions are not available for this barangay yet. The workspace will not invent period values from the cumulative forecast.
              </>
            )}
          </div>

          {localForecasts.length >= 2 && (
            <ForecastTrendMiniChart rows={localForecasts} barangayName={barangayName} />
          )}

          <div className="bhw-forecast-timeline mt-5 space-y-3">
            {localForecasts.length ? (
              localForecasts.map((row, index) => {
                const cases = Number(row?.predicted_cases || 0)
                const width = Math.min(
                  100,
                  Math.max(8, Math.round((cases / maxForecast) * 100))
                )

                return (
                  <div key={`${row.period || index}-${row.horizon || index + 1}`} className="group/forecast relative overflow-hidden rounded-[24px] border border-blue-200/60 bg-gradient-to-r from-blue-50/90 via-white to-cyan-50/70 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-md dark:border-blue-400/[0.15] dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-blue-600 text-sm font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]">
                        {row.horizon || index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-black text-brand-text dark:text-slate-100">
                            {row.period || `Forecast period ${index + 1}`}
                          </span>
                          <span className="shrink-0 font-black text-brand-text dark:text-slate-100">
                            {formatNumber(cases)} cases
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-600/70 dark:text-blue-300/70">
                          Period {row.horizon || index + 1} · Horizon {row.horizon || index + 1} · direct multi-step
                        </p>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white shadow-inner dark:bg-slate-800">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-300" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 p-5 text-sm font-bold leading-6 text-brand-muted dark:border-slate-700 dark:text-slate-400">
                No four-period barangay forecast is available yet. Ask the CHO account to run the latest dengue forecast so the four saved future-period predictions can be displayed here.
              </div>
            )}
          </div>
        </PremiumPanel>
      </section>

      <AssignedResponseActions
        barangay={barangayName}
        forecastCycleId={forecastCycle.id}
        forecastCycleStart={forecastCycle.startedAt}
        currentRole={currentRole}
        fieldUpdateStatus={fieldUpdate.status}
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)]">
        <PremiumPanel tone="amber" className="bhw-field-update-panel p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-amber-200 bg-amber-50 text-amber-700 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Field checklist</p>
                <InformationTypeBadge type="field" label="Field observation" />
              </div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-brand-text dark:text-white">Today&apos;s monitoring tasks</h2>
            </div>
          </div>

          <div className="mt-5 rounded-[26px] border border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-cyan-50/70 p-5 shadow-sm dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-brand-text dark:text-white">Today&apos;s progress</p>
                <p className="mt-1 text-xs font-semibold text-brand-muted dark:text-slate-400">{completedTaskCount} of {checklist.length} activities completed</p>
              </div>
              <span className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-sm font-black text-blue-700 shadow-sm dark:border-blue-400/20 dark:bg-slate-950 dark:text-blue-300">{taskProgress}%</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white shadow-inner dark:bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-300 transition-all" style={{ width: `${taskProgress}%` }} />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {checklist.map((item, index) => {
              const Icon = item.icon
              const done = Boolean(fieldUpdate.tasks?.[item.id])

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleFieldTask(item.id)}
                  disabled={!canEditFieldUpdate || isLoadingFieldUpdate}
                  className={`group/task relative flex w-full disabled:cursor-not-allowed disabled:opacity-70 items-center gap-3 overflow-hidden rounded-[24px] border px-4 py-3.5 text-left shadow-[0_10px_26px_rgba(15,23,42,0.05)] transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/20 ${done ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 hover:-translate-y-0.5 dark:border-emerald-500/25 dark:from-emerald-500/10 dark:via-slate-950 dark:to-teal-500/5' : 'border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50/50 hover:-translate-y-0.5 hover:border-blue-200 dark:border-slate-700 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20'}`}
                  aria-pressed={done}
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] ${done ? 'bg-emerald-600 text-white shadow-[0_10px_24px_rgba(5,150,105,0.22)]' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400'}`}>{done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-brand-text dark:text-slate-100">{item.label}</span>
                    <span className="mt-1 block text-xs font-semibold text-brand-muted dark:text-slate-500">{done ? 'Completed. Tap to undo.' : 'Tap when this field activity is completed.'}</span>
                  </span>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black ${done ? 'border-emerald-300 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900'}`}>{done ? <Check className="h-4 w-4" /> : index + 1}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-5 rounded-[24px] border border-cyan-200/80 bg-gradient-to-br from-cyan-50/90 via-white to-blue-50/70 p-4 shadow-sm dark:border-cyan-400/20 dark:from-cyan-500/10 dark:via-slate-950 dark:to-blue-500/5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-black text-brand-text dark:text-white">Observed environmental factors</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">Mark only what was directly observed or locally known during field monitoring. These are observations, not confirmed causes of dengue.</p>
              </div>
              <span className="w-fit rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-black text-cyan-700 shadow-sm dark:border-cyan-400/20 dark:bg-slate-950 dark:text-cyan-200">{ENVIRONMENTAL_OBSERVATION_OPTIONS.filter((item) => fieldUpdate.environmentalObservations?.[item.key]).length} marked</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
              {ENVIRONMENTAL_OBSERVATION_OPTIONS.map((item) => {
                const checked = Boolean(fieldUpdate.environmentalObservations?.[item.key])
                return (
                  <label key={item.key} className={`flex min-h-[46px] items-center gap-2.5 rounded-[14px] border px-2.5 py-2.5 text-[11px] font-black leading-[1.25] transition sm:min-h-[50px] sm:px-3 sm:text-xs ${checked ? 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-sm dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-100' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'} ${!canEditFieldUpdate ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-cyan-300'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canEditFieldUpdate || isLoadingFieldUpdate}
                      onChange={() => toggleEnvironmentalObservation(item.key)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="min-w-0">{item.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-sm font-black text-brand-text dark:text-white">Field observation note</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">Add the location, household details, other observations, symptoms reported, supplies needed, or coordination completed.</span>
            <textarea
              value={fieldUpdate.note || ''}
              onChange={(event) => {
                setFieldUpdate((current) => ({ ...current, note: event.target.value }))
                setFieldSaveMessage('')
              }}
              disabled={!canEditFieldUpdate || isLoadingFieldUpdate}
              rows={4}
              maxLength={1200}
              placeholder="Example: Inspected Purok 3. Two uncovered water containers were emptied. Barangay cleanup requested for Friday."
              className="mt-3 w-full resize-y rounded-[22px] border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold leading-6 text-brand-text shadow-inner outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <span className="mt-1 block text-right text-xs font-bold text-brand-muted dark:text-slate-500">{String(fieldUpdate.note || '').length}/1200</span>
          </label>

          <div className="bhw-escalation-panel mt-4 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-sm font-black text-brand-text dark:text-white">Escalation details</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">Mark only the conditions observed today. Urgent or High Risk submissions are also surfaced to the administrator.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                ['isUrgent', 'Urgent issue'],
                ['suspectedSymptoms', 'Suspected dengue symptoms'],
                ['suppliesNeeded', 'Supplies are needed'],
                ['assistanceNeeded', 'Immediate assistance is needed'],
              ].map(([key, label]) => (
                <label key={key} className={`flex items-center gap-3 rounded-[16px] border px-3 py-2.5 text-xs font-black transition ${fieldUpdate[key] ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'} ${!canEditFieldUpdate ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={Boolean(fieldUpdate[key])} disabled={!canEditFieldUpdate || isLoadingFieldUpdate} onChange={(event) => {
                    setFieldUpdate((current) => ({ ...current, [key]: event.target.checked }))
                    setFieldSaveMessage('')
                  }} className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {fieldUpdate.status && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-black">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">Status: {fieldUpdate.status}</span>
              {fieldUpdate.supervisorComment && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">Supervisor: {fieldUpdate.supervisorComment}</span>}
            </div>
          )}

          {fieldSaveMessage && (
            <div className={`mt-4 rounded-[20px] border px-4 py-3 text-sm font-bold leading-6 ${fieldSaveTone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200' : fieldSaveTone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200'}`}>{fieldSaveMessage}</div>
          )}

          {currentRole !== 'bhw' && (
            <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">This is a read-only preview. Only the BHW assigned to this barangay can save or submit its daily field update.</div>
          )}

          <div className="bhw-submit-actions mt-4 grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={saveFieldUpdate} disabled={!canEditFieldUpdate || Boolean(fieldUpdateBusy) || isLoadingFieldUpdate} className={`flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border px-4 py-3 text-sm font-black transition ${canEditFieldUpdate ? 'border-blue-200 bg-white text-blue-700 shadow-sm hover:-translate-y-0.5 dark:border-blue-500/25 dark:bg-slate-950 dark:text-blue-200' : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 shadow-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500'}`}>{fieldUpdateBusy === 'draft' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}Save Draft</button>
            <button type="button" onClick={submitToSupervisor} disabled={!canEditFieldUpdate || Boolean(fieldUpdateBusy) || isLoadingFieldUpdate} className={`flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border px-4 py-3 text-sm font-black transition ${canEditFieldUpdate ? 'border-transparent bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 text-white shadow-[0_16px_34px_rgba(37,99,235,0.24)] hover:-translate-y-0.5' : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 shadow-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500'}`}>{fieldUpdateBusy === 'submit' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Submit to Supervisor</button>
            {fieldUpdate.fieldUpdateId && fieldUpdate.status !== 'Draft' ? (
              <Link to={`/reports?field_update_id=${encodeURIComponent(fieldUpdate.fieldUpdateId)}`} className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-brand-text shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><FileText className="h-5 w-5" />Prepare Official Report</Link>
            ) : (
              <button type="button" disabled className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-slate-100 px-4 py-3 text-center text-sm font-black text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"><FileText className="h-5 w-5" />Submit Before Reporting</button>
            )}
          </div>
        </PremiumPanel>

        <div className="bhw-support-links grid content-start gap-4">
          <Link to="/map" className="group relative overflow-hidden rounded-[30px] border border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/75 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_62px_rgba(15,23,42,0.14)] dark:border-sky-400/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-cyan-500/5 dark:ring-white/5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-600 via-cyan-400 to-blue-300" />
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-sky-200 bg-white text-sky-700 shadow-sm dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200"><MapPinned className="h-5 w-5" /></div>
            <h3 className="mt-4 text-xl font-black tracking-tight text-brand-text dark:text-white">Hotspot map</h3>
            <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Check barangay location, neighboring risk areas, and city-level hotspot context.</p>
            <ArrowUpRight className="absolute right-5 top-5 h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-sky-500" />
          </Link>

          <Link to="/reports" className="group relative overflow-hidden rounded-[30px] border border-blue-200/70 bg-gradient-to-br from-blue-50/95 via-white to-indigo-50/70 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_62px_rgba(15,23,42,0.14)] dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-indigo-500/5 dark:ring-white/5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-400 to-cyan-300" />
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-blue-200 bg-white text-blue-700 shadow-sm dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200"><FileText className="h-5 w-5" /></div>
            <h3 className="mt-4 text-xl font-black tracking-tight text-brand-text dark:text-white">Reports</h3>
            <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Review saved field updates and prepare official barangay summaries for coordination.</p>
            <ArrowUpRight className="absolute right-5 top-5 h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-blue-500" />
          </Link>

          <div className="relative overflow-hidden rounded-[30px] border border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/75 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] ring-1 ring-white/70 dark:border-amber-400/20 dark:from-amber-500/10 dark:via-slate-950 dark:to-orange-500/5 dark:ring-white/5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-600 via-orange-400 to-yellow-300" />
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-amber-200 bg-white text-amber-700 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"><AlertTriangle className="h-5 w-5" /></div>
            <h3 className="mt-4 text-xl font-black tracking-tight text-brand-text dark:text-white">Field reminder</h3>
            <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Validate system guidance through inspection, community reports, and direct coordination with the City Health Office.</p>
          </div>
        </div>
      </section>

      <BHWPageStyles />
    </div>
  )
}
