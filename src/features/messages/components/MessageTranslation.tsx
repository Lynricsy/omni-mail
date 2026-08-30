import { AlertCircle, Languages, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  api,
  type MessageTranslation as Translation,
  type TranslationTargetLanguage,
} from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t, useLocale, type Locale } from '../../../shared/i18n'

export function translationTarget(locale: Locale): TranslationTargetLanguage {
  return locale === 'zh-CN' ? 'zh' : 'en'
}

function languageName(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) || code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

export function MessageTranslation({
  messageId,
  enabled,
  onDisplayChange,
  children,
}: {
  messageId: string
  enabled: boolean
  onDisplayChange: (messageId: string, translation: Translation | null) => void
  children: ReactNode
}) {
  const locale = useLocale()
  const targetLanguage = translationTarget(locale)
  const [translation, setTranslation] = useState<Translation | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requestVersion = useRef(0)

  useEffect(() => {
    requestVersion.current += 1
    setTranslation(null)
    setShowTranslation(false)
    setLoading(false)
    setError('')
    setNotice('')
    onDisplayChange(messageId, null)
  }, [messageId, onDisplayChange, targetLanguage])

  if (!enabled) return children

  const toggleTranslation = async () => {
    if (showTranslation) {
      setShowTranslation(false)
      onDisplayChange(messageId, null)
      return
    }
    if (translation) {
      setShowTranslation(true)
      onDisplayChange(messageId, translation)
      return
    }
    const version = ++requestVersion.current
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const response = await api.translateMessage(messageId, targetLanguage)
      if (requestVersion.current !== version) return
      if (response.translation.sourceLanguage === targetLanguage) {
        setNotice(t('这封邮件已经是 {language}。', { language: targetName }))
        return
      }
      setTranslation(response.translation)
      setShowTranslation(true)
      onDisplayChange(messageId, response.translation)
    } catch (caught) {
      if (requestVersion.current === version) setError(errorMessage(caught))
    } finally {
      if (requestVersion.current === version) setLoading(false)
    }
  }

  const targetName = targetLanguage === 'zh' ? t('简体中文') : t('English')
  return (
    <section className="message-translation">
      <div className="message-translation__controls">
        {showTranslation && translation && (
          <span className="message-translation__meta">
            <Languages size={14} />
            {t('由 AI 翻译')} · {t('译自 {language}', {
              language: languageName(translation.sourceLanguage, locale),
            })}
          </span>
        )}
        <button
          className="button button--secondary button--small"
          type="button"
          onClick={() => void toggleTranslation()}
          disabled={loading}
        >
          {loading ? <LoaderCircle className="spin" size={15} /> : <Languages size={15} />}
          {showTranslation
            ? t('显示原文')
            : loading
              ? t('正在翻译…')
              : t('翻译为 {language}', { language: targetName })}
        </button>
      </div>
      {error && (
        <p className="message-translation__error" role="alert">
          <AlertCircle size={15} />{error}
        </p>
      )}
      {notice && <p className="message-translation__notice">{notice}</p>}
      {children}
    </section>
  )
}
