import { ImapConnection } from '../../platform/imap/imap-connection'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import { quoteImapValue } from '../../platform/imap/imap-values'
import {
  microsoftAttachmentContent,
  parseMicrosoftMessage,
  parseMicrosoftMetadata,
} from './microsoft-message-parser'
import { parseMicrosoftList, parseMicrosoftSearchUids } from './microsoft-imap-values'
import type {
  MicrosoftAuthMode,
  MicrosoftFolder,
  MicrosoftMessageMetadata,
} from './microsoft-types'

const IMAP_HOST = 'outlook.office365.com'
const IMAP_PORT = 993
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024
const METADATA_BATCH_SIZE = 20

export { ImapConnectionError as MicrosoftRemoteError }

function validUids(values: number[]): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .sort((left, right) => left - right)
}

export class MicrosoftImapClient {
  private readonly connection = new ImapConnection(
    IMAP_HOST,
    IMAP_PORT,
    'Microsoft IMAP',
    ' Microsoft 邮箱地址和密码',
    MAX_MESSAGE_BYTES,
  )

  constructor(
    private readonly email: string,
    private readonly authMode: MicrosoftAuthMode,
    private readonly credential: string,
  ) {}

  async open(): Promise<void> {
    if (this.authMode === 'oauth2') {
      await this.connection.openOAuth2(this.email, this.credential)
      return
    }
    await this.connection.open(this.email, this.credential)
  }

  async close(): Promise<void> {
    await this.connection.close()
  }

  async listFolders(): Promise<MicrosoftFolder[]> {
    const result = await this.connection.command('LIST "" "*"')
    const folders = parseMicrosoftList(result.lines)
    if (!folders.some(({ path }) => path.toUpperCase() === 'INBOX')) {
      throw new ImapConnectionError(502, 'Microsoft IMAP 未返回 INBOX 文件夹。', true)
    }
    return folders
  }

  async examineFolder(path: string): Promise<{ uidValidity: number; exists: number }> {
    const result = await this.connection.command(`EXAMINE ${quoteImapValue(path)}`)
    const uidValidity = Number(result.lines
      .map((line) => line.match(/\[UIDVALIDITY (\d+)\]/i)?.[1])
      .find(Boolean))
    const exists = Number(result.lines
      .map((line) => line.match(/^\* (\d+) EXISTS$/i)?.[1])
      .find(Boolean) || 0)
    if (!Number.isSafeInteger(uidValidity) || uidValidity < 1) {
      throw new ImapConnectionError(502, 'Microsoft IMAP 未返回有效的 UIDVALIDITY。', true)
    }
    return { uidValidity, exists }
  }

  async searchAllUids(): Promise<number[]> {
    return parseMicrosoftSearchUids((await this.connection.command('UID SEARCH ALL')).lines)
  }

  async fetchMetadata(
    uids: number[],
    deadline = Date.now() + 150_000,
  ): Promise<MicrosoftMessageMetadata[]> {
    const selected = validUids(uids)
    const messages: MicrosoftMessageMetadata[] = []
    for (let offset = 0; offset < selected.length; offset += METADATA_BATCH_SIZE) {
      if (Date.now() >= deadline) {
        throw new ImapConnectionError(504, 'Microsoft 邮箱同步超过总执行时间上限。')
      }
      const batch = selected.slice(offset, offset + METADATA_BATCH_SIZE)
      const result = await this.connection.command(
        `UID FETCH ${batch.join(',')} (UID FLAGS INTERNALDATE RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID CONTENT-TYPE)])`,
      )
      for (const literal of result.literals) {
        messages.push(await parseMicrosoftMetadata(literal.line, literal.data))
      }
    }
    return messages
  }

  async getMessage(folderPath: string, uid: number) {
    if (!Number.isSafeInteger(uid) || uid < 1) {
      throw new ImapConnectionError(400, 'Microsoft 邮件 UID 无效。', true)
    }
    await this.examineFolder(folderPath)
    const result = await this.connection.command(`UID FETCH ${uid} (UID BODY.PEEK[])`)
    const literal = result.literals.find(({ line }) => new RegExp(`\\bUID ${uid}\\b`, 'i').test(line))
    if (!literal) throw new ImapConnectionError(404, 'Microsoft 邮件不存在。', true)
    return parseMicrosoftMessage(literal.data, String(uid))
  }

  async markSeen(folderPath: string, uid: number, expectedUidValidity: number): Promise<void> {
    if (!Number.isSafeInteger(uid) || uid < 1) {
      throw new ImapConnectionError(400, 'Microsoft 邮件 UID 无效。', true)
    }
    const selected = await this.connection.command(`SELECT ${quoteImapValue(folderPath)}`)
    const uidValidity = Number(selected.lines
      .map((line) => line.match(/\[UIDVALIDITY (\d+)\]/i)?.[1])
      .find(Boolean))
    if (uidValidity !== expectedUidValidity) {
      throw new ImapConnectionError(
        404,
        'Microsoft 文件夹 UIDVALIDITY 已变化，请刷新邮件列表。',
        true,
      )
    }
    await this.connection.command(`UID STORE ${uid} +FLAGS.SILENT (\\Seen)`)
  }

  async getAttachment(folderPath: string, uid: number, partId: string) {
    const { parsedAttachments } = await this.getMessage(folderPath, uid)
    return microsoftAttachmentContent(parsedAttachments, partId)
  }
}
