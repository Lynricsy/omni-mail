import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const limit = 600
const frontendImplementationLimit = 500
const ignoredDirectories = new Set([
  '.git',
  '.wrangler',
  'build',
  'dist',
  'dist-extension',
  'node_modules',
  'playwright-report',
  'test-results',
])
const ignoredFiles = new Set(['package-lock.json'])
const codeExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.jsonc',
  '.mjs',
  '.scss',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
])

function codeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : codeFiles(join(directory, entry.name))
    }
    if (ignoredFiles.has(entry.name) || !codeExtensions.has(extname(entry.name))) return []
    return [join(directory, entry.name)]
  })
}

function lineCount(filename) {
  const source = readFileSync(filename, 'utf8')
  if (!source) return 0
  return source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0)
}

const files = codeFiles(root)
const oversized = files
  .map((filename) => {
    const path = relative(root, filename).replaceAll('\\', '/')
    const frontendImplementation = /^(src|extension\/src)\/.*\.tsx?$/.test(path)
      && !/^src\/shared\/i18n\/messages\/en\/[^/]+\.ts$/.test(path)
    return {
      filename,
      lines: lineCount(filename),
      limit: frontendImplementation ? frontendImplementationLimit : limit,
    }
  })
  .filter(({ lines, limit: fileLimit }) => lines > fileLimit)
  .sort((left, right) => right.lines - left.lines)

if (oversized.length) {
  console.error('Code files exceed their configured line limits:')
  for (const { filename, lines, limit: fileLimit } of oversized) {
    console.error(`- ${relative(root, filename)}: ${lines} (limit ${fileLimit})`)
  }
  process.exitCode = 1
} else {
  console.log(
    `File line limit passed (${files.length} files; frontend implementations ${frontendImplementationLimit}, others ${limit}).`,
  )
}
