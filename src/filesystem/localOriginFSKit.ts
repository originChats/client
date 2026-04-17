import { IDX, parsePathComponents, OriginFSBase } from "./origin-fs-base";

const DB_NAME = "localOriginFS";
const DB_VERSION = 1;
const STORE_NAME = "files";

import { openDB } from "./fsCommon";

function openDBWrapper(): Promise<IDBDatabase> {
  return openDB(DB_NAME, DB_VERSION, STORE_NAME);
}

export class LocalOriginFSClass extends OriginFSBase {
  username = "local";

  async loadIndex(): Promise<void> {
    if (this.loaded) {
      return;
    }
    const db = await openDBWrapper();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const files = req.result as Array<{ path: string; entry: any }>;
        for (const file of files) {
          const path = file.path.toLowerCase();
          const uuid = file.entry[IDX.UUID];
          this.index[path] = uuid;
          this.entries[uuid] = file.entry;
        }
        this.loaded = true;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async writeEntry(path: string, entry: any, op: "put" | "delete" = "put"): Promise<void> {
    const db = await openDBWrapper();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      if (op === "put") {
        store.put({ path: path.toLowerCase(), entry });
      } else {
        store.delete(path.toLowerCase());
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async writeFile(path: string, data: string): Promise<void> {
    await this.loadIndex();
    const now = Date.now();
    const uuid = this.index[path.toLowerCase()];
    if (!uuid) {
      throw new Error("create via createFile");
    }
    const entry = this.entries[uuid];
    entry[IDX.DATA] = data;
    entry[IDX.EDITED] = now;
    entry[IDX.SIZE] = data.length;
    this.entries[uuid] = entry;
    await this.writeEntry(path, entry);
  }

  async remove(path: string): Promise<void> {
    path = path.toLowerCase();
    await this.loadIndex();
    const uuid = this.index[path];
    if (!uuid) {
      throw new Error("not found");
    }
    delete this.index[path];
    delete this.entries[uuid];
    await this.writeEntry(path, null, "delete");
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.loadIndex();
    const uuid = this.index[oldPath.toLowerCase()];
    if (!uuid) {
      throw new Error("not found");
    }
    const entry = this.entries[uuid];
    const { dir, name, ext } = parsePathComponents(newPath);
    const now = Date.now();
    entry[IDX.TYPE] = ext;
    entry[IDX.NAME] = name;
    entry[IDX.LOCATION] = `origin/(c) users/${this.username}/${dir.replace(/^\/|\/$/g, "")}`;
    entry[IDX.EDITED] = now;
    this.entries[uuid] = entry;
    delete this.index[oldPath.toLowerCase()];
    this.index[newPath.toLowerCase()] = uuid;
    await this.writeEntry(oldPath, null, "delete");
    await this.writeEntry(newPath, entry);
  }

  async statUUID(uuid: string): Promise<any> {
    await this.loadIndex();
    const entry = this.entries[uuid];
    if (!entry) {
      throw new Error("not found");
    }
    return this.cloneEntry(entry);
  }

  async commit(): Promise<void> {
    // Local storage commits immediately on each write
    // This is a no‑op for compatibility with OriginFSClientClass
  }
}

(window as any).LocalOriginFS = { LocalOriginFSClass, IDX };
