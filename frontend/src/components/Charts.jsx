import { useState } from 'react'

// Lightweight SVG/CSS charts for the admin dashboards — no chart library.
// Categorical palette is brand-green-led and CVD-validated (adjacent ΔE > 12);
// values are always direct-labeled so color never carries meaning alone.
export const CAT_COLORS = ['#1f7a4d', '#2a78d6', '#eda100', '#4a3aa7', '#eb6834']
const FOLD_COLOR = '#898781' // "Other" fold when there are more slices than slots

// ── Horizontal bar list (magnitude by category — single hue) ───────────────
export function HBarList({ data, valueLabel = '', color = '#1f7a4d', suffix = '' }) {
  const max = Math.max(1, ...data.map(d => d.value))
  if (!data.length) return <EmptyChart />
  return (
    <div className="space-y-2.5">
      {data.map(d => (
        <div key={d.label}>
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span className="text-xs text-gray-600 truncate" title={d.label}>{d.label}</span>
            <span className="text-xs font-semibold text-gray-800 whitespace-nowrap">
              {d.value}{suffix}{d.sub != null && <span className="font-normal text-gray-400 ml-1">{d.sub}</span>}
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: color, minWidth: d.value > 0 ? 4 : 0 }}
            />
          </div>
        </div>
      ))}
      {valueLabel && <p className="text-[11px] text-gray-400 pt-1">{valueLabel}</p>}
    </div>
  )
}

// ── Donut (identity / share) ────────────────────────────────────────────────
export function Donut({ data, size = 150 }) {
  if (!data.length || data.every(d => !d.value)) return <EmptyChart />

  // Fold everything beyond the palette into "Other"
  let slices = [...data].sort((a, b) => b.value - a.value)
  if (slices.length > CAT_COLORS.length) {
    const head = slices.slice(0, CAT_COLORS.length - 1)
    const restTotal = slices.slice(CAT_COLORS.length - 1).reduce((s, d) => s + d.value, 0)
    slices = [...head, { label: 'Other', value: restTotal }]
  }
  const total = slices.reduce((s, d) => s + d.value, 0)
  const r = 40
  const C = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img">
        {slices.map((d, i) => {
          const frac = d.value / total
          const seg = (
            <circle
              key={d.label}
              cx="50" cy="50" r={r} fill="none"
              stroke={d.label === 'Other' ? FOLD_COLOR : CAT_COLORS[i]}
              strokeWidth="14"
              strokeDasharray={`${Math.max(frac * C - 2, 0.5)} ${C - Math.max(frac * C - 2, 0.5)}`}
              strokeDashoffset={-offset * C + C / 4}
            >
              <title>{`${d.label}: ${d.value} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          )
          offset += frac
          return seg
        })}
        <text x="50" y="47" textAnchor="middle" className="fill-gray-800" style={{ fontSize: 15, fontWeight: 700 }}>{total}</text>
        <text x="50" y="60" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 7 }}>total</text>
      </svg>
      <div className="flex-1 min-w-[140px] space-y-1.5">
        {slices.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: d.label === 'Other' ? FOLD_COLOR : CAT_COLORS[i] }} />
            <span className="text-gray-600 truncate flex-1" title={d.label}>{d.label}</span>
            <span className="font-semibold text-gray-800">{d.value}</span>
            <span className="text-gray-400 w-9 text-right">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Trend line (change over time) ───────────────────────────────────────────
export function TrendLine({ data, color = '#1f7a4d', height = 160, suffix = '' }) {
  const [hover, setHover] = useState(null)
  if (data.length < 2) {
    return data.length === 1
      ? <p className="text-sm text-gray-500 py-8 text-center">Only one data point so far — {data[0].label}: <b>{data[0].value}{suffix}</b></p>
      : <EmptyChart />
  }

  const W = 600, H = 180, PAD = { t: 12, r: 12, b: 24, l: 34 }
  const max = Math.max(1, ...data.map(d => d.value))
  const x = i => PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r)
  const y = v => H - PAD.b - (v / max) * (H - PAD.t - PAD.b)
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  // When max is small (e.g. an empty workspace, max=1) rounding can collide
  // — dedupe so two grid lines never share the same React key/value.
  const gridVals = [...new Set([0, Math.round(max / 2), max])]
  // show at most ~6 x labels
  const step = Math.ceil(data.length / 6)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} role="img"
      onMouseLeave={() => setHover(null)}>
      {gridVals.map(v => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e1e0d9" strokeWidth="1" />
          <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fill="#898781" fontSize="10">{v}</text>
        </g>
      ))}
      <path d={`${path} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={color} opacity="0.08" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={d.label}>
          {/* generous invisible hit target */}
          <rect
            x={x(i) - (W - PAD.l - PAD.r) / (data.length - 1) / 2} y={PAD.t}
            width={(W - PAD.l - PAD.r) / (data.length - 1)} height={H - PAD.t - PAD.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
          {(hover === i) && (
            <>
              <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={H - PAD.b} stroke="#c3c2b7" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x(i)} cy={y(d.value)} r="4" fill={color} stroke="#fff" strokeWidth="2" />
              <g transform={`translate(${Math.min(Math.max(x(i) - 40, PAD.l), W - 96)}, ${PAD.t})`}>
                <rect width="88" height="30" rx="5" fill="#0b0b0b" opacity="0.85" />
                <text x="44" y="12" textAnchor="middle" fill="#fff" fontSize="9">{d.label}</text>
                <text x="44" y="24" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">{d.value}{suffix}</text>
              </g>
            </>
          )}
          {i % step === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fill="#898781" fontSize="9">{d.label.slice(5)}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

// ── Score meter (0–100 progress bar) ────────────────────────────────────────
export function Meter({ label, value, invert = false }) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)))
  // for riskLevel (invert) high is bad
  const good = invert ? v <= 40 : v >= 65
  const bad = invert ? v >= 70 : v < 40
  const color = good ? '#1f7a4d' : bad ? '#d03b3b' : '#b45309'
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-sm font-bold" style={{ color }}>{v}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${v}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export function StatTile({ label, value, sub, accent = 'text-ink-900' }) {
  return (
    <div className="card !p-4 card-hover">
      <p className={`font-heading text-[26px] leading-none font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="text-[12.5px] text-ink-500 mt-2">{label}</p>
      {sub && <p className="text-[11.5px] text-ink-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function EmptyChart() {
  return <p className="text-sm text-gray-400 py-8 text-center">No data yet</p>
}
