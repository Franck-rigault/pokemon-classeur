// Vue « Mes cartes » : toute la collection à plat, avec recherche, filtres et tri.
import { h, normalise, imageCarte, essayer, euros, libelleExt, ETATS, VARIANTES } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { ouvrirCarte } from "./dialogue-carte.js";

const PAS = 120;
let redessiner = null;

export const vueCartes = {
  monter(conteneur) {
    let limite = PAS;
    const recherche = h("input", { type: "search", placeholder: "Rechercher (nom, numéro)", autocomplete: "off" });
    const choixExt = h("select", { "aria-label": "Extension" });
    const choixRar = h("select", { "aria-label": "Rareté" });
    const choixVar = h("select", { "aria-label": "Variante" }, h("option", { value: "" }, "Toutes les variantes"), VARIANTES.map((v) => h("option", { value: v }, v)));
    const choixEtat = h("select", { "aria-label": "État" }, h("option", { value: "" }, "Tous les états"), ETATS.map((v) => h("option", { value: v }, v)));
    const choixEmpl = h("select", { "aria-label": "Rangement" });
    const choixCat = h("select", { "aria-label": "Catégorie" });
    const choixType = h("select", { "aria-label": "Type" });
    const champIllus = h("input", { type: "search", placeholder: "Illustrateur", autocomplete: "off", list: "illustrateurs" });
    const listeIllus = h("datalist", { id: "illustrateurs" });
    const pvMin = h("input", { type: "number", min: "0", step: "10", placeholder: "PV min", "aria-label": "PV minimum" });
    const choixGrade = h("select", { "aria-label": "Gradation" },
      h("option", { value: "" }, "Gradées ou non"),
      h("option", { value: "oui" }, "Gradées seulement"),
      h("option", { value: "non" }, "Non gradées")
    );
    const choixTri = h("select", { "aria-label": "Trier par" },
      h("option", { value: "recent" }, "Tri : ajoutées récemment"),
      h("option", { value: "nom" }, "Tri : nom A → Z"),
      h("option", { value: "extension" }, "Tri : extension"),
      h("option", { value: "valeur" }, "Tri : valeur décroissante")
    );
    const stats = h("div", { class: "dash-tuiles" });
    const compte = h("p", { class: "muted" });
    const grille = h("div", { class: "cartes-grille" });
    const plus = h("button", { type: "button", class: "ghost", onclick: () => { limite += PAS; dessiner(); } }, "Afficher plus");

    function remplirChoix(select, premier, valeurs, libelle = (v) => v) {
      const courant = select.value;
      select.replaceChildren(h("option", { value: "" }, premier), ...valeurs.map((v) => h("option", { value: v }, libelle(v))));
      select.value = valeurs.includes(courant) ? courant : "";
    }

    const tris = {
      recent: (a, b) => b.id - a.id,
      nom: (a, b) => a.nom.localeCompare(b.nom, "fr") || a.set_id.localeCompare(b.set_id),
      extension: (a, b) => (S.ordreExt.get(a.set_id) ?? 9999) - (S.ordreExt.get(b.set_id) ?? 9999) || a.local_id.localeCompare(b.local_id, "fr", { numeric: true }),
      valeur: (a, b) => D.valeurLigne(b) - D.valeurLigne(a),
    };

    function dessiner() {
      const sets = [...new Set(S.collection.map((c) => c.set_id))].sort((a, b) => (S.ordreExt.get(a) ?? 9999) - (S.ordreExt.get(b) ?? 9999));
      remplirChoix(choixExt, "Toutes les extensions", sets, (id) => libelleExt(id));
      remplirChoix(choixRar, "Toutes les raretés", [...new Set(S.collection.map((c) => c.rarete).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")));

      remplirChoix(choixEmpl, "Tous les rangements", [...new Set(S.collection.map((c) => c.emplacement).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")));
      remplirChoix(choixCat, "Toutes les catégories", [...new Set(S.collection.map((c) => c.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")));
      remplirChoix(choixType, "Tous les types", [...new Set(S.collection.flatMap((c) => c.types || []))].sort((a, b) => a.localeCompare(b, "fr")));
      const illus = [...new Set(S.collection.map((c) => c.illustrateur).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
      if (listeIllus.children.length !== illus.length) listeIllus.replaceChildren(...illus.map((i) => new Option(i, i)));

      const q = normalise(recherche.value);
      const qIllus = normalise(champIllus.value);
      const pv = Number(pvMin.value) || 0;
      const lignes = S.collection
        .filter((c) => {
          if (q && !normalise(c.nom).includes(q) && !normalise(c.local_id).includes(q)) return false;
          if (choixExt.value && c.set_id !== choixExt.value) return false;
          if (choixRar.value && c.rarete !== choixRar.value) return false;
          if (choixVar.value && c.variante !== choixVar.value) return false;
          if (choixEtat.value && c.etat !== choixEtat.value) return false;
          if (choixEmpl.value && c.emplacement !== choixEmpl.value) return false;
          if (choixCat.value && c.categorie !== choixCat.value) return false;
          if (choixType.value && !(c.types || []).includes(choixType.value)) return false;
          if (qIllus && !normalise(c.illustrateur || "").includes(qIllus)) return false;
          if (pv && (c.pv || 0) < pv) return false;
          if (choixGrade.value === "oui" && !c.grade_societe) return false;
          if (choixGrade.value === "non" && c.grade_societe) return false;
          return true;
        })
        .sort(tris[choixTri.value]);

      const st = D.statistiques(lignes);
      stats.replaceChildren(
        ...[[st.exemplaires, "Exemplaires"], [st.distinctes, "Cartes différentes"], [euros(st.valeur), "Valeur"]].map(([v, l]) =>
          h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l))
        )
      );

      grille.replaceChildren(...lignes.slice(0, limite).map(tuile));
      compte.textContent = lignes.length
        ? lignes.length + " ligne(s) · " + Math.min(limite, lignes.length) + " affichée(s)"
        : S.collection.length ? "Aucune carte ne correspond aux filtres." : "La collection est vide : ouvrez « Extensions » ou utilisez le scanner pour ajouter des cartes.";
      plus.hidden = lignes.length <= limite;
    }

    function tuile(l) {
      const ext = S.extParId.get(l.set_id);
      return h("div", { class: "tuile-carte possedee" },
        h("button", { type: "button", class: "tuile-img", title: "Voir la carte", onclick: () => ouvrirCarte(l.carte_id) },
          l.image ? h("img", { loading: "lazy", alt: l.nom, src: imageCarte(l.image), onerror: (ev) => ev.target.replaceWith(h("div", { class: "sans-image" }, "Pas d'image")) }) : h("div", { class: "sans-image" }, "Pas d'image"),
          l.quantite > 1 ? h("span", { class: "badge-qte" }, "×" + l.quantite) : null
        ),
        h("div", { class: "tuile-info" },
          h("b", { title: l.nom }, l.nom),
          h("span", { class: "num" }, [ext ? ext.code || ext.nom : l.set_id, "n° " + l.local_id].join(" · ")),
          h("span", { class: "num" }, [l.variante !== "Normale" ? l.variante : null, l.grade_societe ? l.grade_societe + " " + (l.grade_note ?? "") : l.etat !== "Neuf" ? l.etat : null, l.rarete].filter(Boolean).join(" · ")),
          l.emplacement ? h("span", { class: "num", title: "Rangement" }, "📍 " + l.emplacement) : null,
          l.valeur != null ? h("span", { class: "prix" }, euros(D.valeurLigne(l))) : null
        ),
        S.lectureSeule
          ? h("span", { class: "qte" }, "× " + l.quantite)
          : h("div", { class: "tuile-actions" },
              h("button", { type: "button", class: "ghost", "aria-label": "Retirer un exemplaire", onclick: () => essayer(() => (l.quantite === 1 && !confirm("Retirer " + l.nom + " de la collection ?") ? null : D.changerQuantite(l, l.quantite - 1))) }, "−"),
              h("b", {}, l.quantite),
              h("button", { type: "button", class: "ghost", "aria-label": "Ajouter un exemplaire", onclick: () => essayer(() => D.changerQuantite(l, l.quantite + 1)) }, "+")
            )
      );
    }

    conteneur.replaceChildren(
      stats,
      h("div", { class: "filtres" }, recherche, choixExt, choixRar, choixVar, choixEtat, choixTri),
      h("details", { class: "filtres-plus" }, h("summary", {}, "Filtres avancés (rangement, catégorie, type, illustrateur, PV, gradation)"),
        h("div", { class: "filtres" }, choixEmpl, choixCat, choixType, champIllus, listeIllus, pvMin, choixGrade)),
      compte,
      grille,
      h("div", { class: "centre" }, plus)
    );
    recherche.addEventListener("input", () => { limite = PAS; dessiner(); });
    [choixExt, choixRar, choixVar, choixEtat, choixTri, choixEmpl, choixCat, choixType, choixGrade].forEach((s) => s.addEventListener("change", () => { limite = PAS; dessiner(); }));
    [champIllus, pvMin].forEach((s) => s.addEventListener("input", () => { limite = PAS; dessiner(); }));
    redessiner = dessiner;
    dessiner();
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};
