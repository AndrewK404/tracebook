// Settings — single page

function SettingsScreen() {
  const about = window._ABOUT || {};
  const paths = window._PATHS || [];

  return (
    <div className="fade-up">
      <PageHeader eyebrow="settings" title="settings" subtitle="all configuration is on disk. paths, hooks, mcp servers, pricing." />

      <div className="space-y-7">
        <section>
          <Eyebrow num={1} label="filesystem paths" meta="all data is local" />
          <Card padding="p-0">
            <ul className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
              {paths.length > 0 ? paths.map(({ label, path }) => (
                <li key={path} className="px-4 py-3 flex items-center gap-3">
                  <StatusDot kind="emerald" size={5} />
                  <span className="text-[13px] text-zinc-200 flex-1">{label}</span>
                  <span className="font-mono text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{path}</span>
                  <button className="btn btn-ghost"><window.Icon.External size={11} /></button>
                </li>
              )) : (
                <li className="px-4 py-3 t-small" style={{ color: 'var(--ink-4)' }}>loading paths…</li>
              )}
            </ul>
          </Card>
        </section>

        <section>
          <Eyebrow num={2} label="hooks" meta="registered with claude code" />
          <Card padding="p-0">
            {window.HOOKS && window.HOOKS.length > 0 ? (
              <table className="w-full text-[12.5px]">
                <thead><tr className="t-eyebrow border-b" style={{ borderColor: 'var(--line-0)' }}>
                  <th className="text-left font-medium px-4 py-2.5">hook</th>
                  <th className="text-left font-medium px-4 py-2.5">status</th>
                  <th className="text-right font-medium px-4 py-2.5">calls today</th>
                  <th className="text-right font-medium px-4 py-2.5">last</th>
                </tr></thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
                  {window.HOOKS.map(h => (
                    <tr key={h.name} className="hover-row">
                      <td className="px-4 py-3 font-mono text-zinc-200">{h.name}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          <StatusDot kind={h.status === 'not registered' ? 'zinc' : 'emerald'} size={5} />
                          <span className="font-mono text-[11.5px] text-zinc-300">{h.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono num text-zinc-200">{h.calls}</td>
                      <td className="px-4 py-3 text-right t-meta">{h.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-6 t-small text-center" style={{ color: 'var(--ink-4)' }}>
                no hooks found in ~/.claude/settings.json
              </div>
            )}
          </Card>
        </section>

        <section>
          <Eyebrow num={3} label="mcp servers" meta="configured in ~/.claude/settings.json" />
          <Card padding="p-0">
            {window.MCP_SERVERS && window.MCP_SERVERS.length > 0 ? (
              <ul className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
                {window.MCP_SERVERS.map(m => (
                  <li key={m.name} className="px-4 py-3 flex items-center gap-3">
                    <StatusDot kind="emerald" size={5} />
                    <window.Icon.Plug size={13} className="text-zinc-500" />
                    <span className="font-mono text-[12.5px] text-zinc-200 flex-1">{m.name}</span>
                    <span className="chip">{m.transport}</span>
                    <span className="font-mono text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{m.calls} calls</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-6 t-small text-center" style={{ color: 'var(--ink-4)' }}>
                no mcp servers configured in ~/.claude/settings.json
              </div>
            )}
          </Card>
        </section>

        <section>
          <Eyebrow num={4} label="cost calculation" meta="how the dashboard's $ values are computed" />
          <Card>
            <div className="space-y-4 text-[12.5px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
              <p>
                Tracebook reads each <span className="font-mono" style={{ color: 'var(--ink-1)' }}>assistant</span> event's <span className="font-mono" style={{ color: 'var(--ink-1)' }}>message.usage</span> object directly from the JSONL transcript. There is no API call and no estimation — every dollar is the sum of token counts that Anthropic's API actually reported, multiplied by the per-token rate from the table below.
              </p>
              <div className="surface-2 p-4 font-mono text-[12px]" style={{ background: 'var(--bg-0)', color: 'var(--ink-1)' }}>
                <div style={{ color: '#6ee7b7' }}># for each assistant turn</div>
                <div>cost = (input_tokens             × input_rate)</div>
                <div>     + (output_tokens            × output_rate)</div>
                <div>     + (cache_creation_input     × cache_write_rate)</div>
                <div>     + (cache_read_input         × cache_read_rate)</div>
                <div>     ÷ 1,000,000</div>
              </div>
              <ul className="space-y-2 pl-4 list-disc" style={{ color: 'var(--ink-2)' }}>
                <li><span style={{ color: 'var(--ink-1)' }}>input_tokens</span> — uncached input. Full price.</li>
                <li><span style={{ color: 'var(--ink-1)' }}>output_tokens</span> — generated tokens. Highest rate.</li>
                <li><span style={{ color: 'var(--ink-1)' }}>cache_creation_input_tokens</span> — first time a prefix is sent with cache control. Charged at <strong>1.25×</strong> the input rate.</li>
                <li><span style={{ color: 'var(--ink-1)' }}>cache_read_input_tokens</span> — re-used cached prefix on subsequent requests. Charged at <strong>0.10×</strong> the input rate. The cache-read ratio on the dashboard tells you how much of your input is hitting this cheap path.</li>
              </ul>
              <p style={{ color: 'var(--ink-3)', fontSize: '11.5px' }}>
                Source of truth: <span className="font-mono">tracebook/pricing.py</span> and <span className="font-mono">tracebook/parsers/claude.py</span>. Rates below match Anthropic's published list prices as of {about.version || 'v0.1.0'}.
              </p>
            </div>
          </Card>
        </section>

        <section>
          <Eyebrow num={5} label="pricing" meta="$ per 1M tokens" />
          <Card padding="p-0">
            <table className="w-full text-[12.5px]">
              <thead><tr className="t-eyebrow border-b" style={{ borderColor: 'var(--line-0)' }}>
                <th className="text-left font-medium px-4 py-2.5">model</th>
                <th className="text-right font-medium px-4 py-2.5">input</th>
                <th className="text-right font-medium px-4 py-2.5">output</th>
                <th className="text-right font-medium px-4 py-2.5">cache write</th>
                <th className="text-right font-medium px-4 py-2.5">cache read</th>
              </tr></thead>
              <tbody className="divide-y font-mono" style={{ borderColor: 'var(--line-0)' }}>
                {(window.PRICING || []).map(p => (
                  <tr key={p.model} className="hover-row">
                    <td className="px-4 py-3" style={{ color: 'var(--ink-1)' }}>{p.model}</td>
                    <td className="px-4 py-3 text-right num" style={{ color: 'var(--ink-1)' }}>${p.input.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right num" style={{ color: 'var(--ink-1)' }}>${p.output.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right num" style={{ color: 'var(--ink-3)' }}>${p.cacheWrite.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right num text-emerald-300">${p.cacheRead.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <Eyebrow num={6} label="about" />
          <Card>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[12.5px] font-mono max-w-md">
              {[
                ['version',  about.version  || 'v0.1.0'],
                ['python',   about.python   || '—'],
                ['sessions', String(about.sessions ?? (window.SESSIONS ? window.SESSIONS.length : 0))],
                ['port',     String(about.port || 4178)],
                ['license',  about.license  || 'apache 2.0'],
                ['daemon',   about.daemon   || 'running'],
              ].map(([k, v]) => (
                <React.Fragment key={k}>
                  <span style={{ color: 'var(--ink-3)' }}>{k}</span>
                  <span className="text-zinc-200 text-right">{v}</span>
                </React.Fragment>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
window.SettingsScreen = SettingsScreen;
