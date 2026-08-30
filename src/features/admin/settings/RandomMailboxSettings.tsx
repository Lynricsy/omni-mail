import { AlertCircle, LoaderCircle, Save, Shuffle } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { api } from '../../../shared/api'
import { t } from '../../../shared/i18n'

function validPrefix(value: string): boolean {
  return value === '' || /^[a-z0-9][a-z0-9._+-]{0,19}$/.test(value)
}

export function RandomMailboxSettings({
  prefix,
  onChange,
}: {
  prefix: string
  onChange: (prefix: string) => void
}) {
  const [draft, setDraft] = useState(prefix)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const normalized = draft.trim().toLowerCase()
  const valid = validPrefix(normalized)

  useEffect(() => setDraft(prefix), [prefix])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!valid || normalized === prefix || saving) return
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const result = await api.updateRandomMailboxPrefix(normalized)
      setDraft(result.randomMailboxPrefix)
      onChange(result.randomMailboxPrefix)
      setSaved(true)
    } catch (saveError) {
      setError(t(saveError instanceof Error
        ? saveError.message
        : '无法更新随机邮箱格式。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-card admin-card--settings random-mailbox-settings">
      <header>
        <Shuffle size={17} />
        <div>
          <h2>{t('随机邮箱格式')}</h2>
          <p>{t('设置快速生成与浏览器扩展使用的固定前缀')}</p>
        </div>
      </header>
      <form onSubmit={(event) => void save(event)}>
        <label htmlFor="random-mailbox-prefix">
          <span>{t('固定前缀')}</span>
          <input
            id="random-mailbox-prefix"
            type="text"
            value={draft}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            placeholder="alias-"
            disabled={saving}
            aria-invalid={!valid}
            onChange={(event) => {
              setDraft(event.target.value)
              setSaved(false)
              setError('')
            }}
          />
        </label>
        <div className="random-mailbox-preview">
          <span>{t('格式预览')}</span>
          <strong>{normalized}{t('随机字符')}@example.com</strong>
        </div>
        <footer>
          <small>{t('留空时只使用随机字符；支持字母、数字、点、下划线、加号和连字符，最多 20 个字符。')}</small>
          <button
            className="button button--secondary button--small"
            type="submit"
            disabled={saving || !valid || normalized === prefix}
          >
            {saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
            {t(saving ? '保存中…' : saved ? '已保存' : '保存格式')}
          </button>
        </footer>
        {!valid && (
          <p className="inline-error" role="alert">
            <AlertCircle size={15} />{t('随机邮箱前缀格式无效。')}
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            <AlertCircle size={15} />{error}
          </p>
        )}
      </form>
    </section>
  )
}
