import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts', 'prepare-release.mjs')
const packageMetadata = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as { version: string }
const releaseTag = `v${packageMetadata.version}`

function prepare(tag: string) {
  return spawnSync(process.execPath, [script, tag], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

describe('release metadata preparation', () => {
  it('validates the matching versioned release notes file', () => {
    const result = prepare(releaseTag)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`${releaseTag}.md`)
    const notes = readFileSync(
      join(process.cwd(), 'docs', 'releases', 'web', `${releaseTag}.md`),
      'utf8',
    )
    expect(notes).toContain('### 更新摘要')
    expect(notes).toContain('### 升级说明')
    expect(notes).toContain('### 测试')
    expect(notes).toContain('### 发布')
    expect(notes).toContain(`Web 版本为 \`${packageMetadata.version}\``)
  })

  it('rejects a tag that does not match package metadata', () => {
    const result = prepare('v999.999.999')

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('does not match tag v999.999.999')
  })
})
