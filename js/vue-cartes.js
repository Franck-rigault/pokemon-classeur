// Vue « Mes cartes » : toute la collection à plat, avec recherche, filtres et tri.
import { h, boutonCardmarket, normalise, imageCarte, essayer, euros, libelleExt, message, ETATS, VARIANTES } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { ouvrirCarte } from "./dialogue-carte.js";
import { chargerPrefs, lirePref, ecrirePref, schemaV8 } from "./prefs.js";

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
    let modeSelection = false;
    let visibles = []; // lignes correspondant aux filtres
    const selection = new Set(); // identifiants des lignes cochées
    const barreSelection = h("div", { class: "barre-selection", hidden: true });
    const boutonSelection = h("button", { type: "button", class: "ghost", onclick: () => basculerSelection() }, "☑ Sélectionner");
    const choixVue = h("select", { "aria-label": "Mes vues enregistrées", title: "Filtres enregistrés" });
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

      visibles = lignes;
      for (const id of [...selection]) if (!S.collection.some((c) => c.id === id)) selection.delete(id);
      majBarre();
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
      const cochee = selection.has(l.id);
      return h("div", { class: "tuile-carte possedee" + (cochee ? " cochee" : "") },
        modeSelection ? h("span", { class: "tuile-coche", "aria-hidden": "true" }, cochee ? "☑" : "☐") : null,
        !modeSelection && !S.lectureSeule && "favori" in l
          ? h("button", {
              type: "button", class: "tuile-etoile" + (l.favori ? " active" : ""), title: l.favori ? "Retirer des coups de cœur" : "Ajouter aux coups de cœur", "aria-pressed": l.favori ? "true" : "false",
              onclick: (ev) => { ev.stopPropagation(); essayer(() => D.modifierEntree(l, { favori: !l.favori })); },
            }, l.favori ? "★" : "☆")
          : null,
        h("button", { type: "button", class: "tuile-img", title: modeSelection ? "Cocher / décocher" : "Voir la carte", onclick: () => (modeSelection ? cocher(l) : ouvrirCarte(l.carte_id)) },
          l.image ? h("img", { loading: "lazy", alt: l.nom, src: imageCarte(l.image), onerror: (ev) => ev.target.replaceWith(h("div", { class: "sans-image" }, "Pas d'image")) }) : h("div", { class: "sans-image" }, "Pas d'image"),
          l.quantite > 1 ? h("span", { class: "badge-qte" }, "×" + l.quantite) : null
        ),
        h("div", { class: "tuile-info" },
          h("div", { class: "ligne-nom" }, h("b", { title: l.nom }, l.nom), boutonCardmarket(l.nom, l.set_id, l.local_id)),
          h("span", { class: "num" }, [ext ? ext.code || ext.nom : l.set_id, "n° " + l.local_id].join(" · ")),
          h("span", { class: "num" }, [l.variante !== "Normale" ? l.variante : null, l.grade_societe ? l.grade_societe + " " + (l.grade_note ?? "") : l.etat !== "Neuf" ? l.etat : null, l.rarete].filter(Boolean).join(" · ")),
          l.emplacement ? h("span", { class: "num", title: "Rangement" }, "📍 " + l.emplacement) : null,
          l.valeur != null ? h("span", { class: "prix" }, euros(D.valeurLigne(l))) : null
        ),
        S.lectureSeule
          ? h("span", { class: "qte" }, "× " + l.quantite)
          : h("div", { class: "tuile-actions" },
              h("button", { type: "button", class: "ghost", "aria-label": "Retirer un exemplaire", onclick: () => essayer(() => D.changerQuantite(l, l.quantite - 1)) }, "−"),
              h("b", {}, l.quantite),
              h("button", { type: "button", class: "ghost", "aria-label": "Ajouter un exemplaire", onclick: () => essayer(() => D.changerQuantite(l, l.quantite + 1)) }, "+")
            )
      );
    }


    // ---------- Sélection multiple ----------
    const rangementSel = h("input", { type: "text", list: "emplacements", placeholder: "📍 Rangement", autocomplete: "off", "aria-label": "Rangement" });
    function basculerSelection() {
      modeSelection = !modeSelection;
      selection.clear();
      boutonSelection.textContent = modeSelection ? "✕ Terminer la sélection" : "☑ Sélectionner";
      dessiner();
    }
    function cocher(l) {
      if (selection.has(l.id)) selection.delete(l.id);
      else selection.add(l.id);
      dessiner();
    }
    const choisies = () => S.collection.filter((c) => selection.has(c.id));
    function majBarre() {
      barreSelection.hidden = !modeSelection;
      if (!modeSelection) return;
      const n = selection.size;
      const appliquer = (champs, libelle) => essayer(async () => {
        const { faites, refusees } = await D.modifierLot(choisies(), champs, libelle);
        if (refusees) message(refusees + " ligne(s) n'ont pas pu être modifiées (une ligne identique existe peut-être déjà).", "ko");
        else if (faites) message("✔ " + faites + " ligne(s) modifiée(s).", "ok");
      });
      const etat = h("select", { "aria-label": "Changer l'état", disabled: !n, onchange: (e) => e.target.value && appliquer({ etat: e.target.value }, "État « " + e.target.value + " »") },
        h("option", { value: "" }, "État…"), ETATS.map((v) => h("option", { value: v }, v)));
      const variante = h("select", { "aria-label": "Changer la variante", disabled: !n, onchange: (e) => e.target.value && appliquer({ variante: e.target.value }, "Variante « " + e.target.value + " »") },
        h("option", { value: "" }, "Variante…"), VARIANTES.map((v) => h("option", { value: v }, v)));
      const rangement = rangementSel;
      rangement.disabled = !n;
      barreSelection.replaceChildren(
        h("b", {}, n + " sélectionnée(s)"),
        h("button", { type: "button", class: "ghost", onclick: () => { visibles.forEach((l) => selection.add(l.id)); dessiner(); } }, "Tout sélectionner (" + visibles.length + ")"),
        h("button", { type: "button", class: "ghost", disabled: !n, onclick: () => { selection.clear(); dessiner(); } }, "Aucune"),
        etat, variante, rangement,
        h("button", { type: "button", class: "ghost", disabled: !n, onclick: () => appliquer({ emplacement: rangement.value.trim() || null }, "Rangement") }, "Ranger"),
        schemaV8() ? h("button", { type: "button", class: "ghost", disabled: !n, onclick: () => appliquer({ favori: true }, "Coups de cœur") }, "★ Favori") : null,
        h("button", { type: "button", class: "ghost danger", disabled: !n, onclick: () => essayer(() => D.supprimerLot(choisies())) }, "🗑 Retirer")
      );
    }

    // ---------- Vues enregistrées (combinaisons de filtres) ----------
    const CHAMPS = { q: recherche, ext: choixExt, rar: choixRar, var: choixVar, etat: choixEtat, empl: choixEmpl, cat: choixCat, type: choixType, illus: champIllus, pv: pvMin, grade: choixGrade, tri: choixTri };
    const lireVues = () => lirePref("vues", []);
    function majChoixVue(courante = "") {
      choixVue.replaceChildren(h("option", { value: "" }, "📑 Mes vues…"), ...lireVues().map((v, i) => h("option", { value: String(i) }, v.nom)));
      choixVue.value = courante;
    }
    function appliquerVue(v) {
      dessiner(); // les listes de choix se remplissent d'après la collection
      for (const [k, el] of Object.entries(CHAMPS)) el.value = v.filtres[k] ?? (k === "tri" ? "recent" : "");
      limite = PAS;
      dessiner();
    }
    choixVue.addEventListener("change", () => { const v = lireVues()[Number(choixVue.value)]; if (v) appliquerVue(v); });
    const enregistrerVue = () => essayer(async () => {
      const filtres = Object.fromEntries(Object.entries(CHAMPS).map(([k, el]) => [k, el.value]).filter(([, v]) => v !== ""));
      if (!Object.keys(filtres).length) return message("Choisissez d'abord des filtres à enregistrer.", "ko");
      const nom = (prompt("Nom de cette vue ? (ex. Feu, rareté ultra, non gradées)") || "").trim();
      if (!nom) return;
      const vues = lireVues().filter((v) => v.nom !== nom).concat({ nom, filtres });
      await ecrirePref("vues", vues);
      majChoixVue(String(vues.length - 1));
      message("✔ Vue « " + nom + " » enregistrée.", "ok");
    });
    const supprimerVue = () => essayer(async () => {
      const i = Number(choixVue.value);
      const v = choixVue.value !== "" && lireVues()[i];
      if (!v) return message("Choisissez d'abord une vue à supprimer.", "ko");
      await ecrirePref("vues", lireVues().filter((_, j) => j !== i));
      majChoixVue();
      message("Vue « " + v.nom + " » supprimée.", "ok");
    });
    const barreVues = S.lectureSeule ? null : h("div", { class: "row tools barre-vues" },
      choixVue,
      h("button", { type: "button", class: "ghost", onclick: enregistrerVue, title: "Enregistre les filtres actuels" }, "💾 Enregistrer cette vue"),
      h("button", { type: "button", class: "ghost danger", onclick: supprimerVue, title: "Supprime la vue choisie" }, "🗑"),
      boutonSelection
    );

    conteneur.replaceChildren(
      stats,
      h("div", { class: "filtres" }, recherche, choixExt, choixRar, choixVar, choixEtat, choixTri),
      h("details", { class: "filtres-plus" }, h("summary", {}, "Filtres avancés (rangement, catégorie, type, illustrateur, PV, gradation)"),
        h("div", { class: "filtres" }, choixEmpl, choixCat, choixType, champIllus, listeIllus, pvMin, choixGrade)),
      barreVues,
      barreSelection,
      compte,
      grille,
      h("div", { class: "centre" }, plus)
    );
    recherche.addEventListener("input", () => { limite = PAS; dessiner(); });
    [choixExt, choixRar, choixVar, choixEtat, choixTri, choixEmpl, choixCat, choixType, choixGrade].forEach((s) => s.addEventListener("change", () => { limite = PAS; dessiner(); }));
    [champIllus, pvMin].forEach((s) => s.addEventListener("input", () => { limite = PAS; dessiner(); }));
    redessiner = dessiner;
    dessiner();
    if (!S.lectureSeule) chargerPrefs().then(() => majChoixVue());
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};
