'use client';

import { OfflineQueueItem } from './types';

const DB_NAME = 'cloud9_task_timer_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'action_queue';

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflineAction(
  action: OfflineQueueItem['action'],
  payload: Record<string, unknown>
): Promise<OfflineQueueItem> {
  const item: OfflineQueueItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    action,
    payload,
    createdAt: new Date().toISOString(),
  };

  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  window.dispatchEvent(new CustomEvent('c9-offline-queue-changed'));
  return item;
}

export async function getOfflineQueueItems(): Promise<OfflineQueueItem[]> {
  try {
    const db = await openQueueDb();
    return await new Promise<OfflineQueueItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const list = (req.result as OfflineQueueItem[]) || [];
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function clearOfflineQueueItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const id of ids) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    window.dispatchEvent(new CustomEvent('c9-offline-queue-changed'));
  } catch {
    // ignore
  }
}
