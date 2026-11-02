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

export const normalise = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

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
    else if (k === "list" || k === "style" || k.startsWith("aria-") || k.startsWith("data-")) e.setAttribute(k, v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of enfants.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function message(texte, type = "") {
  const el = $("msg");
  el.textContent = texte;
  el.className = "msg " + type;
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
