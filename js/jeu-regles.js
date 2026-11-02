// Règles du jeu « Fake Booster » : quelles extensions sont jouables, de quoi est fait un booster,
// et avec quelles probabilités tombent les cartes rares.
//
// IMPORTANT : The Pokémon Company ne publie PAS les taux de drop officiels. Les valeurs ci-dessous sont des
// ESTIMATIONS inspirées des statistiques d'ouverture de la communauté, époque par époque. Elles sont volontairement
// regroupées ici (TAUX) pour pouvoir être ajustées facilement : ce sont des poids relatifs, pas des pourcentages exacts.
import { normalise } from "./api.js";

export const LIMITE_PAR_JOUR = 100;

// Groupes de rareté, du moins bon au meilleur. `ordre` sert au tri (la meilleure carte est révélée en dernier).
export const GROUPES = {
  E: { nom: "Énergie", ordre: -1, couleur: "#c9a15a" },
  C: { nom: "Commune", ordre: 0, couleur: "#9aa3d6" },
  U: { nom: "Peu commune", ordre: 1, couleur: "#3ddc84" },
  R: { nom: "Rare", ordre: 2, couleur: "#6ea8ff" },
  RH: { nom: "Rare holo", ordre: 3, couleur: "#4de1ff" },
  AS: { nom: "ACE SPEC", ordre: 4, couleur: "#ff7ad9" },
  DR: { nom: "Double rare", ordre: 5, couleur: "#b388ff" },
  UR: { nom: "Ultra rare", ordre: 6, couleur: "#ffcb05" },
  SH: { nom: "Chromatique", ordre: 6.5, couleur: "#e0f7ff" },
  IR: { nom: "Illustration rare", ordre: 7, couleur: "#ff9ad5" },
  SIR: { nom: "Illustration spéciale rare", ordre: 8, couleur: "#ff5f6d" },
  HR: { nom: "Hyper rare", ordre: 9, couleur: "#ffd700" },
};

// Associe la rareté TCGdex (en français) à un groupe. « X » = carte jamais tirée dans un booster (promo…).
export function groupe(rarete) {
  const r = normalise(rarete || "");
  if (!r) return "C";
  if (/promo|collection classique|sans rarete/.test(r)) return "X";
  if (r === "commune") return "C";
  if (r === "peu commune") return "U";
  if (r === "rare") return "R";
  if (/hyper|secrete|arc-en-ciel|rainbow|gold|dore|couronne/.test(r)) return "HR";
  if (/illustration speciale/.test(r)) return "SIR";
  if (/illustration rare|magnifique/.test(r)) return "IR";
  if (/chromatique|shiny/.test(r)) return "SH";
  if (/double rare/.test(r)) return "DR";
  if (/ace spec/.test(r)) return "AS";
  if (/ultra|full art|vmax|vstar|\bv\b|\bgx\b|\bex\b|legend|prime|break|lv\.x|radieux|etoile|star/.test(r)) return "UR";
  if (/holo/.test(r)) return "RH";
  return "R";
}

// ---------- Extensions jouables ----------

// Époque de chaque série : détermine la structure du booster et les taux
const EPOQUES = {
  "Écarlate et Violet": "ev",
  "Méga-Évolution": "ev",
  "Épée et Bouclier": "swsh",
  "Soleil et Lune": "sm",
  XY: "xy",
  "Noir & Blanc": "bw",
  "Diamant & Perle": "inter",
  Platine: "inter",
  "HeartGold SoulSilver": "inter",
  EX: "inter",
  "L'appel des Légendes": "inter",
  Base: "classique",
  Neo: "classique",
  "e-cards": "classique",
};

// Extensions qui ne se vendent pas en boosters classiques (promos, kits, coffrets, énergies…)
const EXCLUS = /promo|black star|kit|mcdonald|wizards|collection classique|anniversaire|celebration|energie/;

export const epoqueDe = (ext) => EPOQUES[ext.serie] || null;
export const jouable = (ext) => !!epoqueDe(ext) && !EXCLUS.test(normalise(ext.nom)) && (ext.officiel || 0) >= 20;

// ---------- Structure d'un booster ----------

// C = commune, U = peu commune, REV = reverse, RARE = emplacement rare, HIT = emplacement « chasse » (Écarlate et Violet),
// ENERGIE = énergie de base
const SLOTS = {
  ev: ["C", "C", "C", "C", "U", "U", "U", "REV", "HIT", "RARE"],
  swsh: ["C", "C", "C", "C", "U", "U", "U", "REV", "RARE", "ENERGIE"],
  sm: ["C", "C", "C", "C", "U", "U", "U", "REV", "RARE", "ENERGIE"],
  xy: ["C", "C", "C", "C", "U", "U", "U", "REV", "RARE", "ENERGIE"],
  bw: ["C", "C", "C", "C", "C", "U", "U", "U", "RARE", "ENERGIE"],
  inter: ["C", "C", "C", "C", "C", "U", "U", "U", "REV", "RARE"],
  classique: ["C", "C", "C", "C", "C", "C", "C", "U", "U", "U", "RARE"],
};

// Poids relatifs par emplacement. Un groupe absent de l'extension est ignoré et les autres sont renormalisés.
// Ordre de grandeur visé pour une extension moderne : ≈ 1 carte « chasse » (illustration rare ou mieux) tous les 8 à 10 boosters.
export const TAUX = {
  ev: {
    RARE: { R: 74, DR: 12, UR: 6, AS: 2, SH: 3, RH: 3 },
    HIT: { REV: 87, IR: 9, SIR: 3, HR: 1 },
  },
  swsh: { RARE: { R: 56, RH: 27, UR: 12, HR: 2, SH: 3 } },
  sm: { RARE: { R: 60, RH: 25, UR: 11, HR: 2, SH: 2 } },
  xy: { RARE: { R: 58, RH: 26, UR: 13, HR: 3 } },
  bw: { RARE: { R: 60, RH: 28, UR: 10, HR: 2 } },
  inter: { RARE: { R: 58, RH: 33, UR: 8, HR: 1 } },
  classique: { RARE: { R: 67, RH: 33 } },
};

// Tri d'un booster : du moins bon au meilleur (la plus belle carte sort en dernier)
export const importance = (c) => (GROUPES[c.groupe] ? GROUPES[c.groupe].ordre : 0) + (c.variante === "Reverse" ? 0.4 : 0);
export const estHit = (c) => importance(c) >= 5; // double rare et au-dessus
export const estJackpot = (c) => importance(c) >= 7; // illustration rare et au-dessus

function choisirPondere(table, disponibles, hasard) {
  const entrees = Object.entries(table).filter(([g, poids]) => poids > 0 && (g === "REV" || disponibles.has(g)));
  const total = entrees.reduce((s, [, p]) => s + p, 0);
  if (!entrees.length || total <= 0) return null;
  let t = hasard() * total;
  for (const [g, p] of entrees) {
    t -= p;
    if (t < 0) return g;
  }
  return entrees[entrees.length - 1][0];
}

const dans = (liste, hasard) => liste[Math.floor(hasard() * liste.length)];

// `cartes` : détails de toutes les cartes de l'extension (voir detailsExtension dans api.js)
export function tirerBooster(cartes, ext, hasard = Math.random) {
  const epoque = epoqueDe(ext);
  if (!epoque) throw new Error("Extension non jouable : " + ext.nom);

  const pools = {};
  for (const c of cartes) {
    const g = normalise(c.categorie || "") === "energie" ? "E" : groupe(c.rarete);
    if (g === "X") continue;
    (pools[g] = pools[g] || []).push({ ...c, groupe: g });
  }
  const tous = Object.values(pools).flat().filter((c) => c.groupe !== "E");
  if (!tous.length) throw new Error("Aucune carte exploitable dans cette extension.");

  const disponibles = new Set(Object.keys(pools).filter((g) => pools[g].length));
  const pour = (g) => (pools[g] && pools[g].length ? pools[g] : tous);
  // Reverse : commune, peu commune ou rare existant en version reverse
  const reverses = ["C", "U", "R", "RH"].flatMap((g) => pools[g] || []).filter((c) => (c.variantes || []).includes("Reverse"));
  const poolReverse = reverses.length ? reverses : [...(pools.C || []), ...(pools.U || [])].length ? [...(pools.C || []), ...(pools.U || [])] : tous;

  const taux = TAUX[epoque];
  const booster = [];
  const dejaTire = new Set();

  const tirer = (liste, variante = "Normale") => {
    let carte = dans(liste, hasard);
    for (let essai = 0; essai < 8 && dejaTire.has(carte.id) && carte.groupe !== "E"; essai++) carte = dans(liste, hasard);
    dejaTire.add(carte.id);
    return { ...carte, variante };
  };

  for (const slot of SLOTS[epoque]) {
    if (slot === "C") booster.push(tirer(pour("C")));
    else if (slot === "U") booster.push(tirer(pour("U")));
    else if (slot === "ENERGIE") booster.push(tirer(pools.E && pools.E.length ? pools.E : pour("C")));
    else if (slot === "REV") booster.push(tirer(poolReverse, "Reverse"));
    else {
      const g = choisirPondere(taux[slot], disponibles, hasard);
      if (g === null || g === "REV") booster.push(tirer(poolReverse, "Reverse"));
      else booster.push(tirer(pour(g)));
    }
  }
  return booster.sort((a, b) => importance(a) - importance(b) || (a.prix || 0) - (b.prix || 0));
}
