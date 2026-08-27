import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronDown, Layers3 } from 'lucide-react'

const TONES = {
  cyan: {
    trigger: 'border-cyan-400/35 from-[#07131f] via-[#0a1d2b] to-[#0b2736] shadow-[0_18px_40px_rgba(2,8,23,0.24)] hover:border-cyan-300/60 hover:shadow-[0_22px_50px_rgba(6,182,212,0.18)] dark:border-cyan-400/30 dark:from-[#050d17] dark:via-[#081923] dark:to-[#0a2632]',
    accent: 'from-cyan-400 via-sky-400 to-blue-500',
    orb: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200 shadow-[0_8px_22px_rgba(6,182,212,0.16)] dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200',
    soft: 'bg-cyan-300/20 dark:bg-cyan-400/10',
    menu: 'border-cyan-200/90 shadow-[0_28px_70px_rgba(8,145,178,0.20)] dark:border-cyan-400/20',
    badge: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200',
    option: 'hover:border-cyan-200 hover:bg-cyan-50/80 dark:hover:border-cyan-400/20 dark:hover:bg-cyan-400/10',
    active: 'border-cyan-300 bg-gradient-to-br from-cyan-50 via-white to-sky-50 text-cyan-900 shadow-[0_10px_22px_rgba(8,145,178,0.10)] dark:border-cyan-400/30 dark:from-cyan-500/10 dark:via-slate-900 dark:to-sky-500/10 dark:text-cyan-100',
    section: 'text-cyan-700 dark:text-cyan-300',
  },
  amber: {
    trigger: 'border-amber-400/35 from-[#17130a] via-[#20190b] to-[#2c1d0a] shadow-[0_18px_40px_rgba(2,8,23,0.24)] hover:border-amber-300/60 hover:shadow-[0_22px_50px_rgba(245,158,11,0.16)] dark:border-amber-400/30 dark:from-[#100d07] dark:via-[#181206] dark:to-[#261707]',
    accent: 'from-amber-400 via-orange-400 to-rose-400',
    orb: 'border-amber-300/30 bg-amber-300/10 text-amber-200 shadow-[0_8px_22px_rgba(245,158,11,0.14)] dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200',
    soft: 'bg-amber-300/20 dark:bg-amber-400/10',
    menu: 'border-amber-200/90 shadow-[0_28px_70px_rgba(245,158,11,0.18)] dark:border-amber-400/20',
    badge: 'border-amber-300/30 bg-amber-300/10 text-amber-200 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    option: 'hover:border-amber-200 hover:bg-amber-50/80 dark:hover:border-amber-400/20 dark:hover:bg-amber-400/10',
    active: 'border-amber-300 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-900 shadow-[0_10px_22px_rgba(245,158,11,0.10)] dark:border-amber-400/30 dark:from-amber-500/10 dark:via-slate-900 dark:to-orange-500/10 dark:text-amber-100',
    section: 'text-amber-700 dark:text-amber-300',
  },
}

function OptionButton({ option, value, onSelect, styles, compact = false }) {
  const isSelected = String(option.value) === String(value)

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(option.value)}
      className={`group relative flex min-h-[52px] w-full items-center justify-between gap-2 overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition duration-200 ${isSelected ? styles.active : `border-slate-200/70 bg-white/80 text-slate-700 ${styles.option} dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200`}`}
    >
      <div className="min-w-0">
        <p className="trend-filter-option-label break-words text-[13px] font-black leading-5">{option.label}</p>
        {!compact && option.note ? (
          <p className="trend-filter-option-note mt-0.5 break-words text-[10px] font-semibold leading-4 opacity-70">{option.note}</p>
        ) : null}
      </div>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${isSelected ? 'border-current bg-white/70 dark:bg-white/10' : 'border-slate-200/90 text-transparent group-hover:border-slate-300 dark:border-white/10'}`}>
        <Check className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

export default function TrendFilterDropdown({
  label,
  value,
  options = [],
  onChange,
  emptyLabel,
  tone = 'cyan',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const styles = TONES[tone] || TONES.cyan
  const isPeriod = label.toLowerCase() === 'period'
  const isYear = label.toLowerCase() === 'year'

  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const selectedOption = options.find((option) => String(option.value) === String(value))

  const groupedPeriodOptions = useMemo(() => {
    if (!isPeriod) return null
    return {
      coverage: options.filter((option) => option.value === 'all'),
      quarters: options.filter((option) => String(option.value).startsWith('q')),
      months: options.filter((option) => String(option.value).startsWith('m')),
    }
  }, [isPeriod, options])

  function choose(nextValue) {
    onChange?.(String(nextValue))
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="trend-filter-dropdown relative min-w-0">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.20em] text-slate-500 dark:text-slate-400">{label}</span>

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`group relative flex min-h-[70px] w-full items-center justify-between gap-3 overflow-hidden rounded-[24px] border bg-gradient-to-br px-3.5 py-3 text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${styles.trigger}`}
      >
        <span className={`pointer-events-none absolute inset-x-5 top-0 h-[2px] rounded-full bg-gradient-to-r ${styles.accent}`} />
        <span className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${styles.soft}`} />

        <div className="relative flex min-w-0 items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${styles.orb}`}>
            {isPeriod ? <Layers3 className="h-[18px] w-[18px]" /> : <CalendarDays className="h-[18px] w-[18px]" />}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="trend-filter-selected-label break-words text-[15px] font-black leading-5 tracking-[-0.02em] text-white">{selectedOption?.label || emptyLabel}</p>
              <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] sm:inline-flex ${styles.badge}`}>
                Active
              </span>
            </div>
            <p className="trend-filter-selected-note mt-0.5 break-words text-[11px] font-semibold leading-4 text-slate-300/85">{selectedOption?.note || `Choose ${label.toLowerCase()}`}</p>
          </div>
        </div>
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-300 shadow-sm transition group-hover:bg-white/[0.10]">
          <ChevronDown className={`h-4 w-4 transition duration-200 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && !disabled && (
        <div
          className={`absolute right-0 z-50 mt-2 w-[min(720px,calc(100vw-2rem))] overflow-hidden rounded-[28px] border bg-white/95 backdrop-blur-2xl ${styles.menu} dark:bg-slate-950/96`}
        >
          <div className="relative overflow-hidden border-b border-slate-200/80 px-4 py-3.5 dark:border-white/10 sm:px-5">
            <span className={`pointer-events-none absolute inset-x-8 top-0 h-[2px] rounded-full bg-gradient-to-r ${styles.accent}`} />
            <span className={`pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full blur-2xl ${styles.soft}`} />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-800 dark:text-slate-100">Choose {label.toLowerCase()}</p>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">All choices are visible here, so you can select without scrolling.</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${styles.badge}`}>
                {options.length} choices
              </span>
            </div>
          </div>

          {isPeriod && groupedPeriodOptions ? (
            <div className="space-y-3 p-3 sm:p-4">
              <div>
                <p className={`mb-1.5 px-1 text-[9px] font-black uppercase tracking-[0.18em] ${styles.section}`}>Coverage</p>
                <div className="grid grid-cols-1">
                  {groupedPeriodOptions.coverage.map((option) => (
                    <OptionButton key={option.value} option={option} value={value} onSelect={choose} styles={styles} compact />
                  ))}
                </div>
              </div>

              <div>
                <p className={`mb-1.5 px-1 text-[9px] font-black uppercase tracking-[0.18em] ${styles.section}`}>Quarters</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {groupedPeriodOptions.quarters.map((option) => (
                    <OptionButton key={option.value} option={option} value={value} onSelect={choose} styles={styles} compact />
                  ))}
                </div>
              </div>

              <div>
                <p className={`mb-1.5 px-1 text-[9px] font-black uppercase tracking-[0.18em] ${styles.section}`}>Months</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {groupedPeriodOptions.months.map((option) => (
                    <OptionButton key={option.value} option={option} value={value} onSelect={choose} styles={styles} compact />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={`grid gap-2 p-3 sm:p-4 ${isYear ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {options.map((option) => (
                <OptionButton key={option.value} option={option} value={value} onSelect={choose} styles={styles} compact={isYear} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
