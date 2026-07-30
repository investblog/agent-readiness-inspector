// Theme management (RI pattern, trimmed): dark / light / auto via
// documentElement.dataset.theme; preference in localStorage.

const THEME_STORAGE_KEY = 'agent_readiness_theme';

export type Theme = 'dark' | 'light';
type ThemePreference = Theme | 'auto';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function storedPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored;
  } catch {
    // localStorage may be blocked
  }
  return 'auto';
}

function apply(preference: ThemePreference): void {
  const effective = preference === 'auto' ? systemTheme() : preference;
  document.documentElement.dataset.theme = effective;
}

export function initTheme(): void {
  apply(storedPreference());
}

export function toggleTheme(): void {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // non-fatal
  }
  apply(next);
}
