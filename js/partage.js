// Lien de partage public en lecture seule (pour des personnes qui n'ont pas de compte).
import { $, h, db, message, fermerAuFond } from "./api.js";

export async function ouvrirPartage() {
  const zone = $("partage-contenu");
  zone.replaceChildren(h("p", {}, "Chargement…"));
  if (!$("partage").open) $("partage").showModal();

  const { data, error } = await db.from("partages").select("token").maybeSingle();
  if (error) return zone.replaceChildren(h("p", { class: "msg ko" }, "Partage indisponible : " + error.message));

  const explication = h("p", {}, "Toute personne qui possède le lien peut consulter votre collection (extensions, cartes, tableau de bord), sans pouvoir la modifier, et sans voir votre compte. Votre wishlist et votre classeur ne sont pas partagés.");

  if (!data) {
    return zone.replaceChildren(
      explication,
      h("button", {
        type: "button",
        onclick: async () => {
          const { error: e } = await db.from("partages").insert({});
          if (e) return message("Création impossible : " + e.message, "ko");
          ouvrirPartage();
        },
      }, "Créer un lien de partage")
    );
  }

  const lien = location.origin + location.pathname + "?partage=" + data.token;
  const champ = h("input", { type: "text", readOnly: true, value: lien, onfocus: (e) => e.target.select() });
  const copier = h("button", {
    type: "button",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(lien);
        copier.textContent = "✔ Copié";
      } catch {
        champ.select();
        copier.textContent = "Sélectionné : faites Ctrl+C";
      }
    },
  }, "Copier le lien");
  const arreter = h("button", {
    type: "button", class: "ghost",
    onclick: async () => {
      if (!confirm("Désactiver ce lien ? Les personnes qui l'ont n'auront plus accès.")) return;
      const { error: e } = await db.from("partages").delete().eq("token", data.token);
      if (e) return message("Désactivation impossible : " + e.message, "ko");
      ouvrirPartage();
    },
  }, "Désactiver le lien");

  zone.replaceChildren(explication, champ, h("div", { class: "row tools" }, copier, arreter));
}

$("partage-close").addEventListener("click", () => $("partage").close());
fermerAuFond($("partage"));
