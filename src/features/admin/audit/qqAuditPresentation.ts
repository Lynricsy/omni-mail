import type { AuditLog } from '../../../shared/api'
import { t } from '../../../shared/i18n'

export const qqAuditActionLabels: Record<string, string> = {
  'qq_mail.account.connect': '已连接 QQ 邮箱账号',
  'qq_mail.account.rename': '已重命名 QQ 邮箱账号',
  'qq_mail.account.credential_update': '已更新 QQ 邮箱授权码',
  'qq_mail.account.verify': '已验证 QQ 邮箱连接',
  'qq_mail.account.disconnect': '已断开 QQ 邮箱账号',
  'qq_mail.sync.request': '已请求 QQ 邮箱同步',
  'qq_mail.sync.success': 'QQ 邮箱同步成功',
  'qq_mail.sync.failed': 'QQ 邮箱同步失败',
  'qq_mail.message.send': '已发送 QQ 邮件',
  'qq_mail.identity.create': '已添加 QQ 邮箱发信身份',
  'qq_mail.identity.delete': '已删除 QQ 邮箱发信身份',
}

const syncReasons: Record<string, string> = {
  connect: '首次连接', manual: '手动请求', scheduled: '定时任务',
}

const syncStages: Record<string, string> = {
  claim: '获取同步租约', load_account: '读取账号', connect: '连接服务器',
  examine: '打开收件箱', read_index: '读取本地索引', search: '搜索邮件 UID',
  fetch_metadata: '读取邮件元数据', prepare: '准备写入', persist: '写入数据库',
}

function maskedAddress(value: unknown): string {
  const text = String(value || '')
  const at = text.lastIndexOf('@')
  if (at < 1) return text
  return `${text.slice(0, Math.min(2, at))}***${text.slice(at)}`
}

export function qqAuditDetailParts(log: AuditLog): string[] {
  if (!log.action.startsWith('qq_mail.')) return []
  const detail = log.detail
  const parts: string[] = []
  if (detail.email) parts.push(t('邮箱：{address}', { address: maskedAddress(detail.email) }))
  if (detail.identityName) parts.push(t('身份：{name}', { name: String(detail.identityName) }))
  if (detail.sender) parts.push(t('发件身份：{address}', {
    address: maskedAddress(detail.sender),
  }))
  if (detail.recipient) parts.push(t('收件地址：{address}', {
    address: maskedAddress(detail.recipient),
  }))
  if (typeof detail.limit === 'number') {
    parts.push(t('同步上限：{count} 封', { count: detail.limit }))
  }
  if (detail.reason) parts.push(t('来源：{reason}', {
    reason: t(syncReasons[String(detail.reason)] || String(detail.reason)),
  }))
  if (typeof detail.attempt === 'number') {
    parts.push(t('第 {count} 次尝试', { count: detail.attempt }))
  }
  if (detail.stage) parts.push(t('阶段：{stage}', {
    stage: t(syncStages[String(detail.stage)] || String(detail.stage)),
  }))
  if (detail.errorCode) parts.push(t('错误码：{code}', { code: String(detail.errorCode) }))
  if (detail.errorType) parts.push(t('错误类型：{type}', { type: String(detail.errorType) }))
  if (detail.errorMessage) parts.push(t('错误说明：{message}', {
    message: String(detail.errorMessage),
  }))
  if (typeof detail.errorStatus === 'number') {
    parts.push(t('状态码：{status}', { status: detail.errorStatus }))
  }
  if (typeof detail.fetchedCount === 'number') {
    parts.push(t('读取：{count} 封', { count: detail.fetchedCount }))
  }
  if (typeof detail.discoveredCount === 'number') {
    parts.push(t('发现：{count} 封', { count: detail.discoveredCount }))
  }
  if (typeof detail.missingCount === 'number') {
    parts.push(t('远端缺失：{count} 封', { count: detail.missingCount }))
  }
  if (typeof detail.durationMs === 'number') {
    parts.push(t('耗时：{duration} ms', { duration: detail.durationMs }))
  }
  if (typeof detail.recipientCount === 'number') {
    parts.push(t('收件人：{count} 个', { count: detail.recipientCount }))
  }
  if (typeof detail.reply === 'boolean') parts.push(t(detail.reply ? '回复邮件' : '新邮件'))
  if (typeof detail.willRetry === 'boolean') {
    parts.push(t(detail.willRetry ? '系统将自动重试' : '不会自动重试'))
  }
  return parts
}
