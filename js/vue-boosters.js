// Vue « Boosters » : journal d'ouverture avec statistiques (coût, valeur obtenue, raretés par booster).
import { $, h, euros, essayer, message, libelleExt, annee, imageCarte, cartesDExtension, detailCarte, prixDe, normalise } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { chargerExtra, ajouterLigne, majLigne, supprimerLigne } from "./donnees-extra.js";

let redessiner = null;

export const vueBoosters = {
  async monter(conteneur) {
    conteneur.replaceChildren(h("p", { class: "msg" }, "Chargement…"));
    try {
      await chargerExtra();
    } catch (e) {
      return conteneur.replaceChildren(h("p", { class: "msg ko" }, "Indisponible : " + e.message + " — la migration schema-v4.sql a-t-elle été lancée ?"));
    }

    const stats = h("div", { class: "dash-tuiles" });
    const chances = h("section", { class: "panneau" });
    const liste = h("div", { class: "ouvertures" });

    const valeurDe = (o) => (o.cartes || []).reduce((s, c) => s + Number(c.valeur || 0) * (c.qte || 1), 0);

    function dessiner() {
      const boosters = S.ouvertures.reduce((s, o) => s + o.nb_boosters, 0);
      const cout = S.ouvertures.reduce((s, o) => s + Number(o.cout || 0), 0);
      const valeur = S.ouvertures.reduce((s, o) => s + valeurDe(o), 0);
      const net = valeur - cout;
      stats.replaceChildren(
        ...[[boosters, "Boosters ouverts"], [euros(cout), "Dépensé"], [euros(valeur), "Valeur des cartes obtenues"], [(net >= 0 ? "+" : "") + euros(net), "Résultat"]].map(([v, l]) =>
          h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l))
        )
      );

      // Chances : nombre de cartes de chaque rareté obtenues, par booster ouvert
      const parRarete = new Map();
      for (const o of S.ouvertures) for (const c of o.cartes || []) parRarete.set(c.rarete || "Inconnue", (parRarete.get(c.rarete || "Inconnue") || 0) + (c.qte || 1));
      chances.hidden = !boosters;
      chances.replaceChildren(
        h("h3", {}, "Ce que donne un booster"),
        h("div", { class: "table-simple" },
          [...parRarete].sort((a, b) => b[1] - a[1]).map(([rarete, n]) =>
            h("div", { class: "ligne" }, h("span", {}, rarete), h("b", {}, n + " cartes"), h("span", { class: "muted" }, (n / boosters).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " par booster"))
          )
        )
      );

      const tries = [...S.ouvertures].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      liste.replaceChildren(
        ...(tries.length ? tries.map(carte) : [h("p", { class: "muted" }, "Aucune ouverture enregistrée. Notez ce que vous obtenez pour suivre vos chances et vos résultats.")])
      );
    }

    function carte(o) {
      const cartes = o.cartes || [];
      return h("div", { class: "ouverture" },
        h("div", { class: "produit-tete" },
          h("b", {}, libelleExt(o.set_id)),
          h("span", { class: "muted" }, new Date(o.date).toLocaleDateString("fr-FR") + " · " + o.nb_boosters + " booster" + (o.nb_boosters > 1 ? "s" : "") + (o.cout != null ? " · " + euros(o.cout) : "") + " · cartes : " + euros(valeurDe(o)))
        ),
        h("div", { class: "vignettes" },
          cartes.slice(0, 40).map((c) => h("span", { class: "vignette", title: c.nom + (c.rarete ? " · " + c.rarete : "") + (c.qte > 1 ? " ×" + c.qte : "") },
            c.image ? h("img", { src: imageCarte(c.image), alt: c.nom, loading: "lazy" }) : h("span", { class: "sans-image" }, c.nom)
          ))
        ),
        h("button", { type: "button", class: "ghost danger", onclick: () => confirm("Supprimer cette ouverture du journal ? (les cartes restent dans la collection)") && essayer(() => supprimerLigne("ouvertures", o)) }, "🗑 Supprimer du journal")
      );
    }

    conteneur.replaceChildren(
      h("div", { class: "row" }, h("h2", {}, "Boosters"), h("button", { type: "button", onclick: () => ouvrirNouvelle() }, "🎁 Nouvelle ouverture")),
      stats, chances, liste
    );
    redessiner = dessiner;
    dessiner();

    // Arrivée depuis « Ouvrir 1 » d'un produit scellé
    if (S.brouillonOuverture) {
      const b = S.brouillonOuverture;
      S.brouillonOuverture = null;
      ouvrirNouvelle(b);
    }
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};

// ---------- Fenêtre « Nouvelle ouverture » ----------

async function ouvrirNouvelle(brouillon = {}) {
  const zone = $("ouverture-contenu");
  const selection = new Map(); // id de carte -> { k, qte }
  let cartes = [];

  const choixExt = h("select", { "aria-label": "Extension" },
    h("option", { value: "" }, "Choisir l'extension…"),
    S.extensions.map((e) => h("option", { value: e.id }, e.nom + (annee(e) ? " (" + annee(e) + ")" : "")))
  );
  choixExt.value = brouillon.set_id || "";
  const nb = h("input", { type: "number", min: "1", value: String(brouillon.nb || 1), "aria-label": "Nombre de boosters", title: "Nombre de boosters ouverts" });
  const cout = h("input", { type: "number", min: "0", step: "0.01", value: brouillon.cout ?? "", placeholder: "Coût total €", "aria-label": "Coût" });
  const recherche = h("input", { type: "search", placeholder: "Filtrer les cartes de l'extension", autocomplete: "off" });
  const grille = h("div", { class: "cartes-grille compacte" });
  const resume = h("div", { class: "vignettes" });
  const info = h("p", { class: "muted" }, "Choisissez l'extension, puis touchez chaque carte obtenue (plusieurs fois si vous l'avez en double).");
  const enregistrer = h("button", { type: "button", disabled: true }, "Enregistrer l'ouverture et ajouter les cartes à ma collection");

  function dessinerSelection() {
    const total = [...selection.values()].reduce((s, x) => s + x.qte, 0);
    enregistrer.disabled = !total || !choixExt.value;
    info.textContent = total ? total + " carte(s) sélectionnée(s)." : "Choisissez l'extension, puis touchez chaque carte obtenue (plusieurs fois si vous l'avez en double).";
    resume.replaceChildren(...[...selection.values()].map(({ k, qte }) =>
      h("button", { type: "button", class: "vignette retirable", title: k.name + " — toucher pour retirer un exemplaire", onclick: () => { qte > 1 ? (selection.get(k.id).qte = qte - 1) : selection.delete(k.id); dessinerSelection(); dessinerGrille(); } },
        k.image ? h("img", { src: imageCarte(k.image), alt: k.name }) : k.name,
        qte > 1 ? h("span", { class: "badge-qte" }, "×" + qte) : null
      )
    ));
  }

  function dessinerGrille() {
    const q = normalise(recherche.value);
    grille.replaceChildren(...cartes
      .filter((k) => !q || normalise(k.name).includes(q) || normalise(k.localId).includes(q))
      .map((k) => {
        const s = selection.get(k.id);
        return h("button", { type: "button", class: "tuile" + (s ? " choisie" : ""), onclick: () => { selection.set(k.id, { k, qte: (s ? s.qte : 0) + 1 }); dessinerSelection(); dessinerGrille(); } },
          k.image ? h("img", { loading: "lazy", alt: k.name, src: imageCarte(k.image) }) : h("div", { class: "sans-image" }, "Pas d'image"),
          h("span", {}, "n° " + k.localId + " " + k.name + (s ? " ×" + s.qte : ""))
        );
      }));
  }

  async function chargerExtension() {
    selection.clear();
    cartes = [];
    grille.replaceChildren();
    dessinerSelection();
    if (!choixExt.value) return;
    info.textContent = "Chargement des cartes de l'extension…";
    try {
      cartes = (await cartesDExtension(choixExt.value)).cartes;
    } catch (e) {
      info.textContent = "Extension indisponible : " + e.message;
    }
    dessinerGrille();
    dessinerSelection();
  }

  enregistrer.addEventListener("click", () => essayer(async () => {
    enregistrer.disabled = true;
    message("Enregistrement de l'ouverture…");
    const lignes = [];
    for (const { k, qte } of selection.values()) {
      const d = await detailCarte(k.id);
      await D.ajouterCarte(d, { quantite: qte });
      lignes.push({ id: d.id, nom: d.name, image: d.image || null, rarete: d.rarity || null, valeur: prixDe(d), qte });
    }
    await ajouterLigne("ouvertures", {
      set_id: choixExt.value, date: new Date().toLocaleDateString("sv-SE"),
      nb_boosters: Math.max(1, parseInt(nb.value, 10) || 1),
      cout: cout.value === "" ? null : Number(cout.value), cartes: lignes,
    });
    if (brouillon.produitId) {
      const p = S.produits.find((x) => x.id === brouillon.produitId);
      if (p) await majLigne("produits", p, { quantite: Math.max(0, p.quantite - 1) });
    }
    $("ouverture").close();
    message("✔ Ouverture enregistrée : " + lignes.length + " cartes ajoutées à la collection.", "ok");
  }));

  choixExt.addEventListener("change", chargerExtension);
  recherche.addEventListener("input", dessinerGrille);

  zone.replaceChildren(
    h("h2", {}, "🎁 Nouvelle ouverture" + (brouillon.nom ? " · " + brouillon.nom : "")),
    h("div", { class: "row tools" }, choixExt, nb, cout),
    recherche, info, resume, grille, enregistrer
  );
  $("ouverture").showModal();
  if (choixExt.value) chargerExtension();
}
