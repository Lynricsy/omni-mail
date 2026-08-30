import { api } from '../../../shared/api'
import { t } from '../../../shared/i18n'

export function LinuxDoAuthButton({ registering = false }: { registering?: boolean }) {
  return (
    <button
      className="button linux-do-auth"
      type="button"
      onClick={() => window.location.assign(api.linuxDoLoginUrl(window.location.href))}
    >
      <span aria-hidden="true">L</span>
      {t(registering ? '通过 Linux DO 创建账户' : '使用 Linux DO 登录')}
    </button>
  )
}
