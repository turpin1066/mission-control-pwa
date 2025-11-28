// sw.js — safe, simple cache, leaves audio alone

const CACHE_NAME = "mc-shell-v3";

// Optional: add whatever core files you want pre-cached
const SHELL_URLS = [
  "./",                  // root -> index.html
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];


self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(SHELL_URLS);
      } catch (err) {
        // If pre-cache fails, we still continue
        console.warn("[MC][SW] shell pre-cache failed:", err);
      } finally {
        self.skipWaiting();
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // delete old caches
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle GET
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Ignore non-HTTP(S) schemes (chrome-extension, file, etc.)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // Optional but recommended: only cache same-origin files (your own app shell)
  if (url.origin !== self.location.origin) {
    return; // let the browser handle external APIs/feeds normally
  }

  // Let audio files go straight to the network, no caching
  if (request.destination === "audio") {
    return; // browser does a normal fetch, SW doesn't intercept
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Try cache first
      const cached = await cache.match(request);
      if (cached) {
        // Refresh cache in background
        fetch(request)
          .then((res) => {
            if (res && res.ok && res.type === "basic") {
              cache.put(request, res.clone());
            }
          })
          .catch(() => {});
        return cached;
      }

      // No cache? Go to network
      try {
        const res = await fetch(request);
        if (res && res.ok && res.type === "basic") {
          cache.put(request, res.clone());
        }
        return res;
      } catch (err) {
        console.warn("[MC][SW] fetch failed:", err);

        // Last resort: generic offline response
        return new Response("Offline", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "text/plain" }
        });
      }
    })()
  );
});
