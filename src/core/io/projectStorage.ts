// ============================================================
// Project Storage - IndexedDB persistence
// ============================================================

import type { SceneDocument } from "../document/types";

const DB_NAME = "multiview-editor";
const DB_VERSION = 2;
const PROJECT_STORE_NAME = "projects";
const KNOWN_FILE_STORE_NAME = "knownProjectFiles";
const AUTOSAVE_KEY = "__autosave__";

interface StoredProject {
  key: string;
  document: SceneDocument;
  savedAt: string;
  name: string;
  previewDataUrl?: string | null;
}

interface StoredKnownProjectFile {
  id: string;
  name: string;
  handle: FileSystemFileHandle;
  createdAt: string;
  lastOpenedAt: string;
  previewDataUrl?: string | null;
}

export interface SaveProjectOptions {
  key?: string;
  previewDataUrl?: string | null;
}

export interface ProjectListItem {
  key: string;
  name: string;
  savedAt: string;
  previewDataUrl?: string | null;
}

export interface KnownProjectFileListItem {
  id: string;
  name: string;
  createdAt: string;
  lastOpenedAt: string;
  previewDataUrl?: string | null;
}

export interface KnownProjectFileMeta {
  name?: string;
  lastOpenedAt?: string;
  previewDataUrl?: string | null;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        db.createObjectStore(PROJECT_STORE_NAME, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(KNOWN_FILE_STORE_NAME)) {
        db.createObjectStore(KNOWN_FILE_STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function normalizeSaveOptions(options?: SaveProjectOptions | string): SaveProjectOptions {
  if (typeof options === "string") {
    return { key: options };
  }
  return options ?? {};
}

function createKnownFileId(): string {
  return `known_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureReadPermission(handle: FileSystemFileHandle): Promise<void> {
  const queryPermission = (handle as any).queryPermission as
    | ((descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>)
    | undefined;
  const requestPermission = (handle as any).requestPermission as
    | ((descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>)
    | undefined;

  if (queryPermission) {
    const status = await queryPermission({ mode: "read" });
    if (status === "granted") return;
  }

  if (requestPermission) {
    const status = await requestPermission({ mode: "read" });
    if (status === "granted") return;
  }

  throw new Error("File permission was not granted.");
}

// Save

export async function saveProject(
  doc: SceneDocument,
  options?: SaveProjectOptions | string
): Promise<string> {
  const db = await openDB();
  const normalized = normalizeSaveOptions(options);
  const projectKey = normalized.key || `project_${Date.now()}`;

  const record: StoredProject = {
    key: projectKey,
    document: doc,
    savedAt: new Date().toISOString(),
    name: doc.projectName,
    previewDataUrl: normalized.previewDataUrl ?? null,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE_NAME, "readwrite");
    const store = tx.objectStore(PROJECT_STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve(projectKey);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// Load

export async function loadProject(key: string): Promise<SceneDocument | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE_NAME, "readonly");
    const store = tx.objectStore(PROJECT_STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => {
      const record = req.result as StoredProject | undefined;
      resolve(record?.document ?? null);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// List projects

export async function listProjects(): Promise<ProjectListItem[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE_NAME, "readonly");
    const store = tx.objectStore(PROJECT_STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result as StoredProject[])
        .filter((r) => r.key !== AUTOSAVE_KEY)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map((r) => ({
          key: r.key,
          name: r.name,
          savedAt: r.savedAt,
          previewDataUrl: r.previewDataUrl ?? null,
        }));
      resolve(records);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// Delete

export async function deleteProject(key: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE_NAME, "readwrite");
    const store = tx.objectStore(PROJECT_STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// Legacy autosave helpers (currently not used)

export async function autoSave(doc: SceneDocument): Promise<void> {
  await saveProject(doc, { key: AUTOSAVE_KEY });
}

export async function loadAutoSave(): Promise<SceneDocument | null> {
  return loadProject(AUTOSAVE_KEY);
}

// Known file handles

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === "undefined") return false;
  const maybeWindow = window as Window & { showOpenFilePicker?: unknown };
  return typeof maybeWindow.showOpenFilePicker === "function";
}

export async function listKnownProjectFiles(): Promise<KnownProjectFileListItem[]> {
  if (!isFileSystemAccessSupported()) return [];

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KNOWN_FILE_STORE_NAME, "readonly");
    const store = tx.objectStore(KNOWN_FILE_STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result as StoredKnownProjectFile[])
        .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
        .map((record) => ({
          id: record.id,
          name: record.name,
          createdAt: record.createdAt,
          lastOpenedAt: record.lastOpenedAt,
          previewDataUrl: record.previewDataUrl ?? null,
        }));
      resolve(records);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function rememberKnownProjectFile(
  handle: FileSystemFileHandle,
  meta?: KnownProjectFileMeta
): Promise<string> {
  if (!isFileSystemAccessSupported()) {
    throw new Error("File System Access API is not supported in this browser.");
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KNOWN_FILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(KNOWN_FILE_STORE_NAME);
    const readReq = store.getAll();

    readReq.onerror = () => reject(readReq.error);
    readReq.onsuccess = () => {
      const nowIso = new Date().toISOString();
      const existing = (readReq.result as StoredKnownProjectFile[]).find(
        (item) => item.name === handle.name
      );
      const id = existing?.id ?? createKnownFileId();

      const record: StoredKnownProjectFile = {
        id,
        name: meta?.name ?? existing?.name ?? handle.name,
        handle,
        createdAt: existing?.createdAt ?? nowIso,
        lastOpenedAt: meta?.lastOpenedAt ?? nowIso,
        previewDataUrl: meta?.previewDataUrl ?? existing?.previewDataUrl ?? null,
      };

      const writeReq = store.put(record);
      writeReq.onsuccess = () => resolve(id);
      writeReq.onerror = () => reject(writeReq.error);
    };

    tx.oncomplete = () => db.close();
  });
}

export async function loadKnownProjectFile(
  id: string
): Promise<{ file: File; id: string }> {
  if (!isFileSystemAccessSupported()) {
    throw new Error("File System Access API is not supported in this browser.");
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KNOWN_FILE_STORE_NAME, "readonly");
    const store = tx.objectStore(KNOWN_FILE_STORE_NAME);
    const req = store.get(id);
    req.onsuccess = async () => {
      const record = req.result as StoredKnownProjectFile | undefined;
      if (!record) {
        reject(new Error("Known project file not found."));
        return;
      }
      try {
        await ensureReadPermission(record.handle);
        const file = await record.handle.getFile();
        resolve({ file, id });
      } catch (error) {
        reject(error);
      }
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function updateKnownProjectFileMeta(
  id: string,
  meta: KnownProjectFileMeta
): Promise<void> {
  if (!isFileSystemAccessSupported()) return;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KNOWN_FILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(KNOWN_FILE_STORE_NAME);
    const readReq = store.get(id);

    readReq.onerror = () => reject(readReq.error);
    readReq.onsuccess = () => {
      const existing = readReq.result as StoredKnownProjectFile | undefined;
      if (!existing) {
        resolve();
        return;
      }

      const updated: StoredKnownProjectFile = {
        ...existing,
        name: meta.name ?? existing.name,
        lastOpenedAt: meta.lastOpenedAt ?? existing.lastOpenedAt,
        previewDataUrl:
          meta.previewDataUrl === undefined
            ? existing.previewDataUrl ?? null
            : meta.previewDataUrl,
      };

      const writeReq = store.put(updated);
      writeReq.onsuccess = () => resolve();
      writeReq.onerror = () => reject(writeReq.error);
    };

    tx.oncomplete = () => db.close();
  });
}

export async function deleteKnownProjectFile(id: string): Promise<void> {
  if (!isFileSystemAccessSupported()) return;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KNOWN_FILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(KNOWN_FILE_STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// Export as JSON file

export function exportAsJSON(doc: SceneDocument): void {
  const json = JSON.stringify(doc, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.projectName.replace(/\s+/g, "_")}.multiview.json`;
  a.click();

  URL.revokeObjectURL(url);
}

// Import from JSON file

export async function importFromJSON(file: File): Promise<SceneDocument> {
  const text = await file.text();
  const doc = JSON.parse(text) as SceneDocument;

  if (!doc.version || !doc.nodes || !doc.rootIds) {
    throw new Error("Invalid project file format");
  }

  return doc;
}
