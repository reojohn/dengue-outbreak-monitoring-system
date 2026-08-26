import React from 'react'

function SkeletonBlock({ className = '', style = undefined }) {
  return (
    <div
      aria-hidden="true"
      className={`system-skeleton-placeholder rounded-2xl bg-slate-200/80 dark:bg-slate-800/80 ${className}`}
      style={style}
    />
  )
}

function SkeletonLines({ count = 2, widths = ['100%', '72%'], className = '' }) {
  return (
    <div className={`space-y-2.5 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonBlock
          key={index}
          className="h-3.5 rounded-full"
          style={{ width: widths[index % widths.length] }}
        />
      ))}
    </div>
  )
}

function Card({ tall = false, className = '' }) {
  return (
    <div className={`system-skeleton-card-loading rounded-[24px] border border-slate-200/80 bg-white/75 p-4 dark:border-white/10 dark:bg-slate-950/55 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-3 w-24 rounded-full" />
          <SkeletonBlock className="mt-3 h-7 w-20 rounded-xl" />
        </div>
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-2xl" />
      </div>
      <SkeletonLines count={2} widths={['88%', '58%']} className="mt-4" />
      {tall ? <SkeletonBlock className="mt-4 h-20 w-full" /> : null}
    </div>
  )
}

function HeroSkeleton({ compact = false }) {
  return (
    <section className="system-skeleton-card-loading relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/60 sm:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-7 w-40 rounded-full" />
            <SkeletonBlock className="h-7 w-28 rounded-full" />
          </div>
          <SkeletonBlock className={`mt-5 ${compact ? 'h-9 w-[68%]' : 'h-12 w-[74%]'} rounded-2xl`} />
          <SkeletonBlock className="mt-3 h-4 w-[82%] rounded-full" />
          <SkeletonBlock className="mt-2 h-4 w-[58%] rounded-full" />
          <div className="mt-6 flex flex-wrap gap-3">
            <SkeletonBlock className="h-11 w-40 rounded-2xl" />
            <SkeletonBlock className="h-11 w-36 rounded-2xl" />
          </div>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 lg:max-w-[430px]">
          <Card />
          <Card />
          <Card />
          <Card />
        </div>
      </div>
    </section>
  )
}

function ChartSkeleton({ tall = false }) {
  return (
    <section className="system-skeleton-card-loading rounded-[28px] border border-slate-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-slate-950/55 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-6 w-48 rounded-full" />
          <SkeletonLines count={2} widths={['72%', '48%']} className="mt-3 max-w-2xl" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-10 w-28 rounded-2xl" />
          <SkeletonBlock className="h-10 w-28 rounded-2xl" />
        </div>
      </div>
      <div className={`mt-5 overflow-hidden rounded-[24px] bg-slate-100/90 p-4 dark:bg-slate-900/80 ${tall ? 'h-[360px]' : 'h-[260px]'}`}>
        <div className="flex h-full items-end gap-2">
          {[42, 58, 34, 72, 50, 65, 38, 78, 55, 67, 44, 61].map((height, index) => (
            <SkeletonBlock key={index} className="min-w-0 flex-1 rounded-t-xl" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ListSkeleton({ rows = 4 }) {
  return (
    <section className="system-skeleton-card-loading rounded-[28px] border border-slate-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-slate-950/55 sm:p-6">
      <SkeletonBlock className="h-6 w-44 rounded-full" />
      <SkeletonLines count={2} widths={['66%', '42%']} className="mt-3" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="rounded-[22px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-900/65">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-4 w-36 rounded-full" />
                <SkeletonBlock className="mt-2 h-3 w-[62%] rounded-full" />
              </div>
              <SkeletonBlock className="h-8 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MapSkeleton() {
  return (
    <section className="system-skeleton-card-loading rounded-[28px] border border-slate-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-slate-950/55 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <SkeletonBlock className="h-6 w-44 rounded-full" />
          <SkeletonBlock className="mt-3 h-3.5 w-64 max-w-full rounded-full" />
        </div>
        <SkeletonBlock className="h-10 w-28 rounded-2xl" />
      </div>
      <SkeletonBlock className="mt-5 h-[380px] w-full rounded-[26px]" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card />
        <Card />
        <Card />
        <Card />
      </div>
    </section>
  )
}

function UploadSkeleton() {
  return (
    <>
      <HeroSkeleton compact />
      <section className="system-skeleton-card-loading grid gap-4 rounded-[28px] border border-slate-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-slate-950/55 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        <Card tall />
        <Card tall />
        <Card tall />
        <Card tall />
      </section>
      <ListSkeleton rows={5} />
    </>
  )
}

function ForecastSkeleton() {
  return (
    <>
      <HeroSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card />
        <Card />
        <Card />
        <Card />
      </div>
      <ChartSkeleton />
      <ListSkeleton rows={5} />
    </>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <HeroSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card />
        <Card />
        <Card />
        <Card />
      </div>
      <ChartSkeleton />
      <ChartSkeleton />
    </>
  )
}

function BhwSkeleton() {
  return (
    <>
      <HeroSkeleton compact />
      <ChartSkeleton tall />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card />
        <Card />
        <Card />
        <Card />
      </div>
      <ListSkeleton rows={5} />
    </>
  )
}

function SupervisorSkeleton() {
  return (
    <>
      <HeroSkeleton compact />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card />
        <Card />
        <Card />
        <Card />
      </div>
      <ListSkeleton rows={4} />
      <ListSkeleton rows={3} />
    </>
  )
}

function ReportsSkeleton() {
  return (
    <>
      <HeroSkeleton compact />
      <ChartSkeleton />
      <ListSkeleton rows={3} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card />
        <Card />
        <Card />
        <Card />
      </div>
    </>
  )
}

function UsersSkeleton() {
  return (
    <>
      <HeroSkeleton compact />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card />
        <Card />
        <Card />
        <Card />
      </div>
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card tall className="min-h-[330px]" />
        <ListSkeleton rows={5} />
      </section>
    </>
  )
}

export function SystemPageSkeleton({ pathname = '' }) {
  const path = String(pathname || '').toLowerCase()
  let content = <DashboardSkeleton />

  if (path.includes('/upload')) content = <UploadSkeleton />
  else if (path.includes('/forecast')) content = <ForecastSkeleton />
  else if (path.includes('/map')) content = <><HeroSkeleton compact /><MapSkeleton /><ListSkeleton rows={4} /></>
  else if (path.includes('/bhw')) content = <BhwSkeleton />
  else if (path.includes('/supervisor')) content = <SupervisorSkeleton />
  else if (path.includes('/reports')) content = <ReportsSkeleton />
  else if (path.includes('/users')) content = <UsersSkeleton />

  return (
    <div
      className="system-page-skeleton space-y-5 pb-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading saved dengue monitoring information"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-sky-200/70 bg-sky-50/85 px-4 py-3 text-sm font-bold text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
        <span
          aria-hidden="true"
          className="system-skeleton-loading-dot h-3 w-3 shrink-0 rounded-full bg-sky-500 dark:bg-sky-300"
        />
        <span>Loading saved system information…</span>
      </div>
      {content}
    </div>
  )
}

export function TrendPanelSkeleton({ className = '' }) {
  return (
    <section className={`system-skeleton-card-loading rounded-[28px] border border-sky-200/70 bg-white/85 p-4 shadow-sm dark:border-sky-400/15 dark:bg-slate-950/65 sm:p-6 ${className}`} role="status" aria-label="Loading recorded dengue trend" aria-busy="true">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-7 w-48 rounded-full" />
          <SkeletonBlock className="mt-4 h-8 w-64 max-w-full rounded-xl" />
          <SkeletonLines count={2} widths={['78%', '58%']} className="mt-3 max-w-3xl" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:w-[360px]">
          <SkeletonBlock className="h-12 w-full rounded-2xl" />
          <SkeletonBlock className="h-12 w-full rounded-2xl" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card />
        <Card />
        <Card />
        <Card />
      </div>
      <div className="mt-4"><ChartSkeleton tall /></div>
    </section>
  )
}

export function UserAccountsSkeleton() {
  return <UsersSkeleton />
}

export function LoadingListSkeleton({ rows = 3, className = '' }) {
  return <div className={className}><ListSkeleton rows={rows} /></div>
}

export default SystemPageSkeleton
