import type { ICloudMessage } from '../icloud/icloud-types'

export type LinuxDoMailAccountStatus = 'active' | 'error'

export interface LinuxDoMailAccount {
  id: string
  userId: string
  username: string
  password: string
  status: LinuxDoMailAccountStatus
  lastValidated: string
  lastError: string
  createdAt: string
}

export interface LinuxDoMailAccountRow {
  id: string
  user_id: string
  username: string
  password_cipher: string
  status: LinuxDoMailAccountStatus
  last_validated: string
  last_error: string
  created_at: string
}

export type PublicLinuxDoMailAccount = Omit<
  LinuxDoMailAccount,
  'userId' | 'password'
> & { hasPassword: boolean }

export type LinuxDoMailMessage = ICloudMessage
