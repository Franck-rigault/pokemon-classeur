// Affichage « album » d'une extension : pages de classeur 3×3 (deux pages côte à côte sur grand écran), page tournée à la navigation.
import { h, imageCarte } from "./api.js";
import { ouvrirCarte } from "./dialogue-carte.js";

const PAR_PAGE = 9;
const large = window.matchMedia("(min-width: 900px)");

// Crée un album ; `maj(cartes, infos)` le redessine avec les cartes à montrer (le numéro de page courant est conservé)
export function creerAlbum() {
  let cartes = [];
  let infos = { quantites: new Map(), voeux: new Set() };
  let page = 0; // index de la page de gauche (ou de l'unique page affichée)
  let sens = 0;

  const racine = h("div", { class: "album" });
  const plateau = h("div", { class: "album-plateau" });
  const titre = h("span", { class: "album-compteur" });
  const bPrec = h("button", { type: "button", class: "ghost", "aria-label": "Page précédente", onclick: () => aller(-1) }, "◀");
  const bSuiv = h("button", { type: "button", class: "ghost", "aria-label": "Page suivante", onclick: () => aller(1) }, "▶");
  const saut = h("input", { type: "number", min: "1", value: "1", "aria-label": "Aller à la page", class: "album-saut", onchange: () => { page = Math.max(0, (parseInt(saut.value, 10) || 1) - 1); sens = 0; dessiner(); } });
  racine.append(plateau, h("div", { class: "album-nav" }, bPrec, titre, saut, bSuiv));

  const pages = () => Math.max(1, Math.ceil(cartes.length / PAR_PAGE));
  const pas = () => (large.matches ? 2 : 1);

  function aller(delta) {
    const suivante = Math.min(Math.max(0, page + delta * pas()), pages() - 1);
    if (suivante === page) return;
    sens = delta;
    page = suivante;
    dessiner();
  }

  function pageDe(numero) {
    const cases = [];
    for (let i = 0; i < PAR_PAGE; i++) {
      const k = cartes[numero * PAR_PAGE + i];
      if (!k) {
        cases.push(h("div", { class: "album-case vide" }));
        continue;
      }
      const qte = infos.quantites.get(k.id) || 0;
      cases.push(h("button", { type: "button", class: "album-case " + (qte ? "possedee" : "manquante"), title: k.name + " · n° " + k.localId, onclick: () => ouvrirCarte(k.id) },
        k.image ? h("img", { loading: "lazy", alt: k.name, src: imageCarte(k.image), draggable: "false" }) : h("span", { class: "sans-image" }, k.name),
        h("small", { class: "album-num" }, k.localId),
        qte > 1 ? h("span", { class: "badge-qte" }, "×" + qte) : null,
        infos.voeux.has(k.id) ? h("span", { class: "badge-voeu" }, "❤") : null
      ));
    }
    return h("div", { class: "album-page" }, h("div", { class: "album-grille" }, cases), h("span", { class: "album-folio" }, numero + 1));
  }

  function dessiner() {
    const total = pages();
    const dernier = total - 1;
    page = Math.min(page, dernier);
    if (large.matches && page % 2) page--; // à deux pages, on part toujours d'une page paire
    const droite = large.matches && page + 1 <= dernier ? page + 1 : null;

    plateau.className = "album-plateau" + (sens > 0 ? " tourne-av" : sens < 0 ? " tourne-ar" : "");
    plateau.replaceChildren(pageDe(page), droite !== null ? pageDe(droite) : null);
    titre.textContent = (droite !== null ? "Pages " + (page + 1) + "–" + (droite + 1) : "Page " + (page + 1)) + " / " + total;
    saut.max = String(total);
    saut.value = String(page + 1);
    bPrec.disabled = page <= 0;
    bSuiv.disabled = (droite !== null ? droite : page) >= dernier;
    sens = 0;
  }

  // Balayage au doigt : gauche/droite tourne la page
  let departX = null;
  plateau.addEventListener("pointerdown", (e) => { departX = e.pointerType === "mouse" ? null : e.clientX; });
  plateau.addEventListener("pointerup", (e) => {
    if (departX === null) return;
    const dx = e.clientX - departX;
    departX = null;
    if (Math.abs(dx) > 60) aller(dx < 0 ? 1 : -1);
  });
  racine.tabIndex = 0;
  racine.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") aller(1);
    else if (e.key === "ArrowLeft") aller(-1);
  });
  large.addEventListener("change", () => { if (racine.isConnected) dessiner(); });

  return {
    element: racine,
    maj(nouvelles, nouvellesInfos) {
      cartes = nouvelles;
      infos = nouvellesInfos;
      dessiner();
    },
  };
}
