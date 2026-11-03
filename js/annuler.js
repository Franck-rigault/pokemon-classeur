// Petit message en bas de l'écran, avec un bouton d'action (ex. « Annuler ») ; Ctrl+Z / Cmd+Z annule aussi.
// L'élément est un « popover » : il reste au-dessus des fenêtres modales.

let zone = null;
let minuteur = null;
let actionCourante = null;

function assurer() {
  if (zone) return zone;
  zone = document.createElement("div");
  zone.className = "toast";
  zone.setAttribute("popover", "manual");
  zone.setAttribute("role", "status");
  zone.hidden = true;
  document.body.append(zone);
  return zone;
}

export function masquerToast() {
  clearTimeout(minuteur);
  actionCourante = null;
  if (!zone) return;
  zone.hidden = true;
  try { zone.hidePopover(); } catch { /* pas affiché */ }
}

// action : { libelle, faire } ; duree en millisecondes (0 = reste jusqu'à fermeture)
export function afficherToast(texte, action = null, duree = 9000) {
  const el = assurer();
  clearTimeout(minuteur);
  actionCourante = action;
  el.replaceChildren();
  const t = document.createElement("span");
  t.textContent = texte;
  el.append(t);
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = action.libelle;
    b.addEventListener("click", () => declencher());
    el.append(b);
  }
  const x = document.createElement("button");
  x.type = "button";
  x.className = "ghost toast-x";
  x.setAttribute("aria-label", "Fermer");
  x.textContent = "✕";
  x.addEventListener("click", masquerToast);
  el.append(x);
  el.hidden = false;
  try { el.hidePopover(); el.showPopover(); } catch { /* navigateur sans popover : le message reste affiché en bas de page */ }
  if (duree) minuteur = setTimeout(masquerToast, duree);
}

async function declencher() {
  const action = actionCourante;
  masquerToast();
  if (!action) return;
  try {
    await action.faire();
  } catch (e) {
    afficherToast("Impossible : " + (e && e.message ? e.message : e), null, 6000);
  }
}

// Propose d'annuler la dernière action : `inverse` doit remettre les choses comme avant
export function proposerAnnulation(texte, inverse) {
  afficherToast(texte, { libelle: "↩ Annuler", faire: async () => { await inverse(); afficherToast("↩ Action annulée.", null, 3500); } });
}

document.addEventListener("keydown", (e) => {
  if (!actionCourante || actionCourante.libelle.indexOf("Annuler") < 0) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !/^(input|textarea|select)$/i.test((e.target && e.target.tagName) || "")) {
    e.preventDefault();
    declencher();
  }
});
