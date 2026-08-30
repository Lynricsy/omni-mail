export type ClientErrorReport = {
  crashId: string
  errorName: string
  message: string
  componentStack: string
  path: string
}

export async function reportClientError(report: ClientErrorReport): Promise<void> {
  const response = await fetch('/api/client-errors', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    keepalive: true,
  })
  if (!response.ok) throw new Error(`Client error report returned ${response.status}`)
}
