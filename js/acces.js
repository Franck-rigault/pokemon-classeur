// Accessibilité : taille du texte, contraste élevé, animations réduites, focus renforcé.
// Les réglages sont lus au tout début de la page (script dans index.html) pour éviter un « flash » ; ce module les modifie.
import { $, h } from "./api.js";

const CLE = "classeur:acces";
const DEFAUT = { texte: 100, contraste: false, calme: false, focus: false };

export function lireReglages() {
  try { return { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE) || "{}") }; } catch { return { ...DEFAUT }; }
}

export function appliquerReglages(r = lireReglages()) {
  const d = document.documentElement;
  d.style.fontSize = r.texte === 100 ? "" : r.texte + "%";
  d.toggleAttribute("data-contraste", !!r.contraste);
  d.toggleAttribute("data-calme", !!r.calme);
  d.toggleAttribute("data-focus", !!r.focus);
}

function enregistrer(r) {
  try { localStorage.setItem(CLE, JSON.stringify(r)); } catch { /* stockage indisponible */ }
  appliquerReglages(r);
}

export function ouvrirAcces() {
  const dlg = $("acces");
  const r = lireReglages();
  const taille = h("input", { type: "range", min: "100", max: "140", step: "10", value: String(r.texte), "aria-label": "Taille du texte" });
  const exemple = h("span", { class: "muted" }, r.texte + " %");
  taille.addEventListener("input", () => { r.texte = Number(taille.value); exemple.textContent = r.texte + " %"; enregistrer(r); });
  const case_ = (cle, titre, aide) => {
    const c = h("input", { type: "checkbox", checked: !!r[cle], onchange: () => { r[cle] = c.checked; enregistrer(r); } });
    return h("label", { class: "case acces-case" }, c, h("span", {}, h("b", {}, titre), h("small", { class: "muted" }, aide)));
  };
  $("acces-contenu").replaceChildren(
    h("label", { class: "acces-taille" }, h("b", {}, "Taille du texte "), exemple, taille),
    case_("contraste", "Contraste élevé", "Textes plus lumineux, contours plus nets."),
    case_("calme", "Réduire les animations", "Supprime les effets de mouvement (page tournée, confettis, inclinaison 3D)."),
    case_("focus", "Focus clavier renforcé", "Contour épais autour de l'élément sélectionné au clavier."),
    h("p", { class: "muted" }, "Au clavier : Tab / Maj+Tab pour naviguer, Entrée pour ouvrir, « / » pour la recherche globale, Échap pour fermer une fenêtre, Ctrl+Z pour annuler. Ces réglages restent sur cet appareil."),
    h("button", { type: "button", class: "ghost", onclick: () => { Object.assign(r, DEFAUT); enregistrer(r); ouvrirAcces(); } }, "Rétablir les réglages par défaut")
  );
  if (!dlg.open) dlg.showModal();
}

appliquerReglages();
