import { Activity, AlertTriangle, BarChart3, Database } from 'lucide-react'

const cardStyles = {
  blue: {
    icon: Database,
    border: 'border-blue-100 dark:border-blue-500/20',
    iconBox: 'bg-blue-50 text-brand-blue dark:bg-blue-500/10 dark:text-blue-300',
    glow: 'bg-blue-400/10',
    dot: 'bg-blue-500',
  },
  red: {
    icon: AlertTriangle,
    border: 'border-rose-100 dark:border-rose-500/20',
    iconBox: 'bg-rose-50 text-brand-red dark:bg-rose-500/10 dark:text-rose-300',
    glow: 'bg-rose-400/10',
    dot: 'bg-rose-500',
  },
  orange: {
    icon: BarChart3,
    border: 'border-amber-100 dark:border-amber-500/20',
    iconBox: 'bg-amber-50 text-brand-orange dark:bg-amber-500/10 dark:text-amber-300',
    glow: 'bg-amber-400/10',
    dot: 'bg-amber-500',
  },
  green: {
    icon: Activity,
    border: 'border-emerald-100 dark:border-emerald-500/20',
    iconBox: 'bg-emerald-50 text-brand-green dark:bg-emerald-500/10 dark:text-emerald-300',
    glow: 'bg-emerald-400/10',
    dot: 'bg-emerald-500',
  },
}

export default function StatCard({
  title,
  value,
  color = 'blue',
  subtitle = 'Current system value',
  status = 'Updated',
  loading = false,
}) {
  const style = cardStyles[color] || cardStyles.blue
  const Icon = style.icon

  return (
    <div
      className={`group relative overflow-hidden rounded-[28px] border bg-white p-5 shadow-panel transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(15,23,42,0.12)] dark:bg-slate-950/80 dark:shadow-none ${style.border}`}
    >
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl transition duration-300 group-hover:scale-125 ${style.glow}`}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${style.dot}`} />

            <p className="truncate text-sm font-medium text-brand-muted dark:text-slate-400">
              {title}
            </p>
          </div>

          {loading ? (
            <div className="mt-4 h-9 w-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ) : (
            <p className="mt-3 text-3xl font-black tracking-tight text-brand-text dark:text-slate-100">
              {value}
            </p>
          )}

          <p className="mt-2 line-clamp-1 text-xs text-brand-muted dark:text-slate-500">
            {subtitle}
          </p>
        </div>

        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition duration-300 group-hover:scale-110 group-hover:rotate-3 ${style.iconBox}`}
        >
          <Icon size={21} />
        </div>
      </div>

      <div className="relative mt-5 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="text-xs font-semibold text-brand-muted dark:text-slate-500">
          {status}
        </span>

        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <span
            className={`block h-full w-2/3 rounded-full ${style.dot}`}
          />
        </span>
      </div>
    </div>
  )
}