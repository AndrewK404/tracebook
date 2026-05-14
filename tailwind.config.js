module.exports = {
  content: [
    './tracebook/templates/**/*.html',
    './tracebook/static/js/**/*.jsx',
  ],
  safelist: [
    'max-w-none',
    'max-w-[1280px]',
    'text-amber-300',
    'text-cyan-300',
    'text-emerald-300',
    'text-rose-300',
    'text-violet-300',
    'text-zinc-500',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        display: ['Inter Tight', 'Inter', 'ui-sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
};
