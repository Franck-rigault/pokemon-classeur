// Vue « Scellés » : boosters, displays, coffrets… avec prix d'achat et valeur.
import { h, euros, essayer, message, libelleExt, annee } from "./api.js";
import { S } from "./etat.js";
import { chargerExtra, ajouterLigne, majLigne, supprimerLigne } from "./donnees-extra.js";

const TYPES = ["Booster", "Display", "Coffret", "ETB", "Deck", "Autre"];

let redessiner = null;

export const vueProduits = {
  async monter(conteneur) {
    conteneur.replaceChildren(h("p", { class: "msg" }, "Chargement…"));
    try {
      await chargerExtra();
    } catch (e) {
      return conteneur.replaceChildren(h("p", { class: "msg ko" }, "Indisponible : " + e.message + " — la migration schema-v4.sql a-t-elle été lancée ?"));
    }

    const stats = h("div", { class: "dash-tuiles" });
    const liste = h("div", { class: "produits" });

    // Formulaire d'ajout
    const nom = h("input", { type: "text", placeholder: "Nom (ex. Coffret Dracaufeu-ex)", required: true, autocomplete: "off" });
    const type = h("select", { "aria-label": "Type" }, TYPES.map((t) => h("option", { value: t }, t)));
    const extension = h("select", { "aria-label": "Extension" },
      h("option", { value: "" }, "Extension (facultatif)"),
      S.extensions.map((e) => h("option", { value: e.id }, e.nom + (annee(e) ? " (" + annee(e) + ")" : "")))
    );
    const quantite = h("input", { type: "number", min: "1", value: "1", "aria-label": "Quantité", title: "Quantité" });
    const prix = h("input", { type: "number", min: "0", step: "0.01", placeholder: "Prix d'achat € (unité)", "aria-label": "Prix d'achat" });
    const valeur = h("input", { type: "number", min: "0", step: "0.01", placeholder: "Valeur actuelle € (unité)", "aria-label": "Valeur" });
    const date = h("input", { type: "date", "aria-label": "Date d'achat", value: new Date().toLocaleDateString("sv-SE") });
    const rangement = h("input", { type: "text", list: "emplacements", placeholder: "📍 Rangement", autocomplete: "off" });

    const formulaire = h("details", { class: "filtres-plus", open: S.produits.length === 0 },
      h("summary", {}, "+ Ajouter un produit scellé"),
      h("form", {
        class: "filtres",
        onsubmit: (e) => {
          e.preventDefault();
          essayer(async () => {
            await ajouterLigne("produits", {
              nom: nom.value.trim(), type: type.value, set_id: extension.value || null,
              quantite: Math.max(1, parseInt(quantite.value, 10) || 1),
              prix_achat: prix.value === "" ? null : Number(prix.value),
              valeur: valeur.value === "" ? null : Number(valeur.value),
              date_achat: date.value || null, emplacement: rangement.value.trim() || null,
            });
            e.target.reset();
            date.value = new Date().toLocaleDateString("sv-SE");
            message("✔ Produit ajouté.", "ok");
          });
        },
      }, nom, type, extension, quantite, prix, valeur, date, rangement, h("button", { type: "submit" }, "Enregistrer"))
    );

    function dessiner() {
      const unites = S.produits.reduce((s, p) => s + p.quantite, 0);
      const investi = S.produits.reduce((s, p) => s + Number(p.prix_achat || 0) * p.quantite, 0);
      const vaut = S.produits.reduce((s, p) => s + Number(p.valeur || 0) * p.quantite, 0);
      stats.replaceChildren(
        ...[[unites, "Produits scellés"], [euros(investi), "Investi"], [euros(vaut), "Valeur actuelle"], [(vaut - investi >= 0 ? "+" : "") + euros(vaut - investi), "Plus-value"]].map(([v, l]) =>
          h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l))
        )
      );
      const tries = [...S.produits].sort((a, b) => (b.date_achat || "").localeCompare(a.date_achat || "") || b.id - a.id);
      liste.replaceChildren(
        ...(tries.length ? tries.map(carte) : [h("p", { class: "muted" }, "Aucun produit scellé. Ajoutez vos coffrets, displays et boosters pour suivre leur valeur.")])
      );
    }

    function carte(p) {
      const champ = (cle, props) => h("input", {
        ...props, value: p[cle] ?? "",
        onchange: (e) => essayer(() => majLigne("produits", p, { [cle]: e.target.value === "" ? null : props.type === "number" ? Number(e.target.value) : e.target.value.trim() })),
      });
      return h("div", { class: "produit" },
        h("div", { class: "produit-tete" },
          h("b", {}, p.nom),
          h("span", { class: "muted" }, [p.type, p.set_id ? libelleExt(p.set_id) : null, p.date_achat ? new Date(p.date_achat).toLocaleDateString("fr-FR") : null].filter(Boolean).join(" · "))
        ),
        h("div", { class: "produit-champs" },
          h("div", { class: "quantite" },
            h("button", { type: "button", class: "ghost", "aria-label": "Retirer un exemplaire", onclick: () => essayer(() => (p.quantite <= 1 ? (confirm("Supprimer " + p.nom + " ?") ? supprimerLigne("produits", p) : null) : majLigne("produits", p, { quantite: p.quantite - 1 }))) }, "−"),
            h("b", {}, "× " + p.quantite),
            h("button", { type: "button", class: "ghost", "aria-label": "Ajouter un exemplaire", onclick: () => essayer(() => majLigne("produits", p, { quantite: p.quantite + 1 })) }, "+")
          ),
          champ("prix_achat", { type: "number", min: "0", step: "0.01", placeholder: "Achat €", title: "Prix d'achat (unité)" }),
          champ("valeur", { type: "number", min: "0", step: "0.01", placeholder: "Valeur €", title: "Valeur actuelle (unité)" }),
          champ("emplacement", { type: "text", list: "emplacements", placeholder: "📍 Rangement", autocomplete: "off" }),
          h("button", { type: "button", class: "ghost danger", title: "Supprimer", onclick: () => confirm("Supprimer " + p.nom + " ?") && essayer(() => supprimerLigne("produits", p)) }, "🗑")
        )
      );
    }

    conteneur.replaceChildren(stats, formulaire, liste);
    redessiner = dessiner;
    dessiner();
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};
