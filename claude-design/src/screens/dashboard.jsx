// Dashboard

const { useState: useStateD } = React;

const PROVIDERS = [
  { value: 'all', label: 'all providers' },
  { value: 'anthropic', label: 'anthropic' },
  { value: 'openai', label: 'openai' },
  { value: 'google', label: 'google' },
];
const MODELS = [
  { value: 'all', label: 'all models' },
  { value: 'claude-opus-4', label: 'opus 4' },
  { value: 'claude-sonnet-4-5', label: 'sonnet 4.5' },
  { value: 'claude-haiku-4-5', label: 'haiku 4.5' },
];
const PERIODS = [
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '180', label: '180d' },
  { value: 'all', label: 'all' },
];

function FilterBar({ provider, setProvider, model, setModel, period, setPeriod }) {
  return (
    <div className="surface-1 px-4 py-3 mb-7 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--ink-3)' }}>
        <window.Icon.Filter size={13} />
        <span className="t-eyebrow">filters</span>
      </div>
      <div className="h-4 w-px" style={{ background: 'var(--line-1)' }} />
      <window.Select label="provider" value={provider} onChange={setProvider} options={PROVIDERS} />
      <window.Select label="model" value={model} onChange={setModel} options={MODELS} />
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

function BarChart({ data }) {
  const [hover, setHover] = useStateD(null); // tooltip only on hover
  const W = 920, H = 240, P = { l: 44, r: 14, t: 16, b: 28 };
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b;
  const max = Math.max(...data.map(d => d.total)) * 1.1;
  const barW = innerW / data.length;
  const x = (i) => P.l + i * barW + barW * 0.18;
  const y = (v) => P.t + innerH - (v / max) * innerH;
  const segH = (v) => (v / max) * innerH;
  const w = barW * 0.64;

  const cur = hover != null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-[260px]"
        onMouseLeave={() => setHover(null)}>
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const yy = P.t + innerH * (1 - p);
          return (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={yy} y2={yy} stroke="#1f1f24" strokeDasharray="2 4" />
              <text x={P.l - 8} y={yy + 3} fill="#52525b" fontSize="9.5" fontFamily="JetBrains Mono" textAnchor="end">
                {(max * p / 1e6).toFixed(2)}M
              </text>
            </g>
          );
        })}
        {/* bars */}
        {data.map((d, i) => {
          const isHover = hover === i;
          const baseOpacity = isHover ? 1 : 0.85;
          const yHaiku = y(d.haiku);
          const ySonnet = y(d.haiku + d.sonnet);
          const yOpus = y(d.total);
          return (
            <g key={i}
              onMouseEnter={() => setHover(i)}
              style={{ cursor: 'pointer' }}>
              {/* hit area */}
              <rect x={P.l + i * barW} y={P.t} width={barW} height={innerH} fill="transparent" />
              {/* haiku (bottom) */}
              <rect x={x(i)} y={yHaiku} width={w} height={segH(d.haiku)}
                fill="#a78bfa" opacity={baseOpacity} rx="1.5" />
              {/* sonnet */}
              <rect x={x(i)} y={ySonnet} width={w} height={segH(d.sonnet)}
                fill="#7dd3fc" opacity={baseOpacity} rx="1.5" />
              {/* opus (top) */}
              <rect x={x(i)} y={yOpus} width={w} height={segH(d.opus)}
                fill="#34d399" opacity={baseOpacity} rx="1.5" />
              {/* hover ring */}
              {isHover && (
                <rect x={x(i) - 2} y={yOpus - 2} width={w + 4} height={innerH - (yOpus - P.t) + 2}
                  fill="none" stroke="#34d399" strokeWidth="0.75" strokeDasharray="2 2" rx="2" opacity="0.5" />
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
        <span className="flex items-center gap-1.5" style={{ color: '#6ee7b7' }}><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#34d399' }} /> opus</span>
        <span className="flex items-center gap-1.5" style={{ color: '#bae6fd' }}><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#7dd3fc' }} /> sonnet</span>
        <span className="flex items-center gap-1.5" style={{ color: '#c4b5fd' }}><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#a78bfa' }} /> haiku</span>
      </div>
      {/* hover tooltip */}
      {cur && (
        <div className="absolute top-3 left-12 surface-2 px-3 py-2.5 pointer-events-none" style={{ minWidth: 180 }}>
          <div className="t-eyebrow mb-1.5">{cur.today ? 'today' : cur.day}</div>
          <div className="display-tight font-semibold text-[18px] text-zinc-100 num leading-none mb-1">{(cur.total/1e6).toFixed(2)}M</div>
          <div className="t-meta mb-2.5" style={{ fontSize: '10.5px' }}>${cur.cost.toFixed(2)} · total tokens</div>
          <div className="space-y-1 text-[11px] font-mono">
            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: '#34d399' }} /><span style={{ color: 'var(--ink-3)' }} className="flex-1">opus</span><span className="num text-zinc-200">{(cur.opus/1e3).toFixed(0)}k</span></div>
            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: '#7dd3fc' }} /><span style={{ color: 'var(--ink-3)' }} className="flex-1">sonnet</span><span className="num text-zinc-200">{(cur.sonnet/1e3).toFixed(0)}k</span></div>
            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: '#a78bfa' }} /><span style={{ color: 'var(--ink-3)' }} className="flex-1">haiku</span><span className="num text-zinc-200">{(cur.haiku/1e3).toFixed(0)}k</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cache panel — claude-style ──────────────────────────────────────────────

function CachePanel() {
  // composition: uncached, cache write 5m, cache write 1h, cache read
  const COMP = [
    { key: 'uncached',   label: 'uncached',          tokens: 1.2e6, color: '#facc88' },
    { key: 'write_5m',   label: 'cache write (5m)',  tokens: 0.6e6, color: '#7dd3fc' },
    { key: 'write_1h',   label: 'cache write (1h)',  tokens: 0.3e6, color: '#5b86c4' },
    { key: 'read',       label: 'cache read',        tokens:17.6e6, color: '#34d399' },
  ];
  const total = COMP.reduce((a,b) => a + b.tokens, 0);
  const readRatio = COMP[3].tokens / total;
  const writeAmort = (COMP[3].tokens / (COMP[1].tokens + COMP[2].tokens)).toFixed(2);

  // ratio sparkline (12 points)
  const SERIES = [0.42, 0.51, 0.58, 0.61, 0.65, 0.68, 0.72, 0.74, 0.78, 0.81, 0.82, 0.83];

  return (
    <Card padding="p-5">
      {/* big ratio */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-1.5 t-eyebrow mb-2">
            cache read ratio
            <span className="text-zinc-600 text-[10px]">ⓘ</span>
          </div>
          <div className="display-tight font-semibold text-[44px] text-zinc-100 num leading-none">
            {(readRatio * 100).toFixed(1)}<span className="text-[24px] text-zinc-500">%</span>
          </div>
          <div className="t-meta mt-1.5" style={{ fontSize: '10.5px' }}>vs previous period</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="chip chip-emerald num">▲ 32.6%</span>
          <Sparkline data={SERIES} w={140} h={42} color="#34d399" />
        </div>
      </div>

      <div className="t-meta mb-3" style={{ fontSize: '10.5px' }}>data as of may 3, 11pm · updates hourly</div>

      {/* breakdown */}
      <div className="surface-2 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12.5px] text-zinc-200 font-medium">cache usage breakdown <span className="text-zinc-500 font-normal">· claude-sonnet-4-5</span></span>
          <span className="font-mono num text-zinc-300 text-[11.5px]">{(total/1e6).toFixed(2)}M input</span>
        </div>
        {/* composition bar */}
        <div className="h-3 rounded overflow-hidden flex" style={{ background: 'var(--bg-0)' }}>
          {COMP.map(c => (
            <div key={c.key} style={{ width: `${(c.tokens/total)*100}%`, background: c.color }} />
          ))}
        </div>
        {/* legend */}
        <div className="grid grid-cols-4 gap-2 mt-3 text-[10.5px] font-mono">
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
            <div className="t-eyebrow mb-1">read ratio</div>
            <div className="display-tight font-semibold text-[18px] text-zinc-100 num">{(readRatio*100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="t-eyebrow mb-1">write amort.</div>
            <div className="display-tight font-semibold text-[18px] text-zinc-100 num">{writeAmort}<span className="text-zinc-500 text-[12px]">×</span></div>
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

  return (
    <div className="flex items-center gap-5">
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
          <text x={cx} y={cy - 6} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--ink-3)">
            {cur ? cur.project : 'total spend'}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontFamily="Inter Tight" fontWeight="600" fontSize="22" letterSpacing="-0.02em" fill="#f4f4f5">
            {cur ? `${(cur.portion * 100).toFixed(1)}%` : `$${total.toFixed(0)}`}
          </text>
          <text x={cx} y={cy + 28} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--ink-4)">
            {cur ? `$${cur.cost.toFixed(2)}` : `${(tokensTotal/1e6).toFixed(1)}M tokens`}
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
              <span className="font-mono text-[12.5px] text-zinc-200 truncate" style={{ minWidth: 0, flex: '1 1 auto' }}>{s.project}</span>
              {/* hover-only details */}
              <span className={`font-mono num text-[10.5px] text-right tabular transition-opacity ${isHover ? 'opacity-100' : 'opacity-0'}`}
                style={{ color: 'var(--ink-3)', minWidth: 44 }}>{(s.tokens/1e6).toFixed(1)}M</span>
              <span className={`font-mono num text-[11px] text-right tabular transition-opacity ${isHover ? 'opacity-100' : 'opacity-0'}`}
                style={{ color: '#6ee7b7', minWidth: 50 }}>${s.cost.toFixed(2)}</span>
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

// ─── DashboardScreen ─────────────────────────────────────────────────────────

function DashboardScreen() {
  const [provider, setProvider] = useStateD('all');
  const [model, setModel] = useStateD('all');
  const [period, setPeriod] = useStateD('14');

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="dashboards / overview"
        title="overview"
        subtitle="estimated cost, throughput, cache and token spend across all your sessions."
        right={<>
          <button className="btn btn-ghost"><window.Icon.Refresh size={13} /> refresh</button>
          <button className="btn btn-neutral"><window.Icon.Plus size={13} /> add metric</button>
        </>}
      />

      <FilterBar
        provider={provider} setProvider={setProvider}
        model={model} setModel={setModel}
        period={period} setPeriod={setPeriod}
      />

      {/* KPI strip — estimated cost moved to position 3 */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        <KPIBlock label="tokens" value="21.4" unit="M" delta={8.1} deltaLabel="vs prev 14d" spark={window.SPARK_TOKENS} sparkColor="#7dd3fc" />
        <KPIBlock label="sessions" value="86" delta={-3.2} deltaLabel="vs prev 14d" spark={window.SPARK_SESSIONS} sparkColor="#a78bfa" />
        <KPIBlock label="estimated cost" value="$214.42" delta={12.4} deltaLabel="vs prev 14d" spark={window.SPARK_COST} accent />
        <KPIBlock label="avg / session" value="$2.49" delta={4.1} deltaLabel="vs prev 14d" sparkColor="#fbbf24" sub="cost per turn $0.04" />
      </div>

      {/* Throughput bar chart (full width, cleaner with the bar treatment) */}
      <Eyebrow num={1} label="throughput" meta={`${period === 'all' ? 'all time' : period + ' days'} · stacked by model · hover any day`} right={
        <span className="t-meta">21.4M total tokens · $214.42</span>
      } />
      <Card padding="p-5" className="mb-7">
        <BarChart data={window.CHART_14D} />
      </Card>

      {/* Cache + Tokens by project */}
      <div className="grid grid-cols-2 gap-5 mb-7">
        <div>
          <Eyebrow num={2} label="prompt caching" meta="composition & read ratio" />
          <CachePanel />
        </div>
        <div>
          <Eyebrow num={3} label="tokens by project" meta={`${window.TOKENS_BY_PROJECT.length} projects · share of spend`} right={<a href="#" className="t-meta hover:text-zinc-100 flex items-center gap-1">view all <window.Icon.ArrowRight size={11} /></a>} />
          <Card padding="p-5">
            <ProjectPie rows={window.TOKENS_BY_PROJECT} />
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
            {window.SESSIONS.slice(0, 5).map(s => (
              <tr key={s.id} className="hover-row cursor-pointer" onClick={() => window.location.hash = `#/sessions/${s.id}`}>
                <td className="px-4 py-3 font-mono">
                  <div className="flex items-center gap-2">
                    {s.live ? <StatusDot kind="emerald" pulse size={5} /> : <span className="w-[5px] h-[5px] rounded-full" style={{ background: 'var(--ink-4)' }} />}
                    <span className="text-zinc-200">{s.short}</span>
                  </div>
                </td>
                <td className="px-4 py-3 truncate max-w-[320px]" style={{ color: 'var(--ink-1)' }}>{s.preview}</td>
                <td className="px-4 py-3 t-meta">{s.project}</td>
                <td className="px-4 py-3 text-right font-mono num text-zinc-200">{s.turns}</td>
                <td className="px-4 py-3 text-right font-mono num text-emerald-300">${s.cost.toFixed(2)}</td>
                <td className="px-4 py-3 text-right t-meta">{s.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
window.DashboardScreen = DashboardScreen;
