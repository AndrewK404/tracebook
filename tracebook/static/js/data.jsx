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
    window.TOKENS_BY_PROJECT = dashboard.project_pie || [];
    window.SPARK_TOKENS   = dashboard.sparklines?.tokens   || Array(12).fill(0);
    window.SPARK_COST     = dashboard.sparklines?.cost     || Array(12).fill(0);
    window.SPARK_SESSIONS = dashboard.sparklines?.sessions || Array(12).fill(0);
    window.SPARK_CACHE    = Array(12).fill(dashboard.cache?.read_ratio || 0);
    window._DASHBOARD     = dashboard;
  } else {
    window.CHART_14D      = [];
    window.TOKENS_BY_PROJECT = [];
    window.SPARK_TOKENS   = Array(12).fill(0);
    window.SPARK_COST     = Array(12).fill(0);
    window.SPARK_SESSIONS = Array(12).fill(0);
    window.SPARK_CACHE    = Array(12).fill(0);
    window._DASHBOARD     = null;
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
  } else {
    window.HOOKS       = [];
    window.MCP_SERVERS = [];
    window.PRICING     = [];
    window._ABOUT      = {};
    window._PATHS      = [];
  }

  // ── default session-detail globals (populated on-demand) ─────────────────
  window.CONTEXT_BUDGET = {
    model: '', contextMax: 200000, contextUsed: 0, categories: [],
  };
  window.CONTEXT_ITEMS = { agents: [], skills: [], mcp: [], memory: [], systemTools: [] };
  window.TRACE         = { totalDuration: 0, totalTokens: 0, totalCost: 0, nodes: [] };
  window.NODE_DETAIL   = {};

  // ── fetch one session detail when the hash points to /sessions/<id> ──────
  async function loadSessionDetail(id) {
    if (!id) return;
    try {
      const r = await fetch(`/api/sessions/${id}`);
      if (!r.ok) return;
      const d = await r.json();

      window.TRACE = d.trace || { totalDuration: 0, totalTokens: 0, totalCost: 0, nodes: [] };
      window.CONTEXT_BUDGET = d.contextBudget || {
        model: d.model, contextMax: d.contextMax || 200000,
        contextUsed: d.contextUsed || 0, categories: [],
      };

      // Build CONTEXT_ITEMS — prefer real parsed data from /api/sessions/{id}
      const ci = d.contextItems || {};
      window.CONTEXT_ITEMS = {
        agents:  ci.agents  || [],
        skills:  ci.skills  || [],
        mcp:     (ci.mcp || []).map(m => ({ name: m.name, tokens: 1200, tools: m.tools || 0, calls: m.calls || 0 })),
        memory:  (ci.memory || []).map(m => ({ name: (m.path || '').split('/').slice(-2).join('/'), path: m.path })),
        systemTools: [
          { name: 'Bash',       tokens: 4200 },
          { name: 'Edit',       tokens: 3100 },
          { name: 'Read',       tokens: 2200 },
          { name: 'Write',      tokens: 2100 },
          { name: 'Grep',       tokens: 1800 },
          { name: 'Glob',       tokens: 1300 },
          { name: 'WebFetch',   tokens: 2400 },
          { name: 'WebSearch',  tokens: 1700 },
          { name: 'Task',       tokens: 3600 },
        ],
      };

      // Build NODE_DETAIL stubs from trace nodes
      const nd = {};
      for (const n of (window.TRACE.nodes || [])) {
        nd[n.id] = {
          input:      { name: n.name, preview: n.preview || '', tokens: n.tokens },
          output:     { duration_ms: n.duration, stop_reason: '' },
          attributes: { type: n.type, depth: n.depth, cost: n.cost },
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

    } catch (e) {
      console.error('tracebook: session detail fetch failed', e);
    }
  }

  // Load detail for the initial route
  const hashId = window.location.hash.replace('#/sessions/', '');
  if (window.location.hash.startsWith('#/sessions/') && hashId) {
    await loadSessionDetail(hashId);
  }

  // Re-load on hash changes
  window.addEventListener('hashchange', async () => {
    const h = window.location.hash;
    if (h.startsWith('#/sessions/')) {
      const id = h.replace('#/sessions/', '');
      if (id) await loadSessionDetail(id);
    }
  });

  // ── expose fetchDashboard for the filter bar refresh button ──────────────
  window.fetchDashboard = async function(period = '14', provider = 'all', model = 'all') {
    try {
      const r = await fetch(`/api/dashboard?period=${period}&provider=${provider}&model=${model}`);
      const d = await r.json();
      window.CHART_14D         = d.chart || [];
      window.TOKENS_BY_PROJECT = d.project_pie || [];
      window.SPARK_TOKENS      = d.sparklines?.tokens   || Array(12).fill(0);
      window.SPARK_COST        = d.sparklines?.cost     || Array(12).fill(0);
      window.SPARK_SESSIONS    = d.sparklines?.sessions || Array(12).fill(0);
      window._DASHBOARD        = d;
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
