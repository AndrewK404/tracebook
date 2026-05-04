// Primitives & shared components

const { useState, useEffect, useMemo, useRef } = React;

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

function Sparkline({ data, w = 120, h = 32, color = '#34d399' }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y];
  });
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const areaPath = linePath + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width={w} height={h} className="block">
      <defs>
        <linearGradient id={`spark-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${color.slice(1)})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.25" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={color} />
    </svg>
  );
}
window.Sparkline = Sparkline;

// ─── KPI Block ───────────────────────────────────────────────────────────────

function KPIBlock({ label, value, unit, delta, deltaLabel, spark, sparkColor = '#34d399', accent = false, sub }) {
  const deltaTone = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat';
  const deltaArrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
  return (
    <div className={`surface-1 p-5 relative overflow-hidden ${accent ? 'kpi-accent' : ''}`}>
      <div className="t-eyebrow mb-4">{label}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="t-kpi">
            {value}
            {unit && <span className="text-[18px] text-zinc-500 font-medium ml-1">{unit}</span>}
          </div>
          {(delta !== undefined || sub) && (
            <div className="flex items-center gap-2 mt-2 text-[11.5px] font-mono">
              {delta !== undefined && (
                <span className={`${deltaTone} num`}>
                  {deltaArrow} {Math.abs(delta).toFixed(1)}%
                </span>
              )}
              {deltaLabel && <span className="text-zinc-500">{deltaLabel}</span>}
              {sub && <span className="text-zinc-500">{sub}</span>}
            </div>
          )}
        </div>
        {spark && <Sparkline data={spark} color={sparkColor} />}
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
    <div className="flex items-end justify-between gap-6 mb-7">
      <div>
        {eyebrow && <div className="t-eyebrow mb-2">{eyebrow}</div>}
        <h1 className="t-h1">{title}</h1>
        {subtitle && <p className="t-small mt-1.5 max-w-xl">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
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
