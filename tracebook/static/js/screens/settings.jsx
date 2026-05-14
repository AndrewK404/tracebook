// Settings — single page

const TOOL_CATALOGS = [
  {
    id: 'claude',
    provider: 'Claude Code',
    label: 'built-in tools',
    icon: 'Brain',
    tone: 'emerald',
    source: 'Claude tools reference',
    sourceUrl: 'https://code.claude.com/docs/en/tools-reference',
    sources: [
      ['Claude tools reference', 'https://code.claude.com/docs/en/tools-reference'],
    ],
    checked: 'May 13, 2026',
    note: 'Exact names used in permissions, subagent tool lists, and hook matchers.',
    groups: [
      {
        title: 'code and shell',
        tools: [
          ['Bash', 'permission'],
          ['PowerShell', 'permission'],
          ['Read', 'safe'],
          ['Edit', 'permission'],
          ['Write', 'permission'],
          ['NotebookEdit', 'permission'],
          ['Glob', 'safe'],
          ['Grep', 'safe'],
          ['LSP', 'safe'],
          ['Monitor', 'permission'],
        ],
      },
      {
        title: 'agents and planning',
        tools: [
          ['Agent', 'safe'],
          ['AskUserQuestion', 'safe'],
          ['EnterPlanMode', 'safe'],
          ['ExitPlanMode', 'permission'],
          ['EnterWorktree', 'safe'],
          ['ExitWorktree', 'safe'],
          ['SendMessage', 'safe'],
          ['TeamCreate', 'safe'],
          ['TeamDelete', 'safe'],
        ],
      },
      {
        title: 'tasks and schedules',
        tools: [
          ['TaskCreate', 'safe'],
          ['TaskGet', 'safe'],
          ['TaskList', 'safe'],
          ['TaskUpdate', 'safe'],
          ['TaskStop', 'safe'],
          ['TaskOutput', 'deprecated'],
          ['CronCreate', 'safe'],
          ['CronDelete', 'safe'],
          ['CronList', 'safe'],
          ['TodoWrite', 'deprecated'],
        ],
      },
      {
        title: 'context and extensions',
        tools: [
          ['Skill', 'permission'],
          ['ToolSearch', 'safe'],
          ['ListMcpResourcesTool', 'safe'],
          ['ReadMcpResourceTool', 'safe'],
          ['WebFetch', 'permission'],
          ['WebSearch', 'permission'],
          ['PushNotification', 'safe'],
          ['RemoteTrigger', 'safe'],
          ['ShareOnboardingGuide', 'permission'],
        ],
      },
    ],
  },
  {
    id: 'codex',
    provider: 'OpenAI Codex',
    label: 'verified current runtime tools',
    icon: 'Terminal',
    tone: 'violet',
    source: 'OpenAI apply patch docs',
    sourceUrl: 'https://platform.openai.com/docs/guides/tools-apply-patch',
    sources: [
      ['OpenAI shell tool', 'https://platform.openai.com/docs/guides/tools-shell'],
      ['OpenAI apply patch', 'https://platform.openai.com/docs/guides/tools-apply-patch'],
      ['OpenAI tools overview', 'https://platform.openai.com/docs/guides/tools?api-mode=chat'],
    ],
    checked: 'May 13, 2026',
    note: 'Exact callable names observed in the active Codex runtime and mapped into traces.',
    groups: [
      {
        title: 'verified runtime tools',
        tools: [
          ['exec_command', 'runtime'],
          ['write_stdin', 'runtime'],
          ['apply_patch', 'runtime'],
          ['update_plan', 'runtime'],
          ['view_image', 'runtime'],
          ['spawn_agent', 'agent'],
          ['send_input', 'agent'],
          ['resume_agent', 'agent'],
          ['wait_agent', 'agent'],
          ['close_agent', 'agent'],
          ['list_mcp_resources', 'mcp'],
          ['list_mcp_resource_templates', 'mcp'],
          ['read_mcp_resource', 'mcp'],
          ['request_user_input', 'ui'],
          ['request_plugin_install', 'ui'],
          ['web.search_query', 'web'],
          ['web.open', 'web'],
          ['web.image_query', 'web'],
          ['web.finance', 'web'],
          ['web.weather', 'web'],
          ['web.sports', 'web'],
          ['web.time', 'web'],
          ['image_gen.imagegen', 'image'],
          ['mcp__server__tool', 'mcp'],
        ],
      },
    ],
  },
];

const TOOL_BADGE = {
  permission: 'asks',
  safe: 'no prompt',
  deprecated: 'deprecated',
  hook: 'hook',
  trace: 'trace',
  alias: 'alias',
  docs: 'docs',
  mapped: 'mapped',
  runtime: 'runtime',
  agent: 'agent',
  mcp: 'mcp',
  ui: 'ui',
  web: 'web',
  image: 'image',
};

const CLAUDE_TOOL_DESCRIPTIONS = {
  Agent: 'Spawns a subagent with its own context window to handle a task.',
  AskUserQuestion: 'Asks multiple-choice questions to gather requirements or clarify ambiguity.',
  Bash: 'Executes shell commands in your environment.',
  CronCreate: 'Schedules a recurring or one-shot prompt within the current session.',
  CronDelete: 'Cancels a scheduled task by ID.',
  CronList: 'Lists all scheduled tasks in the session.',
  Edit: 'Makes targeted edits to specific files.',
  EnterPlanMode: 'Switches to plan mode to design an approach before coding.',
  EnterWorktree: 'Creates an isolated git worktree or switches into an existing worktree.',
  ExitPlanMode: 'Presents a plan for approval and exits plan mode.',
  ExitWorktree: 'Exits a worktree session and returns to the original directory.',
  Glob: 'Finds files based on pattern matching.',
  Grep: 'Searches for patterns in file contents.',
  ListMcpResourcesTool: 'Lists resources exposed by connected MCP servers.',
  LSP: 'Code intelligence via language servers: definitions, references, type errors, and warnings.',
  Monitor: 'Runs a command in the background and feeds each output line back to Claude.',
  NotebookEdit: 'Modifies Jupyter notebook cells.',
  PowerShell: 'Executes PowerShell commands natively.',
  PushNotification: 'Sends a desktop notification and remote push when available.',
  Read: 'Reads file contents.',
  ReadMcpResourceTool: 'Reads a specific MCP resource by URI.',
  RemoteTrigger: 'Creates, updates, runs, and lists routines on claude.ai.',
  SendMessage: 'Sends a message to an agent teammate or resumes a subagent by ID.',
  ShareOnboardingGuide: 'Uploads ONBOARDING.md and returns a Claude Code share link.',
  Skill: 'Executes a skill within the main conversation.',
  TaskCreate: 'Creates a new task in the task list.',
  TaskGet: 'Retrieves full details for a specific task.',
  TaskList: 'Lists all tasks with their current status.',
  TaskOutput: 'Deprecated task output reader.',
  TaskStop: 'Kills a running background task by ID.',
  TaskUpdate: 'Updates task status, dependencies, details, or deletes tasks.',
  TeamCreate: 'Creates an agent team with multiple teammates.',
  TeamDelete: 'Disbands an agent team and cleans up teammate processes.',
  TodoWrite: 'Deprecated checklist manager; task tools are preferred.',
  ToolSearch: 'Searches for and loads deferred tools when tool search is enabled.',
  WebFetch: 'Fetches content from a specified URL.',
  WebSearch: 'Performs web searches.',
  Write: 'Creates or overwrites files.',
};

function toolTotal(catalog) {
  return catalog.groups.reduce((sum, group) => sum + group.tools.length, 0);
}

function ToolChip({ name, kind, catalog }) {
  const description = catalog.id === 'claude' ? CLAUDE_TOOL_DESCRIPTIONS[name] || '' : '';
  return (
    <span className={`tool-chip ${kind}`} title={description || name}>
      <span className="tool-chip-name">{name}</span>
      <span className="tool-chip-badge">{TOOL_BADGE[kind] || kind}</span>
      {description && <span className="tool-chip-tooltip" aria-hidden="true">{description}</span>}
    </span>
  );
}

function ToolCatalogPanel({ catalog }) {
  const IconC = window.Icon[catalog.icon] || window.Icon.Tool;
  return (
    <article className={`tool-provider-panel ${catalog.tone}`}>
      <header className="tool-provider-head">
        <div className="tool-provider-icon"><IconC size={17} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3>{catalog.provider}</h3>
            <span className="tool-count">{toolTotal(catalog)} tools</span>
          </div>
          <p>{catalog.label}</p>
        </div>
        <a className="tool-doc-link" href={catalog.sourceUrl} target="_blank" rel="noreferrer" title={catalog.source}>
          <window.Icon.External size={12} />
        </a>
      </header>
      <div className="tool-provider-note">
        <span>{catalog.note}</span>
        <span className="tool-checked">checked {catalog.checked}</span>
      </div>
      <div className="tool-source-links">
        {(catalog.sources || [[catalog.source, catalog.sourceUrl]]).map(([label, href]) => (
          <a key={href} href={href} target="_blank" rel="noreferrer">
            <window.Icon.External size={11} /> {label}
          </a>
        ))}
      </div>
      <div className="tool-group-list">
        {catalog.groups.map(group => (
          <section key={group.title} className="tool-group">
            <div className="tool-group-title">{group.title}</div>
            <div className="tool-chip-grid">
              {group.tools.map(([name, kind]) => (
                <ToolChip key={`${group.title}-${name}`} name={name} kind={kind} catalog={catalog} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function ToolCatalogSection() {
  return (
    <section>
      <Eyebrow num={2} label="agent tools" meta="latest Claude Code and OpenAI Codex names" />
      <div className="tool-catalog-grid">
        {TOOL_CATALOGS.map(catalog => <ToolCatalogPanel key={catalog.id} catalog={catalog} />)}
      </div>
    </section>
  );
}

function formatPricingValue(value) {
  const n = Number(value || 0);
  if (n === 0) return '$0.00';
  if (Math.abs(n) < 1) {
    if (Math.abs(n - Number(n.toFixed(2))) < 0.000001) return `$${n.toFixed(2)}`;
    return `$${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  }
  return `$${n.toFixed(2)}`;
}

function SettingsScreen() {
  const paths = window._PATHS || [];
  const initialTracePaths = window.TRACE_PATHS || {};
  const [tracePaths, setTracePaths] = React.useState({
    claude_projects: initialTracePaths.claude_projects || '',
    codex_sessions: initialTracePaths.codex_sessions || '',
    codex_archive_sessions: initialTracePaths.codex_archive_sessions || '',
  });
  const [editingPathKey, setEditingPathKey] = React.useState(null);
  const [draftPath, setDraftPath] = React.useState('');
  const [pathSaveState, setPathSaveState] = React.useState({ status: 'idle', message: '' });
  const [pricingProvider, setPricingProvider] = React.useState('anthropic');
  const [settingsFilter, setSettingsFilter] = React.useState('');
  const settingsQuery = settingsFilter.trim().toLowerCase();
  const matchesSettingsFilter = (...values) => (
    !settingsQuery || values.some(value => String(value || '').toLowerCase().includes(settingsQuery))
  );
  const providerAliases = {
    anthropic: ['anthropic', 'claude'],
    openai: ['openai', 'codex'],
    google: ['google', 'gemini'],
    all: [],
  };
  const matchesProviderFilter = (...values) => {
    if (pricingProvider === 'all') return true;
    const haystack = values.map(value => String(value || '').toLowerCase()).join(' ');
    return (providerAliases[pricingProvider] || []).some(alias => haystack.includes(alias));
  };
  const filteredHooks = (window.HOOKS || [])
    .filter(h => matchesProviderFilter(h.name, h.source))
    .filter(h => matchesSettingsFilter(h.name, h.status, h.calls, h.last));
  const filteredMcpServers = (window.MCP_SERVERS || [])
    .filter(m => matchesProviderFilter(m.name, m.source, m.transport))
    .filter(m => matchesSettingsFilter(m.name, m.source, m.transport, m.status, m.calls));
  const pricingRows = (window.PRICING || [])
    .filter(p => matchesProviderFilter(p.provider, p.model))
    .filter(p => matchesSettingsFilter(p.provider, p.model, p.input, p.output, p.cacheWrite, p.cacheRead, p.notes));
  const pricingTableRef = React.useRef(null);
  const pricingProviders = [
    { value: 'anthropic', label: 'anthropic' },
    { value: 'openai', label: 'openai / codex' },
    { value: 'google', label: 'google' },
    { value: 'all', label: 'all' },
  ];
  const pathFields = [
    ['claude_projects', 'Claude Code transcripts', '~/.claude/projects'],
    ['codex_sessions', 'Codex transcripts', '~/.codex/sessions'],
    ['codex_archive_sessions', 'Codex archived transcripts', '~/.codex/archived_sessions'],
  ];
  const pathLabels = Object.fromEntries(pathFields.map(([key, label, placeholder]) => [key, { label, placeholder }]));
  const listPathRows = [
    ...pathFields.map(([key, label, placeholder]) => ({
      key,
      label,
      placeholder,
      path: tracePaths[key] || placeholder,
      editable: true,
    })),
    ...paths
      .filter(({ label }) => label === 'tracebook home')
      .map(({ label, path }) => ({ key: 'tracebook_home', label, path, editable: false })),
  ];

  const beginEditPath = (key) => {
    setEditingPathKey(key);
    setDraftPath(tracePaths[key] || '');
    setPathSaveState({ status: 'idle', message: '' });
  };

  const cancelEditPath = () => {
    setEditingPathKey(null);
    setDraftPath('');
  };

  React.useEffect(() => {
    if (!editingPathKey) return undefined;
    const onPointerDown = (event) => {
      const currentRow = event.target.closest(`[data-path-key="${editingPathKey}"]`);
      if (!currentRow) cancelEditPath();
    };
    window.setTimeout(() => document.addEventListener('pointerdown', onPointerDown), 0);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [editingPathKey]);

  const saveTracePaths = async (nextPaths = tracePaths) => {
    setPathSaveState({ status: 'saving', message: 'saving paths...' });
    try {
      const result = await window.updateTracePaths(nextPaths);
      setTracePaths(result.paths || nextPaths);
      setEditingPathKey(null);
      setDraftPath('');
      setPathSaveState({
        status: 'saved',
        message: result.message || `paths saved; ${result.sessions} sessions indexed`,
      });
    } catch (error) {
      setPathSaveState({ status: 'error', message: error.message || 'path update failed' });
    }
  };

  const saveEditedPath = async (key) => {
    const nextPaths = { ...tracePaths, [key]: draftPath.trim() };
    await saveTracePaths(nextPaths);
  };

  const choosePricingProvider = (value) => {
    setPricingProvider(value);
    window.requestAnimationFrame(() => {
      if (pricingTableRef.current) pricingTableRef.current.scrollTop = 0;
    });
  };

  return (
    <div className="fade-up">
      <PageHeader eyebrow="settings" title="settings" subtitle="all configuration is on disk. paths, hooks, mcp servers, pricing." />

      <div className="space-y-7">
        <section>
          <Eyebrow num={1} label="filesystem paths" meta="all data is local" />
          <Card padding="p-0" className="trace-path-card">
            <ul className="divide-y trace-path-current" style={{ borderColor: 'var(--line-0)' }}>
              {listPathRows.length > 0 ? listPathRows.map(({ key, label, path, placeholder, editable }) => (
                <li
                  key={key}
                  data-path-key={key}
                  className={`trace-path-list-row ${editingPathKey === key ? 'editing' : ''} ${editable ? 'editable' : ''}`}
                  onClick={() => editable && beginEditPath(key)}
                >
                  <div className="trace-path-list-display">
                    <StatusDot kind="emerald" size={5} />
                    <span className="trace-path-list-label">{label}</span>
                    <span className="trace-path-list-value">{path}</span>
                    {editable ? <span className="trace-path-change">change</span> : <button className="btn btn-ghost"><window.Icon.External size={11} /></button>}
                  </div>
                  {editingPathKey === key && (
                    <form
                      className="trace-path-inline-editor"
                      onClick={(event) => event.stopPropagation()}
                      onSubmit={(event) => { event.preventDefault(); saveEditedPath(key); }}
                    >
                      <input
                        name={key}
                        value={draftPath}
                        onChange={(event) => setDraftPath(event.target.value)}
                        placeholder={placeholder || pathLabels[key]?.placeholder}
                        autoFocus
                      />
                      <button className="btn btn-emerald" type="submit" disabled={pathSaveState.status === 'saving'}>
                        <window.Icon.Settings size={12} /> {pathSaveState.status === 'saving' ? 'saving' : 'save'}
                      </button>
                      <button className="btn btn-ghost" type="button" onClick={cancelEditPath}>cancel</button>
                    </form>
                  )}
                </li>
              )) : (
                <li className="px-4 py-3 t-small" style={{ color: 'var(--ink-4)' }}>loading paths…</li>
              )}
            </ul>
            {pathSaveState.message && (
              <div className={`trace-path-status ${pathSaveState.status}`}>
                {pathSaveState.status === 'error' ? <window.Icon.X size={13} /> : <StatusDot kind="emerald" size={5} />}
                <span>{pathSaveState.message}</span>
              </div>
            )}
          </Card>
        </section>

        <ToolCatalogSection />

        <section className="settings-filter-section">
          <div className="settings-combined-filter">
            <div className="settings-provider-filter-panel">
              <span>pricing provider</span>
              <div className="settings-provider-filter-pills">
                {pricingProviders.map(p => (
                  <window.Pill key={p.value} active={pricingProvider === p.value} onClick={() => choosePricingProvider(p.value)}>{p.label}</window.Pill>
                ))}
              </div>
            </div>
            <div className="settings-filter-panel">
              <window.Icon.Search size={14} />
              <input
                id="settings-filter"
                name="settings-filter"
                value={settingsFilter}
                onChange={(event) => setSettingsFilter(event.target.value)}
                placeholder="filter hooks, mcp servers, pricing..."
              />
              {settingsFilter && (
                <button className="btn btn-ghost" onClick={() => setSettingsFilter('')}>clear</button>
              )}
              <span>applies to 03-05</span>
            </div>
          </div>
        </section>

        <section>
          <Eyebrow num={3} label="hooks" meta="registered with claude code" />
          <Card padding="p-0">
            {filteredHooks.length > 0 ? (
              <table className="w-full text-[12.5px]">
                <thead><tr className="t-eyebrow border-b" style={{ borderColor: 'var(--line-0)' }}>
                  <th className="text-left font-medium px-4 py-2.5">hook</th>
                  <th className="text-left font-medium px-4 py-2.5">status</th>
                  <th className="text-right font-medium px-4 py-2.5">calls today</th>
                  <th className="text-right font-medium px-4 py-2.5">last</th>
                </tr></thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
                  {filteredHooks.map(h => (
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
                {settingsQuery ? 'no hooks match the filter' : 'no hooks found in ~/.claude/settings.json'}
              </div>
            )}
          </Card>
        </section>

        <section>
          <Eyebrow num={4} label="mcp servers" meta="configured in ~/.claude/settings.json" />
          <Card padding="p-0">
            {filteredMcpServers.length > 0 ? (
              <ul className="divide-y" style={{ borderColor: 'var(--line-0)' }}>
                {filteredMcpServers.map(m => (
                  <li key={m.name} className="px-4 py-3 flex items-center gap-3">
                    <StatusDot kind="emerald" size={5} />
                    <window.Icon.Plug size={13} className="text-zinc-500" />
                    <span className="font-mono text-[12.5px] text-zinc-200 flex-1">{m.name}</span>
                    <span className="chip">{m.source || 'config'}</span>
                    <span className="chip">{m.transport}</span>
                    <span className={`font-mono text-[11.5px] ${m.status === 'disabled' ? 'text-zinc-500' : 'text-emerald-300'}`}>{m.status || 'configured'}</span>
                    <span className="font-mono text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{m.calls} calls</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-6 t-small text-center" style={{ color: 'var(--ink-4)' }}>
                {settingsQuery ? 'no mcp servers match the filter' : 'no mcp servers configured in ~/.claude/settings.json'}
              </div>
            )}
          </Card>
        </section>

        <section className="pricing-section">
          <Eyebrow num={5} label="pricing" meta="$ per 1M tokens" />
          <Card padding="p-0">
            <div ref={pricingTableRef} className={pricingRows.length > 10 ? 'pricing-table-scroll' : ''}>
              <table className="w-full text-[12.5px]">
                <thead><tr className="t-eyebrow border-b" style={{ borderColor: 'var(--line-0)' }}>
                  <th className="text-left font-medium px-4 py-2.5 w-[120px]">provider</th>
                  <th className="text-left font-medium px-4 py-2.5">model</th>
                  <th className="text-right font-medium px-4 py-2.5">input</th>
                  <th className="text-right font-medium px-4 py-2.5">output</th>
                  <th className="text-right font-medium px-4 py-2.5">cache write</th>
                  <th className="text-right font-medium px-4 py-2.5">cached input</th>
                </tr></thead>
                <tbody className="divide-y font-mono" style={{ borderColor: 'var(--line-0)' }}>
                  {pricingRows.map(p => (
                    <tr key={`${p.provider}-${p.model}`} className="hover-row">
                      <td className="px-4 py-3" style={{ color: 'var(--ink-3)' }}>{p.provider}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--ink-1)' }}>
                        <div>{p.model}</div>
                        {p.notes && <div className="t-meta mt-1" style={{ fontSize: '10.5px' }}>{p.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-right num" style={{ color: 'var(--ink-1)' }}>{formatPricingValue(p.input)}</td>
                      <td className="px-4 py-3 text-right num" style={{ color: 'var(--ink-1)' }}>{formatPricingValue(p.output)}</td>
                      <td className="px-4 py-3 text-right num" style={{ color: 'var(--ink-3)' }}>{formatPricingValue(p.cacheWrite)}</td>
                      <td className="px-4 py-3 text-right num text-emerald-300">{formatPricingValue(p.cacheRead)}</td>
                    </tr>
                  ))}
                  {pricingRows.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-4 py-6 text-center" style={{ color: 'var(--ink-4)' }}>
                        no pricing rows match the filter
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
window.SettingsScreen = SettingsScreen;
