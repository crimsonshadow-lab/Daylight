const CACHE = "daylight-v2";
const ASSETS = ["./", "./index.html", "./styles.css", "./src/app.js", "./src/planner.js", "./src/parser.js", "./src/store.js", "./manifest.webmanifest", "./icons/icon-192.svg", "./icons/icon-512.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request))));
