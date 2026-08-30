import { AlertCircle, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getLocale, t } from '../../../shared/i18n'

interface TurnstileApi {
  render: (container: HTMLElement, options: {
    sitekey: string
    action: string
    theme: 'light' | 'dark'
    language: string
    size: 'flexible'
    callback: (token: string) => void
    'error-callback': () => void
    'expired-callback': () => void
    'timeout-callback': () => void
  }) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | undefined

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('Turnstile API was not initialized'))
    }
    script.onerror = () => reject(new Error('Turnstile script could not be loaded'))
    document.head.append(script)
  }).catch((error) => {
    scriptPromise = undefined
    throw error
  })
  return scriptPromise
}

export function TurnstileWidget({
  siteKey,
  action = 'register',
  onTokenChange,
}: {
  siteKey: string
  action?: 'register' | 'temporary-invite'
  onTokenChange: (token: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const locale = getLocale()

  useEffect(() => {
    let cancelled = false
    let widgetId = ''
    onTokenChange('')
    void loadTurnstile().then((turnstile) => {
      if (cancelled || !containerRef.current) return
      widgetId = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
        language: locale,
        size: 'flexible',
        callback: (token) => {
          setState('ready')
          onTokenChange(token)
        },
        'error-callback': () => {
          setState('error')
          onTokenChange('')
        },
        'expired-callback': () => onTokenChange(''),
        'timeout-callback': () => onTokenChange(''),
      })
      setState('ready')
    }).catch(() => {
      if (!cancelled) setState('error')
    })
    return () => {
      cancelled = true
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [action, locale, onTokenChange, siteKey])

  return (
    <div className="turnstile-field" aria-busy={state === 'loading'}>
      <div className="turnstile-container" ref={containerRef} />
      {state === 'loading' && (
        <p role="status"><LoaderCircle className="spin" size={15} />{t('正在加载安全验证…')}</p>
      )}
      {state === 'error' && (
        <p className="is-error" role="alert">
          <AlertCircle size={15} />{t('安全验证加载失败，请检查网络后重新打开注册窗口。')}
        </p>
      )}
    </div>
  )
}
