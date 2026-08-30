import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generatedAliasAddress,
  ICloudClient,
  ICloudRemoteError,
  parseICloudAliases,
} from './icloud-apple'

afterEach(() => vi.restoreAllMocks())

function validationResponse(): Response {
  return Response.json({
    webservices: { premiummailsettings: { url: 'https://p71-maildomainws.icloud.com' } },
    dsInfo: { dsid: '123', appleId: 'person@icloud.com' },
  })
}

function chinaValidationResponse(): Response {
  return Response.json({
    webservices: { premiummailsettings: { url: 'https://p71-maildomainws.icloud.com.cn' } },
    dsInfo: { dsid: '456', appleId: 'person@icloud.com' },
  })
}

describe('iCloud Hide My Email response parsing', () => {
  it('normalizes aliases and sorts active entries first', () => {
    expect(parseICloudAliases({ result: { hmeEmails: [
      { hme: 'OFF@icloud.com', anonymousId: '2', label: 'Old', state: 'inactive' },
      { hme: 'Shop@icloud.com', anonymousId: '1', metaData: { label: 'Shop' } },
    ] } })).toEqual([
      expect.objectContaining({ email: 'shop@icloud.com', label: 'Shop', active: true }),
      expect.objectContaining({ email: 'off@icloud.com', label: 'Old', active: false }),
    ])
  })

  it('ignores malformed entries', () => {
    expect(parseICloudAliases({ result: { hmeEmails: [{ label: 'missing' }] } }))
      .toEqual([])
  })

  it('reads generated addresses from current and legacy response shapes', () => {
    expect(generatedAliasAddress({ hme: 'Current@icloud.com' }))
      .toBe('current@icloud.com')
    expect(generatedAliasAddress({ hme: { hme: 'Legacy@icloud.com' } }))
      .toBe('legacy@icloud.com')
  })

  it('reserves an address returned as result.hme', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(validationResponse())
      .mockResolvedValueOnce(Response.json({
        success: true,
        result: { hme: 'alias@icloud.com' },
      }))
      .mockResolvedValueOnce(Response.json({
        success: true,
        result: { hme: { hme: 'alias@icloud.com', anonymousId: 'alias-id' } },
      }))

    await expect(new ICloudClient({ session: 'value' }, 'icloud.com').createAlias('Shop'))
      .resolves.toMatchObject({ email: 'alias@icloud.com', label: 'Shop' })
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)))
      .toMatchObject({ hme: 'alias@icloud.com', label: 'Shop' })
  })

  it('generates a preview without reserving the address', async () => {
    const previewId = '00000000-0000-4000-8000-000000000001'
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(validationResponse())
      .mockResolvedValueOnce(Response.json({
        success: true,
        result: { hme: 'preview@icloud.com' },
      }))

    const client = new ICloudClient({ session: 'value' }, 'icloud.com', previewId)
    await expect(client.generateAlias())
      .resolves.toBe('preview@icloud.com')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/v1/hme/generate')
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes(`clientId=${previewId}`)))
      .toBe(true)
  })

  it('uses current China region endpoints for the complete alias creation flow', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(chinaValidationResponse())
      .mockResolvedValueOnce(Response.json({
        success: true,
        result: { hme: 'china-preview@icloud.com' },
      }))
      .mockResolvedValueOnce(Response.json({
        success: true,
        result: { hme: { hme: 'china-preview@icloud.com' } },
      }))

    await expect(new ICloudClient({ session: 'value' }, 'icloud.com.cn').createAlias('China'))
      .resolves.toMatchObject({ email: 'china-preview@icloud.com', label: 'China' })
    const requests = fetchMock.mock.calls.map(([input, init]) => ({
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
    }))
    expect(requests[0].url.origin).toBe('https://setup.icloud.com.cn')
    expect(requests.slice(1).every(({ url }) => url.hostname.endsWith('.icloud.com.cn')))
      .toBe(true)
    expect(requests.every(({ url }) => (
      url.searchParams.get('clientBuildNumber') === '2630Build35'
      && url.searchParams.get('clientMasteringNumber') === '2630Build35'
    ))).toBe(true)
    expect(requests.every(({ headers }) => (
      headers.get('Origin') === 'https://www.icloud.com.cn'
      && headers.get('Referer') === 'https://www.icloud.com.cn/'
    ))).toBe(true)
  })

  it('rejects an invalid preview address before contacting Apple', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(new ICloudClient({ session: 'value' }, 'icloud.com')
      .reserveAlias('attacker@example.com', 'Shop'))
      .rejects.toMatchObject({ status: 400, message: '隐藏邮箱地址无效。' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries a read request after a transient Apple failure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(validationResponse())
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ result: { hmeEmails: [] } }))

    await expect(new ICloudClient({ session: 'value' }, 'icloud.com').listAliases())
      .resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('never retries an alias reservation request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(validationResponse())
      .mockResolvedValueOnce(Response.json({
        success: true,
        result: { hme: { hme: 'alias@icloud.com' } },
      }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))

    await expect(new ICloudClient({ session: 'value' }, 'icloud.com').createAlias('Shop'))
      .rejects.toBeInstanceOf(ICloudRemoteError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('maps request timeouts without exposing transport details', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('internal transport details', 'TimeoutError'),
    )

    await expect(new ICloudClient({ session: 'value' }, 'icloud.com').validate())
      .rejects.toMatchObject({ status: 504, message: '连接 iCloud 超时。' })
  })
  it('does not expose Apple credential failures as OmniMail session 401s', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 403 }))

    await expect(new ICloudClient({ session: 'value' }, 'icloud.com').validate())
      .rejects.toMatchObject({ status: 422 })
  })
})
