import type { User } from '../../src/shared/api/api-types'

const DATABASE_NAME = 'omnimail-float'
const DATABASE_VERSION = 1
const AUTH_STORE = 'auth'
const AUTH_KEY = 'current'

export interface PersistentAuth {
  refreshToken: string
  refreshExpiresAt: number
  scopes: string[]
  user: User
}

let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(AUTH_STORE)) {
        request.result.createObjectStore(AUTH_STORE)
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = null
      }
      resolve(database)
    }
    request.onerror = () => reject(request.error)
  })
  return databasePromise
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function loadPersistentAuth(): Promise<PersistentAuth | null> {
  const database = await openDatabase()
  const transaction = database.transaction(AUTH_STORE, 'readonly')
  const done = transactionDone(transaction)
  const request = transaction.objectStore(AUTH_STORE).get(AUTH_KEY)
  const auth = await new Promise<PersistentAuth | null>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
  await done
  return auth
}

export async function savePersistentAuth(auth: PersistentAuth): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(AUTH_STORE, 'readwrite')
  transaction.objectStore(AUTH_STORE).put(auth, AUTH_KEY)
  await transactionDone(transaction)
}

export async function clearPersistentAuth(): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(AUTH_STORE, 'readwrite')
  transaction.objectStore(AUTH_STORE).delete(AUTH_KEY)
  await transactionDone(transaction)
}
