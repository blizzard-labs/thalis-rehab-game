import type { PracticeRecord } from "./session";

const legacyProfileKey = "neuroreach-eeg-profile";
const ownerKey = "current";

export class GuestChanged extends Error {}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("neuroreach-practice", 2);
    let migrated = false;
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("rounds"))
        db.createObjectStore("rounds", { keyPath: "id" });
      let previousProfile: string | null = null;
      try {
        previousProfile = localStorage.getItem(legacyProfileKey);
      } catch {
        // History can still work when localStorage is restricted.
      }
      db.createObjectStore("guest").put(
        previousProfile || crypto.randomUUID(),
        ownerKey,
      );
      migrated = !!previousProfile;
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      if (migrated) {
        try {
          localStorage.removeItem(legacyProfileKey);
        } catch {
          // The upgraded app exclusively uses the identity in IndexedDB.
        }
      }
      open.result.onversionchange = () => open.result.close();
      resolve(open.result);
    };
  });
}

async function withGuest<T>(
  expected: string | undefined,
  mode: IDBTransactionMode,
  operation: (tx: IDBTransaction, current: string) => IDBRequest<T> | T,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["rounds", "guest"], mode);
    const owner = tx.objectStore("guest").get(ownerKey);
    let result: T | IDBRequest<T>;
    let error: Error | undefined;
    owner.onsuccess = () => {
      const current = owner.result;
      if (!current || (expected !== undefined && current !== expected)) {
        error = new GuestChanged("This guest’s turn has ended.");
        tx.abort();
        return;
      }
      result = operation(tx, current);
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result instanceof IDBRequest ? result.result : result);
    };
    tx.onabort = () => {
      db.close();
      reject(error ?? tx.error);
    };
  });
}

export const currentGuest = (expected?: string) =>
  withGuest(expected, "readonly", (_, id) => id);
export const guestRecords = (id: string) =>
  withGuest<PracticeRecord[]>(id, "readonly", (tx) =>
    tx.objectStore("rounds").getAll(),
  );
export const saveGuestRecord = (id: string, record: PracticeRecord) =>
  withGuest(id, "readwrite", (tx) => tx.objectStore("rounds").put(record));
export const clearGuestRecords = (id: string) =>
  withGuest(id, "readwrite", (tx) => tx.objectStore("rounds").clear());

export function nextGuest(id: string) {
  // Old windows can no longer save or clear records after this transaction commits.
  return withGuest(id, "readwrite", (tx) => {
    const next = crypto.randomUUID();
    tx.objectStore("rounds").clear();
    tx.objectStore("guest").put(next, ownerKey);
    return next;
  });
}
