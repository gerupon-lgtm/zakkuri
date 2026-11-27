// 端末内の自動一時保存（IndexedDB。F-011）。使えなければメモリに置く
export function createStore() {
  const mem = { work: null, prefs: {}, drawings: [] };
  let dbp;
  try {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open("zakkuri", 2); // 2: 保存した図面の一覧（drawings）を追加
      r.onupgradeneeded = () => { for (const n of ["work", "prefs", "drawings"]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }).catch(() => null);
  } catch { dbp = Promise.resolve(null); }
  const tx = async (name, mode, fn) => {
    const db = await dbp; if (!db) return undefined;
    return new Promise((res, rej) => { const t = db.transaction(name, mode); const r = fn(t.objectStore(name)); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  };
  return {
    getWork: async () => { try { return (await tx("work", "readonly", (s) => s.get("current"))) ?? mem.work; } catch { return mem.work; } },
    putWork: async (w) => { mem.work = w; try { await tx("work", "readwrite", (s) => s.put(w, "current")); return true; } catch { return false; } },
    delWork: async () => { mem.work = null; try { await tx("work", "readwrite", (s) => s.delete("current")); } catch { /* 無視 */ } },
    getDrawings: async () => { try { return (await tx("drawings", "readonly", (s) => s.get("list"))) ?? mem.drawings; } catch { return mem.drawings; } },
    putDrawings: async (list) => { mem.drawings = list; try { await tx("drawings", "readwrite", (s) => s.put(list, "list")); return true; } catch { return false; } },
    getPrefs: async () => { try { return (await tx("prefs", "readonly", (s) => s.get("defaults"))) ?? mem.prefs; } catch { return mem.prefs; } },
    putPrefs: async (p) => { mem.prefs = p; try { await tx("prefs", "readwrite", (s) => s.put(p, "defaults")); } catch { /* 無視 */ } },
  };
}
