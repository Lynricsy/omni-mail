export function quoteImapValue(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('IMAP 登录信息包含无效字符。')
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384))
  }
  return btoa(binary)
}

export function encodeXOAuth2(username: string, accessToken: string): string {
  if (!username || !accessToken || /[\x00-\x1F\x7F]/.test(username + accessToken)) {
    throw new Error('IMAP OAuth2 登录信息包含无效字符。')
  }
  return base64Utf8(`user=${username}\x01auth=Bearer ${accessToken}\x01\x01`)
}
