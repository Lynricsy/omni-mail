import { strict as assert } from 'node:assert'
import { json, requestBody } from './extension-smoke-fixtures.mjs'

let draftAttachmentUploads = 0
let draftSends = 0
let replySends = 0

export async function handleComposeRequest(url, request, response) {
  if (url.pathname === '/api/drafts' && request.method === 'POST') {
    await requestBody(request)
    json(response, { draft: { id: 'float-draft-1' } }, 201)
    return true
  }
  if (url.pathname === '/api/drafts/float-draft-1/attachments'
    && request.method === 'POST') {
    for await (const _chunk of request) { /* consume multipart upload */ }
    draftAttachmentUploads += 1
    json(response, { attachment: { id: 'draft-attachment-1' } }, 201)
    return true
  }
  if (url.pathname === '/api/drafts/float-draft-1/send' && request.method === 'POST') {
    await requestBody(request)
    draftSends += 1
    json(response, { message: { id: 'outgoing-1', status: 'processing' } }, 202)
    return true
  }
  if (url.pathname === '/api/messages/message-1/reply' && request.method === 'POST') {
    await requestBody(request)
    replySends += 1
    json(response, { message: { id: 'reply-1', status: 'processing' } }, 202)
    return true
  }
  if (url.pathname === '/api/linux-do-mail/messages' && request.method === 'POST') {
    await requestBody(request)
    json(response, { message: { id: 'linuxdo-outgoing-1', status: 'processing' } }, 202)
    return true
  }
  return false
}

export async function verifyOmniCompose(frame) {
  await frame.getByRole('button', { name: '新建 OmniMail 邮件' }).click()
  await frame.getByLabel('收件邮箱').fill('recipient@example.com')
  await frame.getByLabel('主题').fill('Float attachment compose')
  await frame.getByLabel('正文').fill('Queued from Float with an attachment.')
  await frame.locator('#compose-attachments').setInputFiles({
    name: 'float-note.txt', mimeType: 'text/plain', buffer: Buffer.from('Float attachment'),
  })
  await frame.getByRole('button', { name: '发送邮件' }).click()
  await frame.getByText('邮件已加入发送队列').waitFor()
  assert.equal(draftAttachmentUploads, 1)
  assert.equal(draftSends, 1)
}

export async function verifyOmniReply(frame) {
  await frame.getByRole('button', { name: '回复' }).click()
  await frame.getByLabel('正文').fill('Reply from Float.')
  await frame.getByRole('button', { name: '发送邮件' }).click()
  await frame.getByText('邮件已加入发送队列').waitFor()
  assert.equal(replySends, 1)
}
