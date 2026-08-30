import { describe, expect, it } from 'vitest'
import type { AuditLog } from '../../../shared/api'
import { actionCategory, auditActionLabel, detailText, targetName } from './AuditLogs'

function log(detail: Record<string, unknown>, action = 'icloud.alias.create'): AuditLog {
  return {
    id: 1,
    actor: null,
    action,
    targetId: 'icloud_account_id',
    target: null,
    ip: '192.0.2.1',
    detail,
    createdAt: 1,
  }
}

describe('iCloud audit log presentation', () => {
  it('uses readable action and category labels', () => {
    expect(auditActionLabel('icloud.alias.create')).toBe('已创建 iCloud 隐藏邮箱')
    expect(actionCategory('icloud.alias.create')).toBe('iCloud')
  })

  it('shows the account name and alias details instead of only an internal id', () => {
    const entry = log({
      accountName: 'Personal iCloud',
      alias: 'shop@icloud.com',
      label: 'Shopping',
    })

    expect(targetName(entry)).toBe('Personal iCloud')
    expect(detailText(entry)).toBe('shop@icloud.com · 用途：Shopping')
  })
})

describe('QQ Mail audit log presentation', () => {
  it('uses the QQ category and readable synchronization details', () => {
    const entry = log({
      accountName: '工作 QQ', email: '123456789@qq.com', reason: 'manual',
      attempt: 2, limit: 20, stage: 'fetch_metadata', errorCode: 'sync_failed',
      errorType: 'ImapConnectionError', errorMessage: 'QQ 邮箱 FETCH 响应缺少有效 UID。',
      errorStatus: 502, durationMs: 1432, willRetry: true,
    }, 'qq_mail.sync.failed')

    expect(auditActionLabel(entry.action)).toBe('QQ 邮箱同步失败')
    expect(actionCategory(entry.action)).toBe('QQ 邮箱')
    expect(targetName(entry)).toBe('工作 QQ')
    expect(detailText(entry)).toContain('邮箱：12***@qq.com')
    expect(detailText(entry)).toContain('来源：手动请求')
    expect(detailText(entry)).toContain('阶段：读取邮件元数据')
    expect(detailText(entry)).toContain('错误码：sync_failed')
    expect(detailText(entry)).toContain('错误类型：ImapConnectionError')
    expect(detailText(entry)).toContain('错误说明：QQ 邮箱 FETCH 响应缺少有效 UID。')
    expect(detailText(entry)).toContain('状态码：502')
    expect(detailText(entry)).toContain('系统将自动重试')
  })

  it('keeps legacy full recipient addresses masked when rendering send logs', () => {
    const entry = log({
      accountName: '工作 QQ', sender: '123456789@qq.com',
      recipient: 'recipient@example.com', recipientCount: 1, reply: false,
    }, 'qq_mail.message.send')
    expect(detailText(entry)).toContain('发件身份：12***@qq.com')
    expect(detailText(entry)).toContain('收件地址：re***@example.com')
    expect(detailText(entry)).not.toContain('recipient@example.com')
  })
})
