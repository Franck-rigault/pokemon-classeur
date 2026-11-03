// Vue « Tableau de bord » : chiffres clés, extensions les plus avancées, raretés, cartes les plus chères, courbe de valeur.
import { h, db, euros, imageCarte, libelleExt, annee } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { chargerExtra } from "./donnees-extra.js";
import { courbe, anneau } from "./graphiques.js";

function barre(pct, texteDroite, texteGauche) {
  const rempli = h("div", { class: "barre-rempli" });
  rempli.style.width = Math.min(100, pct) + "%";
  return h("div", { class: "barre-ligne" }, h("span", { class: "barre-nom", title: texteGauche }, texteGauche), h("div", { class: "barre" }, rempli), h("span", { class: "barre-val" }, texteDroite));
}

export const vueDashboard = {
  async monter(conteneur) {
    const st = D.statistiques();
    const parSet = new Map();
    for (const c of S.collection) {
      if (!parSet.has(c.set_id)) parSet.set(c.set_id, new Set());
      parSet.get(c.set_id).add(c.carte_id);
    }
    const complets = S.extensions.filter((e) => e.officiel && parSet.has(e.id) && parSet.get(e.id).size >= e.officiel).length;
    const valeurWishlist = S.souhaits.reduce((s, x) => s + Number(x.valeur || 0), 0);

    const tuiles = [
      [st.exemplaires, "Exemplaires (" + st.distinctes + " cartes différentes)"],
      [euros(st.valeur), "Valeur de la collection"],
      [st.extensions + " (" + complets + " complète" + (complets > 1 ? "s" : "") + ")", "Extensions commencées"],
      [euros(valeurWishlist), "Wishlist (" + S.souhaits.length + " cartes)"],
    ];

    // Extensions les plus avancées
    const avancees = S.extensions
      .filter((e) => parSet.has(e.id))
      .map((e) => ({ e, n: parSet.get(e.id).size, total: e.total || e.officiel || 1 }))
      .sort((a, b) => b.n / b.total - a.n / a.total || b.n - a.n)
      .slice(0, 8);

    // Répartition en anneau : rareté, type, catégorie ou extension (en exemplaires)
    const CRITERES = {
      rarete: ["Rareté", (c) => [c.rarete || "Inconnue"]],
      type: ["Type", (c) => (c.types && c.types.length ? c.types : ["Inconnu"])],
      categorie: ["Catégorie", (c) => [c.categorie || "Inconnue"]],
      extension: ["Extension", (c) => [libelleExt(c.set_id)]],
    };
    const choixCritere = h("select", { "aria-label": "Répartir par" }, Object.entries(CRITERES).map(([k, [nom]]) => h("option", { value: k }, "Par " + nom.toLowerCase())));
    const zoneAnneau = h("div", {});
    const dessinerAnneau = () => {
      const compte = new Map();
      for (const c of S.collection) for (const nom of CRITERES[choixCritere.value][1](c)) compte.set(nom, (compte.get(nom) || 0) + c.quantite);
      zoneAnneau.replaceChildren(anneau([...compte].map(([nom, n]) => ({ nom, n })).sort((a, b) => b.n - a.n), { unite: "exemplaires" }));
    };
    choixCritere.addEventListener("change", dessinerAnneau);
    dessinerAnneau();
    // Cartes les plus chères
    const top = [...S.collection].filter((c) => c.valeur > 0).sort((a, b) => Number(b.valeur) - Number(a.valeur)).slice(0, 5);

    // Rentabilité : prix d'achat contre valeur actuelle (données privées : seulement pour sa propre collection)
    let panneauRentabilite = null;
    let investiTotal = 0;
    if (!S.lectureSeule && !S.partage) {
      try { await chargerExtra(); } catch { /* tables absentes : le panneau n'affiche que les cartes */ }
      const somme = (liste, f) => liste.reduce((s, x) => s + f(x), 0);
      const achetees = S.collection.filter((c) => c.prix_achat != null);
      const investiCartes = somme(achetees, (c) => Number(c.prix_achat) * c.quantite);
      const valeurAchetees = somme(achetees, (c) => Number(c.valeur || 0) * c.quantite);
      const investiScelles = somme(S.produits, (p) => Number(p.prix_achat || 0) * p.quantite);
      const valeurScelles = somme(S.produits, (p) => Number(p.valeur || 0) * p.quantite);
      const plusValue = valeurAchetees - investiCartes;
      investiTotal = investiCartes + investiScelles;
      const gain = (c) => (Number(c.valeur || 0) - Number(c.prix_achat)) * c.quantite;
      const gains = [...achetees].sort((a, b) => gain(b) - gain(a));
      const ligneGain = (c) => h("li", { class: c.image ? "avec-image" : "" },
        c.image ? h("img", { src: imageCarte(c.image), alt: c.nom, loading: "lazy" }) : null,
        h("b", {}, c.nom),
        h("span", {}, "acheté " + euros(c.prix_achat) + " · vaut " + euros(c.valeur)),
        h("em", { class: gain(c) < 0 ? "perte" : "" }, (gain(c) >= 0 ? "+" : "") + euros(gain(c)))
      );
      panneauRentabilite = h("section", { class: "panneau" },
        h("h3", {}, "Rentabilité"),
        h("div", { class: "dash-tuiles" },
          [
            [euros(investiCartes), "Investi dans les cartes (" + achetees.length + " lignes avec prix d'achat)"],
            [euros(valeurAchetees), "Valeur actuelle de ces cartes"],
            [(plusValue >= 0 ? "+" : "") + euros(plusValue), "Plus-value sur ces cartes"],
            [euros(investiScelles), "Investi en produits scellés"],
          ].map(([v, l]) => h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l)))
        ),
        investiCartes + investiScelles > 0
          ? h("div", { class: "comparaison" },
              barre((investiCartes + investiScelles) / Math.max(investiCartes + investiScelles, valeurAchetees + valeurScelles) * 100, euros(investiCartes + investiScelles), "Payé (cartes + scellés)"),
              barre((valeurAchetees + valeurScelles) / Math.max(investiCartes + investiScelles, valeurAchetees + valeurScelles) * 100, euros(valeurAchetees + valeurScelles), "Valeur actuelle"))
          : null,
        S.produits.length ? h("p", { class: "muted" }, "Produits scellés : " + euros(valeurScelles) + " de valeur actuelle pour " + euros(investiScelles) + " investis.") : null,
        achetees.length
          ? h("div", { class: "dash-colonnes" },
              h("div", {}, h("h3", {}, "Plus gros gains"), h("ol", { class: "top-liste" }, gains.slice(0, 5).filter((c) => gain(c) > 0).map(ligneGain))),
              h("div", {}, h("h3", {}, "Plus grosses pertes"), h("ol", { class: "top-liste" }, gains.slice(-5).reverse().filter((c) => gain(c) < 0).map(ligneGain)))
            )
          : h("p", { class: "muted" }, "Renseignez le prix d'achat de vos cartes (dans la fenêtre de la carte) pour suivre leur rentabilité.")
      );
    }

    const placeGraphe = h("p", { class: "muted" }, "Chargement de l'historique…");

    conteneur.replaceChildren(
      h("div", { class: "dash-tuiles" }, tuiles.map(([v, l]) => h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l)))),
      h("div", { class: "dash-colonnes" },
        h("section", { class: "panneau" },
          h("h3", {}, "Extensions les plus avancées"),
          avancees.length
            ? avancees.map(({ e, n, total }) => barre((n / total) * 100, n + " / " + total, e.nom + (annee(e) ? " (" + annee(e) + ")" : "")))
            : h("p", { class: "muted" }, "Aucune extension commencée.")
        ),
        h("section", { class: "panneau" },
          h("h3", {}, "Répartition de la collection"),
          choixCritere,
          zoneAnneau
        )
      ),
      h("section", { class: "panneau" },
        h("h3", {}, "Mes cartes les plus chères"),
        top.length
          ? h("ol", { class: "top-liste" }, top.map((c) =>
              h("li", { class: c.image ? "avec-image" : "" },
                c.image ? h("img", { src: imageCarte(c.image), alt: c.nom, loading: "lazy" }) : null,
                h("b", {}, c.nom),
                h("span", {}, [libelleExt(c.set_id), "n° " + c.local_id, c.rarete, c.variante !== "Normale" ? c.variante : null].filter(Boolean).join(" · ")),
                h("em", {}, euros(c.valeur))
              )))
          : h("p", { class: "muted" }, "Aucune carte avec un prix pour l'instant.")
      ),
      panneauRentabilite,
      S.lectureSeule || S.partage
        ? null
        : h("section", { class: "panneau" }, h("h3", {}, "Évolution de la valeur"), placeGraphe)
    );

    if (S.lectureSeule || S.partage) return;
    const { data, error } = await db.from("historique").select("jour, valeur_possedee").order("jour");
    if (error) placeGraphe.textContent = "Historique indisponible : " + error.message;
    else if (data.length < 2) placeGraphe.textContent = "Le graphique apparaîtra dès le 2ᵉ jour d'utilisation (un point est enregistré par jour).";
    else placeGraphe.replaceWith(courbe(data, investiTotal > 0 ? { valeur: investiTotal, nom: "Total payé" } : null));
  },
  rafraichir() {},
};
