// Service worker: precarga todo para modo avión. La versión cambia en cada build,
// así una nueva versión publicada reemplaza a la anterior sola.
const VERSION = 'muu3wikh';
const CACHE = `voz-propia-${VERSION}`;
const PRECACHE = ["./","assets/anton-latin-400-normal-AUNGEG_V.woff","assets/anton-latin-400-normal-Byf51wtH.woff2","assets/atkinson-hyperlegible-next-latin-ext-wght-normal-C6vrW8VD.woff2","assets/atkinson-hyperlegible-next-latin-wght-normal-BcXVPD7q.woff2","assets/ayuda-field-MsPx_9LP.js","assets/guia-scene-5ytsNNSI.js","assets/index-CowZxIOL.css","assets/index-CvChMY5p.js","assets/jetbrains-mono-latin-ext-wght-normal-DBQx-q_a.woff2","assets/jetbrains-mono-latin-wght-normal-B9CIFXIH.woff2","assets/landing-C6JU3uiY.css","assets/landing-COQBEQb-.js","assets/raleway-latin-ext-wght-normal-CwtNDoQR.woff2","assets/raleway-latin-wght-normal-CSF1BaNN.woff2","assets/sacramento-latin-400-normal-D-mHOmJi.woff","assets/sacramento-latin-400-normal-mRAQrhvZ.woff2","assets/scene-DadpB4HY.js","assets/three.module-Df0CdqQo.js","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","icons/maskable-512.png","index.html","manifest.webmanifest","mediapipe/vision_wasm_internal.js","mediapipe/vision_wasm_internal.wasm","models/face_landmarker.task"];

// La versión nueva toma el control en cuanto termina de descargarse: nadie se queda en una vieja.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./', { ignoreSearch: true })));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
