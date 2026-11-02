// État partagé de l'application et bus d'évènements entre les vues.

export const S = {
  moi: null, // { id, email } : le compte connecté
  profil: null, // mon profil (nom, classeur_actif)
  profils: [], // tous les profils (pour consulter la collection de l'autre)
  cible: null, // identifiant de la personne dont on affiche la collection
  lectureSeule: false, // vrai pour la collection de l'autre ou un lien de partage
  partage: false, // vrai en mode lien de partage public
  collection: [], // lignes de la table « collection » de la cible
  souhaits: [], // lignes de la table « souhaits » de la cible
  extensions: [], // référentiel des extensions (extensions.json), de la plus récente à la plus ancienne
  extParId: new Map(),
  ordreExt: new Map(), // id d'extension -> rang (0 = la plus récente)
  pokemon: [], // référentiel des Pokémon { n, nom }
};

export const evenements = new EventTarget();
export const emettre = (nom, detail) => evenements.dispatchEvent(new CustomEvent(nom, { detail }));
