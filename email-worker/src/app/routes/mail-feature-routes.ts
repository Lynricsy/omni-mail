import { Hono } from 'hono'
import { clientIp } from '../../shared/http/api-helpers'
import type { AppContext } from '../context'
import {
  downloadBackupObject,
  listBackupObjects,
  runBackupDrill,
} from '../../features/backups/backup-browser-api'
import {
  getAdminMessageAttachment,
  getAdminMessageDetail,
  getAdminRawMessage,
  listAdminMessages,
  manageAdminMessages,
} from '../../features/admin/mail/admin-message-api'
import {
  createDraft,
  deleteDraftAttachment,
  discardDraft,
  getDraft,
  listDrafts,
  saveDraft,
  sendDraft,
  uploadDraftAttachment,
} from '../../features/drafts/draft-api'
import { translateMessage } from '../../features/messages/message-translation-api'

export const mailFeatureRoutes = new Hono<AppContext>()

mailFeatureRoutes.get('/admin/messages', (context) => (
  listAdminMessages(context.env, context.get('user'), context.req.raw)
))
mailFeatureRoutes.patch('/admin/messages/bulk', (context) => (
  manageAdminMessages(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
mailFeatureRoutes.get('/admin/messages/:messageId/attachments/:attachmentId', (context) => (
  getAdminMessageAttachment(
    context.env,
    context.get('user'),
    context.req.param('messageId'),
    context.req.param('attachmentId'),
    context.req.query('preview') === '1',
    clientIp(context.req.raw.headers),
  )
))
mailFeatureRoutes.get('/admin/messages/:id/raw', (context) => (
  getAdminRawMessage(
    context.env,
    context.get('user'),
    context.req.param('id'),
    clientIp(context.req.raw.headers),
  )
))
mailFeatureRoutes.get('/admin/messages/:id', (context) => (
  getAdminMessageDetail(
    context.env,
    context.get('user'),
    context.req.param('id'),
    clientIp(context.req.raw.headers),
  )
))

mailFeatureRoutes.get('/admin/backups/objects', (context) => (
  listBackupObjects(context.env, context.get('user'), context.req.raw)
))
mailFeatureRoutes.get('/admin/backups/download', (context) => (
  downloadBackupObject(context.env, context.get('user'), context.req.raw)
))
mailFeatureRoutes.post('/admin/backups/drill', (context) => (
  runBackupDrill(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))

mailFeatureRoutes.get('/drafts', (context) => (
  listDrafts(context.env, context.get('user'))
))
mailFeatureRoutes.post('/drafts', (context) => (
  createDraft(context.env, context.get('user'), context.req.raw)
))
mailFeatureRoutes.get('/drafts/:id', (context) => (
  getDraft(context.env, context.get('user'), context.req.param('id'))
))
mailFeatureRoutes.put('/drafts/:id', (context) => (
  saveDraft(context.env, context.get('user'), context.req.param('id'), context.req.raw)
))
mailFeatureRoutes.delete('/drafts/:id', (context) => (
  discardDraft(context.env, context.get('user'), context.req.param('id'))
))
mailFeatureRoutes.post('/drafts/:id/attachments', (context) => (
  uploadDraftAttachment(
    context.env,
    context.get('user'),
    context.req.param('id'),
    context.req.raw,
  )
))
mailFeatureRoutes.delete('/drafts/:id/attachments/:attachmentId', (context) => (
  deleteDraftAttachment(
    context.env,
    context.get('user'),
    context.req.param('id'),
    context.req.param('attachmentId'),
  )
))
mailFeatureRoutes.post('/drafts/:id/send', (context) => (
  sendDraft(
    context.env,
    context.get('user'),
    context.req.param('id'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))

mailFeatureRoutes.post('/messages/:id/translation', (context) => (
  translateMessage(
    context.env,
    context.get('user'),
    context.req.param('id'),
    context.req.raw,
  )
))
