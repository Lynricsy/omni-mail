export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<ThemePreference, 'system'>

const STORAGE_KEY = 'omnimail-theme'
const listeners = new Set<() => void>()
const colorScheme = typeof window === 'undefined'
  ? null
  : window.matchMedia('(prefers-color-scheme: dark)')

export function normalizeThemePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}

let preference = normalizeThemePreference(
  typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY),
)

function applyTheme(): void {
  if (typeof document === 'undefined') return
  const theme = resolveTheme(preference, Boolean(colorScheme?.matches))
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.themePreference = preference
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0b0b0c' : '#f5f5f7')
  listeners.forEach((listener) => listener())
}

export function getThemePreference(): ThemePreference {
  return preference
}

export function setThemePreference(next: ThemePreference): void {
  preference = next
  window.localStorage.setItem(STORAGE_KEY, next)
  applyTheme()
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

colorScheme?.addEventListener('change', () => {
  if (preference === 'system') applyTheme()
})

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    preference = normalizeThemePreference(event.newValue)
    applyTheme()
  })
}

applyTheme()
