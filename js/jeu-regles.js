// Règles du jeu « Fake Booster » : quelles extensions sont jouables, de quoi est fait un booster,
// avec quelles probabilités tombent les cartes rares, et combien vaut un booster.
// Ce module n'utilise aucune API du navigateur : il sert aussi au script quotidien de calcul des prix (scripts/).
//
// IMPORTANT : The Pokémon Company ne publie PAS les taux de drop officiels. Les valeurs ci-dessous sont des
// ESTIMATIONS inspirées des statistiques d'ouverture de la communauté, époque par époque. Elles sont volontairement
// regroupées ici (TAUX) pour pouvoir être ajustées facilement : ce sont des poids relatifs, pas des pourcentages exacts.
import { normalise } from "./texte.js";

// ---------- Économie ----------

// 1 pièce gagnée par carte en double ; un booster coûte à peu près sa valeur moyenne en euros (1 € ≈ 1 pièce).
export const PIECES_PAR_DOUBLON = 1;
export const PIECES_PAR_EURO = 1;
export const PRIX_MINI = 2;

// Valeur moyenne d'un booster (en €) utilisée tant que les prix du jour ne sont pas disponibles
export const VALEUR_PAR_DEFAUT = { ev: 3, swsh: 3, sm: 4, xy: 5, bw: 8, inter: 15, classique: 60 };

export const prixEnPieces = (valeurEuros) => Math.max(PRIX_MINI, Math.round(valeurEuros * PIECES_PAR_EURO));

// ---------- Groupes de rareté ----------

// Du moins bon au meilleur. `ordre` sert au tri (la meilleure carte est révélée en dernier).
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
const EXCLUS = /promo|black star|kit|mcdonald|wizards|collection|anniversaire|celebration|energie|galerie|galaroise|coffre/;

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

// Répartit les cartes de l'extension en « réserves » par groupe de rareté (commune, peu commune, rare…)
function preparer(cartes, ext) {
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
  const communes = [...(pools.C || []), ...(pools.U || [])];
  const poolReverse = reverses.length ? reverses : communes.length ? communes : tous;
  return { epoque, pools, tous, disponibles, pour, poolReverse, taux: TAUX[epoque] };
}

// Groupes possibles d'un emplacement avec leur poids (REV = carte reverse)
const entrees = (table, disponibles) => Object.entries(table).filter(([g, poids]) => poids > 0 && (g === "REV" || disponibles.has(g)));

function choisirPondere(table, disponibles, hasard) {
  const liste = entrees(table, disponibles);
  const total = liste.reduce((s, [, p]) => s + p, 0);
  if (!liste.length || total <= 0) return null;
  let t = hasard() * total;
  for (const [g, p] of liste) {
    t -= p;
    if (t < 0) return g;
  }
  return liste[liste.length - 1][0];
}

const dans = (liste, hasard) => liste[Math.floor(hasard() * liste.length)];

// `cartes` : détails de toutes les cartes de l'extension (voir detailsExtension dans api.js)
export function tirerBooster(cartes, ext, hasard = Math.random) {
  const { epoque, pools, pour, poolReverse, disponibles, taux } = preparer(cartes, ext);
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

// ---------- Valeur d'un booster ----------

const moyenne = (liste) => (liste.length ? liste.reduce((s, c) => s + (c.prix || 0), 0) / liste.length : 0);

// Valeur moyenne (en €) d'un booster de cette extension : somme, emplacement par emplacement, des prix moyens
// des cartes pondérés par leurs probabilités (calcul exact, sans tirage au sort).
export function valeurEsperee(cartes, ext) {
  const { epoque, pools, pour, poolReverse, disponibles, taux } = preparer(cartes, ext);
  const valeurReverse = moyenne(poolReverse);
  let total = 0;
  for (const slot of SLOTS[epoque]) {
    if (slot === "C") total += moyenne(pour("C"));
    else if (slot === "U") total += moyenne(pour("U"));
    else if (slot === "ENERGIE") total += moyenne(pools.E && pools.E.length ? pools.E : pour("C"));
    else if (slot === "REV") total += valeurReverse;
    else {
      const liste = entrees(taux[slot], disponibles);
      const poids = liste.reduce((s, [, p]) => s + p, 0);
      if (!liste.length || poids <= 0) total += valeurReverse;
      else total += liste.reduce((s, [g, p]) => s + (p / poids) * (g === "REV" ? valeurReverse : moyenne(pour(g))), 0);
    }
  }
  return total;
}
