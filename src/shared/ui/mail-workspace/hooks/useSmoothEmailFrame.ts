import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { loadDeferredRemoteImages } from '../../../mail/emailContent'

export const EMAIL_FRAME_SANDBOX = 'allow-same-origin'
const EMAIL_FRAME_MIN_HEIGHT = 470
const EMAIL_FRAME_RETIRE_MS = 240

type FrameIndex = 0 | 1
type FrameDocuments = [string, string]

export type PreparedEmailFrame = {
  messageId: string
  document: string
}

export function emailDocumentHeight(document: Document): number {
  return Math.max(
    EMAIL_FRAME_MIN_HEIGHT,
    document.body.offsetHeight,
    document.body.scrollHeight,
    document.documentElement.offsetHeight,
    document.documentElement.scrollHeight,
  )
}

export function fitEmailDocument(document: Document): number {
  const { body, documentElement } = document
  body.style.removeProperty('transform')
  body.style.removeProperty('transform-origin')
  body.style.removeProperty('--omnimail-body-width')
  body.style.removeProperty('--omnimail-body-max-width')

  const viewportWidth = documentElement.clientWidth
  if (viewportWidth <= 0) return emailDocumentHeight(document)

  const scrollWidth = Math.max(body.scrollWidth, documentElement.scrollWidth)
  if (scrollWidth <= viewportWidth + 1) return emailDocumentHeight(document)

  const bodyLeft = body.getBoundingClientRect().left
  let minLeft = 0
  let maxRight = viewportWidth
  for (const element of [body, ...body.querySelectorAll('*')]) {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    minLeft = Math.min(minLeft, rect.left - bodyLeft)
    maxRight = Math.max(maxRight, rect.right - bodyLeft)
  }

  const contentWidth = Math.max(
    viewportWidth,
    body.scrollWidth,
    documentElement.scrollWidth,
    maxRight - minLeft,
  )
  if (contentWidth <= viewportWidth + 1) return emailDocumentHeight(document)

  body.style.setProperty('--omnimail-body-width', `${contentWidth}px`)
  body.style.setProperty('--omnimail-body-max-width', 'none')
  const scale = viewportWidth / contentWidth
  const naturalHeight = emailDocumentHeight(document)
  body.style.setProperty('transform-origin', 'top left')
  body.style.setProperty(
    'transform',
    minLeft < 0 ? `scale(${scale}) translateX(${-minLeft}px)` : `scale(${scale})`,
  )
  return Math.max(EMAIL_FRAME_MIN_HEIGHT, Math.ceil(naturalHeight * scale))
}

export function emailFrameReady(
  messageId: string,
  html: string,
  frameDocument: string,
  prepared: PreparedEmailFrame | null,
): boolean {
  return !html || (prepared?.messageId === messageId
    && prepared.document === frameDocument)
}

function watchImages(document: Document, resize: () => void) {
  document.querySelectorAll('img').forEach((image) => {
    if (!image.complete) image.addEventListener('load', resize, { once: true })
  })
}

export function useSmoothEmailFrame({
  messageId,
  initialDocument,
  displayedDocument,
  onLinkClick,
  onLinkKeyDown,
  onScrollActivity,
}: {
  messageId: string
  initialDocument: string
  displayedDocument: string
  onLinkClick: (event: Event) => void
  onLinkKeyDown: (event: KeyboardEvent) => void
  onScrollActivity: () => void
}) {
  const firstFrameRef = useRef<HTMLIFrameElement>(null)
  const secondFrameRef = useRef<HTMLIFrameElement>(null)
  const resizeObservers = useRef<Array<ResizeObserver | null>>([null, null])
  const documentsRef = useRef<FrameDocuments>([initialDocument, ''])
  const loadedDocuments = useRef<FrameDocuments>(['', ''])
  const heights = useRef<[number, number]>([EMAIL_FRAME_MIN_HEIGHT, EMAIL_FRAME_MIN_HEIGHT])
  const desiredDocument = useRef(displayedDocument)
  const activeIndexRef = useRef<FrameIndex>(0)
  const retireTimer = useRef<number | null>(null)
  const [documents, setDocuments] = useState<FrameDocuments>([initialDocument, ''])
  const [activeIndex, setActiveIndex] = useState<FrameIndex>(0)
  const [retiringIndex, setRetiringIndex] = useState<FrameIndex | null>(null)
  const [activeHeight, setActiveHeight] = useState(EMAIL_FRAME_MIN_HEIGHT)
  const [preparedFrame, setPreparedFrame] = useState<PreparedEmailFrame | null>(null)

  desiredDocument.current = displayedDocument

  const cancelRetirement = useCallback(() => {
    if (retireTimer.current !== null) window.clearTimeout(retireTimer.current)
    retireTimer.current = null
  }, [])

  const promote = useCallback((index: FrameIndex) => {
    const previous = activeIndexRef.current
    if (previous === index) {
      setActiveHeight(heights.current[index])
      return
    }
    cancelRetirement()
    setRetiringIndex(previous)
    activeIndexRef.current = index
    setActiveIndex(index)
    setActiveHeight(heights.current[index])
    retireTimer.current = window.setTimeout(() => {
      retireTimer.current = null
      setRetiringIndex((current) => current === previous ? null : current)
    }, EMAIL_FRAME_RETIRE_MS)
  }, [cancelRetirement])

  useLayoutEffect(() => {
    cancelRetirement()
    const next: FrameDocuments = [initialDocument, '']
    documentsRef.current = next
    loadedDocuments.current = ['', '']
    heights.current = [EMAIL_FRAME_MIN_HEIGHT, EMAIL_FRAME_MIN_HEIGHT]
    activeIndexRef.current = 0
    setDocuments(next)
    setActiveIndex(0)
    setRetiringIndex(null)
    setActiveHeight(EMAIL_FRAME_MIN_HEIGHT)
    setPreparedFrame(null)
  }, [cancelRetirement, initialDocument, messageId])

  useEffect(() => () => {
    cancelRetirement()
    for (const observer of resizeObservers.current) observer?.disconnect()
  }, [cancelRetirement])

  useEffect(() => {
    if (!preparedFrame || !displayedDocument) return
    const current = activeIndexRef.current
    if (loadedDocuments.current[current] === displayedDocument) return
    const pending = (current === 0 ? 1 : 0) as FrameIndex
    if (loadedDocuments.current[pending] === displayedDocument) {
      promote(pending)
      return
    }
    if (documentsRef.current[pending] === displayedDocument) return
    const next = [...documentsRef.current] as FrameDocuments
    next[pending] = displayedDocument
    documentsRef.current = next
    loadedDocuments.current[pending] = ''
    setDocuments(next)
  }, [displayedDocument, preparedFrame, promote])

  const onLoad = useCallback((
    index: FrameIndex,
    expectedDocument: string,
    event: SyntheticEvent<HTMLIFrameElement>,
  ) => {
    if (documentsRef.current[index] !== expectedDocument) return
    const frame = event.currentTarget
    const document = frame.contentDocument
    if (!document) return
    loadedDocuments.current[index] = expectedDocument
    document.addEventListener('click', onLinkClick)
    document.addEventListener('keydown', onLinkKeyDown)
    document.addEventListener('wheel', onScrollActivity, { passive: true })
    document.addEventListener('touchmove', onScrollActivity, { passive: true })

    const resize = () => {
      const height = fitEmailDocument(document)
      heights.current[index] = height
      const value = `${height}px`
      if (frame.style.height !== value) frame.style.height = value
      if (activeIndexRef.current === index) setActiveHeight(height)
    }
    resizeObservers.current[index]?.disconnect()
    resize()
    const observer = new ResizeObserver(() => window.requestAnimationFrame(resize))
    if (frame.parentElement) observer.observe(frame.parentElement)
    resizeObservers.current[index] = observer
    watchImages(document, resize)
    window.requestAnimationFrame(() => {
      resize()
      window.requestAnimationFrame(() => loadDeferredRemoteImages(document, resize))
      window.requestAnimationFrame(() => {
        if (expectedDocument === initialDocument) {
          setPreparedFrame({ messageId, document: initialDocument })
        }
        if (desiredDocument.current === expectedDocument) promote(index)
      })
    })
  }, [initialDocument, messageId, onLinkClick, onLinkKeyDown, onScrollActivity, promote])

  return {
    documents,
    frameRefs: [firstFrameRef, secondFrameRef] as const,
    activeIndex,
    retiringIndex,
    activeHeight,
    onLoad,
    preparedFrame,
  }
}
