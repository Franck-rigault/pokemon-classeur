// Carte « vivante » : elle s'incline vers le doigt ou la souris et un reflet holo suit le pointeur.
import { h } from "./api.js";

// Couleur associée à chaque type de carte (noms TCGdex en français)
const COULEURS_TYPES = {
  plante: "#4cc04b", feu: "#ff7a2f", eau: "#3a9bff", "électrique": "#ffd21f", electrique: "#ffd21f", psy: "#c05cff",
  combat: "#c2553a", "obscurité": "#6a5a8a", obscurite: "#6a5a8a", "métal": "#9bb0bd", metal: "#9bb0bd",
  dragon: "#c9a227", "fée": "#ff8fd0", fee: "#ff8fd0", incolore: "#c9ccd6",
};

export function couleurType(types) {
  for (const t of types || []) {
    const c = COULEURS_TYPES[String(t).toLowerCase()];
    if (c) return c;
  }
  return null;
}

// Enveloppe une image de carte (ou tout élément) dans le conteneur interactif
export function carte3D(contenu, options = {}) {
  const reflet = h("div", { class: "carte3d-reflet" });
  const boite = h("div", { class: "carte3d" + (options.holo === false ? "" : " holo") }, contenu, reflet);
  const zone = h("div", { class: "carte3d-zone" }, boite);

  const incliner = (e) => {
    const r = zone.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    zone.style.setProperty("--ry", (x - 0.5) * 26 + "deg");
    zone.style.setProperty("--rx", (0.5 - y) * 26 + "deg");
    zone.style.setProperty("--mx", x * 100 + "%");
    zone.style.setProperty("--my", y * 100 + "%");
    zone.classList.add("actif");
  };
  const redresser = () => {
    zone.classList.remove("actif");
    for (const v of ["--rx", "--ry"]) zone.style.setProperty(v, "0deg");
  };

  zone.addEventListener("pointermove", incliner);
  zone.addEventListener("pointerdown", incliner);
  zone.addEventListener("pointerleave", redresser);
  zone.addEventListener("pointercancel", redresser);
  zone.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") redresser(); });
  return zone;
}
