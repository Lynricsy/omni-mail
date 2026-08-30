import type { ComposeAttachmentPayload, ExtensionRequest } from './protocol'

type AuthenticatedRequest = (path: string, init?: RequestInit) => Promise<unknown>

function composeAttachment(attachment: ComposeAttachmentPayload): File {
  const bytes = Uint8Array.from(atob(attachment.contentBase64), (value) => value.charCodeAt(0))
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const filename = attachment.filename.replace(/[\\/:*?"<>\r\n|]/g, '_').slice(0, 180)
    || 'attachment.bin'
  return new File([copy.buffer], filename, {
    type: attachment.contentType || 'application/octet-stream',
  })
}

function composeIdempotencyKey(): string {
  return `float_${crypto.randomUUID().replaceAll('-', '')}`
}

async function uploadDraftAttachments(
  request: AuthenticatedRequest,
  draftId: string,
  attachments: ComposeAttachmentPayload[],
): Promise<void> {
  for (const attachment of attachments) {
    const form = new FormData()
    form.set('file', composeAttachment(attachment))
    await request(`/api/drafts/${encodeURIComponent(draftId)}/attachments`, {
      method: 'POST', body: form,
    })
  }
}

export async function createComposeDraft(
  request: AuthenticatedRequest,
  message: Extract<ExtensionRequest, {
    type: 'api:compose-save-draft' | 'api:compose-send'
  }>,
) {
  const result = await request('/api/drafts', {
    method: 'POST',
    body: JSON.stringify({
      mailboxAddress: message.sender,
      to: message.to,
      subject: message.subject,
      text: message.text,
    }),
  }) as { draft: { id: string } }
  try {
    await uploadDraftAttachments(request, result.draft.id, message.attachments)
    return result
  } catch (error) {
    await request(`/api/drafts/${encodeURIComponent(result.draft.id)}`, {
      method: 'DELETE',
    }).catch(() => undefined)
    throw error
  }
}

export async function sendComposeMessage(
  request: AuthenticatedRequest,
  message: Extract<ExtensionRequest, { type: 'api:compose-send' }>,
) {
  const idempotencyKey = composeIdempotencyKey()
  if (message.source === 'omnimail') {
    if (message.replyToMessageId) {
      if (message.attachments.length) {
        const form = new FormData()
        form.set('text', message.text)
        form.set('idempotencyKey', idempotencyKey)
        for (const attachment of message.attachments) {
          form.append('attachments', composeAttachment(attachment))
        }
        return request(`/api/messages/${encodeURIComponent(message.replyToMessageId)}/reply`, {
          method: 'POST', body: form,
        })
      }
      return request(`/api/messages/${encodeURIComponent(message.replyToMessageId)}/reply`, {
        method: 'POST', body: JSON.stringify({ text: message.text, idempotencyKey }),
      })
    }
    if (message.attachments.length) {
      const result = await createComposeDraft(request, message)
      return request(`/api/drafts/${encodeURIComponent(result.draft.id)}/send`, {
        method: 'POST', body: JSON.stringify({ idempotencyKey }),
      })
    }
    return request('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        mailboxAddress: message.sender,
        to: message.to,
        subject: message.subject,
        text: message.text,
        idempotencyKey,
      }),
    })
  }
  if (message.attachments.length) throw new Error('此邮箱来源暂不支持附件发信。')
  if (message.source === 'qq') {
    if (!message.accountId) throw new Error('请先选择 QQ 邮箱账号。')
    return request(`/api/qq-mail/accounts/${encodeURIComponent(message.accountId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        sender: message.sender,
        to: message.to,
        subject: message.subject,
        text: message.text,
        idempotencyKey,
        replyToMessageId: message.replyToMessageId,
      }),
    })
  }
  return request('/api/linux-do-mail/messages', {
    method: 'POST',
    body: JSON.stringify({
      to: message.to,
      subject: message.subject,
      text: message.text,
      idempotencyKey,
    }),
  })
}
