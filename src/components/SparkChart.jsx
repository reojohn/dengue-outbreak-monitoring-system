import { useId } from 'react'
import { BarChart3, Loader2 } from 'lucide-react'

function formatValue(value) {
  const number = Number(value || 0)

  if (number >= 1000) {
    return `${(number / 1000).toFixed(1)}k`
  }

  return number.toLocaleString()
}

export default function SparkChart({
  values = [],
  labels = [],
  title = 'Weekly dengue case values',
  emptyLabel = 'No chart data available yet',
  loading = false,
}) {
  const chartId = useId()

  const width = 520
  const height = 220
  const padding = 34
  const bottomLabelSpace = 30
  const topLabelSpace = 24

  const cleanValues = values
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value))

  const hasData = cleanValues.length > 0
  const maxValue = Math.max(...cleanValues, 1)

  const chartTop = padding + topLabelSpace
  const chartBottom = height - padding - bottomLabelSpace
  const chartHeight = chartBottom - chartTop
  const chartWidth = width - padding * 2

  const pointData = cleanValues.map((value, index) => {
    const x =
      padding + (index * chartWidth) / Math.max(cleanValues.length - 1, 1)

    const y = chartBottom - (value / (maxValue * 1.15)) * chartHeight

    return {
      value,
      label: labels[index] || `W${index + 1}`,
      x,
      y,
    }
  })

  const linePoints = pointData.map((point) => `${point.x},${point.y}`).join(' ')

  const areaPoints = hasData
    ? [
        `${padding},${chartBottom}`,
        ...pointData.map((point) => `${point.x},${point.y}`),
        `${width - padding},${chartBottom}`,
      ].join(' ')
    : ''

  const gridLines = Array.from({ length: 4 }, (_, index) => {
    const y = chartTop + (index * chartHeight) / 3
    const value = Math.round(maxValue - (index * maxValue) / 3)

    return {
      y,
      value,
    }
  })

  if (loading) {
    return (
      <div className="flex h-full min-h-[220px] w-full items-center justify-center rounded-[28px] border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
            <Loader2 className="animate-spin" size={24} />
          </div>

          <p className="mt-3 text-sm font-semibold text-brand-text dark:text-slate-100">
            Loading chart
          </p>

          <p className="mt-1 text-xs text-brand-muted dark:text-slate-400">
            Preparing trend values...
          </p>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="flex h-full min-h-[220px] w-full items-center justify-center rounded-[28px] border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-brand-muted dark:bg-slate-900 dark:text-slate-400">
            <BarChart3 size={24} />
          </div>

          <p className="mt-3 text-sm font-semibold text-brand-text dark:text-slate-100">
            {emptyLabel}
          </p>

          <p className="mt-1 text-xs text-brand-muted dark:text-slate-400">
            Upload validated dengue records to generate this trend.
          </p>
        </div>
      </div>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full overflow-visible"
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${chartId}-area`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#D56A6A" stopOpacity="0.28" />
          <stop offset="55%" stopColor="#D56A6A" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#D56A6A" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={`${chartId}-line`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#E29A3B" />
          <stop offset="55%" stopColor="#D56A6A" />
          <stop offset="100%" stopColor="#2D6EA3" />
        </linearGradient>

        <filter id={`${chartId}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="8"
            floodColor="#D56A6A"
            floodOpacity="0.18"
          />
        </filter>
      </defs>

      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="26"
        className="fill-white dark:fill-slate-950"
      />

      <text
        x={padding}
        y={18}
        className="fill-brand-muted text-[11px] font-bold uppercase tracking-[0.18em] dark:fill-slate-400"
      >
        {title}
      </text>

      {gridLines.map((line, index) => (
        <g key={`grid-${index}`}>
          <line
            x1={padding}
            y1={line.y}
            x2={width - padding}
            y2={line.y}
            strokeDasharray={index === gridLines.length - 1 ? '0' : '5 8'}
            className="stroke-slate-200 dark:stroke-slate-800"
            strokeWidth="1.5"
          />

          <text
            x={padding - 10}
            y={line.y + 4}
            textAnchor="end"
            className="fill-brand-muted text-[10px] font-semibold dark:fill-slate-500"
          >
            {formatValue(line.value)}
          </text>
        </g>
      ))}

      <line
        x1={padding}
        y1={chartTop}
        x2={padding}
        y2={chartBottom}
        className="stroke-slate-200 dark:stroke-slate-800"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <line
        x1={padding}
        y1={chartBottom}
        x2={width - padding}
        y2={chartBottom}
        className="stroke-slate-200 dark:stroke-slate-800"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <polygon points={areaPoints} fill={`url(#${chartId}-area)`} />

      <polyline
        points={linePoints}
        fill="none"
        stroke={`url(#${chartId}-line)`}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${chartId}-shadow)`}
        className="spark-draw-line"
      />

      {pointData.map((point, index) => (
        <g
          key={`${point.label}-${point.value}-${index}`}
          className="spark-fade-up"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <line
            x1={point.x}
            y1={point.y + 8}
            x2={point.x}
            y2={chartBottom}
            className="stroke-slate-100 dark:stroke-slate-800"
            strokeWidth="1"
            strokeDasharray="4 7"
          />

          <rect
            x={point.x - 15}
            y={point.y - 30}
            width="30"
            height="18"
            rx="9"
            className="fill-slate-50 dark:fill-slate-900"
          />

          <text
            x={point.x}
            y={point.y - 17}
            textAnchor="middle"
            className="fill-brand-text text-[10px] font-black dark:fill-slate-100"
          >
            {formatValue(point.value)}
          </text>

          <circle
            cx={point.x}
            cy={point.y}
            r="7"
            fill="#D56A6A"
            opacity="0.16"
          />

          <circle
            cx={point.x}
            cy={point.y}
            r="4.8"
            fill="#D56A6A"
            className="stroke-white dark:stroke-slate-950"
            strokeWidth="2.5"
          />

          <text
            x={point.x}
            y={chartBottom + 20}
            textAnchor="middle"
            className="fill-brand-muted text-[11px] font-bold dark:fill-slate-500"
          >
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  )
}