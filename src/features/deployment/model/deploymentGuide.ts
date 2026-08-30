import type { User } from '../../../shared/api'
import { isAdminRole } from '../../../shared/auth/roles'

const deploymentGuideKey = 'omnimail.deployment-guide.v1'

export function deploymentGuideUnseen(user: User): boolean {
  if (!isAdminRole(user.role)) return false
  try {
    return window.localStorage.getItem(deploymentGuideKey) !== 'seen'
  } catch {
    return true
  }
}

export function markDeploymentGuideSeen(): void {
  try {
    window.localStorage.setItem(deploymentGuideKey, 'seen')
  } catch {
    // The guide still closes when storage is unavailable.
  }
}
