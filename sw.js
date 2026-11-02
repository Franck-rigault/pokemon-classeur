// Service worker : permet d'installer l'appli et de l'ouvrir même avec une connexion instable.
// Stratégie « réseau d'abord » : on sert toujours la dernière version en ligne, et le cache ne sert
// qu'en secours. Les mises à jour du site sont donc visibles immédiatement.
const CACHE = "classeur-v1";
const COQUILLE = [
  "./", "index.html", "style.css", "app.js", "outils.js", "scan.js", "config.js",
  "favicon.svg", "manifest.json", "extensions.json", "raretes.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return; // API (Supabase, TCGdex) et images : jamais mises en cache ici

  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((rep) => {
        if (rep.ok) {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(req, copie));
        }
        return rep;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
