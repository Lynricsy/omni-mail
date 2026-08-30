export type ApiExampleLanguage = 'curl' | 'javascript' | 'python'

export type ApiGuideSnippets = {
  baseUrl: string
  issueToken: string
  examples: Record<ApiExampleLanguage, string>
  refreshToken: string
  revokeToken: string
}

export function apiGuideSnippets(instanceUrl: string): ApiGuideSnippets {
  const origin = instanceUrl.replace(/\/+$/, '')
  const baseUrl = `${origin}/api`

  return {
    baseUrl,
    issueToken: `curl --request POST \\
  --url "${baseUrl}/auth/token" \\
  --header "Content-Type: application/json" \\
  --data '{
    "email": "user@example.com",
    "password": "your-password",
    "deviceName": "My automation",
    "mfaCode": "123456"
  }'`,
    examples: {
      curl: `curl --request GET \\
  --url "${baseUrl}/messages?folder=inbox&limit=30" \\
  --header "Authorization: Bearer om_at_..."`,
      javascript: `const response = await fetch(
  '${baseUrl}/messages?folder=inbox&limit=30',
  {
    headers: { Authorization: 'Bearer om_at_...' },
  },
)

if (!response.ok) throw new Error(\`Request failed: \${response.status}\`)
const { messages } = await response.json()`,
      python: `import requests

response = requests.get(
    "${baseUrl}/messages",
    params={"folder": "inbox", "limit": 30},
    headers={"Authorization": "Bearer om_at_..."},
    timeout=30,
)
response.raise_for_status()
messages = response.json()["messages"]`,
    },
    refreshToken: `curl --request POST \\
  --url "${baseUrl}/auth/token/refresh" \\
  --header "Content-Type: application/json" \\
  --data '{"refreshToken":"om_rt_..."}'`,
    revokeToken: `curl --request POST \\
  --url "${baseUrl}/auth/token/revoke" \\
  --header "Content-Type: application/json" \\
  --data '{"refreshToken":"om_rt_..."}'`,
  }
}
