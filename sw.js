/* Akdeniz web — çevrimdışı kabuk. Sadece uygulamanın kendi dosyalarını önbelleğe alır;
   otobüs verisi ve harita HİÇBİR ZAMAN önbellekten verilmez (eski veri gösterilmesin). */
var VERSION = '20261105135303';
var SHELL = ['./', 'index.html', 'timetable.js', 'app.js', 'app.css', 'web.js', 'config.js', 'leaflet.js', 'leaflet.css',
  'maplibre-gl.js', 'maplibre-gl.css', 'leaflet-maplibre-gl.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open('akdeniz-' + VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== 'akdeniz-' + VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // dış istekler (veri, harita) doğrudan ağa
  // Önce ağ, olmazsa önbellek: güncelleme yayınlanınca hemen gelsin
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(function (res) { // tarayıcı önbelleğini atla, her seferinde sunucuya sor
    var copy = res.clone();
    caches.open('akdeniz-' + VERSION).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
