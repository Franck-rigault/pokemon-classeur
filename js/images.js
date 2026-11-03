// Images de cartes : quand une image ne charge pas, on essaie automatiquement d'autres sources avant d'abandonner.
//   1. TCGdex en français (source normale)  2. TCGdex en anglais  3. Scrydex  4. Pokémon TCG API (images.pokemontcg.io,
//   qui renvoie un dos de carte quand la carte est inconnue : c'est donc la dernière source)
// Un seul écouteur (en phase de capture) sert toute l'application : aucune vue n'a besoin de s'en occuper.

import { S } from "./etat.js";

const RE_LOGO = /^https:\/\/assets\.tcgdex\.net\/(\w+)\/([^/]+)\/([^/]+)\/logo\.(?:webp|png)$/;
const RE_TCGDEX = /^https:\/\/assets\.tcgdex\.net\/(\w+)\/([^/]+)\/([^/]+)\/([^/]+)\/(low|high)\.(?:webp|png|jpg)$/;
const RE_PTCG = /^https:\/\/images\.pokemontcg\.io\/([^/]+)\/([^/_.]+)(_hires)?\.png$/;
const RE_SCRYDEX = /^https:\/\/images\.scrydex\.com\/pokemon\/([^/]+)-([^/-]+)\/(small|large)$/;

// Identifiants de l'API Pokémon TCG : « sv03.5 » devient « sv3pt5 », « 018 » devient « 18 »
export const idExtensionPtcg = (setId) => String(setId).toLowerCase().replace(/\./g, "pt").replace(/^([a-z]+)0+(\d)/, "$1$2");
export const numeroPtcg = (localId) => (/^\d+$/.test(localId) ? String(parseInt(localId, 10)) : String(localId));

// Adresse de base d'une carte sur Scrydex (utile quand TCGdex n'a aucune image pour la carte)
export const imageSecours = (setId, localId) =>
  setId && localId ? "https://images.scrydex.com/pokemon/" + idExtensionPtcg(setId) + "-" + numeroPtcg(localId) : null;

// Une adresse de secours ne doit jamais être enregistrée comme « vraie » image de la carte
export const imageReelle = (image) => (image && !/images\.(pokemontcg\.io|scrydex\.com)/.test(image) ? image : null);

const versPtcg = (set, num, haute) => "https://images.pokemontcg.io/" + set + "/" + num + (haute ? "_hires" : "") + ".png";
const versScrydex = (set, num, haute) => "https://images.scrydex.com/pokemon/" + set + "-" + num + "/" + (haute ? "large" : "small");

// Code de l'extension en minuscules (ex. « 30c ») : Scrydex s'en sert pour les extensions récentes ou spéciales
const codeExtension = (fait) => {
  const e = S.extensions.find((x) => idExtensionPtcg(x.id) === fait || x.id === fait);
  const code = e && e.code ? e.code.toLowerCase() : null;
  return code && code !== fait ? code : null;
};

// Autres adresses à essayer pour une image, dans l'ordre
export function alternatives(url) {
  let m = RE_LOGO.exec(url);
  if (m) return m[1] !== "en" ? ["https://assets.tcgdex.net/en/" + m[2] + "/" + m[3] + "/logo.webp"] : []; // les logos récents existent parfois seulement en anglais
  m = RE_TCGDEX.exec(url);
  if (m) {
    const [, langue, serie, ext, num, taille] = m;
    const haute = taille === "high";
    const set = idExtensionPtcg(ext), n = numeroPtcg(num);
    const liste = [];
    if (langue !== "en") liste.push("https://assets.tcgdex.net/en/" + serie + "/" + ext + "/" + num + "/" + taille + ".webp");
    const code = codeExtension(set);
    liste.push(versScrydex(set, n, haute));
    if (code) liste.push(versScrydex(code, n, haute));
    liste.push(versPtcg(set, n, haute));
    return liste;
  }
  m = RE_SCRYDEX.exec(url);
  if (m) {
    const code = codeExtension(m[1]);
    return [...(code ? [versScrydex(code, m[2], m[3] === "large")] : []), versPtcg(m[1], m[2], m[3] === "large")];
  }
  return [];
}

// Image de remplacement quand plus aucune source ne répond (dos de carte)
export const IMAGE_ABSENTE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 245 342"><rect width="245" height="342" rx="14" fill="#2a3068"/>' +
      '<rect x="10" y="10" width="225" height="322" rx="9" fill="none" stroke="#8d96c9" stroke-width="3" stroke-dasharray="8 6"/>' +
      '<circle cx="122" cy="150" r="38" fill="none" stroke="#8d96c9" stroke-width="5"/><path d="M84 150h76" stroke="#8d96c9" stroke-width="5"/>' +
      '<circle cx="122" cy="150" r="11" fill="#2a3068" stroke="#8d96c9" stroke-width="5"/>' +
      '<text x="122" y="240" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#c9cff0">Image</text>' +
      '<text x="122" y="264" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#c9cff0">indisponible</text></svg>'
  );

const FINIES = new WeakSet();

function surErreur(ev) {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement) || FINIES.has(img) || img.src === IMAGE_ABSENTE) return;
  if (!img._secours) img._secours = alternatives(img.getAttribute("src") || img.src);
  const suivante = img._secours.shift();
  if (suivante) {
    ev.stopImmediatePropagation(); // la vue ne doit pas déclarer « Pas d'image » tant qu'il reste des sources à essayer
    img.src = suivante;
    return;
  }
  // Plus aucune source : la vue peut afficher son propre message ; sinon on met un dos de carte
  FINIES.add(img);
  setTimeout(() => {
    if (img.isConnected) {
      img.classList.add("image-absente");
      img.src = IMAGE_ABSENTE;
    }
  }, 0);
}

document.addEventListener("error", surErreur, true);

// Quand elles ne connaissent pas une carte, Scrydex et la Pokémon TCG API répondent « 200 » avec un dos de carte,
// toujours de ces tailles (les vraies images font 245 × 342 ou 733 × 1024) : on passe à la source suivante, puis à notre image de remplacement.
const TAILLES_DOS = new Set(["640x892", "245x341", "367x511"]);
document.addEventListener("load", (ev) => {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement) || FINIES.has(img) || !TAILLES_DOS.has(img.naturalWidth + "x" + img.naturalHeight)) return;
  if (!/^https:\/\/images\.(scrydex\.com|pokemontcg\.io)\//.test(img.src)) return;
  if (!img._secours) img._secours = alternatives(img.src);
  const suivante = img._secours.shift();
  if (suivante) {
    img.src = suivante;
    return;
  }
  FINIES.add(img);
  img.classList.add("image-absente");
  img.src = IMAGE_ABSENTE;
}, true);
