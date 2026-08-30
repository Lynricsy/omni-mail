import {
  BookOpen,
  Braces,
  Clock3,
  ExternalLink,
  Globe2,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Workflow,
} from 'lucide-react'
import { useState } from 'react'
import {
  apiGuideSnippets,
  type ApiExampleLanguage,
} from '../model/apiGuide'
import { t } from '../../../shared/i18n'
import '../styles/api-guide.css'
import '../styles/api-reference.css'
import { AdminPageHeader } from '../../admin/shell/AdminPageHeader'
import {
  ApiCodeBlock as CodeBlock,
  ApiCopyButton as CopyButton,
  type ApiCopyState as CopyState,
} from './ApiCodeBlock'
import { ApiEndpointCatalog } from './ApiEndpointCatalog'

const exampleLanguages: Array<{ id: ApiExampleLanguage; label: string }> = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
]

export function ApiGuide() {
  const origin = typeof window === 'undefined'
    ? 'https://mail.example.com'
    : window.location.origin
  const snippets = apiGuideSnippets(origin)
  const [language, setLanguage] = useState<ApiExampleLanguage>('curl')
  const [copyState, setCopyState] = useState<CopyState>(null)

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyState({ key, status: 'copied' })
    } catch {
      setCopyState({ key, status: 'failed' })
    }
  }

  const copyAnnouncement = copyState?.status === 'copied'
    ? t('内容已复制到剪贴板。')
    : copyState?.status === 'failed'
      ? t('无法访问剪贴板，请手动复制内容。')
      : ''

  return (
    <main className="admin-workspace api-guide-workspace">
      <AdminPageHeader
        icon={BookOpen}
        eyebrow="DEVELOPER · API"
        title={t('API 使用')}
        description={t('从其他工具安全调用当前 OmniMail 实例。')}
        actions={<div className="user-header-actions">
          <a
            className="button button--secondary"
            href="https://github.com/mibgb65-cloud/OmniMail/blob/main/docs/API.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} aria-hidden="true" />{t('完整 API 文档')}
          </a>
        </div>}
      />

      <p className="sr-only" role="status" aria-live="polite">{copyAnnouncement}</p>
      {copyState?.status === 'failed' && (
        <p className="api-guide-copy-status" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />{copyAnnouncement}
        </p>
      )}

      <div className="api-guide-content">
        <section className="api-guide-overview" aria-labelledby="api-guide-overview-title">
          <div className="api-guide-overview__intro">
            <span className="api-guide-kicker"><Globe2 size={15} aria-hidden="true" />{t('当前实例')}</span>
            <h2 id="api-guide-overview-title">{t('连接一次，按账户权限访问')}</h2>
            <p>{t('OmniMail 使用设备会话令牌，不提供永久 API Key。先签发短期 Access Token，再通过 Authorization 请求头调用接口。')}</p>
          </div>
          <div className="api-base-url">
            <span>{t('API 基础地址')}</span>
            <code>{snippets.baseUrl}</code>
            <CopyButton
              copyKey="base-url"
              value={snippets.baseUrl}
              state={copyState}
              onCopy={copyValue}
            />
          </div>
          <dl className="api-token-facts">
            <div><dt>{t('认证方式')}</dt><dd>Bearer Token</dd></div>
            <div><dt>Access Token</dt><dd>{t('15 分钟')}</dd></div>
            <div><dt>Refresh Token</dt><dd>{t('30 天')}</dd></div>
          </dl>
        </section>

        <section className="api-guide-section" aria-labelledby="api-token-title">
          <header className="api-guide-section__header">
            <span className="api-step-number">01</span>
            <div>
              <p className="eyebrow">AUTHENTICATION</p>
              <h2 id="api-token-title">{t('获取设备令牌')}</h2>
              <p>{t('使用登录邮箱和密码签发令牌。令牌明文只返回一次，请立即保存到工具的加密凭据存储。')}</p>
            </div>
          </header>
          <CodeBlock
            copyKey="issue-token"
            title="POST /api/auth/token"
            code={snippets.issueToken}
            state={copyState}
            onCopy={copyValue}
          />
          <div className="api-inline-note">
            <KeyRound size={17} aria-hidden="true" />
            <p><strong>{t('启用了 MFA？')}</strong><span>{t('把 mfaCode 替换为当前验证码或恢复码；未启用 MFA 时该字段会被忽略。')}</span></p>
          </div>
          <div className="api-inline-note">
            <ShieldCheck size={17} aria-hidden="true" />
            <p><strong>{t('仅 Linux DO 登录的账户')}</strong><span>{t('设备令牌接口当前需要密码凭据；仅通过 Linux DO 创建且没有密码的账户暂时不能使用此签发流程。')}</span></p>
          </div>
        </section>

        <section className="api-guide-section" aria-labelledby="api-request-title">
          <header className="api-guide-section__header">
            <span className="api-step-number">02</span>
            <div>
              <p className="eyebrow">REQUEST</p>
              <h2 id="api-request-title">{t('调用邮件接口')}</h2>
              <p>{t('把返回的 accessToken 放入 Authorization 请求头。下面的示例读取收件箱第一页。')}</p>
            </div>
          </header>
          <div className="api-example-tabs" aria-label={t('选择代码示例')}>
            {exampleLanguages.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={language === option.id}
                onClick={() => setLanguage(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <CodeBlock
            copyKey={`request-${language}`}
            title={exampleLanguages.find((option) => option.id === language)?.label || language}
            code={snippets.examples[language]}
            state={copyState}
            onCopy={copyValue}
          />
          <div className="api-authorization-example">
            <span>Authorization</span>
            <code>Bearer om_at_...</code>
            <CopyButton
              copyKey="authorization"
              value="Authorization: Bearer om_at_..."
              state={copyState}
              onCopy={copyValue}
            />
          </div>
        </section>

        <section className="api-guide-section" aria-labelledby="api-tools-title">
          <header className="api-guide-section__header">
            <span className="api-step-number">03</span>
            <div>
              <p className="eyebrow">AUTOMATION</p>
              <h2 id="api-tools-title">{t('接入 n8n、Postman 或其他工具')}</h2>
              <p>{t('在工具的 HTTP Request 步骤中填写相同的 URL、方法和请求头；无需 OmniMail 专用插件。')}</p>
            </div>
          </header>
          <div className="api-tool-grid">
            <article>
              <span><Workflow size={18} aria-hidden="true" />n8n / Postman</span>
              <dl>
                <div><dt>{t('请求方法')}</dt><dd>GET</dd></div>
                <div><dt>URL</dt><dd><code>{snippets.baseUrl}/messages</code></dd></div>
                <div><dt>{t('认证')}</dt><dd>Bearer Token</dd></div>
                <div><dt>{t('请求头')}</dt><dd><code>Authorization: Bearer om_at_...</code></dd></div>
              </dl>
            </article>
            <article>
              <span><Braces size={18} aria-hidden="true" />{t('请求与响应')}</span>
              <ul>
                <li>{t('JSON 请求需要 Content-Type: application/json。')}</li>
                <li>{t('收到 401 时最多刷新一次；刷新失败后重新登录。')}</li>
                <li>{t('邮件分页游标必须原样传回，不能解析或修改。')}</li>
                <li>{t('发信接口仍会检查邮箱归属、账户权限和发送限速。')}</li>
              </ul>
            </article>
          </div>
          <div className="api-cors-note">
            <Globe2 size={18} aria-hidden="true" />
            <p><strong>{t('浏览器跨域调用')}</strong><span>{t('命令行和服务端工具可以直接请求。其他网页前端必须先把精确来源加入 Worker 的 APP_ORIGINS。')}</span></p>
          </div>
        </section>

        <section className="api-guide-section" aria-labelledby="api-lifecycle-title">
          <header className="api-guide-section__header">
            <span className="api-step-number">04</span>
            <div>
              <p className="eyebrow">TOKEN LIFECYCLE</p>
              <h2 id="api-lifecycle-title">{t('刷新与撤销令牌')}</h2>
              <p>{t('刷新会同时轮换两个令牌。工具必须原子替换保存的 Refresh Token，退出时再主动撤销。')}</p>
            </div>
          </header>
          <div className="api-lifecycle-grid">
            <article>
              <header><RefreshCw size={17} aria-hidden="true" /><span><strong>{t('刷新令牌')}</strong><small>{t('Access Token 过期后调用')}</small></span></header>
              <CodeBlock
                copyKey="refresh-token"
                title="POST /api/auth/token/refresh"
                code={snippets.refreshToken}
                state={copyState}
                onCopy={copyValue}
              />
            </article>
            <article>
              <header><ShieldCheck size={17} aria-hidden="true" /><span><strong>{t('撤销令牌')}</strong><small>{t('停用集成或退出时调用')}</small></span></header>
              <CodeBlock
                copyKey="revoke-token"
                title="POST /api/auth/token/revoke"
                code={snippets.revokeToken}
                state={copyState}
                onCopy={copyValue}
              />
            </article>
          </div>
        </section>

        <section className="api-guide-section api-guide-section--security" aria-labelledby="api-security-title">
          <header className="api-guide-section__header">
            <span className="api-step-number"><Clock3 size={18} aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">SECURITY</p>
              <h2 id="api-security-title">{t('令牌与凭据安全')}</h2>
              <p>{t('调用完整接口目录前，请先确认自动化工具能够安全保存和轮换凭据。')}</p>
            </div>
          </header>
          <div className="api-security-note">
            <Clock3 size={18} aria-hidden="true" />
            <p><strong>{t('不要把令牌写入日志或普通配置文件')}</strong><span>{t('Access Token 只保存在运行内存；Refresh Token 应放入系统或自动化平台提供的加密凭据存储。')}</span></p>
          </div>
        </section>

        <ApiEndpointCatalog
          baseUrl={snippets.baseUrl}
          copyState={copyState}
          onCopy={copyValue}
        />
      </div>
    </main>
  )
}
