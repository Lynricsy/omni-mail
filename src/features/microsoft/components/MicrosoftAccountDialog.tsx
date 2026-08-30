import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import {
  AlertCircle, ArrowLeft, Check, ChevronRight, KeyRound, ListChecks, LoaderCircle,
  Pencil, Plus, RefreshCw, ShieldCheck, Trash2, X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { api, type MicrosoftAccount,
  type MicrosoftImportAccount } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'
import { useDelayedScrollbarVisibility } from '../../../shared/ui/scroll/useDelayedScrollbarVisibility'
import { MicrosoftBatchImport } from './MicrosoftBatchImport'

gsap.registerPlugin(useGSAP)

type View = 'accounts' | 'account' | 'connect'
type EntryMode = 'fields' | 'batch'
function statusLabel(status: MicrosoftAccount['status']) {
  if (status === 'syncing') return t('正在同步')
  if (status === 'credential_error') return t('凭据失效')
  if (status === 'permission_error') return t('权限不足')
  if (status === 'error') return t('同步异常')
  if (status === 'pending_validation') return t('等待验证')
  return t('已连接')
}

function safeResultError(code?: string, message?: string) {
  if (message) return message
  if (code === 'duplicate') return t('账号已存在。')
  return t('账号验证失败，请检查凭据、权限和 IMAP 设置。')
}

export function MicrosoftAccountDialog({ accounts, startAdding = false, onClose, onChanged }: {
  accounts: MicrosoftAccount[]
  startAdding?: boolean
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [view, setView] = useState<View>(accounts.length && !startAdding ? 'accounts' : 'connect')
  const [entryMode, setEntryMode] = useState<EntryMode>('fields')
  const [target, setTarget] = useState<MicrosoftAccount | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [clientId, setClientId] = useState('')
  const [authority, setAuthority] = useState('common')
  const [passwordConsent, setPasswordConsent] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set())
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)
  const [batchDeleteProgress, setBatchDeleteProgress] = useState<{ completed: number; total: number } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [closing, setClosing] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const bodyScrollbar = useDelayedScrollbarVisibility<HTMLDivElement>({ showOnFocus: false })
  const busyRef = useRef(busy)
  const batchDeleteConfirmRef = useRef(batchDeleteConfirm)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const requestCloseRef = useRef<() => void>(() => undefined)
  busyRef.current = busy
  batchDeleteConfirmRef.current = batchDeleteConfirm
  onCloseRef.current = onClose

  const { contextSafe } = useGSAP(() => {
    const backdrop = backdropRef.current
    const dialog = dialogRef.current
    if (!backdrop || !dialog) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set([backdrop, dialog], { autoAlpha: 1 })
      return
    }
    gsap.fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2,
      ease: 'power1.out', clearProps: 'opacity,visibility' })
    gsap.fromTo(dialog, { autoAlpha: 0, y: 18, scale: 0.975 }, {
      autoAlpha: 1, y: 0, scale: 1, duration: 0.32, ease: 'power3.out',
      clearProps: 'opacity,visibility,transform' })
  }, { scope: backdropRef })
  const requestClose = contextSafe(() => {
    if (busyRef.current || closingRef.current) return
    const backdrop = backdropRef.current
    const dialog = dialogRef.current
    if (!backdrop || !dialog || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onCloseRef.current()
      return
    }
    closingRef.current = true
    setClosing(true)
    gsap.to(backdrop, { autoAlpha: 0, duration: 0.18, ease: 'power1.in', overwrite: 'auto' })
    gsap.to(dialog, { autoAlpha: 0, y: 10, scale: 0.985, duration: 0.18,
      ease: 'power2.in', overwrite: 'auto', onComplete: () => onCloseRef.current() })
  })
  requestCloseRef.current = requestClose
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => {
    const accountIds = new Set(accounts.map(({ id }) => id))
    setSelectedAccountIds((current) => {
      const next = new Set([...current].filter((id) => accountIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [accounts])
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedAccountIds.size > 0
        && selectedAccountIds.size < accounts.length
    }
  }, [accounts.length, selectedAccountIds])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (batchDeleteConfirmRef.current) return
      if (event.key === 'Escape') requestCloseRef.current()
      if (event.key !== 'Tab') return
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) || [])
      if (!controls.length) return
      const first = controls[0]
      const last = controls.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [])

  function resetSecrets() {
    setPassword(''); setRefreshToken(''); setClientId(''); setPasswordConsent(false)
  }

  function openAccount(account: MicrosoftAccount) {
    setTarget(account); setRenameValue(account.name); setAuthority(account.authority || 'common')
    resetSecrets(); setError(''); setNotice(''); setConfirmDelete(false); setView('account')
  }

  async function submitImport(inputs: MicrosoftImportAccount[]) {
    setBusy('import'); setError(''); setNotice('')
    try {
      const results = (await api.importMicrosoftAccounts(inputs)).results
      const accepted = results.filter(({ status }) => status === 'accepted').length
      const failed = results.filter(({ status }) => status !== 'accepted')
      await onChanged()
      resetSecrets()
      if (failed.length) {
        setError(failed.map((item) => t('第 {line} 项：{error}', {
          line: item.index + 1,
          error: safeResultError(item.code, item.error),
        })).join(' '))
      }
      if (accepted) setNotice(t('已安全连接 {count} 个 Microsoft 账号。', { count: accepted }))
      if (accepted && !failed.length) setView('accounts')
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally { setBusy('') }
  }

  async function connect(event: FormEvent) {
    event.preventDefault()
    if (password && !passwordConsent) {
      setError(t('请先确认允许加密保存 OAuth2 组合密码。'))
      return
    }
    const input: MicrosoftImportAccount = {
      name, email, authMode: 'oauth2', refreshToken, clientId, authority,
      password: password || undefined,
      persistPasswordConfirmed: password ? true : undefined,
    }
    await submitImport([input])
  }

  async function rename(event: FormEvent) {
    event.preventDefault(); if (!target) return
    setBusy('rename'); setError('')
    try {
      const result = await api.renameMicrosoft(target.id, renameValue)
      setTarget(result.account); await onChanged(); setNotice(t('账号备注已保存。'))
    } catch (renameError) { setError(errorMessage(renameError)) } finally { setBusy('') }
  }

  async function verify() {
    if (!target) return
    setBusy('verify'); setError('')
    try { await api.verifyMicrosoft(target.id); await onChanged(); setNotice(t('Microsoft IMAP 连接有效。')) }
    catch (verifyError) { setError(errorMessage(verifyError)); await onChanged() }
    finally { setBusy('') }
  }

  async function sync() {
    if (!target) return
    setBusy('sync'); setError('')
    try { await api.syncMicrosoft(target.id); setNotice(t('Microsoft 同步任务已加入队列。')) }
    catch (syncError) { setError(errorMessage(syncError)) } finally { setBusy('') }
  }

  async function updateCredential(event: FormEvent) {
    event.preventDefault(); if (!target) return
    setBusy('credential'); setError('')
    try {
      await api.updateMicrosoftCredential(target.id, {
        authMode: 'oauth2', refreshToken, clientId, authority,
      })
      resetSecrets(); await onChanged(); setNotice(t('凭据验证成功并已更新。'))
    } catch (credentialError) { setError(errorMessage(credentialError)); await onChanged() }
    finally { setBusy('') }
  }

  async function remove() {
    if (!target) return
    setBusy('delete'); setError('')
    try {
      const result = await api.disconnectMicrosoft(target.id)
      await onChanged(); setTarget(null); setView('accounts')
      setNotice(result.remoteRevocationRequired
        ? t('账号已断开；请同时在 Microsoft 账户中撤销应用授权。')
        : t('账号和本地索引已删除。'))
    } catch (removeError) { setConfirmDelete(false); setError(errorMessage(removeError)) } finally { setBusy('') }
  }

  function enterBatchMode() {
    setError(''); setNotice(''); setSelectedAccountIds(new Set()); setBatchMode(true)
  }

  function exitBatchMode() {
    if (busy) return
    setBatchDeleteConfirm(false); setSelectedAccountIds(new Set()); setBatchMode(false)
  }

  function toggleAccountSelection(accountId: string) {
    setSelectedAccountIds((current) => {
      const next = new Set(current)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

  function toggleAllAccounts() {
    setSelectedAccountIds((current) => current.size === accounts.length
      ? new Set() : new Set(accounts.map(({ id }) => id)))
  }

  async function removeSelected() {
    const selectedAccounts = accounts.filter(({ id }) => selectedAccountIds.has(id))
    if (!selectedAccounts.length) {
      setError(t('请至少选择一个 Microsoft 账号。'))
      return
    }
    setBatchDeleteConfirm(false); setBusy('batch-delete'); setError(''); setNotice('')
    setBatchDeleteProgress({ completed: 0, total: selectedAccounts.length })
    const failed: Array<{ account: MicrosoftAccount; message: string }> = []
    let remoteRevocationRequired = false
    for (const [index, account] of selectedAccounts.entries()) {
      try {
        const result = await api.disconnectMicrosoft(account.id)
        remoteRevocationRequired ||= result.remoteRevocationRequired
      } catch (removeError) {
        failed.push({ account, message: errorMessage(removeError) })
      }
      setBatchDeleteProgress({ completed: index + 1, total: selectedAccounts.length })
    }
    try {
      await onChanged()
      setSelectedAccountIds(new Set(failed.map(({ account }) => account.id)))
      if (failed.length) {
        const firstFailure = failed[0]?.message
        setError(t('已断开 {success} 个账号，{failed} 个失败。{message}', {
          success: selectedAccounts.length - failed.length,
          failed: failed.length,
          message: firstFailure ? ` ${firstFailure}` : '',
        }))
      } else {
        setBatchMode(false)
        setNotice(remoteRevocationRequired
          ? t('已批量断开 {count} 个 Microsoft 账号；请同时撤销应用授权。', { count: selectedAccounts.length })
          : t('已批量断开 {count} 个 Microsoft 账号。', { count: selectedAccounts.length }))
      }
    } catch (refreshError) { setError(errorMessage(refreshError)) }
    finally { setBatchDeleteProgress(null); setBusy('') }
  }

  const title = view === 'accounts' ? t('Microsoft 账号管理')
    : view === 'account' ? t('设置 {name}', { name: target?.name || 'Microsoft' })
      : t('连接 Microsoft 邮箱')
  const canGoBack = view === 'account' || (view === 'connect' && accounts.length > 0)

  const batchView = view === 'connect' && entryMode === 'batch'

  return <div ref={backdropRef}
    className={`icloud-modal-backdrop gmail-dialog-backdrop microsoft-dialog-backdrop is-visible${closing ? ' is-closing' : ''}`}
    role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
    <section ref={dialogRef}
      className="icloud-modal gmail-account-dialog microsoft-account-dialog"
      role="dialog" aria-modal="true" aria-busy={Boolean(busy)} aria-labelledby={titleId}
      aria-describedby={descriptionId}>
      <header className={canGoBack ? 'has-back' : ''}>
        {canGoBack && <button className="icon-button gmail-dialog-back" type="button"
          disabled={Boolean(busy)} onClick={() => { setError(''); setNotice(''); setView('accounts') }}
          aria-label={t('返回')}><ArrowLeft size={17} /></button>}
        <div><p className="eyebrow">MICROSOFT · IMAP</p><h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{t('仅允许读取和标记已读；凭据仅在服务端加密保存。')}</p></div>
        <button ref={closeRef} className="icon-button" type="button" disabled={Boolean(busy)}
          onClick={requestClose} aria-label={t('关闭')}><X size={17} /></button>
      </header>

      <div className={`microsoft-dialog-body microsoft-scrollbar${view === 'accounts' ? ' is-accounts' : ''}${batchView ? ' is-batch' : ''}${bodyScrollbar.visible ? ' is-scrollbar-visible' : ''}`}
        {...bodyScrollbar.handlers}>
      {(notice || error) && <div className="gmail-dialog-feedback">
        {notice && <p className="gmail-dialog-notice" role="status"><Check size={15} />{notice}</p>}
        {error && <p ref={errorRef} className="inline-error" role="alert" tabIndex={-1}><AlertCircle size={15} />{error}</p>}
      </div>}

      {view === 'connect' && <>
        <div className="microsoft-entry-tabs" role="tablist" aria-label={t('录入方式')}>
          <button type="button" role="tab" aria-selected={entryMode === 'fields'}
            disabled={Boolean(busy)}
            onClick={() => { setError(''); setNotice(''); setEntryMode('fields') }}>{t('分字段录入')}</button>
          <button type="button" role="tab" aria-selected={entryMode === 'batch'}
            disabled={Boolean(busy)}
            onClick={() => { setError(''); setNotice(''); setEntryMode('batch') }}>{t('批量导入')}</button>
        </div>
        {entryMode === 'fields' ? <form className="icloud-form gmail-connect-form"
          onSubmit={(event) => void connect(event)}>
          <p className="microsoft-oauth-note"><ShieldCheck size={15} />
            {t('仅支持 OAuth2；不再接受仅邮箱密码登录。')}</p>
          <label><span>{t('账号名称')}</span><input value={name} maxLength={60} required
            autoComplete="off" onChange={(event) => setName(event.target.value)} /></label>
          <label><span>{t('邮箱地址')}</span><input type="email" value={email} maxLength={254}
            required autoComplete="username" onChange={(event) => setEmail(event.target.value)} /></label>
          <label><span>Refresh token</span><input type="password" value={refreshToken} required
            autoComplete="off" onChange={(event) => setRefreshToken(event.target.value)} /></label>
          <label><span>Client ID</span><input value={clientId} required autoComplete="off"
            placeholder="00000000-0000-0000-0000-000000000000"
            onChange={(event) => setClientId(event.target.value)} /></label>
          <label><span>Authority</span><input value={authority} required autoComplete="off"
            aria-describedby="microsoft-authority-help"
            onChange={(event) => setAuthority(event.target.value)} />
            <small id="microsoft-authority-help">common / organizations / consumers / tenant UUID</small></label>
          <CombinationPasswordFields password={password} consent={passwordConsent}
            onPassword={setPassword} onConsent={setPasswordConsent} />
          <footer className="gmail-connect-actions">
            <button className="button button--primary"
            type="submit" disabled={Boolean(busy)}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
            {t('验证并连接')}</button></footer>
        </form> : <MicrosoftBatchImport onBusyChange={(importing) => setBusy(importing ? 'import' : '')}
          onChanged={onChanged} onError={setError} onNotice={setNotice} />}
      </>}

      {view === 'accounts' && <div className={`gmail-account-list${batchMode ? ' is-batch-mode' : ''}`}>
        <div className="gmail-account-list__summary">
          {batchMode ? <label className="microsoft-account-select-all">
            <input ref={selectAllRef} className="selection-checkbox" type="checkbox"
              checked={accounts.length > 0 && selectedAccountIds.size === accounts.length}
              onChange={toggleAllAccounts} aria-label={t('全选 Microsoft 账号')} />
            <span>{t('已选择 {count} 个账号', { count: selectedAccountIds.size })}</span>
          </label> : <span>{t('已连接 {count} 个账号', { count: accounts.length })}</span>}
          <div className="microsoft-account-list-actions">
            {batchMode ? <>
              <button className="button button--secondary button--small" type="button" disabled={Boolean(busy)}
                onClick={exitBatchMode}>{t('完成')}</button>
              <button className="button icloud-danger-button button--small" type="button"
                disabled={!selectedAccountIds.size || Boolean(busy)}
                onClick={() => setBatchDeleteConfirm(true)}><Trash2 size={14} />
                {t('批量断开 {count} 个账号', { count: selectedAccountIds.size })}</button>
            </> : <>
              <button className="button button--secondary button--small" type="button"
                onClick={enterBatchMode}><ListChecks size={15} />{t('批量管理')}</button>
              <button className="button button--primary button--small" type="button"
                onClick={() => { setError(''); setNotice(''); setView('connect') }}><Plus size={15} />{t('添加账号')}</button>
            </>}
          </div>
        </div>
        {batchDeleteProgress && <p className="microsoft-batch-delete-progress" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={14} />{t('正在断开第 {current}/{total} 个账号', {
            current: batchDeleteProgress.completed + 1 > batchDeleteProgress.total
              ? batchDeleteProgress.total : batchDeleteProgress.completed + 1,
            total: batchDeleteProgress.total,
          })}</p>}
        <div className={`microsoft-account-card-list microsoft-scrollbar${bodyScrollbar.visible ? ' is-scrollbar-visible' : ''}`} {...bodyScrollbar.handlers}>
          {accounts.map((account) => batchMode ? <label
            className={`gmail-account-card microsoft-account-batch-card${selectedAccountIds.has(account.id) ? ' is-selected' : ''}`}
            key={account.id}>
            <input className="selection-checkbox" type="checkbox" checked={selectedAccountIds.has(account.id)}
              onChange={() => toggleAccountSelection(account.id)} aria-label={t('选择 Microsoft 账号：{email}', { email: account.email })} />
            <span className="gmail-account-card__icon">M</span>
            <span className="gmail-account-card__content"><strong>{account.name}</strong><small>{account.email}</small>
              <small>{account.authMode === 'oauth2'
                ? `OAuth2 · ${account.clientIdMasked}` : t('密码模式已停用')}</small></span>
            <span className="gmail-account-card__side"><em className={`is-${account.status}`}>{statusLabel(account.status)}</em>
              <span>{selectedAccountIds.has(account.id) ? t('已选择') : t('点击选择')}</span></span>
          </label> : <button className="gmail-account-card" type="button"
            key={account.id} onClick={() => openAccount(account)}>
            <span className="gmail-account-card__icon">M</span>
            <span className="gmail-account-card__content"><strong>{account.name}</strong><small>{account.email}</small>
              <small>{account.authMode === 'oauth2'
                ? `OAuth2 · ${account.clientIdMasked}` : t('密码模式已停用')}</small></span>
            <span className="gmail-account-card__side"><em className={`is-${account.status}`}>{statusLabel(account.status)}</em>
              <span>{t('管理')}<ChevronRight size={14} /></span></span>
          </button>)}
        </div>
        {batchDeleteConfirm && <DangerConfirmDialog icon={Trash2}
          eyebrow={t('MICROSOFT · 批量管理')}
          title={t('确认批量断开 {count} 个账号？', { count: selectedAccountIds.size })}
          description={t('将断开所选 Microsoft 账号，并删除 OmniMail 中保存的本地凭据与邮件索引。')}
          impactTitle={t('服务器邮件不会被删除')}
          impactDescription={t('OAuth2 应用授权仍需在 Microsoft 账户中单独撤销。')}
          confirmLabel={t('确认批量断开')}
          busy={busy === 'batch-delete'} onCancel={() => setBatchDeleteConfirm(false)}
          onConfirm={() => void removeSelected()} />}
      </div>}

      {view === 'account' && target && <div className="gmail-account-settings">
        <div className="gmail-account-summary"><span className="gmail-account-summary__icon"><KeyRound size={18} /></span>
          <span><strong>{target.email}</strong><small>{target.authMode === 'oauth2'
            ? `OAuth2 · ${target.clientIdMasked}` : t('密码模式已停用')}</small></span>
          <em className={`is-${target.status}`}>{statusLabel(target.status)}</em></div>
        {target.lastErrorCode && <p className="gmail-account-detail-error"><AlertCircle size={15} />
          {t('最近错误：{code}', { code: target.lastErrorCode })}</p>}
        <form className="icloud-form gmail-account-rename" onSubmit={(event) => void rename(event)}>
          <div className="gmail-account-section-heading"><span className="gmail-account-section-icon"><Pencil size={16} /></span>
            <span><strong>{t('备注名称')}</strong><small>{t('只用于 OmniMail 内区分账号。')}</small></span></div>
          <label><span>{t('账号名称')}</span><span className="gmail-account-rename__field">
            <input value={renameValue} required maxLength={60} onChange={(event) => setRenameValue(event.target.value)} />
            <button className="button button--secondary" type="submit" disabled={Boolean(busy)}><Check size={15} />{t('保存备注')}</button>
          </span></label>
        </form>
        <section className="gmail-account-action"><span><strong>{t('验证邮箱连接')}</strong>
          <small>{t('检查当前凭据与 Microsoft IMAP 权限。')}</small></span>
          <button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => void verify()}>
            {busy === 'verify' ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{t('立即验证')}</button></section>
        <section className="gmail-account-action"><span><strong>{t('同步这个账号')}</strong>
          <small>{t('将 INBOX 增量同步任务加入队列。')}</small></span>
          <button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => void sync()}>
            {busy === 'sync' ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}{t('立即同步')}</button></section>
        <form className="icloud-form gmail-account-credential" onSubmit={(event) => void updateCredential(event)}>
          <div className="gmail-account-section-heading"><span className="gmail-account-section-icon"><KeyRound size={16} /></span>
            <span><strong>{t('替换凭据')}</strong><small>{t('只有远程验证成功后才会替换原密文。')}</small></span></div>
          <label><span>Refresh token</span><input type="password" value={refreshToken} required
            autoComplete="off" onChange={(event) => setRefreshToken(event.target.value)} /></label>
          <label><span>Client ID</span><input value={clientId} required autoComplete="off"
            onChange={(event) => setClientId(event.target.value)} /></label>
          <label><span>Authority</span><input value={authority} required autoComplete="off"
            onChange={(event) => setAuthority(event.target.value)} /></label>
          <footer><button className="button button--primary" type="submit" disabled={Boolean(busy)}>
            {busy === 'credential' ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
            {t('验证并更新')}</button></footer>
        </form>
        <div className="gmail-account-danger"><span><strong>{t('断开这个 Microsoft 账号')}</strong>
          <small>{t('删除本地密文与索引，不会删除服务器邮件。')}</small></span>
          <button className="button icloud-danger-button" type="button" disabled={Boolean(busy)}
            onClick={() => setConfirmDelete(true)}><Trash2 size={16} />{t('断开账号')}</button></div>
        {confirmDelete && <DangerConfirmDialog icon={Trash2} eyebrow={t('MICROSOFT · 账号管理')} title={t('确认断开并删除本地加密凭据？')}
          description={t('删除本地密文与索引，不会删除服务器邮件。')} impactTitle={t('服务器邮件不会被删除')}
          impactDescription={t('OAuth2 应用授权仍需在 Microsoft 账户中单独撤销。')} confirmLabel={t('确认断开')}
          busy={busy === 'delete'} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />}
      </div>}
      </div>
    </section>
  </div>
}

function Consent({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="microsoft-password-consent"><input className="selection-checkbox"
    type="checkbox" checked={checked}
    onChange={(event) => onChange(event.target.checked)} /><span>
      {t('我允许服务端加密保存 OAuth2 组合密码；该密码不会用于登录或认证回退。')}</span></label>
}

function CombinationPasswordFields({ password, consent, onPassword, onConsent }: {
  password: string
  consent: boolean
  onPassword: (value: string) => void
  onConsent: (value: boolean) => void
}) {
  return <><label><span>{t('组合密码（可选）')}</span><input type="password" value={password}
    autoComplete="new-password" onChange={(event) => onPassword(event.target.value)} />
    <small>{t('只做加密留存，不参与 Microsoft IMAP 认证。')}</small></label>
    {password && <Consent checked={consent} onChange={onConsent} />}</>
}
