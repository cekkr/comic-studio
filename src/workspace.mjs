let database;
function openDatabase() {
  database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('comic-studio-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
export async function readWorkspace() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('workspace').objectStore('workspace').get('tabs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function writeWorkspace(snapshot) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('workspace', 'readwrite');
    transaction.objectStore('workspace').put(snapshot, 'tabs');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
