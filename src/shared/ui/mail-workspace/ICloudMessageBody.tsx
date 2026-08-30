import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { api, type ICloudMessage } from '../../api'
import {
  forceLightEmailDocument,
  loadDeferredRemoteImages,
  normalizeRemoteImageSource,
} from '../../mail/emailContent'
import { EMAIL_FRAME_SANDBOX, fitEmailDocument } from './hooks/useSmoothEmailFrame'
import { t } from '../../i18n'
import './styles/message-body.css'
import { ExternalLinkDialog } from '../dialogs/ExternalLinkDialog'

function safeHttpHref(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function emailLink(target: EventTarget | null): string | null {
  if (!target || typeof (target as Element).closest !== 'function') return null
  const link = (target as Element).closest<HTMLAnchorElement>('a[data-icloud-href]')
  return link ? safeHttpHref(link.dataset.icloudHref || '') : null
}

export function buildICloudEmailDocument(html: string, remoteImagesEnabled: boolean): string {
  const proxyUrl = new URL(api.remoteImageUrl('https://example.invalid/image'), window.location.href)
  const proxySource = `${proxyUrl.origin}${proxyUrl.pathname}`
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script, iframe, object, embed, form, base, link, meta[http-equiv]')
    .forEach((node) => node.remove())
  forceLightEmailDocument(document)
  document.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on') || attribute.name.toLowerCase() === 'srcdoc') {
        node.removeAttribute(attribute.name)
      }
    }
  })
  document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const source = image.getAttribute('src') || ''
    image.removeAttribute('srcset')
    if (source.startsWith('data:')) return
    const remoteSource = remoteImagesEnabled ? normalizeRemoteImageSource(source) : null
    image.removeAttribute('src')
    if (remoteSource) image.dataset.omnimailSrc = api.remoteImageUrl(remoteSource)
  })
  document.querySelectorAll('source').forEach((source) => source.remove())
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = safeHttpHref(link.getAttribute('href') || '')
    link.removeAttribute('href')
    link.removeAttribute('target')
    link.removeAttribute('rel')
    if (!href) return
    link.dataset.icloudHref = href
    link.setAttribute('role', 'link')
    link.setAttribute('tabindex', '0')
  })
  const policy = `default-src 'none'; img-src data: ${proxySource}; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'`
  const styles = `<style>
    :root { color-scheme: light; }
    html, body { box-sizing: border-box; width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }
    body { width: var(--omnimail-body-width, 100%) !important; max-width: var(--omnimail-body-max-width, 100%) !important; min-width: 0 !important; margin: 0 !important; padding: 2px !important; color: #262626; background: #fff; font: 15px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow-wrap: anywhere; }
    body *, body *::before, body *::after { box-sizing: border-box; min-width: 0 !important; max-width: 100% !important; }
    table, tbody, tr, td, th { min-width: 0 !important; max-width: 100% !important; }
    td, th { overflow-wrap: anywhere !important; word-break: break-word !important; }
    body [style*="white-space"], h1, h2, h3, h4, h5, h6, p, td, th { white-space: normal !important; }
    h1, h2, h3, h4, h5, h6, p, a { overflow: visible !important; overflow-wrap: anywhere !important; word-break: break-word !important; }
    img, video { max-width: 100% !important; height: auto !important; }
    pre, code { max-width: 100% !important; white-space: pre-wrap !important; overflow-wrap: anywhere; }
    a[data-icloud-href] { color: #1d1d1f; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  </style>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">${document.head.innerHTML}${styles}</head><body>${document.body.innerHTML}</body></html>`
}

function PlainBody({ text, onLink }: { text: string; onLink: (href: string) => void }) {
  const parts = text.split(/(https?:\/\/[^\s<>]+)/g)
  return <div className="icloud-plain-body">{parts.map((part, index) => {
    const candidate = part.replace(/[),.;!?]+$/, '')
    const href = safeHttpHref(candidate)
    if (!href) return part
    const suffix = part.slice(candidate.length)
    return <span key={`${href}-${index}`}><a href={href} onClick={(event: ReactMouseEvent) => { event.preventDefault(); onLink(href) }}>{candidate}</a>{suffix}</span>
  })}</div>
}

export function ICloudMessageBody({ message, remoteImagesEnabled }: {
  message: ICloudMessage
  remoteImagesEnabled: boolean
}) {
  const [height, setHeight] = useState(360)
  const [externalLink, setExternalLink] = useState<string | null>(null)
  const resizeObserver = useRef<ResizeObserver | null>(null)
  const document = useMemo(
    () => message.html ? buildICloudEmailDocument(message.html, remoteImagesEnabled) : '',
    [message.html, remoteImagesEnabled],
  )
  const openExternalLink = useCallback((href: string) => setExternalLink(href), [])
  useEffect(() => () => resizeObserver.current?.disconnect(), [])
  const frameLoaded = useCallback((frame: HTMLIFrameElement) => {
    const content = frame.contentDocument
    if (!content) return
    const resize = () => setHeight(Math.max(280, fitEmailDocument(content)))
    resize()
    resizeObserver.current?.disconnect()
    resizeObserver.current = new ResizeObserver(() => window.requestAnimationFrame(resize))
    if (frame.parentElement) resizeObserver.current.observe(frame.parentElement)
    loadDeferredRemoteImages(content, resize)
    content.addEventListener('click', (event) => {
      const href = emailLink(event.target)
      if (!href) return
      event.preventDefault()
      openExternalLink(href)
    })
    content.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      const href = emailLink(event.target)
      if (!href) return
      event.preventDefault()
      openExternalLink(href)
    })
    window.requestAnimationFrame(resize)
  }, [openExternalLink])

  return <>
    {document ? <iframe className="icloud-email-frame" sandbox={EMAIL_FRAME_SANDBOX}
      scrolling="no" srcDoc={document} style={{ height }}
      title={t('邮件正文：{subject}', { subject: message.subject || t('无主题') })}
      onLoad={(event) => frameLoaded(event.currentTarget)} />
      : <PlainBody text={message.body || message.preview || t('这封邮件没有可显示的文本内容。')} onLink={openExternalLink} />}
    {externalLink && <ExternalLinkDialog href={externalLink} onClose={() => setExternalLink(null)}
      onContinue={() => { window.open(externalLink, '_blank', 'noopener,noreferrer'); setExternalLink(null) }} />}
  </>
}
