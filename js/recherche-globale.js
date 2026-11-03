// Recherche globale : une seule barre pour la collection, la wishlist, les extensions, les scellés et les classeurs.
// S'ouvre avec le bouton 🔍, la touche « / » ou Ctrl + K.
import { $, h, normalise, imageCarte, libelleExt } from "./api.js";
import { S } from "./etat.js";
import { chargerExtra } from "./donnees-extra.js";
import { ouvrirCarte } from "./dialogue-carte.js";

let dialogue = null;

function creer() {
  dialogue = h("dialog", { class: "modal recherche-globale", "aria-label": "Recherche globale" });
  const champ = h("input", { type: "search", placeholder: "Rechercher partout (carte, extension, scellé, classeur…)", autocomplete: "off", "aria-label": "Recherche globale" });
  const zone = h("div", { class: "rg-resultats" });
  dialogue.append(
    h("div", { class: "picker-head" }, champ, h("button", { type: "button", class: "ghost", "aria-label": "Fermer", onclick: () => dialogue.close() }, "✕")),
    zone
  );
  document.body.append(dialogue);
  dialogue.addEventListener("click", (e) => { if (e.target === dialogue) dialogue.close(); });

  const aller = (action) => () => { dialogue.close(); action(); };
  const ligne = (icone, titre, detail, action, image) =>
    h("button", { type: "button", class: "rg-ligne", onclick: aller(action) },
      image ? h("img", { src: imageCarte(image), alt: "", loading: "lazy" }) : h("span", { class: "rg-icone", "aria-hidden": "true" }, icone),
      h("span", { class: "rg-texte" }, h("b", {}, titre), detail ? h("small", { class: "muted" }, detail) : null));

  function chercher() {
    const q = normalise(champ.value.trim());
    if (q.length < 2) return zone.replaceChildren(h("p", { class: "muted" }, "Tapez au moins 2 lettres. Astuce : « / » ouvre cette recherche depuis n'importe quel écran."));
    const groupes = [];
    const cartes = [...new Map(S.collection.filter((c) => normalise(c.nom).includes(q) || normalise(c.local_id) === q).map((c) => [c.carte_id, c])).values()];
    if (cartes.length) groupes.push(["🃏 Ma collection (" + cartes.length + ")", cartes.slice(0, 10).map((c) => ligne("🃏", c.nom, libelleExt(c.set_id) + " · n° " + c.local_id + " · × " + S.collection.filter((x) => x.carte_id === c.carte_id).reduce((s, x) => s + x.quantite, 0), () => ouvrirCarte(c.carte_id), c.image))]);
    const voeux = S.souhaits.filter((c) => normalise(c.nom).includes(q));
    if (voeux.length) groupes.push(["❤ Wishlist (" + voeux.length + ")", voeux.slice(0, 6).map((c) => ligne("❤", c.nom, libelleExt(c.set_id) + " · n° " + c.local_id, () => ouvrirCarte(c.carte_id), c.image))]);
    const exts = S.extensions.filter((e) => normalise(e.nom).includes(q) || normalise(e.code || "") === q);
    if (exts.length) groupes.push(["📚 Extensions (" + exts.length + ")", exts.slice(0, 6).map((e) => ligne("📚", e.nom, [e.code, e.serie].filter(Boolean).join(" · "), () => { location.hash = "#/extensions/" + e.id; }))]);
    if (!S.partage && !S.lectureSeule) {
      const produits = S.produits.filter((p) => normalise(p.nom).includes(q) || normalise(p.boutique || "").includes(q));
      if (produits.length) groupes.push(["📦 Scellés (" + produits.length + ")", produits.slice(0, 6).map((p) => ligne("📦", p.nom, [p.type, "× " + p.quantite, p.boutique].filter(Boolean).join(" · "), () => { location.hash = "#/scelles"; }))]);
      const classeurs = S.classeurs.filter((c) => normalise(c.nom).includes(q));
      if (classeurs.length) groupes.push(["📘 Classeurs (" + classeurs.length + ")", classeurs.slice(0, 6).map((c) => ligne("📘", c.nom, "", () => { location.hash = "#/classeurs"; }))]);
    }
    groupes.push(["🔎 Aller plus loin", [ligne("🔎", "Chercher « " + champ.value.trim() + " » parmi toutes les cartes existantes", "", () => { location.hash = "#/recherche"; })]]);
    zone.replaceChildren(...groupes.map(([titre, lignes]) => h("section", { class: "rg-groupe" }, h("h3", {}, titre), lignes)));
  }
  let attente = null;
  champ.addEventListener("input", () => { clearTimeout(attente); attente = setTimeout(chercher, 120); });
  champ.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const premier = zone.querySelector(".rg-ligne"); if (premier) premier.click(); }
  });
  dialogue.champ = champ;
  dialogue.chercher = chercher;
}

export async function ouvrirRechercheGlobale() {
  if (!dialogue) creer();
  if (!dialogue.open) dialogue.showModal();
  dialogue.champ.select();
  dialogue.chercher();
  if (!S.partage && !S.lectureSeule && !S.extraCharge) {
    try { await chargerExtra(); dialogue.chercher(); } catch { /* scellés et classeurs indisponibles hors-ligne : on cherche sans */ }
  }
}

document.addEventListener("keydown", (e) => {
  const saisie = /^(input|textarea|select)$/i.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable);
  const appVisible = $("app") && !$("app").hidden;
  if (!appVisible) return;
  if ((e.key === "/" && !saisie && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
    e.preventDefault();
    ouvrirRechercheGlobale();
  }
});
