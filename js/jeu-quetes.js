// Quêtes et succès du jeu « Fake Booster » : objectifs à atteindre, récompensés en pièces.
// Module sans accès au navigateur : les progrès se calculent à partir de l'inventaire et des compteurs du joueur.
import { groupe, GROUPES } from "./jeu-regles.js";

// Progrès actuel du joueur : { paquets, doublons, uniques, extensions, valeur, meilleure, groupes: { IR: 3, … } }
export function statsJeu(cartes, joueur) {
  const groupes = {};
  let valeur = 0;
  let meilleure = 0;
  for (const c of cartes) {
    const g = groupe(c.rarete);
    groupes[g] = (groupes[g] || 0) + 1;
    const v = Number(c.valeur || 0);
    valeur += v;
    if (v > meilleure) meilleure = v;
  }
  return {
    paquets: Number(joueur.paquets_total || 0),
    doublons: Number(joueur.doublons || 0),
    uniques: cartes.length,
    extensions: new Set(cartes.map((c) => c.set_id)).size,
    valeur,
    meilleure,
    groupes,
  };
}

// Paliers : [objectif, récompense en pièces]
const serie = (prefixe, categorie, icone, paliers, titre, valeur, unite = "") =>
  paliers.map(([cible, recompense]) => ({ id: prefixe + cible, categorie, icone, titre: titre(cible), cible, recompense, valeur, unite }));

export const QUETES = [
  ...serie("boosters", "Boosters", "🎁", [[1, 2], [10, 5], [20, 10], [50, 25], [100, 50], [250, 100], [500, 200], [1000, 400]],
    (n) => (n === 1 ? "Ouvrir son premier booster" : "Ouvrir " + n + " boosters"), (s) => s.paquets),
  ...serie("doublons", "Doublons", "🔁", [[10, 3], [50, 10], [200, 30], [1000, 100]], (n) => "Obtenir " + n + " doublons", (s) => s.doublons),
  ...serie("uniques", "Collection", "🗂", [[25, 5], [100, 15], [250, 40], [500, 80], [1000, 150]], (n) => "Réunir " + n + " cartes différentes", (s) => s.uniques),
  ...serie("extensions", "Collection", "📚", [[3, 5], [10, 15], [25, 40], [50, 100]], (n) => "Obtenir des cartes de " + n + " extensions", (s) => s.extensions),
  ...serie("valeur", "Valeur", "💶", [[50, 10], [200, 30], [1000, 100], [5000, 300]], (n) => "Collection de jeu valant " + n + " €", (s) => s.valeur, " €"),
  ...serie("meilleure", "Valeur", "💎", [[10, 5], [50, 15], [100, 40], [500, 150]], (n) => "Obtenir une carte valant au moins " + n + " €", (s) => s.meilleure, " €"),
  // Raretés : une quête « une carte », et des paliers plus longs pour les plus belles
  ...[["DR", 3], ["AS", 5], ["UR", 5], ["SH", 8], ["IR", 10], ["SIR", 25], ["HR", 30]].map(([g, recompense]) => ({
    id: "rarete-" + g, categorie: "Raretés", icone: "✨", titre: "Obtenir une carte « " + GROUPES[g].nom + " »", cible: 1, recompense, valeur: (s) => s.groupes[g] || 0, unite: "",
  })),
  { id: "rarete-IR-5", categorie: "Raretés", icone: "🌸", titre: "Obtenir 5 « Illustration rare »", cible: 5, recompense: 40, valeur: (s) => s.groupes.IR || 0, unite: "" },
  { id: "rarete-SIR-3", categorie: "Raretés", icone: "🌟", titre: "Obtenir 3 « Illustration spéciale rare »", cible: 3, recompense: 75, valeur: (s) => s.groupes.SIR || 0, unite: "" },
];

export const progres = (q, stats) => Math.min(q.cible, q.valeur(stats));
export const terminee = (q, stats) => q.valeur(stats) >= q.cible;

// Quêtes terminées dont la récompense n'a pas encore été récupérée
export const arecuperer = (stats, succes = {}) => QUETES.filter((q) => terminee(q, stats) && !succes[q.id]);
