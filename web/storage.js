'use strict';
const Store = (() => {
  const DB_NAME = 'form-writer-poc';
  const DB_VERSION = 2;
  const RECORDS = 'records';
  const META = 'meta';
  let db = null;
  let mode = 'memory';
  const mem = new Map();

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB 不可用'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(RECORDS)) {
          const s = d.createObjectStore(RECORDS, { keyPath: 'id' });
          s.createIndex('form_code', 'form_code', { unique: false });
          s.createIndex('updated_at', 'updated_at', { unique: false });
        }
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('資料庫開啟失敗'));
      setTimeout(() => reject(new Error('資料庫開啟逾時')), 3500);
    });
  }
  function request(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  function store(name, access='readonly') { return db.transaction(name, access).objectStore(name); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  return {
    get mode() { return mode; },
    async init() {
      try { db = await openDb(); mode = 'indexeddb'; }
      catch (e) { console.warn('[Store] memory fallback', e); mode = 'memory'; }
      return mode;
    },
    async save(record) {
      record.updated_at = new Date().toISOString();
      if (mode === 'indexeddb') await request(store(RECORDS, 'readwrite').put(record));
      else mem.set(record.id, clone(record));
      return record;
    },
    async get(id) {
      if (mode === 'indexeddb') return request(store(RECORDS).get(id));
      return clone(mem.get(id));
    },
    async list() {
      let rows = mode === 'indexeddb' ? await request(store(RECORDS).getAll()) : [...mem.values()].map(clone);
      return rows.sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    },
    async remove(id) {
      if (mode === 'indexeddb') await request(store(RECORDS, 'readwrite').delete(id));
      else mem.delete(id);
    },
    async pending() { return (await this.list()).filter(r => r.sync_state === 'pending'); },
    async pendingCount() { return (await this.pending()).length; },
    async setMeta(key, value) {
      if (mode === 'indexeddb') await request(store(META,'readwrite').put({key,value}));
      else localStorage.setItem('fw-meta-'+key, JSON.stringify(value));
    },
    async getMeta(key) {
      if (mode === 'indexeddb') return (await request(store(META).get(key)))?.value;
      const v = localStorage.getItem('fw-meta-'+key); return v ? JSON.parse(v) : undefined;
    }
  };
})();

const Hash = (() => {
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  function sync(bytes){const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],len=bytes.length,bit=len*8,p=new Uint8Array((((len+8)>>6)+1)<<6);p.set(bytes);p[len]=0x80;const dv=new DataView(p.buffer);dv.setUint32(p.length-4,bit>>>0,false);dv.setUint32(p.length-8,Math.floor(bit/4294967296),false);const w=new Uint32Array(64);for(let i=0;i<p.length;i+=64){for(let j=0;j<16;j++)w[j]=dv.getUint32(i+j*4,false);for(let j=16;j<64;j++){const s0=rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3),s1=rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10);w[j]=(w[j-16]+s0+w[j-7]+s1)>>>0;}let[a,b,c,d,e,f,g,h]=H;for(let j=0;j<64;j++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[j]+w[j])>>>0,S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;}return H.map(x=>x.toString(16).padStart(8,'0')).join('');}
  function canonical(o){if(o===null||typeof o!=='object')return JSON.stringify(o);if(Array.isArray(o))return '['+o.map(canonical).join(',')+']';return '{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+canonical(o[k])).join(',')+'}';}
  return {canonical,async sha256(text){const bytes=new TextEncoder().encode(text);if(crypto?.subtle){try{const b=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}catch(e){}}return sync(bytes);}};
})();
