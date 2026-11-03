// Vue « Coups de cœur » : une vitrine avec les cartes marquées d'une étoile.
import { h, imageCarte, euros, libelleExt, essayer } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { ouvrirCarte } from "./dialogue-carte.js";
import { carte3D, couleurType } from "./carte3d.js";
import { schemaV8 } from "./prefs.js";

let redessiner = null;

export const vueFavoris = {
  monter(conteneur) {
    if (!schemaV8()) {
      return conteneur.replaceChildren(h("p", { class: "msg ko" }, "Les coups de cœur demandent la migration schema-v8.sql (Supabase > SQL Editor)."));
    }
    const dessiner = () => {
      const lignes = S.collection.filter((c) => c.favori);
      // une carte possédée en plusieurs lignes n'apparaît qu'une fois
      const parCarte = new Map();
      for (const l of lignes) {
        const e = parCarte.get(l.carte_id) || { l, valeur: 0 };
        e.valeur += D.valeurLigne(l);
        parCarte.set(l.carte_id, e);
      }
      const cartes = [...parCarte.values()].sort((a, b) => b.valeur - a.valeur);
      const total = cartes.reduce((s, e) => s + e.valeur, 0);
      conteneur.replaceChildren(
        h("div", { class: "dash-tuiles" },
          h("div", { class: "dash-tuile" }, h("span", {}, cartes.length), h("small", {}, "Coups de cœur")),
          h("div", { class: "dash-tuile" }, h("span", {}, euros(total)), h("small", {}, "Valeur de la vitrine"))),
        cartes.length
          ? h("div", { class: "vitrine" }, cartes.map(({ l }) => h("figure", { class: "vitrine-carte", style: "--type:" + (couleurType(l.types) || "#8d96c9") },
              carte3D(l.image
                ? h("img", { src: imageCarte(l.image, "high"), alt: l.nom, loading: "lazy", draggable: "false" })
                : h("div", { class: "sans-image" }, l.nom)),
              h("figcaption", {},
                h("button", { type: "button", class: "lien", onclick: () => ouvrirCarte(l.carte_id) }, l.nom),
                h("span", { class: "muted" }, libelleExt(l.set_id) + " · n° " + l.local_id),
                l.valeur != null ? h("b", {}, euros(l.valeur)) : null,
                S.lectureSeule ? null : h("button", {
                  type: "button", class: "ghost etoile active", title: "Retirer des coups de cœur",
                  onclick: () => essayer(() => D.modifierLot(S.collection.filter((x) => x.carte_id === l.carte_id && x.favori), { favori: false }, "Coup de cœur retiré")),
                }, "★")))))
          : h("div", { class: "vide" },
              h("p", {}, "⭐ Aucun coup de cœur pour l'instant."),
              h("p", { class: "muted" }, "Touchez l'étoile ☆ sur une carte de « Mes cartes » ou dans sa fiche pour l'exposer ici."))
      );
    };
    redessiner = dessiner;
    dessiner();
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};
