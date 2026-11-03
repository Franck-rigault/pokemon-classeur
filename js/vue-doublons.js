// Vue « Doublons » : les exemplaires en trop (quantité > 1) et un bouton pour les ranger ailleurs.
import { h, imageCarte, euros, libelleExt, essayer, message } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { ouvrirCarte, libelleLigne } from "./dialogue-carte.js";
import { proposerAnnulation } from "./annuler.js";

let redessiner = null;

export const vueDoublons = {
  monter(conteneur) {
    const rangementGlobal = h("input", { type: "text", list: "emplacements", placeholder: "📍 Rangement des doublons (ex. Classeur échange)", autocomplete: "off", "aria-label": "Rangement des doublons" });
    const stats = h("div", { class: "dash-tuiles" });
    const liste = h("div", { class: "doublons" });
    const barre = h("div", { class: "row tools barre-doublons" });

    async function ranger(lignes, emplacement) {
      const cible = emplacement.trim();
      if (!cible) return message("Indiquez d'abord le rangement où mettre les doublons.", "ko");
      const faits = [];
      for (const l of lignes) {
        try {
          const r = await D.separerExcedent(l, cible);
          if (r) faits.push({ l, ...r });
        } catch (e) {
          message("Une ligne n'a pas pu être rangée : " + e.message, "ko");
        }
      }
      if (!faits.length) return message("Rien à déplacer (ces doublons sont déjà dans ce rangement).", "");
      const n = faits.reduce((s, f) => s + f.deplaces, 0);
      proposerAnnulation(n + " exemplaire(s) rangé(s) dans « " + cible + " ».", async () => {
        for (const f of faits) {
          await D.changerQuantite(f.destination, f.destination.quantite - f.deplaces, { silencieux: true });
          if (S.collection.includes(f.l)) await D.changerQuantite(f.l, f.ancienne, { silencieux: true });
        }
      });
    }

    function dessiner() {
      const doublons = S.collection.filter((c) => c.quantite > 1)
        .sort((a, b) => Number(b.valeur || 0) * (b.quantite - 1) - Number(a.valeur || 0) * (a.quantite - 1));
      const enTrop = doublons.reduce((s, c) => s + c.quantite - 1, 0);
      const valeur = doublons.reduce((s, c) => s + Number(c.valeur || 0) * (c.quantite - 1), 0);
      stats.replaceChildren(
        ...[[doublons.length, "Lignes en plusieurs exemplaires"], [enTrop, "Exemplaires en trop"], [euros(valeur), "Valeur des exemplaires en trop"]].map(([v, l]) =>
          h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l)))
      );
      barre.replaceChildren(
        S.lectureSeule ? null : rangementGlobal,
        S.lectureSeule || !doublons.length ? null : h("button", {
          type: "button",
          onclick: () => essayer(() => (confirm("Ranger les " + enTrop + " exemplaires en trop dans « " + (rangementGlobal.value.trim() || "…") + " » ? Un seul exemplaire reste sur chaque ligne.") ? ranger(doublons, rangementGlobal.value) : null)),
        }, "Ranger tous les doublons")
      );
      liste.replaceChildren(...(doublons.length
        ? doublons.map((l) => h("div", { class: "doublon" },
            h("button", { type: "button", class: "doublon-img", title: "Voir la carte", onclick: () => ouvrirCarte(l.carte_id) },
              l.image ? h("img", { src: imageCarte(l.image), alt: l.nom, loading: "lazy" }) : h("span", { class: "sans-image" })),
            h("div", { class: "doublon-info" },
              h("b", {}, l.nom),
              h("span", { class: "muted" }, libelleExt(l.set_id) + " · n° " + l.local_id + " · " + libelleLigne(l) + (l.emplacement ? " · 📍 " + l.emplacement : "")),
              h("span", {}, "× " + l.quantite + " → " + (l.quantite - 1) + " en trop" + (l.valeur != null ? " (" + euros(Number(l.valeur) * (l.quantite - 1)) + ")" : ""))),
            S.lectureSeule ? null : h("div", { class: "doublon-actions" },
              h("button", { type: "button", class: "ghost", onclick: () => essayer(() => ranger([l], rangementGlobal.value)) }, "Ranger les " + (l.quantite - 1) + " en trop")))
          )
        : [h("div", { class: "vide" }, h("p", {}, "✨ Aucun doublon : chaque ligne n'a qu'un exemplaire."))]));
    }
    conteneur.replaceChildren(
      h("p", { class: "muted" }, "Les cartes que vous possédez en plusieurs exemplaires sur une même ligne. « Ranger » garde un exemplaire en place et déplace les autres vers le rangement choisi (annulable)."),
      stats, barre, liste
    );
    redessiner = dessiner;
    dessiner();
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};
