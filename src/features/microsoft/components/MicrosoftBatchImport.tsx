import { useGSAP } from '@gsap/react'
import { Flip } from 'gsap/Flip'
import { gsap } from 'gsap'
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CircleCheck, LoaderCircle, Plus,
  RotateCcw, ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { api, type MicrosoftImportResult } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { useDelayedScrollbarVisibility } from '../../../shared/ui/scroll/useDelayedScrollbarVisibility'
import {
  MICROSOFT_IMPORT_ALTERNATE_FORMAT,
  MICROSOFT_IMPORT_FORMATS,
  parseMicrosoftImportText,
  type MicrosoftImportMode,
  type ParsedMicrosoftImport,
} from '../model/microsoft-import'
import { MicrosoftImportProgress, type MicrosoftImportProgressValue } from './MicrosoftImportProgress'

gsap.registerPlugin(useGSAP, Flip)

type BatchStep = 'input' | 'review' | 'running' | 'complete'
type ImportStatus = 'pending' | 'running' | 'success' | 'error'
type ImportItem = ParsedMicrosoftImport & { importStatus: ImportStatus; resultError: string }
type ImportSummary = { success: number; failed: number }

const importFormatLabels = ['完整组合', '仅 OAuth2'] as const
const importPlaceholder = [
  MICROSOFT_IMPORT_FORMATS[0], MICROSOFT_IMPORT_ALTERNATE_FORMAT,
  ...MICROSOFT_IMPORT_FORMATS.slice(1),
].join('\n')

function safeResultError(code?: string, message?: string) {
  if (message) return message
  if (code === 'duplicate') return t('账号已存在。')
  return t('账号验证失败，请检查凭据、权限和 IMAP 设置。')
}

function importModeLabel(mode: MicrosoftImportMode | null) {
  if (mode === 'oauth2_combination') return t('OAuth2 · 组合密码将加密保存')
  return mode === 'oauth2' ? 'OAuth2' : ''
}

function animationComplete(animation: gsap.core.Animation): Promise<void> {
  return new Promise((resolve) => animation.eventCallback('onComplete', resolve))
}

function StepIndicator({ step }: { step: BatchStep }) {
  const onReview = step !== 'input'
  const complete = step === 'complete'
  return <div className="microsoft-import-steps" aria-label={t('导入步骤')}>
    <span className={onReview ? 'is-complete' : 'is-active'}><i>{onReview ? <Check size={12} /> : '1'}</i>
      {t('输入账号')}</span>
    <b aria-hidden="true" className={onReview ? 'is-complete' : ''} />
    <span className={complete ? 'is-complete' : onReview ? 'is-active' : ''}><i>{complete ? <Check size={12} /> : '2'}</i>
      {t('安全确认')}</span>
  </div>
}

function Consent({ checked, onChange, disabled }: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled: boolean
}) {
  return <label className="microsoft-password-consent"><input className="selection-checkbox"
    type="checkbox" checked={checked} disabled={disabled}
    onChange={(event) => onChange(event.target.checked)} /><span>
      {t('我允许服务端加密保存 OAuth2 组合密码；该密码不会用于登录或认证回退。')}</span></label>
}

function ImportStatusIcon({ item }: { item: ImportItem }) {
  if (item.importStatus === 'running') return <span className="microsoft-import-item-status is-running">
    <LoaderCircle className="spin" size={17} aria-hidden="true" /><span className="sr-only">{t('正在验证')}</span>
  </span>
  if (item.importStatus === 'success') return <span className="microsoft-import-item-status is-success">
    <Check size={16} aria-hidden="true" /><span className="sr-only">{t('验证成功')}</span>
  </span>
  if (item.importStatus === 'error') return <span className="microsoft-import-item-status is-error">
    <AlertCircle size={16} aria-hidden="true" /><span className="sr-only">{t('验证失败')}</span>
  </span>
  return <span className="microsoft-import-item-status is-pending" aria-hidden="true" />
}

function PreviewList({ items, listRef }: {
  items: ImportItem[]
  listRef: React.RefObject<HTMLUListElement | null>
}) {
  const scrollbar = useDelayedScrollbarVisibility<HTMLUListElement>({ showOnFocus: false })
  return <div className="microsoft-import-preview">
    <h3>{t('安全预览')}</h3><p>{t('预览不会显示密码、refresh token 或完整 Client ID。')}</p>
    <ul ref={listRef} aria-live="polite"
      className={`microsoft-scrollbar${scrollbar.visible ? ' is-scrollbar-visible' : ''}`}
      {...scrollbar.handlers}>{items.map((item) => <li key={item.preview.line}
      data-import-line={item.preview.line}
      className={`is-${item.importStatus === 'error' ? 'error' : item.preview.status}`}>
      <span>{item.preview.line}</span><strong>{item.preview.email || t('无效邮箱')}</strong>
      <small>{item.resultError || item.preview.error
        || `${importModeLabel(item.preview.mode)}${item.preview.clientIdMasked ? ` · ${item.preview.clientIdMasked}` : ''}`}</small>
      <ImportStatusIcon item={item} />
    </li>)}</ul>
  </div>
}

export function MicrosoftBatchImport({ onBusyChange, onChanged, onError, onNotice }: {
  onBusyChange: (busy: boolean) => void
  onChanged: () => Promise<void>
  onError: (message: string) => void
  onNotice: (message: string) => void
}) {
  const [step, setStep] = useState<BatchStep>('input')
  const [batchText, setBatchText] = useState('')
  const [consent, setConsent] = useState(false)
  const [items, setItems] = useState<ImportItem[]>([])
  const [progress, setProgress] = useState<MicrosoftImportProgressValue | null>(null)
  const [summary, setSummary] = useState<ImportSummary>({ success: 0, failed: 0 })
  const listRef = useRef<HTMLUListElement>(null)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const mountedRef = useRef(true)
  const rows = useMemo(() => parseMicrosoftImportText(batchText), [batchText])
  const contentScrollbar = useDelayedScrollbarVisibility<HTMLDivElement>({ showOnFocus: false })
  const textareaScrollbar = useDelayedScrollbarVisibility<HTMLTextAreaElement>({ showOnFocus: false })
  const { contextSafe } = useGSAP({ scope: listRef })

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  useEffect(() => {
    if (step !== 'input') requestAnimationFrame(() => stepHeadingRef.current?.focus())
  }, [step])

  const removeAcceptedItem = contextSafe(async (line: number) => {
    const list = listRef.current
    const item = list?.querySelector<HTMLElement>(`[data-import-line="${line}"]`)
    if (!list || !item || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (mountedRef.current) setItems((current) => current.filter(({ preview }) => preview.line !== line))
      return
    }
    const layoutState = Flip.getState(Array.from(list.children))
    const icon = item.querySelector<HTMLElement>('.microsoft-import-item-status.is-success')
    const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } })
    if (icon) timeline.fromTo(icon, { autoAlpha: 0, scale: 0.55 }, {
      autoAlpha: 1, scale: 1, duration: 0.22, ease: 'back.out(1.8)',
    })
    timeline.to(item, { xPercent: 108, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, '+=0.14')
    await animationComplete(timeline)
    if (!mountedRef.current) return
    flushSync(() => setItems((current) => current.filter(({ preview }) => preview.line !== line)))
    const remaining = Array.from(list.querySelectorAll<HTMLElement>('[data-import-line]'))
    if (remaining.length) await animationComplete(Flip.from(layoutState, {
      targets: remaining, duration: 0.32, ease: 'power2.inOut', simple: true,
    }))
  })

  function goToReview() {
    onError(''); onNotice('')
    if (!rows.length) { onError(t('没有可导入的有效账号。')); return }
    if (rows.length > 25) { onError(t('每批最多导入 25 个账号。')); return }
    const invalid = rows.find(({ preview }) => preview.status !== 'ready')
    if (invalid) {
      onError(t('第 {line} 项：{error}', {
        line: invalid.preview.line,
        error: invalid.preview.error || t('账号已存在。'),
      }))
      return
    }
    setItems(rows.map((row) => ({ ...row, importStatus: 'pending', resultError: '' })))
    setConsent(false); setStep('review')
  }

  async function importAccounts(event: FormEvent) {
    event.preventDefault()
    const hasPasswords = items.some(({ input }) => Boolean(input.password))
    if (hasPasswords && !consent) {
      onError(t('请先确认允许加密保存 OAuth2 组合密码。')); return
    }
    onError(''); onNotice(''); onBusyChange(true); setStep('running')
    setProgress({ completed: 0, total: items.length })
    let success = 0
    let failed = 0
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (!mountedRef.current) break
      flushSync(() => setItems((current) => current.map((candidate) => (
        candidate.preview.line === item.preview.line
          ? { ...candidate, importStatus: 'running', resultError: '' } : candidate
      ))))
      let result: MicrosoftImportResult
      try {
        const input = item.input.password
          ? { ...item.input, persistPasswordConfirmed: true } : item.input
        result = (await api.importMicrosoftAccounts([input])).results[0] || {
          index: 0, status: 'error', error: t('Microsoft 未返回账号验证结果。'),
        }
      } catch (importError) {
        result = { index: 0, status: 'error', error: errorMessage(importError) }
      }
      if (!mountedRef.current) break
      if (result.status === 'accepted') {
        success += 1
        flushSync(() => setItems((current) => current.map((candidate) => (
          candidate.preview.line === item.preview.line
            ? { ...candidate, importStatus: 'success' } : candidate
        ))))
        await removeAcceptedItem(item.preview.line)
      } else {
        failed += 1
        flushSync(() => setItems((current) => current.map((candidate) => (
          candidate.preview.line === item.preview.line
            ? { ...candidate, importStatus: 'error', resultError: safeResultError(result.code, result.error) }
            : candidate
        ))))
      }
      if (mountedRef.current) setProgress({ completed: index + 1, total: items.length })
    }
    if (!mountedRef.current) return
    try { await onChanged() } catch (refreshError) { onError(errorMessage(refreshError)) }
    setSummary({ success, failed }); setProgress(null); setStep('complete'); onBusyChange(false)
  }

  function reset() {
    onError(''); onNotice(''); setBatchText(''); setConsent(false); setItems([])
    setProgress(null); setSummary({ success: 0, failed: 0 }); setStep('input')
  }

  const hasPasswords = items.some(({ input }) => Boolean(input.password))
  return <div className={`microsoft-batch-import is-${step} microsoft-scrollbar${contentScrollbar.visible ? ' is-scrollbar-visible' : ''}`}
    {...contentScrollbar.handlers}>
    <StepIndicator step={step} />
    {step === 'input' ? <div className="icloud-form microsoft-batch-form" data-step="input">
      <label><span>{t('每行一个账号')}</span><textarea value={batchText} rows={7}
        className={`microsoft-scrollbar${textareaScrollbar.visible ? ' is-scrollbar-visible' : ''}`}
        {...textareaScrollbar.handlers}
        spellCheck={false} autoComplete="off" aria-describedby="microsoft-import-formats"
        onChange={(event) => setBatchText(event.target.value)} placeholder={importPlaceholder} /></label>
      <div className="microsoft-import-formats" id="microsoft-import-formats">
        <strong>{t('支持以下两种 OAuth2 凭据类型（四字段兼容两种顺序）：')}</strong>
        <ul>{MICROSOFT_IMPORT_FORMATS.map((format, index) => <li key={format}>
          <span>{t(importFormatLabels[index])}</span><code>{format}</code>
        </li>)}<li><span>{t('兼容顺序')}</span><code>{MICROSOFT_IMPORT_ALTERNATE_FORMAT}</code></li></ul>
        <small>{t('最后两段可互换，系统按 UUID 自动识别 Client ID。四字段中的 password 会加密保存，但不会用于 LOGIN 或 OAuth2 失败回退；连续 8 个连字符表示 password 为空。')}</small>
      </div>
      <footer><button className="button button--primary" type="button" disabled={!rows.length}
        onClick={goToReview}>{t('下一步：安全预览')}<ArrowRight size={16} /></button></footer>
    </div> : <form className="icloud-form microsoft-batch-form" data-step={step}
      onSubmit={(event) => void importAccounts(event)}>
      <h3 ref={stepHeadingRef} className="sr-only" tabIndex={-1}>{t(step === 'review'
        ? '确认 Microsoft 账号导入' : step === 'running' ? '正在导入 Microsoft 账号' : 'Microsoft 账号导入完成')}</h3>
      {progress && <MicrosoftImportProgress progress={progress} />}
      {(items.length > 0 || step === 'running') && <PreviewList items={items} listRef={listRef} />}
      {step === 'review' && hasPasswords && <Consent checked={consent} onChange={setConsent} disabled={false} />}
      {step === 'review' && <footer className="microsoft-import-review-actions">
        <button className="button button--secondary" type="button" onClick={() => {
          onError(''); setStep('input')
        }}><ArrowLeft size={16} />{t('上一步')}</button>
        <button className="button button--primary" type="submit">
          <ShieldCheck size={16} />{t('开始导入 {count} 个账号', { count: items.length })}</button>
      </footer>}
      {step === 'complete' && <div className={`microsoft-import-complete${summary.failed ? ' has-errors' : ''}`}
        role="status" aria-live="polite">
        <span>{summary.failed ? <AlertCircle size={22} /> : <CircleCheck size={22} />}</span>
        <div><strong>{t('导入完成')}</strong><small>{t('成功 {success} 个，失败 {failed} 个。', summary)}</small></div>
        <button className="button button--secondary" type="button" onClick={reset}>
          <RotateCcw size={15} />{t('继续导入')}</button>
      </div>}
      {step === 'running' && <footer><button className="button button--primary" type="button" disabled>
        <LoaderCircle className="spin" size={16} />{t('正在逐项导入')}</button></footer>}
    </form>}
  </div>
}
