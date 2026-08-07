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
  TrendingUp,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { getCurrentFieldUpdate, saveFieldUpdateDraft, submitFieldUpdate } from '../services/api'
import { getAuthSession } from '../utils/auth'
import { getCanonicalCombinedRiskScore, riskStyles } from '../utils/analytics'

function formatNumber(value) {
  return new Intl.NumberFormat('en-PH').format(Number(value || 0))
}

function normalizeName(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
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

function MetricCard({ icon: Icon, label, value, helper, tone = 'blue' }) {
  const theme = getMetricTheme(tone)

  return (
    <article className={`group relative min-h-[176px] overflow-hidden rounded-[30px] border p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/75 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_68px_rgba(15,23,42,0.15)] dark:ring-white/5 ${theme.surface}`}>
      <div className={`pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-125 ${theme.glow}`} />
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.line}`} />
      <div className="pointer-events-none absolute right-5 top-5 h-20 w-20 rounded-full border border-white/70 opacity-60 dark:border-white/5" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${theme.icon}`}>
            <Icon className="h-5 w-5" strokeWidth={2.25} />
          </div>

          <span className="rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
            Live
          </span>
        </div>

        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950 dark:text-white">{value}</p>

        <div className="mt-auto pt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/80 shadow-inner dark:bg-slate-800">
            <div className={`h-full w-[72%] rounded-full bg-gradient-to-r ${theme.meter}`} />
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-400">{helper}</p>
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
      <div className="pointer-events-none absolute inset-0 opacity-[0.022] [background-image:linear-gradient(rgba(15,23,42,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.5)_1px,transparent_1px)] [background-size:34px_34px] dark:opacity-[0.035] dark:[background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)]" />
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
            font-size: 0.75rem !important;
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
            font-size: 0.75rem !important;
            line-height: 1.28 !important;
          }

          .bhw-mobile-compact .text-sm { font-size: 0.875rem !important; line-height: 1.28 !important; }
          .bhw-mobile-compact .text-xs { font-size: 0.75rem !important; line-height: 1.18 !important; }
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
            font-size: 0.75rem !important;
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
            font-size: 0.75rem !important;
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
            font-size: 0.78rem !important;
            line-height: 1.1 !important;
          }

          .bhw-mobile-compact a.group.relative.overflow-hidden p,
          .bhw-mobile-compact .bhw-mobile-grid-3 p {
            font-size: 0.75rem !important;
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
            overflow-wrap: anywhere !important;
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
    `}</style>
  )
}

export default function BHWPage() {
  const {
    riskRows = [],
    weeklyTotals = [],
    dashboardStats = {},
    backendForecastResult,
    boundaryRecords = [],
  } = useData()

  const session = getAuthSession()
  const currentRole = session?.role || 'viewer'
  const assignedBarangay = session?.assignedBarangay || 'Baan KM 3'
  const canSelectBarangay = currentRole === 'admin' || currentRole === 'cho'

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

  const availableBarangays = useMemo(() => {
    const namesByKey = new Map()

    ;[...riskRows, ...savedForecastRows, ...forecastRows].forEach((row) => {
      const name = String(row?.barangay || '').trim()
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
  }, [assignedBarangay, forecastRows, riskRows, savedForecastRows])

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

  const barangayName = barangayRisk?.barangay || activeBarangay || 'Select a barangay'
  const risk = normalizeRiskLevel(
    barangayRisk?.risk_level ?? barangayRisk?.risk,
    barangayRisk ? 'Low' : 'Pending'
  )
  const style = riskStyles[risk] || riskStyles.Low
  const tone = getRiskTone(risk)
  const score = getScore(barangayRisk)
  const predictedCases = getCases(barangayRisk)
  const scorePercent = Math.min(100, Math.max(0, score))

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

  const cityHighRiskCount = useMemo(() => {
    const sourceRows = savedForecastRows.length ? savedForecastRows : riskRows

    return sourceRows.filter((row) => (
      normalizeRiskLevel(row?.risk_level ?? row?.risk, 'Low') === 'High'
    )).length
  }, [riskRows, savedForecastRows])

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

  function buildFieldUpdatePayload() {
    return {
      barangay: barangayName,
      reporting_date: todayKey,
      tasks: Object.fromEntries(checklist.map((item) => [item.id, Boolean(fieldUpdate.tasks?.[item.id])])),
      total_tasks: checklist.length,
      observation_note: fieldUpdate.note || '',
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
      <section className="relative isolate overflow-visible rounded-[36px] border border-white/10 bg-[#061321] shadow-[0_34px_94px_rgba(2,6,23,0.30)] ring-1 ring-white/10 sm:rounded-[40px]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className={`absolute inset-0 bg-gradient-to-br ${tone.heroSurface}`} />
          <div className={`absolute inset-y-0 right-0 w-[58%] bg-gradient-to-l ${tone.heroBeam}`} />
          <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className={`absolute -right-24 -top-28 h-80 w-80 rounded-full ${tone.glow} blur-3xl`} />
          <div className={`absolute -bottom-32 left-10 h-80 w-80 rounded-full ${tone.accentGlow} blur-3xl`} />
          <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
        </div>

        <div className="relative z-10 grid min-h-[520px] gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.62fr)] lg:items-center lg:p-10 xl:min-h-[550px] xl:p-12">
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

            <h1 className="mt-6 max-w-3xl text-[2.15rem] font-black leading-[1.04] tracking-[-0.045em] text-white drop-shadow-[0_5px_24px_rgba(2,6,23,0.65)] sm:text-[3rem] xl:text-[3.55rem]">
              {barangayName} dengue field intelligence.
            </h1>

            <p className="mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-200/90 sm:text-[15px] sm:leading-8">
              Review barangay risk, expected cases, focused boundary coverage, field tasks, community advisories, and reporting progress from one coordinated workspace.
            </p>

            <div className="relative z-40 mt-6 max-w-xl rounded-[28px] border border-white/[0.15] bg-slate-950/[0.45] p-4 shadow-[0_18px_46px_rgba(2,6,23,0.34)] backdrop-blur-xl">
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

            <div className="bhw-mobile-grid-3 mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                { label: 'Expected cases', value: formatNumber(predictedCases), helper: 'Cumulative four-horizon forecast', icon: Activity },
                { label: 'Risk score', value: `${score}/100`, helper: 'Combined risk value', icon: ShieldAlert },
                { label: 'City hotspots', value: formatNumber(cityHighRiskCount), helper: 'High-risk barangays', icon: MapPinned },
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

          <div className="w-full self-end justify-self-end lg:max-w-[390px]">
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
                    <p className="mt-1 max-w-[180px] text-xs font-semibold leading-5 text-slate-400">{tone.status}</p>
                  </div>
                </div>

                <div
                  className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full p-[8px] shadow-[0_0_42px_rgba(56,189,248,0.18)]"
                  style={{
                    background: `conic-gradient(${risk === 'High' ? '#f43f5e' : risk === 'Moderate' ? '#f59e0b' : risk === 'Low' ? '#10b981' : '#64748b'} ${scorePercent * 3.6}deg, rgba(255,255,255,0.10) 0deg)`,
                  }}
                >
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#071525]">
                    <span className="text-2xl font-black leading-none">{score}</span>
                    <span className="mt-1 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100/70">of 100</span>
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

      <section className="bhw-mobile-grid-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={ShieldAlert} label="Expected cases" value={formatNumber(predictedCases)} helper="Cumulative forecast across the four direct horizons." tone="rose" />
        <MetricCard icon={Activity} label="Risk score" value={`${score}/100`} helper="Saved multi-source barangay risk value." tone="blue" />
        <MetricCard icon={TrendingUp} label="Trend records" value={formatNumber(weeklyTotals.length)} helper="Available historical and projected reporting points." tone="amber" />
        <MetricCard icon={MapPinned} label="City hotspots" value={formatNumber(cityHighRiskCount)} helper="High-risk barangays across the city workspace." tone="sky" />
      </section>

      <PremiumPanel tone="sky" className="p-5 sm:p-6">
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

          <div className="flex h-full flex-col gap-3">
            <div className="relative overflow-hidden rounded-[26px] border border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white to-blue-50/75 p-5 shadow-[0_16px_40px_rgba(14,165,233,0.10)] dark:border-sky-400/20 dark:from-sky-500/10 dark:via-slate-950 dark:to-blue-500/5">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-600 via-blue-400 to-cyan-300" />
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Coverage area</p>
              <p className="mt-2 break-words text-xl font-black tracking-tight text-brand-text dark:text-white">{barangayName}</p>
              <p className="mt-2 text-sm leading-6 text-brand-muted dark:text-slate-400">Use the highlighted polygon as the official reference for inspections, cleanup activities, advisories, and field reporting.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[24px] border border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-orange-50 p-4 shadow-sm dark:border-rose-400/20 dark:from-rose-500/10 dark:via-slate-950 dark:to-orange-500/5">
                <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">Expected cases</p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{formatNumber(predictedCases)}</p>
              </div>
              <div className="rounded-[24px] border border-blue-200/70 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4 shadow-sm dark:border-blue-400/20 dark:from-blue-500/10 dark:via-slate-950 dark:to-cyan-500/5">
                <p className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">Risk score</p>
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
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Recommended today</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-brand-text dark:text-white">Barangay response action</h2>
            </div>
          </div>

          <div className={`relative mt-5 overflow-hidden rounded-[28px] border p-5 shadow-sm ${style.card}`}>
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.gradient}`} />
            <p className="text-sm font-semibold leading-7">{getAction(risk)}</p>
          </div>

          <div className="bhw-mobile-grid-3 mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Inspect water storage and canals', icon: Droplets, theme: 'sky' },
              { label: 'Coordinate cleanup drive', icon: Home, theme: 'emerald' },
              { label: 'Issue household reminders', icon: Megaphone, theme: 'amber' },
            ].map((item, index) => {
              const Icon = item.icon
              const actionTheme = getMetricTheme(item.theme)

              return (
                <div key={item.label} className={`group/action relative min-h-[140px] overflow-hidden rounded-[24px] border p-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(15,23,42,0.13)] ${actionTheme.surface}`}>
                  <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${actionTheme.line}`} />
                  <div className={`flex h-11 w-11 items-center justify-center rounded-[16px] border ${actionTheme.icon}`}><Icon className="h-5 w-5" /></div>
                  <p className="mt-4 text-sm font-black leading-5 text-brand-text dark:text-slate-100">{item.label}</p>
                  <span className="absolute bottom-4 right-4 flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/70 text-[10px] font-black text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{index + 1}</span>
                </div>
              )
            })}
          </div>
        </PremiumPanel>

        <PremiumPanel tone="blue" className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-blue-200 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Direct multi-step forecast</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-brand-text dark:text-white">Local forecast timeline</h2>
            </div>
          </div>

          <div className="mt-3 rounded-[20px] border border-blue-200/70 bg-blue-50/70 px-4 py-3 text-xs font-semibold leading-5 text-blue-800 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
            {localForecasts.length === 4 ? (
              <>
                These are the saved direct multi-step horizon predictions for {barangayName}. The four values total{' '}
                <span className="font-black">{formatNumber(localForecastTotal)} cases</span>
                {localForecastMatchesCumulative
                  ? ', matching the cumulative barangay forecast.'
                  : '.'}
              </>
            ) : (
              <>
                Direct horizon predictions are not available for this barangay yet. The workspace will not invent period values from the cumulative forecast.
              </>
            )}
          </div>

          <div className="mt-5 space-y-3">
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
                          Horizon {row.horizon || index + 1} · Direct multi-step prediction
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
                No direct barangay horizon forecast is available yet. Ask the CHO account to run the latest dengue forecast so the four saved CatBoost horizon predictions can be displayed here.
              </div>
            )}
          </div>
        </PremiumPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)]">
        <PremiumPanel tone="amber" className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-amber-200 bg-amber-50 text-amber-700 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Field checklist</p>
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

          <label className="mt-5 block">
            <span className="text-sm font-black text-brand-text dark:text-white">Field observation note</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-brand-muted dark:text-slate-400">Record breeding sites, household concerns, symptoms reported, supplies needed, or coordination completed.</span>
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

          <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
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

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={saveFieldUpdate} disabled={!canEditFieldUpdate || Boolean(fieldUpdateBusy) || isLoadingFieldUpdate} className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/25 dark:bg-slate-950 dark:text-blue-200">{fieldUpdateBusy === 'draft' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}Save Draft</button>
            <button type="button" onClick={submitToSupervisor} disabled={!canEditFieldUpdate || Boolean(fieldUpdateBusy) || isLoadingFieldUpdate} className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 px-4 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">{fieldUpdateBusy === 'submit' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Submit to Supervisor</button>
            {fieldUpdate.fieldUpdateId && fieldUpdate.status !== 'Draft' ? (
              <Link to={`/reports?field_update_id=${encodeURIComponent(fieldUpdate.fieldUpdateId)}`} className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-brand-text shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><FileText className="h-5 w-5" />Prepare Official Report</Link>
            ) : (
              <button type="button" disabled className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-slate-100 px-4 py-3 text-center text-sm font-black text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"><FileText className="h-5 w-5" />Submit Before Reporting</button>
            )}
          </div>
        </PremiumPanel>

        <div className="grid content-start gap-4">
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
