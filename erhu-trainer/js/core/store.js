/* core/store.js — IndexedDB 设置持久化（D-12，单 store 键值；不可用时降级 localStorage） */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  const DB_NAME = "erhu-trainer";
  const STORE = "settings";
  let db = null;
  let mem = {}; // 降级用

  function idbOk() { return typeof indexedDB !== "undefined"; }

  function init() {
    return new Promise((resolve) => {
      if (!idbOk()) return resolve(false);
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(false); }
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "key" }); };
      req.onsuccess = () => { db = req.result; resolve(true); };
      req.onerror = () => resolve(false);
    });
  }

  function tx(mode) { return db.transaction(STORE, mode).objectStore(STORE); }

  async function get(key, def) {
    if (db) {
      return new Promise((resolve) => {
        const r = tx("readonly").get(key);
        r.onsuccess = () => resolve(r.result ? r.result.value : def);
        r.onerror = () => resolve(def);
      });
    }
    try {
      const v = localStorage.getItem("et:" + key);
      return v != null ? JSON.parse(v) : (key in mem ? mem[key] : def);
    } catch (e) { return key in mem ? mem[key] : def; }
  }

  async function set(key, value) {
    if (db) {
      return new Promise((resolve) => {
        const r = tx("readwrite").put({ key, value });
        r.onsuccess = () => resolve(true);
        r.onerror = () => resolve(false);
      });
    }
    mem[key] = value;
    try { localStorage.setItem("et:" + key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
    return true;
  }

  ET.store = { init, get, set };
})();
