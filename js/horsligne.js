// Mode hors-ligne : copie locale des données (consultation sans réseau) et file d'attente des modifications,
// rejouées dans l'ordre dès que la connexion revient. Ne dépend ni de Supabase ni de l'interface : `donnees.js` s'en sert.
import { S } from "./etat.js";

// Tables dont les modifications sont mises en attente hors-ligne
export const TABLES_FILE = new Set(["collection", "souhaits", "produits", "classeurs", "classeur_cases"]);
// Clé de S correspondant à chaque table
const CLES = { collection: "collection", souhaits: "souhaits", produits: "produits", classeurs: "classeurs", classeur_cases: "cases" };
const CLE_FILE = "classeur:file:v1";
const CLE_COMPTE = "classeur:compte:v1";
const IGNORES = ["id", "user_id", "created_at"];

export const enLigne = () => navigator.onLine !== false;

// Une erreur « réseau » (par opposition à un refus du serveur : droits, contrainte d'unicité…)
export function estReseau(err) {
  if (!err) return false;
  if (err instanceof TypeError) return true;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|err_internet|timeout/i.test(String(err.message || err));
}

// ---------- File d'attente (localStorage, avec repli en mémoire) ----------

let enMemoire = null;
let ecouteurs = [];
const signaler = () => ecouteurs.forEach((f) => { try { f(taille()); } catch {} });
export const surChangement = (f) => { ecouteurs.push(f); return () => { ecouteurs = ecouteurs.filter((x) => x !== f); }; };

function lire() {
  if (enMemoire) return enMemoire;
  try {
    return JSON.parse(localStorage.getItem(CLE_FILE) || "[]");
  } catch {
    return [];
  }
}
function ecrire(file) {
  try {
    localStorage.setItem(CLE_FILE, JSON.stringify(file));
    enMemoire = null;
  } catch {
    enMemoire = file; // stockage plein ou interdit : la file survit tant que la page reste ouverte
  }
  signaler();
}

const utilisateur = () => (S.moi && S.moi.id) || null;
const duCompte = (op) => op.userId === utilisateur();
export const taille = () => lire().filter(duCompte).length;
export const operationsEnAttente = () => lire().filter(duCompte);
export const viderFile = () => ecrire(lire().filter((op) => !duCompte(op)));

let compteur = 0;
const idTemporaire = () => "tmp-" + Date.now().toString(36) + "-" + ++compteur;
export const estTemporaire = (id) => typeof id === "string" && id.startsWith("tmp-");

// Ajoute une ligne en attente et retourne la ligne telle qu'elle apparaît en local
export function enfilerInsertion(table, ligne) {
  const tmp = idTemporaire();
  const file = lire();
  file.push({ userId: utilisateur(), type: "ins", table, tmp, ligne });
  ecrire(file);
  return { ...ligne, id: tmp, user_id: utilisateur(), created_at: new Date().toISOString() };
}

export function enfilerMaj(table, id, champs) {
  const file = lire();
  if (estTemporaire(id)) {
    const ins = file.find((op) => op.type === "ins" && op.tmp === id);
    if (ins) Object.assign(ins.ligne, champs); // l'insertion n'est pas encore partie : on la corrige simplement
  } else {
    const deja = file.find((op) => op.type === "maj" && op.table === table && op.id === id && duCompte(op));
    if (deja) Object.assign(deja.champs, champs);
    else file.push({ userId: utilisateur(), type: "maj", table, id, champs: { ...champs } });
  }
  ecrire(file);
}

export function enfilerSuppression(table, id) {
  let file = lire();
  if (estTemporaire(id)) {
    file = file.filter((op) => !(op.tmp === id || op.id === id)); // jamais envoyée : on l'oublie
  } else {
    file = file.filter((op) => !(op.type === "maj" && op.table === table && op.id === id)); // inutile de modifier une ligne supprimée
    file.push({ userId: utilisateur(), type: "sup", table, id });
  }
  ecrire(file);
}

// ---------- Copie locale des listes (IndexedDB : bien plus de place que localStorage) ----------

function ouvrirBase() {
  return new Promise((resolve, rejet) => {
    if (!window.indexedDB) return rejet(new Error("IndexedDB indisponible"));
    const req = indexedDB.open("classeur-hors-ligne", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("listes");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => rejet(req.error);
  });
}
async function transaction(mode, f) {
  const base = await ouvrirBase();
  try {
    return await new Promise((resolve, rejet) => {
      const tx = base.transaction("listes", mode);
      const res = f(tx.objectStore("listes"));
      tx.oncomplete = () => resolve(res && res.result);
      tx.onerror = () => rejet(tx.error);
      tx.onabort = () => rejet(tx.error);
    });
  } finally {
    base.close();
  }
}

const cleListe = (table, userId) => table + ":" + userId;
// La liste est copiée tout de suite : l'écriture est asynchrone et la liste d'origine continue d'évoluer
export function sauverListe(table, userId, lignes) {
  const copie = JSON.parse(JSON.stringify(lignes));
  return transaction("readwrite", (s) => s.put(copie, cleListe(table, userId))).catch(() => {});
}
export const lireListe = (table, userId) => transaction("readonly", (s) => s.get(cleListe(table, userId))).catch(() => undefined);

// Applique la file (insertions, modifications, suppressions) à une liste lue sur le serveur ou dans la copie locale.
// Idempotent : la copie locale peut déjà contenir l'effet de certaines opérations.
export function appliquerFile(table, lignes, tri = []) {
  let liste = lignes.map((l) => ({ ...l }));
  for (const op of lire().filter((o) => duCompte(o) && o.table === table)) {
    if (op.type === "ins") { if (!liste.some((l) => l.id === op.tmp)) liste.push({ ...op.ligne, id: op.tmp, user_id: op.userId, created_at: new Date(0).toISOString() }); }
    else if (op.type === "maj") liste = liste.map((l) => (l.id === op.id ? { ...l, ...op.champs } : l));
    else liste = liste.filter((l) => l.id !== op.id);
  }
  // Même ordre que celui demandé au serveur (les insertions locales arrivent en dernier pour un tri croissant)
  const compare = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "fr", { numeric: true }));
  return liste
    .map((l, i) => [l, i])
    .sort(([a, ia], [b, ib]) => {
      for (const [colonne, croissant] of tri) {
        const x = a[colonne] ?? "", y = b[colonne] ?? "";
        const c = compare(x, y);
        if (c) return croissant ? c : -c;
      }
      return ia - ib;
    })
    .map(([l]) => l);
}

// ---------- Rejeu de la file ----------

let enCours = null;

// `reseau` : { inserer(table, lignes), maj(table, id, champs), supprimer(table, id) } (les vraies écritures).
// S'arrête à la première erreur réseau (le reste attend) ; un refus du serveur abandonne seulement cette opération.
export function synchroniser(reseau) {
  if (enCours) return enCours;
  enCours = (async () => {
    const bilan = { faites: 0, restantes: 0, abandonnees: [] };
    const idReels = new Map();
    const reel = (id) => (idReels.has(id) ? idReels.get(id) : id);
    try {
      for (;;) {
        const file = lire();
        const op = file.find(duCompte);
        if (!op) break;
        const signature = JSON.stringify(op);
        const retirer = () => {
          const restant = lire();
          const i = restant.findIndex((o) => JSON.stringify(o) === signature);
          if (i >= 0) restant.splice(i, 1);
          ecrire(restant);
        };
        try {
          if (op.type === "ins") {
            const ligne = Object.fromEntries(Object.entries(op.ligne).filter(([k]) => !IGNORES.includes(k)));
            if (ligne.classeur_id !== undefined) ligne.classeur_id = reel(ligne.classeur_id);
            if (estTemporaire(ligne.classeur_id)) throw new Error("classeur parent introuvable");
            const [cree] = await reseau.inserer(op.table, [ligne]);
            idReels.set(op.tmp, cree.id);
            remplacerId(op.table, op.tmp, cree);
            // les opérations suivantes qui visent cette ligne utilisent désormais son vrai identifiant
            ecrire(lire().map((o) => (o.id === op.tmp ? { ...o, id: cree.id } : o)));
          } else if (op.type === "maj") {
            await reseau.maj(op.table, reel(op.id), op.champs);
          } else {
            await reseau.supprimer(op.table, reel(op.id));
          }
          retirer();
          bilan.faites++;
        } catch (e) {
          if (estReseau(e)) break;
          bilan.abandonnees.push({ op, raison: e && e.message ? e.message : String(e) });
          retirer();
        }
      }
    } finally {
      bilan.restantes = taille();
      enCours = null;
      signaler();
    }
    return bilan;
  })();
  return enCours;
}

// Après l'envoi d'une insertion : la ligne affichée prend son vrai identifiant
function remplacerId(table, tmp, cree) {
  const liste = S[CLES[table]];
  if (Array.isArray(liste)) for (const l of liste) if (l.id === tmp) Object.assign(l, { id: cree.id, user_id: cree.user_id, created_at: cree.created_at });
  if (table === "classeurs" && Array.isArray(S.cases)) for (const c of S.cases) if (c.classeur_id === tmp) c.classeur_id = cree.id;
}

// ---------- Compte mémorisé (pour ouvrir l'appli sans réseau) ----------

export function sauverCompte(compte) {
  try { localStorage.setItem(CLE_COMPTE, JSON.stringify(compte)); } catch {}
}
export function lireCompte() {
  try { return JSON.parse(localStorage.getItem(CLE_COMPTE) || "null"); } catch { return null; }
}
export function oublierCompte() {
  try { localStorage.removeItem(CLE_COMPTE); } catch {}
}

// Déconnexion volontaire : on n'efface que la copie locale (la file d'attente reste, pour ne rien perdre)
export function oublierCopieLocale() {
  oublierCompte();
  try { indexedDB.deleteDatabase("classeur-hors-ligne"); } catch {}
}
