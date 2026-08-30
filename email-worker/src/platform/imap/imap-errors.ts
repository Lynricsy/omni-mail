export class ImapConnectionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly definitive = false,
  ) {
    super(message)
  }
}
