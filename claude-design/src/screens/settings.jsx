// Settings — single page

function SettingsScreen() {
  return (
    <div className="fade-up">
      <PageHeader eyebrow="settings" title="settings" subtitle="all configuration is on disk. paths, hooks, mcp servers, pricing." />

      <div className="space-y-7">
        <section>
          <Eyebrow num={1} label="filesystem paths" meta="all data is local" />
          <Card padding="p-0">
            <ul className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
              {[
                ['state database', '~/.leibniz/state.db'],
                ['policy', '~/.leibniz/policy.yaml'],
                ['audit log', '~/.leibniz/audit.jsonl'],
                ['memory', '~/.leibniz/memory/'],
                ['claude code transcripts', '~/.claude/projects/'],
                ['pricing', '~/.leibniz/pricing.json'],
              ].map(([label, path]) => (
                <li key={path} className="px-4 py-3 flex items-center gap-3">
                  <StatusDot kind="emerald" size={5} />
                  <span className="text-[13px] text-zinc-200 flex-1">{label}</span>
                  <span className="font-mono text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{path}</span>
                  <button className="btn btn-ghost"><window.Icon.External size={11} /></button>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <Eyebrow num={2} label="hooks" meta="registered with claude code" />
          <Card padding="p-0">
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
                    <td className="px-4 py-3"><span className="flex items-center gap-1.5"><StatusDot kind="emerald" size={5} /><span className="font-mono text-[11.5px] text-zinc-300">{h.status}</span></span></td>
                    <td className="px-4 py-3 text-right font-mono num text-zinc-200">{h.calls}</td>
                    <td className="px-4 py-3 text-right t-meta">{h.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <Eyebrow num={3} label="mcp servers" meta="loaded for this session" />
          <Card padding="p-0">
            <ul className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
              {window.MCP_SERVERS.map(m => (
                <li key={m.name} className="px-4 py-3 flex items-center gap-3">
                  <StatusDot kind="emerald" size={5} />
                  <window.Icon.Plug size={13} className="text-zinc-500" />
                  <span className="font-mono text-[12.5px] text-zinc-200 flex-1">{m.name}</span>
                  <span className="chip">{m.transport}</span>
                  <span className="font-mono text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{m.tools} tools · {m.calls} calls</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <Eyebrow num={4} label="pricing" meta="$ per 1M tokens · editable" />
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
                {window.PRICING.map(p => (
                  <tr key={p.model} className="hover-row">
                    <td className="px-4 py-3 text-zinc-200">{p.model}</td>
                    <td className="px-4 py-3 text-right num text-zinc-200">${p.input.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right num text-zinc-200">${p.output.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right num" style={{ color: 'var(--ink-3)' }}>${p.cacheWrite.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right num text-emerald-300">${p.cacheRead.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <Eyebrow num={5} label="about" />
          <Card>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[12.5px] font-mono max-w-md">
              {[['version', 'v0.4.2'], ['commit', '640cf6b'], ['claude code', '1.0.18'], ['python', '3.12.4'], ['license', 'apache 2.0'], ['daemon', 'running']].map(([k, v]) => (
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
