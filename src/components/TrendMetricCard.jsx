const TONES = {
  blue: {
    card: 'border-sky-200/80 from-white via-sky-50/70 to-cyan-100/55 dark:border-sky-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-sky-500/10',
    accent: 'from-sky-400 via-cyan-400 to-blue-500',
    glow: 'bg-sky-300/25 dark:bg-sky-400/10',
    icon: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200',
    badge: 'border-sky-200 bg-sky-50/90 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200',
  },
  amber: {
    card: 'border-amber-200/90 from-white via-amber-50/70 to-orange-100/55 dark:border-amber-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-amber-500/10',
    accent: 'from-amber-400 via-orange-400 to-rose-400',
    glow: 'bg-amber-300/25 dark:bg-amber-400/10',
    icon: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    badge: 'border-amber-200 bg-amber-50/90 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
  },
  emerald: {
    card: 'border-emerald-200/90 from-white via-emerald-50/70 to-teal-100/55 dark:border-emerald-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-500/10',
    accent: 'from-emerald-400 via-teal-400 to-cyan-400',
    glow: 'bg-emerald-300/25 dark:bg-emerald-400/10',
    icon: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
    badge: 'border-emerald-200 bg-emerald-50/90 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
  },
  rose: {
    card: 'border-rose-200/90 from-white via-rose-50/70 to-orange-100/45 dark:border-rose-400/20 dark:from-slate-900 dark:via-slate-900 dark:to-rose-500/10',
    accent: 'from-rose-400 via-pink-400 to-orange-400',
    glow: 'bg-rose-300/25 dark:bg-rose-400/10',
    icon: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
    badge: 'border-rose-200 bg-rose-50/90 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
  },
  slate: {
    card: 'border-slate-200/90 from-white via-slate-50/80 to-blue-50/55 dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-blue-500/10',
    accent: 'from-slate-400 via-blue-400 to-cyan-400',
    glow: 'bg-slate-300/25 dark:bg-blue-400/10',
    icon: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200',
    badge: 'border-slate-200 bg-slate-50/90 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300',
  },
}

export default function TrendMetricCard({ label, value, helper, icon: Icon, tone = 'blue', badge = 'Recorded' }) {
  const styles = TONES[tone] || TONES.blue

  return (
    <div className={`trend-metric-card group relative min-h-[126px] overflow-hidden rounded-[26px] border bg-gradient-to-br p-4 shadow-[0_16px_38px_rgba(15,23,42,0.08)] ring-1 ring-white/80 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.12)] dark:ring-white/5 ${styles.card}`}>
      <span className={`pointer-events-none absolute inset-x-5 top-0 h-[3px] rounded-full bg-gradient-to-r ${styles.accent}`} />
      <span className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${styles.glow}`} />
      <span className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-90 dark:via-white/10" />

      <div className="trend-metric-head relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="trend-metric-label text-[10px] font-black uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="trend-metric-value mt-2 break-words text-[26px] font-black leading-[1.02] tracking-[-0.045em] text-slate-950 dark:text-white">{value}</p>
        </div>
        {Icon ? (
          <span className={`trend-metric-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${styles.icon}`}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        ) : null}
      </div>

      <div className="relative mt-2 flex min-w-0 items-center justify-between gap-2">
        <p className="trend-metric-helper min-w-0 break-words text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">{helper}</p>
        <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] sm:inline-flex ${styles.badge}`}>{badge}</span>
      </div>
    </div>
  )
}
