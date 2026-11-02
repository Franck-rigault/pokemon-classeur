// Export de la collection au format CSV (lisible dans Excel).
import { message } from "./api.js";
import { S } from "./etat.js";

export function exporterCsv() {
  const ext = (id) => S.extParId.get(id) || {};
  const colonnes = [
    ["Extension", (c) => ext(c.set_id).nom || c.set_id],
    ["Code", (c) => ext(c.set_id).code],
    ["N°", (c) => c.local_id],
    ["Nom", (c) => c.nom],
    ["Rareté", (c) => c.rarete],
    ["Variante", (c) => c.variante],
    ["État", (c) => c.etat],
    ["Gradation", (c) => (c.grade_societe ? c.grade_societe + " " + (c.grade_note ?? "") : "")],
    ["Rangement", (c) => c.emplacement],
    ["Quantité", (c) => c.quantite],
    ["Valeur unitaire (€)", (c) => (c.valeur == null ? "" : String(c.valeur).replace(".", ","))],
    ["Valeur totale (€)", (c) => (c.valeur == null ? "" : String(Number(c.valeur) * c.quantite).replace(".", ","))],
    ["Prix d'achat (€)", (c) => (c.prix_achat == null ? "" : String(c.prix_achat).replace(".", ","))],
  ];
  const cellule = (v) => {
    const t = String(v ?? "");
    return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const tries = [...S.collection].sort(
    (a, b) => (S.ordreExt.get(a.set_id) ?? 9999) - (S.ordreExt.get(b.set_id) ?? 9999) || a.local_id.localeCompare(b.local_id, "fr", { numeric: true })
  );
  const lignes = [colonnes.map(([nom]) => nom).join(";")];
  for (const c of tries) lignes.push(colonnes.map(([, f]) => cellule(f(c))).join(";"));

  // BOM : Excel reconnaît ainsi l'UTF-8 (accents)
  const blob = new Blob(["﻿" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "collection-pokemon-" + new Date().toLocaleDateString("sv-SE") + ".csv";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  message("✔ Export de " + tries.length + " lignes.", "ok");
}
