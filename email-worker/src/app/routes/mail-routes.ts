import type { Hono } from 'hono'
import type { AppContext } from '../context'
import { gmailRoutes } from '../../features/gmail/gmail-routes'
import { iCloudRoutes } from '../../features/icloud/icloud-routes'
import { linuxDoMailRoutes } from '../../features/linux-do-mail/linux-do-mail-routes'
import { microsoftRoutes } from '../../features/microsoft/microsoft-routes'
import { qqMailRoutes } from '../../features/qq-mail/qq-mail-routes'
import { naverMailRoutes } from '../../features/naver-mail/naver-mail-routes'
import { yandexMailRoutes } from '../../features/yandex-mail/yandex-mail-routes'
import { addMailbox, deleteMailbox, listMailboxes, updateMailbox } from '../../features/mailboxes/mailbox-api'
import { bulkUpdateMessages } from '../../features/messages/message-bulk-api'
import { deleteMessage, getMessageAttachment, getMessageDetail, getRawMessage, previewMessageAttachment, updateMessage } from '../../features/messages/message-detail-api'
import { listMessages } from '../../features/messages/message-list-api'
import { sendReply } from '../../features/messages/reply'
import { sendMessage, type NewMessageInput } from '../../features/messages/send-message'
import { outboundRateLimitRoutes } from '../../features/outbound/outbound-rate-limit-routes'
import { clientIp } from '../../shared/http/api-helpers'
import { mailFeatureRoutes } from './mail-feature-routes'
import { listMailNotifications } from '../../features/notifications/mail-notification-api'

export function registerMailRoutes(app: Hono<AppContext>): void {
app.get('/api/mailboxes', (context) => (
  listMailboxes(context.env, context.get('user'))
))
app.post('/api/mailboxes', (context) => (
  addMailbox(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
app.patch('/api/mailboxes/:address', (context) => (
  updateMailbox(
    context.env,
    context.get('user'),
    context.req.param('address'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
app.delete('/api/mailboxes/:address', (context) => (
  deleteMailbox(
    context.env,
    context.get('user'),
    context.req.param('address'),
    clientIp(context.req.raw.headers),
  )
))

app.get('/api/messages', (context) => listMessages(context.env, context.get('user'), context.req.raw))
app.get('/api/mail-notifications', (context) => (
  listMailNotifications(context.env, context.get('user'), context.req.raw)
))
app.route('/api', iCloudRoutes)
app.route('/api', gmailRoutes)
app.route('/api', microsoftRoutes)
app.route('/api', qqMailRoutes)
app.route('/api', naverMailRoutes)
app.route('/api', yandexMailRoutes)
app.route('/api', linuxDoMailRoutes)
app.route('/api', mailFeatureRoutes)
app.route('/api', outboundRateLimitRoutes)
app.post('/api/messages', async (context) => {
  const body = await context.req.json<NewMessageInput>()
    .catch(() => ({} as NewMessageInput))
  return sendMessage(
    context.env,
    context.get('user'),
    body,
    clientIp(context.req.raw.headers),
  )
})
app.patch('/api/messages/bulk', (context) => bulkUpdateMessages(
  context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers),
))

app.get('/api/messages/:id', (context) => getMessageDetail(
  context.env, context.get('user'), context.req.param('id'),
))
app.patch('/api/messages/:id', (context) => updateMessage(
  context.env, context.get('user'), context.req.param('id'), context.req.raw,
))
app.delete('/api/messages/:id', (context) => deleteMessage(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
app.get('/api/messages/:messageId/attachments/:attachmentId', (context) => (
  (context.req.query('preview') === '1' ? previewMessageAttachment : getMessageAttachment)(
    context.env,
    context.get('user'),
    context.req.param('messageId'),
    context.req.param('attachmentId'),
  )
))
app.get('/api/messages/:id/raw', (context) => getRawMessage(
  context.env, context.get('user'), context.req.param('id'),
))

app.post('/api/messages/:id/reply', (context) => sendReply(
  context.env,
  context.get('user'),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
}
