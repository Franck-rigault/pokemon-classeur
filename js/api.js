// Utilitaires communs : client Supabase, accès TCGdex, petites fonctions d'affichage.
import { S } from "./etat.js";

export const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

export const TCGDEX = "https://api.tcgdex.net/v2/fr";
// Artwork officiel, un fichier par numéro de Pokédex (hébergé par PokeAPI)
export const ARTWORK_URL =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";

export const ETATS = ["Neuf", "Excellent", "Bon", "Joué", "Abîmé"];
export const VARIANTES = ["Normale", "Reverse", "Holo", "1re édition"];

export const $ = (id) => document.getElementById(id);

import { normalise } from "./texte.js";
export { normalise };

export const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const euros = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);

export const imageCarte = (base, taille = "low") => (base ? base + "/" + taille + ".webp" : null);

// Prix moyen Cardmarket sur 30 jours (à défaut : moyenne du jour) ; null si aucun prix
export const prixDe = (d) => {
  const cm = d && d.pricing && d.pricing.cardmarket;
  return cm ? cm.avg30 ?? cm.avg ?? null : null;
};

// Création d'éléments DOM : h("div", { class: "x", onclick: fn }, enfants…)
export function h(tag, attrs, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "texte") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "list" || k === "style" || k === "draggable" || k.startsWith("aria-") || k.startsWith("data-")) e.setAttribute(k, v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of enfants.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

// replaceChildren / append écrivent « null » en toutes lettres : on ignore plutôt les valeurs vides,
// ce qui permet d'écrire  cond ? élément : null  dans les listes d'enfants.
for (const methode of ["replaceChildren", "append"]) {
  const origine = Element.prototype[methode];
  Element.prototype[methode] = function (...noeuds) {
    return origine.apply(this, noeuds.flat().filter((n) => n !== null && n !== undefined && n !== false));
  };
}

export function message(texte, type = "") {
  const el = $("msg");
  el.textContent = texte;
  el.className = "msg " + type;
}

// Pendant un chargement : rectangles qui brillent doucement à la place d'un texte « Chargement… »
export function squelette(n = 12, texte = "Chargement…") {
  return h("div", { class: "squelette-zone", role: "status", "aria-label": texte },
    h("div", { class: "squelette-barre" }),
    h("div", { class: "squelette-grille" }, Array.from({ length: n }, () => h("div", { class: "squelette-carte" })))
  );
}

// ---------- Référentiels (fichiers statiques) ----------

export async function chargerReferentiels() {
  const lire = async (f) => (await fetch(f, { cache: "no-cache" })).json();
  const [extensions, pokemon] = await Promise.all([lire("extensions.json"), lire("pokemon.json")]);
  S.extensions = extensions;
  extensions.forEach((e, i) => {
    S.extParId.set(e.id, e);
    S.ordreExt.set(e.id, i);
  });
  S.pokemon = pokemon;
}

export const annee = (e) => (e && e.date ? e.date.slice(0, 4) : "");
export const libelleExt = (id) => {
  const e = S.extParId.get(id);
  return e ? e.nom + (annee(e) ? " (" + annee(e) + ")" : "") : id;
};

// ---------- TCGdex ----------

const cacheExt = new Map(); // id d'extension -> { set, cartes }
const cacheDetails = new Map(); // id de carte -> détail
const cacheNoms = new Map(); // nom -> cartes

async function jsonTcgdex(chemin) {
  const rep = await fetch(TCGDEX + chemin);
  if (!rep.ok) throw new Error("TCGdex a répondu " + rep.status);
  return rep.json();
}

// Toutes les cartes d'une extension (liste courte : id, numéro, nom, image)
export async function cartesDExtension(setId) {
  if (cacheExt.has(setId)) return cacheExt.get(setId);
  const set = await jsonTcgdex("/sets/" + encodeURIComponent(setId));
  const cartes = (set.cards || []).map((k) => ({
    id: k.id,
    localId: k.localId,
    name: k.name,
    image: k.image || null,
    set_id: setId,
  }));
  const res = { set, cartes };
  cacheExt.set(setId, res);
  return res;
}

export async function detailCarte(id, frais = false) {
  if (!frais && cacheDetails.has(id)) return cacheDetails.get(id);
  const d = await jsonTcgdex("/cards/" + encodeURIComponent(id));
  cacheDetails.set(id, d);
  return d;
}

export const idExtDe = (idCarte) => idCarte.slice(0, idCarte.lastIndexOf("-"));

// Cartes dont le nom contient ce mot entier (« Mew » ne ramène pas « Mewtwo »), de la plus récente à la plus ancienne
export async function cartesParNom(nom) {
  if (cacheNoms.has(nom)) return cacheNoms.get(nom);
  const brutes = await jsonTcgdex("/cards?name=" + encodeURIComponent(nom));
  const mot = new RegExp("(?<![\\p{L}\\p{N}])" + echapper(normalise(nom)) + "(?![\\p{L}\\p{N}])", "u");
  const liste = brutes
    .filter((k) => mot.test(normalise(k.name)))
    .map((k) => ({ id: k.id, localId: k.localId, name: k.name, image: k.image || null, set_id: idExtDe(k.id) }))
    .sort(
      (a, b) =>
        (S.ordreExt.get(a.set_id) ?? 9999) - (S.ordreExt.get(b.set_id) ?? 9999) ||
        (parseInt(a.localId) || 0) - (parseInt(b.localId) || 0)
    );
  cacheNoms.set(nom, liste);
  return liste;
}

// Données utiles de toutes les cartes d'une extension (rareté, prix, variantes, type…).
// Récupérées carte par carte (une seule fois), puis gardées 7 jours dans le navigateur.
const CLE_EXT = "classeur:ext:v1:";

function compact(d) {
  const cm = d.pricing && d.pricing.cardmarket;
  return {
    id: d.id,
    localId: d.localId,
    name: d.name,
    image: d.image || null,
    rarete: d.rarity || null,
    categorie: d.category || null,
    variantes: variantesDe(d),
    prix: prixDe(d),
    produit: cm && cm.idProduct ? cm.idProduct : null,
    types: d.types || [],
    illustrateur: d.illustrator || null,
  };
}

// Détails déjà gardés dans le navigateur (sans réseau), ou null
export function lireCacheExtension(setId) {
  try {
    const c = JSON.parse(localStorage.getItem(CLE_EXT + setId));
    return c && Date.now() - c.t < 7 * 864e5 ? c.cartes : null;
  } catch {
    return null;
  }
}

export async function detailsExtension(setId, auProgres, force = false) {
  const cle = CLE_EXT + setId;
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(cle));
      if (c && Date.now() - c.t < 7 * 864e5) return c.cartes;
    } catch {
      // pas de cache utilisable : on récupère tout
    }
  }
  const { cartes } = await cartesDExtension(setId);
  const file = [...cartes];
  const resultats = new Map();
  let faits = 0;
  const travailleur = async () => {
    while (file.length) {
      const k = file.shift();
      try {
        resultats.set(k.id, compact(await detailCarte(k.id)));
      } catch {
        resultats.set(k.id, { id: k.id, localId: k.localId, name: k.name, image: k.image, rarete: null, categorie: null, variantes: ["Normale"], prix: null, produit: null, types: [], illustrateur: null });
      }
      faits++;
      if (auProgres) auProgres(faits, cartes.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, travailleur));
  const liste = cartes.map((k) => resultats.get(k.id));
  try {
    localStorage.setItem(cle, JSON.stringify({ t: Date.now(), cartes: liste }));
  } catch {
    // stockage plein ou indisponible : on garde seulement en mémoire
  }
  return liste;
}

// Recherche de la carte sur Cardmarket (page de résultats : fiable même sans identifiant de produit)
export const lienCardmarket = (nom, extension, localId) =>
  "https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=" +
  encodeURIComponent([nom, extension, localId].filter(Boolean).join(" "));

// Bouton « Acheter sur Cardmarket » (icône du site) ; `etiquette` ajoute un texte à côté de l'icône
export function boutonCardmarket(nom, setId, localId, etiquette = "") {
  const ext = S.extParId.get(setId);
  return h("a", {
    class: "btn-cm" + (etiquette ? " avec-texte" : ""),
    href: lienCardmarket(nom, ext && ext.code, localId),
    target: "_blank",
    rel: "noopener noreferrer",
    title: "Acheter « " + nom + " » sur Cardmarket",
    "aria-label": "Acheter " + nom + " sur Cardmarket",
    onclick: (e) => e.stopPropagation(),
  }, h("img", { src: "cardmarket.png", alt: "", width: 22, height: 22 }), etiquette ? h("span", {}, etiquette) : null);
}

const cacheRecherches = new Map(); // texte -> cartes

// Recherche libre par nom : toutes les cartes dont le nom contient le texte, de la plus récente à la plus ancienne.
// TCGdex est sensible aux accents : on essaie aussi l'orthographe exacte d'un Pokémon connu et « Énergie ».
export async function chercherCartes(texte) {
  const q = texte.trim();
  if (q.length < 2) return [];
  if (cacheRecherches.has(q)) return cacheRecherches.get(q);

  const nq = normalise(q);
  const essais = [q];
  const pokemon = S.pokemon.find((p) => normalise(p.nom) === nq || normalise(p.nom).startsWith(nq));
  if (pokemon && !essais.includes(pokemon.nom)) essais.push(pokemon.nom);
  if (nq.startsWith("energie")) essais.push("Énergie" + q.slice(7));

  let brutes = [];
  for (const essai of essais) {
    brutes = await jsonTcgdex("/cards?name=" + encodeURIComponent(essai));
    if (brutes.length) break;
  }
  // Les extensions numériques (Pocket) ont des identifiants commençant par une majuscule : on les écarte
  const liste = brutes
    .map((k) => ({ id: k.id, localId: k.localId, name: k.name, image: k.image || null, set_id: idExtDe(k.id) }))
    .filter((k) => S.extParId.has(k.set_id) || !/^[A-Z]/.test(k.set_id))
    .sort(
      (a, b) =>
        (S.ordreExt.get(a.set_id) ?? 9999) - (S.ordreExt.get(b.set_id) ?? 9999) ||
        (parseInt(a.localId) || 0) - (parseInt(b.localId) || 0)
    );
  cacheRecherches.set(q, liste);
  return liste;
}

// Variantes proposées pour une carte, d'après ses informations TCGdex
export function variantesDe(d) {
  const v = (d && d.variants) || {};
  const liste = [];
  if (v.normal) liste.push("Normale");
  if (v.reverse) liste.push("Reverse");
  if (v.holo) liste.push("Holo");
  if (v.firstEdition) liste.push("1re édition");
  return liste.length ? liste : ["Normale"];
}

// Exécute une action et affiche l'erreur éventuelle au lieu de la laisser passer en silence
export async function essayer(action) {
  try {
    return await action();
  } catch (e) {
    message(e && e.message ? e.message : String(e), "ko");
  }
}

// Fenêtre modale : fermeture au clic sur le fond
export function fermerAuFond(dialogue) {
  dialogue.addEventListener("click", (e) => {
    if (e.target === dialogue) dialogue.close();
  });
}
