// Vue « Extensions » : liste des extensions par série avec progression, puis grille des cartes d'une extension.
import { $, h, normalise, cartesDExtension, detailsExtension, lireCacheExtension, detailCarte, lienCardmarket, imageCarte, essayer, message, annee, euros } from "./api.js";
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

const ABREGE = { Normale: "N", Reverse: "R", Holo: "H", "1re édition": "1ʳᵉ" };

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

  let details = null; // id de carte -> { prix, rarete, variantes… }, une fois chargé
  let master = false;
  const enCache = lireCacheExtension(setId);
  if (enCache) details = new Map(enCache.map((d) => [d.id, d]));

  const recherche = h("input", { type: "search", placeholder: "Rechercher une carte (nom ou n°)", autocomplete: "off" });
  const choixVue = h("select", { "aria-label": "Afficher" },
    h("option", { value: "" }, "Toutes les cartes"),
    h("option", { value: "possedees" }, "Possédées"),
    h("option", { value: "manquantes" }, "Manquantes"),
    h("option", { value: "souhaits" }, "Dans ma wishlist")
  );
  const choixRarete = h("select", { "aria-label": "Rareté" });
  choixRarete.hidden = true;
  const progression = h("div", { class: "ext-entete-prog" });
  const panneauCout = h("section", { class: "panneau" });
  panneauCout.hidden = true;
  const grille = h("div", { class: "cartes-grille" });
  const nbEl = h("p", { class: "muted" });
  const infoDetails = h("p", { class: "muted" });

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

  const boutonDetails = h("button", { type: "button", class: "ghost", title: "Récupère le prix, la rareté et les variantes de chaque carte (une seule fois, puis gardé 7 jours)", onclick: () => chargerDetails() }, "📊 Prix, raretés et variantes");
  const caseMaster = h("input", { type: "checkbox", onchange: () => essayer(async () => {
    if (caseMaster.checked && !details) await chargerDetails();
    master = caseMaster.checked && !!details;
    caseMaster.checked = master;
    dessiner();
  }) });
  const boutonAchat = h("button", { type: "button", class: "ghost", onclick: () => ouvrirAchat() }, "🛒 Liste d'achat");
  boutonAchat.hidden = true;

  async function chargerDetails() {
    boutonDetails.disabled = true;
    try {
      const liste = await detailsExtension(setId, (n, t) => { infoDetails.textContent = "Chargement des détails : " + n + " / " + t + "…"; });
      details = new Map(liste.map((d) => [d.id, d]));
      infoDetails.textContent = "";
    } catch (e) {
      infoDetails.textContent = "Échec du chargement : " + e.message;
    } finally {
      boutonDetails.disabled = false;
    }
    dessiner();
  }

  const prixDe = (k) => (details && details.get(k.id) ? details.get(k.id).prix : null);

  function dessiner() {
    const quantites = new Map();
    const variantesPossedees = new Map();
    for (const c of S.collection) {
      if (c.set_id !== setId) continue;
      quantites.set(c.carte_id, (quantites.get(c.carte_id) || 0) + c.quantite);
      if (!variantesPossedees.has(c.carte_id)) variantesPossedees.set(c.carte_id, new Set());
      variantesPossedees.get(c.carte_id).add(c.variante);
    }
    const voeux = new Set(S.souhaits.map((x) => x.carte_id));
    const q = normalise(recherche.value);
    const possedeesPrincipales = cartes.filter((k) => estPrincipale(k) && quantites.has(k.id)).length;
    const possedeesTotal = cartes.filter((k) => quantites.has(k.id)).length;

    const lignesProgression = [
      barre(cartes.length ? (possedeesTotal / cartes.length) * 100 : 0),
      h("p", {}, h("b", {}, possedeesPrincipales + " / " + officiel), " cartes principales · ", h("b", {}, possedeesTotal + " / " + cartes.length), " au total (avec les secrètes)"),
    ];
    if (details) {
      let requises = 0, possedees = 0;
      for (const k of cartes) {
        const d = details.get(k.id);
        for (const v of d ? d.variantes : ["Normale"]) {
          requises++;
          if (variantesPossedees.has(k.id) && variantesPossedees.get(k.id).has(v)) possedees++;
        }
      }
      lignesProgression.push(h("p", {}, "🏆 Master set : ", h("b", {}, possedees + " / " + requises), " variantes (normale, reverse, holo…)"));
    }
    progression.replaceChildren(...lignesProgression);

    // Coût pour compléter
    boutonAchat.hidden = !details;
    choixRarete.hidden = !details;
    panneauCout.hidden = !details;
    if (details) {
      if (!choixRarete.children.length) {
        const raretes = [...new Set([...details.values()].map((d) => d.rarete).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
        choixRarete.replaceChildren(h("option", { value: "" }, "Toutes les raretés"), ...raretes.map((r) => h("option", { value: r }, r)));
      }
      const manquantesPrincipales = cartes.filter((k) => estPrincipale(k) && !quantites.has(k.id));
      const manquantesToutes = cartes.filter((k) => !quantites.has(k.id));
      const somme = (l) => l.reduce((s, k) => s + (prixDe(k) || 0), 0);
      const sansPrix = (l) => l.filter((k) => prixDe(k) === null).length;
      const valeurPossedee = cartes.filter((k) => quantites.has(k.id)).reduce((s, k) => s + (prixDe(k) || 0), 0);
      panneauCout.replaceChildren(
        h("h3", {}, "💶 Coût pour compléter"),
        h("p", {}, "Cartes principales manquantes (", manquantesPrincipales.length, ") : ", h("b", {}, euros(somme(manquantesPrincipales))), sansPrix(manquantesPrincipales) ? h("span", { class: "muted" }, " (" + sansPrix(manquantesPrincipales) + " sans prix)") : null),
        h("p", {}, "Extension complète avec les secrètes (", manquantesToutes.length, " manquantes) : ", h("b", {}, euros(somme(manquantesToutes)))),
        h("p", { class: "muted" }, "Valeur de ce que vous possédez ici : " + euros(valeurPossedee) + " · prix Cardmarket moyens sur 30 jours, une carte par numéro (variante normale).")
      );
    }

    const affichees = cartes.filter((k) => {
      if (q && !normalise(k.name).includes(q) && !normalise(k.localId).includes(q)) return false;
      const possede = quantites.has(k.id);
      if (choixVue.value === "possedees" && !possede) return false;
      if (choixVue.value === "manquantes" && possede) return false;
      if (choixVue.value === "souhaits" && !voeux.has(k.id)) return false;
      if (choixRarete.value && (!details || !details.get(k.id) || details.get(k.id).rarete !== choixRarete.value)) return false;
      return true;
    });

    grille.replaceChildren(...affichees.map((k) => tuile(k, quantites.get(k.id) || 0, voeux.has(k.id), estPrincipale(k), details && details.get(k.id), master, variantesPossedees.get(k.id))));
    nbEl.textContent = affichees.length + " carte(s) affichée(s).";
  }

  // ---------- Liste d'achat ----------
  function ouvrirAchat() {
    const possedees = new Set(S.collection.filter((c) => c.set_id === setId).map((c) => c.carte_id));
    const dejaSouhaitees = new Set(S.souhaits.map((x) => x.carte_id));
    let secretes = false;
    const zone = $("achat-contenu");
    const total = h("b", {});
    const liste = h("div", { class: "achat-liste" });
    const cochees = new Set();

    const manquantes = () =>
      cartes
        .filter((k) => !possedees.has(k.id) && (secretes || estPrincipale(k)))
        .sort((a, b) => (prixDe(a) ?? 1e9) - (prixDe(b) ?? 1e9) || (parseInt(a.localId) || 0) - (parseInt(b.localId) || 0));

    function actualiser() {
      const l = manquantes();
      liste.replaceChildren(...l.map((k) => {
        const d = details.get(k.id) || {};
        const case_ = h("input", { type: "checkbox", checked: cochees.has(k.id), onchange: (e) => { e.target.checked ? cochees.add(k.id) : cochees.delete(k.id); majTotal(); } });
        return h("label", { class: "achat-ligne" },
          case_,
          k.image ? h("img", { src: imageCarte(k.image), alt: "", loading: "lazy" }) : h("span", { class: "sans-image" }),
          h("span", { class: "achat-nom" }, h("b", {}, k.name), h("small", { class: "muted" }, " n° " + k.localId + (d.rarete ? " · " + d.rarete : "") + (dejaSouhaitees.has(k.id) ? " · ❤" : ""))),
          h("span", { class: "achat-prix" }, d.prix != null ? euros(d.prix) : "—"),
          h("a", { href: lienCardmarket(k.name, ext && ext.code, k.localId), target: "_blank", rel: "noopener", title: "Chercher sur Cardmarket", onclick: (e) => e.stopPropagation() }, "🛒")
        );
      }));
      majTotal();
    }

    function majTotal() {
      const l = manquantes();
      const sel = l.filter((k) => cochees.has(k.id));
      const somme = (x) => x.reduce((s, k) => s + (prixDe(k) || 0), 0);
      total.textContent = sel.length ? sel.length + " sélectionnée(s) : " + euros(somme(sel)) : l.length + " manquantes : " + euros(somme(l));
    }

    const texte = () => manquantes().filter((k) => !cochees.size || cochees.has(k.id))
      .map((k) => "• " + k.name + " (" + (ext ? ext.code || ext.nom : set.name) + " n° " + k.localId + ")" + (prixDe(k) != null ? " — " + euros(prixDe(k)) : "")).join("\n");

    zone.replaceChildren(
      h("h2", {}, "🛒 Liste d'achat · " + set.name),
      h("p", { class: "muted" }, "Cartes qui vous manquent, des moins chères aux plus chères. Cochez celles qui vous intéressent."),
      h("div", { class: "row tools" },
        h("label", { class: "case" }, h("input", { type: "checkbox", onchange: (e) => { secretes = e.target.checked; cochees.clear(); actualiser(); } }), " Inclure les cartes secrètes"),
        h("button", { type: "button", class: "ghost", onclick: () => { const l = manquantes(); (cochees.size === l.length ? cochees.clear() : l.forEach((k) => cochees.add(k.id))); actualiser(); } }, "Tout cocher / décocher")
      ),
      liste,
      h("p", {}, total),
      h("div", { class: "row tools" },
        h("button", { type: "button", class: "ghost", onclick: async () => { try { await navigator.clipboard.writeText(texte()); message("✔ Liste copiée.", "ok"); } catch { message("Copie impossible sur ce navigateur.", "ko"); } } }, "📋 Copier la liste"),
        S.lectureSeule ? null : h("button", { type: "button", onclick: () => essayer(async () => {
          const aAjouter = manquantes().filter((k) => cochees.has(k.id) && !dejaSouhaitees.has(k.id));
          if (!aAjouter.length) return message("Cochez des cartes (pas déjà dans la wishlist).", "ko");
          for (const k of aAjouter) { await D.souhaiter(await detailCarte(k.id)); dejaSouhaitees.add(k.id); }
          message("✔ " + aAjouter.length + " carte(s) ajoutée(s) à la wishlist.", "ok");
          actualiser();
        }) }, "❤ Ajouter la sélection à la wishlist")
      )
    );
    actualiser();
    $("achat").showModal();
  }

  conteneur.replaceChildren(
    h("a", { class: "retour", href: "#/extensions" }, "← Toutes les extensions"),
    h("div", { class: "ext-entete" },
      ext && ext.logo ? h("img", { class: "ext-logo grand", alt: "", src: ext.logo + ".webp", onerror: (ev) => ev.target.remove() }) : null,
      h("div", {}, h("h2", {}, set.name), h("p", { class: "muted" }, [ext && ext.code, ext && ext.serie, ext && annee(ext)].filter(Boolean).join(" · "))),
      boutonLot
    ),
    progression,
    panneauCout,
    h("div", { class: "filtres" }, recherche, choixVue, choixRarete),
    h("div", { class: "row tools" }, boutonDetails, h("label", { class: "case" }, caseMaster, " 🏆 Mode master set"), boutonAchat),
    infoDetails,
    nbEl,
    grille
  );
  recherche.addEventListener("input", dessiner);
  choixVue.addEventListener("change", dessiner);
  choixRarete.addEventListener("change", dessiner);
  redessiner = dessiner;
  dessiner();
}

function tuile(k, qte, voeu, principale, d, master, variantesPossedees) {
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

  // Master set : une pastille par variante existante, allumée si on la possède (un clic l'ajoute)
  const pastilles = master && d
    ? h("div", { class: "pastilles" }, d.variantes.map((v) => {
        const possede = variantesPossedees && variantesPossedees.has(v);
        return h("button", {
          type: "button", class: "pastille" + (possede ? " ok" : ""), title: v + (possede ? " : possédée" : " : manquante (clic pour ajouter)"),
          disabled: S.lectureSeule || possede,
          onclick: () => essayer(() => D.ajouterCarteCourte(k, { variante: v })),
        }, ABREGE[v] || v);
      }))
    : null;

  return h("div", { class: "tuile-carte " + (qte ? "possedee" : "manquante") },
    h("button", { type: "button", class: "tuile-img", title: "Voir la carte", onclick: () => ouvrirCarte(k.id) },
      k.image ? h("img", { loading: "lazy", alt: k.name, src: imageCarte(k.image), onerror: (ev) => ev.target.replaceWith(h("div", { class: "sans-image" }, "Pas d'image")) }) : h("div", { class: "sans-image" }, "Pas d'image"),
      voeu ? h("span", { class: "badge-voeu", title: "Dans la wishlist" }, "❤") : null,
      qte > 1 ? h("span", { class: "badge-qte" }, "×" + qte) : null
    ),
    h("div", { class: "tuile-info" },
      h("span", { class: "num" }, "n° " + k.localId + (principale ? "" : " ✦")),
      h("b", { title: k.name }, k.name),
      d && d.rarete ? h("span", { class: "num" }, d.rarete) : null,
      d && d.prix != null ? h("span", { class: "prix" }, euros(d.prix)) : null
    ),
    pastilles,
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
