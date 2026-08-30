import { CheckCircle2, ChevronDown, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  apiEndpointCurl,
  apiEndpointKey,
  apiEndpoints,
  apiGroups,
  displayApiPath,
  type ApiAuth,
  type ApiGroupId,
  type LocalizedText,
} from '../model/apiCatalog'
import { t, useLocale } from '../../../shared/i18n'
import { ApiCodeBlock, type ApiCopyState } from './ApiCodeBlock'

const authLabels: Record<ApiAuth, string> = {
  public: '公开接口',
  optional: '可选认证',
  authenticated: '登录或 Bearer Token',
  cookie: '仅网站 Cookie',
  admin: '管理员',
  superAdmin: '仅主管理员',
  webhook: 'Webhook 签名',
}

function localizedText(value: LocalizedText, locale: 'zh-CN' | 'en-US'): string {
  return locale === 'en-US' ? value.en : value.zh
}

export function ApiEndpointCatalog({
  baseUrl,
  copyState,
  onCopy,
}: {
  baseUrl: string
  copyState: ApiCopyState
  onCopy: (key: string, value: string) => Promise<void>
}) {
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState<'all' | ApiGroupId>('all')
  const normalizedQuery = query.trim().toLocaleLowerCase()

  const filteredGroups = useMemo(() => apiGroups.map((group) => {
    const endpoints = apiEndpoints.filter((endpoint) => {
      if (endpoint.group !== group.id) return false
      if (activeGroup !== 'all' && activeGroup !== group.id) return false
      if (!normalizedQuery) return true
      const haystack = [
        endpoint.method,
        endpoint.path,
        endpoint.title.zh,
        endpoint.title.en,
        endpoint.description.zh,
        endpoint.description.en,
        endpoint.request,
        endpoint.response,
      ].join(' ').toLocaleLowerCase()
      return haystack.includes(normalizedQuery)
    })
    return { ...group, endpoints }
  }).filter((group) => group.endpoints.length > 0), [activeGroup, normalizedQuery])

  const resultCount = filteredGroups.reduce((total, group) => total + group.endpoints.length, 0)

  return (
    <section className="api-reference" aria-labelledby="api-reference-title">
      <header className="api-reference__header">
        <div>
          <p className="eyebrow">COMPLETE REFERENCE</p>
          <h2 id="api-reference-title">{t('完整 API 参考')}</h2>
          <p>{t('已按 Worker 路由源码核对并覆盖全部 {count} 个接口；展开任一接口即可查看权限、参数、响应和可复制示例。', { count: apiEndpoints.length })}</p>
        </div>
        <span className="api-reference__coverage">
          <CheckCircle2 size={17} aria-hidden="true" />
          {t('源码覆盖 {count}/{count}', { count: apiEndpoints.length })}
        </span>
      </header>

      <div className="api-reference-toolbar">
        <label className="api-reference-search">
          <span className="sr-only">{t('搜索接口')}</span>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={t('搜索路径、方法、用途或参数')}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={t('清除搜索')}>
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="api-reference-groups" aria-label={t('按 API 模块筛选')}>
          <button
            type="button"
            aria-pressed={activeGroup === 'all'}
            onClick={() => setActiveGroup('all')}
          >
            {t('全部')}<small>{apiEndpoints.length}</small>
          </button>
          {apiGroups.map((group) => (
            <button
              type="button"
              key={group.id}
              aria-pressed={activeGroup === group.id}
              onClick={() => setActiveGroup(group.id)}
            >
              {localizedText(group.title, locale)}
              <small>{apiEndpoints.filter((endpoint) => endpoint.group === group.id).length}</small>
            </button>
          ))}
        </div>
      </div>

      <p className="api-reference-results" role="status" aria-live="polite">
        {t('当前显示 {count} 个接口', { count: resultCount })}
      </p>

      {filteredGroups.length > 0 ? (
        <div className="api-reference-sections">
          {filteredGroups.map((group) => (
            <section className="api-reference-group" key={group.id} id={`api-group-${group.id}`}>
              <header>
                <div>
                  <h3>{localizedText(group.title, locale)}</h3>
                  <p>{localizedText(group.description, locale)}</p>
                </div>
                <span>{t('{count} 个接口', { count: group.endpoints.length })}</span>
              </header>
              <div className="api-endpoint-cards">
                {group.endpoints.map((endpoint) => {
                  const key = apiEndpointKey(endpoint)
                  const title = localizedText(endpoint.title, locale)
                  return (
                    <details className="api-endpoint-card" key={key}>
                      <summary>
                        <span className={`api-method is-${endpoint.method.toLowerCase()}`}>
                          {endpoint.method}
                        </span>
                        <code>{displayApiPath(endpoint.path)}</code>
                        <span className="api-endpoint-card__title">{title}</span>
                        <span className={`api-auth-badge is-${endpoint.auth}`}>
                          {t(authLabels[endpoint.auth])}
                        </span>
                        <ChevronDown size={17} aria-hidden="true" />
                      </summary>
                      <div className="api-endpoint-card__body">
                        <p>{localizedText(endpoint.description, locale)}</p>
                        <dl>
                          <div><dt>{t('认证与权限')}</dt><dd>{t(authLabels[endpoint.auth])}</dd></div>
                          <div><dt>{t('请求参数')}</dt><dd><code>{endpoint.request}</code></dd></div>
                          <div><dt>{t('成功响应')}</dt><dd><code>{endpoint.response}</code></dd></div>
                        </dl>
                        {endpoint.notes?.length ? (
                          <div className="api-endpoint-notes">
                            <strong>{t('使用注意')}</strong>
                            <ul>{endpoint.notes.map((note) => (
                              <li key={note.zh}>{localizedText(note, locale)}</li>
                            ))}</ul>
                          </div>
                        ) : null}
                        <ApiCodeBlock
                          copyKey={`endpoint-${key}`}
                          title={t('调用示例')}
                          code={apiEndpointCurl(endpoint, baseUrl)}
                          state={copyState}
                          onCopy={onCopy}
                        />
                      </div>
                    </details>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="api-reference-empty">
          <Search size={21} aria-hidden="true" />
          <strong>{t('没有匹配的 API 接口')}</strong>
          <span>{t('尝试搜索 messages、token、admin 或字段名称。')}</span>
          <button className="button button--secondary button--small" type="button" onClick={() => {
            setQuery('')
            setActiveGroup('all')
          }}>{t('清除筛选')}</button>
        </div>
      )}
    </section>
  )
}
