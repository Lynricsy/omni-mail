import { useState } from 'react'
import { t } from '../../src/shared/i18n'
import { NOTIFICATION_SOURCE_IDS } from './notification-settings'
import type { ExtensionSettings, ThemePreference } from './protocol'
import { sendExtensionMessage } from './protocol'
import { setPanelTheme } from './theme'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '无法保存扩展设置。'
}

export function usePanelSettings({
  onNotice,
  onError,
}: {
  onNotice: (message: string) => void
  onError: (message: string) => void
}) {
  const [settings, setSettings] = useState<ExtensionSettings>({
    floatingEnabled: true,
    theme: 'system',
    notificationsEnabled: true,
    notificationSources: NOTIFICATION_SOURCE_IDS,
    quietHoursStart: '',
    quietHoursEnd: '',
  })

  async function toggleFloating(enabled: boolean) {
    setSettings((current) => ({ ...current, floatingEnabled: enabled }))
    try {
      await sendExtensionMessage({ type: 'settings:set-floating', enabled })
      onNotice(t(enabled ? '已启用网页悬浮按钮' : '已关闭网页悬浮按钮'))
    } catch (settingsError) {
      setSettings((current) => ({ ...current, floatingEnabled: !enabled }))
      onError(errorText(settingsError))
    }
  }

  async function changeTheme(theme: ThemePreference) {
    const previous = settings.theme
    setSettings((current) => ({ ...current, theme }))
    setPanelTheme(theme)
    try {
      await sendExtensionMessage({ type: 'settings:set-theme', theme })
      onNotice(t(theme === 'system'
        ? '主题已设为跟随系统'
        : '已切换为' + (theme === 'light' ? '亮色' : '暗色') + '主题'))
    } catch (settingsError) {
      setSettings((current) => ({ ...current, theme: previous }))
      setPanelTheme(previous)
      onError(errorText(settingsError))
    }
  }

  async function changeNotifications(input: Pick<
    ExtensionSettings,
    'notificationsEnabled' | 'notificationSources' | 'quietHoursStart' | 'quietHoursEnd'
  >) {
    const previous = settings
    const next = { ...settings, ...input }
    setSettings(next)
    try {
      await sendExtensionMessage({ type: 'settings:set-notifications', ...input })
      onNotice(t(input.notificationsEnabled ? '通知设置已保存' : '已关闭新邮件通知'))
    } catch (settingsError) {
      setSettings(previous)
      onError(errorText(settingsError))
    }
  }

  return { settings, setSettings, toggleFloating, changeTheme, changeNotifications }
}
