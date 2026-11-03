// Vue « Mes classeurs » : classeurs virtuels à pages de cases (3×3 par défaut), où l'on range ses cartes.
import { $, h, normalise, euros, essayer, message, imageCarte, libelleExt, squelette } from "./api.js";
import { S } from "./etat.js";
import { chargerExtra, ajouterLigne, majLigne, supprimerLigne, caseDe, poserCarte, deplacerCase } from "./donnees-extra.js";
import { ouvrirCarte } from "./dialogue-carte.js";

let redessiner = null;
const pageCourante = new Map(); // id de classeur -> page affichée

export const vueClasseurs = {
  async monter(conteneur, param) {
    conteneur.replaceChildren(squelette(6));
    try {
      await chargerExtra();
    } catch (e) {
      return conteneur.replaceChildren(h("p", { class: "msg ko" }, "Indisponible : " + e.message + " — la migration schema-v4.sql a-t-elle été lancée ?"));
    }
    if (param) montrerClasseur(conteneur, Number(param));
    else listeClasseurs(conteneur);
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};

const casesDe = (c) => S.cases.filter((x) => x.classeur_id === c.id);

// ---------- Liste des classeurs ----------

function listeClasseurs(conteneur) {
  const nom = h("input", { type: "text", placeholder: "Nom du classeur (ex. Dresseurs rares)", required: true, autocomplete: "off" });
  const lignes = h("input", { type: "number", min: "1", max: "6", value: "3", title: "Lignes par page", "aria-label": "Lignes" });
  const colonnes = h("input", { type: "number", min: "1", max: "6", value: "3", title: "Colonnes par page", "aria-label": "Colonnes" });
  const pages = h("input", { type: "number", min: "1", value: "10", title: "Nombre de pages", "aria-label": "Pages" });
  const liste = h("div", { class: "ext-grille" });

  const formulaire = h("form", {
    class: "filtres",
    onsubmit: (e) => {
      e.preventDefault();
      essayer(async () => {
        const c = await ajouterLigne("classeurs", {
          nom: nom.value.trim(),
          lignes: Math.min(6, Math.max(1, parseInt(lignes.value, 10) || 3)),
          colonnes: Math.min(6, Math.max(1, parseInt(colonnes.value, 10) || 3)),
          pages: Math.max(1, parseInt(pages.value, 10) || 10),
        });
        location.hash = "#/classeurs/" + c.id;
      });
    },
  }, nom, h("label", { class: "case" }, "Lignes ", lignes), h("label", { class: "case" }, "Colonnes ", colonnes), h("label", { class: "case" }, "Pages ", pages), h("button", { type: "submit" }, "+ Créer le classeur"));

  function dessiner() {
    liste.replaceChildren(...(S.classeurs.length
      ? S.classeurs.map((c) => {
          const cases = casesDe(c);
          const total = c.lignes * c.colonnes * c.pages;
          const valeur = cases.reduce((s, x) => s + Number(x.valeur || 0), 0);
          const apercu = cases.filter((x) => x.image).slice(0, 3);
          return h("a", { class: "ext-carte", href: "#/classeurs/" + c.id },
            h("div", { class: "ext-visuel apercu" }, apercu.length ? apercu.map((x) => h("img", { src: imageCarte(x.image), alt: "", loading: "lazy" })) : h("span", { class: "ext-code" }, "📘")),
            h("b", { class: "ext-nom" }, c.nom),
            h("small", { class: "muted" }, c.colonnes + "×" + c.lignes + " · " + c.pages + " pages"),
            h("span", { class: "ext-compte" }, cases.length + " / " + total + " cases · " + euros(valeur))
          );
        })
      : [h("p", { class: "muted" }, "Aucun classeur. Créez-en un pour y ranger vos plus belles cartes, page par page.")]));
  }

  conteneur.replaceChildren(h("h2", {}, "Mes classeurs"), formulaire, liste);
  redessiner = dessiner;
  dessiner();
}

// ---------- Un classeur ----------

function montrerClasseur(conteneur, id) {
  const classeur = S.classeurs.find((c) => c.id === id);
  if (!classeur) return conteneur.replaceChildren(h("p", { class: "msg ko" }, "Classeur introuvable."), h("a", { class: "retour", href: "#/classeurs" }, "← Mes classeurs"));

  const titre = h("h2", {});
  const infos = h("p", { class: "muted" });
  const navigation = h("div", { class: "row tools" });
  const grille = h("div", { class: "classeur-page" });
  let deplacement = null; // case en cours de déplacement par glisser-déposer

  function dessiner() {
    const page = Math.min(pageCourante.get(id) || 1, classeur.pages);
    pageCourante.set(id, page);
    const taille = classeur.lignes * classeur.colonnes;
    const cases = casesDe(classeur);
    const surPage = cases.filter((x) => x.page === page);
    const valeur = cases.reduce((s, x) => s + Number(x.valeur || 0), 0);

    titre.textContent = "📘 " + classeur.nom;
    infos.textContent = cases.length + " / " + classeur.lignes * classeur.colonnes * classeur.pages + " cases remplies · valeur " + euros(valeur) + " · " + classeur.colonnes + "×" + classeur.lignes + " par page";

    navigation.replaceChildren(
      h("button", { type: "button", class: "ghost", disabled: page <= 1, onclick: () => { pageCourante.set(id, page - 1); dessiner(); } }, "◀"),
      h("b", {}, "Page " + page + " / " + classeur.pages + " (" + surPage.length + "/" + taille + ")"),
      h("button", { type: "button", class: "ghost", disabled: page >= classeur.pages, onclick: () => { pageCourante.set(id, page + 1); dessiner(); } }, "▶"),
      S.lectureSeule ? null : h("button", { type: "button", class: "ghost", onclick: () => essayer(async () => { await majLigne("classeurs", classeur, { pages: classeur.pages + 1 }); pageCourante.set(id, classeur.pages); dessiner(); }) }, "+ Page"),
      S.lectureSeule ? null : h("button", { type: "button", class: "ghost", onclick: () => essayer(async () => {
        if (classeur.pages <= 1) return;
        if (cases.some((x) => x.page === classeur.pages)) return message("La dernière page contient des cartes : videz-la d'abord.", "ko");
        await majLigne("classeurs", classeur, { pages: classeur.pages - 1 });
        dessiner();
      }) }, "− Page")
    );

    grille.style.gridTemplateColumns = "repeat(" + classeur.colonnes + ", 1fr)";
    grille.replaceChildren(...Array.from({ length: taille }, (_, position) => emplacement(page, position)));
  }

  function emplacement(page, position) {
    const c = caseDe(classeur.id, page, position);
    const slot = h("div", {
      class: "case-classeur" + (c ? " pleine" : ""),
      ondragover: (e) => { if (deplacement) e.preventDefault(); },
      ondrop: (e) => {
        e.preventDefault();
        const source = deplacement;
        deplacement = null;
        if (source) essayer(() => deplacerCase(source, page, position));
      },
    });
    if (c) {
      slot.draggable = !S.lectureSeule;
      slot.addEventListener("dragstart", () => { deplacement = c; });
      slot.append(
        h("button", { type: "button", class: "tuile-img", title: c.nom + " — " + libelleExt(c.set_id) + " n° " + c.local_id, onclick: () => ouvrirCarte(c.carte_id) },
          c.image ? h("img", { src: imageCarte(c.image), alt: c.nom, loading: "lazy", draggable: "false" }) : h("div", { class: "sans-image" }, c.nom)
        ),
        S.lectureSeule ? null : h("div", { class: "case-actions" },
          h("button", { type: "button", class: "ghost", title: "Changer la carte", onclick: () => choisirCarte(page, position) }, "✎"),
          h("button", { type: "button", class: "ghost danger", title: "Vider la case", onclick: () => essayer(() => supprimerLigne("classeur_cases", c)) }, "✕")
        )
      );
    } else if (!S.lectureSeule) {
      slot.append(h("button", { type: "button", class: "case-vide", title: "Ajouter une carte", onclick: () => choisirCarte(page, position) }, "+"));
    }
    return slot;
  }

  // Fenêtre de choix : les cartes de ma collection
  function choisirCarte(page, position) {
    const zone = $("choix-case-contenu");
    const recherche = h("input", { type: "search", placeholder: "Rechercher dans ma collection", autocomplete: "off" });
    const liste = h("div", { class: "grille" });
    const uniques = [...new Map(S.collection.map((c) => [c.carte_id, c])).values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

    function actualiser() {
      const q = normalise(recherche.value);
      const trouvees = uniques.filter((c) => !q || normalise(c.nom).includes(q) || normalise(c.local_id).includes(q) || normalise(libelleExt(c.set_id)).includes(q));
      liste.replaceChildren(...(trouvees.length
        ? trouvees.slice(0, 150).map((c) => h("button", {
            type: "button", class: "tuile",
            onclick: () => essayer(async () => { await poserCarte(classeur, page, position, c); $("choix-case").close(); }),
          }, c.image ? h("img", { src: imageCarte(c.image), alt: c.nom, loading: "lazy" }) : h("div", { class: "sans-image" }, "Pas d'image"), h("span", {}, c.nom + " · " + libelleExt(c.set_id) + " n° " + c.local_id)))
        : [h("p", { class: "muted pleine-ligne" }, S.collection.length ? "Aucune carte ne correspond." : "Votre collection est vide : ajoutez d'abord des cartes.")]));
    }

    recherche.addEventListener("input", actualiser);
    zone.replaceChildren(h("h2", {}, "Page " + page + " · case " + (position + 1)), recherche, liste);
    actualiser();
    $("choix-case").showModal();
  }

  const renommer = S.lectureSeule ? null : h("button", { type: "button", class: "ghost", onclick: () => essayer(async () => {
    const n = prompt("Nouveau nom du classeur :", classeur.nom);
    if (n && n.trim()) await majLigne("classeurs", classeur, { nom: n.trim() });
    dessiner();
  }) }, "✎ Renommer");
  const supprimer = S.lectureSeule ? null : h("button", { type: "button", class: "ghost danger", onclick: () => essayer(async () => {
    if (!confirm("Supprimer le classeur « " + classeur.nom + " » ? Les cartes restent dans votre collection.")) return;
    await supprimerLigne("classeurs", classeur);
    location.hash = "#/classeurs";
  }) }, "🗑 Supprimer");

  conteneur.replaceChildren(
    h("a", { class: "retour", href: "#/classeurs" }, "← Mes classeurs"),
    h("div", { class: "row" }, titre, h("div", { class: "row-btn" }, renommer, supprimer)),
    infos, navigation,
    S.lectureSeule ? null : h("p", { class: "muted" }, "Astuce : glissez une carte vers une autre case pour la déplacer ou l'échanger (sur ordinateur) ; ✎ pour changer la carte, ✕ pour vider la case."),
    grille
  );
  redessiner = dessiner;
  dessiner();
}
