// Fenêtre de détail d'une carte : image, prix, exemplaires possédés (rangement, gradation),
// ajout (quantité, état, variante), wishlist.
import { $, h, boutonCardmarket, detailCarte, imageCarte, variantesDe, euros, essayer, message, ETATS, lienCardmarket, libelleExt, squelette } from "./api.js";
import { S, evenements } from "./etat.js";
import * as D from "./donnees.js";
import { carte3D, couleurType } from "./carte3d.js";
import { db } from "./api.js";
import { schemaV8 } from "./prefs.js";
import { estTemporaire } from "./horsligne.js";
import { reduirePhoto } from "./photos.js";

const SOCIETES = ["PSA", "CGC", "BGS", "PCA", "Autre"];

let idCourant = null;
let detail = null;

// Liste des emplacements déjà utilisés (suggestions de saisie)
export function majSuggestionsEmplacements() {
  const dl = $("emplacements");
  if (!dl) return;
  const connus = [...new Set(S.collection.map((c) => c.emplacement).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  dl.replaceChildren(...connus.map((e) => new Option(e, e)));
  const boutiques = $("boutiques");
  if (boutiques) boutiques.replaceChildren(...[...new Set([...S.collection, ...S.produits].map((c) => c.boutique).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")).map((e) => new Option(e, e)));
}

export const libelleLigne = (l) =>
  [l.variante, l.grade_societe ? l.grade_societe + " " + (l.grade_note ?? "") : l.etat].filter(Boolean).join(" · ");

export async function ouvrirCarte(id) {
  const dlg = $("carte");
  idCourant = id;
  detail = null;
  $("carte-contenu").replaceChildren(squelette(1, "Chargement de la carte…"));
  if (!dlg.open) dlg.showModal();
  try {
    detail = await detailCarte(id);
  } catch (e) {
    $("carte-contenu").replaceChildren(h("p", { class: "msg ko" }, "Carte introuvable : " + e.message));
    return;
  }
  if (idCourant === id) dessiner();
}


const ouverts = new Set(); // lignes dont le bloc « Note, achat et photos » est déplié (il reste ouvert quand la fiche se redessine)

// Note personnelle, fiche d'achat (boutique, date, facture) et photos d'un exemplaire
function detailsPerso(l) {
  const champ = (nom, valeur, extra) => h("input", { ...extra, value: valeur ?? "", onchange: (e) => essayer(() => D.modifierEntree(l, { [nom]: e.target.value.trim() || null })) });
  const resume = [l.note ? "📝" : null, l.boutique || l.date_achat || l.facture ? "🧾" : null].filter(Boolean).join(" ");
  return h("details", {
    class: "exemplaire-plus", open: ouverts.has(l.id),
    ontoggle: (e) => { if (e.target.open) ouverts.add(l.id); else ouverts.delete(l.id); },
  },
    h("summary", {}, "Note, achat et photos " + (resume ? "· " + resume : "")),
    h("div", { class: "exemplaire-plus-corps" },
      champ("note", l.note, { type: "text", placeholder: "📝 Note (ex. reçue de Mamie, petit pli en haut)", maxlength: "300", "aria-label": "Note" }),
      h("div", { class: "row tools" },
        champ("boutique", l.boutique, { type: "text", placeholder: "🏪 Boutique", "aria-label": "Boutique", list: "boutiques" }),
        h("input", {
          type: "date", value: l.date_achat ?? "", "aria-label": "Date d'achat", title: "Date d'achat",
          onchange: (e) => essayer(() => D.modifierEntree(l, { date_achat: e.target.value || null })),
        })
      ),
      champ("facture", l.facture, { type: "url", placeholder: "🧾 Lien de la facture ou de la commande", "aria-label": "Lien de la facture" }),
      l.facture ? h("a", { href: l.facture, target: "_blank", rel: "noopener noreferrer", class: "muted" }, "Ouvrir la facture ↗") : null,
      blocPhotos(l)
    )
  );
}

// Photos de sa propre carte : petites images enregistrées à part (table photos_cartes), chargées à la demande
function blocPhotos(l) {
  const zone = h("div", { class: "photos" });
  const charger = async () => {
    if (estTemporaire(l.id)) return zone.replaceChildren(h("p", { class: "muted" }, "Les photos seront disponibles une fois la modification synchronisée."));
    if (!navigator.onLine) return zone.replaceChildren(h("p", { class: "muted" }, "📴 Les photos demandent une connexion."));
    const { data, error } = await db.from("photos_cartes").select("id, data").eq("collection_id", l.id).order("id");
    if (error) return zone.replaceChildren(h("p", { class: "muted" }, "Photos indisponibles : " + error.message + " (schema-v8.sql ?)"));
    zone.replaceChildren(...data.map((p) => h("div", { class: "photo" },
      h("img", { src: p.data, alt: "Photo de ma carte", loading: "lazy", onclick: () => window.open(p.data, "_blank") }),
      h("button", {
        type: "button", class: "ghost danger", "aria-label": "Supprimer la photo",
        onclick: () => essayer(async () => {
          const r = await db.from("photos_cartes").delete().eq("id", p.id);
          if (r.error) throw r.error;
          await charger();
        }),
      }, "✕"))));
  };
  const fichier = h("input", {
    type: "file", accept: "image/*", hidden: true,
    onchange: (e) => essayer(async () => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      if (estTemporaire(l.id) || !navigator.onLine) throw new Error("Ajouter une photo demande une connexion.");
      const data = await reduirePhoto(f);
      const r = await db.from("photos_cartes").insert({ collection_id: l.id, data });
      if (r.error) throw r.error;
      message("✔ Photo ajoutée.", "ok");
      await charger();
    }),
  });
  charger();
  return h("div", {}, zone, fichier, h("button", { type: "button", class: "ghost", onclick: () => fichier.click() }, "📷 Ajouter une photo de ma carte"));
}

// Noms de la carte dans d'autres langues (TCGdex) : utile pour chercher sur Cardmarket ou eBay
function blocLangues(d) {
  const zone = h("p", { class: "carte-meta langues" });
  const essai = async (langue) => {
    try {
      const rep = await fetch("https://api.tcgdex.net/v2/" + langue + "/cards/" + encodeURIComponent(d.id));
      if (!rep.ok) return null;
      return (await rep.json()).name || null;
    } catch {
      return null;
    }
  };
  Promise.all([essai("en"), essai("ja")]).then(([en, ja]) => {
    const morceaux = [en && en !== d.name ? "🇬🇧 " + en : null, ja && ja !== d.name ? "🇯🇵 " + ja : null].filter(Boolean);
    if (!morceaux.length) return zone.remove();
    zone.append(morceaux.join(" · "));
    if (en) zone.append(" ", h("a", { href: "https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=" + encodeURIComponent([en, d.localId].join(" ")), target: "_blank", rel: "noopener noreferrer" }, "Chercher en anglais ↗"));
  });
  return zone;
}

function blocExemplaires(d) {
  const lignes = S.collection.filter((c) => c.carte_id === d.id);
  const nomProprio = (S.profils.find((p) => p.user_id === S.cible) || {}).nom || "cette personne";
  const bloc = h("section", { class: "carte-bloc" }, h("h3", {}, S.lectureSeule ? "Dans la collection de " + nomProprio : "Dans ma collection"));

  if (!lignes.length) {
    bloc.append(h("p", { class: "muted" }, "Aucun exemplaire."));
    return bloc;
  }
  for (const l of lignes) {
    const ligne = h("div", { class: "exemplaire" }, h("span", { class: "exemplaire-nom" }, libelleLigne(l)));
    if (S.lectureSeule) {
      ligne.append(h("b", {}, "× " + l.quantite), l.emplacement ? h("span", { class: "muted" }, "📍 " + l.emplacement) : null);
    } else {
      ligne.append(
        h("div", { class: "quantite" },
          h("button", { type: "button", class: "ghost", "aria-label": "Retirer un exemplaire", onclick: () => essayer(() => D.changerQuantite(l, l.quantite - 1)) }, "−"),
          h("b", {}, l.quantite),
          h("button", { type: "button", class: "ghost", "aria-label": "Ajouter un exemplaire", onclick: () => essayer(() => D.changerQuantite(l, l.quantite + 1)) }, "+")
        ),
        h("input", {
          type: "number", min: "0", step: "0.01", placeholder: "Prix d'achat €", value: l.prix_achat ?? "", title: "Prix d'achat (facultatif)",
          onchange: (e) => essayer(() => D.modifierEntree(l, { prix_achat: e.target.value === "" ? null : Number(e.target.value) })),
        }),
        h("input", {
          type: "text", list: "emplacements", placeholder: "📍 Rangement", value: l.emplacement ?? "", title: "Où est rangée cette carte ?", autocomplete: "off",
          onchange: (e) => essayer(() => D.modifierEntree(l, { emplacement: e.target.value.trim() || null })),
        }),
        schemaV8() ? h("button", {
          type: "button", class: "ghost etoile" + (l.favori ? " active" : ""), title: l.favori ? "Retirer des coups de cœur" : "Ajouter aux coups de cœur", "aria-pressed": l.favori ? "true" : "false",
          onclick: () => essayer(() => D.modifierEntree(l, { favori: !l.favori })),
        }, l.favori ? "★" : "☆") : null,
        h("button", {
          type: "button", class: "ghost danger", title: "Supprimer cette ligne",
          onclick: () => essayer(() => D.supprimerEntree(l)),
        }, "🗑")
      );
    }
    bloc.append(ligne);
    if (!S.lectureSeule && schemaV8()) bloc.append(detailsPerso(l));
    else if (S.lectureSeule && l.note) bloc.append(h("p", { class: "muted note-lecture" }, "📝 " + l.note));
  }
  return bloc;
}

function formulaireAjout(d) {
  const variante = h("select", { "aria-label": "Variante" }, variantesDe(d).map((v) => h("option", { value: v }, v)));
  const etat = h("select", { "aria-label": "État" }, ETATS.map((e) => h("option", { value: e }, e)));
  const quantite = h("input", { type: "number", min: "1", value: "1", "aria-label": "Quantité" });
  const prix = h("input", { type: "number", min: "0", step: "0.01", placeholder: "Prix d'achat € (facultatif)", "aria-label": "Prix d'achat" });
  const emplacement = h("input", { type: "text", list: "emplacements", placeholder: "📍 Rangement (ex. Classeur rouge, p. 12)", autocomplete: "off", "aria-label": "Rangement" });

  const societe = h("select", { "aria-label": "Société de gradation" }, SOCIETES.map((s) => h("option", { value: s }, s)));
  const note = h("input", { type: "number", min: "1", max: "10", step: "0.5", value: "10", "aria-label": "Note" });
  const ligneGrade = h("div", { class: "row tools", hidden: true }, societe, note);
  const gradee = h("input", {
    type: "checkbox",
    onchange: () => {
      ligneGrade.hidden = !gradee.checked;
      etat.disabled = gradee.checked;
    },
  });

  const boutique = h("input", { type: "text", list: "boutiques", placeholder: "🏪 Boutique", autocomplete: "off", "aria-label": "Boutique" });
  const dateAchat = h("input", { type: "date", "aria-label": "Date d'achat", title: "Date d'achat" });
  const facture = h("input", { type: "url", placeholder: "🧾 Lien de la facture", "aria-label": "Lien de la facture" });
  const noteLibre = h("input", { type: "text", placeholder: "📝 Note", maxlength: "300", "aria-label": "Note personnelle" });
  const achat = schemaV8() ? h("details", { class: "exemplaire-plus" }, h("summary", {}, "Fiche d'achat et note"), h("div", { class: "exemplaire-plus-corps" }, h("div", { class: "row tools" }, boutique, dateAchat), facture, noteLibre)) : null;
  const bouton = h("button", { type: "submit" }, "Ajouter à ma collection");
  return h("form", {
    class: "carte-ajout",
    onsubmit: (e) => {
      e.preventDefault();
      essayer(async () => {
        await D.ajouterCarte(d, {
          variante: variante.value,
          etat: gradee.checked ? "Gradée" : etat.value,
          grade_societe: gradee.checked ? societe.value : null,
          grade_note: gradee.checked ? Number(note.value) : null,
          quantite: Math.max(1, parseInt(quantite.value, 10) || 1),
          prix_achat: prix.value === "" ? null : Number(prix.value),
          emplacement: emplacement.value.trim() || null,
          boutique: boutique.value.trim() || null, date_achat: dateAchat.value || null, facture: facture.value.trim() || null, note: noteLibre.value.trim() || null,
        });
        message("✔ " + d.name + " ajoutée à la collection.", "ok");
      });
    },
  },
    h("h3", {}, "Ajouter un exemplaire"),
    h("div", { class: "row tools" }, variante, etat, quantite),
    h("label", { class: "case" }, gradee, " Carte gradée"),
    ligneGrade,
    prix,
    emplacement,
    achat,
    bouton
  );
}

function dessiner() {
  const d = detail;
  if (!d) return;
  const ext = S.extParId.get(d.set.id);
  const total = d.set.cardCount && d.set.cardCount.official;
  const cm = d.pricing && d.pricing.cardmarket;
  const prix = cm ? cm.avg30 ?? cm.avg : null;
  const voeu = S.souhaits.find((x) => x.carte_id === d.id);

  const infos = h("div", { class: "carte-infos" },
    h("h2", {}, d.name),
    h("p", { class: "carte-meta" }, (ext ? ext.nom + (ext.code ? " (" + ext.code + ")" : "") : d.set.name) + " · n° " + d.localId + (total ? "/" + total : "")),
    h("p", { class: "carte-meta" }, [d.category, d.rarity, d.illustrator && "Illus. " + d.illustrator].filter(Boolean).join(" · ")),
    blocLangues(d),
    h("p", { class: "carte-prix" },
      prix !== null && prix !== undefined
        ? ["Prix moyen (30 jours) : ", h("b", {}, euros(prix)), cm.trend != null ? " · tendance " + euros(cm.trend) : "", cm.low != null ? " · le plus bas " + euros(cm.low) : ""]
        : "Pas de prix disponible pour cette carte."
    ),
    boutonCardmarket(d.name, d.set.id, d.localId, "Acheter sur Cardmarket"),
    blocExemplaires(d)
  );
  if (!S.lectureSeule) {
    infos.append(
      formulaireAjout(d),
      h("button", {
        type: "button", class: "ghost",
        onclick: () => essayer(() => (voeu ? D.retirerSouhait(voeu) : D.souhaiter(d))),
      }, voeu ? "💔 Retirer de la wishlist" : "❤ Ajouter à la wishlist")
    );
  }

  $("carte-contenu").replaceChildren(
    h("div", { class: "carte-detail", style: "--type:" + (couleurType(d.types) || "#8d96c9") },
      h("div", { class: "carte-visuel" },
        d.image ? carte3D(h("img", { src: imageCarte(d.image, "high"), alt: d.name, draggable: "false" })) : h("div", { class: "sans-image" }, "Pas d'image")
      ),
      infos
    )
  );
  majSuggestionsEmplacements();
}

$("carte-close").addEventListener("click", () => $("carte").close());
$("carte").addEventListener("close", () => { idCourant = null; detail = null; });
for (const nom of ["collection", "souhaits"]) {
  evenements.addEventListener(nom, () => { if ($("carte").open && detail) dessiner(); });
}
