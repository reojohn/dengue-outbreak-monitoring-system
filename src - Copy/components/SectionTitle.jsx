import { Sparkles } from 'lucide-react'

export default function SectionTitle({
  title,
  subtitle,
  right,
  badge,
  icon: Icon = Sparkles,
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-brand-blue shadow-sm dark:bg-blue-500/10 dark:text-blue-300">
              <Icon size={17} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-brand-text dark:text-slate-100">
                  {title}
                </h2>

                {badge ? (
                  <span className="rounded-full border border-brand-line bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-muted shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                    {badge}
                  </span>
                ) : null}
              </div>

              {subtitle ? (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-muted dark:text-slate-400">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {right ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {right}
          </div>
        ) : null}
      </div>

      <div className="mt-4 h-px w-full bg-gradient-to-r from-brand-line via-brand-line to-transparent dark:from-slate-800 dark:via-slate-800 dark:to-transparent" />
    </div>
  )
}