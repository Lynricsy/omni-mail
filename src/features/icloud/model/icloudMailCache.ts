import type { ICloudMessage } from '../../../shared/api/api-types'

export const ICLOUD_INBOX_CACHE_MS = 60_000
export const ICLOUD_MESSAGE_CACHE_MS = 10 * 60_000
const MAX_INBOX_ENTRIES = 6
const MAX_MESSAGE_ENTRIES = 30

export type ICloudInboxSnapshot = {
  messages: ICloudMessage[]
  method: 'imap' | 'web'
}

export type ICloudInboxScope = {
  userId: string
  accountId: string
  alias: string
  query: string
}

type CacheEntry<T> = { value: T; cachedAt: number }
type InboxEntry = CacheEntry<ICloudInboxSnapshot> & { scope: ICloudInboxScope }
type MessageEntry = CacheEntry<ICloudMessage> & { userId: string; accountId: string }

let activeUserId = ''
const inboxCache = new Map<string, InboxEntry>()
const messageCache = new Map<string, MessageEntry>()

function inboxKey(scope: ICloudInboxScope): string {
  return JSON.stringify([scope.userId, scope.accountId, scope.alias, scope.query])
}

function messageKey(userId: string, accountId: string, uid: string): string {
  return JSON.stringify([userId, accountId, uid])
}

function touch<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.delete(key)
  cache.set(key, value)
}

function trim<T>(cache: Map<string, T>, maximum: number): void {
  while (cache.size > maximum) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) return
    cache.delete(oldest)
  }
}

export function activateICloudMailCacheUser(userId: string): void {
  if (activeUserId && activeUserId !== userId) resetICloudMailCache()
  activeUserId = userId
}

export function readICloudInboxCache(
  scope: ICloudInboxScope,
  now = Date.now(),
): { value: ICloudInboxSnapshot; fresh: boolean } | null {
  const key = inboxKey(scope)
  const entry = inboxCache.get(key)
  if (!entry) return null
  touch(inboxCache, key, entry)
  return { value: entry.value, fresh: now - entry.cachedAt < ICLOUD_INBOX_CACHE_MS }
}

export function writeICloudInboxCache(
  scope: ICloudInboxScope,
  snapshot: ICloudInboxSnapshot,
  now = Date.now(),
): ICloudInboxSnapshot {
  const messages = snapshot.messages.map((message) => {
    const detail = messageCache.get(messageKey(scope.userId, scope.accountId, message.id))
    return detail?.value.isRead && now - detail.cachedAt < ICLOUD_MESSAGE_CACHE_MS
      ? { ...message, isRead: true }
      : message
  })
  const value = { ...snapshot, messages }
  touch(inboxCache, inboxKey(scope), { scope, value, cachedAt: now })
  trim(inboxCache, MAX_INBOX_ENTRIES)
  return value
}

export function readICloudMessageCache(
  userId: string,
  accountId: string,
  uid: string,
  now = Date.now(),
): { value: ICloudMessage; fresh: boolean } | null {
  const key = messageKey(userId, accountId, uid)
  const entry = messageCache.get(key)
  if (!entry) return null
  touch(messageCache, key, entry)
  return { value: entry.value, fresh: now - entry.cachedAt < ICLOUD_MESSAGE_CACHE_MS }
}

export function writeICloudMessageCache(
  userId: string,
  accountId: string,
  message: ICloudMessage,
  now = Date.now(),
): ICloudMessage {
  const key = messageKey(userId, accountId, message.id)
  touch(messageCache, key, { userId, accountId, value: message, cachedAt: now })
  trim(messageCache, MAX_MESSAGE_ENTRIES)
  if (message.isRead) {
    for (const [inboxKeyValue, entry] of inboxCache) {
      if (entry.scope.userId !== userId || entry.scope.accountId !== accountId) continue
      const messages = entry.value.messages.map((item) => (
        item.id === message.id ? { ...item, isRead: true } : item
      ))
      inboxCache.set(inboxKeyValue, { ...entry, value: { ...entry.value, messages } })
    }
  }
  return message
}

export function clearICloudAccountCache(userId: string, accountId: string): void {
  for (const [key, entry] of inboxCache) {
    if (entry.scope.userId === userId && entry.scope.accountId === accountId) inboxCache.delete(key)
  }
  for (const [key, entry] of messageCache) {
    if (entry.userId === userId && entry.accountId === accountId) messageCache.delete(key)
  }
}

export function resetICloudMailCache(): void {
  inboxCache.clear()
  messageCache.clear()
  activeUserId = ''
}
