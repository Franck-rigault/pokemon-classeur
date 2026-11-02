// Calcule la valeur moyenne d'un booster pour chaque extension jouable, à partir des prix Cardmarket du jour
// (via TCGdex) et des règles du jeu (js/jeu-regles.js), puis écrit data/prix-boosters.json.
//
// Utilisation :
//   node scripts/maj-prix-boosters.mjs                    toutes les extensions jouables (≈ 5 à 10 minutes)
//   node scripts/maj-prix-boosters.mjs --sets=sv04.5,base1   seulement ces extensions (test)
//   node scripts/maj-prix-boosters.mjs --sortie=autre.json
// Ce script est lancé chaque nuit par .github/workflows/prix-boosters.yml.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { jouable, valeurEsperee } from "../js/jeu-regles.js";

const TCGDEX = "https://api.tcgdex.net/v2/fr";
const CONCURRENCE = 16;
const racine = fileURLToPath(new URL("../", import.meta.url));

const arg = (nom) => (process.argv.find((a) => a.startsWith("--" + nom + "=")) || "").split("=").slice(1).join("=");
const seulement = arg("sets") ? arg("sets").split(",") : null;
const sortie = arg("sortie") || racine + "data/prix-boosters.json";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(chemin, essais = 4) {
  for (let i = 0; i < essais; i++) {
    try {
      const rep = await fetch(TCGDEX + chemin, { signal: AbortSignal.timeout(30000) });
      if (rep.ok) return await rep.json();
      if (rep.status === 404) return null;
    } catch {
      // on réessaie
    }
    await pause(400 * (i + 1) ** 2);
  }
  throw new Error("Échec de la requête " + chemin);
}

// Même transformation que detailsExtension dans js/api.js
function compact(d) {
  const v = d.variants || {};
  const variantes = [];
  if (v.normal) variantes.push("Normale");
  if (v.reverse) variantes.push("Reverse");
  if (v.holo) variantes.push("Holo");
  if (v.firstEdition) variantes.push("1re édition");
  const cm = d.pricing && d.pricing.cardmarket;
  return {
    id: d.id,
    localId: d.localId,
    name: d.name,
    rarete: d.rarity || null,
    categorie: d.category || null,
    variantes: variantes.length ? variantes : ["Normale"],
    prix: cm ? cm.avg30 ?? cm.avg ?? null : null,
  };
}

async function cartesDe(ext) {
  const set = await json("/sets/" + encodeURIComponent(ext.id));
  if (!set) throw new Error("Extension introuvable : " + ext.id);
  const file = [...(set.cards || [])];
  const resultat = [];
  let echecs = 0;
  const travailleur = async () => {
    while (file.length) {
      const k = file.shift();
      try {
        const d = await json("/cards/" + encodeURIComponent(k.id));
        if (d) resultat.push(compact(d));
        else echecs++;
      } catch {
        echecs++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCE }, travailleur));
  return { cartes: resultat, echecs };
}

const extensions = JSON.parse(await readFile(racine + "extensions.json", "utf8"));
const cibles = extensions.filter((e) => jouable(e) && (!seulement || seulement.includes(e.id)));
console.log(cibles.length + " extension(s) à traiter…");

const boosters = {};
let ignorees = 0;
const debut = Date.now();

for (const [i, ext] of cibles.entries()) {
  try {
    const { cartes, echecs } = await cartesDe(ext);
    // Trop de fiches manquantes : le calcul serait faussé, on laisse l'application utiliser sa valeur par défaut
    if (!cartes.length || echecs > cartes.length * 0.2) throw new Error(echecs + " fiches manquantes sur " + (cartes.length + echecs));
    boosters[ext.id] = {
      valeur: Math.round(valeurEsperee(cartes, ext) * 100) / 100,
      cartes: cartes.length,
      avecPrix: cartes.filter((c) => c.prix != null).length,
    };
    console.log(`[${i + 1}/${cibles.length}] ${ext.id.padEnd(10)} ${ext.nom.padEnd(34)} ${boosters[ext.id].valeur.toFixed(2)} €`);
  } catch (e) {
    ignorees++;
    console.warn(`[${i + 1}/${cibles.length}] ${ext.id} ignorée : ${e.message}`);
  }
}

if (!Object.keys(boosters).length) {
  console.error("Aucune extension calculée : le fichier n'est pas modifié.");
  process.exit(1);
}

const maintenant = new Date();
await mkdir(dirname(sortie), { recursive: true });
await writeFile(
  sortie,
  JSON.stringify({ date: maintenant.toISOString().slice(0, 10), genere: maintenant.toISOString(), boosters }, null, 1) + "\n"
);
console.log(`Terminé en ${Math.round((Date.now() - debut) / 1000)} s : ${Object.keys(boosters).length} extensions, ${ignorees} ignorée(s) → ${sortie}`);
