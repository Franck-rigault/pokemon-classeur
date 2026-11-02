// Données privées du compte : produits scellés, journal d'ouverture de boosters, classeurs virtuels.
import { stockage } from "./donnees.js";
import { S, emettre } from "./etat.js";

const ecriture = () => {
  if (S.lectureSeule || S.partage || !S.moi) throw new Error("Action impossible en lecture seule.");
};

export async function chargerExtra(force = false) {
  if (S.extraCharge && !force) return;
  ecriture();
  const id = S.moi.id;
  const [produits, ouvertures, classeurs, cases] = await Promise.all([
    stockage.lister("produits", id, [["created_at", false]]),
    stockage.lister("ouvertures", id, [["date", false], ["id", false]]),
    stockage.lister("classeurs", id, [["id", true]]),
    stockage.lister("classeur_cases", id, [["id", true]]),
  ]);
  Object.assign(S, { produits, ouvertures, classeurs, cases, extraCharge: true });
  for (const nom of ["produits", "ouvertures", "classeurs", "classeur_cases"]) emettre(nom);
}

// Clé de S correspondant à chaque table
const CLES = { produits: "produits", ouvertures: "ouvertures", classeurs: "classeurs", classeur_cases: "cases" };

export async function ajouterLigne(table, champs) {
  ecriture();
  const [ligne] = await stockage.inserer(table, champs);
  S[CLES[table]].push(ligne);
  emettre(table);
  return ligne;
}

export async function majLigne(table, ligne, champs) {
  ecriture();
  const ancien = { ...ligne };
  Object.assign(ligne, champs);
  emettre(table);
  try {
    await stockage.maj(table, ligne.id, champs);
  } catch (e) {
    Object.assign(ligne, ancien);
    emettre(table);
    throw e;
  }
}

export async function supprimerLigne(table, ligne) {
  ecriture();
  await stockage.supprimer(table, ligne.id);
  const liste = S[CLES[table]];
  const i = liste.indexOf(ligne);
  if (i >= 0) liste.splice(i, 1);
  if (table === "classeurs") S.cases = S.cases.filter((c) => c.classeur_id !== ligne.id); // supprimées en cascade côté base
  emettre(table);
  if (table === "classeurs") emettre("classeur_cases");
}

// ---------- Classeurs virtuels ----------

export const caseDe = (classeurId, page, position) =>
  S.cases.find((c) => c.classeur_id === classeurId && c.page === page && c.position === position);

// Place une carte de la collection dans une case (remplace le contenu éventuel)
export async function poserCarte(classeur, page, position, ligneCollection) {
  const contenu = {
    carte_id: ligneCollection.carte_id,
    set_id: ligneCollection.set_id,
    nom: ligneCollection.nom,
    local_id: ligneCollection.local_id,
    image: ligneCollection.image,
    rarete: ligneCollection.rarete,
    valeur: ligneCollection.valeur,
  };
  const existante = caseDe(classeur.id, page, position);
  if (existante) return majLigne("classeur_cases", existante, contenu);
  return ajouterLigne("classeur_cases", { classeur_id: classeur.id, page, position, ...contenu });
}

// Déplace (ou échange) le contenu d'une case vers une autre position
export async function deplacerCase(source, page, position) {
  ecriture();
  if (source.page === page && source.position === position) return;
  const cible = caseDe(source.classeur_id, page, position);
  const dePage = source.page, dePosition = source.position;
  if (!cible) return majLigne("classeur_cases", source, { page, position });
  // Échange en trois temps : la contrainte d'unicité interdit deux cases à la même position
  await majLigne("classeur_cases", source, { page: -1, position: -1 });
  await majLigne("classeur_cases", cible, { page: dePage, position: dePosition });
  await majLigne("classeur_cases", source, { page, position });
}
