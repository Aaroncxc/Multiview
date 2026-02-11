// ============================================================
// Project Storage — IndexedDB persistence
// Apple HIG: Auto-save, recent files, reliable persistence
// ============================================================

import type { SceneDocument } from "../document/types";

const DB_NAME = "multiview-editor";
const DB_VERSION = 1;
const STORE_NAME = "projects";
const AUTOSAVE_KEY = "__autosave__";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface StoredProject {
  key: string;
  document: SceneDocument;
  savedAt: string;
  name: string;
}

// ── Save ──

export async function saveProject(
  doc: SceneDocument,
  key?: string
): Promise<string> {
  const db = await openDB();
  const projectKey = key || `project_${Date.now()}`;

  const record: StoredProject = {
    key: projectKey,
    document: doc,
    savedAt: new Date().toISOString(),
    name: doc.projectName,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve(projectKey);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ── Load ──

export async function loadProject(key: string): Promise<SceneDocument | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => {
      const record = req.result as StoredProject | undefined;
      resolve(record?.document ?? null);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ── List Projects ──

export interface ProjectListItem {
  key: string;
  name: string;
  savedAt: string;
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result as StoredProject[])
        .filter((r) => r.key !== AUTOSAVE_KEY)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map((r) => ({
          key: r.key,
          name: r.name,
          savedAt: r.savedAt,
        }));
      resolve(records);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ── Delete ──

export async function deleteProject(key: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ── Autosave ──

export async function autoSave(doc: SceneDocument): Promise<void> {
  await saveProject(doc, AUTOSAVE_KEY);
}

export async function loadAutoSave(): Promise<SceneDocument | null> {
  return loadProject(AUTOSAVE_KEY);
}

// ── Export as JSON file ──

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

// ── Import from JSON file ──

export async function importFromJSON(file: File): Promise<SceneDocument> {
  const text = await file.text();
  const doc = JSON.parse(text) as SceneDocument;

  // Basic validation
  if (!doc.version || !doc.nodes || !doc.rootIds) {
    throw new Error("Invalid project file format");
  }

  return doc;
}
