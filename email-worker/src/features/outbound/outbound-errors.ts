export class OutboundDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
    readonly deliveryUncertain = false,
  ) {
    super(message)
    this.name = 'OutboundDeliveryError'
  }
}

export class OutboundProviderAcceptedError extends Error {
  constructor(readonly providerId: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Unable to record accepted outbound message')
    this.name = 'OutboundProviderAcceptedError'
  }
}

export const DELIVERY_UNCERTAIN_PREFIX = '投递结果不确定，已停止自动重试：'
