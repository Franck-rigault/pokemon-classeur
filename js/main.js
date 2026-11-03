// Point d'entrée : connexion, comptes, navigation par onglets, choix de la collection affichée.
import "./images.js";
import { $, db, h, chargerReferentiels, message, essayer } from "./api.js";
import { S, evenements, emettre } from "./etat.js";
import * as HL from "./horsligne.js";
import * as D from "./donnees.js";
import { vueExtensions } from "./vue-extensions.js";
import { vueRecherche } from "./vue-recherche.js";
import { vueCartes } from "./vue-cartes.js";
import { vueWishlist } from "./vue-wishlist.js";
import { vueDashboard } from "./vue-dashboard.js";
import { vueClasseur } from "./vue-classeur.js";
import { vueClasseurs } from "./vue-classeurs.js";
import { vueJeu } from "./jeu.js";
import { vueProduits } from "./vue-produits.js";
import { ouvrirImport } from "./import.js";
import "./dialogue-carte.js";
import { ouvrirScan } from "./scan.js";
import { ouvrirPartage } from "./partage.js";
import { exporterCsv } from "./export.js";
import { appliquerTheme, basculerTheme, libelleTheme } from "./theme.js";
import { ouvrirSauvegarde } from "./sauvegarde.js";
import { vueFavoris } from "./vue-favoris.js";
import { vueDoublons } from "./vue-doublons.js";
import { vueObjectifs } from "./vue-objectifs.js";
import { ouvrirRechercheGlobale } from "./recherche-globale.js";
import { ouvrirPartageImage } from "./partage-image.js";
import { ouvrirSante } from "./sante.js";
import { ouvrirAcces } from "./acces.js";
import { ouvrirJournal, envoyer as envoyerJournal } from "./journal.js";
import { oublierPrefs } from "./prefs.js";

const JETON_PARTAGE = new URLSearchParams(location.search).get("partage");
const VUES = {
  extensions: vueExtensions, recherche: vueRecherche, cartes: vueCartes, wishlist: vueWishlist,
  classeurs: vueClasseurs, scelles: vueProduits, jeu: vueJeu, dashboard: vueDashboard, classeur: vueClasseur,
  favoris: vueFavoris, doublons: vueDoublons, objectifs: vueObjectifs,
};
const ONGLETS = [
  ["extensions", "📚 Extensions"],
  ["recherche", "🔎 Rechercher"],
  ["cartes", "🃏 Mes cartes"],
  ["favoris", "⭐ Coups de cœur"],
  ["doublons", "🔁 Doublons"],
  ["objectifs", "🎯 Objectifs"],
  ["wishlist", "❤ Wishlist"],
  ["classeurs", "📘 Mes classeurs"],
  ["scelles", "📦 Scellés"],
  ["jeu", "🎴 Fake Booster"],
  ["dashboard", "📊 Tableau de bord"],
  ["classeur", "📒 Classeur Pokémon"],
];
// Sections privées : réservées à son propre compte (ni collection de l'autre, ni lien de partage)
const PRIVEES = new Set(["classeurs", "scelles", "jeu"]);
// Vues qui ont besoin du compte (absentes d'un lien de partage public)
const COMPTE = new Set(["favoris", "doublons", "objectifs"]);

let demarre = false;
let vueCourante = null;

// ---------- Erreurs ----------

function erreurAffichee(texte) {
  if (demarre) return message(texte, "ko"); // l'appli est déjà à l'écran : on ne la masque pas
  $("login").hidden = false;
  $("app").hidden = true;
  $("login-msg").textContent = texte;
  $("login-msg").className = "msg ko";
}

window.addEventListener("error", (e) => erreurAffichee("Erreur : " + e.message));
window.addEventListener("unhandledrejection", (e) =>
  erreurAffichee("Erreur : " + (e.reason && e.reason.message ? e.reason.message : e.reason))
);

// ---------- Navigation ----------

const classeurDisponible = () => !S.partage && !S.lectureSeule && !!(S.profil && S.profil.classeur_actif);

function onglets() {
  $("onglets").replaceChildren(
    ...ONGLETS.filter(([nom]) => {
      if (nom === "classeur") return classeurDisponible();
      if (nom === "wishlist" || COMPTE.has(nom)) return !S.partage;
      if (PRIVEES.has(nom)) return !S.partage && !S.lectureSeule;
      return true;
    }).map(([nom, titre]) => h("a", { href: "#/" + nom, "data-vue": nom }, titre))
  );
}

function routeCourante() {
  const [nom, param] = location.hash.replace(/^#\/?/, "").split("/");
  return { nom: nom || "extensions", param };
}

async function afficherVue() {
  let { nom, param } = routeCourante();
  if (!VUES[nom] || (nom === "classeur" && !classeurDisponible()) || ((nom === "wishlist" || COMPTE.has(nom)) && S.partage) || (PRIVEES.has(nom) && (S.partage || S.lectureSeule))) {
    nom = "extensions";
    param = undefined;
  }
  vueCourante = VUES[nom];
  if (!HL.enLigne() && (nom === "jeu" || nom === "classeur")) {
    document.querySelectorAll("#onglets a").forEach((a) => a.classList.toggle("actif", a.dataset.vue === nom));
    return $("vue").replaceChildren(h("p", { class: "msg ko" }, "📴 Cette section demande une connexion. La collection, la wishlist, les scellés et les classeurs virtuels restent utilisables hors-ligne."));
  }
  document.querySelectorAll("#onglets a").forEach((a) => { a.classList.toggle("actif", a.dataset.vue === nom); if (a.dataset.vue === nom) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  window.scrollTo(0, 0);
  await essayer(() => vueCourante.monter($("vue"), param));
}

window.addEventListener("hashchange", () => { if (!$("app").hidden) afficherVue(); });

// Copie locale (pour ouvrir l'appli sans réseau) : l'état de mes listes est mémorisé peu après chaque changement
const MEMO = { collection: "collection", souhaits: "souhaits", produits: "produits", classeurs: "classeurs", classeur_cases: "cases" };
const aMemoriser = new Set();
let minuteurMemo = null;
function memoriser(nom) {
  if (S.lectureSeule || S.partage || !S.moi) return;
  if (nom !== "collection" && nom !== "souhaits" && !S.extraCharge) return;
  aMemoriser.add(nom);
  clearTimeout(minuteurMemo);
  minuteurMemo = setTimeout(() => { for (const n of aMemoriser) if (Array.isArray(S[MEMO[n]])) HL.sauverListe(n, S.moi.id, S[MEMO[n]]); aMemoriser.clear(); }, 1500);
}

for (const nom of ["collection", "souhaits", "produits", "classeurs", "classeur_cases"]) {
  evenements.addEventListener(nom, () => {
    memoriser(nom);
    if (vueCourante && vueCourante.rafraichir) vueCourante.rafraichir();
    if (!S.lectureSeule && !S.partage) D.planifierInstantane();
  });
}

// ---------- Choix de la collection affichée ----------

async function choisirCible(id) {
  S.cible = id;
  S.lectureSeule = id !== S.moi.id;
  document.body.classList.toggle("lecture", S.lectureSeule);
  const proprio = S.profils.find((p) => p.user_id === id);
  $("bandeau").textContent = S.lectureSeule ? "👀 Vous consultez la collection de " + (proprio ? proprio.nom : "…") + " (lecture seule)" : "";
  $("bandeau").hidden = !S.lectureSeule;
  message("Chargement…");
  try {
    await D.chargerDonnees(id);
  } catch (e) {
    return message("Erreur de chargement : " + e.message + " — la migration schema-v3.sql a-t-elle été lancée dans Supabase ?", "ko");
  }
  message("");
  onglets();
  await afficherVue();
  if (!S.lectureSeule) {
    S.extraCharge = false; // les données privées (scellés, classeurs) se rechargent à la demande
    D.enregistrerInstantane();
    D.completerDetails();
  }
}

async function initialiserCompte(session) {
  S.moi = { id: session.user.id, email: session.user.email };
  let profils = null;
  try {
    const rep = await db.from("profils").select("*");
    if (!rep.error) profils = rep.data;
    else if (!HL.estReseau(rep.error)) profils = [];
  } catch (e) {
    if (!HL.estReseau(e)) profils = [];
  }
  const memorise = HL.lireCompte();
  S.profils = profils || (memorise && memorise.moi.id === S.moi.id ? memorise.profils : []);
  S.profil = S.profils.find((p) => p.user_id === S.moi.id) || { user_id: S.moi.id, nom: S.moi.email.split("@")[0], classeur_actif: false };
  if (profils) HL.sauverCompte({ moi: S.moi, profils: S.profils });

  const choix = $("cible-select");
  choix.replaceChildren(
    h("option", { value: S.moi.id }, "Ma collection"),
    ...S.profils.filter((p) => p.user_id !== S.moi.id).map((p) => h("option", { value: p.user_id }, "Collection de " + p.nom))
  );
  choix.hidden = S.profils.length < 2;
  await choisirCible(S.moi.id);
}

$("cible-select").addEventListener("change", (e) => essayer(() => choisirCible(e.target.value)));

// ---------- Authentification ----------

async function afficherSession(session) {
  $("login").hidden = !!session;
  $("app").hidden = !session;
  if (!session) return;
  demarre = true;
  await initialiserCompte(session);
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-msg").textContent = "";
  const { error } = await db.auth.signInWithPassword({ email: $("email").value, password: $("password").value });
  if (error) {
    $("login-msg").textContent = "Connexion impossible : " + error.message;
    $("login-msg").className = "msg ko";
  }
});

$("logout").addEventListener("click", async () => {
  if (HL.taille() && !confirm(HL.taille() + " modification(s) faites hors-ligne ne sont pas encore envoyées. Se déconnecter quand même ? (elles seront envoyées à votre prochaine connexion)")) return;
  HL.oublierCopieLocale();
  oublierPrefs();
  db.auth.signOut();
});

// ---------- Menu et actions ----------

$("btn-scan").addEventListener("click", ouvrirScan);
$("btn-prix").addEventListener("click", () => { $("menu").open = false; essayer(D.actualiserPrix); });
$("btn-partage").addEventListener("click", () => { $("menu").open = false; ouvrirPartage(); });
$("btn-export").addEventListener("click", () => { $("menu").open = false; exporterCsv(); });
$("btn-import").addEventListener("click", () => { $("menu").open = false; ouvrirImport(); });
$("btn-sauvegarde").addEventListener("click", () => { $("menu").open = false; ouvrirSauvegarde(); });
$("btn-journal").addEventListener("click", () => { $("menu").open = false; essayer(ouvrirJournal); });
$("btn-partage-image").addEventListener("click", () => { $("menu").open = false; ouvrirPartageImage(); });
$("btn-sante").addEventListener("click", () => { $("menu").open = false; ouvrirSante(); });
$("btn-acces").addEventListener("click", () => { $("menu").open = false; ouvrirAcces(); });
$("btn-recherche").addEventListener("click", () => { $("menu").open = false; ouvrirRechercheGlobale(); });
appliquerTheme();
$("btn-theme").textContent = libelleTheme();
$("btn-theme").addEventListener("click", () => { basculerTheme(); $("btn-theme").textContent = libelleTheme(); });

// Toutes les fenêtres : bouton ✕ et clic sur le fond
document.querySelectorAll("dialog.modal").forEach((d) => {
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  d.querySelectorAll("[data-fermer]").forEach((b) => b.addEventListener("click", () => d.close()));
});

// Les en-têtes de tableau collants se placent juste sous l'en-tête de la page
const entete = document.querySelector(".top");
new ResizeObserver(() => document.documentElement.style.setProperty("--top-h", entete.offsetHeight + "px")).observe(entete);

// ---------- Hors-ligne : bandeau et synchronisation ----------

function majBandeauHorsLigne() {
  const n = HL.taille();
  const el = $("hors-ligne");
  if (S.partage) return (el.hidden = true);
  if (!HL.enLigne()) {
    el.textContent = "📴 Hors-ligne : vous pouvez consulter et modifier votre collection" + (n ? " · " + n + " modification(s) en attente" : "");
    el.className = "lecture-banner hors-ligne";
    el.hidden = false;
  } else if (n) {
    el.textContent = "🔄 " + n + " modification(s) en attente de synchronisation…";
    el.className = "lecture-banner hors-ligne sync";
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

let synchroEnCours = false;
async function envoyerFile() {
  if (synchroEnCours || S.partage || !S.moi || !HL.enLigne() || !HL.taille()) return;
  synchroEnCours = true;
  try {
    try { await db.auth.getSession(); } catch { /* le jeton se renouvelle ici s'il avait expiré hors-ligne */ }
    const bilan = await D.synchroniserFile();
    majBandeauHorsLigne();
    if (bilan.abandonnees.length) message(bilan.abandonnees.length + " modification(s) refusée(s) par le serveur : " + bilan.abandonnees[0].raison, "ko");
    if (bilan.faites) {
      if (!bilan.restantes && !S.lectureSeule) await D.chargerDonnees(S.moi.id); // on repart de l'état exact du serveur
      for (const nom of ["collection", "souhaits", "produits", "classeurs", "classeur_cases"]) emettre(nom);
      if (!bilan.abandonnees.length) message("✔ " + bilan.faites + " modification(s) faite(s) hors-ligne synchronisée(s).", "ok");
    }
  } finally {
    synchroEnCours = false;
  }
}

HL.surChangement(majBandeauHorsLigne);
window.addEventListener("offline", () => { majBandeauHorsLigne(); message("📴 Connexion perdue : vos modifications seront envoyées au retour du réseau.", ""); });
window.addEventListener("online", () => { majBandeauHorsLigne(); envoyerFile(); envoyerJournal(); });
setInterval(envoyerFile, 20000);
majBandeauHorsLigne();

// ---------- Démarrage ----------

async function demarrerPartage() {
  S.partage = true;
  S.lectureSeule = true;
  document.body.classList.add("lecture", "partage");
  $("login").hidden = true;
  $("app").hidden = false;
  demarre = true;
  $("bandeau").textContent = "👀 Collection partagée en lecture seule";
  $("bandeau").hidden = false;
  message("Chargement…");

  const tout = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await db.rpc("cartes_partagees", { p_token: JETON_PARTAGE }).range(debut, debut + 999);
    if (error) return message("Lien invalide ou désactivé : " + error.message, "ko");
    tout.push(...data);
    if (data.length < 1000) break;
  }
  S.collection = tout;
  message("");
  onglets();
  await afficherVue();
}

// Ouvre l'appli sans réseau avec le compte mémorisé lors de la dernière connexion
async function ouvrirHorsLigne() {
  if (HL.enLigne()) return false;
  const compte = HL.lireCompte();
  if (!compte) return false;
  $("login").hidden = true;
  $("app").hidden = false;
  demarre = true;
  db.auth.onAuthStateChange(surAuth);
  await initialiserCompte({ user: { id: compte.moi.id, email: compte.moi.email } });
  return true;
}

function surAuth(evt, session) {
  if (evt === "SIGNED_IN" && S.moi && session && session.user.id === S.moi.id) { envoyerFile(); return; } // simple rafraîchissement du jeton
  if (evt === "SIGNED_OUT" && !HL.enLigne()) return; // pas de déconnexion fantôme quand le réseau est coupé
  afficherSession(session);
}

async function demarrer() {
  await chargerReferentiels();

  if (JETON_PARTAGE) return demarrerPartage();

  try {
    // getSession peut rester bloquée si la session stockée est abîmée : on abandonne au bout de 6 s
    const { data } = await Promise.race([
      db.auth.getSession(),
      new Promise((_, rejet) => setTimeout(() => rejet(new Error("délai dépassé")), 6000)),
    ]);
    if (!data.session && (await ouvrirHorsLigne())) return;
    await afficherSession(data.session);
    db.auth.onAuthStateChange(surAuth);
  } catch (err) {
    if (await ouvrirHorsLigne()) return;
    erreurAffichee("Session illisible (" + err.message + "). Reconnectez-vous.");
    try { await db.auth.signOut({ scope: "local" }); } catch {}
    db.auth.onAuthStateChange((_evt, session) => afficherSession(session));
  }
}

demarrer();

export { onglets, afficherVue, choisirCible };

// Installation sur téléphone (PWA) et annonce des nouvelles versions
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const avaitUnWorker = !!navigator.serviceWorker.controller; // faux à la toute première visite : rien à annoncer
  navigator.serviceWorker.register("sw.js").then((reg) => {
    const chercher = () => reg.update().catch(() => {});
    setInterval(chercher, 30 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) chercher(); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (avaitUnWorker) $("maj-dispo").hidden = false; });
  $("btn-maj").addEventListener("click", () => location.reload());
}
