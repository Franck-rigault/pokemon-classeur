// Préférences du compte (objectifs, vues enregistrées…) : une ligne JSON par compte (table « preferences »).
// Copie dans localStorage : tout marche aussi hors-ligne ou tant que schema-v8.sql n'a pas été lancé.
import { db } from "./api.js";
import { S } from "./etat.js";
import { estReseau } from "./horsligne.js";

const cle = () => "classeur:prefs:v1:" + (S.moi ? S.moi.id : "anonyme");

let donnees = null;
let proprio = null;
let sale = false; // modifications locales pas encore envoyées au serveur

// Vrai quand les colonnes de schema-v8.sql existent (ou quand on ne peut pas encore le savoir)
export const schemaV8 = () => S.collection.length === 0 || "favori" in S.collection[0];

function lireLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(cle()) || "null");
    return v && v.donnees ? v : null;
  } catch {
    return null;
  }
}
function ecrireLocal() {
  try { localStorage.setItem(cle(), JSON.stringify({ donnees, sale })); } catch { /* stockage indisponible */ }
}

async function envoyer() {
  const { error } = await db.from("preferences").upsert({ user_id: S.moi.id, donnees, maj: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
  sale = false;
  ecrireLocal();
}

export async function chargerPrefs() {
  if (!S.moi) return {};
  if (donnees && proprio === S.moi.id) return donnees;
  proprio = S.moi.id;
  const local = lireLocal();
  donnees = local ? local.donnees : {};
  sale = !!(local && local.sale);
  if (navigator.onLine !== false) {
    try {
      if (sale) await envoyer();
      else {
        const { data, error } = await db.from("preferences").select("donnees").eq("user_id", S.moi.id).maybeSingle();
        if (!error && data) { donnees = data.donnees || {}; ecrireLocal(); }
      }
    } catch (e) {
      if (!estReseau(e)) console.warn("Préférences non synchronisées :", e.message || e);
    }
  }
  return donnees;
}

// Toutes les préférences (pour la sauvegarde) et remplacement en bloc (pour la restauration)
export const toutesPrefs = () => ({ ...(donnees || {}) });
export async function remplacerPrefs(nouvelles, { ecraser = true } = {}) {
  await chargerPrefs();
  donnees = ecraser ? { ...nouvelles } : { ...nouvelles, ...donnees };
  sale = true;
  ecrireLocal();
  if (navigator.onLine !== false && !S.lectureSeule) { try { await envoyer(); } catch { /* resté local */ } }
}

export const lirePref = (nom, defaut) => (donnees && donnees[nom] !== undefined ? donnees[nom] : defaut);

export async function ecrirePref(nom, valeur) {
  await chargerPrefs();
  donnees = { ...donnees, [nom]: valeur };
  sale = true;
  ecrireLocal();
  if (navigator.onLine === false || S.lectureSeule) return;
  try { await envoyer(); } catch { /* resté local : réessayé au prochain chargement */ }
}

// Un compte qui se déconnecte repart d'une page blanche
export function oublierPrefs() {
  donnees = null;
  proprio = null;
}
