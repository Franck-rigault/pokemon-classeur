// Journal d'activité : qui a ajouté, retiré ou modifié quoi, et quand (table « journal », schema-v8.sql).
// Les lignes sont d'abord mises en attente localement (marche hors-ligne) puis envoyées en arrière-plan.
import { $, h, db, squelette } from "./api.js";
import { S } from "./etat.js";
import { estReseau } from "./horsligne.js";

const CLE = "classeur:journal:v1";
let enCours = false;
let absent = false; // la table n'existe pas (schema-v8.sql pas lancé) : on arrête d'essayer

const lireFile = () => { try { return JSON.parse(localStorage.getItem(CLE) || "[]"); } catch { return []; } };
const ecrireFile = (f) => { try { localStorage.setItem(CLE, JSON.stringify(f.slice(-500))); } catch { /* plein */ } };

export function journaliser(action, libelle, extra = {}) {
  if (S.lectureSeule || S.partage || !S.moi || absent) return;
  const file = lireFile();
  file.push({ user_id: S.moi.id, created_at: new Date().toISOString(), action, libelle, carte_id: extra.carte_id || null, quantite: extra.quantite ?? null });
  ecrireFile(file);
  envoyer();
}

export async function envoyer() {
  if (enCours || absent || !S.moi || navigator.onLine === false) return;
  const file = lireFile().filter((l) => l.user_id === S.moi.id);
  if (!file.length) return;
  enCours = true;
  try {
    const { error } = await db.from("journal").insert(file);
    if (error) throw error;
    const envoyees = new Set(file.map((l) => JSON.stringify(l)));
    ecrireFile(lireFile().filter((l) => !envoyees.has(JSON.stringify(l)))); // les lignes ajoutées pendant l'envoi restent
  } catch (e) {
    if (!estReseau(e)) {
      absent = true; // table absente ou refus : inutile d'insister
      ecrireFile(lireFile().filter((l) => l.user_id !== S.moi.id));
    }
  } finally {
    enCours = false;
  }
}

const ICONES = { ajout: "➕", retrait: "➖", quantite: "🔢", wishlist: "❤", modif: "✏️", scelle: "📦", jeu: "🎴" };

export async function ouvrirJournal() {
  const dlg = $("journal");
  const corps = $("journal-contenu");
  const periode = h("select", { "aria-label": "Période" },
    h("option", { value: "7" }, "7 derniers jours"), h("option", { value: "30", selected: true }, "30 derniers jours"),
    h("option", { value: "90" }, "3 derniers mois"), h("option", { value: "0" }, "Tout"));
  const zone = h("div", {});
  corps.replaceChildren(h("div", { class: "row tools" }, periode), zone);
  if (!dlg.open) dlg.showModal();

  async function charger() {
    zone.replaceChildren(squelette(1, "Chargement du journal…"));
    await envoyer();
    let q = db.from("journal").select("*").eq("user_id", S.moi.id).order("created_at", { ascending: false }).limit(1000);
    const jours = Number(periode.value);
    if (jours) q = q.gte("created_at", new Date(Date.now() - jours * 864e5).toISOString());
    const { data, error } = await q;
    if (error) return zone.replaceChildren(h("p", { class: "msg ko" }, "Journal indisponible : " + error.message + " — la migration schema-v8.sql a-t-elle été lancée ?"));
    if (!data.length) return zone.replaceChildren(h("p", { class: "muted" }, "Rien à afficher sur cette période. Le journal se remplit à chaque ajout ou retrait de carte."));
    const parMois = new Map();
    for (const l of data) {
      const d = new Date(l.created_at);
      const mois = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      if (!parMois.has(mois)) parMois.set(mois, []);
      parMois.get(mois).push(l);
    }
    zone.replaceChildren(...[...parMois].map(([mois, lignes]) => {
      const ajouts = lignes.filter((l) => l.action === "ajout").reduce((s, l) => s + (l.quantite || 1), 0);
      const retraits = lignes.filter((l) => l.action === "retrait").reduce((s, l) => s + (l.quantite || 1), 0);
      return h("section", { class: "journal-mois" },
        h("h3", {}, mois.charAt(0).toUpperCase() + mois.slice(1), h("small", { class: "muted" }, " · " + ajouts + " ajoutée(s), " + retraits + " retirée(s)")),
        h("ul", { class: "journal-liste" }, lignes.map((l) => {
          const d = new Date(l.created_at);
          return h("li", {},
            h("span", { class: "journal-date" }, d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })),
            h("span", {}, (ICONES[l.action] || "•") + " " + l.libelle));
        })));
    }));
  }
  periode.addEventListener("change", charger);
  charger();
}
