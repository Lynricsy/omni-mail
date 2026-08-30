import { t } from '../i18n'

export function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '发生了未知错误。')
}
