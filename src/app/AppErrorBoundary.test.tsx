import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppCrashFallback, AppErrorBoundary } from './AppErrorBoundary'

describe('application error recovery', () => {
  it('switches to a recoverable error state after a render failure', () => {
    expect(AppErrorBoundary.getDerivedStateFromError()).toMatchObject({
      failed: true,
      crashId: expect.stringMatching(/^ui-/),
    })
  })

  it('renders an accessible reload action and diagnostic id', () => {
    const html = renderToStaticMarkup(
      <AppCrashFallback crashId="ui-test" onReload={() => undefined} />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('重新加载邮箱')
    expect(html).toContain('ui-test')
  })
})
