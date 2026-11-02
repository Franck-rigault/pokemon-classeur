// Scanner de cartes : caméra (ou photo) -> lecture du texte (OCR) -> carte exacte TCGdex -> collection.
import { $, h, normalise, echapper, euros, essayer, message, cartesDExtension, cartesParNom, chercherCartes, detailCarte, variantesDe, imageCarte, libelleExt, ETATS, prixDe, fermerAuFond } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";

const TESSERACT_SRC = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js";
const RATIO_CARTE = 63 / 88; // largeur / hauteur d'une carte Pokémon
const HAUTEUR_GUIDE = 0.9; // part de la hauteur de l'image occupée par le cadre de visée

let fluxCamera = null;
let moteur = null;
let analyseEnCours = false;
let attenteChoix = false; // vrai tant que l'utilisateur doit choisir une carte (la lecture continue est alors en pause)
let derniereAuto = { id: null, t: 0 };

const video = $("scan-video");
const continu = () => $("scan-continu").checked;

function info(texte, type = "") {
  const el = $("scan-info");
  el.textContent = texte;
  el.className = "msg " + type;
}

// ---------- Moteur de lecture (Tesseract, chargé à la demande) ----------

function chargerScript(src) {
  return new Promise((ok, ko) => {
    if (window.Tesseract) return ok();
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error("moteur de lecture indisponible (connexion ?)"));
    document.head.append(s);
  });
}

async function moteurOcr() {
  if (moteur) return moteur;
  info("Chargement du moteur de lecture (première fois seulement)…");
  await chargerScript(TESSERACT_SRC);
  moteur = await window.Tesseract.createWorker("fra", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") info("Lecture du texte… " + Math.round(m.progress * 100) + " %");
    },
  });
  return moteur;
}

async function lire(canvas, psm) {
  const w = await moteurOcr();
  await w.setParameters({ tessedit_pageseg_mode: psm });
  const { data } = await w.recognize(canvas);
  return data.text || "";
}

// ---------- Traitement d'image ----------

function copieCanvas(source, sx, sy, sw, sh, W, H) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(W));
  c.height = Math.max(1, Math.round(H));
  c.getContext("2d").drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

// Niveaux de gris + étirement du contraste : aide la lecture sur les fonds colorés
function niveler(c) {
  const ctx = c.getContext("2d");
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const k = 255 / Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = (d[i] - min) * k;
  ctx.putImageData(img, 0, 0);
  return c;
}

// Découpe une zone (en fractions de la carte) et l'agrandit pour la lecture
function bande(carte, x0, y0, x1, y1, facteur = 2) {
  const w = carte.width, h2 = carte.height;
  const sw = (x1 - x0) * w, sh = (y1 - y0) * h2;
  return niveler(copieCanvas(carte, x0 * w, y0 * h2, sw, sh, sw * facteur, sh * facteur));
}

// ---------- Interprétation du texte lu ----------

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prec = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cour = [i];
    for (let j = 1; j <= n; j++) {
      cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prec = cour;
  }
  return prec[n];
}

const nomsPokemon = () =>
  S.pokemon
    .map((p) => ({ nom: p.nom, n: normalise(p.nom) }))
    .filter((x) => x.n.length >= 3)
    .sort((a, b) => b.n.length - a.n.length); // les noms longs d'abord : « Mewtwo » avant « Mew »

// Trouve le Pokémon cité dans un texte ; `flou` tolère 1-2 lettres mal lues (zone du nom seulement)
function trouverNom(texte, flou) {
  const t = normalise(texte);
  const noms = nomsPokemon();
  for (const x of noms) {
    if (!t.includes(x.n)) continue;
    const mot = new RegExp("(?<![\\p{L}\\p{N}])" + echapper(x.n) + "(?![\\p{L}\\p{N}])", "u");
    if (mot.test(t)) return x.nom;
  }
  if (!flou) return null;

  const mots = t.split(/[^\p{L}]+/u).filter((m) => m.length >= 4);
  let meilleur = null;
  for (const m of mots) {
    for (const x of noms) {
      if (x.n.length < 4 || Math.abs(x.n.length - m.length) > 2) continue;
      const d = levenshtein(m, x.n);
      const tolere = x.n.length >= 8 ? 2 : 1;
      if (d <= tolere && (!meilleur || d < meilleur.d || (d === meilleur.d && x.n.length > meilleur.x.n.length))) {
        meilleur = { x, d };
      }
    }
  }
  return meilleur ? meilleur.x.nom : null;
}

// Cherche « 018/091 » (le O lu à la place du 0, le l à la place du 1 sont corrigés)
function trouverNumero(texte) {
  const t = texte.replace(/[\r\n]+/g, " ");
  const re = /([0-9OoIl]{1,3})\s*[/\\|]\s*([0-9OoIl]{2,3})/g;
  const nombre = (s) => parseInt(s.replace(/[Oo]/g, "0").replace(/[Il]/g, "1"), 10);
  // les cartes « secrètes » ont un numéro supérieur au total de l'extension
  const plausible = (num, total) => num > 0 && total >= 10 && num <= total + 150;
  let m;
  while ((m = re.exec(t))) {
    const num = nombre(m[1]), total = nombre(m[2]);
    if (plausible(num, total)) return { num, total };
  }
  // Le « / » est parfois lu comme un chiffre (« 063/193 » -> « 0634193 ») ou un signe
  const colle = /(?<![0-9])([0-9]{3})[^0-9\s]?[0-9]?([0-9]{3})(?![0-9])/g;
  while ((m = colle.exec(t))) {
    const num = nombre(m[1]), total = nombre(m[2]);
    if (plausible(num, total)) return { num, total };
  }
  return null;
}

// Code d'extension imprimé en bas de la carte (ex. PAF, SVI) : permet d'identifier aussi Dresseurs et Énergies
function trouverExtension(texte, numero) {
  if (!numero) return null;
  const jetons = new Set((texte.toUpperCase().match(/[A-Z0-9]{2,5}/g) || []));
  const candidates = S.extensions
    .filter((e) => e.code && jetons.has(e.code.toUpperCase()) && e.officiel === numero.total)
    .sort((a, b) => (S.ordreExt.get(a.id) ?? 9999) - (S.ordreExt.get(b.id) ?? 9999));
  return candidates[0] || null;
}

async function analyser(carte) {
  info("Lecture du nom…");
  const texteNom = await lire(bande(carte, 0.04, 0.02, 0.8, 0.14), "7");
  info("Lecture du numéro…");
  const texteBas = await lire(bande(carte, 0, 0.88, 1, 1), "6");

  let nom = trouverNom(texteNom, true);
  let numero = trouverNumero(texteBas);
  let ext = trouverExtension(texteBas, numero);
  let texteComplet = "";

  if (!numero || (!nom && !ext)) {
    info("Lecture de la carte entière…");
    const entier = niveler(copieCanvas(carte, 0, 0, carte.width, carte.height, carte.width, carte.height));
    texteComplet = await lire(entier, "11");
    if (!nom) nom = trouverNom(texteComplet, false);
    if (!numero) numero = trouverNumero(texteComplet);
    if (!ext) ext = trouverExtension(texteBas + " " + texteComplet, numero);
  }
  return { nom, numero, ext, texteNom, lu: [texteNom, texteBas, texteComplet].join(" ").replace(/\s+/g, " ").trim() };
}

// Mot le plus probable du nom de la carte quand aucun Pokémon n'est reconnu (Dresseur, Énergie…)
const MOTS_INUTILES = new Set(["base", "niveau", "stade", "phase", "objet", "dresseur", "soutien", "pokemon", "outil", "supporter"]);
function devinerNom(texte) {
  const mots = normalise(texte).split(/[^\p{L}]+/u).filter((m) => m.length >= 4 && !MOTS_INUTILES.has(m));
  return mots.length ? mots[0] : null;
}

// ---------- Recherche de la carte exacte ----------

function viderResultats() {
  $("scan-resultat").replaceChildren();
  $("scan-resultat").classList.remove("confirmation");
  attenteChoix = false;
}

// Mode continu : relit une carte quelques secondes plus tard, tant que rien n'attend l'utilisateur
function boucle() {
  if (!continu() || !$("scan").open || analyseEnCours || attenteChoix || !video.videoWidth) return;
  lancerAnalyse(carteDepuisCamera());
}
const relancerSiContinu = (delai = 2200) => { if (continu()) setTimeout(boucle, delai); };

// Ajout automatique d'une carte reconnue sans ambiguïté (1re variante disponible, état Neuf), annulable
async function ajoutAuto(k) {
  if (derniereAuto.id === k.id && Date.now() - derniereAuto.t < 10000) return info("« " + k.name + " » vient d'être ajoutée : présentez une autre carte.");
  const d = await detailCarte(k.id);
  const ligne = await D.ajouterCarte(d, { variante: variantesDe(d)[0], etat: "Neuf" });
  derniereAuto = { id: k.id, t: Date.now() };
  const texte = "✔ " + d.name + " ajoutée (" + libelleExt(d.set.id) + ", n° " + d.localId + ")";
  message(texte, "ok");
  info(texte, "ok");
  const annuler = h("button", {
    type: "button", class: "ghost",
    onclick: () => essayer(async () => {
      await D.changerQuantite(ligne, ligne.quantite - 1);
      derniereAuto = { id: null, t: 0 };
      annuler.remove();
      info("Ajout annulé.");
    }),
  }, "↩ Annuler cet ajout");
  $("scan-resultat").replaceChildren(annuler);
}

function tuile(k, auClic) {
  return h("button", { type: "button", class: "tuile", onclick: () => auClic(k) },
    k.image ? h("img", { loading: "lazy", alt: k.name, src: imageCarte(k.image), onerror: (ev) => ev.target.replaceWith(h("div", { class: "sans-image" }, "Pas d'image")) }) : h("div", { class: "sans-image" }, "Pas d'image"),
    h("span", {}, k.name + " · " + libelleExt(k.set_id) + " · n° " + k.localId)
  );
}

// Détermine les cartes candidates à partir de l'extension et/ou du nom, et du numéro lu
async function candidates(recherche) {
  const { nom, numero, ext } = recherche;
  const num = numero ? numero.num : null;

  if (ext && num) {
    const { cartes } = await cartesDExtension(ext.id);
    const trouvees = cartes.filter((k) => parseInt(k.localId, 10) === num);
    if (trouvees.length === 1) return { liste: trouvees, toutes: null, sure: true };
  }

  if (nom) {
    const toutes = await cartesParNom(nom);
    let liste = num ? toutes.filter((k) => parseInt(k.localId, 10) === num) : [];
    if (liste.length > 1 && numero.total) {
      // Plusieurs extensions ont ce numéro : le total imprimé sur la carte (ex. /091) les départage
      const sous = liste.slice(0, 20);
      const details = await Promise.all(sous.map((k) => detailCarte(k.id).catch(() => null)));
      const bonnes = sous.filter((k, i) => details[i] && details[i].set.cardCount && details[i].set.cardCount.official === numero.total);
      if (bonnes.length) liste = bonnes;
    }
    return { liste, toutes, sure: false };
  }
  // Ni nom ni code lus (carte Dresseur/Énergie, texte illisible) : on cherche ce numéro dans les extensions de même taille
  if (num && numero.total) {
    const sets = S.extensions.filter((e) => e.officiel === numero.total).slice(0, 8);
    const trouvees = [];
    await Promise.all(sets.map(async (e) => {
      try {
        const { cartes } = await cartesDExtension(e.id);
        trouvees.push(...cartes.filter((k) => parseInt(k.localId, 10) === num));
      } catch {
        // une extension indisponible n'empêche pas les autres
      }
    }));
    trouvees.sort((a, b) => (S.ordreExt.get(a.set_id) ?? 9999) - (S.ordreExt.get(b.set_id) ?? 9999));
    if (trouvees.length) return { liste: trouvees, toutes: null, sure: false };
  }

  // Dernier recours : chercher le mot le plus probable du nom lu (ex. « Énergie »), puis filtrer par numéro
  const devine = recherche.texteNom ? devinerNom(recherche.texteNom) : null;
  if (devine) {
    let liste = await chercherCartes(devine);
    if (num) {
      const memeNumero = liste.filter((k) => parseInt(k.localId, 10) === num);
      if (memeNumero.length) liste = memeNumero;
    }
    return { liste: liste.slice(0, 60), toutes: null, sure: false, devine };
  }
  return { liste: [], toutes: null, sure: false };
}

// Ferme le scanner et ouvre la recherche par nom
function versRecherche(texte) {
  $("scan").close();
  location.hash = "#/recherche/" + encodeURIComponent(texte || "");
}

async function rechercher(recherche) {
  viderResultats();
  info("Recherche de la carte…");
  const { liste, toutes, devine } = await candidates(recherche);
  const zone = $("scan-resultat");

  // Mode continu : une seule carte possible et lecture complète (numéro + nom ou extension) -> ajout automatique
  if (continu() && liste.length === 1 && !devine && recherche.numero && (recherche.nom || recherche.ext)) {
    return ajoutAuto(liste[0]);
  }
  attenteChoix = true;
  if (liste.length === 1) {
    info("Trouvé : est-ce la bonne carte ?", "ok");
    return afficherConfirmation(liste[0], toutes);
  }
  if (liste.length > 1) {
    info(
      devine
        ? "Nom lu approximativement (« " + devine + " ») : " + liste.length + " cartes proposées, touchez la vôtre, ou utilisez la recherche par nom."
        : liste.length + " cartes correspondent : touchez la vôtre."
    );
    if (devine) zone.append(h("button", { type: "button", class: "ghost pleine-ligne", onclick: () => versRecherche(devine) }, "🔎 Voir toutes les cartes « " + devine + " »"));
    return zone.append(...liste.map((k) => tuile(k, confirmer(toutes))));
  }
  if (toutes && toutes.length) {
    info((recherche.numero ? "Numéro " + recherche.numero.num + " introuvable" : "Numéro non lu") + " : voici toutes les cartes « " + recherche.nom + " », touchez la vôtre.");
    return zone.append(...toutes.map((k) => tuile(k, confirmer(toutes))));
  }
  info("Aucune carte trouvée. Corrigez le nom, le numéro ou le code d'extension ci-dessous.", "ko");
  $("scan-manuel").parentElement.open = true;
}

const confirmer = (toutes) => (k) => {
  viderResultats();
  afficherConfirmation(k, toutes);
};

async function afficherConfirmation(k, toutes) {
  const zone = $("scan-resultat");
  zone.classList.add("confirmation");
  zone.replaceChildren(h("p", { class: "msg" }, "Chargement de la carte…"));

  let d;
  try {
    d = await detailCarte(k.id);
  } catch (err) {
    zone.classList.remove("confirmation");
    return info("Carte indisponible : " + err.message, "ko");
  }
  const prix = prixDe(d);
  const variante = h("select", { "aria-label": "Variante" }, variantesDe(d).map((v) => h("option", { value: v }, v)));
  const etat = h("select", { "aria-label": "État" }, ETATS.map((e) => h("option", { value: e }, e)));

  const ok = h("button", {
    type: "button",
    onclick: () => essayer(async () => {
      ok.disabled = true;
      await D.ajouterCarte(d, { variante: variante.value, etat: etat.value });
      const texte = "✔ " + d.name + " ajoutée (" + libelleExt(d.set.id) + ", n° " + d.localId + (prix !== null ? " · " + euros(prix) : "") + ")";
      viderResultats();
      info(texte + ". Carte suivante !", "ok");
      message(texte, "ok");
      relancerSiContinu(1500);
    }),
  }, "✔ Ajouter à ma collection");

  const autre = toutes && toutes.length > 1
    ? h("button", { type: "button", class: "ghost", onclick: () => { viderResultats(); info("Touchez votre carte dans la liste."); $("scan-resultat").append(...toutes.map((c) => tuile(c, confirmer(toutes)))); } }, "Ce n'est pas elle")
    : h("button", { type: "button", class: "ghost", onclick: () => { viderResultats(); info(""); } }, "Ce n'est pas elle");

  zone.replaceChildren(
    h("div", { class: "tuile" },
      d.image ? h("img", { src: imageCarte(d.image), alt: d.name }) : h("div", { class: "sans-image" }, "Pas d'image"),
      h("span", {}, d.name + " · " + libelleExt(d.set.id) + " · n° " + d.localId)
    ),
    h("div", { class: "scan-confirm-actions" }, h("div", { class: "row tools" }, variante, etat), ok, autre)
  );
}

// ---------- Caméra ----------

function arreterCamera() {
  if (fluxCamera) fluxCamera.getTracks().forEach((t) => t.stop());
  fluxCamera = null;
  video.srcObject = null;
}

function ajusterGuide() {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  const gw = Math.min(0.95, (HAUTEUR_GUIDE * vh * RATIO_CARTE) / vw);
  const cadre = $("scan-cadre");
  cadre.style.aspectRatio = vw + " / " + vh;
  // hauteur limitée à 55 % de l'écran : on réduit la largeur pour garder le même ratio que la caméra
  cadre.style.width = "min(100%, " + 55 * (vw / vh) + "vh)";
  const g = $("scan-guide");
  g.style.left = ((1 - gw) / 2) * 100 + "%";
  g.style.width = gw * 100 + "%";
  g.style.top = ((1 - HAUTEUR_GUIDE) / 2) * 100 + "%";
  g.style.height = HAUTEUR_GUIDE * 100 + "%";
}

video.addEventListener("loadedmetadata", ajusterGuide);

async function demarrerCamera() {
  arreterCamera();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return info("Caméra non disponible sur cette page : utilisez « Photo / image ».", "ko");
  }
  try {
    fluxCamera = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    video.srcObject = fluxCamera;
    await video.play();
    info("Caméra prête. Cadrez la carte puis appuyez sur « Lire la carte ».");
  } catch (err) {
    info("Caméra inaccessible (" + err.message + "). Autorisez-la, ou utilisez « Photo / image ».", "ko");
  }
}

function carteDepuisCamera() {
  const vw = video.videoWidth, vh = video.videoHeight;
  const gw = Math.min(0.95, (HAUTEUR_GUIDE * vh * RATIO_CARTE) / vw);
  const sw = gw * vw, sh = HAUTEUR_GUIDE * vh;
  const H = 1400;
  return copieCanvas(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, H * (sw / sh), H);
}

async function lancerAnalyse(carteCanvas) {
  if (analyseEnCours) return;
  analyseEnCours = true;
  $("scan-capture").disabled = true;
  viderResultats();
  try {
    const lecture = await analyser(carteCanvas);
    $("scan-nom").value = lecture.nom || "";
    $("scan-num").value = lecture.numero ? lecture.numero.num + "/" + lecture.numero.total : "";
    $("scan-ext").value = lecture.ext ? lecture.ext.code : "";
    if (!lecture.nom && !lecture.ext && !lecture.numero) {
      if (continu()) return info("En attente d'une carte : présentez-la bien à plat, entière dans le cadre.");
      info("Carte non reconnue : approchez-la pour qu'elle remplisse le cadre, évitez les reflets, ou cherchez-la par son nom.", "ko");
      $("scan-resultat").append(h("button", { type: "button", onclick: () => versRecherche(devinerNom(lecture.texteNom) || "") }, "🔎 Chercher par nom"));
      $("scan-manuel").parentElement.open = true;
      return;
    }
    await rechercher(lecture);
  } catch (err) {
    info("Échec de la lecture : " + err.message, "ko");
  } finally {
    analyseEnCours = false;
    $("scan-capture").disabled = false;
    if (!attenteChoix) relancerSiContinu();
  }
}

$("scan-continu").addEventListener("change", () => {
  if (continu()) {
    info("Mode continu : présentez les cartes une par une devant la caméra.");
    relancerSiContinu(500);
  }
});

// ---------- Branchements ----------

export function ouvrirScan() {
  const dl = $("noms-pokemon");
  if (!dl.children.length) S.pokemon.forEach((p) => dl.append(new Option(p.nom, p.nom)));
  viderResultats();
  info("");
  $("scan").showModal();
  demarrerCamera();
}

$("scan-close").addEventListener("click", () => $("scan").close());
$("scan").addEventListener("close", arreterCamera);
fermerAuFond($("scan"));

$("scan-capture").addEventListener("click", () => {
  if (!video.videoWidth) return info("La caméra n'est pas prête.", "ko");
  lancerAnalyse(carteDepuisCamera());
});

$("scan-fichier").addEventListener("change", async (e) => {
  const fichier = e.target.files[0];
  e.target.value = "";
  if (!fichier) return;
  try {
    const image = await createImageBitmap(fichier);
    const H = 1400;
    lancerAnalyse(copieCanvas(image, 0, 0, image.width, image.height, H * (image.width / image.height), H));
  } catch {
    info("Impossible de lire cette image.", "ko");
  }
});

$("scan-manuel").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nom = $("scan-nom").value.trim();
  const m = /(\d{1,3})(?:\s*[/\\]\s*(\d{1,3}))?/.exec($("scan-num").value);
  const numero = m ? { num: parseInt(m[1], 10), total: m[2] ? parseInt(m[2], 10) : null } : null;
  const code = $("scan-ext").value.trim().toUpperCase();
  const ext = code ? S.extensions.find((x) => x.code && x.code.toUpperCase() === code) || null : null;
  if (code && !ext) return info("Code d'extension inconnu : " + code, "ko");
  if (!nom && !(ext && numero)) return info("Indiquez un nom, ou un code d'extension avec un numéro.", "ko");
  try {
    await rechercher({ nom: nom || null, numero, ext });
  } catch (err) {
    info("Échec : " + err.message, "ko");
  }
});
