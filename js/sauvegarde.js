// Sauvegarde complète (fichier JSON) et restauration : collection, wishlist, scellés, classeurs virtuels, classeur Pokémon,
// jeu Fake Booster et historique de valeur. La restauration peut fusionner (ajouter ce qui manque) ou tout remplacer.
import { $, h, db, essayer, message } from "./api.js";
import { S } from "./etat.js";

const FORMAT = "classeur-pokemon-sauvegarde";
const VERSION = 1;
const IGNORES = ["id", "user_id", "created_at"];

// Tables sauvegardées, dans l'ordre de restauration (les classeurs avant leurs cases)
export const TABLES = [
  ["collection", "Cartes de la collection"],
  ["souhaits", "Wishlist"],
  ["produits", "Produits scellés"],
  ["classeurs", "Classeurs virtuels"],
  ["classeur_cases", "Cases des classeurs virtuels"],
  ["pokemon", "Classeur Pokémon"],
  ["jeu_cartes", "Cartes du jeu Fake Booster"],
  ["jeu_joueurs", "Compteurs et pièces du jeu"],
  ["historique", "Historique de la valeur"],
];

// Accès à la base (remplaçable pour les tests)
export const sauvegardeStock = {
  async lister(table) {
    const tout = [];
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await db.from(table).select("*").eq("user_id", S.moi.id).order(table === "historique" ? "jour" : "id", { ascending: true }).range(debut, debut + 999);
      if (error) throw error;
      tout.push(...data);
      if (data.length < 1000) break;
    }
    return tout;
  },
  async inserer(table, lignes) {
    const crees = [];
    for (let i = 0; i < lignes.length; i += 400) {
      const { data, error } = await db.from(table).insert(lignes.slice(i, i + 400)).select();
      if (error) throw new Error(table + " : " + error.message);
      crees.push(...data);
    }
    return crees;
  },
  async maj(table, id, champs) {
    const { error } = await db.from(table).update(champs).eq("id", id);
    if (error) throw new Error(table + " : " + error.message);
  },
  async upsertIgnorer(table, lignes, conflit) {
    for (let i = 0; i < lignes.length; i += 400) {
      const { error } = await db.from(table).upsert(lignes.slice(i, i + 400), { onConflict: conflit, ignoreDuplicates: true });
      if (error) throw new Error(table + " : " + error.message);
    }
  },
  async viderTable(table) {
    const { error } = await db.from(table).delete().eq("user_id", S.moi.id);
    if (error) throw new Error(table + " : " + error.message);
  },
};

// ---------- Création de la sauvegarde ----------

export async function creerSauvegarde() {
  if (S.lectureSeule || S.partage) throw new Error("La sauvegarde ne concerne que votre propre collection.");
  const tables = {};
  const manquantes = [];
  const delocal = { collection: S.collection, souhaits: S.souhaits };
  for (const [table] of TABLES) {
    if (delocal[table]) {
      tables[table] = delocal[table];
      continue;
    }
    try {
      tables[table] = await sauvegardeStock.lister(table);
    } catch {
      tables[table] = [];
      manquantes.push(table);
    }
  }
  return {
    sauvegarde: { format: FORMAT, version: VERSION, date: new Date().toISOString(), compte: S.profil ? S.profil.nom : null, manquantes },
    tables,
  };
}

function telecharger(contenu, nom) {
  const blob = new Blob([JSON.stringify(contenu)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const nomFichier = () => "sauvegarde-classeur-" + new Date().toLocaleDateString("sv-SE") + ".json";

export async function telechargerSauvegarde() {
  const s = await creerSauvegarde();
  telecharger(s, nomFichier());
  const total = Object.values(s.tables).reduce((n, l) => n + l.length, 0);
  message("✔ Sauvegarde téléchargée (" + total + " lignes)." + (s.sauvegarde.manquantes.length ? " Non incluses (indisponibles) : " + s.sauvegarde.manquantes.join(", ") + "." : ""), "ok");
  return s;
}

// ---------- Lecture et vérification d'un fichier ----------

export function lireSauvegarde(texte) {
  let s;
  try {
    s = JSON.parse(texte);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.");
  }
  if (!s || !s.sauvegarde || s.sauvegarde.format !== FORMAT || !s.tables) throw new Error("Ce fichier n'est pas une sauvegarde de cette application.");
  if (s.sauvegarde.version > VERSION) throw new Error("Cette sauvegarde vient d'une version plus récente de l'application.");
  for (const [table] of TABLES) if (!Array.isArray(s.tables[table])) s.tables[table] = [];
  return s;
}

const nettoyer = (ligne) => Object.fromEntries(Object.entries(ligne).filter(([k]) => !IGNORES.includes(k)));
const cleCarte = (c) => [c.carte_id, c.variante, c.etat, c.grade_societe || "", c.grade_note ?? "", c.emplacement || ""].join("|");

// ---------- Restauration ----------

// mode : "fusion" (ajoute ce qui manque, ne supprime rien) ou "remplace" (efface d'abord les données actuelles)
// Retourne le nombre de lignes ajoutées par table.
export async function restaurer(s, mode) {
  const stock = sauvegardeStock;
  const ajoutes = {};
  const T = s.tables;

  if (mode === "remplace") {
    // classeurs avant cases (suppression en cascade), jeu_joueurs remis à zéro plus bas
    for (const table of ["classeurs", "collection", "souhaits", "produits", "pokemon", "jeu_cartes", "historique"]) {
      try { await stock.viderTable(table); } catch (e) { if (T[table].length) throw e; }
    }
  }
  const actuel = async (table) => {
    try { return await stock.lister(table); } catch { return []; }
  };

  // Collection
  {
    const existantes = new Set((await actuel("collection")).map(cleCarte));
    const nouvelles = T.collection.filter((c) => !existantes.has(cleCarte(c))).map(nettoyer);
    await stock.inserer("collection", nouvelles);
    ajoutes.collection = nouvelles.length;
  }
  // Wishlist
  {
    const deja = new Set((await actuel("souhaits")).map((x) => x.carte_id));
    const nouvelles = T.souhaits.filter((x) => !deja.has(x.carte_id)).map(nettoyer);
    await stock.inserer("souhaits", nouvelles);
    ajoutes.souhaits = nouvelles.length;
  }
  // Produits scellés
  {
    const cle = (p) => [p.nom, p.type, p.set_id || "", p.quantite, p.prix_achat ?? "", p.date_achat || ""].join("|");
    const deja = new Set((await actuel("produits")).map(cle));
    const nouvelles = T.produits.filter((p) => !deja.has(cle(p))).map(nettoyer);
    await stock.inserer("produits", nouvelles);
    ajoutes.produits = nouvelles.length;
  }
  // Classeurs virtuels : un classeur du même nom est réutilisé, ses cases libres sont complétées
  {
    const presents = await actuel("classeurs");
    const idVers = new Map(); // ancien id -> id actuel
    const aCreer = [];
    for (const c of T.classeurs) {
      const meme = presents.find((p) => p.nom === c.nom);
      if (meme) idVers.set(c.id, meme.id);
      else aCreer.push(c);
    }
    const crees = await stock.inserer("classeurs", aCreer.map(nettoyer));
    aCreer.forEach((c, i) => idVers.set(c.id, crees[i].id));
    ajoutes.classeurs = crees.length;

    const occupees = new Set((await actuel("classeur_cases")).map((c) => [c.classeur_id, c.page, c.position].join("|")));
    const cases = [];
    for (const c of T.classeur_cases) {
      const classeur = idVers.get(c.classeur_id);
      if (classeur === undefined) continue;
      const cle = [classeur, c.page, c.position].join("|");
      if (occupees.has(cle)) continue;
      occupees.add(cle);
      cases.push({ ...nettoyer(c), classeur_id: classeur });
    }
    await stock.inserer("classeur_cases", cases);
    ajoutes.classeur_cases = cases.length;
  }
  // Classeur Pokémon : une ligne par Pokémon ; on complète les lignes existantes quand la sauvegarde a plus d'informations
  {
    const presents = await actuel("pokemon");
    const parNumero = new Map(presents.map((p) => [p.numero ?? p.nom, p]));
    const nouvelles = [];
    let misesAJour = 0;
    for (const l of T.pokemon) {
      const existante = parNumero.get(l.numero ?? l.nom);
      if (!existante) {
        nouvelles.push(nettoyer(l));
      } else if (l.possede && !existante.possede) {
        await stock.maj("pokemon", existante.id, nettoyer(l));
        misesAJour++;
      }
    }
    await stock.inserer("pokemon", nouvelles);
    ajoutes.pokemon = nouvelles.length + misesAJour;
  }
  // Jeu : cartes sans doublon, compteurs au plus haut
  {
    const deja = new Set((await actuel("jeu_cartes")).map((c) => c.carte_id));
    const nouvelles = T.jeu_cartes.filter((c) => !deja.has(c.carte_id)).map(nettoyer);
    await stock.inserer("jeu_cartes", nouvelles);
    ajoutes.jeu_cartes = nouvelles.length;

    const [sauve] = T.jeu_joueurs;
    if (sauve) {
      const [courant] = await actuel("jeu_joueurs");
      const champs = nettoyer(sauve);
      delete champs.jour;
      if (courant) {
        const plafond = {};
        for (const k of ["paquets_total", "doublons", "pieces"]) plafond[k] = Math.max(Number(courant[k] || 0), Number(champs[k] || 0));
        if (champs.succes || courant.succes) plafond.succes = { ...(courant.succes || {}), ...(champs.succes || {}) };
        await stock.maj("jeu_joueurs", courant.id, mode === "remplace" ? champs : plafond);
      } else {
        await stock.inserer("jeu_joueurs", [champs]);
      }
      ajoutes.jeu_joueurs = 1;
    }
  }
  // Historique : on n'écrase jamais un jour déjà enregistré
  {
    const lignes = T.historique.map((l) => ({ ...nettoyer(l), user_id: S.moi.id }));
    await stock.upsertIgnorer("historique", lignes, "user_id,jour");
    ajoutes.historique = lignes.length;
  }
  return ajoutes;
}

// ---------- Fenêtre ----------

export function ouvrirSauvegarde() {
  const zone = $("sauvegarde-contenu");
  const retour = h("p", { class: "msg" });
  const detail = h("div", {});
  let contenu = null;

  const fichier = h("input", { type: "file", accept: ".json,application/json", "aria-label": "Fichier de sauvegarde" });
  const mode = (valeur, texte, coche) => h("label", { class: "case" }, h("input", { type: "radio", name: "mode-restauration", value: valeur, checked: coche }), " " + texte);
  const modes = h("div", { class: "choix-mode" },
    mode("fusion", "Fusionner : ajouter ce qui manque, sans rien supprimer (recommandé)", true),
    mode("remplace", "Remplacer : effacer mes données actuelles puis tout restaurer", false)
  );
  const boutonRestaurer = h("button", { type: "button", disabled: true }, "♻ Restaurer");
  const bloc = h("div", { class: "carte-bloc", hidden: true }, h("h3", {}, "Contenu du fichier"), detail, modes, boutonRestaurer);

  fichier.addEventListener("change", () => essayer(async () => {
    bloc.hidden = true;
    boutonRestaurer.disabled = true;
    retour.textContent = "";
    contenu = null;
    const f = fichier.files[0];
    if (!f) return;
    try {
      contenu = lireSauvegarde(await f.text());
    } catch (e) {
      retour.className = "msg ko";
      retour.textContent = e.message;
      return;
    }
    const date = contenu.sauvegarde.date ? new Date(contenu.sauvegarde.date).toLocaleString("fr-FR") : "date inconnue";
    detail.replaceChildren(
      h("p", { class: "muted" }, "Sauvegarde du " + date + (contenu.sauvegarde.compte ? " (compte « " + contenu.sauvegarde.compte + " »)" : "")),
      h("ul", { class: "liste-sauvegarde" }, TABLES.filter(([t]) => contenu.tables[t].length).map(([t, nom]) => h("li", {}, h("span", {}, nom), h("b", {}, contenu.tables[t].length))))
    );
    bloc.hidden = false;
    boutonRestaurer.disabled = false;
  }));

  boutonRestaurer.addEventListener("click", () => essayer(async () => {
    if (!contenu) return;
    if (!navigator.onLine) return message("La restauration demande une connexion.", "ko");
    const choisi = zone.querySelector('input[name="mode-restauration"]:checked').value;
    if (choisi === "remplace") {
      if (!confirm("Remplacer toutes vos données actuelles par celles de ce fichier ?\n\nUne sauvegarde de vos données actuelles va d'abord être téléchargée.")) return;
      await telechargerSauvegarde();
    }
    boutonRestaurer.disabled = true;
    retour.className = "msg";
    retour.textContent = "Restauration en cours…";
    try {
      const ajoutes = await restaurer(contenu, choisi);
      const total = Object.values(ajoutes).reduce((n, v) => n + v, 0);
      retour.className = "msg ok";
      retour.textContent = "✔ Restauration terminée : " + total + " ligne(s) ajoutée(s). Rechargement…";
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      boutonRestaurer.disabled = false;
      retour.className = "msg ko";
      retour.textContent = "Restauration interrompue : " + e.message + " — relancez-la en mode « Fusionner » pour reprendre sans doublon.";
    }
  }));

  zone.replaceChildren(
    h("section", { class: "carte-bloc" },
      h("h3", {}, "Télécharger une sauvegarde"),
      h("p", { class: "muted" }, "Un seul fichier JSON avec vos cartes, wishlist, scellés, classeurs, classeur Pokémon, jeu et historique. À faire avant une manipulation risquée."),
      h("button", { type: "button", onclick: () => essayer(telechargerSauvegarde) }, "⬇ Télécharger la sauvegarde")
    ),
    h("section", { class: "carte-bloc" },
      h("h3", {}, "Restaurer depuis un fichier"),
      fichier
    ),
    bloc,
    retour
  );
  $("sauvegarde").showModal();
}
