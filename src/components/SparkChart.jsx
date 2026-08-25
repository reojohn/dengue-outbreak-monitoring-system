import { useId, useMemo } from 'react'
import { BarChart3, Loader2 } from 'lucide-react'

function formatValue(value) {
  const number = Number(value || 0)

  if (number >= 1000) {
    return `${(number / 1000).toFixed(1)}k`
  }

  return number.toLocaleString()
}

function createSmoothPath(points = []) {
  if (!points.length) return ''

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
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

function getNiceMaximum(value) {
  const maximum = Math.max(0, Number(value || 0))

  if (maximum <= 10) return 10
  if (maximum <= 50) return Math.ceil(maximum / 10) * 10
  if (maximum <= 100) return Math.ceil(maximum / 20) * 20
  if (maximum <= 500) return Math.ceil(maximum / 50) * 50

  const magnitude = 10 ** Math.floor(Math.log10(maximum))
  return Math.ceil(maximum / magnitude) * magnitude
}

function ChartState({ loading, label }) {
  return (
    <div className="flex h-full min-h-[260px] w-full items-center justify-center rounded-[24px] border border-cyan-400/[0.15] bg-gradient-to-b from-[#061321] via-[#06111d] to-[#020817] px-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_70px_rgba(2,8,23,0.42)]">
      <div>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
          {loading ? <Loader2 className="animate-spin" size={24} /> : <BarChart3 size={24} />}
        </div>
        <p className="mt-3 text-base font-bold text-slate-100">{label}</p>
        <p className="mt-1 text-sm font-medium leading-6 text-slate-300">
          {loading ? 'Preparing the recorded dengue trend…' : 'Upload validated dengue records to generate this trend.'}
        </p>
      </div>
    </div>
  )
}

export default function SparkChart({
  values = [],
  labels = [],
  title = 'Dengue case values',
  subtitle = 'Recorded monthly dengue cases for the selected period',
  emptyLabel = 'No chart data available yet',
  loading = false,
}) {
  const rawId = useId()
  const chartId = rawId.replace(/:/g, '')

  const chart = useMemo(() => {
    const numericValues = values
      .map((value) => Number(value || 0))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, value))

    const width = 1000
    const height = 620
    const left = 92
    const right = 934
    const top = 190
    const baseline = 445
    const maximum = getNiceMaximum(Math.max(...numericValues, 0))
    const count = numericValues.length
    const step = count > 1 ? (right - left) / (count - 1) : 0

    const points = numericValues.map((value, index) => ({
      x: count === 1 ? (left + right) / 2 : left + step * index,
      y: baseline - (value / maximum) * (baseline - top),
      value,
      label: labels[index] || `P${index + 1}`,
    }))

    const linePath = createSmoothPath(points)
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
      maximum,
      points,
      linePath,
      areaPath,
      ticks,
    }
  }, [values, labels])

  if (loading) {
    return <ChartState loading label="Loading chart" />
  }

  if (!chart.points.length) {
    return <ChartState label={emptyLabel} />
  }

  const ids = {
    background: `${chartId}-background`,
    line: `${chartId}-line`,
    area: `${chartId}-area`,
    depth: `${chartId}-depth`,
    floor: `${chartId}-floor`,
    floorEdge: `${chartId}-floor-edge`,
    spotlight: `${chartId}-spotlight`,
    surface: `${chartId}-surface`,
    softGlow: `${chartId}-soft-glow`,
    strongGlow: `${chartId}-strong-glow`,
    platformShadow: `${chartId}-platform-shadow`,
    areaClip: `${chartId}-area-clip`,
  }

  return (
    <div className="h-full w-full overflow-hidden rounded-[20px] sm:rounded-[24px]">
      <div className="h-full w-full min-w-0">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label={`${title}. ${chart.points
            .map((point) => `${point.label}: ${formatValue(point.value)} cases`)
            .join(', ')}`}
          className="h-full w-full select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <title>{title}</title>
          <desc>{subtitle}</desc>

          <defs>
            <linearGradient id={ids.background} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#020617" />
              <stop offset="45%" stopColor="#071827" />
              <stop offset="100%" stopColor="#03111f" />
            </linearGradient>

            <linearGradient id={ids.line} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="55%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>

            <linearGradient id={ids.area} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.46" />
              <stop offset="55%" stopColor="#0ea5e9" stopOpacity="0.56" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.68" />
            </linearGradient>

            <linearGradient id={ids.depth} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
              <stop offset="55%" stopColor="#0369a1" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </linearGradient>

            <linearGradient id={ids.floor} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
              <stop offset="45%" stopColor="#0f2c42" stopOpacity="0.94" />
              <stop offset="100%" stopColor="#020617" stopOpacity="1" />
            </linearGradient>

            <linearGradient id={ids.floorEdge} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.78" />
              <stop offset="50%" stopColor="#f8fafc" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.96" />
            </linearGradient>

            <radialGradient id={ids.spotlight} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>

            <pattern id={ids.surface} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 0 24 L 24 0" stroke="#ffffff" strokeOpacity="0.035" strokeWidth="1" />
              <path d="M -6 18 L 6 6 M 18 30 L 30 18" stroke="#38bdf8" strokeOpacity="0.035" strokeWidth="1" />
            </pattern>

            <filter id={ids.softGlow} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id={ids.strongGlow} x="-80%" y="-80%" width="260%" height="260%">
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

            <filter id={ids.platformShadow} x="-20%" y="-50%" width="140%" height="220%">
              <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#000000" floodOpacity="0.65" />
            </filter>

            <clipPath id={ids.areaClip}>
              <path d={chart.areaPath} />
            </clipPath>
          </defs>

          <rect
            x="2"
            y="2"
            width={chart.width - 4}
            height={chart.height - 4}
            rx="34"
            fill={`url(#${ids.background})`}
            stroke="#0ea5e9"
            strokeOpacity="0.18"
          />

          <ellipse cx="760" cy="220" rx="300" ry="220" fill={`url(#${ids.spotlight})`} />

          <g opacity="0.5">
            {chart.ticks.map((tick) => (
              <line
                key={`grid-${tick.value}`}
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

          <text
            x="36"
            y="56"
            fill="#f8fafc"
            fontSize="26"
            fontWeight="700"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            {title}
          </text>

          <text
            x="36"
            y="82"
            fill="#94a3b8"
            fontSize="15"
            fontWeight="600"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            {subtitle}
          </text>

          <text
            x="38"
            y={chart.top - 42}
            fill="#94a3b8"
            fontSize="15"
            fontWeight="700"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            Cases
          </text>

          {chart.ticks.map((tick) => (
            <text
              key={`tick-${tick.value}`}
              x={chart.left - 24}
              y={tick.y + 5}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="14"
              fontWeight="700"
              fontFamily="Inter, ui-sans-serif, system-ui"
            >
              {formatValue(Math.round(tick.value))}
            </text>
          ))}

          <g filter={`url(#${ids.platformShadow})`}>
            <path
              d={`M 52 ${chart.baseline} L 948 ${chart.baseline} L 982 ${chart.baseline + 44} L 22 ${chart.baseline + 44} Z`}
              fill={`url(#${ids.floor})`}
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
              stroke={`url(#${ids.floorEdge})`}
              strokeWidth="3"
              filter={`url(#${ids.softGlow})`}
            />
          </g>

          <g opacity="0.2">
            {Array.from({ length: 14 }, (_, index) => {
              const x = 70 + index * 66
              return (
                <line
                  key={`floor-grid-${index}`}
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
                  key={`floor-line-${offset}`}
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
            fill={`url(#${ids.depth})`}
            opacity="0.52"
            filter={`url(#${ids.softGlow})`}
          />

          <path
            d={chart.areaPath}
            fill={`url(#${ids.area})`}
            stroke={`url(#${ids.line})`}
            strokeWidth="2"
            opacity="0.94"
          />

          <rect
            x={chart.left}
            y={chart.top}
            width={chart.right - chart.left}
            height={chart.baseline - chart.top}
            fill={`url(#${ids.surface})`}
            clipPath={`url(#${ids.areaClip})`}
          />

          <path
            d={chart.linePath}
            fill="none"
            stroke={`url(#${ids.line})`}
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.2"
            filter={`url(#${ids.strongGlow})`}
          />

          <path
            d={chart.linePath}
            fill="none"
            stroke={`url(#${ids.line})`}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${ids.softGlow})`}
          />

          {chart.points.map((point, index) => (
            <g key={`${point.label}-${index}`}>
              <title>{`${point.label}: ${formatValue(point.value)} cases`}</title>

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
                filter={`url(#${ids.softGlow})`}
              />

              <circle
                cx={point.x}
                cy={point.y}
                r="15"
                fill="#38bdf8"
                fillOpacity="0.22"
                filter={`url(#${ids.strongGlow})`}
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
                y={Math.max(36, point.y - 21)}
                textAnchor="middle"
                fill="#67e8f9"
                fontSize="20"
                fontWeight="800"
                fontFamily="Inter, ui-sans-serif, system-ui"
                style={{ filter: 'drop-shadow(0 0 8px #38bdf8)' }}
              >
                {formatValue(point.value)}
              </text>

              <text
                x={point.x}
                y={chart.baseline + 112}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="15"
                fontWeight="700"
                fontFamily="Inter, ui-sans-serif, system-ui"
              >
                {point.label}
              </text>
            </g>
          ))}

          <g transform={`translate(350 ${chart.baseline + 150})`}>
            <rect x="0" y="-14" width="22" height="14" rx="4" fill={`url(#${ids.line})`} />
            <rect x="0" y="-14" width="22" height="14" rx="4" fill="none" stroke="#bae6fd" strokeOpacity="0.5" />
            <text
              x="34"
              y="-2"
              fill="#e2e8f0"
              fontSize="16"
              fontWeight="700"
              fontFamily="Inter, ui-sans-serif, system-ui"
            >
              Actual dengue cases
            </text>
          </g>
        </svg>
      </div>
    </div>
  )
}
