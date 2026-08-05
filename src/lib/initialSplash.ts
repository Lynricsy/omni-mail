export const INITIAL_SPLASH_DURATION = 900

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function openingSplashDelay(
  isRetry: boolean,
  reducedMotion = prefersReducedMotion(),
): Promise<void> {
  if (isRetry || reducedMotion) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, INITIAL_SPLASH_DURATION))
}
