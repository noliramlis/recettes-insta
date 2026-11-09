// Stockage local (IndexedDB) : une fiche par post, clé = code Instagram du post.
const DB_NAME = 'recettes-insta';
const DB_VERSION = 1;
const STORE = 'recipes';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'code' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { _dbPromise = null; reject(req.error); };
  });
  return _dbPromise;
}

async function dbTx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const dbAll = () => dbTx('readonly', (s) => s.getAll());
const dbPut = (r) => dbTx('readwrite', (s) => { s.put(r); });
const dbPutMany = (list) => dbTx('readwrite', (s) => { list.forEach((r) => s.put(r)); });
const dbClear = () => dbTx('readwrite', (s) => { s.clear(); });
