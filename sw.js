const CACHE_NAME = 'alcpt-stories-v5';
const AUDIO_CACHE = 'alcpt-stories-audio-v1';
const STATIC_ASSETS = ['./','./index.html','./app.js','./quiz.js','./quizdata.js','./data.js','./manifest.json','./fonts/fonts.css','./fonts/IBMPlexSansArabic-arabic-normal-400.woff2','./fonts/IBMPlexSansArabic-arabic-normal-500.woff2','./fonts/IBMPlexSansArabic-arabic-normal-600.woff2','./fonts/IBMPlexSansArabic-arabic-normal-700.woff2','./fonts/IBMPlexSansArabic-latin-normal-400.woff2','./fonts/IBMPlexSansArabic-latin-normal-500.woff2','./fonts/IBMPlexSansArabic-latin-normal-600.woff2','./fonts/IBMPlexSansArabic-latin-normal-700.woff2','./fonts/Lora-latin-italic-400_700.woff2','./fonts/Lora-latin-normal-400_700.woff2','./icon-96.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ns => Promise.all(ns.filter(n => n !== CACHE_NAME && n !== AUDIO_CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // recorded audio: cache-first per line, so each episode works offline after first play
  if (url.pathname.includes('/audio/')) {
    e.respondWith(caches.open(AUDIO_CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.status === 200) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  // app shell: network-first so updates reach users, cache fallback for offline
  e.respondWith(fetch(e.request).then(res => {
    if (res && res.status === 200 && res.type === 'basic') { const cl = res.clone(); caches.open(CACHE_NAME).then(c => c.put(e.request, cl)); }
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});
