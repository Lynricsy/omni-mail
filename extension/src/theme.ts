import type { ThemePreference } from './protocol'

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)')
let preference: ThemePreference = 'system'

export function normalizedTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function setPanelTheme(next: ThemePreference): void {
  preference = next
  document.documentElement.dataset.theme = next === 'system'
    ? darkScheme.matches ? 'dark' : 'light'
    : next
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme
}

export async function initializePanelTheme(): Promise<void> {
  setPanelTheme('system')
  const settings = await chrome.storage.local.get(['theme'])
  setPanelTheme(normalizedTheme(settings.theme))
  darkScheme.addEventListener('change', () => {
    if (preference === 'system') setPanelTheme('system')
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) {
      setPanelTheme(normalizedTheme(changes.theme.newValue))
    }
  })
}
