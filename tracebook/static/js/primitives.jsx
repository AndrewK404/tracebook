// Primitives & shared components

const { useState, useEffect, useMemo, useRef } = React;

// ─── Number formatting ───────────────────────────────────────────────────────
// formatNum(n, opts?) — auto picks k/M/B/T units. Used everywhere tokens or
// large counts are displayed so a chart never shows "598035k".
//   formatNum(950) → "950"
//   formatNum(12_500) → "12.5k"
//   formatNum(2_100_000) → "2.1M"
//   formatNum(2_100_000_000) → "2.1B"
function formatNum(n, opts = {}) {
  if (n == null || isNaN(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const digits = opts.digits != null ? opts.digits : 1;
  if (abs < 1_000)             return sign + abs.toFixed(0);
  if (abs < 1_000_000)         return sign + (abs / 1_000).toFixed(digits) + 'k';
  if (abs < 1_000_000_000)     return sign + (abs / 1_000_000).toFixed(digits) + 'M';
  if (abs < 1_000_000_000_000) return sign + (abs / 1_000_000_000).toFixed(digits) + 'B';
  return sign + (abs / 1_000_000_000_000).toFixed(digits) + 'T';
}
window.formatNum = formatNum;

// ─── Date formatting ─────────────────────────────────────────────────────────
// formatDateRange(daysBack, daysSpan) → "Apr 27 → May 4"
function formatDateRange(daysBack, daysSpan) {
  const end = new Date();
  end.setDate(end.getDate() - daysBack);
  const start = new Date(end);
  start.setDate(start.getDate() - daysSpan + 1);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} → ${fmt(end)}`;
}
window.formatDateRange = formatDateRange;

// ─── Clipboard ───────────────────────────────────────────────────────────────
async function copyText(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const el = document.createElement('textarea');
      el.value = value;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    return true;
  } catch (e) {
    console.warn('copy failed', e);
    return false;
  }
}
window.copyText = copyText;

// ─── Hash router ─────────────────────────────────────────────────────────────

function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/dashboard');
  useEffect(() => {
    const h = () => setRoute(window.location.hash.slice(1) || '/dashboard');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return route;
}

// ─── Status dot ──────────────────────────────────────────────────────────────

function StatusDot({ kind = 'emerald', size = 6, pulse = false }) {
  const map = {
    emerald: '#34d399',
    amber:   '#fbbf24',
    rose:    '#fb7185',
    zinc:    '#52525b',
    violet:  '#a78bfa',
    cyan:    '#67e8f9',
    sky:     '#7dd3fc',
  };
  const c = map[kind] || map.emerald;
  return (
    <span style={{ display: 'inline-block', width: size, height: size, borderRadius: 999, background: c, flexShrink: 0 }}
          className={pulse ? `pulse-${kind}` : ''} />
  );
}
window.StatusDot = StatusDot;

// ─── Eyebrow numbered marker ─────────────────────────────────────────────────

function Eyebrow({ num, label, meta, right }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="eyebrow-num">
        <span className="num-tag">{String(num).padStart(2, '0')}</span>
        <span className="dot">/</span>
        <span className="label">{label}</span>
        {meta && <><span className="dot">·</span><span className="meta">{meta}</span></>}
      </span>
      {right}
    </div>
  );
}
window.Eyebrow = Eyebrow;

// ─── Card ────────────────────────────────────────────────────────────────────

function Card({ children, className = '', padding = 'p-5', accent = false }) {
  return (
    <div className={`surface-1 ${padding} ${accent ? 'kpi-accent' : ''} ${className}`}>
      {children}
    </div>
  );
}
window.Card = Card;

// ─── Sparkline (area + line) ─────────────────────────────────────────────────

function Sparkline({ data, w = 120, h = 32, color = '#34d399', labels = [], formatValue }) {
  const [hover, setHover] = useState(null);
  const values = Array.isArray(data) && data.length ? data : [0];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const denom = Math.max(values.length - 1, 1);
    const x = (i / denom) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y];
  });
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const areaPath = linePath + ` L ${w} ${h} L 0 ${h} Z`;
  const activeIdx = hover == null ? pts.length - 1 : hover;
  const active = pts[activeIdx] || pts[pts.length - 1] || [0, h / 2];
  const valueLabel = formatValue ? formatValue(values[activeIdx], activeIdx) : formatNum(values[activeIdx]);
  const dateLabel = labels[activeIdx] || '';
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(rect.width, 1)));
    setHover(Math.round(ratio * (values.length - 1)));
  };
  return (
    <div className="spark-wrap" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {hover != null && (
        <div className="spark-hover-label" style={{ color }}>
          <span>{dateLabel}</span>
          <strong>{valueLabel}</strong>
        </div>
      )}
      <svg width={w} height={h} className="block">
        <path d={areaPath} fill={color} opacity="0.06" />
        {hover != null && <line x1={active[0]} x2={active[0]} y1="0" y2={h} stroke={color} strokeWidth="0.75" opacity="0.35" />}
        <path d={linePath} fill="none" stroke={color} strokeWidth={hover != null ? "1.65" : "1.25"} />
        <circle cx={active[0]} cy={active[1]} r={hover != null ? "3" : "2"} fill={color} />
      </svg>
    </div>
  );
}
window.Sparkline = Sparkline;

// ─── KPI Block ───────────────────────────────────────────────────────────────

function KPIBlock({ label, value, unit, delta, deltaLabel, deltaTooltip, spark, sparkColor = '#34d399', sparkLabels, sparkValue, accent = false, sub }) {
  const deltaTone = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat';
  const deltaArrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
  return (
    <div className={`surface-1 p-5 relative overflow-visible ${accent ? 'kpi-accent' : ''}`}>
      <div className="t-eyebrow mb-4">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="t-kpi">
            {value}
            {unit && <span className="text-[18px] font-medium ml-1" style={{ color: 'var(--ink-4)' }}>{unit}</span>}
          </div>
          {(delta !== undefined || sub) && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono whitespace-nowrap">
              {delta !== undefined && (
                <span className={`${deltaTone} num`}>
                  {deltaArrow} {Math.abs(delta).toFixed(1)}%
                </span>
              )}
              {deltaLabel && (
                <span style={{ color: 'var(--ink-4)', cursor: deltaTooltip ? 'help' : 'default' }} title={deltaTooltip || ''}>
                  {deltaLabel}
                </span>
              )}
              {sub && <span style={{ color: 'var(--ink-4)' }}>{sub}</span>}
            </div>
          )}
        </div>
        {spark && <Sparkline data={spark} color={sparkColor} labels={sparkLabels} formatValue={sparkValue} />}
      </div>
    </div>
  );
}
window.KPIBlock = KPIBlock;

// ─── Filter pill ─────────────────────────────────────────────────────────────

function Pill({ active, children, onClick }) {
  return (
    <button className={`pill ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
window.Pill = Pill;

// ─── Page header ─────────────────────────────────────────────────────────────

function PageHeader({ title, subtitle, right, eyebrow }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-7 min-w-0">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="t-eyebrow mb-2">{eyebrow}</div>}
        <h1 className="t-h1 break-words">{title}</h1>
        {subtitle && <p className="t-small mt-1.5 max-w-xl break-all">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
    </div>
  );
}
window.PageHeader = PageHeader;

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ glyph = '∅', title, body, path }) {
  return (
    <div className="surface-1 p-12 text-center">
      <div className="font-mono text-zinc-700 text-[40px] leading-none mb-4">{glyph}</div>
      <div className="t-h2 mb-1.5">{title}</div>
      {body && <p className="t-small max-w-md mx-auto">{body}</p>}
      {path && <div className="mt-4"><span className="chip">{path}</span></div>}
    </div>
  );
}
window.EmptyState = EmptyState;

// ─── Custom select ───────────────────────────────────────────────────────────

function Select({ value, onChange, options, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const cur = options.find(o => o.value === value) || options[0];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="pill">
        {label && <span className="text-zinc-500">{label}:</span>}
        <span className="text-zinc-100">{cur.label}</span>
        <window.Icon.ChevronDown size={11} className="text-zinc-500" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 surface-1 p-1 z-20 min-w-[160px] shadow-2xl">
          {options.map(o => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 rounded text-[12.5px] font-mono transition-colors ${o.value === value ? 'bg-zinc-800 text-emerald-300' : 'text-zinc-300 hover:bg-zinc-800/60'}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
window.Select = Select;
