import { Hono } from 'hono'
import { clientIp } from '../../shared/http/api-helpers'
import type { AppContext } from '../../app/context'
import {
  getOutboundRateLimitSettings,
  resetUserOutboundRateLimit,
  updateOutboundRateLimitSettings,
  updateUserOutboundRateLimit,
} from './outbound-rate-limit-admin'

export const outboundRateLimitRoutes = new Hono<AppContext>()

outboundRateLimitRoutes.get('/admin/settings/outbound-rate-limit', (context) => (
  getOutboundRateLimitSettings(context.env, context.get('user'))
))
outboundRateLimitRoutes.patch('/admin/settings/outbound-rate-limit', (context) => (
  updateOutboundRateLimitSettings(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
outboundRateLimitRoutes.patch('/admin/users/:id/outbound-rate-limit', (context) => (
  updateUserOutboundRateLimit(
    context.env,
    context.get('user'),
    context.env.SUPER_ADMIN_EMAIL || '',
    context.req.param('id'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
outboundRateLimitRoutes.post('/admin/users/:id/outbound-rate-limit/reset', (context) => (
  resetUserOutboundRateLimit(
    context.env,
    context.get('user'),
    context.env.SUPER_ADMIN_EMAIL || '',
    context.req.param('id'),
    clientIp(context.req.raw.headers),
  )
))
