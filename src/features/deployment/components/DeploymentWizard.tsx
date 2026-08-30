import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudCog,
  Database,
  HardDrive,
  HelpCircle,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  api,
  type DeploymentCheck,
  type DeploymentCheckItem,
  type DeploymentCheckState,
} from '../../../shared/api'
import { t } from '../../../shared/i18n'
import '../styles/deployment-wizard.css'
import '../styles/deployment-wizard-responsive.css'

const steps = [
  { id: 'core' as const, label: '核心资源', description: 'Worker、D1、R2 与队列', Icon: Database },
  { id: 'security' as const, label: '身份安全', description: '管理员、来源与防护', Icon: ShieldCheck },
  { id: 'mail' as const, label: '邮件服务', description: '域名、邮箱与发信', Icon: HardDrive },
]

const stateLabels: Record<DeploymentCheckState, string> = {
  ready: '已就绪',
  missing: '需要处理',
  warning: '建议配置',
  manual: '人工确认',
}

function CheckStateIcon({ state }: { state: DeploymentCheckState }) {
  if (state === 'ready') return <CheckCircle2 size={19} />
  if (state === 'manual') return <HelpCircle size={19} />
  if (state === 'warning') return <TriangleAlert size={19} />
  return <AlertCircle size={19} />
}

function CheckRow({ item }: { item: DeploymentCheckItem }) {
  return (
    <li className={`deployment-check is-${item.state}`}>
      <span className="deployment-check__icon"><CheckStateIcon state={item.state} /></span>
      <span className="deployment-check__content">
        <span>
          <strong>{t(item.label)}</strong>
          <small>{t(item.required ? '必需' : '可选')}</small>
        </span>
        <p>{t(item.state === 'ready' ? item.detail : item.action)}</p>
      </span>
      <span className="deployment-check__state">{t(stateLabels[item.state])}</span>
    </li>
  )
}

export function DeploymentWizard({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<DeploymentCheck | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setResult(await api.deploymentCheck())
    } catch (loadError) {
      setError(t(loadError instanceof Error ? loadError.message : '无法运行部署自检。'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setStep(0)
    void load()
  }, [load, open])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    })
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [onClose, open])

  if (!open) return null
  const current = steps[step]
  const checks = result?.checks.filter((item) => item.group === current.id) || []
  const readyCount = result?.checks.filter((item) => item.state === 'ready').length || 0

  return (
    <div
      className="deployment-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="deployment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="deployment-dialog__header">
          <span className="deployment-dialog__symbol"><CloudCog size={24} /></span>
          <div>
            <p className="eyebrow">DEPLOYMENT CHECK</p>
            <h2 id={titleId}>{t('部署初始化向导')}</h2>
            <p>{t('检查 GitHub 连接 Cloudflare 后的关键配置，不会读取或显示 Secret 内容。')}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label={t('关闭部署向导')}
          >
            <X size={17} />
          </button>
        </header>

        <nav className="deployment-steps" aria-label={t('部署检查步骤')}>
          {steps.map(({ id, label, description, Icon }, index) => {
            const groupChecks = result?.checks.filter((item) => item.group === id) || []
            const hasMissing = groupChecks.some((item) => item.required && item.state !== 'ready')
            return (
              <button
                className={`${index === step ? 'is-current' : ''} ${hasMissing ? 'has-missing' : ''}`}
                type="button"
                key={id}
                aria-label={t('{label}：{description}', { label: t(label), description: t(description) })}
                aria-current={index === step ? 'step' : undefined}
                onClick={() => setStep(index)}
              >
                <span><Icon size={16} /></span>
                <span><strong>{t(label)}</strong><small>{t(description)}</small></span>
              </button>
            )
          })}
        </nav>

        <div className="deployment-dialog__body">
          <header>
            <div>
              <span>{t('步骤 {current} / {total}', { current: step + 1, total: steps.length })}</span>
              <h3>{t(current.label)}</h3>
            </div>
            {result && (
              <span className={`deployment-summary ${result.ready ? 'is-ready' : ''}`}>
                {t('{ready}/{total} 项就绪', { ready: readyCount, total: result.checks.length })}
              </span>
            )}
          </header>

          {loading && (
            <div className="deployment-loading" role="status">
              <LoaderCircle className="spin" size={20} />
              <span>{t('正在检查 Worker 配置和资源绑定…')}</span>
            </div>
          )}
          {!loading && error && (
            <div className="deployment-error" role="alert">
              <AlertCircle size={18} />
              <span><strong>{t('自检没有完成')}</strong><small>{error}</small></span>
              <button className="button button--secondary button--small" type="button" onClick={() => void load()}>
                {t('重新检查')}
              </button>
            </div>
          )}
          {!loading && !error && (
            <ul className="deployment-checks">
              {checks.map((item) => <CheckRow item={item} key={item.id} />)}
            </ul>
          )}
        </div>

        <footer className="deployment-dialog__footer">
          <button
            className="button button--secondary"
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? 'spin' : ''} size={15} />
            {t('重新检查')}
          </button>
          <div>
            {step > 0 && (
              <button className="button button--secondary" type="button" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={15} />{t('上一步')}
              </button>
            )}
            {step < steps.length - 1 ? (
              <button className="button button--primary" type="button" onClick={() => setStep(step + 1)}>
                {t('下一步')}<ArrowRight size={15} />
              </button>
            ) : (
              <button className="button button--primary" type="button" onClick={onClose}>
                <CheckCircle2 size={15} />{t('完成')}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}
