// Graphiques du tableau de bord : courbe avec survol et anneau de répartition (SVG fait main, sans bibliothèque).
import { h, euros } from "./api.js";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (nom, attrs = {}) => {
  const e = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export const PALETTE = ["#ffcb05", "#6ea8ff", "#ff9ad5", "#3ddc84", "#ff7a2f", "#b388ff", "#4de1ff", "#ff6b6b", "#9aa3d6"];

const jour = (p) => new Date(p.jour).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
const jourLong = (p) => new Date(p.jour).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

// points : [{ jour, valeur_possedee }] ; reference : { valeur, nom } (ex. total payé) tracée en pointillés
export function courbe(points, reference = null) {
  const L = 640, H = 230, G = 58, Dr = 16, B = 30, T = 16;
  const valeurs = points.map((p) => Number(p.valeur_possedee));
  let min = Math.min(...valeurs), max = Math.max(...valeurs);
  if (reference) { min = Math.min(min, reference.valeur); max = Math.max(max, reference.valeur); }
  const marge = (max - min || 1) * 0.08;
  min = Math.max(0, min - marge);
  max += marge;
  const x = (i) => G + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (L - G - Dr);
  const y = (v) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);

  const svg = svgEl("svg", { viewBox: "0 0 " + L + " " + H, class: "graphe", role: "img", "aria-label": "Évolution de la valeur de la collection" });
  const defs = svgEl("defs");
  const degrade = svgEl("linearGradient", { id: "degrade-courbe", x1: "0", y1: "0", x2: "0", y2: "1" });
  degrade.append(svgEl("stop", { offset: "0", "stop-color": "#ffcb05", "stop-opacity": "0.45" }), svgEl("stop", { offset: "1", "stop-color": "#ffcb05", "stop-opacity": "0" }));
  defs.append(degrade);
  svg.append(defs);

  // Graduations horizontales
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    svg.append(svgEl("line", { x1: G, x2: L - Dr, y1: y(v), y2: y(v), class: "graphe-grille" }));
    const t = svgEl("text", { x: G - 8, y: y(v) + 4, "text-anchor": "end" });
    t.textContent = euros(v);
    svg.append(t);
  }
  // Dates
  const reperes = [...new Set([0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1])];
  for (const i of reperes) {
    const t = svgEl("text", { x: x(i), y: H - 9, "text-anchor": i === 0 ? "start" : i === points.length - 1 ? "end" : "middle" });
    t.textContent = jour(points[i]);
    svg.append(t);
  }

  const ligne = points.map((p, i) => x(i).toFixed(1) + "," + y(Number(p.valeur_possedee)).toFixed(1)).join(" ");
  svg.append(
    svgEl("polygon", { points: G + "," + (H - B) + " " + ligne + " " + x(points.length - 1).toFixed(1) + "," + (H - B), fill: "url(#degrade-courbe)" }),
    svgEl("polyline", { points: ligne, class: "graphe-ligne" })
  );
  if (reference) {
    svg.append(svgEl("line", { x1: G, x2: L - Dr, y1: y(reference.valeur), y2: y(reference.valeur), class: "graphe-reference" }));
    const t = svgEl("text", { x: L - Dr, y: y(reference.valeur) - 6, "text-anchor": "end", class: "graphe-reference-texte" });
    t.textContent = reference.nom + " : " + euros(reference.valeur);
    svg.append(t);
  }

  // Survol : trait vertical, point et bulle
  const trait = svgEl("line", { y1: T, y2: H - B, class: "graphe-trait", visibility: "hidden" });
  const point = svgEl("circle", { r: 5, class: "graphe-point", visibility: "hidden" });
  const capteur = svgEl("rect", { x: G, y: 0, width: L - G - Dr, height: H, fill: "transparent" });
  svg.append(trait, point, capteur);

  const bulle = h("div", { class: "graphe-bulle", hidden: true });
  const boite = h("div", { class: "graphe-boite" }, svg, bulle);

  const montrer = (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * L;
    const i = points.length === 1 ? 0 : Math.min(points.length - 1, Math.max(0, Math.round(((px - G) / (L - G - Dr)) * (points.length - 1))));
    const p = points[i];
    const cx = x(i), cy = y(Number(p.valeur_possedee));
    trait.setAttribute("x1", cx); trait.setAttribute("x2", cx); trait.setAttribute("visibility", "visible");
    point.setAttribute("cx", cx); point.setAttribute("cy", cy); point.setAttribute("visibility", "visible");
    const precedent = i > 0 ? Number(points[i - 1].valeur_possedee) : null;
    const delta = precedent === null ? null : Number(p.valeur_possedee) - precedent;
    bulle.replaceChildren(
      h("b", {}, euros(p.valeur_possedee)),
      h("small", {}, jourLong(p)),
      delta !== null ? h("small", { class: delta >= 0 ? "gain" : "perte" }, (delta >= 0 ? "▲ +" : "▼ ") + euros(delta) + " vs veille") : null
    );
    bulle.hidden = false;
    const gauche = (cx / L) * r.width;
    bulle.style.left = Math.min(Math.max(gauche, 70), r.width - 70) + "px";
    bulle.style.top = Math.max(0, (cy / H) * r.height - 70) + "px";
  };
  const cacher = () => { trait.setAttribute("visibility", "hidden"); point.setAttribute("visibility", "hidden"); bulle.hidden = true; };
  capteur.addEventListener("pointermove", montrer);
  capteur.addEventListener("pointerdown", montrer);
  capteur.addEventListener("pointerleave", cacher);
  return boite;
}

// parts : [{ nom, n }] déjà triées ; au-delà de `max` parts, le reste est regroupé en « Autres »
export function anneau(parts, { max = 7, unite = "" } = {}) {
  let liste = parts.filter((p) => p.n > 0);
  if (liste.length > max) {
    const reste = liste.slice(max - 1).reduce((s, p) => s + p.n, 0);
    liste = [...liste.slice(0, max - 1), { nom: "Autres", n: reste }];
  }
  const total = liste.reduce((s, p) => s + p.n, 0);
  if (!total) return h("p", { class: "muted" }, "Rien à afficher.");

  const R = 54, C = 2 * Math.PI * R;
  const svg = svgEl("svg", { viewBox: "0 0 140 140", class: "anneau", role: "img" });
  const centreNb = svgEl("text", { x: 70, y: 68, "text-anchor": "middle", class: "anneau-nb" });
  const centreTxt = svgEl("text", { x: 70, y: 86, "text-anchor": "middle", class: "anneau-txt" });
  const reinit = () => { centreNb.textContent = String(total); centreTxt.textContent = unite || "au total"; };
  reinit();

  const arcs = [];
  const lignes = [];
  let cumul = 0;
  liste.forEach((p, i) => {
    const longueur = (p.n / total) * C;
    const arc = svgEl("circle", {
      cx: 70, cy: 70, r: R, fill: "none", "stroke-width": 20, class: "anneau-arc",
      stroke: PALETTE[i % PALETTE.length],
      "stroke-dasharray": Math.max(0, longueur - 1.5) + " " + (C - Math.max(0, longueur - 1.5)),
      "stroke-dashoffset": -cumul, transform: "rotate(-90 70 70)",
    });
    cumul += longueur;
    const survol = (actif) => {
      arcs.forEach((a) => a.classList.toggle("pale", actif && a !== arc));
      lignes.forEach((l) => l.classList.toggle("actif", actif && l.dataset.i === String(i)));
      if (actif) { centreNb.textContent = String(p.n); centreTxt.textContent = p.nom.length > 16 ? p.nom.slice(0, 15) + "…" : p.nom; } else reinit();
    };
    arc.addEventListener("pointerenter", () => survol(true));
    arc.addEventListener("pointerleave", () => survol(false));
    arcs.push(arc);
    const ligne = h("li", { "data-i": String(i), onpointerenter: () => survol(true), onpointerleave: () => survol(false) },
      h("i", { style: "background:" + PALETTE[i % PALETTE.length] }),
      h("span", {}, p.nom),
      h("b", {}, p.n + " · " + Math.round((p.n / total) * 100) + " %")
    );
    lignes.push(ligne);
  });
  svg.append(...arcs, centreNb, centreTxt);
  return h("div", { class: "anneau-boite" }, svg, h("ul", { class: "anneau-legende" }, ...lignes));
}
