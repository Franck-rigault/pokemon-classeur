// Vue « Wishlist » : les cartes recherchées (une ligne par carte précise).
import { h, boutonCardmarket, imageCarte, essayer, euros, message, libelleExt, detailCarte } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { ouvrirCarte } from "./dialogue-carte.js";

let redessiner = null;

export const vueWishlist = {
  monter(conteneur) {
    const stats = h("div", { class: "dash-tuiles" });
    const grille = h("div", { class: "cartes-grille" });
    const bImprimer = h("button", { type: "button", class: "ghost", onclick: imprimer }, "🖨 Imprimer");

    function dessiner() {
      const total = S.souhaits.reduce((s, x) => s + Number(x.valeur || 0), 0);
      stats.replaceChildren(
        ...[[S.souhaits.length, "Cartes recherchées"], [euros(total), "Budget estimé"]].map(([v, l]) =>
          h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l))
        )
      );
      grille.replaceChildren(
        ...(S.souhaits.length
          ? S.souhaits.map(tuile)
          : [h("p", { class: "muted" }, "Aucune carte dans la wishlist. Ouvrez une carte et choisissez « Ajouter à la wishlist ».")])
      );
    }

    function tuile(x) {
      return h("div", { class: "tuile-carte manquante-souhait" },
        h("button", { type: "button", class: "tuile-img", title: "Voir la carte", onclick: () => ouvrirCarte(x.carte_id) },
          x.image ? h("img", { loading: "lazy", alt: x.nom, src: imageCarte(x.image), onerror: (ev) => ev.target.replaceWith(h("div", { class: "sans-image" }, "Pas d'image")) }) : h("div", { class: "sans-image" }, "Pas d'image")
        ),
        h("div", { class: "tuile-info" },
          h("div", { class: "ligne-nom" }, h("b", { title: x.nom }, x.nom), boutonCardmarket(x.nom, x.set_id, x.local_id)),
          h("span", { class: "num" }, libelleExt(x.set_id) + " · n° " + x.local_id),
          x.rarete ? h("span", { class: "num" }, x.rarete) : null,
          x.valeur != null ? h("span", { class: "prix" }, euros(x.valeur)) : null
        ),
        S.lectureSeule
          ? null
          : h("div", { class: "tuile-actions" },
              h("button", {
                type: "button",
                title: "Je l'ai trouvée : l'ajouter à la collection",
                onclick: () => essayer(async () => {
                  await D.ajouterCarte(await detailCarte(x.carte_id));
                  message("✔ " + x.nom + " ajoutée à la collection.", "ok");
                }),
              }, "✔ Je l'ai"),
              h("button", { type: "button", class: "ghost danger", "aria-label": "Retirer de la wishlist", onclick: () => essayer(() => D.retirerSouhait(x)) }, "🗑")
            )
      );
    }

    conteneur.replaceChildren(h("div", { class: "row" }, h("h2", {}, "Wishlist"), bImprimer), stats, grille);
    redessiner = dessiner;
    dessiner();
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};

// Impression : la mise en page d'impression masque l'en-tête et les boutons (voir style.css)
function imprimer() {
  document.body.classList.add("impression");
  const fin = () => {
    document.body.classList.remove("impression");
    window.removeEventListener("afterprint", fin);
  };
  window.addEventListener("afterprint", fin);
  setTimeout(() => window.print(), 600); // laisse les images se charger
}
