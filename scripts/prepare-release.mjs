import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const [tag] = process.argv.slice(2)
const match = /^v(\d+\.\d+\.\d+)$/.exec(tag || '')

if (!match) {
  throw new Error('Usage: node scripts/prepare-release.mjs vX.Y.Z')
}

const version = match[1]
const packageMetadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const packageLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const versions = {
  'package.json': packageMetadata.version,
  'package-lock.json': packageLock.version,
  'package-lock root package': packageLock.packages?.['']?.version,
}

for (const [source, actual] of Object.entries(versions)) {
  if (actual !== version) {
    throw new Error(`${source} version ${actual} does not match tag ${tag}`)
  }
}

const notesPath = join(root, 'docs', 'releases', 'web', `${tag}.md`)
let notes = ''
try {
  notes = readFileSync(notesPath, 'utf8').trim()
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    throw new Error(`Release notes file is missing: docs/releases/web/${tag}.md`)
  }
  throw error
}
if (!notes) throw new Error(`Release notes file is empty: docs/releases/web/${tag}.md`)

console.log(`Verified release metadata for ${tag}: ${relative(root, notesPath)}`)
