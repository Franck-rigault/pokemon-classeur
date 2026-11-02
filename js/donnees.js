// Données de l'utilisateur : collection, wishlist, historique, prix. Toute écriture passe par `stockage`
// (remplaçable pour les tests) puis met à jour l'état local et prévient les vues.
import { db, detailCarte, prixDe, message, euros } from "./api.js";
import { S, emettre } from "./etat.js";

const PAGE = 1000;

export const stockage = {
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

const ecriture = () => {
  if (S.lectureSeule) throw new Error("Cette collection est en lecture seule.");
};

// ---------- Chargement ----------

export async function chargerDonnees(userId) {
  const [collection, souhaits] = await Promise.all([
    stockage.lister("collection", userId, [["set_id", true], ["local_id", true], ["id", true]]),
    stockage.lister("souhaits", userId, [["created_at", false]]),
  ]);
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
    image: d.image || null,
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
    image: d.image || null,
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
    image: k.image || null,
    dex_ids: [],
    valeur: null,
    complet: false,
  };
}

// Options : quantite, etat, variante, prix_achat, emplacement, grade_societe, grade_note
async function ajouter(champs, options = {}) {
  ecriture();
  const {
    quantite = 1, etat = "Neuf", variante = "Normale", prix_achat = null,
    emplacement = null, grade_societe = null, grade_note = null,
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
    await changerQuantite(existante, existante.quantite + quantite);
    ligne = existante;
  } else {
    [ligne] = await stockage.inserer("collection", {
      ...champs, quantite, etat, variante, prix_achat, emplacement, grade_societe, grade_note,
    });
    S.collection.push(ligne);
    emettre("collection");
  }
  // Une carte obtenue quitte la wishlist
  const voeu = S.souhaits.find((x) => x.carte_id === champs.carte_id);
  if (voeu) await retirerSouhait(voeu).catch(() => {});
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
  for (const x of souhaitsLiees) await retirerSouhait(x).catch(() => {});
  completerDetails();
  return aAjouter.length;
}

export async function changerQuantite(ligne, q) {
  ecriture();
  if (q < 1) return supprimerEntree(ligne);
  const ancienne = ligne.quantite;
  ligne.quantite = q;
  emettre("collection");
  try {
    await stockage.maj("collection", ligne.id, { quantite: q });
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

export async function supprimerEntree(ligne) {
  ecriture();
  await stockage.supprimer("collection", ligne.id);
  const i = S.collection.indexOf(ligne);
  if (i >= 0) S.collection.splice(i, 1);
  emettre("collection");
}

// ---------- Wishlist ----------

export async function souhaiter(d) {
  ecriture();
  if (S.souhaits.some((x) => x.carte_id === d.id)) return;
  const [ligne] = await stockage.inserer("souhaits", champsSouhait(d));
  S.souhaits.unshift(ligne);
  emettre("souhaits");
}

export async function retirerSouhait(ligne) {
  ecriture();
  await stockage.supprimer("souhaits", ligne.id);
  const i = S.souhaits.indexOf(ligne);
  if (i >= 0) S.souhaits.splice(i, 1);
  emettre("souhaits");
}

// ---------- Compléter les détails des lignes ajoutées « en rapide » ou reprises du classeur ----------

let completionEnCours = false;

export async function completerDetails(lignes = S.collection.filter((c) => !c.complet)) {
  if (S.lectureSeule || completionEnCours || !lignes.length) return;
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
