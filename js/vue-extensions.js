// Vue « Extensions » : liste des extensions par série avec progression, puis grille des cartes d'une extension.
import { h, normalise, cartesDExtension, imageCarte, essayer, message, annee, euros } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { ouvrirCarte } from "./dialogue-carte.js";

let redessiner = null;

export const vueExtensions = {
  async monter(conteneur, setId) {
    redessiner = null;
    if (setId) await monterDetail(conteneur, setId);
    else monterListe(conteneur);
  },
  rafraichir() {
    if (redessiner) redessiner();
  },
};

// Cartes distinctes possédées par extension
function comptes() {
  const parSet = new Map();
  for (const c of S.collection) {
    if (!parSet.has(c.set_id)) parSet.set(c.set_id, new Set());
    parSet.get(c.set_id).add(c.carte_id);
  }
  return parSet;
}

function barre(pct) {
  const rempli = h("div", { class: "barre-rempli" });
  rempli.style.width = Math.min(100, pct) + "%";
  return h("div", { class: "barre" }, rempli);
}

// ---------- Liste des extensions ----------

function monterListe(conteneur) {
  const recherche = h("input", { type: "search", placeholder: "Rechercher une extension (nom ou code)", autocomplete: "off" });
  const series = [...new Set(S.extensions.map((e) => e.serie))];
  const choixSerie = h("select", { "aria-label": "Série" }, h("option", { value: "" }, "Toutes les séries"), series.map((s) => h("option", { value: s }, s)));
  const choixEtat = h("select", { "aria-label": "Avancement" },
    h("option", { value: "" }, "Toutes"),
    h("option", { value: "commencees" }, "Commencées"),
    h("option", { value: "completes" }, "Complètes"),
    h("option", { value: "vides" }, "Pas commencées")
  );
  const zone = h("div", { class: "ext-zone" });
  const resume = h("p", { class: "muted" });

  function dessiner() {
    const parSet = comptes();
    const q = normalise(recherche.value);
    const groupes = new Map();
    let nb = 0;

    for (const e of S.extensions) {
      const n = parSet.has(e.id) ? parSet.get(e.id).size : 0;
      if (choixSerie.value && e.serie !== choixSerie.value) continue;
      if (q && !normalise(e.nom).includes(q) && !normalise(e.code || "").includes(q)) continue;
      const complete = e.officiel && n >= e.officiel;
      if (choixEtat.value === "commencees" && !(n > 0 && !complete)) continue;
      if (choixEtat.value === "completes" && !complete) continue;
      if (choixEtat.value === "vides" && n > 0) continue;
      if (!groupes.has(e.serie)) groupes.set(e.serie, []);
      groupes.get(e.serie).push({ e, n });
      nb++;
    }

    zone.replaceChildren();
    for (const [serie, liste] of groupes) {
      const possedees = liste.reduce((s, x) => s + x.n, 0);
      zone.append(
        h("h2", { class: "serie-titre" }, serie, h("small", {}, " · " + liste.length + " extensions · " + possedees + " cartes possédées")),
        h("div", { class: "ext-grille" }, liste.map(({ e, n }) => carteExtension(e, n)))
      );
    }
    if (!nb) zone.append(h("p", { class: "muted" }, "Aucune extension ne correspond."));
    resume.textContent = nb + " extension(s) affichée(s).";
  }

  conteneur.replaceChildren(
    h("div", { class: "filtres" }, recherche, choixSerie, choixEtat),
    resume,
    zone
  );
  [recherche].forEach((x) => x.addEventListener("input", dessiner));
  [choixSerie, choixEtat].forEach((x) => x.addEventListener("change", dessiner));
  redessiner = dessiner;
  dessiner();
}

function carteExtension(e, n) {
  const total = e.total || e.officiel || 0;
  const pct = total ? (n / total) * 100 : 0;
  const code = () => h("span", { class: "ext-code" }, e.code || "");
  const logo = e.logo ? h("img", { class: "ext-logo", loading: "lazy", alt: "", src: e.logo + ".webp", onerror: (ev) => ev.target.replaceWith(code()) }) : null;
  return h("a", { class: "ext-carte" + (n && e.officiel && n >= e.officiel ? " complete" : ""), href: "#/extensions/" + e.id },
    h("div", { class: "ext-visuel" }, logo || code()),
    h("b", { class: "ext-nom" }, e.nom),
    h("small", { class: "muted" }, [e.code, annee(e)].filter(Boolean).join(" · ")),
    barre(pct),
    h("span", { class: "ext-compte" }, n + " / " + total)
  );
}

// ---------- Détail d'une extension ----------

async function monterDetail(conteneur, setId) {
  const ext = S.extParId.get(setId);
  conteneur.replaceChildren(h("p", { class: "msg" }, "Chargement de l'extension…"));
  let donnees;
  try {
    donnees = await cartesDExtension(setId);
  } catch (e) {
    return conteneur.replaceChildren(h("p", { class: "msg ko" }, "Extension indisponible : " + e.message), h("a", { href: "#/extensions" }, "← Retour aux extensions"));
  }
  const { set, cartes } = donnees;
  const officiel = (set.cardCount && set.cardCount.official) || (ext && ext.officiel) || 0;
  const estPrincipale = (k) => (parseInt(k.localId, 10) || 0) > 0 && (parseInt(k.localId, 10) || 0) <= officiel;

  const recherche = h("input", { type: "search", placeholder: "Rechercher une carte (nom ou n°)", autocomplete: "off" });
  const choixVue = h("select", { "aria-label": "Afficher" },
    h("option", { value: "" }, "Toutes les cartes"),
    h("option", { value: "possedees" }, "Possédées"),
    h("option", { value: "manquantes" }, "Manquantes"),
    h("option", { value: "souhaits" }, "Dans ma wishlist")
  );
  const progression = h("div", { class: "ext-entete-prog" });
  const grille = h("div", { class: "cartes-grille" });
  const nbEl = h("p", { class: "muted" });

  const boutonLot = S.lectureSeule ? null : h("button", {
    type: "button", class: "ghost",
    title: "Ajoute 1 exemplaire (Normale, Neuf) de chaque carte principale que vous n'avez pas encore",
    onclick: () => essayer(async () => {
      const manquantes = cartes.filter((k) => estPrincipale(k) && !S.collection.some((c) => c.carte_id === k.id));
      if (!manquantes.length) return message("Toutes les cartes principales sont déjà dans la collection.", "ok");
      if (!confirm("Ajouter 1 exemplaire (Normale, Neuf) de chacune des " + manquantes.length + " cartes principales manquantes ?")) return;
      message("Ajout de " + manquantes.length + " cartes…");
      const n = await D.ajouterLot(manquantes);
      message("✔ " + n + " cartes ajoutées. Les informations détaillées (rareté, prix) se complètent en arrière-plan.", "ok");
    }),
  }, "✔ J'ai toute l'extension (cartes principales)");

  function dessiner() {
    const quantites = new Map();
    for (const c of S.collection) if (c.set_id === setId) quantites.set(c.carte_id, (quantites.get(c.carte_id) || 0) + c.quantite);
    const voeux = new Set(S.souhaits.map((x) => x.carte_id));
    const q = normalise(recherche.value);
    const possedeesPrincipales = cartes.filter((k) => estPrincipale(k) && quantites.has(k.id)).length;
    const possedeesTotal = cartes.filter((k) => quantites.has(k.id)).length;

    progression.replaceChildren(
      barre(cartes.length ? (possedeesTotal / cartes.length) * 100 : 0),
      h("p", {}, h("b", {}, possedeesPrincipales + " / " + officiel), " cartes principales · ", h("b", {}, possedeesTotal + " / " + cartes.length), " au total (avec les secrètes)")
    );

    const affichees = cartes.filter((k) => {
      if (q && !normalise(k.name).includes(q) && !normalise(k.localId).includes(q)) return false;
      const possede = quantites.has(k.id);
      if (choixVue.value === "possedees" && !possede) return false;
      if (choixVue.value === "manquantes" && possede) return false;
      if (choixVue.value === "souhaits" && !voeux.has(k.id)) return false;
      return true;
    });

    grille.replaceChildren(...affichees.map((k) => tuile(k, quantites.get(k.id) || 0, voeux.has(k.id), estPrincipale(k))));
    nbEl.textContent = affichees.length + " carte(s) affichée(s).";
  }

  conteneur.replaceChildren(
    h("a", { class: "retour", href: "#/extensions" }, "← Toutes les extensions"),
    h("div", { class: "ext-entete" },
      ext && ext.logo ? h("img", { class: "ext-logo grand", alt: "", src: ext.logo + ".webp", onerror: (ev) => ev.target.remove() }) : null,
      h("div", {}, h("h2", {}, set.name), h("p", { class: "muted" }, [ext && ext.code, ext && ext.serie, ext && annee(ext)].filter(Boolean).join(" · "))),
      boutonLot
    ),
    progression,
    h("div", { class: "filtres" }, recherche, choixVue),
    nbEl,
    grille
  );
  recherche.addEventListener("input", dessiner);
  choixVue.addEventListener("change", dessiner);
  redessiner = dessiner;
  dessiner();
}

function tuile(k, qte, voeu, principale) {
  const actions = S.lectureSeule
    ? qte ? h("span", { class: "qte" }, "× " + qte) : null
    : h("div", { class: "tuile-actions" },
        qte
          ? [
              h("button", { type: "button", class: "ghost", "aria-label": "Retirer un exemplaire", onclick: () => essayer(() => retirerUn(k)) }, "−"),
              h("b", {}, qte),
              h("button", { type: "button", class: "ghost", "aria-label": "Ajouter un exemplaire", onclick: () => essayer(() => D.ajouterCarteCourte(k)) }, "+"),
            ]
          : h("button", { type: "button", onclick: () => essayer(() => D.ajouterCarteCourte(k)) }, "+ Ajouter")
      );

  return h("div", { class: "tuile-carte " + (qte ? "possedee" : "manquante") },
    h("button", { type: "button", class: "tuile-img", title: "Voir la carte", onclick: () => ouvrirCarte(k.id) },
      k.image ? h("img", { loading: "lazy", alt: k.name, src: imageCarte(k.image), onerror: (ev) => ev.target.replaceWith(h("div", { class: "sans-image" }, "Pas d'image")) }) : h("div", { class: "sans-image" }, "Pas d'image"),
      voeu ? h("span", { class: "badge-voeu", title: "Dans la wishlist" }, "❤") : null,
      qte > 1 ? h("span", { class: "badge-qte" }, "×" + qte) : null
    ),
    h("div", { class: "tuile-info" },
      h("span", { class: "num" }, "n° " + k.localId + (principale ? "" : " ✦")),
      h("b", { title: k.name }, k.name)
    ),
    actions
  );
}

// « − » retire un exemplaire de la dernière ligne ajoutée pour cette carte
async function retirerUn(k) {
  const lignes = S.collection.filter((c) => c.carte_id === k.id);
  if (!lignes.length) return;
  const l = lignes[lignes.length - 1];
  if (l.quantite === 1 && lignes.length === 1 && !confirm("Retirer " + k.name + " de la collection ?")) return;
  await D.changerQuantite(l, l.quantite - 1);
}
