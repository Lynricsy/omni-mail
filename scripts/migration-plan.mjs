export const LEGACY_RECOVERY_BOUNDARY = '0018_schema_baseline_and_message_indexes.sql'

export function needsLegacyBootstrap(appliedMigrations) {
  return appliedMigrations === null
    || !appliedMigrations.has(LEGACY_RECOVERY_BOUNDARY)
}

export function pendingMigrationNames(availableMigrations, appliedMigrations) {
  return availableMigrations.filter((name) => !appliedMigrations.has(name))
}
