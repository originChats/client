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

  private transactionPromise<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.init().then(() => {
        const transaction = this.db!.transaction([this.storageName], mode);
        const store = transaction.objectStore(this.storageName);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
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
    const existing = await this.transactionPromise<NoteMessage | undefined>("readwrite", (store) =>
      store.get(key)
    );
    if (existing) {
      const updated: NoteMessage = { ...existing, content, edited: true };
      await this.transactionPromise<any>("readwrite", (store) => store.put(updated));
    }
  }

  async deleteMessage(key: string): Promise<void> {
    await this.transactionPromise<undefined>("readwrite", (store) => store.delete(key));
  }

  async getAllMessages(): Promise<NoteMessage[]> {
    const msgs =
      (await this.transactionPromise<NoteMessage[]>("readonly", (store) => store.getAll())) || [];
    msgs.sort((a, b) => a.timestamp - b.timestamp);
    return msgs;
  }

  async clearMessages(): Promise<void> {
    await this.transactionPromise<undefined>("readwrite", (store) => store.clear());
  }
}

export const notesChannel = new NotesChannel();
