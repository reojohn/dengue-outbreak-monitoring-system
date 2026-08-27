const STYLES = {
  recorded: {
    label: 'Recorded data',
    title: 'Actual values from the uploaded and validated dengue records.',
    className: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200',
  },
  forecast: {
    label: 'Forecast',
    title: 'Model-generated future estimate. This is not a recorded case count.',
    className: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200',
  },
  decision: {
    label: 'Decision support',
    title: 'Planning guidance derived from forecast, risk, trend, weather, population, density, or spatial context.',
    className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
  },
  field: {
    label: 'BHW field report',
    title: 'Observation or status submitted by a barangay health worker.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
  },
}

export default function InformationTypeBadge({ type = 'recorded', label, className = '' }) {
  const config = STYLES[type] || STYLES.recorded

  return (
    <span
      data-information-type={type}
      title={config.title}
      className={`information-type-badge inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.11em] shadow-sm ${config.className} ${className}`.trim()}
    >
      {label || config.label}
    </span>
  )
}
