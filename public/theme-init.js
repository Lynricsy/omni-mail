(() => {
  try {
    const stored = localStorage.getItem('omnimail-theme')
    const preference = ['light', 'dark', 'system'].includes(stored) ? stored : 'system'
    const theme = preference === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : preference
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.themePreference = preference
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark'
      ? '#0b0b0c'
      : '#f5f5f7'
  } catch {
    // The application CSS still provides the default light theme.
  }
})()
