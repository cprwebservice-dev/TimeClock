const CACHE='timeattendance-portal-v61516a';
const SHELL=['./portal.html','./portal.css?v=6.15.16a','./portal.js?v=6.15.16a','./favicon.svg'];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(SHELL))
      .catch(()=>{})
      .then(()=>self.skipWaiting())
  );
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys.filter(k=>k!==CACHE&&k.startsWith('timeattendance-portal-'))
          .map(k=>caches.delete(k))
      ))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  e.respondWith(
    fetch(e.request)
      .then(r=>{
        const copy=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
        return r;
      })
      .catch(()=>caches.match(e.request))
  );
});
