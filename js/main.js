// Point d'entrée : connexion, comptes, navigation par onglets, choix de la collection affichée.
import { $, db, h, chargerReferentiels, message, essayer } from "./api.js";
import { S, evenements } from "./etat.js";
import * as D from "./donnees.js";
import { vueExtensions } from "./vue-extensions.js";
import { vueRecherche } from "./vue-recherche.js";
import { vueCartes } from "./vue-cartes.js";
import { vueWishlist } from "./vue-wishlist.js";
import { vueDashboard } from "./vue-dashboard.js";
import { vueClasseur } from "./vue-classeur.js";
import { vueClasseurs } from "./vue-classeurs.js";
import { vueProduits } from "./vue-produits.js";
import { vueBoosters } from "./vue-boosters.js";
import { ouvrirImport } from "./import.js";
import "./dialogue-carte.js";
import { ouvrirScan } from "./scan.js";
import { ouvrirPartage } from "./partage.js";
import { exporterCsv } from "./export.js";

const JETON_PARTAGE = new URLSearchParams(location.search).get("partage");
const VUES = {
  extensions: vueExtensions, recherche: vueRecherche, cartes: vueCartes, wishlist: vueWishlist,
  classeurs: vueClasseurs, scelles: vueProduits, boosters: vueBoosters, dashboard: vueDashboard, classeur: vueClasseur,
};
const ONGLETS = [
  ["extensions", "📚 Extensions"],
  ["recherche", "🔎 Rechercher"],
  ["cartes", "🃏 Mes cartes"],
  ["wishlist", "❤ Wishlist"],
  ["classeurs", "📘 Mes classeurs"],
  ["scelles", "📦 Scellés"],
  ["boosters", "🎁 Boosters"],
  ["dashboard", "📊 Tableau de bord"],
  ["classeur", "📒 Classeur Pokémon"],
];
// Sections privées : réservées à son propre compte (ni collection de l'autre, ni lien de partage)
const PRIVEES = new Set(["classeurs", "scelles", "boosters"]);

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
      if (nom === "wishlist") return !S.partage;
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
  if (!VUES[nom] || (nom === "classeur" && !classeurDisponible()) || (nom === "wishlist" && S.partage) || (PRIVEES.has(nom) && (S.partage || S.lectureSeule))) {
    nom = "extensions";
    param = undefined;
  }
  vueCourante = VUES[nom];
  document.querySelectorAll("#onglets a").forEach((a) => a.classList.toggle("actif", a.dataset.vue === nom));
  window.scrollTo(0, 0);
  await essayer(() => vueCourante.monter($("vue"), param));
}

window.addEventListener("hashchange", () => { if (!$("app").hidden) afficherVue(); });

for (const nom of ["collection", "souhaits", "produits", "ouvertures", "classeurs", "classeur_cases"]) {
  evenements.addEventListener(nom, () => {
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
    S.extraCharge = false; // les données privées (scellés, boosters, classeurs) se rechargent à la demande
    D.enregistrerInstantane();
    D.completerDetails();
  }
}

async function initialiserCompte(session) {
  S.moi = { id: session.user.id, email: session.user.email };
  const { data, error } = await db.from("profils").select("*");
  S.profils = error ? [] : data;
  S.profil = S.profils.find((p) => p.user_id === S.moi.id) || { user_id: S.moi.id, nom: S.moi.email.split("@")[0], classeur_actif: false };

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

$("logout").addEventListener("click", () => db.auth.signOut());

// ---------- Menu et actions ----------

$("btn-scan").addEventListener("click", ouvrirScan);
$("btn-prix").addEventListener("click", () => { $("menu").open = false; essayer(D.actualiserPrix); });
$("btn-partage").addEventListener("click", () => { $("menu").open = false; ouvrirPartage(); });
$("btn-export").addEventListener("click", () => { $("menu").open = false; exporterCsv(); });
$("btn-import").addEventListener("click", () => { $("menu").open = false; ouvrirImport(); });

// Toutes les fenêtres : bouton ✕ et clic sur le fond
document.querySelectorAll("dialog.modal").forEach((d) => {
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  d.querySelectorAll("[data-fermer]").forEach((b) => b.addEventListener("click", () => d.close()));
});

// Les en-têtes de tableau collants se placent juste sous l'en-tête de la page
const entete = document.querySelector(".top");
new ResizeObserver(() => document.documentElement.style.setProperty("--top-h", entete.offsetHeight + "px")).observe(entete);

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

async function demarrer() {
  await chargerReferentiels();

  if (JETON_PARTAGE) return demarrerPartage();

  try {
    // getSession peut rester bloquée si la session stockée est abîmée : on abandonne au bout de 6 s
    const { data } = await Promise.race([
      db.auth.getSession(),
      new Promise((_, rejet) => setTimeout(() => rejet(new Error("délai dépassé")), 6000)),
    ]);
    await afficherSession(data.session);
    db.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_IN" && S.moi && session && session.user.id === S.moi.id) return; // simple rafraîchissement du jeton
      afficherSession(session);
    });
  } catch (err) {
    erreurAffichee("Session illisible (" + err.message + "). Reconnectez-vous.");
    try { await db.auth.signOut({ scope: "local" }); } catch {}
    db.auth.onAuthStateChange((_evt, session) => afficherSession(session));
  }
}

demarrer();

export { onglets, afficherVue, choisirCible };

// Installation sur téléphone (PWA)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
