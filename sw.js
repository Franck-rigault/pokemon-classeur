// Service worker : permet d'installer l'appli et de l'ouvrir sans réseau.
// - Fichiers du site : « réseau d'abord » (on sert toujours la dernière version en ligne ; le cache ne sert qu'en secours),
//   les mises à jour du site sont donc visibles immédiatement.
// - Ressources externes (bibliothèque Supabase, polices, images et fiches de cartes TCGdex) : « cache d'abord, mise à jour en
//   arrière-plan », pour que la collection reste consultable hors-ligne avec ses images.
const CACHE = "classeur-v9";
const CACHE_EXTERNE = "classeur-externe-v1";
const MAX_EXTERNE = 2500;
const COQUILLE = [
  "./", "index.html", "style.css", "jeu.css", "config.js", "favicon.svg", "cardmarket.png", "manifest.json", "extensions.json", "pokemon.json", "raretes.json",
  "js/main.js", "js/api.js", "js/etat.js", "js/donnees.js", "js/dialogue-carte.js", "js/scan.js", "js/partage.js",
  "js/export.js", "js/vue-extensions.js", "js/vue-recherche.js", "js/donnees-extra.js", "js/vue-classeurs.js", "js/vue-produits.js", "js/import.js",
  "js/jeu.js", "js/texte.js", "js/jeu-regles.js", "js/jeu-effets.js", "js/jeu-quetes.js", "js/vue-cartes.js", "js/vue-wishlist.js", "js/vue-dashboard.js",
  "js/vue-classeur.js", "js/theme.js", "js/carte3d.js", "js/album.js", "js/graphiques.js", "js/sauvegarde.js", "js/horsligne.js",
  "js/images.js", "js/annuler.js", "js/prefs.js", "js/journal.js", "js/photos.js", "js/vue-favoris.js", "js/vue-doublons.js", "js/vue-objectifs.js", "js/accueil.js",
  "js/recherche-globale.js", "js/partage-image.js", "js/sante.js", "js/acces.js",
];

// Hôtes dont les réponses (GET) sont gardées pour le hors-ligne
const EXTERNES = [
  "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com", "assets.tcgdex.net", "api.tcgdex.net",
  "raw.githubusercontent.com", "images.pokemontcg.io", "images.scrydex.com",
];
// Données qui changent (prix des cartes, prix des boosters) : toujours le réseau d'abord, le cache ne sert qu'hors-ligne
const FRAICHES = ["api.tcgdex.net", "raw.githubusercontent.com"];

self.addEventListener("install", (e) => {
  // Un fichier manquant ne doit pas empêcher l'installation : on les ajoute un par un
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(COQUILLE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE && k !== CACHE_EXTERNE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function elaguer() {
  const cache = await caches.open(CACHE_EXTERNE);
  const cles = await cache.keys();
  if (cles.length > MAX_EXTERNE) await Promise.all(cles.slice(0, cles.length - MAX_EXTERNE).map((c) => cache.delete(c)));
}

let ajouts = 0;
async function externe(req) {
  const cache = await caches.open(CACHE_EXTERNE);
  if (FRAICHES.includes(new URL(req.url).hostname)) {
    try {
      const rep = await fetch(req);
      if (rep.ok && rep.type !== "opaque") {
        cache.put(req, rep.clone());
        if (++ajouts % 100 === 0) elaguer();
      }
      return rep;
    } catch {
      return (await cache.match(req)) || Response.error();
    }
  }
  const enCache = await cache.match(req);
  const maj = fetch(req.destination === "image" ? new Request(req.url, { mode: "cors", credentials: "omit" }) : req)
    .then((rep) => {
      // une réponse « opaque » (sans CORS) coûte très cher en place : on ne la garde pas
      if (rep.ok && rep.type !== "opaque") {
        cache.put(req, rep.clone());
        if (++ajouts % 100 === 0) elaguer();
      }
      return rep;
    })
    .catch(() => null);
  if (enCache) {
    maj.catch(() => {});
    return enCache;
  }
  const rep = await maj;
  if (rep) return rep;
  // Image en CORS refusé : on retente telle quelle (affichage sans cache)
  try {
    return await fetch(req);
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin !== location.origin) {
    if (EXTERNES.includes(url.hostname)) e.respondWith(externe(req));
    return; // Supabase et le reste : jamais interceptés
  }

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
