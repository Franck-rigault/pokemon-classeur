// Contrôle de santé des données : repère et corrige les problèmes de la collection.
//   Instantané : doublons exacts, lignes incomplètes, extensions inconnues, prix manquants.
//   Sur demande : cartes introuvables chez TCGdex, images qui ne chargent plus (avec les sources de secours).
import { $, h, TCGDEX, imageCarte, libelleExt, essayer, message, squelette } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { alternatives } from "./images.js";
import { ouvrirCarte } from "./dialogue-carte.js";

const cle = (l) => [l.carte_id, l.variante, l.etat, l.grade_societe || "", l.grade_note ?? "", l.emplacement || ""].join("|");

function verifier() {
  const groupes = new Map();
  for (const l of S.collection) {
    const k = cle(l);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(l);
  }
  return {
    doublonsExacts: [...groupes.values()].filter((g) => g.length > 1),
    incompletes: S.collection.filter((c) => !c.complet),
    sansPrix: [...new Map(S.collection.filter((c) => c.valeur == null).map((c) => [c.carte_id, c])).values()],
    extensionInconnue: [...new Map(S.collection.filter((c) => !S.extParId.has(c.set_id)).map((c) => [c.set_id, c])).values()],
    quantites: S.collection.filter((c) => !(c.quantite >= 1)),
  };
}

// Fusionne les lignes strictement identiques (même carte, variante, état, rangement, gradation)
async function fusionner(groupes) {
  for (const g of groupes) {
    const [garde, ...autres] = g;
    const total = g.reduce((s, l) => s + l.quantite, 0);
    for (const l of autres) await D.supprimerEntree(l, { annulable: false, silencieux: true });
    await D.changerQuantite(garde, total, { silencieux: true });
  }
}

function testerImage(url) {
  const essais = [url, ...alternatives(url)];
  return new Promise((resolve) => {
    const suivant = () => {
      const u = essais.shift();
      if (!u) return resolve(false);
      const img = new Image();
      const t = setTimeout(suivant, 8000);
      img.onload = () => { clearTimeout(t); resolve(true); };
      img.onerror = () => { clearTimeout(t); suivant(); };
      img.src = u;
    };
    suivant();
  });
}

// Travaille sur une liste avec 6 tâches en parallèle ; `annule()` permet d'interrompre
async function enParallele(liste, travail, progres, annule) {
  const file = [...liste];
  let faits = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (file.length && !annule()) {
      await travail(file.shift());
      progres(++faits, liste.length);
    }
  }));
}

export function ouvrirSante() {
  const dlg = $("sante");
  const corps = $("sante-contenu");
  let annule = false;
  dlg.addEventListener("close", () => { annule = true; }, { once: true });
  const zoneRapide = h("div", {});
  const zoneReseau = h("div", {});

  function dessinerRapide() {
    const r = verifier();
    const bloc = (ok, titre, detail, bouton) => h("li", { class: ok ? "sante-ok" : "sante-pb" }, h("b", {}, (ok ? "✅ " : "⚠️ ") + titre), detail ? h("span", { class: "muted" }, " " + detail) : null, bouton || null);
    zoneRapide.replaceChildren(h("ul", { class: "sante-liste" },
      bloc(!r.doublonsExacts.length, r.doublonsExacts.length ? r.doublonsExacts.length + " ligne(s) en double exact" : "Aucune ligne en double exact", r.doublonsExacts.length ? "(même carte, variante, état et rangement)" : "",
        r.doublonsExacts.length && !S.lectureSeule ? h("button", { type: "button", class: "ghost", onclick: () => essayer(async () => { await fusionner(r.doublonsExacts); message("✔ Doublons fusionnés.", "ok"); dessinerRapide(); }) }, "Fusionner") : null),
      bloc(!r.incompletes.length, r.incompletes.length ? r.incompletes.length + " carte(s) aux informations incomplètes" : "Toutes les cartes ont leurs informations", r.incompletes.length ? "(rareté, prix, type…)" : "",
        r.incompletes.length && !S.lectureSeule ? h("button", { type: "button", class: "ghost", onclick: () => essayer(async () => { await D.completerDetails(); dessinerRapide(); }) }, "Compléter") : null),
      bloc(!r.sansPrix.length, r.sansPrix.length ? r.sansPrix.length + " carte(s) sans prix" : "Toutes les cartes ont un prix", r.sansPrix.length ? "(pas de prix Cardmarket chez TCGdex, ou prix pas encore actualisés)" : ""),
      bloc(!r.extensionInconnue.length, r.extensionInconnue.length ? r.extensionInconnue.length + " extension(s) absente(s) de la liste" : "Toutes les extensions sont connues", r.extensionInconnue.map((c) => c.set_id).join(", ")),
      bloc(!r.quantites.length, r.quantites.length ? r.quantites.length + " ligne(s) avec une quantité invalide" : "Quantités valides", "")
    ));
  }

  // Vérifications qui demandent le réseau
  const sortie = h("div", {});
  const info = h("p", { class: "muted" });
  const boutonIntrouvables = h("button", {
    type: "button", class: "ghost",
    onclick: () => essayer(async () => {
      if (!navigator.onLine) return message("Cette vérification demande une connexion.", "ko");
      annule = false;
      const ids = [...new Set(S.collection.map((c) => c.carte_id))];
      const perdues = [];
      await enParallele(ids, async (id) => {
        try {
          const rep = await fetch(TCGDEX + "/cards/" + encodeURIComponent(id));
          if (rep.status === 404) perdues.push(id);
        } catch { /* réseau : on ne conclut pas */ }
      }, (f, t) => { info.textContent = "Vérification des cartes auprès de TCGdex… " + f + " / " + t; }, () => annule);
      info.textContent = annule ? "Vérification interrompue." : "Terminé : " + perdues.length + " carte(s) introuvable(s) sur " + ids.length + ".";
      sortie.replaceChildren(...perdues.map((id) => { const l = S.collection.find((c) => c.carte_id === id); return h("p", {}, "⚠️ ", h("button", { type: "button", class: "lien", onclick: () => ouvrirCarte(id) }, l.nom), " " + libelleExt(l.set_id) + " n° " + l.local_id + " (" + id + ")"); }));
    }),
  }, "Vérifier que mes cartes existent chez TCGdex");
  const boutonImages = h("button", {
    type: "button", class: "ghost",
    onclick: () => essayer(async () => {
      if (!navigator.onLine) return message("Cette vérification demande une connexion.", "ko");
      annule = false;
      const cartes = [...new Map(S.collection.filter((c) => c.image).map((c) => [c.carte_id, c])).values()];
      const cassees = [];
      await enParallele(cartes, async (c) => { if (!(await testerImage(imageCarte(c.image)))) cassees.push(c); },
        (f, t) => { info.textContent = "Vérification des images… " + f + " / " + t; }, () => annule);
      info.textContent = annule ? "Vérification interrompue." : "Terminé : " + cassees.length + " image(s) introuvable(s) sur " + cartes.length + " (toutes les sources de secours ont été essayées).";
      sortie.replaceChildren(...cassees.map((c) => h("p", {}, "🖼 ", h("button", { type: "button", class: "lien", onclick: () => ouvrirCarte(c.carte_id) }, c.nom), " " + libelleExt(c.set_id) + " n° " + c.local_id)));
    }),
  }, "Vérifier mes images");

  corps.replaceChildren(
    h("p", { class: "muted" }, "Repère les petits problèmes de la collection. Les vérifications réseau peuvent durer quelques minutes pour une grosse collection ; vous pouvez fermer la fenêtre pour les interrompre."),
    h("h3", {}, "Contrôle immédiat"), zoneRapide,
    h("h3", {}, "Vérifications avec le réseau"),
    h("div", { class: "row tools" }, boutonIntrouvables, boutonImages), info, sortie
  );
  dessinerRapide();
  if (!dlg.open) dlg.showModal();
}
