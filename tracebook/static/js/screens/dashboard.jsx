// Dashboard

const { useState: useStateD } = React;

const PROVIDERS = [
  { value: 'all', label: 'all providers' },
  { value: 'anthropic', label: 'anthropic' },
  { value: 'openai', label: 'openai' },
  { value: 'google', label: 'google' },
];
const PERIODS = [
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '180', label: '180d' },
  { value: 'all', label: 'all' },
];

function providerOptions() {
  const seen = new Map(PROVIDERS.map(p => [p.value, p]));
  ((window.DASH_FILTERS && window.DASH_FILTERS.providers) || []).forEach(p => {
    seen.set(p.value, { value: p.value, label: `${p.label} · ${p.count}` });
  });
  return [...seen.values()];
}

function modelLabel(m) {
  return String(m || '')
    .replace(/^claude-/, '')
    .replace(/-20\d{6,8}$/, '')
    .replace(/-/g, ' ');
}

function modelOptions(provider) {
  const rows = [];
  const add = (value, count) => {
    if (!value || rows.some(r => r.value === value)) return;
    rows.push({ value, label: count ? `${modelLabel(value)} · ${count}` : modelLabel(value) });
  };
  const facets = (window.DASH_FILTERS && window.DASH_FILTERS.modelsByProvider) || {};
  const providers = provider === 'all' ? Object.keys(facets) : [provider];
  providers.forEach(p => (facets[p] || []).forEach(m => add(m.value, m.count)));
  if (rows.length === 0) {
    (window.PRICING || [])
      .filter(p => provider === 'all' || p.provider === provider)
      .slice(0, 12)
      .forEach(p => add(p.model));
  }
  return [{ value: 'all', label: 'all models' }, ...rows];
}

function FilterBar({ provider, setProvider, model, setModel, period, setPeriod }) {
  const models = modelOptions(provider);
  return (
    <div className="surface-1 px-4 py-3 mb-7 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
        <window.Icon.Filter size={13} />
        <span className="t-eyebrow">filters</span>
      </div>
      <div className="h-4 w-px" style={{ background: 'var(--line-1)' }} />
      <window.Select label="provider" value={provider} onChange={setProvider} options={providerOptions()} />
      <window.Select label="model" value={model} onChange={setModel} options={models} />
      <div className="flex items-center gap-1 ml-auto">
        <span className="t-eyebrow mr-1" style={{ color: 'var(--ink-4)' }}>period</span>
        {PERIODS.map(p => (
          <window.Pill key={p.value} active={period === p.value} onClick={() => setPeriod(p.value)}>{p.label}</window.Pill>
        ))}
      </div>
    </div>
  );
}

// ─── Bar chart with hover tooltip ────────────────────────────────────────────

function BarChart({ data, series, metric = 'tokens', showValues = false }) {
  const [hover, setHover] = useStateD(null); // tooltip only on hover
  const W = 1440, H = 300, P = { l: 52, r: 18, t: 24, b: 34 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  const valueFor = (d, s) => metric === 'cost' ? (d[`${s.key}Cost`] || 0) : (d[s.key] || 0);
  const totalFor = (d) => metric === 'cost' ? (d.cost || 0) : (d.total || 0);
  const labelFor = (v, opts = {}) => metric === 'cost' ? `$${v.toFixed(v >= 10 ? 0 : 2)}` : window.formatNum(v, opts);
  const unitLabel = metric === 'cost' ? 'estimated cost' : 'output tokens';
  const max = Math.max(1, Math.max(...data.map(totalFor)) * 1.14);
  const barW = innerW / data.length;
  const valueLabelStep = data.length > 45 ? 4 : data.length > 28 ? 3 : data.length > 18 ? 2 : 1;
  const x = (i) => P.l + i * barW + barW * 0.18;
  const y = (v) => P.t + innerH - (v / max) * innerH;
  const segH = (v) => (v / max) * innerH;
  const w = barW * 0.64;

  const cur = hover != null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto"
        onMouseLeave={() => setHover(null)}>
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const yy = P.t + innerH * (1 - p);
          return (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={yy} y2={yy} stroke="#1f1f24" strokeDasharray="2 4" />
              <text x={P.l - 8} y={yy + 3} fill="#52525b" fontSize="9.5" fontFamily="JetBrains Mono" textAnchor="end">
                {labelFor(max * p, { digits: 2 })}
              </text>
            </g>
          );
        })}
        {/* bars */}
        {data.map((d, i) => {
          const isHover = hover === i;
          const baseOpacity = isHover ? 1 : 0.85;
          let acc = 0;
          return (
            <g key={i}
              onMouseEnter={() => setHover(i)}
              style={{ cursor: 'pointer' }}>
              {/* hit area */}
              <rect x={P.l + i * barW} y={P.t} width={barW} height={innerH} fill="transparent" />
              {series.map(s => {
                const v = valueFor(d, s);
                const h = segH(v);
                const yy = y(acc + v);
                acc += v;
                if (v <= 0) return null;
                return <rect key={s.key} x={x(i)} y={yy} width={w} height={h} fill={s.color} opacity={baseOpacity} rx="1.5" />;
              })}
              {/* hover ring */}
              {isHover && (
                <rect x={x(i) - 2} y={y(totalFor(d)) - 2} width={w + 4} height={innerH - (y(totalFor(d)) - P.t) + 2}
                  fill="none" stroke="#34d399" strokeWidth="0.75" strokeDasharray="2 2" rx="2" opacity="0.5" />
              )}
              {showValues && totalFor(d) > 0 && i % valueLabelStep === 0 && (
                <text x={x(i) + w/2} y={Math.max(10, y(totalFor(d)) - 5)} fill="#e4e4e7" fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle">
                  {labelFor(totalFor(d))}
                </text>
              )}
            </g>
          );
        })}
        {/* x labels (every 2nd) */}
        {data.map((d, i) => i % 2 === 0 && (
          <text key={i} x={x(i) + w/2} y={H - 8} fill={d.today ? '#34d399' : '#52525b'} fontSize="9.5" fontFamily="JetBrains Mono" textAnchor="middle">
            {d.day}
          </text>
        ))}
      </svg>
      <div className="absolute top-3 right-4 flex items-center gap-3 text-[10.5px] font-mono">
        {series.map(s => (
          <span key={s.key} className="flex items-center gap-1.5" style={{ color: s.color }}>
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      {/* hover tooltip */}
      {cur && (
        <div className="absolute top-3 left-12 surface-2 px-3 py-2.5 pointer-events-none" style={{ minWidth: 180 }}>
          <div className="t-eyebrow mb-1.5">{cur.today ? 'today' : cur.day}</div>
          <div className="display-tight font-semibold text-[18px] num leading-none mb-1" style={{ color: 'var(--ink-0)' }}>{labelFor(totalFor(cur), { digits: 2 })}</div>
          <div className="t-meta mb-2.5" style={{ fontSize: '10.5px' }}>
            {metric === 'cost' ? `${window.formatNum(cur.total, { digits: 2 })} output tokens` : `$${cur.cost.toFixed(2)} cost`} · {unitLabel}
          </div>
          <div className="space-y-1 text-[11px] font-mono">
            {series.map(s => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-sm" style={{ background: s.color }} />
                <span style={{ color: 'var(--ink-3)' }} className="flex-1">{s.label}</span>
                <span className="num" style={{ color: 'var(--ink-1)' }}>{labelFor(valueFor(cur, s))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cache panel — claude-style ──────────────────────────────────────────────

function CachePanel() {
  const cacheData = (window._DASHBOARD && window._DASHBOARD.cache) || {};
  const uncached   = cacheData.uncached_tokens || 0;
  const writeT     = cacheData.write_tokens    || 0;
  const readT      = cacheData.read_tokens     || 0;
  const COMP = [
    { key: 'uncached', label: 'uncached',         tokens: uncached, color: '#facc88' },
    { key: 'write',    label: 'cache write',       tokens: writeT,  color: '#7dd3fc' },
    { key: 'read',     label: 'cache read',        tokens: readT,   color: '#34d399' },
  ];
  const total = Math.max(COMP.reduce((a,b) => a + b.tokens, 0), 1);
  const readRatio = readT / total;
  const writeAmort = writeT > 0 ? (readT / writeT).toFixed(2) : '—';

  const SERIES = window.SPARK_CACHE || Array(12).fill(readRatio);

  return (
    <Card padding="p-4" className="dashboard-cache-card">
      {/* big ratio */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5 t-eyebrow mb-2">
            cache read ratio
            <span title="cache_read_input_tokens / total input tokens. Higher = more reuse of cached prompts → cheaper requests." style={{ color: 'var(--ink-4)', fontSize: '10px', cursor: 'help' }}>ⓘ</span>
          </div>
          <div className="cache-ratio-value display-tight font-semibold text-[40px] num leading-none" style={{ color: 'var(--ink-0)' }}>
            <span>{(readRatio * 100).toFixed(1)}</span><span className="cache-ratio-symbol text-[22px]" style={{ color: 'var(--ink-4)' }}>%</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Sparkline
            data={SERIES}
            w={140}
            h={42}
            color="#34d399"
            labels={sparkPointLabels(window._DASH_PERIOD || '14', SERIES.length)}
            formatValue={(v) => `${((v || 0) * 100).toFixed(1)}%`}
          />
        </div>
      </div>
      <div className="cache-read-note">
        <span>higher is better</span>
        <span>cached reads cost ~10% of fresh input</span>
      </div>

      {/* breakdown */}
      <div className="surface-2 p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12.5px] text-zinc-200 font-medium">cache usage breakdown</span>
          <span className="font-mono num text-[11.5px]" style={{ color: 'var(--ink-2)' }}>{window.formatNum(total, { digits: 2 })} input</span>
        </div>
        {/* composition bar */}
        <div className="h-3 rounded overflow-hidden flex" style={{ background: 'var(--bg-0)' }}>
          {COMP.map(c => (
            <div key={c.key} style={{ width: `${(c.tokens/total)*100}%`, background: c.color }} />
          ))}
        </div>
        {/* legend */}
        <div className="grid grid-cols-3 gap-2 mt-3 text-[10.5px] font-mono">
          {COMP.map(c => (
            <div key={c.key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c.color }} />
              <span style={{ color: 'var(--ink-3)' }} className="flex-1 truncate">{c.label}</span>
              <span className="num text-zinc-200">{((c.tokens/total)*100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
        {/* metrics row */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t" style={{ borderColor: 'var(--line-0)' }}>
          <div>
            <div className="t-eyebrow mb-1 flex items-center gap-1">
              read ratio
              <span title="cache_read / (uncached + cache_write + cache_read). Reads cost 10% of fresh input." style={{ color: 'var(--ink-4)', cursor: 'help', fontSize: '9px' }}>ⓘ</span>
            </div>
            <div className="display-tight font-semibold text-[18px] num" style={{ color: 'var(--ink-0)' }}>{(readRatio*100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="t-eyebrow mb-1 flex items-center gap-1">
              write amort.
              <span title="cache_read / cache_write. Each write is amortized across N reads. Higher = each cache slot is reused more." style={{ color: 'var(--ink-4)', cursor: 'help', fontSize: '9px' }}>ⓘ</span>
            </div>
            <div className="display-tight font-semibold text-[18px] num" style={{ color: 'var(--ink-0)' }}>{writeAmort}<span className="text-[12px]" style={{ color: 'var(--ink-4)' }}>×</span></div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Pie chart for tokens by project ─────────────────────────────────────────

const PIE_COLORS = ['#34d399', '#7dd3fc', '#a78bfa', '#fbbf24', '#fb7185', '#67e8f9'];

function ProjectPie({ rows }) {
  const [hover, setHover] = useStateD(null);
  const totalAll = rows.reduce((a, r) => a + r.cost, 0);
  if (totalAll <= 0) {
    return <div className="py-8 text-center t-small" style={{ color: 'var(--ink-4)' }}>no spend yet</div>;
  }

  // Group slices < 2% into "other" to declutter
  const big = rows.filter(r => r.cost / totalAll >= 0.02);
  const small = rows.filter(r => r.cost / totalAll < 0.02);
  if (small.length > 1) {
    const otherCost   = small.reduce((a, r) => a + r.cost, 0);
    const otherTokens = small.reduce((a, r) => a + r.tokens, 0);
    rows = [...big, { project: `other (${small.length})`, cost: otherCost, tokens: otherTokens, sessions: small.reduce((a,r)=>a+(r.sessions||0),0) }];
  } else {
    rows = [...big, ...small];
  }

  const total = rows.reduce((a, r) => a + r.cost, 0);
  const tokensTotal = rows.reduce((a, r) => a + r.tokens, 0);
  const cx = 100, cy = 100, r = 80, ri = 52;
  let acc = 0;
  const segs = rows.map((row, i) => {
    const portion = row.cost / total;
    const a0 = acc * Math.PI * 2 - Math.PI / 2;
    acc += portion;
    const a1 = acc * Math.PI * 2 - Math.PI / 2;
    const large = portion > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const xi0 = cx + ri * Math.cos(a0), yi0 = cy + ri * Math.sin(a0);
    const xi1 = cx + ri * Math.cos(a1), yi1 = cy + ri * Math.sin(a1);
    const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${ri} ${ri} 0 ${large} 0 ${xi0} ${yi0} Z`;
    return { ...row, d, color: PIE_COLORS[i % PIE_COLORS.length], portion, idx: i };
  });

  const cur = hover != null ? segs[hover] : null;
  const centerLabel = cur ? String(cur.project || '') : 'total spend';
  const centerTitle = centerLabel.length > 17 ? `${centerLabel.slice(0, 14)}...` : centerLabel;

  return (
    <div className="project-pie flex items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: 200, height: 200 }}
        onMouseLeave={() => setHover(null)}>
        <svg width="200" height="200" viewBox="0 0 200 200">
          {segs.map(s => {
            const isHover = hover === s.idx;
            return (
              <path key={s.idx} d={s.d} fill={s.color}
                opacity={cur ? (isHover ? 1 : 0.32) : 0.88}
                onMouseEnter={() => setHover(s.idx)}
                style={{ cursor: 'pointer', transition: 'opacity 120ms' }} />
            );
          })}
          <text x={cx} y={cy - 15} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8.5" fill="var(--ink-3)">
            {centerTitle}
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontFamily="Inter Tight" fontWeight="600" fontSize="22" fill="#f4f4f5">
            {cur ? `${(cur.portion * 100).toFixed(1)}%` : `$${total.toFixed(0)}`}
          </text>
          <text x={cx} y={cy + 27} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8.5" fill="var(--ink-4)">
            {cur ? `$${cur.cost.toFixed(2)}` : `${window.formatNum(tokensTotal)} tokens`}
          </text>
        </svg>
      </div>
      {/* legend — only project + share by default; tokens/cost on hover row */}
      <div className="flex-1 min-w-0 space-y-1">
        {segs.map(s => {
          const isHover = hover === s.idx;
          return (
            <div key={s.idx}
              onMouseEnter={() => setHover(s.idx)}
              onMouseLeave={() => setHover(null)}
              className="flex items-center gap-2.5 cursor-pointer hover-row -mx-2 px-2 py-1.5 rounded transition-all"
              style={{ opacity: cur ? (isHover ? 1 : 0.55) : 0.92 }}>
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              <span className="font-mono text-[12.5px] truncate" style={{ minWidth: 0, flex: '1 1 auto', color: 'var(--ink-1)' }}>{s.project}</span>
              {/* hover-only details */}
              <span className="font-mono num text-[10.5px] text-right tabular"
                style={{ color: 'var(--ink-3)', minWidth: isHover ? 44 : 0, width: isHover ? 'auto' : 0, overflow: 'hidden', transition: 'width 120ms', opacity: isHover ? 1 : 0 }}>{window.formatNum(s.tokens)}</span>
              <span className="font-mono num text-[11px] text-right tabular"
                style={{ color: '#6ee7b7', minWidth: isHover ? 50 : 0, width: isHover ? 'auto' : 0, overflow: 'hidden', transition: 'width 120ms', opacity: isHover ? 1 : 0 }}>${s.cost.toFixed(2)}</span>
              {/* always-visible share */}
              <span className="font-mono num text-[11px] text-right tabular flex-shrink-0" style={{ color: isHover ? '#f4f4f5' : 'var(--ink-2)', minWidth: 38 }}>
                {(s.portion*100).toFixed(1)}%
              </span>
            </div>
          );
        })}
        <div className="t-meta pt-2 mt-1 border-t" style={{ borderColor: 'var(--line-0)', fontSize: '10px' }}>
          hover a row for tokens & cost
        </div>
      </div>
    </div>
  );
}

function sparkPointLabels(period, points = 12) {
  const days = period === 'all' ? 90 : Number(period) || 14;
  const bucketMs = (days * 24 * 60 * 60 * 1000) / Math.max(points, 1);
  const now = Date.now();
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return Array.from({ length: points }, (_, i) => fmt(new Date(now - bucketMs * (points - 1 - i))));
}

// ─── DashboardScreen ─────────────────────────────────────────────────────────

function DashboardScreen() {
  const [provider, setProvider] = useStateD('all');
  const [model, setModel] = useStateD('all');
  const [period, setPeriod] = useStateD('14');
  const [refreshKey, setRefreshKey] = useStateD(0);
  const [loading, setLoading] = useStateD(false);
  const [chartMetric, setChartMetric] = useStateD('tokens');
  const [showBarValues, setShowBarValues] = useStateD(false);

  const dash = window._DASHBOARD;
  const kpis = dash ? dash.kpis : null;

  const fmtTokens = (n) => window.formatNum(n);

  const handleRefresh = async () => {
    if (window.fetchDashboard) {
      setLoading(true);
      await window.fetchDashboard(period, provider, model);
      setLoading(false);
      setRefreshKey(k => k + 1);
    }
  };

  // Auto-refresh on filter change
  React.useEffect(() => {
    handleRefresh();
  }, [provider, model, period]);

  React.useEffect(() => {
    const values = modelOptions(provider).map(o => o.value);
    if (!values.includes(model)) setModel('all');
  }, [provider]);

  const totalTokens = kpis ? fmtTokens(kpis.tokens.value) : '—';
  const totalCost   = kpis ? '$' + kpis.cost.value.toFixed(2) : '—';
  const sessions    = kpis ? kpis.sessions.value : 0;
  const avgCost     = kpis ? '$' + kpis.avg_cost.value.toFixed(2) : '—';
  const periodLabel = period === 'all' ? 'all time' : `prev ${period}d`;
  // Concrete date ranges for the "vs prev" tooltip
  const periodDays  = period === 'all' ? 90 : Number(period);
  const currentRange  = window.formatDateRange ? window.formatDateRange(0, periodDays) : '';
  const previousRange = window.formatDateRange ? window.formatDateRange(periodDays, periodDays) : '';
  const deltaTooltip  = `Comparing ${currentRange} (current) vs ${previousRange} (previous ${periodDays} days)`;

  const chart = window.CHART_14D || [];
  const chartSeries = window.CHART_SERIES || [];
  const pie   = window.TOKENS_BY_PROJECT || [];
  const sparkLabels = sparkPointLabels(period, (window.SPARK_TOKENS || []).length || 12);
  const avgSpark = (window.SPARK_COST || []).map((cost, i) => {
    const count = (window.SPARK_SESSIONS || [])[i] || 0;
    return count ? cost / count : 0;
  });

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="dashboards / overview"
        title="overview"
        subtitle="estimated cost, generated output, cache and spend across all your sessions."
        right={<>
          <button className="btn btn-ghost" onClick={handleRefresh}><window.Icon.Refresh size={13} /> refresh</button>
        </>}
      />

      <FilterBar
        provider={provider} setProvider={setProvider}
        model={model} setModel={setModel}
        period={period} setPeriod={setPeriod}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        <KPIBlock label="output tokens" value={totalTokens} delta={kpis ? kpis.tokens.delta : null} deltaLabel={`vs ${periodLabel}`} deltaTooltip={deltaTooltip} spark={window.SPARK_TOKENS} sparkColor="#7dd3fc" sparkLabels={sparkLabels} sparkValue={(v) => window.formatNum((v || 0) * 1000)} />
        <KPIBlock label="sessions" value={String(sessions)} delta={kpis ? kpis.sessions.delta : null} deltaLabel={`vs ${periodLabel}`} deltaTooltip={deltaTooltip} spark={window.SPARK_SESSIONS} sparkColor="#a78bfa" sparkLabels={sparkLabels} sparkValue={(v) => `${Math.round(v || 0)}`} />
        <KPIBlock label="estimated cost" value={totalCost} delta={kpis ? kpis.cost.delta : null} deltaLabel={`vs ${periodLabel}`} deltaTooltip={deltaTooltip} spark={window.SPARK_COST} sparkLabels={sparkLabels} sparkValue={(v) => `$${(v || 0).toFixed(2)}`} accent />
        <KPIBlock label="avg / session" value={avgCost} delta={kpis ? kpis.avg_cost.delta : null} deltaLabel={`vs ${periodLabel}`} deltaTooltip={deltaTooltip} spark={avgSpark} sparkColor="#fbbf24" sparkLabels={sparkLabels} sparkValue={(v) => `$${(v || 0).toFixed(2)}`} />
      </div>

      {/* Throughput bar chart */}
      <Eyebrow num={1} label="throughput" meta={`${period === 'all' ? 'all time' : period + ' days'} · stacked by model · ${chartMetric === 'cost' ? 'estimated cost' : 'output tokens'}`} right={
        <div className="flex items-center gap-2">
          <span className="t-meta">{totalTokens} output · {totalCost}</span>
          <div className="flex items-center gap-1">
            <window.Pill active={chartMetric === 'tokens'} onClick={() => setChartMetric('tokens')}><window.Icon.Database size={11} /> tokens</window.Pill>
            <window.Pill active={chartMetric === 'cost'} onClick={() => setChartMetric('cost')}><window.Icon.Coin size={11} /> dollars</window.Pill>
            <window.Pill active={showBarValues} onClick={() => setShowBarValues(v => !v)}><window.Icon.Toggle size={11} /> values</window.Pill>
          </div>
        </div>
      } />
      <Card padding="p-0" className="mb-7 overflow-hidden">
        {chart.length > 0
          ? <BarChart
              data={chart}
              series={chartSeries.length ? chartSeries : [{ key: 'other', label: 'other', color: '#a1a1aa' }]}
              metric={chartMetric}
              showValues={showBarValues}
            />
          : <div className="py-8 text-center t-small" style={{ color: 'var(--ink-4)' }}>no data for this period</div>
        }
      </Card>

      {/* Cache + Tokens by project */}
      <div className="dashboard-cache-project-grid grid grid-cols-2 gap-5 mb-7">
        <div>
          <Eyebrow num={2} label="prompt caching" meta="composition & read ratio" />
          <CachePanel />
        </div>
        <div>
          <Eyebrow num={3} label="output by project" meta={`${pie.length} projects · share of spend`} right={<a href="#/sessions" className="t-meta hover:text-zinc-100 flex items-center gap-1">all sessions <window.Icon.ArrowRight size={11} /></a>} />
          <Card padding="p-5" className="dashboard-project-card">
            {pie.length > 0
              ? <ProjectPie rows={pie} />
              : <div className="py-8 text-center t-small" style={{ color: 'var(--ink-4)' }}>no sessions yet</div>
            }
          </Card>
        </div>
      </div>

      {/* Recent sessions footer block */}
      <Eyebrow num={4} label="recent activity" meta="last 24 hours" right={<a href="#/sessions" className="t-meta hover:text-zinc-100 flex items-center gap-1">all sessions <window.Icon.ArrowRight size={11} /></a>} />
      <Card padding="p-0">
        <table className="w-full text-[12.5px]">
          <thead><tr className="t-eyebrow border-b" style={{ borderColor: 'var(--line-0)' }}>
            <th className="text-left font-medium px-4 py-2.5 w-[120px]">session</th>
            <th className="text-left font-medium px-4 py-2.5">preview</th>
            <th className="text-left font-medium px-4 py-2.5">project</th>
            <th className="text-right font-medium px-4 py-2.5">turns</th>
            <th className="text-right font-medium px-4 py-2.5">cost</th>
            <th className="text-right font-medium px-4 py-2.5 w-[80px]">last</th>
          </tr></thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
            {(dash && dash.recent ? dash.recent : (window.SESSIONS || []).slice(0, 5)).map(s => (
              <tr key={s.id} className="hover-row cursor-pointer" onClick={() => window.location.hash = `#/sessions/${s.id}`}>
                <td className="px-4 py-3.5 font-mono">
                  <div className="flex items-center gap-2">
                    {s.live ? <StatusDot kind="emerald" pulse size={5} /> : <span className="w-[5px] h-[5px] rounded-full" style={{ background: 'var(--ink-4)' }} />}
                    <button
                      className="hover:text-zinc-50"
                      style={{ color: 'var(--ink-2)' }}
                      title={`copy ${s.resumeCommand || s.id}`}
                      onClick={(e) => { e.stopPropagation(); window.copyText(s.resumeCommand || s.id); }}
                    >
                      {s.short}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3.5 truncate max-w-[320px]" style={{ color: 'var(--ink-1)' }}>{s.preview}</td>
                <td className="px-4 py-3.5 t-meta" style={{ color: 'var(--ink-3)' }}>{s.project}</td>
                <td className="px-4 py-3.5 text-right font-mono num" style={{ color: 'var(--ink-3)' }}>{s.turns}</td>
                <td className="px-4 py-3.5 text-right font-mono num text-emerald-300">${s.cost.toFixed(2)}</td>
                <td className="px-4 py-3.5 text-right t-meta" style={{ color: 'var(--ink-4)' }}>{s.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
window.DashboardScreen = DashboardScreen;
