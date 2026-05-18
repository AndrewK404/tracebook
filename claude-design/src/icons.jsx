// Custom monoline icons — 1.5px stroke, 16px default

function makeIcon(path, view = 24) {
  return ({ size = 16, className = '' }) => (
    <svg width={size} height={size} viewBox={`0 0 ${view} ${view}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {path}
    </svg>
  );
}

const Icon = {
  Dashboard: makeIcon(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  Sessions: makeIcon(<><path d="M4 6h16M4 12h16M4 18h10" /></>),
  Settings: makeIcon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  Filter: makeIcon(<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />),
  Search: makeIcon(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  ArrowRight: makeIcon(<path d="M5 12h14M13 5l7 7-7 7" />),
  ArrowUp: makeIcon(<path d="M7 14l5-5 5 5" />),
  ArrowDown: makeIcon(<path d="M7 10l5 5 5-5" />),
  ChevronDown: makeIcon(<path d="m6 9 6 6 6-6" />),
  ChevronRight: makeIcon(<path d="m9 6 6 6-6 6" />),
  ChevronLeft: makeIcon(<path d="m15 6-6 6 6 6" />),
  Dot: makeIcon(<circle cx="12" cy="12" r="3" fill="currentColor" />),
  Play: makeIcon(<polygon points="5 3 19 12 5 21 5 3" />),
  Pause: makeIcon(<><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>),
  Terminal: makeIcon(<><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>),
  Edit: makeIcon(<><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></>),
  File: makeIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>),
  Folder: makeIcon(<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />),
  Cpu: makeIcon(<><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></>),
  Activity: makeIcon(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />),
  Coin: makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5h-3a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 1 1 0 3h-3M12 7v1.5M12 15.5V17" /></>),
  Database: makeIcon(<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" /></>),
  Layers: makeIcon(<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>),
  Sparkles: makeIcon(<><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="M19 13l.7 2L22 16l-2.3 1L19 19l-.7-2L16 16l2.3-1z" /></>),
  Tool: makeIcon(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />),
  Brain: makeIcon(<><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" /><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" /></>),
  Plug: makeIcon(<><path d="M9 2v6M15 2v6M5 8h14M7 8v6a5 5 0 0 0 10 0V8M12 19v3" /></>),
  Hash: makeIcon(<><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>),
  Clock: makeIcon(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></>),
  Maximize: makeIcon(<><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>),
  X: makeIcon(<><line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" /></>),
  Plus: makeIcon(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  Copy: makeIcon(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  External: makeIcon(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>),
  Refresh: makeIcon(<><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>),
  Toggle: makeIcon(<><rect x="1" y="6" width="22" height="12" rx="6" /><circle cx="16" cy="12" r="3" fill="currentColor" /></>),
  Globe: makeIcon(<><circle cx="12" cy="12" r="9" /><line x1="3" y1="12" x2="21" y2="12" /><path d="M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18z" /></>),
  Logo: ({ size = 22, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id="tracebook-logo-bg" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0f172a" />
          <stop offset="0.55" stopColor="#10251f" />
          <stop offset="1" stopColor="#063f33" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#tracebook-logo-bg)" />
      <path d="M6.7 16.8C9.2 13.4 14.2 15.6 17.4 10.8" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="6.7" cy="16.8" r="1.35" fill="#34d399" />
      <circle cx="17.4" cy="10.8" r="1.35" fill="#67e8f9" />
      <path d="M7.2 7.2H16.8M12 7.2V17" stroke="#ecfdf5" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="#34d399" strokeOpacity="0.28" fill="none" />
    </svg>
  ),
};

window.Icon = Icon;
