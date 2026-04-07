interface NoteMessage {
  key: string;
  content: string;
  user: string;
  timestamp: number;
  edited?: boolean;
  _isNew?: boolean;
}

class NotesChannel {
  private db: IDBDatabase | null = null;
  private initialised = false;
  private readonly messagesKey = "notes_messages";
  private readonly storageName = "notes_channel_data";

  async init(): Promise<void> {
    if (this.initialised) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("originChats_notes", 1);

      request.onerror = () => {
        console.error("Error opening notes database", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialised = true;
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storageName)) {
          db.createObjectStore(this.storageName, { keyPath: "key" });
        }
      };
    });
  }

  async saveMessage(content: string, user = "you"): Promise<NoteMessage> {
    await this.init();
    const transaction = this.db!.transaction([this.storageName], "readwrite");
    const store = transaction.objectStore(this.storageName);
    const timestamp = Math.floor(Date.now() / 1000);
    const msg: NoteMessage = {
      key: `msg_${Date.now()}`,
      content,
      user,
      timestamp,
      _isNew: true,
    };
    store.put(msg);
    return msg;
  }

  async editMessage(key: string, content: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storageName], "readwrite");
      const store = transaction.objectStore(this.storageName);
      const getRequest = store.get(key);
      getRequest.onsuccess = () => {
        const existing = getRequest.result as NoteMessage | undefined;
        if (!existing) {
          resolve();
          return;
        }
        const updated: NoteMessage = { ...existing, content, edited: true };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteMessage(key: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storageName], "readwrite");
      const store = transaction.objectStore(this.storageName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllMessages(): Promise<NoteMessage[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storageName], "readonly");
      const store = transaction.objectStore(this.storageName);
      const request = store.getAll();
      request.onsuccess = () => {
        const msgs = request.result || [];
        msgs.sort((a, b) => a.timestamp - b.timestamp);
        resolve(msgs);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearMessages(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storageName], "readwrite");
      const store = transaction.objectStore(this.storageName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const notesChannel = new NotesChannel();
