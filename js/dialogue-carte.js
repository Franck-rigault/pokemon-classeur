// Fenêtre de détail d'une carte : image, prix, exemplaires possédés, ajout (quantité, état, variante), wishlist.
import { $, h, detailCarte, imageCarte, variantesDe, euros, essayer, message, ETATS } from "./api.js";
import { S, evenements } from "./etat.js";
import * as D from "./donnees.js";

let idCourant = null;
let detail = null;

export async function ouvrirCarte(id) {
  const dlg = $("carte");
  idCourant = id;
  detail = null;
  $("carte-contenu").replaceChildren(h("p", { class: "msg" }, "Chargement…"));
  if (!dlg.open) dlg.showModal();
  try {
    detail = await detailCarte(id);
  } catch (e) {
    $("carte-contenu").replaceChildren(h("p", { class: "msg ko" }, "Carte introuvable : " + e.message));
    return;
  }
  if (idCourant === id) dessiner();
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
    const ligne = h("div", { class: "exemplaire" }, h("span", { class: "exemplaire-nom" }, l.variante + " · " + l.etat));
    if (S.lectureSeule) {
      ligne.append(h("b", {}, "× " + l.quantite));
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
        h("button", {
          type: "button", class: "ghost danger", title: "Supprimer cet exemplaire",
          onclick: () => confirm("Supprimer cette ligne de la collection ?") && essayer(() => D.supprimerEntree(l)),
        }, "🗑")
      );
    }
    bloc.append(ligne);
  }
  return bloc;
}

function formulaireAjout(d) {
  const variante = h("select", { "aria-label": "Variante" }, variantesDe(d).map((v) => h("option", { value: v }, v)));
  const etat = h("select", { "aria-label": "État" }, ETATS.map((e) => h("option", { value: e }, e)));
  const quantite = h("input", { type: "number", min: "1", value: "1", "aria-label": "Quantité" });
  const prix = h("input", { type: "number", min: "0", step: "0.01", placeholder: "Prix d'achat € (facultatif)", "aria-label": "Prix d'achat" });
  const bouton = h("button", { type: "submit" }, "Ajouter à ma collection");
  const form = h("form", {
    class: "carte-ajout",
    onsubmit: (e) => {
      e.preventDefault();
      essayer(async () => {
        await D.ajouterCarte(d, {
          variante: variante.value, etat: etat.value,
          quantite: Math.max(1, parseInt(quantite.value, 10) || 1),
          prix_achat: prix.value === "" ? null : Number(prix.value),
        });
        message("✔ " + d.name + " ajoutée à la collection.", "ok");
      });
    },
  }, h("h3", {}, "Ajouter un exemplaire"), h("div", { class: "row tools" }, variante, etat, quantite), prix, bouton);
  return form;
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
    h("p", { class: "carte-prix" },
      prix !== null && prix !== undefined
        ? ["Prix moyen (30 jours) : ", h("b", {}, euros(prix)), cm.trend != null ? " · tendance " + euros(cm.trend) : "", cm.low != null ? " · le plus bas " + euros(cm.low) : ""]
        : "Pas de prix disponible pour cette carte."
    ),
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
    h("div", { class: "carte-detail" },
      h("div", { class: "carte-visuel" },
        d.image ? h("img", { src: imageCarte(d.image, "high"), alt: d.name }) : h("div", { class: "sans-image" }, "Pas d'image")
      ),
      infos
    )
  );
}

$("carte-close").addEventListener("click", () => $("carte").close());
$("carte").addEventListener("close", () => { idCourant = null; detail = null; });
for (const nom of ["collection", "souhaits"]) {
  evenements.addEventListener(nom, () => { if ($("carte").open && detail) dessiner(); });
}
