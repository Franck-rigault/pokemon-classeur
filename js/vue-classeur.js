// Vue « Classeur » (réservée aux comptes qui l'ont activé) : une ligne par Pokémon, reliée à la collection.
import { h, $, db, normalise, euros, essayer, message, ARTWORK_URL, imageCarte, detailCarte, cartesParNom, prixDe, libelleExt, fermerAuFond } from "./api.js";
import { S } from "./etat.js";

const GENERATIONS = [
  { nom: "Kanto", de: 1, a: 151 }, { nom: "Johto", de: 152, a: 251 }, { nom: "Hoenn", de: 252, a: 386 },
  { nom: "Sinnoh", de: 387, a: 493 }, { nom: "Unys", de: 494, a: 649 }, { nom: "Kalos", de: 650, a: 721 },
  { nom: "Alola", de: 722, a: 809 }, { nom: "Galar", de: 810, a: 905 }, { nom: "Paldea", de: 906, a: 1025 },
];
const generationDe = (n) => GENERATIONS.findIndex((g) => n >= g.de && n <= g.a);

let lignes = [];
let charge = false;
let redessiner = null;

const tris = {
  numero: (a, b) => (a.numero ?? 1e9) - (b.numero ?? 1e9) || a.id - b.id,
  nom: (a, b) => a.nom.localeCompare(b.nom, "fr"),
  valeur: (a, b) => Number(b.valeur || 0) - Number(a.valeur || 0) || tris.numero(a, b),
  extension: (a, b) => (a.extension || "~").localeCompare(b.extension || "~", "fr") || tris.numero(a, b),
};

async function charger() {
  const tout = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await db.from("pokemon").select("*").order("numero", { ascending: true, nullsFirst: false }).order("id", { ascending: true }).range(debut, debut + 999);
    if (error) throw error;
    tout.push(...data);
    if (data.length < 1000) break;
  }
  lignes = tout;
  charge = true;
}

async function maj(ligne, champs) {
  const ancien = { ...ligne };
  Object.assign(ligne, champs);
  const { error } = await db.from("pokemon").update(champs).eq("id", ligne.id);
  if (error) {
    Object.assign(ligne, ancien);
    message("Échec de la sauvegarde : " + error.message, "ko");
    return false;
  }
  return true;
}

// Applique une carte TCGdex à une ligne du classeur
async function appliquerCarte(ligne, idCarte) {
  const d = await detailCarte(idCarte);
  const ext = S.extParId.get(d.set.id);
  const total = d.set.cardCount && d.set.cardCount.official;
  const prix = prixDe(d);
  await maj(ligne, {
    carte_id: d.id,
    image_url: d.image ? imageCarte(d.image) : null,
    extension: ext ? ext.code || ext.nom : d.set.name,
    numero_carte: d.localId + (total ? "/" + total : ""),
    rarete: d.rarity || null,
    ...(prix !== null ? { valeur: prix } : {}),
  });
}

// Les Pokémon dont on possède au moins une carte dans la collection sont cochés « possédé » dans le classeur
async function synchroniser(silencieux = false) {
  const parDex = new Map();
  for (const c of S.collection) for (const n of c.dex_ids || []) if (!parDex.has(n)) parDex.set(n, c);
  const aMarquer = lignes.filter((l) => !l.possede && parDex.has(l.numero));
  for (const l of aMarquer) {
    const c = parDex.get(l.numero);
    const champs = { possede: true };
    if (!l.carte_id) {
      champs.carte_id = c.carte_id;
      champs.image_url = c.image ? imageCarte(c.image) : null;
      champs.extension = (S.extParId.get(c.set_id) || {}).code || c.set_id;
      champs.numero_carte = c.local_id;
      champs.rarete = c.rarete;
      if (c.valeur != null) champs.valeur = c.valeur;
    }
    await maj(l, champs);
  }
  if (!silencieux || aMarquer.length) message(aMarquer.length ? "✔ " + aMarquer.length + " Pokémon marqués comme possédés d'après votre collection." : "Le classeur est déjà à jour avec votre collection.", "ok");
}

// ---------- Choix d'une carte pour un Pokémon ----------

function tuileCarte(k, selectionnee, auClic) {
  return h("button", { type: "button", class: "tuile" + (selectionnee ? " choisie" : ""), onclick: () => auClic(k) },
    k.image ? h("img", { loading: "lazy", alt: k.name || k.nom, src: imageCarte(k.image), onerror: (ev) => ev.target.replaceWith(h("div", { class: "sans-image" }, "Pas d'image")) }) : h("div", { class: "sans-image" }, "Pas d'image"),
    h("span", {}, libelleExt(k.set_id) + " · n° " + (k.localId || k.local_id))
  );
}

async function ouvrirSelecteur(ligne) {
  const dlg = $("picker");
  $("picker-titre").textContent = "Cartes de " + ligne.nom;
  $("picker-info").textContent = "Chargement des cartes…";
  $("picker-grille").replaceChildren();
  $("picker-clear").hidden = !ligne.carte_id;
  $("picker-clear").onclick = () => essayer(async () => {
    dlg.close();
    await maj(ligne, { carte_id: null, image_url: null, extension: null, numero_carte: null, rarete: null });
    redessiner();
  });
  if (!dlg.open) dlg.showModal();

  const choisir = (k) => essayer(async () => {
    dlg.close();
    await appliquerCarte(ligne, k.id || k.carte_id);
    redessiner();
  });

  try {
    const grille = $("picker-grille");
    const miennes = [...new Map(S.collection.filter((c) => (c.dex_ids || []).includes(ligne.numero)).map((c) => [c.carte_id, c])).values()];
    if (miennes.length) {
      grille.append(h("h3", { class: "pleine-ligne" }, "Dans ma collection"), ...miennes.map((c) => tuileCarte({ id: c.carte_id, image: c.image, set_id: c.set_id, local_id: c.local_id, nom: c.nom }, c.carte_id === ligne.carte_id, choisir)), h("h3", { class: "pleine-ligne" }, "Toutes les cartes"));
    }
    const liste = await cartesParNom(ligne.nom);
    $("picker-info").textContent = liste.length + " cartes existantes, de la plus récente à la plus ancienne.";
    grille.append(...liste.map((k) => tuileCarte(k, k.id === ligne.carte_id, choisir)));
  } catch (err) {
    $("picker-info").textContent = "Impossible de charger les cartes : " + err.message;
  }
}

// ---------- Vue ----------

export const vueClasseur = {
  async monter(conteneur) {
    conteneur.replaceChildren(h("p", { class: "msg" }, "Chargement du classeur…"));
    try {
      if (!charge) await charger();
    } catch (e) {
      return conteneur.replaceChildren(h("p", { class: "msg ko" }, "Classeur indisponible : " + e.message));
    }

    const recherche = h("input", { type: "search", placeholder: "Rechercher un nom ou un n°", autocomplete: "off" });
    const select = (options, label) => h("select", { "aria-label": label }, options.map(([v, t]) => h("option", { value: v }, t)));
    const choixMode = select([["all", "Tous"], ["possede", "Possédés"], ["manquant", "Manquants"], ["wishlist", "Wishlist"], ["wishlist-manquant", "Wishlist non possédés"]], "Afficher");
    const choixTri = select([["numero", "Tri : n° Pokédex"], ["nom", "Tri : nom A → Z"], ["valeur", "Tri : valeur décroissante"], ["extension", "Tri : extension"]], "Trier par");
    const choixGen = select([["", "Toutes les générations"], ...GENERATIONS.map((g, i) => [String(i), g.nom + " (" + g.de + "–" + g.a + ")"])], "Génération");
    const stats = h("div", { class: "dash-tuiles" });
    const corps = h("tbody");

    const bSync = h("button", { type: "button", class: "ghost", title: "Coche les Pokémon dont vous avez au moins une carte", onclick: () => essayer(async () => { await synchroniser(); redessinerTout(); }) }, "↻ Synchroniser avec ma collection");

    function visibles() {
      const q = normalise(recherche.value);
      const mode = choixMode.value;
      return lignes
        .filter((c) => {
          if (q && !normalise(c.nom).includes(q) && String(c.numero ?? "") !== q) return false;
          if (mode === "possede" && !c.possede) return false;
          if (mode === "manquant" && c.possede) return false;
          if (mode === "wishlist" && !c.wishlist) return false;
          if (mode === "wishlist-manquant" && !(c.wishlist && !c.possede)) return false;
          if (choixGen.value !== "" && generationDe(c.numero) !== Number(choixGen.value)) return false;
          return true;
        })
        .sort(tris[choixTri.value]);
    }

    function dessiner() {
      const possedees = lignes.filter((c) => c.possede);
      const wl = lignes.filter((c) => c.wishlist && !c.possede);
      const somme = (l) => l.reduce((s, c) => s + Number(c.valeur || 0), 0);
      stats.replaceChildren(...[[possedees.length + " / " + lignes.length, "Possédés"], [wl.length, "Wishlist à trouver"], [euros(somme(wl)), "Valeur wishlist à trouver"], [euros(somme(possedees)), "Valeur possédée"]].map(([v, l]) => h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l))));
      corps.replaceChildren(...visibles().map(ligne));
    }

    function redessinerTout() { dessiner(); }

    function ligne(c) {
      const champTexte = (champ, placeholder) => h("td", {}, h("input", { type: "text", placeholder, autocomplete: "off", value: c[champ] ?? "", onchange: (e) => essayer(() => maj(c, { [champ]: e.target.value.trim() || null })) }));
      return h("tr", { class: c.possede ? "possede" : "" },
        h("td", {}, c.numero ?? ""),
        h("td", { class: "art" }, c.numero ? h("img", { class: "art-img", loading: "lazy", alt: c.nom, src: ARTWORK_URL + c.numero + ".png", onerror: (e) => e.target.remove() }) : null),
        h("td", { class: "nom" }, c.nom),
        h("td", { class: "carte" },
          c.image_url ? h("img", { class: "carte-img", loading: "lazy", alt: "Carte " + c.nom, src: c.image_url, onclick: () => ouvrirSelecteur(c) }) : null,
          h("button", { type: "button", class: "ghost", onclick: () => ouvrirSelecteur(c) }, c.carte_id ? "Changer" : "Choisir la carte")
        ),
        h("td", {}, h("input", { type: "checkbox", checked: c.possede, onchange: async (e) => { await maj(c, { possede: e.target.checked }); dessiner(); } })),
        champTexte("extension", "—"),
        champTexte("numero_carte", "ex. 189/159"),
        champTexte("rarete", "ex. Gold"),
        h("td", {}, h("input", { type: "number", min: "0", step: "0.01", value: c.valeur, onchange: async (e) => { await maj(c, { valeur: Number(e.target.value) || 0 }); dessiner(); } })),
        h("td", {}, h("input", { type: "checkbox", class: "wl", checked: c.wishlist, onchange: async (e) => { await maj(c, { wishlist: e.target.checked }); dessiner(); } }))
      );
    }

    conteneur.replaceChildren(
      stats,
      h("div", { class: "filtres" }, recherche, choixMode, choixTri, choixGen, bSync),
      h("div", { class: "table-wrap" },
        h("table", {},
          h("thead", {}, h("tr", {}, ["N°", "Image", "Nom", "Carte", "Possédé", "Extension", "N° carte", "Rareté", "Valeur (€)", "Wishlist"].map((t) => h("th", {}, t)))),
          corps
        )
      )
    );
    recherche.addEventListener("input", dessiner);
    [choixMode, choixTri, choixGen].forEach((s) => s.addEventListener("change", dessiner));
    redessiner = dessiner;
    dessiner();

    // Mise à jour automatique d'après la collection, sans bruit si rien ne change
    essayer(async () => { await synchroniser(true); dessiner(); });
  },
  rafraichir() {},
};

fermerAuFond($("picker"));
$("picker-close").addEventListener("click", () => $("picker").close());
