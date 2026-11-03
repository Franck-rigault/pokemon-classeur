// Bandeau d'accueil (haut de « Extensions ») : carte du jour, objectifs et nouvelles extensions.
import { h, euros, imageCarte, libelleExt, normalise, TCGDEX, cartesDExtension } from "./api.js";
import { S } from "./etat.js";
import { ouvrirCarte } from "./dialogue-carte.js";
import { carte3D, couleurType } from "./carte3d.js";
import { rendreObjectifs } from "./vue-objectifs.js";
import { lirePref } from "./prefs.js";

// ---------- Carte du jour ----------

// Même carte toute la journée : le jour (aaaa-mm-jj) sert de graine
function graine(texte) {
  let n = 2166136261;
  for (const c of texte) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

export function carteDuJour() {
  const cartes = [...new Map(S.collection.map((c) => [c.carte_id, c])).values()].sort((a, b) => a.carte_id.localeCompare(b.carte_id));
  if (!cartes.length) return null;
  return cartes[graine(new Date().toLocaleDateString("sv-SE") + (S.moi ? S.moi.id : "")) % cartes.length];
}

function panneauCarteDuJour() {
  const c = carteDuJour();
  if (!c) return null;
  const quantite = S.collection.filter((x) => x.carte_id === c.carte_id).reduce((s, x) => s + x.quantite, 0);
  return h("section", { class: "panneau accueil-carte", style: "--type:" + (couleurType(c.types) || "#8d96c9") },
    h("div", { class: "accueil-visuel" },
      c.image ? carte3D(h("img", { src: imageCarte(c.image), alt: c.nom, draggable: "false" })) : h("div", { class: "sans-image" }, c.nom)),
    h("div", { class: "accueil-texte" },
      h("h3", {}, "✨ Carte du jour"),
      h("button", { type: "button", class: "lien gros", onclick: () => ouvrirCarte(c.carte_id) }, c.nom),
      h("p", { class: "muted" }, [libelleExt(c.set_id), "n° " + c.local_id, c.rarete].filter(Boolean).join(" · ")),
      h("p", { class: "muted" }, [c.illustrateur ? "🎨 " + c.illustrateur : null, c.valeur != null ? "💶 " + euros(c.valeur) : null, quantite > 1 ? "× " + quantite + " exemplaires" : null].filter(Boolean).join(" · "))
    )
  );
}

// ---------- Nouvelles extensions ----------

const CLE_SETS = "classeur:sets-tcgdex:v1";

async function extensionsTcgdex() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CLE_SETS) || "null");
    if (c && Date.now() - c.t < 6 * 36e5) return c.sets;
  } catch { /* pas de cache */ }
  const rep = await fetch(TCGDEX + "/sets");
  if (!rep.ok) throw new Error("TCGdex " + rep.status);
  const sets = (await rep.json()).map((s) => ({ id: s.id, nom: s.name, total: s.cardCount && s.cardCount.total }));
  try { sessionStorage.setItem(CLE_SETS, JSON.stringify({ t: Date.now(), sets })); } catch { /* plein */ }
  return sets;
}

// Pokémon que je collectionne : ceux dont je possède au moins une carte
function pokemonSuivis() {
  const dex = new Set(S.collection.flatMap((c) => c.dex_ids || []));
  const noms = S.pokemon.filter((p) => dex.has(p.n)).map((p) => normalise(p.nom));
  for (const x of S.souhaits) noms.push(...normalise(x.nom).split(/[^a-z0-9]+/).filter((m) => m.length > 3));
  return [...new Set(noms)];
}

async function panneauNouveautes() {
  let sets;
  try { sets = await extensionsTcgdex(); } catch { return null; }
  const nouvelles = sets.filter((s) => !S.extParId.has(s.id) && !/^[A-Z]/.test(s.id) && !/^tcgp/i.test(s.id));
  if (!nouvelles.length) return null;
  const suivis = pokemonSuivis();
  const lignes = [];
  for (const s of nouvelles.slice(0, 3)) {
    let trouvees = [];
    try {
      const { cartes } = await cartesDExtension(s.id);
      trouvees = cartes.filter((k) => { const m = normalise(k.name).split(/[^a-z0-9]+/); return suivis.some((p) => m.includes(p)); });
    } catch { /* liste indisponible */ }
    lignes.push(h("li", {}, h("b", {}, s.nom), " · " + (s.total || "?") + " cartes",
      trouvees.length ? h("span", { class: "muted" }, " — " + trouvees.length + " carte(s) de Pokémon que vous suivez : " + trouvees.slice(0, 4).map((k) => k.name).join(", ") + (trouvees.length > 4 ? "…" : "")) : null));
  }
  return h("section", { class: "panneau accueil-nouveautes" },
    h("h3", {}, "🆕 " + (nouvelles.length > 1 ? nouvelles.length + " nouvelles extensions" : "Nouvelle extension") + " sur TCGdex"),
    h("ul", {}, lignes),
    h("p", { class: "muted" }, "Elles apparaîtront dans « Extensions » à la prochaine mise à jour de la liste (voir le README).")
  );
}

// ---------- Montage ----------

export function monterAccueil(zone) {
  if (S.partage || S.lectureSeule || !S.moi) return zone.replaceChildren();
  const objectifs = h("div", { class: "objectifs" });
  const lire = lirePref("objectifs", null);
  const panneauObjectifs = h("section", { class: "panneau accueil-objectifs" },
    h("h3", {}, "🎯 Objectifs ", h("a", { class: "muted", href: "#/objectifs" }, "tout voir →")), objectifs);
  const carte = panneauCarteDuJour();
  zone.replaceChildren(h("div", { class: "accueil" }, carte, panneauObjectifs));
  rendreObjectifs(objectifs, { max: 3 }).then(() => {
    if (!lire && !objectifs.querySelector(".objectif")) objectifs.replaceChildren(h("p", { class: "muted" }, "Fixez-vous un but (compléter une extension, atteindre 500 cartes…) dans l'onglet 🎯 Objectifs."));
  });
  panneauNouveautes().then((p) => { if (p && zone.isConnected) zone.append(p); });
}
