import type { Hono } from 'hono'
import type { AppContext } from '../context'
import { configuredSuperAdminEmail } from '../super-admin'
import { listAuditLogs } from '../../features/admin/audit/audit-log-api'
import { createDomain, deleteDomain, listDomains, updateDomain } from '../../features/admin/domains/domain-api'
import { previewAdminMailCleanup, runAdminMailCleanup } from '../../features/admin/mail/admin-mail-cleanup'
import { mailStatistics } from '../../features/admin/mail/statistics-api'
import { startManualBackup, storagePolicy, updateStoragePolicy } from '../../features/admin/settings/storage-policy'
import { updateMailRefreshInterval, updateMailWorkspaceSettings, updateOfficialExtensionSetting, updateRandomMailboxPrefix, updateRemoteImagesSetting, updateUnassignedMailSetting } from '../../features/admin/settings/system-settings'
import { createManagedUser, listManagedUsers, updateManagedUser } from '../../features/admin/users/user-admin-api'
import { updateExternalRegistration, updateRegistrationDomainPolicy } from '../../features/auth/registration/registration-api'
import { createTemporaryInvite, listTemporaryInvites, registerTemporaryInvite, revokeTemporaryInvite, temporaryInvitePreview } from '../../features/invitations/temporary-invite-api'
import { listFailedMessages, retryFailedMessage } from '../../features/messages/failed-mail-api'
import { deploymentCheck } from '../../features/system/deployment-check'
import { systemVersionRoutes } from '../../features/system/system-version-routes'
import { clientIp } from '../../shared/http/api-helpers'

export function registerAdminRoutes(app: Hono<AppContext>): void {
app.get('/api/invitations/:token', (context) => temporaryInvitePreview(context.env, context.req.param('token')))
app.post('/api/invitations/:token', (context) => registerTemporaryInvite(context.env, context.req.param('token'), context.req.raw, clientIp(context.req.raw.headers)))
app.get('/api/admin/invites', (context) => listTemporaryInvites(
  context.env,
  context.get('user'),
  context.req.raw,
))
app.post('/api/admin/invites', (context) => createTemporaryInvite(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/invites/:id/revoke', (context) => revokeTemporaryInvite(context.env, context.get('user'), context.req.param('id'), clientIp(context.req.raw.headers)))
app.get('/api/admin/statistics', (context) => mailStatistics(context.env, context.get('user'), context.req.raw))
app.get('/api/admin/failed-messages', (context) => listFailedMessages(context.env, context.get('user')))
app.post('/api/admin/failed-messages/:id/retry', (context) => retryFailedMessage(
  context.env, context.get('user'), context.req.param('id'), clientIp(context.req.raw.headers),
))
app.get('/api/admin/mail-cleanup/preview', (context) => previewAdminMailCleanup(
  context.env,
  context.get('user'),
  context.req.raw,
))
app.post('/api/admin/mail-cleanup', (context) => runAdminMailCleanup(
  context.env,
  context.get('user'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
app.get('/api/admin/audit-logs', (context) => listAuditLogs(context.env, context.get('user'), context.req.raw))
app.get('/api/admin/deployment-check', (context) => deploymentCheck(context.env, context.get('user')))
app.route('/api', systemVersionRoutes)
app.get('/api/admin/users', (context) => listManagedUsers(
  context.env,
  context.get('user'),
  configuredSuperAdminEmail(context.env),
  context.req.raw,
))
app.post('/api/admin/users', (context) => createManagedUser(
  context.env,
  context.get('user'),
  configuredSuperAdminEmail(context.env),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
app.patch('/api/admin/settings/registration', (context) => updateExternalRegistration(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/registration-domains', (context) => updateRegistrationDomainPolicy(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/mail-refresh', (context) => updateMailRefreshInterval(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/mail-workspaces', (context) => updateMailWorkspaceSettings(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/remote-images', (context) => updateRemoteImagesSetting(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/unassigned-mail', (context) => updateUnassignedMailSetting(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/official-extension', (context) => updateOfficialExtensionSetting(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/random-mailbox-prefix', (context) => updateRandomMailboxPrefix(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.get('/api/admin/settings/storage', async (context) => {
  const user = context.get('user')
  if (user.role !== 'super_admin' && user.role !== 'admin') {
    return context.json({ error: '只有管理员可以查看存储策略。' }, 403)
  }
  return context.json({ storagePolicy: await storagePolicy(context.env) })
})
app.patch('/api/admin/settings/storage', (context) => updateStoragePolicy(
  context.env,
  context.get('user'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
app.post('/api/admin/backups', (context) => startManualBackup(
  context.env,
  context.get('user'),
  clientIp(context.req.raw.headers),
))
app.patch('/api/admin/users/:id', (context) => updateManagedUser(
  context.env,
  context.get('user'),
  configuredSuperAdminEmail(context.env),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
app.get('/api/domains', (context) => listDomains(context.env, context.get('user')))
app.post('/api/admin/domains', (context) => createDomain(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/domains/:name', (context) => updateDomain(context.env, context.get('user'), context.req.param('name'), context.req.raw, clientIp(context.req.raw.headers)))
app.delete('/api/admin/domains/:name', (context) => deleteDomain(context.env, context.get('user'), context.req.param('name'), clientIp(context.req.raw.headers)))
}
