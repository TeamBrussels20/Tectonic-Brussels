import { useEffect, useRef, useState } from "react"
import { formatEur, formatEurCompact, humanize, monthLabel } from "../lib/format"

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-3">{sub}</div>}
    </div>
  )
}

interface Tip {
  x: number
  y: number
  rows: { label: string; value: string; color?: string }[]
  title: string
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-lg"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <div className="text-ink-3">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color && <span className="h-0.5 w-3 rounded" style={{ background: r.color }} />}
          <span className="font-semibold">{r.value}</span>
          <span className="text-ink-2">{r.label}</span>
        </div>
      ))}
    </div>
  )
}

// Grouped columns: income vs spending per month, one y-axis.
export function CashflowChart({ data }: { data: { month: string; income: number; spending: number }[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  // Draw in real pixels so axis text stays legible at any card width.
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(560)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 220
  const pad = { l: 44, r: 8, t: 12, b: 24 }
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.spending]))
  const step = niceStep(max / 4)
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const band = plotW / Math.max(1, data.length)
  const barW = Math.min(22, band / 3)
  const y = (v: number) => pad.t + plotH - (v / top) * plotH
  const series = [
    { key: "income" as const, label: "Income", color: "var(--color-series-1)" },
    { key: "spending" as const, label: "Spending", color: "var(--color-series-2)" },
  ]

  return (
    <div ref={box} className="relative min-w-0 overflow-hidden" onPointerLeave={() => (setTip(null), setHover(null))}>
      <Legend items={series} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block"
        role="img"
        aria-label="Monthly income and spending"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-xs tabular-nums">
              {formatEurCompact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + band * i + band / 2
          return (
            <g
              key={d.month}
              tabIndex={0}
              className="outline-none"
              onPointerMove={() => {
                setHover(d.month)
                setTip({
                  x: cx,
                  y: y(Math.max(d.income, d.spending)) + 24,
                  title: new Date(`${d.month}-01`).toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                  }),
                  rows: [
                    ...series.map((s) => ({
                      label: s.label,
                      value: formatEur(d[s.key]),
                      color: s.color,
                    })),
                    { label: "Net", value: formatEur(d.income - d.spending) },
                  ],
                })
              }}
            >
              <rect x={cx - band / 2} y={pad.t} width={band} height={plotH} fill="transparent" />
              {series.map((s, j) => {
                const x = cx - barW - 1 + j * (barW + 2)
                const h = Math.max(0, pad.t + plotH - y(d[s.key]))
                return (
                  <path
                    key={s.key}
                    d={roundedTop(x, y(d[s.key]), barW, h, 4)}
                    fill={s.color}
                    opacity={hover && hover !== d.month ? 0.45 : 1}
                  />
                )
              })}
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-ink-2 text-xs">
                {monthLabel(d.month)}
              </text>
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

// Horizontal bars, single hue, value at the tip.
export function CategoryBars({ data }: { data: { category: string; value: number }[] }) {
  const [tip, setTip] = useState<string | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div
          key={d.category}
          className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2 text-sm"
          onPointerEnter={() => setTip(d.category)}
          onPointerLeave={() => setTip(null)}
        >
          <span className="truncate text-ink-2">{humanize(d.category)}</span>
          <div className="h-3.5">
            <div
              className="h-full rounded-r-[4px] bg-series-1 transition-opacity"
              style={{
                width: `${(d.value / max) * 100}%`,
                opacity: tip && tip !== d.category ? 0.45 : 1,
              }}
            />
          </div>
          <span className="text-right tabular-nums">{formatEur(d.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  return (
    <div>
      <div className="h-2 rounded-full bg-series-1-track" role="meter" aria-valuenow={value} aria-valuemax={max}>
        <div className="h-full rounded-full bg-series-1" style={{ width: `${pct}%` }} />
      </div>
      {label && <div className="mt-1 text-xs text-ink-3">{label}</div>}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex gap-4 text-sm text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}
