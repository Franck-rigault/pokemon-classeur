// Jeu « Fake Booster » : ouverture de boosters virtuels (animation, une carte à la fois), inventaire sans doublon,
// pack gratuit illimité de l'extension la plus récente, pièces gagnées avec les doublons, boutique de boosters
// (prix recalculés chaque jour d'après les vrais prix des cartes) et classement entre les joueurs.
import { $, h, db, essayer, message, euros, imageCarte, libelleExt, annee, detailsExtension, idExtDe, normalise } from "./api.js";
import { S, evenements, emettre } from "./etat.js";
import { stockage } from "./donnees.js";
import { ouvrirCarte } from "./dialogue-carte.js";
import {
  GROUPES, PIECES_PAR_DOUBLON, VALEUR_PAR_DEFAUT, jouable, epoqueDe, prixEnPieces,
  tirerBooster, estHit, estJackpot, importance,
} from "./jeu-regles.js";
import { son, vibrer, sonActif, basculerSon } from "./jeu-effets.js";

// Accès réseau du jeu (remplaçable pour les tests)
export const jeuStock = {
  async classement() {
    const { data, error } = await db.rpc("classement_jeu");
    if (error) throw error;
    return data;
  },
  // Prix des boosters recalculés chaque nuit (travail GitHub) : on prend le plus récent entre la branche « donnees » et la copie du site
  async prix() {
    const sources = [];
    if (location.hostname.endsWith(".github.io")) {
      const proprietaire = location.hostname.split(".")[0];
      const depot = location.pathname.split("/")[1];
      if (depot) sources.push("https://raw.githubusercontent.com/" + proprietaire + "/" + depot + "/donnees/prix-boosters.json");
    }
    sources.push("data/prix-boosters.json");
    let meilleur = null;
    for (const source of sources) {
      try {
        const rep = await fetch(source, { cache: "no-cache" });
        if (!rep.ok) continue;
        const donnees = await rep.json();
        if (!meilleur || String(donnees.date) > String(meilleur.date)) meilleur = donnees;
      } catch {
        // source indisponible : on essaie la suivante
      }
    }
    return meilleur;
  },
};

const jeu = { userId: null, charge: false, joueur: null, cartes: [], possedees: new Set(), prix: null };

// ---------- Données du joueur ----------

async function chargerJeu() {
  if (jeu.userId !== S.moi.id) Object.assign(jeu, { userId: S.moi.id, charge: false });
  if (!jeu.charge) {
    jeu.cartes = await stockage.lister("jeu_cartes", S.moi.id, [["id", false]]);
    const [j] = await stockage.lister("jeu_joueurs", S.moi.id, [["id", true]]);
    jeu.joueur = j || (await stockage.inserer("jeu_joueurs", { paquets_total: 0, doublons: 0, pieces: 0 }))[0];
    jeu.joueur.pieces = jeu.joueur.pieces || 0;
    jeu.possedees = new Set(jeu.cartes.map((c) => c.carte_id));
    jeu.prix = await jeuStock.prix();
    jeu.charge = true;
  }
}

// Marque les cartes nouvelles (jamais obtenues) ; une carte n'est « nouvelle » qu'à sa première apparition
function marquer(paquets) {
  const vues = new Set();
  const nouvelles = [];
  let doublons = 0;
  for (const paquet of paquets) {
    for (const c of paquet) {
      if (!jeu.possedees.has(c.id) && !vues.has(c.id)) {
        c.nouveau = true;
        vues.add(c.id);
        nouvelles.push(c);
      } else {
        c.nouveau = false;
        doublons++;
      }
    }
  }
  return { nouvelles, doublons, pieces: doublons * PIECES_PAR_DOUBLON };
}

// Enregistre l'ouverture : nouvelles cartes, compteurs, et solde de pièces (− coût du booster + pièces des doublons)
async function enregistrer(nbPaquets, bilan, cout) {
  if (bilan.nouvelles.length) {
    const lignes = bilan.nouvelles.map((c) => ({
      carte_id: c.id, set_id: idExtDe(c.id), nom: c.name, local_id: c.localId, image: c.image, rarete: c.rarete, valeur: c.prix,
    }));
    const crees = await stockage.inserer("jeu_cartes", lignes);
    jeu.cartes.unshift(...crees);
    crees.forEach((c) => jeu.possedees.add(c.carte_id));
  }
  const j = jeu.joueur;
  const champs = {
    paquets_total: j.paquets_total + nbPaquets,
    doublons: j.doublons + bilan.doublons,
    pieces: j.pieces - cout + bilan.pieces,
  };
  await stockage.maj("jeu_joueurs", j.id, champs);
  Object.assign(j, champs);
}

// ---------- Extensions et prix ----------

const aujourdhui = () => new Date().toLocaleDateString("sv-SE");

// Pack gratuit : l'extension jouable la plus récente (déjà sortie)
function extensionGratuite() {
  return S.extensions.filter((e) => jouable(e) && (!e.date || e.date <= aujourdhui()))[0] || null;
}

// Valeur moyenne d'un booster (€) : calcul du jour, sinon valeur par défaut de l'époque
function valeurBooster(ext) {
  const donnee = jeu.prix && jeu.prix.boosters && jeu.prix.boosters[ext.id];
  if (donnee) return { valeur: donnee.valeur, estime: false };
  return { valeur: VALEUR_PAR_DEFAUT[epoqueDe(ext)] || 5, estime: true };
}

const prixPieces = (ext) => prixEnPieces(valeurBooster(ext).valeur);

// ---------- Ouverture ----------

const fenetre = () => $("jeu-ouverture");
const scene = () => $("jeu-scene");

function logoExtension(ext, classe = "ext-logo") {
  const code = () => h("span", { class: "ext-code" }, ext.code || "");
  return ext.logo
    ? h("img", { class: classe, alt: "", src: ext.logo + ".webp", onerror: (e) => e.target.replaceWith(code()) })
    : code();
}

// n boosters de l'extension ; `gratuit` : pack de l'extension la plus récente, sans limite et sans coût
async function ouvrir(ext, n = 1, rapide = false, gratuit = false) {
  try {
    const cout = gratuit ? 0 : prixPieces(ext) * n;
    if (cout > jeu.joueur.pieces) return message("Il vous manque " + (cout - jeu.joueur.pieces) + " pièce(s) : récupérez-en avec les doublons du pack gratuit.", "ko");

    // Préparation : on récupère une fois les détails (rareté, prix) de toutes les cartes de l'extension
    const info = h("p", { class: "jeu-chargement" }, "Préparation de l'extension…");
    scene().replaceChildren(h("div", { class: "jeu-attente" }, logoExtension(ext, "ext-logo grand"), h("b", {}, ext.nom), info));
    if (!fenetre().open) fenetre().showModal();
    const details = await detailsExtension(ext.id, (faits, total) => { info.textContent = "Préparation de l'extension… " + faits + " / " + total; });

    const paquets = Array.from({ length: n }, () => tirerBooster(details, ext));
    const bilan = marquer(paquets);
    bilan.cout = cout;
    await enregistrer(n, bilan, cout); // enregistré avant l'animation : fermer la fenêtre ne permet pas de « tricher »
    emettre("jeu");

    const options = { gratuit };
    if (n === 1 && !rapide) scenePaquet(ext, paquets[0], bilan, options);
    else sceneResume(ext, paquets, bilan, options);
  } catch (e) {
    if (fenetre().open) fenetre().close();
    message("Ouverture impossible : " + (e && e.message ? e.message : e), "ko");
  }
}

// Scène 1 : le paquet à déchirer
function scenePaquet(ext, booster, bilan, options) {
  const teinte = [...ext.id].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
  let ouvert = false;
  const paquet = h("button", {
    type: "button", class: "paquet", style: "--teinte:" + teinte, "aria-label": "Ouvrir le booster",
    onclick: () => {
      if (ouvert) return;
      ouvert = true;
      paquet.classList.add("ouvre");
      son("dechirure");
      vibrer(60);
      setTimeout(() => sceneCartes(ext, booster, bilan, options), 950);
    },
  },
    h("div", { class: "paquet-haut" }),
    h("div", { class: "paquet-corps" }, logoExtension(ext, "ext-logo grand"), h("b", {}, ext.nom), h("span", { class: "fake-logo" }, "FAKE BOOSTER")),
    h("div", { class: "paquet-bas" })
  );
  scene().replaceChildren(h("div", { class: "jeu-paquet" }, paquet, h("p", { class: "jeu-aide" }, "Touchez le paquet pour le déchirer")));
}

function confetti(parent, couleur) {
  const pluie = h("div", { class: "confettis" });
  for (let i = 0; i < 46; i++) {
    const p = h("span", { class: "confetti" });
    p.style.left = Math.random() * 100 + "%";
    p.style.background = i % 3 === 0 ? couleur : "hsl(" + Math.floor(Math.random() * 360) + " 90% 60%)";
    p.style.animationDelay = Math.random() * 0.5 + "s";
    p.style.animationDuration = 1.6 + Math.random() * 1.4 + "s";
    pluie.append(p);
  }
  parent.append(pluie);
  setTimeout(() => pluie.remove(), 3500);
}

// Pokéball du dos des cartes (symbole SVG défini dans index.html ; il faut le bon espace de noms)
function ballSvg() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "dos-ball");
  svg.setAttribute("viewBox", "0 0 100 100");
  const use = document.createElementNS(NS, "use");
  use.setAttribute("href", "#ball");
  svg.append(use);
  return svg;
}

function carteElement(c) {
  const g = GROUPES[c.groupe] || GROUPES.C;
  const face = c.image ? h("img", { class: "face", src: imageCarte(c.image, "high"), alt: c.name }) : h("div", { class: "face sans-image" }, c.name);
  return h("div", {
    class: "carte3d" + (estHit(c) ? " hit" : "") + (estJackpot(c) ? " jackpot" : "") + (c.variante === "Reverse" ? " reverse" : ""),
    style: "--couleur:" + g.couleur,
  },
    c.nouveau ? h("div", { class: "nouveau" }, h("b", {}, "NEW"), h("small", {}, "FAKE BOOSTER")) : null,
    h("div", { class: "retourne" },
      h("div", { class: "dos" }, ballSvg()),
      h("div", { class: "devant" }, face, c.variante === "Reverse" ? h("div", { class: "reflet-reverse" }) : null)
    )
  );
}

// Scène 2 : les cartes, une par une (la meilleure en dernier)
function sceneCartes(ext, booster, bilan, options) {
  let i = -1;
  let revelee = true;
  const compteur = h("div", { class: "jeu-compteur" });
  const zone = h("div", { class: "jeu-zone" });
  const info = h("div", { class: "jeu-info" });
  const racine = h("div", { class: "jeu-cartes" },
    compteur, zone, info,
    h("p", { class: "jeu-aide" }, "Touchez pour continuer"),
    h("button", { type: "button", class: "ghost passer", onclick: (e) => { e.stopPropagation(); sceneResume(ext, [booster], bilan, options); } }, "Passer ›")
  );

  function reveler(c, element) {
    element.classList.add("retournee");
    const g = GROUPES[c.groupe] || GROUPES.C;
    if (estJackpot(c)) {
      son("jackpot");
      vibrer([80, 50, 80, 50, 220]);
      racine.classList.add("flash");
      setTimeout(() => racine.classList.remove("flash"), 900);
      confetti(racine, g.couleur);
    } else if (estHit(c)) {
      son("hit");
      vibrer([60, 40, 100]);
      confetti(racine, g.couleur);
    } else {
      son(importance(c) >= 2 ? "bon" : "carte");
      if (importance(c) >= 2) vibrer(30);
    }
    info.replaceChildren(
      h("b", { class: "jeu-nom" }, c.name),
      h("span", { class: "jeu-rarete", style: "color:" + g.couleur }, (c.rarete || g.nom) + (c.variante === "Reverse" ? " · Reverse" : "")),
      h("span", { class: "jeu-prix" }, c.prix != null ? euros(c.prix) : "Pas de prix"),
      !c.nouveau ? h("span", { class: "jeu-doublon" }, "Doublon : +" + PIECES_PAR_DOUBLON + " 🪙") : null
    );
  }

  function avancer() {
    if (!revelee) {
      revelee = true;
      return reveler(booster[i], zone.firstChild);
    }
    i++;
    if (i >= booster.length) return sceneResume(ext, [booster], bilan, options);
    revelee = false;
    compteur.textContent = i + 1 + " / " + booster.length;
    info.replaceChildren();
    const element = carteElement(booster[i]);
    zone.replaceChildren(element);
    son("carte");
  }

  racine.addEventListener("click", avancer);
  scene().replaceChildren(racine);
  avancer();
}

// Scène 3 : résumé (un booster ou un lot de 10)
function sceneResume(ext, paquets, bilan, options) {
  const toutes = paquets.flat();
  const tries = [...toutes].sort((a, b) => importance(b) - importance(a) || (b.prix || 0) - (a.prix || 0));
  const meilleure = tries[0];
  const valeur = toutes.reduce((s, c) => s + (c.prix || 0), 0);
  const lot = paquets.length > 1;
  const affichees = lot ? tries.slice(0, 24) : tries;

  const tuile = (c) => {
    const g = GROUPES[c.groupe] || GROUPES.C;
    return h("button", {
      type: "button", class: "jeu-tuile" + (c.nouveau ? " nouveau-carte" : ""), style: "--couleur:" + g.couleur, title: c.name,
      onclick: () => ouvrirCarte(c.id),
    },
      c.image ? h("img", { src: imageCarte(c.image), alt: c.name, loading: "lazy" }) : h("div", { class: "sans-image" }, c.name),
      c.nouveau ? h("span", { class: "badge-new" }, "NEW") : h("span", { class: "badge-doublon" }, "+" + PIECES_PAR_DOUBLON + " 🪙"),
      h("small", {}, c.prix != null ? euros(c.prix) : "—")
    );
  };

  // Rejouer : le même pack (gratuit, ou payé au prix du jour)
  const encore = (n, rapide) => {
    const cout = options.gratuit ? 0 : prixPieces(ext) * n;
    return h("button", {
      type: "button", disabled: cout > jeu.joueur.pieces,
      onclick: () => ouvrir(ext, n, rapide, options.gratuit),
    }, (n === 1 ? "🔁 Un autre" : "⚡ ×10 rapide") + (cout ? " (" + cout + " 🪙)" : " (gratuit)"));
  };

  scene().replaceChildren(h("div", { class: "jeu-resume" },
    h("h2", {}, lot ? "Résultat de " + paquets.length + " boosters" : "Résumé du booster"),
    h("p", { class: "muted" }, ext.nom + (bilan.cout ? " · " + bilan.cout + " 🪙 dépensées" : " · pack gratuit")),
    h("div", { class: "dash-tuiles" },
      [[euros(valeur), "Valeur des cartes"], [bilan.nouvelles.length, "Nouvelles cartes"], ["+" + bilan.pieces + " 🪙", bilan.doublons + " doublon(s)"], [jeu.joueur.pieces + " 🪙", "Votre solde"]].map(([v, l]) =>
        h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l)))
    ),
    meilleure ? h("p", {}, "Meilleure carte : ", h("b", {}, meilleure.name), " (" + (meilleure.rarete || "") + (meilleure.prix != null ? ", " + euros(meilleure.prix) : "") + ")") : null,
    h("div", { class: "jeu-grille" }, affichees.map(tuile)),
    lot && tries.length > 24 ? h("p", { class: "muted" }, "… et " + (tries.length - 24) + " autres cartes (les moins rares).") : null,
    h("div", { class: "row tools centre-boutons" }, encore(1, false), lot || options.gratuit ? null : encore(10, true), h("button", { type: "button", class: "ghost", onclick: () => fenetre().close() }, "Fermer"))
  ));
}

// ---------- La vue « Fake Booster » ----------

let courante = null;
const PAGES = ["ouvrir", "collection", "classement"];

export const vueJeu = {
  async monter(conteneur, param) {
    conteneur.replaceChildren(h("p", { class: "msg" }, "Chargement…"));
    try {
      await chargerJeu();
    } catch (e) {
      return conteneur.replaceChildren(h("p", { class: "msg ko" }, "Jeu indisponible : " + e.message + " — la migration schema-v6.sql a-t-elle été lancée ?"));
    }
    const page = PAGES.includes(param) ? param : "ouvrir";
    const solde = h("div", { class: "jeu-solde" });
    const corps = h("div", { class: "jeu-corps" });
    const boutonSon = h("button", {
      type: "button", class: "ghost", title: "Activer ou couper les bruitages",
      onclick: () => { boutonSon.textContent = basculerSon() ? "🔊 Son" : "🔇 Muet"; },
    }, sonActif() ? "🔊 Son" : "🔇 Muet");

    function majSolde() {
      const j = jeu.joueur;
      solde.replaceChildren(
        h("span", { class: "pieces" }, "🪙 " + j.pieces),
        h("span", { class: "muted" }, "pièces · " + j.paquets_total + " boosters ouverts · " + jeu.cartes.length + " cartes uniques")
      );
    }

    conteneur.replaceChildren(
      h("div", { class: "jeu-entete" },
        h("div", {}, h("h2", { class: "jeu-titre" }, "🎴 Fake Booster"),
          h("p", { class: "muted" }, "Pack gratuit illimité, une pièce par doublon, et une boutique pour ouvrir les autres extensions. Les taux de drop sont des estimations (non officiels).")),
        boutonSon
      ),
      solde,
      h("nav", { class: "onglets-jeu" }, [["ouvrir", "🎁 Ouvrir"], ["collection", "🗂 Ma collection de jeu"], ["classement", "🏆 Classement"]].map(([p, t]) =>
        h("a", { href: "#/jeu/" + (p === "ouvrir" ? "" : p), class: p === page ? "actif" : "" }, t))),
      corps
    );

    const dessiner = () => {
      majSolde();
      if (page === "ouvrir") pageOuvrir(corps);
      else if (page === "collection") pageCollection(corps);
      else pageClassement(corps);
    };
    courante = page === "classement" ? () => majSolde() : dessiner;
    dessiner();
  },
  rafraichir() {
    if (courante) courante();
  },
};

evenements.addEventListener("jeu", () => vueJeu.rafraichir());

// Pack gratuit + boutique
function pageOuvrir(corps) {
  if (corps.dataset.pret) {
    // la page existe déjà : on met seulement à jour les boutons selon le solde
    corps.querySelectorAll("[data-cout]").forEach((b) => (b.disabled = jeu.joueur.pieces < Number(b.dataset.cout)));
    return;
  }
  corps.dataset.pret = "1";

  const gratuite = extensionGratuite();
  const boutiqueExt = S.extensions.filter((e) => jouable(e) && (!e.date || e.date <= aujourdhui()) && (!gratuite || e.id !== gratuite.id));
  const series = [...new Set(boutiqueExt.map((e) => e.serie))];

  const recherche = h("input", { type: "search", placeholder: "Rechercher une extension", autocomplete: "off" });
  const choixSerie = h("select", { "aria-label": "Série" }, h("option", { value: "" }, "Toutes les séries"), series.map((s) => h("option", { value: s }, s)));
  const choixTri = h("select", { "aria-label": "Trier par" },
    h("option", { value: "recent" }, "Tri : plus récentes"),
    h("option", { value: "prix" }, "Tri : prix croissant"),
    h("option", { value: "prix-desc" }, "Tri : prix décroissant"),
    h("option", { value: "nom" }, "Tri : nom A → Z")
  );
  const grille = h("div", { class: "ext-grille" });
  const info = h("p", { class: "muted" });

  const bandeauGratuit = gratuite
    ? h("section", { class: "pack-gratuit" },
        h("div", { class: "pack-gratuit-visuel" }, logoExtension(gratuite, "ext-logo grand")),
        h("div", { class: "pack-gratuit-texte" },
          h("span", { class: "etiquette" }, "PACK GRATUIT · ILLIMITÉ"),
          h("h3", {}, gratuite.nom),
          h("p", { class: "muted" }, "L'extension la plus récente. Chaque doublon vous rapporte " + PIECES_PAR_DOUBLON + " 🪙 à dépenser dans la boutique."),
          h("div", { class: "row tools" },
            h("button", { type: "button", class: "gros", onclick: () => ouvrir(gratuite, 1, false, true) }, "🎁 Ouvrir un booster")
          )
        ))
    : null;

  const dateTexte = () => {
    if (!jeu.prix) return "Prix par défaut (les prix du jour ne sont pas disponibles).";
    const jours = Math.floor((Date.now() - new Date(jeu.prix.date).getTime()) / 864e5);
    return "Prix du " + new Date(jeu.prix.date).toLocaleDateString("fr-FR") + (jours > 3 ? " (anciens : le recalcul quotidien n'a pas tourné depuis " + jours + " jours)" : "") + ", recalculés chaque nuit d'après les prix Cardmarket des cartes.";
  };

  function dessiner() {
    const q = normalise(recherche.value);
    const liste = boutiqueExt
      .filter((e) => (!choixSerie.value || e.serie === choixSerie.value) && (!q || normalise(e.nom).includes(q) || normalise(e.code || "").includes(q)))
      .sort(choixTri.value === "prix" ? (a, b) => prixPieces(a) - prixPieces(b)
        : choixTri.value === "prix-desc" ? (a, b) => prixPieces(b) - prixPieces(a)
        : choixTri.value === "nom" ? (a, b) => a.nom.localeCompare(b.nom, "fr")
        : () => 0);
    info.textContent = liste.length + " extension(s). " + dateTexte();
    grille.replaceChildren(...liste.map((ext) => {
      const { valeur, estime } = valeurBooster(ext);
      const prix = prixEnPieces(valeur);
      return h("div", { class: "ext-carte" },
        h("div", { class: "ext-visuel" }, logoExtension(ext)),
        h("b", { class: "ext-nom" }, ext.nom),
        h("small", { class: "muted" }, [ext.code, annee(ext)].filter(Boolean).join(" · ")),
        h("div", { class: "prix-booster", title: "Valeur moyenne d'un booster : " + euros(valeur) + (estime ? " (estimation par défaut)" : "") }, h("b", {}, "🪙 " + prix), h("small", { class: "muted" }, "≈ " + euros(valeur) + (estime ? " (est.)" : ""))),
        h("div", { class: "tuile-actions" },
          h("button", { type: "button", "data-cout": String(prix), disabled: jeu.joueur.pieces < prix, onclick: () => ouvrir(ext, 1, false) }, "🛒 Acheter"),
          h("button", { type: "button", class: "ghost", "data-cout": String(prix * 10), title: "10 boosters d'un coup : " + prix * 10 + " pièces", disabled: jeu.joueur.pieces < prix * 10, onclick: () => ouvrir(ext, 10, true) }, "⚡ ×10")
        )
      );
    }));
  }

  recherche.addEventListener("input", dessiner);
  choixSerie.addEventListener("change", dessiner);
  choixTri.addEventListener("change", dessiner);
  corps.replaceChildren(
    bandeauGratuit,
    h("h3", { class: "titre-boutique" }, "🛒 Boutique"),
    h("div", { class: "filtres" }, recherche, choixSerie, choixTri),
    info,
    grille
  );
  dessiner();
}

// Inventaire du jeu : une seule copie de chaque carte
function pageCollection(corps) {
  const stats = h("div", { class: "dash-tuiles" });
  const recherche = h("input", { type: "search", placeholder: "Rechercher une carte", autocomplete: "off" });
  const choixExt = h("select", { "aria-label": "Extension" });
  const choixTri = h("select", { "aria-label": "Trier par" },
    h("option", { value: "recent" }, "Tri : plus récentes"),
    h("option", { value: "valeur" }, "Tri : valeur décroissante"),
    h("option", { value: "nom" }, "Tri : nom A → Z")
  );
  const grille = h("div", { class: "cartes-grille" });
  const info = h("p", { class: "muted" });

  function dessiner() {
    const sets = [...new Set(jeu.cartes.map((c) => c.set_id))].sort((a, b) => (S.ordreExt.get(a) ?? 9999) - (S.ordreExt.get(b) ?? 9999));
    const courant = choixExt.value;
    choixExt.replaceChildren(h("option", { value: "" }, "Toutes les extensions (" + sets.length + ")"), ...sets.map((id) => h("option", { value: id }, libelleExt(id))));
    choixExt.value = sets.includes(courant) ? courant : "";

    const total = jeu.cartes.reduce((s, c) => s + Number(c.valeur || 0), 0);
    stats.replaceChildren(...[[jeu.cartes.length, "Cartes uniques"], [euros(total), "Valeur de la collection"], [jeu.joueur.doublons, "Doublons obtenus"], [sets.length, "Extensions"]].map(([v, l]) =>
      h("div", { class: "dash-tuile" }, h("span", {}, v), h("small", {}, l))));

    const q = normalise(recherche.value);
    const liste = jeu.cartes
      .filter((c) => (!choixExt.value || c.set_id === choixExt.value) && (!q || normalise(c.nom).includes(q)))
      .sort(choixTri.value === "valeur" ? (a, b) => Number(b.valeur || 0) - Number(a.valeur || 0) : choixTri.value === "nom" ? (a, b) => a.nom.localeCompare(b.nom, "fr") : (a, b) => b.id - a.id);
    info.textContent = liste.length ? liste.length + " carte(s)" : jeu.cartes.length ? "Aucune carte ne correspond." : "Votre collection de jeu est vide : ouvrez des boosters !";
    grille.replaceChildren(...liste.slice(0, 300).map((c) =>
      h("div", { class: "tuile-carte possedee" },
        h("button", { type: "button", class: "tuile-img", title: "Voir la carte", onclick: () => ouvrirCarte(c.carte_id) },
          c.image ? h("img", { loading: "lazy", alt: c.nom, src: imageCarte(c.image) }) : h("div", { class: "sans-image" }, "Pas d'image")),
        h("div", { class: "tuile-info" },
          h("b", { title: c.nom }, c.nom),
          h("span", { class: "num" }, libelleExt(c.set_id) + " · n° " + c.local_id),
          c.rarete ? h("span", { class: "num" }, c.rarete) : null,
          c.valeur != null ? h("span", { class: "prix" }, euros(c.valeur)) : null)
      )));
  }

  recherche.addEventListener("input", dessiner);
  choixExt.addEventListener("change", dessiner);
  choixTri.addEventListener("change", dessiner);
  corps.replaceChildren(stats, h("div", { class: "filtres" }, recherche, choixExt, choixTri), info, grille);
  dessiner();
}

// Classement entre les joueurs
async function pageClassement(corps) {
  corps.replaceChildren(h("p", { class: "msg" }, "Chargement du classement…"));
  let lignes;
  try {
    lignes = await jeuStock.classement();
  } catch (e) {
    return corps.replaceChildren(h("p", { class: "msg ko" }, "Classement indisponible : " + e.message));
  }
  const medailles = ["🥇", "🥈", "🥉"];
  corps.replaceChildren(
    h("p", { class: "muted" }, "Classés par valeur de leur collection de jeu (Cardmarket, moyenne sur 30 jours)."),
    h("div", { class: "classement" }, lignes.map((l, i) =>
      h("div", { class: "joueur" + (l.user_id === S.moi.id ? " moi" : "") },
        h("span", { class: "rang" }, medailles[i] || i + 1),
        h("div", { class: "joueur-nom" }, h("b", {}, l.nom + (l.user_id === S.moi.id ? " (vous)" : "")), h("small", { class: "muted" }, l.nb_cartes + " cartes uniques · " + l.paquets_total + " boosters ouverts")),
        h("b", { class: "joueur-valeur" }, euros(l.valeur)),
        l.meilleure_nom
          ? h("div", { class: "joueur-meilleure", title: "Meilleure carte : " + l.meilleure_nom },
              l.meilleure_image ? h("img", { src: imageCarte(l.meilleure_image), alt: l.meilleure_nom, loading: "lazy" }) : null,
              h("small", {}, l.meilleure_nom + (l.meilleure_valeur != null ? " · " + euros(l.meilleure_valeur) : "")))
          : null
      ))),
    h("button", { type: "button", class: "ghost", onclick: () => pageClassement(corps) }, "↻ Actualiser")
  );
}

// La fenêtre d'ouverture se ferme : la vue se met à jour
fenetre().addEventListener("close", () => emettre("jeu"));
$("jeu-fermer").addEventListener("click", () => fenetre().close());
