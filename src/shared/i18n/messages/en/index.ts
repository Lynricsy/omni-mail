import { enAdmin } from './admin'
import { enAdminMail } from './admin-mail'
import { enApi } from './api'
import { enErrors } from './errors'
import { enExtension } from './extension'
import { enGmail } from './gmail'
import { enICloud } from './icloud'
import { enInvites } from './invites'
import { enLinuxDoMail } from './linux-do-mail'
import { enMailFeatures } from './mail-features'
import { enMailWorkspaces } from './mail-workspaces'
import { enMicrosoft } from './microsoft'
import { enNaverMail } from './naver-mail'
import { enYandexMail } from './yandex-mail'
import { enMailboxSettings } from './mailbox-settings'
import { enOauth } from './oauth'
import { enRateLimit } from './rate-limit'
import { enQqMail } from './qq-mail'
import { enSecurity } from './security'
import { enVersion } from './version'

export const englishTranslations: Record<string, string> = {
  ...enAdmin,
  ...enAdminMail,
  ...enInvites,
  ...enErrors,
  ...enExtension,
  ...enOauth,
  ...enSecurity,
  ...enMailFeatures,
  ...enMailWorkspaces,
  ...enMailboxSettings,
  ...enRateLimit,
  ...enVersion,
  ...enICloud,
  ...enLinuxDoMail,
  ...enGmail,
  ...enMicrosoft,
  ...enNaverMail,
  ...enYandexMail,
  ...enQqMail,
  ...enApi,
}
