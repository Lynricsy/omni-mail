import { normalizeEmail, validEmail } from '../shared/http/api-helpers'
import type { Env } from './types'

export function configuredSuperAdminEmail(env: Env): string {
  const email = normalizeEmail(env.SUPER_ADMIN_EMAIL || '')
  return validEmail(email) ? email : ''
}
