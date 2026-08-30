export interface PlatformUsage {
  refreshInterval: number
  workerRequests: { estimatedPerVisibleTab: number; dailyLimit: number }
  d1RowsRead: { estimatedPerVisibleTab: number; dailyLimit: number }
  queueOperations: { estimatedToday: number; dailyLimit: number }
  r2Storage: { estimatedPrimaryBytes: number; freeBytes: number }
}
