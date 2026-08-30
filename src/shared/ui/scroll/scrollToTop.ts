export function scrollElementToTop(element: HTMLElement | null): void {
  if (!element) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.scrollTo({
    top: 0,
    behavior: reducedMotion ? 'auto' : 'smooth',
  })
}
