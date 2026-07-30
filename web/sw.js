'use strict';
const CACHE='form-writer-poc-v1.0.1';
const PRECACHE=[
  './','./index.html','./app.js','./storage.js','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','../schema/catalog.json',
  '../schema/T7-01.json','../schema/T7-04-01.json','../schema/T7-04-04.json','../schema/T7-07.json','../schema/T7-10.json'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;}).catch(()=>caches.match('./index.html'))));
});
