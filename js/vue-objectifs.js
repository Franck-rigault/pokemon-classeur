// Vue « Objectifs » : objectifs personnels, collections thématiques et défi à deux.
import { h, db, euros, imageCarte, libelleExt, normalise, cartesParNom, detailsExtension, lireCacheExtension, essayer, message, annee } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { ouvrirCarte } from "./dialogue-carte.js";
import { chargerPrefs, lirePref, ecrirePref } from "./prefs.js";

// ---------- Objectifs ----------

const SERIES = () => [...new Set(S.extensions.map((e) => e.serie).filter(Boolean))];
const cartesDistinctes = () => new Set(S.collection.map((c) => c.carte_id));

// Avancement d'un objectif : { fait, total, texte } (total null = pas encore connu)
export async function avancement(o) {
  const possedees = cartesDistinctes();
  if (o.type === "cartes") return { fait: possedees.size, total: o.cible, texte: "cartes différentes" };
  if (o.type === "valeur") return { fait: Math.round(D.statistiques().valeur), total: o.cible, texte: "€ de valeur", euro: true };
  if (o.type === "extension") {
    const e = S.extParId.get(o.cible);
    const fait = new Set(S.collection.filter((c) => c.set_id === o.cible).map((c) => c.carte_id)).size;
    return { fait, total: (e && (e.officiel || e.total)) || null, texte: "cartes" };
  }
  if (o.type === "serie") {
    const ids = new Set(S.extensions.filter((e) => e.serie === o.cible).map((e) => e.id));
    const total = S.extensions.filter((e) => ids.has(e.id)).reduce((s, e) => s + (e.officiel || 0), 0);
    const fait = new Set(S.collection.filter((c) => ids.has(c.set_id)).map((c) => c.carte_id)).size;
    return { fait, total: total || null, texte: "cartes de la série" };
  }
  if (o.type === "pokemon") {
    const fait = new Set(S.collection.filter((c) => normalise(c.nom).split(/[^a-z0-9]+/).includes(normalise(o.cible))).map((c) => c.carte_id)).size;
    let total = null;
    try { total = (await cartesParNom(o.cible)).length; } catch { /* hors-ligne : on affiche seulement ce qu'on a */ }
    return { fait, total, texte: "cartes différentes" };
  }
  return { fait: 0, total: null, texte: "" };
}

export const titreObjectif = (o) => ({
  cartes: "Atteindre " + o.cible + " cartes différentes",
  valeur: "Atteindre " + o.cible + " € de collection",
  extension: "Compléter « " + (S.extParId.get(o.cible) ? S.extParId.get(o.cible).nom : o.cible) + " »",
  serie: "Compléter la série « " + o.cible + " »",
  pokemon: "Toutes les cartes « " + o.cible + " »",
}[o.type] || o.type);

function barre(o, a) {
  const pct = a.total ? Math.min(100, Math.round((a.fait / a.total) * 100)) : 0;
  const rempli = h("div", { class: "barre-rempli" });
  rempli.style.width = pct + "%";
  return h("div", { class: "objectif" + (a.total && a.fait >= a.total ? " atteint" : "") },
    h("div", { class: "objectif-tete" }, h("b", {}, (a.total && a.fait >= a.total ? "🏆 " : "🎯 ") + titreObjectif(o)), h("span", { class: "muted" }, a.fait + (a.total ? " / " + a.total : "") + " " + a.texte + (a.total ? " · " + pct + " %" : ""))),
    h("div", { class: "barre" }, rempli)
  );
}

// Affiche les objectifs (pour l'accueil : `max` objectifs, sans les boutons de suppression)
export async function rendreObjectifs(zone, { max = 0, supprimer = null } = {}) {
  await chargerPrefs();
  const liste = lirePref("objectifs", []);
  const choisis = max ? liste.slice(0, max) : liste;
  if (!choisis.length) return zone.replaceChildren(h("p", { class: "muted" }, "Aucun objectif pour l'instant."));
  const lignes = await Promise.all(choisis.map(async (o) => {
    const a = await avancement(o);
    const ligne = barre(o, a);
    if (supprimer) ligne.append(h("button", { type: "button", class: "ghost danger", "aria-label": "Supprimer l'objectif", onclick: () => supprimer(o) }, "🗑"));
    return ligne;
  }));
  zone.replaceChildren(...lignes);
}

function formulaireObjectif(apres) {
  const type = h("select", { "aria-label": "Type d'objectif" },
    h("option", { value: "extension" }, "Compléter une extension"),
    h("option", { value: "serie" }, "Compléter une série"),
    h("option", { value: "pokemon" }, "Toutes les cartes d'un Pokémon"),
    h("option", { value: "cartes" }, "Nombre de cartes différentes"),
    h("option", { value: "valeur" }, "Valeur de la collection (€)"));
  const extension = h("select", { "aria-label": "Extension" }, S.extensions.filter((e) => e.officiel).map((e) => h("option", { value: e.id }, e.nom + (annee(e) ? " (" + annee(e) + ")" : ""))));
  const serie = h("select", { "aria-label": "Série" }, SERIES().map((s) => h("option", { value: s }, s)));
  const pokemon = h("input", { type: "text", list: "noms-pokemon", placeholder: "Nom du Pokémon (ex. Pikachu)", autocomplete: "off" });
  const nombre = h("input", { type: "number", min: "1", placeholder: "Objectif (nombre)", "aria-label": "Objectif" });
  const champs = { extension, serie, pokemon, cartes: nombre, valeur: nombre };
  const majChamps = () => { for (const [k, el] of Object.entries(champs)) el.hidden = k !== type.value; };
  type.addEventListener("change", majChamps);
  majChamps();
  return h("form", {
    class: "row tools",
    onsubmit: (e) => {
      e.preventDefault();
      essayer(async () => {
        const t = type.value;
        const cible = t === "extension" ? extension.value : t === "serie" ? serie.value : t === "pokemon" ? pokemon.value.trim() : Number(nombre.value);
        if (!cible) return message("Complétez l'objectif (choix ou nombre).", "ko");
        const liste = lirePref("objectifs", []).concat({ id: Date.now().toString(36), type: t, cible });
        await ecrirePref("objectifs", liste);
        e.target.reset();
        majChamps();
        apres();
      });
    },
  }, type, extension, serie, pokemon, nombre, h("button", { type: "submit" }, "Ajouter l'objectif"));
}

// ---------- Collections thématiques ----------

const TYPES = ["Plante", "Feu", "Eau", "Électrique", "Psy", "Combat", "Obscurité", "Métal", "Dragon", "Fée", "Incolore"];
const nomsDepart = () => {
  const lignes = [[1, 9], [152, 160], [252, 260], [387, 395], [495, 503], [650, 658], [722, 730], [810, 818], [906, 914]];
  return new Set(S.pokemon.filter((p) => lignes.some(([a, b]) => p.n >= a && p.n <= b)).map((p) => normalise(p.nom)));
};
const mots = (nom) => normalise(nom).split(/[^a-z0-9]+/).filter(Boolean);

function themes() {
  const base = [
    { id: "depart", nom: "Pokémon de départ (toutes générations)", ok: (c) => { const d = nomsDepart(); return mots(c.nom).some((m) => d.has(m)); } },
    { id: "illus", nom: "Illustrations rares", ok: (c) => /illustration/i.test(c.rarete || "") },
    { id: "ex", nom: "Pokémon-ex, V, VMAX, VSTAR et GX", ok: (c) => /(^|[\s-])(ex|v|vmax|vstar|gx)($|[\s-])/i.test(c.nom) },
    { id: "holo", nom: "Cartes ultra, secrètes et hyper rares", ok: (c) => /ultra|secr|hyper|arc-en-ciel|or\b/i.test(c.rarete || "") },
    ...TYPES.map((t) => ({ id: "type:" + t, nom: "Type " + t, ok: (c) => (c.types || []).includes(t) })),
  ];
  const parIllustrateur = new Map();
  for (const c of S.collection) if (c.illustrateur) parIllustrateur.set(c.illustrateur, (parIllustrateur.get(c.illustrateur) || 0) + 1);
  const illus = [...parIllustrateur].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([nom]) => ({ id: "illus:" + nom, nom: "Illustrateur : " + nom, ok: (c) => c.illustrateur === nom }));
  return [...base, ...illus];
}

// Cartes d'une extension (liste compacte) : cache du navigateur seulement, sans réseau
const normaliser = (c) => ({ id: c.carte_id || c.id, nom: c.nom || c.name, types: c.types || [], rarete: c.rarete, illustrateur: c.illustrateur, image: c.image, set_id: c.set_id, local_id: c.local_id || c.localId });

async function sectionThemes(zone) {
  const choix = h("select", { "aria-label": "Thème" }, themes().map((t) => h("option", { value: t.id }, t.nom)));
  const resultat = h("div", {});
  const extensionsActives = () => [...new Set(S.collection.map((c) => c.set_id))].filter((id) => S.extParId.has(id));

  async function afficher() {
    const t = themes().find((x) => x.id === choix.value);
    if (!t) return;
    const possedees = new Map();
    for (const c of S.collection) if (t.ok(normaliser(c)) && !possedees.has(c.carte_id)) possedees.set(c.carte_id, normaliser(c));
    const sets = extensionsActives();
    const enCache = sets.filter((id) => lireCacheExtension(id));
    const manquantes = [];
    for (const id of enCache) for (const k of lireCacheExtension(id)) {
      const n = normaliser({ ...k, set_id: id });
      if (!possedees.has(n.id) && !S.collection.some((c) => c.carte_id === n.id) && t.ok(n)) manquantes.push(n);
    }
    const complet = enCache.length === sets.length;
    const total = possedees.size + manquantes.length;
    const pct = total ? Math.round((possedees.size / total) * 100) : 0;
    const rempli = h("div", { class: "barre-rempli" });
    rempli.style.width = pct + "%";
    let limite = 60;
    const grille = h("div", { class: "cartes-grille" });
    const plus = h("button", { type: "button", class: "ghost", onclick: () => { limite += 60; majGrille(); } }, "Afficher plus");
    const majGrille = () => {
      const toutes = [...possedees.values(), ...manquantes];
      grille.replaceChildren(...toutes.slice(0, limite).map((k) => h("button", { type: "button", class: "tuile-carte mini" + (possedees.has(k.id) ? " possedee" : " manquante"), title: k.nom + " — " + libelleExt(k.set_id), onclick: () => ouvrirCarte(k.id) },
        k.image ? h("img", { src: imageCarte(k.image), alt: k.nom, loading: "lazy" }) : h("span", { class: "sans-image" }, k.nom))));
      plus.hidden = toutes.length <= limite;
    };
    const charger = h("button", {
      type: "button", class: "ghost",
      onclick: () => essayer(async () => {
        charger.disabled = true;
        const restantes = sets.filter((id) => !lireCacheExtension(id));
        for (let i = 0; i < restantes.length; i++) {
          charger.textContent = "Chargement des extensions… " + (i + 1) + " / " + restantes.length;
          await detailsExtension(restantes[i]);
        }
        afficher();
      }),
    }, "🔍 Chercher aussi les manquantes (" + (sets.length - enCache.length) + " extension(s) à charger)");
    resultat.replaceChildren(
      h("p", {}, h("b", {}, possedees.size + " possédée(s)"), complet ? " · " + manquantes.length + " manquante(s) dans vos " + sets.length + " extensions · " + pct + " %" : " · manquantes non calculées pour toutes vos extensions"),
      complet ? h("div", { class: "barre" }, rempli) : null,
      complet ? null : charger,
      h("p", { class: "muted" }, "Les manquantes sont cherchées dans les extensions dont vous possédez déjà au moins une carte."),
      grille, h("div", { class: "centre" }, plus)
    );
    majGrille();
  }
  choix.addEventListener("change", afficher);
  zone.replaceChildren(choix, resultat);
  afficher();
}

// ---------- Défi à deux ----------

async function chargerAutre(userId) {
  const tout = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await db.from("collection").select("carte_id,set_id,quantite,valeur,nom,image,rarete").eq("user_id", userId).range(debut, debut + 999);
    if (error) throw error;
    tout.push(...data);
    if (data.length < 1000) break;
  }
  return tout;
}

function resume(lignes) {
  const parSet = new Map();
  for (const c of lignes) { if (!parSet.has(c.set_id)) parSet.set(c.set_id, new Set()); parSet.get(c.set_id).add(c.carte_id); }
  const complets = S.extensions.filter((e) => e.officiel && parSet.has(e.id) && parSet.get(e.id).size >= e.officiel).length;
  const chere = lignes.reduce((m, c) => (Number(c.valeur || 0) > Number(m.valeur || 0) ? c : m), {});
  return {
    distinctes: new Set(lignes.map((c) => c.carte_id)).size,
    exemplaires: lignes.reduce((s, c) => s + c.quantite, 0),
    valeur: lignes.reduce((s, c) => s + Number(c.valeur || 0) * c.quantite, 0),
    extensions: parSet.size,
    complets,
    rares: new Set(lignes.filter((c) => /ultra|secr|hyper|illustration|arc-en-ciel/i.test(c.rarete || "")).map((c) => c.carte_id)).size,
    chere,
  };
}

async function sectionDefi(zone) {
  const autre = S.profils.find((p) => p.user_id !== S.moi.id);
  if (!autre) return zone.replaceChildren(h("p", { class: "muted" }, "Le défi apparaît dès qu'un deuxième compte existe."));
  zone.replaceChildren(h("p", { class: "muted" }, "Chargement de la collection de " + autre.nom + "…"));
  let a, b;
  try {
    b = resume(await chargerAutre(autre.user_id));
    a = resume(S.collection);
  } catch (e) {
    return zone.replaceChildren(h("p", { class: "msg ko" }, "Défi indisponible : " + (e.message || e)));
  }
  const moi = (S.profil && S.profil.nom) || "Moi";
  const lignes = [
    ["Cartes différentes", "distinctes", (v) => v],
    ["Exemplaires", "exemplaires", (v) => v],
    ["Valeur de la collection", "valeur", euros],
    ["Extensions commencées", "extensions", (v) => v],
    ["Extensions complètes", "complets", (v) => v],
    ["Cartes ultra / illustrations rares", "rares", (v) => v],
  ];
  let scoreA = 0, scoreB = 0;
  const rangs = lignes.map(([titre, cle, fmt]) => {
    const va = a[cle], vb = b[cle];
    if (va > vb) scoreA++; else if (vb > va) scoreB++;
    const max = Math.max(va, vb, 1);
    const cote = (nom, v, gagne) => {
      const rempli = h("div", { class: "barre-rempli" });
      rempli.style.width = Math.round((v / max) * 100) + "%";
      return h("div", { class: "defi-cote" + (gagne ? " gagne" : "") }, h("span", { class: "defi-nom" }, (gagne ? "👑 " : "") + nom), h("div", { class: "barre" }, rempli), h("b", {}, fmt(v)));
    };
    return h("div", { class: "defi-ligne" }, h("h4", {}, titre), cote(moi, va, va > vb), cote(autre.nom, vb, vb > va));
  });
  const chere = (nom, c) => h("p", { class: "muted" }, "Carte la plus chère de " + nom + " : " + (c.nom ? c.nom + " (" + euros(c.valeur) + ")" : "—"));
  zone.replaceChildren(
    h("p", { class: "defi-score" }, scoreA === scoreB ? "🤝 Égalité parfaite : " + scoreA + " – " + scoreB : "🏅 " + (scoreA > scoreB ? moi : autre.nom) + " mène " + Math.max(scoreA, scoreB) + " manches à " + Math.min(scoreA, scoreB)),
    ...rangs, chere(moi, a.chere), chere(autre.nom, b.chere),
    h("p", { class: "muted" }, "Comparaison en lecture seule : aucune donnée de l'autre compte n'est modifiée.")
  );
}

// ---------- Vue ----------

export const vueObjectifs = {
  async monter(conteneur) {
    const zoneObjectifs = h("div", { class: "objectifs" });
    const zoneThemes = h("div", {});
    const zoneDefi = h("div", {});
    const redessinerObjectifs = () => rendreObjectifs(zoneObjectifs, {
      supprimer: (o) => essayer(async () => { await ecrirePref("objectifs", lirePref("objectifs", []).filter((x) => x.id !== o.id)); redessinerObjectifs(); }),
    });
    conteneur.replaceChildren(
      S.lectureSeule ? null : h("section", { class: "panneau" }, h("h3", {}, "🎯 Mes objectifs"), formulaireObjectif(redessinerObjectifs), zoneObjectifs),
      h("section", { class: "panneau" }, h("h3", {}, "🧩 Collections thématiques"), zoneThemes),
      S.lectureSeule ? null : h("section", { class: "panneau" }, h("h3", {}, "⚔ Défi à deux"), zoneDefi)
    );
    if (!S.lectureSeule) { await chargerPrefs(); redessinerObjectifs(); }
    sectionThemes(zoneThemes);
    if (!S.lectureSeule) sectionDefi(zoneDefi);
  },
  rafraichir() {},
};
