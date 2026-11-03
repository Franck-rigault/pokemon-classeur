// Données de l'utilisateur : collection, wishlist, historique, prix. Toute écriture passe par `stockage`
// (remplaçable pour les tests) puis met à jour l'état local et prévient les vues.
import { db, detailCarte, prixDe, message, euros, imageSecours, imageReelle } from "./api.js";
import { S, emettre } from "./etat.js";
import * as HL from "./horsligne.js";
import { journaliser } from "./journal.js";
import { proposerAnnulation } from "./annuler.js";

const PAGE = 1000;

// Écritures réelles sur le serveur
const reseau = {
  async lister(table, userId, tri) {
    const tout = [];
    for (let debut = 0; ; debut += PAGE) {
      let q = db.from(table).select("*").eq("user_id", userId);
      for (const [colonne, croissant] of tri) q = q.order(colonne, { ascending: croissant });
      const { data, error } = await q.range(debut, debut + PAGE - 1);
      if (error) throw error;
      tout.push(...data);
      if (data.length < PAGE) break;
    }
    return tout;
  },
  async inserer(table, lignes) {
    const { data, error } = await db.from(table).insert(lignes).select();
    if (error) throw error;
    return data;
  },
  async maj(table, id, champs) {
    const { error } = await db.from(table).update(champs).eq("id", id);
    if (error) throw error;
  },
  async supprimer(table, id) {
    const { error } = await db.from(table).delete().eq("id", id);
    if (error) throw error;
  },
};

// Rejoue les modifications faites hors-ligne (voir horsligne.js)
export const synchroniserFile = () => HL.synchroniser(reseau);

// Pour les tables de la collection : sans réseau, les lectures viennent de la copie locale et les écritures
// sont mises en attente ; les autres tables (jeu…) passent toujours par le serveur.
export const stockage = {
  async lister(table, userId, tri) {
    if (!HL.TABLES_FILE.has(table)) return reseau.lister(table, userId, tri);
    if (HL.taille() && HL.enLigne()) await synchroniserFile().catch(() => {});
    try {
      if (!HL.enLigne()) throw new TypeError("Failed to fetch");
      const lignes = await reseau.lister(table, userId, tri);
      HL.sauverListe(table, userId, lignes);
      return HL.taille() ? HL.appliquerFile(table, lignes, tri) : lignes;
    } catch (e) {
      if (!HL.estReseau(e)) throw e;
      const copie = await HL.lireListe(table, userId);
      if (!copie) throw new Error("Pas de connexion et aucune copie locale de vos données : ouvrez l'application une fois en ligne.");
      return HL.appliquerFile(table, copie, tri);
    }
  },
  async inserer(table, lignes) {
    const liste = Array.isArray(lignes) ? lignes : [lignes];
    if (!HL.TABLES_FILE.has(table)) return reseau.inserer(table, lignes);
    if (HL.enLigne()) {
      try {
        return await reseau.inserer(table, lignes);
      } catch (e) {
        if (!HL.estReseau(e)) throw e;
      }
    }
    return liste.map((l) => HL.enfilerInsertion(table, l));
  },
  async maj(table, id, champs) {
    if (!HL.TABLES_FILE.has(table)) return reseau.maj(table, id, champs);
    if (HL.enLigne() && !HL.estTemporaire(id)) {
      try {
        return await reseau.maj(table, id, champs);
      } catch (e) {
        if (!HL.estReseau(e)) throw e;
      }
    }
    HL.enfilerMaj(table, id, champs);
  },
  async supprimer(table, id) {
    if (!HL.TABLES_FILE.has(table)) return reseau.supprimer(table, id);
    if (HL.enLigne() && !HL.estTemporaire(id)) {
      try {
        return await reseau.supprimer(table, id);
      } catch (e) {
        if (!HL.estReseau(e)) throw e;
      }
    }
    HL.enfilerSuppression(table, id);
  },
};
const ecriture = () => {
  if (S.lectureSeule) throw new Error("Cette collection est en lecture seule.");
};

// ---------- Chargement ----------

export async function chargerDonnees(userId) {
  const [collection, souhaits] = await Promise.all([
    stockage.lister("collection", userId, [["set_id", true], ["local_id", true], ["id", true]]),
    stockage.lister("souhaits", userId, [["created_at", false]]),
  ]);
  // Sans image chez TCGdex : on tente une autre source (jamais enregistrée en base, seulement affichée)
  for (const l of [...collection, ...souhaits]) if (!l.image) l.image = imageSecours(l.set_id, l.local_id);
  S.collection = collection;
  S.souhaits = souhaits;
  emettre("collection");
  emettre("souhaits");
}

// ---------- Cartes ----------

// Champs de la ligne « collection » / « souhaits » à partir du détail TCGdex
export function champsCarte(d) {
  return {
    carte_id: d.id,
    set_id: d.set.id,
    nom: d.name,
    local_id: d.localId,
    categorie: d.category || null,
    rarete: d.rarity || null,
    image: imageReelle(d.image),
    dex_ids: d.dexId || [],
    valeur: prixDe(d),
    types: d.types || [],
    illustrateur: d.illustrator || null,
    pv: d.hp ? parseInt(d.hp, 10) || null : null,
    stade: d.stage || null,
    complet: true,
  };
}

// Champs de la table « souhaits » (moins riche que la collection)
export function champsSouhait(d) {
  return {
    carte_id: d.id,
    set_id: d.set.id,
    nom: d.name,
    local_id: d.localId,
    categorie: d.category || null,
    rarete: d.rarity || null,
    image: imageReelle(d.image),
    valeur: prixDe(d),
  };
}

// Même chose à partir de la liste courte (sans détail) : les informations manquantes sont complétées ensuite
export function champsCarteCourte(k) {
  return {
    carte_id: k.id,
    set_id: k.set_id,
    nom: k.name,
    local_id: k.localId,
    categorie: null,
    rarete: null,
    image: imageReelle(k.image),
    dex_ids: [],
    valeur: null,
    complet: false,
  };
}

const libelleExemplaire = (l) => [l.variante, l.grade_societe ? l.grade_societe + " " + (l.grade_note ?? "") : l.etat, l.set_id].filter(Boolean).join(" · ");

// Options : quantite, etat, variante, prix_achat, emplacement, grade_societe, grade_note
async function ajouter(champs, options = {}) {
  ecriture();
  const {
    quantite = 1, etat = "Neuf", variante = "Normale", prix_achat = null,
    emplacement = null, grade_societe = null, grade_note = null, silencieux = false,
    boutique = null, date_achat = null, facture = null, note = null,
  } = options;
  const existante = S.collection.find(
    (c) =>
      c.carte_id === champs.carte_id && c.variante === variante && c.etat === etat &&
      (c.emplacement || null) === (emplacement || null) &&
      (c.grade_societe || null) === (grade_societe || null) &&
      (c.grade_note ?? null) === (grade_note ?? null)
  );
  let ligne;
  if (existante) {
    await changerQuantite(existante, existante.quantite + quantite, { silencieux: true });
    ligne = existante;
  } else {
    const detailsAchat = {};
    if (boutique) detailsAchat.boutique = boutique;
    if (date_achat) detailsAchat.date_achat = date_achat;
    if (facture) detailsAchat.facture = facture;
    if (note) detailsAchat.note = note;
    [ligne] = await stockage.inserer("collection", {
      ...champs, quantite, etat, variante, prix_achat, emplacement, grade_societe, grade_note, ...detailsAchat,
    });
    S.collection.push(ligne);
    emettre("collection");
  }
  // Une carte obtenue quitte la wishlist
  const voeu = S.souhaits.find((x) => x.carte_id === champs.carte_id);
  if (voeu) await retirerSouhait(voeu, { silencieux: true }).catch(() => {});
  if (!silencieux) journaliser("ajout", "Ajout : " + champs.nom + (quantite > 1 ? " ×" + quantite : "") + " (" + libelleExemplaire(ligne) + ")", { carte_id: champs.carte_id, quantite });
  emettre("carte-ajoutee", { ligne, champs });
  return ligne;
}

export async function ajouterCarte(d, options) {
  return ajouter(champsCarte(d), options);
}

export async function ajouterCarteCourte(k, options) {
  const ligne = await ajouter(champsCarteCourte(k), options);
  if (!ligne.complet) completerDetails([ligne]);
  return ligne;
}

// Ajoute en une fois un exemplaire (Normale, Neuf) de chaque carte de la liste qu'on ne possède pas encore
export async function ajouterLot(cartes) {
  ecriture();
  const aAjouter = cartes.filter((k) => !S.collection.some((c) => c.carte_id === k.id));
  for (let i = 0; i < aAjouter.length; i += 200) {
    const lignes = aAjouter
      .slice(i, i + 200)
      .map((k) => ({ ...champsCarteCourte(k), quantite: 1, etat: "Neuf", variante: "Normale" }));
    const crees = await stockage.inserer("collection", lignes);
    S.collection.push(...crees);
    emettre("collection");
  }
  const souhaitsLiees = S.souhaits.filter((x) => aAjouter.some((k) => k.id === x.carte_id));
  for (const x of souhaitsLiees) await retirerSouhait(x, { silencieux: true }).catch(() => {});
  if (aAjouter.length) journaliser("ajout", "Ajout en lot : " + aAjouter.length + " carte(s)" + (aAjouter[0].set_id ? " de " + aAjouter[0].set_id : ""), { quantite: aAjouter.length });
  completerDetails();
  return aAjouter.length;
}

export async function changerQuantite(ligne, q, { silencieux = false } = {}) {
  ecriture();
  if (q < 1) return supprimerEntree(ligne, { annulable: !silencieux, silencieux });
  const ancienne = ligne.quantite;
  ligne.quantite = q;
  emettre("collection");
  try {
    await stockage.maj("collection", ligne.id, { quantite: q });
    if (!silencieux && q !== ancienne) journaliser(q > ancienne ? "ajout" : "retrait", (q > ancienne ? "Ajout : " : "Retrait : ") + ligne.nom + " ×" + Math.abs(q - ancienne) + " (" + libelleExemplaire(ligne) + ")", { carte_id: ligne.carte_id, quantite: Math.abs(q - ancienne) });
  } catch (e) {
    ligne.quantite = ancienne;
    emettre("collection");
    throw e;
  }
}

export async function modifierEntree(ligne, champs) {
  ecriture();
  const ancien = { ...ligne };
  Object.assign(ligne, champs);
  emettre("collection");
  try {
    await stockage.maj("collection", ligne.id, champs);
  } catch (e) {
    Object.assign(ligne, ancien);
    emettre("collection");
    throw e;
  }
}

const sansIdentite = (l) => Object.fromEntries(Object.entries(l).filter(([k]) => !["id", "user_id", "created_at"].includes(k)));

// Remet une ligne supprimée dans la collection (annulation)
async function restaurerLigne(copie) {
  const [ligne] = await stockage.inserer("collection", sansIdentite(copie));
  S.collection.push(ligne);
  emettre("collection");
  journaliser("ajout", "Annulation : " + copie.nom + " remise dans la collection", { carte_id: copie.carte_id, quantite: copie.quantite });
  return ligne;
}

// `annulable` : propose « Annuler » pendant quelques secondes (au lieu d'une fenêtre de confirmation)
export async function supprimerEntree(ligne, { annulable = true, silencieux = false } = {}) {
  ecriture();
  const copie = { ...ligne };
  await stockage.supprimer("collection", ligne.id);
  const i = S.collection.indexOf(ligne);
  if (i >= 0) S.collection.splice(i, 1);
  emettre("collection");
  if (!silencieux) journaliser("retrait", "Retrait : " + copie.nom + " ×" + copie.quantite + " (" + libelleExemplaire(copie) + ")", { carte_id: copie.carte_id, quantite: copie.quantite });
  if (annulable) proposerAnnulation("« " + copie.nom + " » retirée de la collection.", () => restaurerLigne(copie));
}

// Supprime plusieurs lignes d'un coup (une seule annulation pour tout)
export async function supprimerLot(lignes) {
  ecriture();
  const copies = lignes.map((l) => ({ ...l }));
  const retirees = [];
  for (let i = 0; i < lignes.length; i++) {
    try {
      await supprimerEntree(lignes[i], { annulable: false, silencieux: true });
      retirees.push(copies[i]);
    } catch { /* la ligne reste */ }
  }
  if (retirees.length) {
    journaliser("retrait", "Retrait en lot : " + retirees.length + " ligne(s)", { quantite: retirees.length });
    proposerAnnulation(retirees.length + " ligne(s) retirée(s) de la collection.", async () => { for (const c of retirees) await restaurerLigne(c); });
  }
  return retirees.length;
}

// Modifie plusieurs lignes d'un coup (état, rangement, variante, favori…). Retourne { faites, refusees }.
export async function modifierLot(lignes, champs, libelle = "Modification") {
  ecriture();
  let refusees = 0;
  const faites = [];
  for (const l of lignes) {
    const ancien = Object.fromEntries(Object.keys(champs).map((k) => [k, l[k]]));
    try { await modifierEntree(l, champs); faites.push([l, ancien]); } catch { refusees++; }
  }
  if (faites.length) {
    journaliser("modif", libelle + " : " + faites.length + " ligne(s)", { quantite: faites.length });
    proposerAnnulation(libelle + " : " + faites.length + " ligne(s) modifiée(s).", async () => { for (const [l, ancien] of faites) await modifierEntree(l, ancien); });
  }
  return { faites: faites.length, refusees };
}

// Doublons : ne garde qu'un exemplaire sur la ligne et déplace les autres vers un rangement
export async function separerExcedent(ligne, emplacement) {
  ecriture();
  const q = ligne.quantite;
  const cible = (emplacement || "").trim() || null;
  if (q < 2 || (ligne.emplacement || null) === cible) return null;
  const champs = {
    carte_id: ligne.carte_id, set_id: ligne.set_id, nom: ligne.nom, local_id: ligne.local_id, categorie: ligne.categorie, rarete: ligne.rarete,
    image: imageReelle(ligne.image), dex_ids: ligne.dex_ids || [], valeur: ligne.valeur, types: ligne.types || [], illustrateur: ligne.illustrateur,
    pv: ligne.pv, stade: ligne.stade, complet: ligne.complet,
  };
  await changerQuantite(ligne, 1, { silencieux: true });
  const destination = await ajouter(champs, {
    quantite: q - 1, etat: ligne.etat, variante: ligne.variante, prix_achat: ligne.prix_achat, emplacement: cible,
    grade_societe: ligne.grade_societe, grade_note: ligne.grade_note, silencieux: true,
  });
  journaliser("modif", "Doublons rangés : " + ligne.nom + " ×" + (q - 1) + " → " + (cible || "sans rangement"), { carte_id: ligne.carte_id, quantite: q - 1 });
  return { destination, ancienne: q, deplaces: q - 1 };
}

// ---------- Wishlist ----------

export async function souhaiter(d) {
  ecriture();
  if (S.souhaits.some((x) => x.carte_id === d.id)) return;
  const [ligne] = await stockage.inserer("souhaits", champsSouhait(d));
  S.souhaits.unshift(ligne);
  emettre("souhaits");
  journaliser("wishlist", "Wishlist : + " + d.name + " (" + d.set.id + ")", { carte_id: d.id });
}

export async function retirerSouhait(ligne, { silencieux = false } = {}) {
  ecriture();
  await stockage.supprimer("souhaits", ligne.id);
  const i = S.souhaits.indexOf(ligne);
  if (i >= 0) S.souhaits.splice(i, 1);
  emettre("souhaits");
  if (!silencieux) {
    journaliser("wishlist", "Wishlist : − " + ligne.nom + " (" + ligne.set_id + ")", { carte_id: ligne.carte_id });
    const copie = sansIdentite(ligne);
    proposerAnnulation("« " + ligne.nom + " » retirée de la wishlist.", async () => {
      const [nouvelle] = await stockage.inserer("souhaits", copie);
      S.souhaits.unshift(nouvelle);
      emettre("souhaits");
    });
  }
}

// ---------- Compléter les détails des lignes ajoutées « en rapide » ou reprises du classeur ----------

let completionEnCours = false;

export async function completerDetails(lignes = S.collection.filter((c) => !c.complet)) {
  if (S.lectureSeule || completionEnCours || !lignes.length || !navigator.onLine) return;
  completionEnCours = true;
  const file = [...lignes];
  const total = file.length;
  let faits = 0;
  const travailleur = async () => {
    while (file.length) {
      const l = file.shift();
      try {
        const d = await detailCarte(l.carte_id);
        const { carte_id, set_id, ...champs } = champsCarte(d);
        Object.assign(l, champs);
        if (!l.image) l.image = imageSecours(l.set_id, l.local_id);
        await stockage.maj("collection", l.id, champs);
      } catch {
        // on réessaiera au prochain chargement
      }
      faits++;
      if (total > 5 && faits % 10 === 0) message("Complétion des informations des cartes : " + faits + " / " + total + "…");
    }
  };
  await Promise.all(Array.from({ length: 5 }, travailleur));
  completionEnCours = false;
  if (total > 5) message("✔ Informations des cartes complétées.", "ok");
  emettre("collection");
}

// ---------- Statistiques ----------

export const valeurLigne = (c) => Number(c.valeur || 0) * c.quantite;

export function statistiques(lignes = S.collection) {
  const sets = new Set(lignes.map((c) => c.set_id));
  return {
    exemplaires: lignes.reduce((s, c) => s + c.quantite, 0),
    distinctes: new Set(lignes.map((c) => c.carte_id)).size,
    valeur: lignes.reduce((s, c) => s + valeurLigne(c), 0),
    extensions: sets.size,
  };
}

// ---------- Historique de la valeur (un point par jour, pour mon propre compte) ----------

export async function enregistrerInstantane() {
  if (S.lectureSeule || S.partage || !S.moi) return;
  const st = statistiques();
  const valeurWishlist = S.souhaits.reduce((s, x) => s + Number(x.valeur || 0), 0);
  const { error } = await db.from("historique").upsert(
    {
      user_id: S.moi.id,
      jour: new Date().toLocaleDateString("sv-SE"),
      valeur_possedee: st.valeur,
      valeur_wishlist: valeurWishlist,
      nb_possedes: st.exemplaires,
    },
    { onConflict: "user_id,jour" }
  );
  if (error) console.warn("Historique non enregistré :", error.message);
}

let minuteur = null;
export function planifierInstantane() {
  clearTimeout(minuteur);
  minuteur = setTimeout(enregistrerInstantane, 4000);
}

// ---------- Actualisation des prix ----------

export async function actualiserPrix() {
  ecriture();
  if (!navigator.onLine) return message("Actualiser les prix demande une connexion.", "ko");
  const ids = [...new Set(S.collection.map((c) => c.carte_id))];
  if (!ids.length) return message("Aucune carte dans la collection : rien à actualiser.", "ko");
  if (!confirm("Actualiser le prix de " + ids.length + " carte(s) ?")) return;

  const file = [...ids];
  let faits = 0, modifiees = 0, sansPrix = 0, echecs = 0;

  const travailleur = async () => {
    while (file.length) {
      const id = file.shift();
      try {
        const prix = prixDe(await detailCarte(id, true));
        if (prix === null) sansPrix++;
        else {
          const lignes = S.collection.filter((c) => c.carte_id === id);
          if (lignes.some((l) => Math.abs(prix - Number(l.valeur || 0)) >= 0.005)) {
            const { error } = await db
              .from("collection")
              .update({ valeur: prix })
              .eq("user_id", S.moi.id)
              .eq("carte_id", id);
            if (error) throw error;
            lignes.forEach((l) => (l.valeur = prix));
            for (const x of S.souhaits.filter((x) => x.carte_id === id)) {
              x.valeur = prix;
              await stockage.maj("souhaits", x.id, { valeur: prix });
            }
            modifiees++;
          }
        }
      } catch {
        echecs++;
      }
      faits++;
      message("Actualisation des prix : " + faits + " / " + ids.length + "…");
    }
  };

  await Promise.all(Array.from({ length: 6 }, travailleur));
  emettre("collection");
  emettre("souhaits");
  message(
    "✔ Prix actualisés : " + modifiees + " modifié(s), " + (ids.length - modifiees - sansPrix - echecs) +
      " inchangé(s), " + sansPrix + " sans prix" + (echecs ? ", " + echecs + " en échec" : "") +
      ". Valeur : " + euros(statistiques().valeur) + ".",
    echecs ? "ko" : "ok"
  );
  enregistrerInstantane();
}
