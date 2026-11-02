const db = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const PAGE = 1000;
// Artwork officiel, un fichier par numéro de Pokédex (hébergé par PokeAPI)
const ARTWORK_URL =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";

const TCGDEX = "https://api.tcgdex.net/v2/fr";

const GENERATIONS = [
  { nom: "Kanto", de: 1, a: 151 },
  { nom: "Johto", de: 152, a: 251 },
  { nom: "Hoenn", de: 252, a: 386 },
  { nom: "Sinnoh", de: 387, a: 493 },
  { nom: "Unys", de: 494, a: 649 },
  { nom: "Kalos", de: 650, a: 721 },
  { nom: "Alola", de: 722, a: 809 },
  { nom: "Galar", de: 810, a: 905 },
  { nom: "Paldea", de: 906, a: 1025 },
];

// Lien de partage : ?partage=<jeton> ouvre la collection en lecture seule, sans connexion
const JETON_PARTAGE = new URLSearchParams(location.search).get("partage");
const lectureSeule = !!JETON_PARTAGE;

let cartes = [];
let utilisateur = null;
let demarre = false;
const extParId = new Map(); // id d'extension TCGdex -> { value, label }
const ordreExt = new Map(); // id d'extension -> rang (0 = la plus récente)
const cacheCartes = new Map(); // nom du Pokémon -> cartes existantes
const cacheDetails = new Map(); // id de carte -> détail TCGdex

const normalise = (s) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const euros = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);

const generationDe = (numero) => GENERATIONS.findIndex((g) => numero >= g.de && numero <= g.a);

function message(texte, type = "") {
  const el = $("msg");
  el.textContent = texte;
  el.className = "msg " + type;
}

// ---------- Listes d'aide (extensions, raretés) ----------

async function chargerExtensions() {
  try {
    const liste = await (await fetch("extensions.json", { cache: "no-cache" })).json();
    const dl = $("extensions");
    const vus = new Set();
    liste.forEach((e, i) => {
      extParId.set(e.id, e);
      ordreExt.set(e.id, i);
      if (e.pocket || vus.has(e.value)) return;
      vus.add(e.value);
      const o = document.createElement("option");
      o.value = e.value;
      o.label = e.label;
      dl.append(o);
    });
  } catch {
    // La liste est facultative : la saisie libre reste possible.
  }
}

async function chargerRaretes() {
  try {
    const liste = await (await fetch("raretes.json", { cache: "no-cache" })).json();
    const dl = $("raretes");
    for (const r of liste) {
      const o = document.createElement("option");
      o.value = r;
      dl.append(o);
    }
  } catch {
    // La liste est facultative : la saisie libre reste possible.
  }
}

// ---------- Démarrage et authentification ----------

function erreurAffichee(texte) {
  if (demarre) return message(texte, "ko"); // l'appli est déjà à l'écran : on ne la masque pas
  $("login").hidden = false;
  $("app").hidden = true;
  $("login-msg").textContent = texte;
  $("login-msg").className = "msg ko";
}

async function init() {
  chargerExtensions();
  chargerRaretes();

  if (lectureSeule) {
    document.body.classList.add("lecture");
    $("login").hidden = true;
    $("app").hidden = false;
    demarre = true;
    return charger();
  }

  try {
    // getSession peut rester bloquée si la session stockée est abîmée : on abandonne au bout de 6 s
    const { data } = await Promise.race([
      db.auth.getSession(),
      new Promise((_, rejet) => setTimeout(() => rejet(new Error("délai dépassé")), 6000)),
    ]);
    await afficher(data.session);
    db.auth.onAuthStateChange((_evt, session) => afficher(session));
  } catch (err) {
    erreurAffichee("Session illisible (" + err.message + "). Reconnectez-vous.");
    try { await db.auth.signOut({ scope: "local" }); } catch {}
    db.auth.onAuthStateChange((_evt, session) => afficher(session));
  }
}

window.addEventListener("error", (e) => erreurAffichee("Erreur : " + e.message));
window.addEventListener("unhandledrejection", (e) =>
  erreurAffichee("Erreur : " + (e.reason && e.reason.message ? e.reason.message : e.reason))
);

async function afficher(session) {
  utilisateur = session ? session.user : null;
  $("login").hidden = !!session;
  $("app").hidden = !session;
  if (session) {
    demarre = true;
    await charger();
  }
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-msg").textContent = "";
  const { error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value,
  });
  if (error) {
    $("login-msg").textContent = "Connexion impossible : " + error.message;
    $("login-msg").className = "msg ko";
  }
});

$("logout").addEventListener("click", () => db.auth.signOut());

// ---------- Données ----------

async function charger() {
  message("Chargement…");
  const tout = [];
  for (let debut = 0; ; debut += PAGE) {
    const requete = lectureSeule
      ? db.rpc("collection_partagee", { p_token: JETON_PARTAGE })
      : db
          .from("pokemon")
          .select("*")
          .order("numero", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true });
    const { data, error } = await requete.range(debut, debut + PAGE - 1);
    if (error) return message("Erreur de chargement : " + error.message, "ko");
    tout.push(...data);
    if (data.length < PAGE) break;
  }
  cartes = tout;
  message(lectureSeule ? "Collection partagée en lecture seule." : cartes.length + " cartes chargées.");
  remplirFiltres();
  dessiner();
  if (!lectureSeule) enregistrerInstantane();
}

async function maj(carte, champs, redessiner = true) {
  if (lectureSeule) return;
  const ancien = { ...carte };
  Object.assign(carte, champs);
  if (redessiner) dessiner();
  if ("extension" in champs || "rarete" in champs) remplirFiltres();
  const { error } = await db.from("pokemon").update(champs).eq("id", carte.id);
  if (error) {
    Object.assign(carte, ancien);
    dessiner();
    message("Échec de la sauvegarde : " + error.message, "ko");
    return false;
  }
  planifierInstantane();
  return true;
}

// ---------- Filtres et tri ----------

const tris = {
  numero: (a, b) => (a.numero ?? 1e9) - (b.numero ?? 1e9) || a.id - b.id,
  nom: (a, b) => a.nom.localeCompare(b.nom, "fr"),
  valeur: (a, b) => Number(b.valeur || 0) - Number(a.valeur || 0) || tris.numero(a, b),
  extension: (a, b) => (a.extension || "~").localeCompare(b.extension || "~", "fr") || tris.numero(a, b),
};

function remplirSelect(select, premier, valeurs) {
  const courant = select.value;
  select.textContent = "";
  select.append(new Option(premier, ""));
  for (const v of valeurs) select.append(new Option(v, v));
  select.value = valeurs.includes(courant) ? courant : "";
}

function remplirFiltres() {
  const uniques = (champ) =>
    [...new Set(cartes.map((c) => c[champ]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  remplirSelect($("ext-select"), "Toutes les extensions", uniques("extension"));
  remplirSelect($("rar-select"), "Toutes les raretés", uniques("rarete"));

  const gen = $("gen-select");
  if (gen.options.length <= 1) {
    GENERATIONS.forEach((g, i) => gen.append(new Option(`${g.nom} (${g.de}–${g.a})`, String(i))));
  }
}

function visibles() {
  const filtre = normalise($("filter-input").value);
  const mode = $("filter-select").value;
  const gen = $("gen-select").value;
  const ext = $("ext-select").value;
  const rar = $("rar-select").value;

  return cartes
    .filter((c) => {
      if (filtre && !normalise(c.nom).includes(filtre) && String(c.numero ?? "") !== filtre) return false;
      if (mode === "possede" && !c.possede) return false;
      if (mode === "manquant" && c.possede) return false;
      if (mode === "wishlist" && !c.wishlist) return false;
      if (mode === "wishlist-manquant" && !(c.wishlist && !c.possede)) return false;
      if (gen !== "" && generationDe(c.numero) !== Number(gen)) return false;
      if (ext && c.extension !== ext) return false;
      if (rar && c.rarete !== rar) return false;
      return true;
    })
    .sort(tris[$("tri-select").value] || tris.numero);
}

function statistiques() {
  const possedees = cartes.filter((c) => c.possede);
  const wl = cartes.filter((c) => c.wishlist && !c.possede);
  const somme = (l) => l.reduce((s, c) => s + Number(c.valeur || 0), 0);
  return {
    total: cartes.length,
    possedes: possedees.length,
    valeurPossedee: somme(possedees),
    nbWishlist: wl.length,
    valeurWishlist: somme(wl),
  };
}

// ---------- Affichage ----------

function dessiner() {
  const corps = $("rows");
  corps.textContent = "";

  for (const c of visibles()) {
    const tr = document.createElement("tr");
    if (c.possede) tr.className = "possede";

    const tdNum = document.createElement("td");
    tdNum.textContent = c.numero ?? "";

    const tdArt = document.createElement("td");
    tdArt.className = "art";
    if (c.numero) {
      const img = document.createElement("img");
      img.className = "art-img";
      img.loading = "lazy";
      img.alt = c.nom;
      img.src = ARTWORK_URL + c.numero + ".png";
      img.addEventListener("error", () => img.remove());
      tdArt.append(img);
    }

    const tdNom = document.createElement("td");
    tdNom.className = "nom";
    tdNom.textContent = c.nom;

    const tdPos = document.createElement("td");
    const cbPos = document.createElement("input");
    cbPos.type = "checkbox";
    cbPos.checked = c.possede;
    cbPos.addEventListener("change", () => maj(c, { possede: cbPos.checked }));
    tdPos.append(cbPos);

    const tdCarte = document.createElement("td");
    tdCarte.className = "carte";
    if (c.image_url) {
      const miniature = document.createElement("img");
      miniature.className = "carte-img";
      miniature.loading = "lazy";
      miniature.alt = "Carte " + c.nom;
      miniature.src = c.image_url;
      miniature.addEventListener("click", () => ouvrirSelecteur(c));
      tdCarte.append(miniature);
    }
    const btCarte = document.createElement("button");
    btCarte.type = "button";
    btCarte.className = "ghost";
    btCarte.textContent = c.carte_id ? "Changer" : "Choisir la carte";
    btCarte.addEventListener("click", () => ouvrirSelecteur(c));
    tdCarte.append(btCarte);

    const tdExt = document.createElement("td");
    const inExt = document.createElement("input");
    inExt.type = "text";
    inExt.setAttribute("list", "extensions");
    inExt.placeholder = "—";
    inExt.autocomplete = "off";
    inExt.value = c.extension ?? "";
    // Un clic vide le champ pour afficher toute la liste ; on restaure si rien n'est choisi.
    inExt.addEventListener("focus", () => { inExt.value = ""; });
    inExt.addEventListener("change", () => maj(c, { extension: inExt.value.trim() || null }));
    inExt.addEventListener("blur", () => { inExt.value = c.extension ?? ""; });
    tdExt.append(inExt);

    if (c.extension) {
      const effacer = document.createElement("button");
      effacer.type = "button";
      effacer.className = "clear";
      effacer.textContent = "✕";
      effacer.title = "Retirer l'extension";
      // mousedown : agit avant le blur du champ, qui restaurerait l'ancienne valeur
      effacer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        maj(c, { extension: null });
      });
      tdExt.append(effacer);
    }

    const champTexte = (champ, placeholder, liste) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      if (liste) input.setAttribute("list", liste);
      input.placeholder = placeholder;
      input.autocomplete = "off";
      input.value = c[champ] ?? "";
      input.addEventListener("change", () => maj(c, { [champ]: input.value.trim() || null }));
      td.append(input);
      return td;
    };

    const tdInfos = [tdExt, champTexte("numero_carte", "ex. 189/159"), champTexte("rarete", "ex. Gold", "raretes")];

    const tdVal = document.createElement("td");
    const inVal = document.createElement("input");
    inVal.type = "number";
    inVal.min = "0";
    inVal.step = "0.01";
    inVal.value = c.valeur;
    inVal.addEventListener("change", () => maj(c, { valeur: Number(inVal.value) || 0 }));
    tdVal.append(inVal);

    const tdWl = document.createElement("td");
    const cbWl = document.createElement("input");
    cbWl.type = "checkbox";
    cbWl.className = "wl";
    cbWl.checked = c.wishlist;
    cbWl.addEventListener("change", () => maj(c, { wishlist: cbWl.checked }));
    tdWl.append(cbWl);

    tr.append(tdNum, tdArt, tdNom, tdCarte, tdPos, ...tdInfos, tdVal, tdWl);
    corps.append(tr);
  }

  if (lectureSeule) corps.querySelectorAll("input, button").forEach((e) => (e.disabled = true));

  const s = statistiques();
  $("stat-possedes").textContent = s.possedes + " / " + s.total;
  $("stat-wl-nb").textContent = s.nbWishlist;
  $("stat-wl-val").textContent = euros(s.valeurWishlist);
  $("stat-total-val").textContent = euros(s.valeurPossedee);
}

// ---------- Choix de la carte exacte (TCGdex) ----------

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function cartesDe(nom) {
  if (cacheCartes.has(nom)) return cacheCartes.get(nom);
  const rep = await fetch(TCGDEX + "/cards?name=" + encodeURIComponent(nom));
  if (!rep.ok) throw new Error("TCGdex a répondu " + rep.status);
  // « Mew » ne doit pas ramener « Mewtwo » : on garde les cartes dont le nom contient ce mot entier
  const mot = new RegExp("(?<![\\p{L}\\p{N}])" + echapper(normalise(nom)) + "(?![\\p{L}\\p{N}])", "u");
  const idExt = (k) => k.id.slice(0, k.id.lastIndexOf("-"));
  const liste = (await rep.json())
    .filter((k) => mot.test(normalise(k.name)))
    .sort(
      (a, b) =>
        (ordreExt.get(idExt(a)) ?? 9999) - (ordreExt.get(idExt(b)) ?? 9999) ||
        (parseInt(a.localId) || 0) - (parseInt(b.localId) || 0)
    );
  liste.forEach((k) => (k.idExt = idExt(k)));
  cacheCartes.set(nom, liste);
  return liste;
}

async function detailCarte(id) {
  if (cacheDetails.has(id)) return cacheDetails.get(id);
  const rep = await fetch(TCGDEX + "/cards/" + encodeURIComponent(id));
  if (!rep.ok) throw new Error("TCGdex a répondu " + rep.status);
  const d = await rep.json();
  cacheDetails.set(id, d);
  return d;
}

// Prix moyen Cardmarket sur 30 jours (à défaut : moyenne du jour) ; null si aucun prix
const prixDe = (d) => {
  const cm = d.pricing && d.pricing.cardmarket;
  return cm ? cm.avg30 ?? cm.avg ?? null : null;
};

// Enregistre la carte choisie sur la ligne du Pokémon ; `extra` ajoute d'autres champs (ex. possede)
async function appliquerCarte(carte, idCarte, extra = {}) {
  const d = await detailCarte(idCarte);
  const ext = extParId.get(d.set.id);
  const total = d.set.cardCount && d.set.cardCount.official;
  const prix = prixDe(d);
  await maj(carte, {
    carte_id: d.id,
    image_url: d.image ? d.image + "/low.webp" : null,
    extension: ext ? ext.value : d.set.name,
    numero_carte: d.localId + (total ? "/" + total : ""),
    rarete: d.rarity || null,
    ...(prix !== null ? { valeur: prix } : {}),
    ...extra,
  });
  return { d, ext, prix };
}

function creerTuile(k, selectionnee, auClic) {
  const tuile = document.createElement("button");
  tuile.type = "button";
  tuile.className = "tuile" + (selectionnee ? " choisie" : "");

  const sansImage = () => {
    const vide = document.createElement("div");
    vide.className = "sans-image";
    vide.textContent = "Pas d'image";
    return vide;
  };

  if (k.image) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = k.name;
    img.src = k.image + "/low.webp";
    img.addEventListener("error", () => img.replaceWith(sansImage()));
    tuile.append(img);
  } else {
    tuile.append(sansImage());
  }

  const legende = document.createElement("span");
  const ext = extParId.get(k.idExt);
  legende.textContent = (ext ? ext.label : k.idExt) + " · n° " + k.localId;
  tuile.append(legende);

  tuile.addEventListener("click", () => auClic(k));
  return tuile;
}

let selecteurCourant = null;

async function ouvrirSelecteur(carte) {
  if (lectureSeule) return;
  const dlg = $("picker");
  selecteurCourant = carte;
  $("picker-titre").textContent = "Cartes de " + carte.nom;
  $("picker-clear").hidden = !carte.carte_id;
  $("picker-info").textContent = "Chargement des cartes…";
  $("picker-grille").textContent = "";
  if (!dlg.open) dlg.showModal();

  try {
    const liste = await cartesDe(carte.nom);
    if (selecteurCourant !== carte) return;
    $("picker-info").textContent = liste.length + " cartes trouvées, de la plus récente à la plus ancienne.";
    const grille = $("picker-grille");
    for (const k of liste) {
      grille.append(creerTuile(k, k.id === carte.carte_id, () => choisirCarte(carte, k)));
    }
    grille.scrollTop = 0;
  } catch (err) {
    $("picker-info").textContent = "Impossible de charger les cartes : " + err.message;
  }
}

async function choisirCarte(carte, k) {
  $("picker-info").textContent = "Enregistrement…";
  try {
    $("picker").close();
    const { d, ext, prix } = await appliquerCarte(carte, k.id);
    message(
      "✔ " + carte.nom + " : " + (ext ? ext.label : d.set.name) + ", n° " + d.localId +
        (prix !== null ? " · prix moyen " + euros(prix) : " · pas de prix disponible, valeur inchangée"),
      "ok"
    );
  } catch (err) {
    message("Échec : " + err.message, "ko");
  }
}

$("picker-close").addEventListener("click", () => $("picker").close());
$("picker").addEventListener("click", (e) => {
  if (e.target === $("picker")) $("picker").close(); // clic sur le fond
});
$("picker").addEventListener("close", () => (selecteurCourant = null));
$("picker-clear").addEventListener("click", async () => {
  const carte = selecteurCourant;
  $("picker").close();
  if (carte) await maj(carte, { carte_id: null, image_url: null, extension: null, numero_carte: null, rarete: null });
});

// ---------- Ajout à la wishlist par le nom (remplace F2 / F3) ----------

$("wish-input").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const saisie = normalise(e.target.value);
  if (!saisie) return message("");

  const carte = cartes.find((c) => normalise(c.nom) === saisie);
  if (!carte) return message("✘ Pokémon introuvable : " + e.target.value, "ko");

  await maj(carte, { wishlist: true });
  message("✔ " + carte.nom + " ajouté à la wishlist", "ok");
  e.target.value = "";
});

// ---------- Filtres ----------

["filter-input"].forEach((id) => $(id).addEventListener("input", dessiner));
["filter-select", "tri-select", "gen-select", "ext-select", "rar-select"].forEach((id) =>
  $(id).addEventListener("change", dessiner)
);

$("outils-toggle").addEventListener("click", () => {
  $("outils").hidden = !$("outils").hidden;
});
if (window.innerWidth < 700) $("outils").hidden = true;

// ---------- Ajout d'un Pokémon ----------

$("add-toggle").addEventListener("click", () => {
  $("add-form").hidden = !$("add-form").hidden;
});

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nouvelle = {
    numero: $("add-numero").value ? Number($("add-numero").value) : null,
    nom: $("add-nom").value.trim(),
    extension: $("add-extension").value.trim() || null,
    numero_carte: $("add-numero-carte").value.trim() || null,
    rarete: $("add-rarete").value.trim() || null,
    valeur: Number($("add-valeur").value) || 0,
  };
  const { data, error } = await db.from("pokemon").insert(nouvelle).select().single();
  if (error) return message("Échec de l'ajout : " + error.message, "ko");
  cartes.push(data);
  e.target.reset();
  remplirFiltres();
  dessiner();
  message("✔ " + data.nom + " ajouté.", "ok");
});

// On attend que outils.js et scan.js soient chargés avant de démarrer
document.addEventListener("DOMContentLoaded", init);
