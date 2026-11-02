// Vue « Rechercher » : toutes les cartes qui existent pour un nom (Pokémon, Dresseur, Énergie…).
import { h, chercherCartes, imageCarte, libelleExt, essayer } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { ouvrirCarte } from "./dialogue-carte.js";

const PAS = 120;
let redessiner = null;

export const vueRecherche = {
  async monter(conteneur, param) {
    const requete = param ? decodeURIComponent(param) : "";
    let resultats = [];
    let limite = PAS;

    // Suggestions : les noms de Pokémon (partagées avec le scanner)
    const suggestions = document.getElementById("noms-pokemon");
    if (suggestions && !suggestions.children.length) S.pokemon.forEach((p) => suggestions.append(new Option(p.nom, p.nom)));

    const champ = h("input", {
      type: "search", list: "noms-pokemon", value: requete, autocomplete: "off",
      placeholder: "Nom d'un Pokémon ou d'une carte (ex. Pikachu, Dracaufeu ex, Énergie Feu)",
    });
    const formulaire = h("form", {
      class: "filtres",
      onsubmit: (e) => {
        e.preventDefault();
        const q = champ.value.trim();
        if (q === requete) vueRecherche.monter(conteneur, q ? encodeURIComponent(q) : "");
        else location.hash = "#/recherche/" + encodeURIComponent(q);
      },
    }, champ, h("button", { type: "submit" }, "🔎 Rechercher"));

    const choixExt = h("select", { "aria-label": "Extension" });
    const choixPossession = h("select", { "aria-label": "Possession" },
      h("option", { value: "" }, "Possédées et manquantes"),
      h("option", { value: "possedees" }, "Possédées"),
      h("option", { value: "manquantes" }, "Manquantes")
    );
    const filtres = h("div", { class: "filtres" }, choixExt, choixPossession);
    filtres.hidden = true;
    const info = h("p", { class: "muted" });
    const grille = h("div", { class: "cartes-grille" });
    const plus = h("button", { type: "button", class: "ghost", onclick: () => { limite += PAS; dessiner(); } }, "Afficher plus");
    plus.hidden = true;

    function dessiner() {
      const quantites = new Map();
      for (const c of S.collection) quantites.set(c.carte_id, (quantites.get(c.carte_id) || 0) + c.quantite);
      const voeux = new Set(S.souhaits.map((x) => x.carte_id));

      const affichees = resultats.filter((k) => {
        if (choixExt.value && k.set_id !== choixExt.value) return false;
        if (choixPossession.value === "possedees" && !quantites.has(k.id)) return false;
        if (choixPossession.value === "manquantes" && quantites.has(k.id)) return false;
        return true;
      });

      grille.replaceChildren(...affichees.slice(0, limite).map((k) => tuile(k, quantites.get(k.id) || 0, voeux.has(k.id))));
      const possedees = resultats.filter((k) => quantites.has(k.id)).length;
      info.textContent = resultats.length + " carte(s) « " + requete + " » · " + possedees + " possédée(s) · " + affichees.length + " affichée(s), de la plus récente à la plus ancienne.";
      plus.hidden = affichees.length <= limite;
    }

    function tuile(k, qte, voeu) {
      const actions = S.lectureSeule
        ? qte ? h("span", { class: "qte" }, "× " + qte) : null
        : h("div", { class: "tuile-actions" },
            h("button", { type: "button", onclick: () => essayer(() => D.ajouterCarteCourte(k)) }, qte ? "+ 1" : "+ Ajouter"),
            qte ? h("b", {}, "× " + qte) : null
          );
      return h("div", { class: "tuile-carte " + (qte ? "possedee" : "manquante") },
        h("button", { type: "button", class: "tuile-img", title: "Voir la carte", onclick: () => ouvrirCarte(k.id) },
          k.image ? h("img", { loading: "lazy", alt: k.name, src: imageCarte(k.image), onerror: (ev) => ev.target.replaceWith(h("div", { class: "sans-image" }, "Pas d'image")) }) : h("div", { class: "sans-image" }, "Pas d'image"),
          voeu ? h("span", { class: "badge-voeu", title: "Dans la wishlist" }, "❤") : null,
          qte > 1 ? h("span", { class: "badge-qte" }, "×" + qte) : null
        ),
        h("div", { class: "tuile-info" },
          h("b", { title: k.name }, k.name),
          h("span", { class: "num" }, libelleExt(k.set_id) + " · n° " + k.localId)
        ),
        actions
      );
    }

    conteneur.replaceChildren(formulaire, filtres, info, grille, h("div", { class: "centre" }, plus));
    choixExt.addEventListener("change", () => { limite = PAS; dessiner(); });
    choixPossession.addEventListener("change", () => { limite = PAS; dessiner(); });
    redessiner = null;
    if (!requete) {
      info.textContent = "Tapez un nom pour voir toutes les cartes qui existent : un Pokémon, un Dresseur, une Énergie… Vous pouvez en ajouter directement à votre collection.";
      return champ.focus();
    }

    info.textContent = "Recherche…";
    try {
      resultats = await chercherCartes(requete);
    } catch (e) {
      info.textContent = "Recherche impossible : " + e.message;
      return;
    }
    if (!resultats.length) {
      info.textContent = "Aucune carte trouvée pour « " + requete + " ». Essayez avec l'orthographe française (accents compris).";
      return;
    }

    const sets = [...new Set(resultats.map((k) => k.set_id))];
    choixExt.replaceChildren(h("option", { value: "" }, "Toutes les extensions (" + sets.length + ")"), ...sets.map((id) => h("option", { value: id }, libelleExt(id))));
    filtres.hidden = false;
    redessiner = dessiner;
    dessiner();
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};
