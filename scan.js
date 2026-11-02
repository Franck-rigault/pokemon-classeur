// Scanner de cartes : caméra (ou photo) -> lecture du texte (OCR) -> carte exacte TCGdex.
// Chargé après app.js : il utilise ses variables globales (cartes, cartesDe, detailCarte, appliquerCarte…).

const TESSERACT_SRC = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js";
const RATIO_CARTE = 63 / 88; // largeur / hauteur d'une carte Pokémon
const HAUTEUR_GUIDE = 0.9; // part de la hauteur de l'image occupée par le cadre de visée

let fluxCamera = null;
let moteur = null;
let analyseEnCours = false;

const video = $("scan-video");

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
  moteur = await Tesseract.createWorker("fra", 1, {
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
  const w = carte.width, h = carte.height;
  const sw = (x1 - x0) * w, sh = (y1 - y0) * h;
  return niveler(copieCanvas(carte, x0 * w, y0 * h, sw, sh, sw * facteur, sh * facteur));
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
  cartes
    .map((c) => ({ c, n: normalise(c.nom) }))
    .filter((x) => x.n.length >= 3)
    .sort((a, b) => b.n.length - a.n.length); // les noms longs d'abord : « Mewtwo » avant « Mew »

// Trouve le Pokémon cité dans un texte ; `flou` tolère 1-2 lettres mal lues (zone du nom seulement)
function trouverNom(texte, flou) {
  const t = normalise(texte);
  for (const x of nomsPokemon()) {
    if (!t.includes(x.n)) continue;
    const mot = new RegExp("(?<![\\p{L}\\p{N}])" + echapper(x.n) + "(?![\\p{L}\\p{N}])", "u");
    if (mot.test(t)) return x.c;
  }
  if (!flou) return null;

  const mots = t.split(/[^\p{L}]+/u).filter((m) => m.length >= 4);
  let meilleur = null;
  for (const m of mots) {
    for (const x of nomsPokemon()) {
      if (x.n.length < 4 || Math.abs(x.n.length - m.length) > 2) continue;
      const d = levenshtein(m, x.n);
      const tolere = x.n.length >= 8 ? 2 : 1;
      if (d <= tolere && (!meilleur || d < meilleur.d || (d === meilleur.d && x.n.length > meilleur.x.n.length))) {
        meilleur = { x, d };
      }
    }
  }
  return meilleur ? meilleur.x.c : null;
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
  // Le « / » est parfois lu comme un chiffre (« 063/193 » -> « 0634193 ») ou un signe : 3 chiffres, 1 caractère, 3 chiffres
  const colle = /(?<![0-9])([0-9]{3})[^0-9\s]?[0-9]?([0-9]{3})(?![0-9])/g;
  while ((m = colle.exec(t))) {
    const num = nombre(m[1]), total = nombre(m[2]);
    if (plausible(num, total)) return { num, total };
  }
  return null;
}

async function analyser(carte) {
  info("Lecture du nom…");
  const texteNom = await lire(bande(carte, 0.04, 0.02, 0.8, 0.14), "7");
  info("Lecture du numéro…");
  const texteBas = await lire(bande(carte, 0, 0.88, 1, 1), "6");

  let pokemon = trouverNom(texteNom, true);
  let numero = trouverNumero(texteBas);
  let texteComplet = "";

  if (!pokemon || !numero) {
    info("Lecture de la carte entière…");
    const entier = niveler(copieCanvas(carte, 0, 0, carte.width, carte.height, carte.width, carte.height));
    texteComplet = await lire(entier, "11");
    if (!pokemon) pokemon = trouverNom(texteComplet, false);
    if (!numero) numero = trouverNumero(texteComplet);
  }
  return { pokemon, numero, lu: [texteNom, texteBas, texteComplet].join(" ").replace(/\s+/g, " ").trim() };
}

// ---------- Recherche de la carte exacte ----------

function viderResultats() {
  $("scan-resultat").textContent = "";
  $("scan-resultat").classList.remove("confirmation");
}

async function rechercher(ligne, numero) {
  info("Recherche des cartes de " + ligne.nom + "…");
  viderResultats();
  const toutes = await cartesDe(ligne.nom);

  let candidates = numero ? toutes.filter((k) => parseInt(k.localId, 10) === numero.num) : [];
  if (candidates.length > 1 && numero.total) {
    // Plusieurs extensions ont ce numéro : le total imprimé sur la carte (ex. /091) les départage
    const sous = candidates.slice(0, 20);
    const details = await Promise.all(sous.map((k) => detailCarte(k.id).catch(() => null)));
    const bonnes = sous.filter((k, i) => details[i] && details[i].set.cardCount && details[i].set.cardCount.official === numero.total);
    if (bonnes.length) candidates = bonnes;
  }

  const zone = $("scan-resultat");
  if (candidates.length === 1) {
    info("Trouvé : est-ce la bonne carte ?", "ok");
    return afficherConfirmation(ligne, candidates[0], toutes);
  }
  if (candidates.length > 1) {
    info(candidates.length + " cartes correspondent : touchez la vôtre.");
    candidates.forEach((k) => zone.append(creerTuile(k, k.id === ligne.carte_id, (c) => valider(ligne, c))));
    return;
  }
  info(
    (numero ? "Numéro " + numero.num + " introuvable pour " + ligne.nom : "Numéro non lu") +
      " : voici toutes ses cartes, touchez la vôtre.",
    ""
  );
  toutes.forEach((k) => zone.append(creerTuile(k, k.id === ligne.carte_id, (c) => valider(ligne, c))));
}

function afficherConfirmation(ligne, k, toutes) {
  const zone = $("scan-resultat");
  zone.classList.add("confirmation");
  zone.append(creerTuile(k, false, () => {}));

  const actions = document.createElement("div");
  actions.className = "scan-confirm-actions";
  const ok = document.createElement("button");
  ok.type = "button";
  ok.textContent = "✔ Ajouter à ma collection";
  ok.addEventListener("click", () => valider(ligne, k));
  const autre = document.createElement("button");
  autre.type = "button";
  autre.className = "ghost";
  autre.textContent = "Ce n'est pas elle";
  autre.addEventListener("click", () => {
    viderResultats();
    info("Touchez votre carte dans la liste de " + ligne.nom + ".");
    toutes.forEach((c) => zone.append(creerTuile(c, c.id === ligne.carte_id, (x) => valider(ligne, x))));
  });
  actions.append(ok, autre);
  zone.append(actions);
}

async function valider(ligne, k) {
  if (ligne.carte_id && ligne.carte_id !== k.id && !confirm(ligne.nom + " a déjà une carte enregistrée. La remplacer ?")) return;
  info("Enregistrement…");
  try {
    const { d, ext, prix } = await appliquerCarte(ligne, k.id, { possede: true });
    viderResultats();
    const texte =
      "✔ " + ligne.nom + " ajouté : " + (ext ? ext.label : d.set.name) + ", n° " + d.localId +
      (prix !== null ? " · " + euros(prix) : "");
    info(texte + ". Carte suivante !", "ok");
    message(texte, "ok");
  } catch (err) {
    info("Échec : " + err.message, "ko");
  }
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
    const { pokemon, numero, lu } = await analyser(carteCanvas);
    if (!pokemon) {
      info(
        "Nom non reconnu (carte Dresseur/Énergie, reflet ou image floue ?). Texte lu : « " + lu.slice(0, 90) +
          " ». Saisissez le nom ci-dessous.",
        "ko"
      );
      $("scan-manuel").parentElement.open = true;
      if (numero) $("scan-num").value = numero.num + "/" + numero.total;
      return;
    }
    $("scan-nom").value = pokemon.nom;
    $("scan-num").value = numero ? numero.num + "/" + numero.total : "";
    await rechercher(pokemon, numero);
  } catch (err) {
    info("Échec de la lecture : " + err.message, "ko");
  } finally {
    analyseEnCours = false;
    $("scan-capture").disabled = false;
  }
}

// ---------- Branchements ----------

$("btn-scan").addEventListener("click", () => {
  const dl = $("noms-pokemon");
  if (!dl.children.length) cartes.forEach((c) => dl.append(new Option(c.nom, c.nom)));
  viderResultats();
  info("");
  $("scan").showModal();
  demarrerCamera();
});

$("scan-close").addEventListener("click", () => $("scan").close());
$("scan").addEventListener("close", arreterCamera);

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
  const ligne = cartes.find((c) => normalise(c.nom) === normalise($("scan-nom").value));
  if (!ligne) return info("Pokémon inconnu : " + $("scan-nom").value, "ko");
  const m = /(\d{1,3})(?:\s*[/\\]\s*(\d{1,3}))?/.exec($("scan-num").value);
  try {
    await rechercher(ligne, m ? { num: parseInt(m[1], 10), total: m[2] ? parseInt(m[2], 10) : null } : null);
  } catch (err) {
    info("Échec : " + err.message, "ko");
  }
});
