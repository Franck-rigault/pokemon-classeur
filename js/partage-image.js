// Image à partager : une belle image (PNG) de sa collection — top 10, progression d'une extension ou chiffres clés.
import { $, h, euros, imageCarte, libelleExt, cartesDExtension, essayer, message, annee } from "./api.js";
import { S } from "./etat.js";
import * as D from "./donnees.js";
import { alternatives } from "./images.js";

const L = 1080, H = 1350;

// Charge une image en autorisant le dessin dans un canvas (CORS) ; essaie les sources de secours si besoin
function chargerImage(url) {
  const essais = [url, ...alternatives(url)];
  return new Promise((resolve) => {
    const suivant = () => {
      const u = essais.shift();
      if (!u) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = suivant;
      img.src = u;
    };
    suivant();
  });
}

function rect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fond(ctx, titre, sousTitre) {
  const g = ctx.createLinearGradient(0, 0, L, H);
  g.addColorStop(0, "#10132e");
  g.addColorStop(1, "#3a2a6e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L, H);
  ctx.fillStyle = "rgba(255,255,255,.05)";
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(900 - i * 170, 180 + i * 190, 140, 0, 7); ctx.fill(); }
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffcb05";
  ctx.font = "bold 64px Lilita One, system-ui, sans-serif";
  ctx.fillText(titre, 60, 120);
  ctx.fillStyle = "#c9cff0";
  ctx.font = "30px system-ui, sans-serif";
  ctx.fillText(sousTitre, 60, 170);
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.font = "24px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Classeur Pokémon", L - 60, H - 40);
  ctx.textAlign = "left";
}

function carteImage(ctx, img, x, y, w, h, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  rect(ctx, x, y, w, h, 12);
  ctx.clip();
  if (img) ctx.drawImage(img, x, y, w, h);
  else { ctx.fillStyle = "#2a3068"; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}

const proprio = () => (S.profil && S.profil.nom) || "Ma collection";

const MODELES = {
  async top(ctx) {
    const top = [...new Map(S.collection.filter((c) => c.valeur != null).sort((a, b) => Number(b.valeur) - Number(a.valeur)).map((c) => [c.carte_id, c])).values()].slice(0, 10);
    fond(ctx, "Mes 10 cartes les plus chères", proprio() + " · " + new Date().toLocaleDateString("fr-FR"));
    const imgs = await Promise.all(top.map((c) => (c.image ? chargerImage(imageCarte(c.image, "high")) : null)));
    const w = 176, hh = 246, gap = 20;
    top.forEach((c, i) => {
      const x = 60 + (i % 5) * (w + gap), y = 250 + Math.floor(i / 5) * 470;
      carteImage(ctx, imgs[i], x, y, w, hh);
      ctx.fillStyle = "#ffcb05";
      ctx.font = "bold 34px system-ui, sans-serif";
      ctx.fillText("#" + (i + 1), x, y + hh + 44);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 24px system-ui, sans-serif";
      ctx.fillText(c.nom.length > 15 ? c.nom.slice(0, 14) + "…" : c.nom, x, y + hh + 78);
      ctx.fillStyle = "#9dffb0";
      ctx.fillText(euros(c.valeur), x, y + hh + 110);
    });
    if (!top.length) { ctx.fillStyle = "#fff"; ctx.font = "34px system-ui"; ctx.fillText("Aucune carte avec un prix pour l'instant.", 60, 300); }
  },

  async chiffres(ctx) {
    const st = D.statistiques();
    const complets = S.extensions.filter((e) => e.officiel && new Set(S.collection.filter((c) => c.set_id === e.id).map((c) => c.carte_id)).size >= e.officiel).length;
    fond(ctx, "Ma collection en chiffres", proprio() + " · " + new Date().toLocaleDateString("fr-FR"));
    const tuiles = [[euros(st.valeur), "Valeur"], [st.distinctes, "Cartes différentes"], [st.exemplaires, "Exemplaires"], [st.extensions, "Extensions commencées"], [complets, "Extensions complètes"], [S.souhaits.length, "Cartes en wishlist"]];
    tuiles.forEach(([v, l], i) => {
      const x = 60 + (i % 2) * 480, y = 240 + Math.floor(i / 2) * 230;
      ctx.fillStyle = "rgba(255,255,255,.1)";
      rect(ctx, x, y, 450, 200, 24);
      ctx.fill();
      ctx.fillStyle = "#ffcb05";
      ctx.font = "bold 72px Lilita One, system-ui, sans-serif";
      ctx.fillText(String(v), x + 30, y + 100);
      ctx.fillStyle = "#c9cff0";
      ctx.font = "30px system-ui, sans-serif";
      ctx.fillText(l, x + 30, y + 150);
    });
    const meilleure = S.collection.filter((c) => c.valeur != null).sort((a, b) => Number(b.valeur) - Number(a.valeur))[0];
    if (meilleure) {
      const img = meilleure.image ? await chargerImage(imageCarte(meilleure.image, "high")) : null;
      carteImage(ctx, img, 60, 950, 216, 302);
      ctx.fillStyle = "#c9cff0";
      ctx.font = "28px system-ui, sans-serif";
      ctx.fillText("Ma plus belle prise", 310, 1010);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 44px system-ui, sans-serif";
      ctx.fillText(meilleure.nom, 310, 1070);
      ctx.fillStyle = "#9dffb0";
      ctx.fillText(euros(meilleure.valeur), 310, 1130);
    }
  },

  async extension(ctx, setId) {
    const ext = S.extParId.get(setId);
    const { cartes } = await cartesDExtension(setId);
    const possedees = new Set(S.collection.filter((c) => c.set_id === setId).map((c) => c.carte_id));
    const total = (ext && (ext.officiel || ext.total)) || cartes.length;
    fond(ctx, ext ? ext.nom : setId, "Progression : " + possedees.size + " / " + total + " · " + Math.round((possedees.size / Math.max(1, total)) * 100) + " %");
    ctx.fillStyle = "rgba(255,255,255,.15)";
    rect(ctx, 60, 200, L - 120, 26, 13);
    ctx.fill();
    ctx.fillStyle = "#ffcb05";
    rect(ctx, 60, 200, Math.max(26, (L - 120) * Math.min(1, possedees.size / Math.max(1, total))), 26, 13);
    ctx.fill();
    const colonnes = 8, w = 108, hh = 151, gap = 18;
    const affichees = cartes.slice(0, 56);
    const imgs = await Promise.all(affichees.map((k) => (k.image ? chargerImage(imageCarte(k.image, "low")) : null)));
    affichees.forEach((k, i) => carteImage(ctx, imgs[i], 60 + (i % colonnes) * (w + gap), 270 + Math.floor(i / colonnes) * (hh + gap), w, hh, possedees.has(k.id) ? 1 : 0.22));
    if (cartes.length > affichees.length) {
      ctx.fillStyle = "#c9cff0";
      ctx.font = "26px system-ui, sans-serif";
      ctx.fillText("… et " + (cartes.length - affichees.length) + " autres cartes", 60, 270 + Math.ceil(affichees.length / colonnes) * (hh + gap) + 30);
    }
  },
};

export function ouvrirPartageImage() {
  const dlg = $("partage-image");
  const type = h("select", { "aria-label": "Modèle" },
    h("option", { value: "top" }, "Mon top 10"),
    h("option", { value: "chiffres" }, "Mes chiffres"),
    h("option", { value: "extension" }, "Progression d'une extension"));
  const ext = h("select", { "aria-label": "Extension", hidden: true }, S.extensions.filter((e) => e.officiel).map((e) => h("option", { value: e.id }, e.nom + (annee(e) ? " (" + annee(e) + ")" : ""))));
  const canvas = h("canvas", { width: L, height: H, class: "partage-canvas" });
  const info = h("p", { class: "muted" });
  let blob = null;

  async function dessiner() {
    ext.hidden = type.value !== "extension";
    info.textContent = "Création de l'image…";
    blob = null;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, L, H);
    try {
      await MODELES[type.value](ctx, ext.value);
      blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      info.textContent = blob ? "Image prête." : "Image indisponible.";
    } catch (e) {
      info.textContent = "Impossible de créer l'image : " + (e.message || e) + " (la lecture des images demande une connexion).";
    }
  }
  const nomFichier = () => "classeur-pokemon-" + type.value + ".png";
  const partager = () => essayer(async () => {
    if (!blob) return message("L'image n'est pas encore prête.", "ko");
    const fichier = new File([blob], nomFichier(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      try { await navigator.share({ files: [fichier], title: "Ma collection Pokémon" }); } catch { /* partage annulé */ }
    } else telecharger();
  });
  const telecharger = () => {
    if (!blob) return;
    const a = h("a", { href: URL.createObjectURL(blob), download: nomFichier() });
    document.body.append(a);
    a.click();
    a.remove();
  };
  type.addEventListener("change", dessiner);
  ext.addEventListener("change", dessiner);
  $("partage-image-contenu").replaceChildren(
    h("div", { class: "row tools" }, type, ext),
    info, canvas,
    h("div", { class: "row tools" },
      h("button", { type: "button", onclick: partager }, "📤 Partager"),
      h("button", { type: "button", class: "ghost", onclick: telecharger }, "⬇ Télécharger l'image"))
  );
  if (!dlg.open) dlg.showModal();
  dessiner();
}
