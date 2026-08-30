import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { needsLegacyBootstrap, pendingMigrationNames } from './migration-plan.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const wranglerCli = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const mode = process.argv[2]
const persistTo = process.env.OMNIMAIL_D1_PERSIST_TO?.trim()

if (mode !== '--remote' && mode !== '--local') {
  throw new Error('Usage: node scripts/apply-d1-migrations.mjs --remote|--local')
}

function runWrangler(args, capture = false) {
  const result = spawnSync(process.execPath, [wranglerCli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr)
    throw new Error(result.stderr?.trim() || `Wrangler exited with code ${result.status}`)
  }
  return result.stdout
}

function localPersistenceArgs() {
  return mode === '--local' && persistTo ? ['--persist-to', persistTo] : []
}

function migrationNames() {
  return readdirSync(join(root, 'migrations'))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
}

function appliedMigrationNames() {
  const output = runWrangler([
    'd1', 'execute', 'DB', '--remote',
    '--command', 'SELECT name FROM d1_migrations ORDER BY name',
    '--json',
  ], true)
  const response = JSON.parse(output)
  return new Set(response[0]?.results?.map(({ name }) => name) ?? [])
}

function currentRemoteMigrations() {
  try {
    return appliedMigrationNames()
  } catch (error) {
    if (error instanceof Error && /no such table:\s*d1_migrations/i.test(error.message)) {
      return null
    }
    throw error
  }
}

function migrationImport(names) {
  return names.map((name) => {
    const sql = readFileSync(join(root, 'migrations', name), 'utf8').trimEnd()
    const escapedName = name.replaceAll("'", "''")
    return `${sql}\nINSERT INTO d1_migrations (name) VALUES ('${escapedName}');`
  }).join('\n\n') + '\n'
}

if (mode === '--local') {
  runWrangler([
    'd1', 'execute', 'DB', '--local',
    ...localPersistenceArgs(),
    '--file', 'scripts/bootstrap-legacy-d1.sql',
  ])
  runWrangler(['d1', 'migrations', 'apply', 'DB', '--local', ...localPersistenceArgs()])
} else {
  let applied = currentRemoteMigrations()
  if (needsLegacyBootstrap(applied)) {
    runWrangler([
      'd1', 'execute', 'DB', '--remote',
      '--file', 'scripts/bootstrap-legacy-d1.sql',
    ])
    applied = appliedMigrationNames()
  }
  const pending = pendingMigrationNames(migrationNames(), applied)
  if (pending.length === 0) {
    console.log('✅ No migrations to apply!')
  } else {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'omnimail-d1-'))
    const importPath = join(temporaryDirectory, 'migrations.sql')
    try {
      writeFileSync(importPath, migrationImport(pending), 'utf8')
      runWrangler(['d1', 'execute', 'DB', '--remote', '--file', importPath])
      const completed = appliedMigrationNames()
      const missing = pending.filter((name) => !completed.has(name))
      if (missing.length > 0) {
        throw new Error(`D1 migrations were not recorded: ${missing.join(', ')}`)
      }
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true })
    }
  }
}
