import { RefreshCw, ShieldAlert } from 'lucide-react'
import {
  Component,
  createRef,
  type ErrorInfo,
  type ReactNode,
  type RefObject,
} from 'react'
import { t } from '../shared/i18n'
import { reportClientError } from './reportClientError'

type AppErrorBoundaryState = {
  crashId: string
  failed: boolean
}

export function AppCrashFallback({ crashId, onReload, reloadRef }: {
  crashId: string
  onReload: () => void
  reloadRef?: RefObject<HTMLButtonElement | null>
}) {
  return <main className="app-crash" role="alert" aria-labelledby="app-crash-title">
    <section className="app-crash__card">
      <span className="app-crash__icon" aria-hidden="true"><ShieldAlert size={28} /></span>
      <p className="app-crash__eyebrow">OmniMail</p>
      <h1 id="app-crash-title">{t('页面暂时无法继续显示')}</h1>
      <p>{t('已提交到服务器的操作不会因页面异常而撤销。重新加载即可继续使用。')}</p>
      <button ref={reloadRef} className="button button--primary" type="button" onClick={onReload}>
        <RefreshCw size={16} aria-hidden="true" />{t('重新加载邮箱')}
      </button>
      <small>{t('诊断编号：{id}', { id: crashId })}</small>
    </section>
  </main>
}

export class AppErrorBoundary extends Component<{
  children: ReactNode
}, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { crashId: '', failed: false }
  private reloadButton = createRef<HTMLButtonElement>()

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { crashId: `ui-${Date.now().toString(36)}`, failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[OmniMail ${this.state.crashId}] UI crashed`, error, info)
    void reportClientError({
      crashId: this.state.crashId,
      errorName: error.name,
      message: error.message,
      componentStack: info.componentStack || '',
      path: window.location.pathname,
    }).catch(() => undefined)
    requestAnimationFrame(() => this.reloadButton.current?.focus())
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <AppCrashFallback crashId={this.state.crashId}
      reloadRef={this.reloadButton} onReload={() => window.location.reload()} />
  }
}
