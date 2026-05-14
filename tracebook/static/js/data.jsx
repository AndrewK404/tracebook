// data.jsx — fetches real data from the tracebook JSON API
// Populates the same window.* globals the design expects.

(async function bootstrap() {
  // ── fetch sessions list ──────────────────────────────────────────────────
  let sessions = [];
  try {
    const r = await fetch('/api/sessions');
    sessions = await r.json();
  } catch (e) {
    console.error('tracebook: /api/sessions failed', e);
  }
  window.SESSIONS = sessions;

  // ── fetch dashboard data ─────────────────────────────────────────────────
  let dashboard = null;
  try {
    const r = await fetch('/api/dashboard?period=14');
    dashboard = await r.json();
  } catch (e) {
    console.error('tracebook: /api/dashboard failed', e);
  }

  if (dashboard) {
    window.CHART_14D      = dashboard.chart || [];
    window.CHART_SERIES   = dashboard.chart_series || [];
    window.TOKENS_BY_PROJECT = dashboard.project_pie || [];
    window.SPARK_TOKENS   = dashboard.sparklines?.tokens   || Array(12).fill(0);
    window.SPARK_COST     = dashboard.sparklines?.cost     || Array(12).fill(0);
    window.SPARK_SESSIONS = dashboard.sparklines?.sessions || Array(12).fill(0);
    window.SPARK_CACHE    = dashboard.cache?.sparkline || Array(12).fill(dashboard.cache?.read_ratio || 0);
    window._DASHBOARD     = dashboard;
    window._DASH_PERIOD   = '14';
    window.DASH_FILTERS   = dashboard.filters || {};
  } else {
    window.CHART_14D      = [];
    window.CHART_SERIES   = [];
    window.TOKENS_BY_PROJECT = [];
    window.SPARK_TOKENS   = Array(12).fill(0);
    window.SPARK_COST     = Array(12).fill(0);
    window.SPARK_SESSIONS = Array(12).fill(0);
    window.SPARK_CACHE    = Array(12).fill(0);
    window._DASHBOARD     = null;
    window._DASH_PERIOD   = '14';
    window.DASH_FILTERS   = {};
  }

  // ── fetch settings ───────────────────────────────────────────────────────
  let settingsData = null;
  try {
    const r = await fetch('/api/settings');
    settingsData = await r.json();
  } catch (e) {
    console.error('tracebook: /api/settings failed', e);
  }

  if (settingsData) {
    window.HOOKS       = settingsData.hooks       || [];
    window.MCP_SERVERS = settingsData.mcp_servers || [];
    window.PRICING     = settingsData.pricing     || [];
    window._ABOUT      = settingsData.about       || {};
    window._PATHS      = settingsData.paths       || [];
    window.TRACE_PATHS  = settingsData.trace_paths || {};
  } else {
    window.HOOKS       = [];
    window.MCP_SERVERS = [];
    window.PRICING     = [];
    window._ABOUT      = {};
    window._PATHS      = [];
    window.TRACE_PATHS  = {};
  }

  window.updateTracePaths = async function(paths) {
    const r = await fetch('/api/settings/trace-paths', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paths || {}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || d.message || `trace path update failed (${r.status})`);
    window.TRACE_PATHS = d.paths || {};
    const pathRows = [
      ['claude code transcripts', window.TRACE_PATHS.claude_projects],
      ['codex transcripts', window.TRACE_PATHS.codex_sessions],
      ['codex archived transcripts', window.TRACE_PATHS.codex_archive_sessions],
      ['tracebook home', (window._PATHS.find(p => p.label === 'tracebook home') || {}).path],
    ].filter(([, path]) => path);
    window._PATHS = pathRows.map(([label, path]) => ({ label, path }));
    return d;
  };

  window.fetchSessions = async function() {
    try {
      const r = await fetch(`/api/sessions?ts=${Date.now()}`, { cache: 'no-store' });
      const d = await r.json();
      window.SESSIONS = Array.isArray(d) ? d : [];
      window.dispatchEvent(new CustomEvent('tracebook:sessions-ready'));
      return window.SESSIONS;
    } catch (e) {
      console.error('tracebook: sessions refresh failed', e);
      return window.SESSIONS || [];
    }
  };

  window.ensureFreshAssets = async function() {
    const current = String(window.__TRacebook_ASSET_VERSION__ || '');
    if (!current) return true;
    try {
      const r = await fetch(`/api/health?ts=${Date.now()}`, { cache: 'no-store' });
      const d = await r.json();
      const latest = String(d.assetVersion || '');
      if (latest && latest !== current) {
        window.location.reload();
        return false;
      }
    } catch (e) {
      console.warn('tracebook: asset freshness check failed', e);
    }
    return true;
  };

  // ── default session-detail globals (populated on-demand) ─────────────────
  window.CONTEXT_BUDGET = {
    model: '', contextMax: 200000, contextUsed: 0, categories: [],
  };
  window.CONTEXT_ITEMS = { agents: [], skills: [], mcp: [], memory: [], compressions: 0, systemTools: [] };
  window.TRACE         = { totalDuration: 0, totalTokens: 0, totalCost: 0, nodes: [] };
  window.NODE_DETAIL   = {};

  // ── fetch one session detail when the hash points to /sessions/<id> ──────
  async function loadSessionDetail(id) {
    if (!id) return null;
    if (window.ensureFreshAssets && !(await window.ensureFreshAssets())) return null;
    window._SESSION_DETAIL = null;
    window._SESSION_ERROR = null;
    window.TRACE = { totalDuration: 0, totalTokens: 0, totalCost: 0, nodes: [] };
    window.NODE_DETAIL = {};
    window.dispatchEvent(new CustomEvent('tracebook:session-loading', { detail: { id } }));
    try {
      const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!r.ok) {
        window._SESSION_ERROR = `session ${id} failed to load (${r.status})`;
        window.dispatchEvent(new CustomEvent('tracebook:session-error', { detail: { id, status: r.status } }));
        return null;
      }
      const d = await r.json();

      window.TRACE = d.trace || { totalDuration: 0, totalTokens: 0, totalCost: 0, nodes: [] };
      window.CONTEXT_BUDGET = d.contextBudget || {
        model: d.model, contextMax: d.contextMax || 200000,
        contextUsed: d.contextUsed || 0, categories: [],
      };

      // Build CONTEXT_ITEMS — prefer real parsed data from /api/sessions/{id}
      const ci = d.contextItems || {};
      const configuredMcp = (window.MCP_SERVERS || []).map(m => ({
        name: m.name,
        tokens: 1200,
        transport: m.transport,
        source: m.source || 'configured',
        calls: m.calls || 0,
      }));
      const systemTools = d.provider === 'openai'
        ? [
          { name: 'shell command', tokens: 4200 },
          { name: 'patch', tokens: 2600 },
          { name: 'read file', tokens: 2200 },
          { name: 'edit file', tokens: 2400 },
          { name: 'browser action', tokens: 2400 },
          { name: 'web search', tokens: 1700 },
          { name: 'mcp tool', tokens: 1800 },
          { name: 'sub-agent', tokens: 3600 },
        ]
        : [
          { name: 'Bash',       tokens: 4200 },
          { name: 'Edit',       tokens: 3100 },
          { name: 'Read',       tokens: 2200 },
          { name: 'Write',      tokens: 2100 },
          { name: 'Grep',       tokens: 1800 },
          { name: 'Glob',       tokens: 1300 },
          { name: 'WebFetch',   tokens: 2400 },
          { name: 'WebSearch',  tokens: 1700 },
          { name: 'Task',       tokens: 3600 },
        ];
      window.CONTEXT_ITEMS = {
        agents:  ci.agents  || [],
        skills:  ci.skills  || [],
        mcp:     (ci.mcp && ci.mcp.length ? ci.mcp : configuredMcp)
          .map(m => ({ name: m.name, tokens: 1200, tools: m.tools || 0, calls: m.calls || 0, transport: m.transport, source: m.source })),
        memory:  (ci.memory || []).map(m => ({ name: (m.path || '').split('/').slice(-2).join('/'), path: m.path })),
        compressions: ci.compressions || d.compressions || 0,
        systemTools,
      };

      // Build NODE_DETAIL stubs from trace nodes
      const nd = {};
      for (const n of (window.TRACE.nodes || [])) {
        nd[n.id] = n.detail || {
          input:      {
            name: n.name,
            preview: n.preview || '',
            input_tokens: n.inputTokens || 0,
            cache_write_tokens: n.cacheWrite || 0,
            cache_read_tokens: n.cacheRead || 0,
          },
          output:     {
            duration_ms: n.duration,
            output_tokens: n.outputTokens || 0,
            display_tokens: n.tokens || 0,
            cost: n.cost || 0,
            status: n.status || '',
          },
          attributes: {
            id: n.id,
            type: n.type,
            depth: n.depth,
            parent: n.parent,
            children: n.children || [],
            live: !!n.live,
          },
        };
      }
      window.NODE_DETAIL = nd;

      // Update SESSIONS list to inject latest version of this session
      const idx = (window.SESSIONS || []).findIndex(s => s.id === d.id || s.short === d.short);
      if (idx >= 0) window.SESSIONS[idx] = d;

      // patch transcript onto the detail
      window._SESSION_DETAIL = d;

      // notify React components to re-render with fresh data
      window.dispatchEvent(new CustomEvent('tracebook:session-ready', { detail: { id } }));
      return d;

    } catch (e) {
      console.error('tracebook: session detail fetch failed', e);
      window._SESSION_ERROR = String(e && e.message ? e.message : e);
      window.dispatchEvent(new CustomEvent('tracebook:session-error', { detail: { id, error: window._SESSION_ERROR } }));
      return null;
    }
  }
  window.loadSessionDetail = loadSessionDetail;

  function sessionIdFromHash(hash = window.location.hash) {
    const parts = String(hash || '').replace(/^#/, '').split('/').filter(Boolean);
    return parts[0] === 'sessions' ? (parts[1] || '') : '';
  }
  window.sessionIdFromHash = sessionIdFromHash;

  // Load detail for the initial route
  const hashId = sessionIdFromHash();
  if (hashId) {
    await loadSessionDetail(hashId);
  }

  // Re-load on hash changes
  window.addEventListener('hashchange', async () => {
    const h = window.location.hash;
    if (window.ensureFreshAssets && !(await window.ensureFreshAssets())) return;
    const id = sessionIdFromHash(h);
    if (id) await loadSessionDetail(id);
  });

  // ── expose fetchDashboard for the filter bar refresh button ──────────────
  window.fetchDashboard = async function(period = '14', provider = 'all', model = 'all') {
    try {
      const r = await fetch(`/api/dashboard?period=${period}&provider=${provider}&model=${model}`);
      const d = await r.json();
      window.CHART_14D         = d.chart || [];
      window.CHART_SERIES      = d.chart_series || [];
      window.TOKENS_BY_PROJECT = d.project_pie || [];
      window.SPARK_TOKENS      = d.sparklines?.tokens   || Array(12).fill(0);
      window.SPARK_COST        = d.sparklines?.cost     || Array(12).fill(0);
      window.SPARK_SESSIONS    = d.sparklines?.sessions || Array(12).fill(0);
      window.SPARK_CACHE       = d.cache?.sparkline || Array(12).fill(d.cache?.read_ratio || 0);
      window._DASHBOARD        = d;
      window._DASH_PERIOD      = period;
      window.DASH_FILTERS      = d.filters || {};
      return d;
    } catch (e) {
      console.error('tracebook: dashboard refresh failed', e);
      return null;
    }
  };

  // ── Signal that data is ready ────────────────────────────────────────────
  window.__tracebook_ready = true;
  window.dispatchEvent(new CustomEvent('tracebook:ready'));
})();
