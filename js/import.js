// Import d'un fichier CSV (export de cette appli, ou d'une autre : nom, extension, numéro, quantité…).
import { $, h, normalise, essayer, message, cartesDExtension, cartesParNom, libelleExt } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";

// ---------- Lecture du CSV ----------

export function lireCsv(texte) {
  texte = texte.replace(/^﻿/, "");
  const premiere = texte.split(/\r?\n/, 1)[0];
  const delim = [";", "\t", ","].map((d) => [d, premiere.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = [];
  let champ = "", ligne = [], entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') entreGuillemets = false;
      else champ += c;
    } else if (c === '"') entreGuillemets = true;
    else if (c === delim) { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); champ = "";
      if (ligne.some((x) => x.trim() !== "")) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some((x) => x.trim() !== "")) lignes.push(ligne);
  return { entetes: (lignes[0] || []).map((x) => x.trim()), lignes: lignes.slice(1) };
}

// ---------- Détection des colonnes ----------

const COLONNES = [
  ["nom", "Nom de la carte", [/^nom\b/, /^name/, /^carte/, /^card\b/, /pok[eé]mon/]],
  ["ext", "Extension (code ou nom)", [/^code/, /extension/, /^set\b/, /[eé]dition/, /expansion/]],
  ["num", "Numéro", [/^n[°o]?$/, /^num/, /number/, /^#/, /^no\b/]],
  ["qte", "Quantité", [/quantit/, /^qty/, /^qt[eé]/, /count/, /nombre/]],
  ["variante", "Variante", [/variant/, /finish/, /foil/, /holo/]],
  ["etat", "État", [/condition/, /[eé]tat/]],
];

function detecter(entetes) {
  const prises = new Set();
  const choix = {};
  for (const [cle, , motifs] of COLONNES) {
    for (const m of motifs) {
      const i = entetes.findIndex((e, idx) => !prises.has(idx) && m.test(normalise(e)));
      if (i >= 0) { choix[cle] = i; prises.add(i); break; }
    }
  }
  return choix;
}

const variante = (v) => {
  const t = normalise(v);
  if (/reverse/.test(t)) return "Reverse";
  if (/holo|foil/.test(t)) return "Holo";
  if (/1st|1re|premi[eè]re|first/.test(t)) return "1re édition";
  return "Normale";
};

const etat = (v) => {
  const t = normalise(v);
  if (!t) return "Neuf";
  if (/^(m|nm|mint|near|neuf)/.test(t)) return "Neuf";
  if (/^(ex|excel)/.test(t)) return "Excellent";
  if (/^(gd|good|bon)/.test(t)) return "Bon";
  if (/^(lp|light|pl|played|joue)/.test(t)) return "Joué";
  if (/^(po|poor|damag|abim)/.test(t)) return "Abîmé";
  return "Neuf";
};

// ---------- Reconnaissance des cartes ----------

async function trouver(ligne, col) {
  const lire = (cle) => (col[cle] == null ? "" : String(ligne[col[cle]] ?? "").trim());
  const nom = lire("nom");
  const extVal = normalise(lire("ext"));
  const numTexte = lire("num");
  const m = /(\d{1,3})(?:\s*\/\s*(\d{1,3}))?/.exec(numTexte);
  const num = m ? parseInt(m[1], 10) : null;
  const total = m && m[2] ? parseInt(m[2], 10) : null;

  // 1. extension + numéro
  if (extVal && num) {
    const ext =
      S.extensions.find((e) => e.code && normalise(e.code) === extVal) ||
      S.extensions.find((e) => normalise(e.nom) === extVal) ||
      (extVal.length >= 4 ? S.extensions.find((e) => normalise(e.nom).includes(extVal)) : null);
    if (ext) {
      const { cartes } = await cartesDExtension(ext.id);
      const k = cartes.find((x) => parseInt(x.localId, 10) === num);
      if (k) {
        const premierMot = normalise(nom).split(/\s+/)[0];
        if (!nom || normalise(k.name).includes(premierMot)) return { statut: "ok", carte: k };
        return { statut: "verifier", carte: k, raison: "Nom différent : " + k.name };
      }
    }
  }

  // 2. nom + numéro
  if (nom && num) {
    const toutes = await cartesParNom(nom);
    let liste = toutes.filter((k) => parseInt(k.localId, 10) === num);
    if (liste.length > 1 && total) {
      const memeTaille = liste.filter((k) => (S.extParId.get(k.set_id) || {}).officiel === total);
      if (memeTaille.length) liste = memeTaille;
    }
    if (liste.length === 1) return { statut: "ok", carte: liste[0] };
    if (liste.length > 1) return { statut: "verifier", carte: liste[0], raison: liste.length + " cartes possibles (extension absente)" };
  }
  return { statut: "introuvable", raison: nom ? "Aucune carte « " + nom + " » avec ce numéro/cette extension" : "Ni nom ni extension reconnus" };
}

// ---------- Fenêtre ----------

export function ouvrirImport() {
  const zone = $("import-contenu");
  const fichier = h("input", { type: "file", accept: ".csv,.txt,text/csv" });
  const etape = h("div", { class: "dash-contenu" });

  fichier.addEventListener("change", async () => {
    const f = fichier.files[0];
    if (!f) return;
    const { entetes, lignes } = lireCsv(await f.text());
    if (!entetes.length || !lignes.length) return etape.replaceChildren(h("p", { class: "msg ko" }, "Fichier vide ou illisible."));
    afficherMapping(entetes, lignes);
  });

  function afficherMapping(entetes, lignes) {
    const detecte = detecter(entetes);
    const selects = {};
    const options = [h("option", { value: "" }, "— aucune —"), ...entetes.map((e, i) => h("option", { value: String(i) }, e || "(colonne " + (i + 1) + ")"))];
    const champs = COLONNES.map(([cle, libelle]) => {
      selects[cle] = h("select", { "aria-label": libelle }, options.map((o) => o.cloneNode(true)));
      if (detecte[cle] != null) selects[cle].value = String(detecte[cle]);
      return h("label", { class: "import-champ" }, h("span", {}, libelle), selects[cle]);
    });

    etape.replaceChildren(
      h("p", {}, h("b", {}, lignes.length + " lignes"), " lues. Vérifiez à quelles colonnes correspondent les informations :"),
      h("div", { class: "import-mapping" }, champs),
      h("p", { class: "muted" }, "Il faut au moins le numéro, avec l'extension ou le nom. Quantité, variante et état sont facultatifs."),
      h("button", { type: "button", onclick: () => essayer(() => analyser(lignes, selects)) }, "Analyser le fichier")
    );
  }

  async function analyser(lignes, selects) {
    const col = {};
    for (const [cle] of COLONNES) col[cle] = selects[cle].value === "" ? null : Number(selects[cle].value);
    if (col.num == null || (col.ext == null && col.nom == null)) return message("Choisissez au moins la colonne du numéro et celle de l'extension ou du nom.", "ko");

    const resultats = [];
    const progression = h("p", { class: "msg" }, "Analyse…");
    etape.replaceChildren(progression);
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      let r;
      try { r = await trouver(l, col); } catch (e) { r = { statut: "introuvable", raison: "Erreur réseau : " + e.message }; }
      const q = col.qte == null ? 1 : Math.max(1, parseInt(l[col.qte], 10) || 1);
      resultats.push({ i: i + 2, l, ...r, quantite: q, variante: col.variante == null ? "Normale" : variante(l[col.variante]), etat: col.etat == null ? "Neuf" : etat(l[col.etat]) });
      if (i % 5 === 0) progression.textContent = "Analyse : " + (i + 1) + " / " + lignes.length + "…";
    }
    apercu(resultats);
  }

  function apercu(resultats) {
    const ok = resultats.filter((r) => r.statut === "ok");
    const aVerifier = resultats.filter((r) => r.statut === "verifier");
    const introuvables = resultats.filter((r) => r.statut === "introuvable");
    const inclure = new Set(ok);

    const ligne = (r) => h("tr", { class: r.statut },
      h("td", {}, r.statut === "ok" ? h("input", { type: "checkbox", checked: true, onchange: (e) => (e.target.checked ? inclure.add(r) : inclure.delete(r)) }) : r.statut === "verifier" ? h("input", { type: "checkbox", onchange: (e) => (e.target.checked ? inclure.add(r) : inclure.delete(r)) }) : "✘"),
      h("td", {}, "L" + r.i),
      h("td", {}, r.carte ? r.carte.name + " · " + libelleExt(r.carte.set_id) + " n° " + r.carte.localId : r.l.join(" ; ").slice(0, 60)),
      h("td", {}, "× " + r.quantite + " · " + r.variante + " · " + r.etat),
      h("td", { class: "muted" }, r.raison || "")
    );

    const bouton = h("button", { type: "button", onclick: () => essayer(() => importer([...inclure], bouton)) }, "Importer les cartes cochées");
    etape.replaceChildren(
      h("p", {}, h("b", {}, ok.length + " reconnues"), " · ", h("b", {}, aVerifier.length + " à vérifier"), " (décochées) · ", h("b", {}, introuvables.length + " introuvables")),
      h("div", { class: "table-simple import-table" }, h("table", {}, h("tbody", {}, [...ok, ...aVerifier, ...introuvables].slice(0, 400).map(ligne)))),
      resultats.length > 400 ? h("p", { class: "muted" }, "Aperçu limité à 400 lignes ; toutes les lignes cochées seront importées.") : null,
      bouton
    );
  }

  async function importer(liste, bouton) {
    if (!liste.length) return message("Aucune carte cochée.", "ko");
    bouton.disabled = true;
    let faits = 0;
    for (const r of liste) {
      await D.ajouterCarteCourte(r.carte, { quantite: r.quantite, variante: r.variante, etat: r.etat });
      faits++;
      message("Import : " + faits + " / " + liste.length + "…");
    }
    $("import").close();
    message("✔ " + faits + " lignes importées. Les informations détaillées (prix, rareté…) se complètent en arrière-plan.", "ok");
    D.completerDetails();
  }

  zone.replaceChildren(
    h("h2", {}, "⬆ Importer un fichier CSV"),
    h("p", { class: "muted" }, "Fichier exporté depuis cette appli ou depuis une autre (colonnes : nom, extension, numéro, quantité…). Les cartes sont reconnues grâce à l'extension et au numéro, puis ajoutées à votre collection."),
    fichier,
    etape
  );
  $("import").showModal();
}
