// Outils : historique, prix, tableau de bord, partage, export, impression, installation (PWA).
// Chargé après app.js : il utilise ses variables globales (cartes, db, maj, message, euros…).

// ---------- Historique de la valeur ----------

async function enregistrerInstantane() {
  if (lectureSeule || !utilisateur) return;
  const s = statistiques();
  const { error } = await db.from("historique").upsert(
    {
      user_id: utilisateur.id,
      jour: new Date().toLocaleDateString("sv-SE"), // AAAA-MM-JJ, à l'heure locale
      valeur_possedee: s.valeurPossedee,
      valeur_wishlist: s.valeurWishlist,
      nb_possedes: s.possedes,
    },
    { onConflict: "user_id,jour" }
  );
  if (error) console.warn("Historique non enregistré :", error.message);
}

let minuteurInstantane = null;
function planifierInstantane() {
  clearTimeout(minuteurInstantane);
  minuteurInstantane = setTimeout(enregistrerInstantane, 4000);
}

// ---------- Actualisation des prix ----------

async function actualiserPrix() {
  const cibles = cartes.filter((c) => c.carte_id);
  if (!cibles.length) return message("Aucune carte choisie : rien à actualiser.", "ko");
  if (!confirm("Actualiser le prix de " + cibles.length + " carte(s) ?")) return;

  const bouton = $("btn-prix");
  bouton.disabled = true;
  const file = [...cibles];
  let faits = 0, modifies = 0, sansPrix = 0, echecs = 0;

  const travailleur = async () => {
    while (file.length) {
      const c = file.shift();
      try {
        cacheDetails.delete(c.carte_id); // on veut le prix du jour, pas celui en mémoire
        const prix = prixDe(await detailCarte(c.carte_id));
        if (prix === null) sansPrix++;
        else if (Math.abs(prix - Number(c.valeur || 0)) >= 0.005) {
          if ((await maj(c, { valeur: prix }, false)) !== false) modifies++;
          else echecs++;
        }
      } catch {
        echecs++;
      }
      faits++;
      message("Actualisation des prix : " + faits + " / " + cibles.length + "…");
    }
  };

  await Promise.all(Array.from({ length: 6 }, travailleur));
  dessiner();
  bouton.disabled = false;
  message(
    "✔ Prix actualisés : " + modifies + " modifié(s), " + (cibles.length - modifies - sansPrix - echecs) +
      " inchangé(s), " + sansPrix + " sans prix" + (echecs ? ", " + echecs + " en échec" : "") + ".",
    echecs ? "ko" : "ok"
  );
  enregistrerInstantane();
}

$("btn-prix").addEventListener("click", actualiserPrix);

// ---------- Tableau de bord ----------

function elt(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function graphique(points) {
  const L = 640, H = 200, G = 44, D = 16, B = 28, T = 14;
  const valeurs = points.map((p) => Number(p.valeur_possedee));
  const min = Math.min(...valeurs), max = Math.max(...valeurs);
  const ecart = max - min || 1;
  const x = (i) => G + (i / (points.length - 1)) * (L - G - D);
  const y = (v) => T + (1 - (v - min) / ecart) * (H - T - B);
  const ligne = points.map((p, i) => x(i).toFixed(1) + "," + y(Number(p.valeur_possedee)).toFixed(1)).join(" ");
  const aire = G + "," + (H - B) + " " + ligne + " " + x(points.length - 1).toFixed(1) + "," + (H - B);
  const date = (p) => new Date(p.jour).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 " + L + " " + H);
  svg.setAttribute("class", "graphe");
  svg.innerHTML =
    '<polygon points="' + aire + '" class="graphe-aire"/>' +
    '<polyline points="' + ligne + '" class="graphe-ligne"/>' +
    '<text x="' + (G - 6) + '" y="' + (T + 4) + '" text-anchor="end">' + euros(max) + "</text>" +
    '<text x="' + (G - 6) + '" y="' + (H - B) + '" text-anchor="end">' + euros(min) + "</text>" +
    '<text x="' + G + '" y="' + (H - 8) + '">' + date(points[0]) + "</text>" +
    '<text x="' + (L - D) + '" y="' + (H - 8) + '" text-anchor="end">' + date(points[points.length - 1]) + "</text>";
  return svg;
}

async function ouvrirDashboard() {
  const s = statistiques();
  const zone = $("dash-contenu");
  zone.textContent = "";

  // Chiffres clés
  const tuiles = elt("div", "dash-tuiles");
  const pct = s.total ? Math.round((s.possedes / s.total) * 1000) / 10 : 0;
  [
    [pct.toLocaleString("fr-FR") + " %", "Complétion (" + s.possedes + " / " + s.total + ")"],
    [euros(s.valeurPossedee), "Valeur de la collection"],
    [euros(s.valeurWishlist), "Wishlist à trouver (" + s.nbWishlist + ")"],
    [String(cartes.filter((c) => c.carte_id).length), "Cartes précisément identifiées"],
  ].forEach(([v, l]) => {
    const t = elt("div", "dash-tuile");
    t.append(elt("span", "", v), elt("small", "", l));
    tuiles.append(t);
  });
  zone.append(tuiles);

  // Progression par génération
  zone.append(elt("h3", "", "Progression par génération"));
  GENERATIONS.forEach((g, i) => {
    const lot = cartes.filter((c) => generationDe(c.numero) === i);
    if (!lot.length) return;
    const ok = lot.filter((c) => c.possede).length;
    const ligne = elt("div", "barre-ligne");
    const barre = elt("div", "barre");
    const rempli = elt("div", "barre-rempli");
    rempli.style.width = (ok / lot.length) * 100 + "%";
    barre.append(rempli);
    ligne.append(elt("span", "barre-nom", g.nom), barre, elt("span", "barre-val", ok + " / " + lot.length));
    zone.append(ligne);
  });

  // Les plus chères
  const top = cartes
    .filter((c) => c.possede && Number(c.valeur) > 0)
    .sort((a, b) => Number(b.valeur) - Number(a.valeur))
    .slice(0, 5);
  zone.append(elt("h3", "", "Mes cartes les plus chères"));
  if (!top.length) zone.append(elt("p", "msg", "Aucune carte possédée avec une valeur pour l'instant."));
  const liste = elt("ol", "top-liste");
  top.forEach((c) => {
    const li = elt("li");
    if (c.image_url) {
      const img = elt("img");
      img.src = c.image_url;
      img.alt = c.nom;
      li.className = "avec-image";
      li.append(img);
    }
    li.append(elt("b", "", c.nom), elt("span", "", [c.extension, c.numero_carte, c.rarete].filter(Boolean).join(" · ")), elt("em", "", euros(c.valeur)));
    liste.append(li);
  });
  zone.append(liste);

  // Historique
  if (!lectureSeule) {
    zone.append(elt("h3", "", "Évolution de la valeur"));
    const place = elt("p", "msg", "Chargement de l'historique…");
    zone.append(place);
    $("dash").showModal();
    const { data, error } = await db.from("historique").select("jour, valeur_possedee").order("jour");
    if (error) place.textContent = "Historique indisponible : " + error.message;
    else if (data.length < 2) place.textContent = "Le graphique apparaîtra dès le 2ᵉ jour d'utilisation (un point est enregistré par jour).";
    else place.replaceWith(graphique(data));
  } else {
    $("dash").showModal();
  }
}

$("btn-dash").addEventListener("click", ouvrirDashboard);
$("dash-close").addEventListener("click", () => $("dash").close());

// ---------- Partage en lecture seule ----------

async function ouvrirPartage() {
  const zone = $("partage-contenu");
  zone.textContent = "Chargement…";
  $("partage").showModal();

  const { data, error } = await db.from("partages").select("token").maybeSingle();
  zone.textContent = "";
  if (error) return zone.append(elt("p", "msg ko", "Partage indisponible : " + error.message));

  zone.append(
    elt("p", "", "Toute personne qui possède le lien peut consulter votre collection, sans pouvoir la modifier ni voir votre compte.")
  );

  if (!data) {
    const creer = elt("button", "", "Créer un lien de partage");
    creer.addEventListener("click", async () => {
      const { error: e } = await db.from("partages").insert({});
      if (e) return message("Création impossible : " + e.message, "ko");
      ouvrirPartage();
    });
    return zone.append(creer);
  }

  const lien = location.origin + location.pathname + "?partage=" + data.token;
  const champ = elt("input");
  champ.type = "text";
  champ.readOnly = true;
  champ.value = lien;
  champ.addEventListener("focus", () => champ.select());

  const copier = elt("button", "", "Copier le lien");
  copier.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(lien);
      copier.textContent = "✔ Copié";
    } catch {
      champ.select();
      copier.textContent = "Sélectionné : faites Ctrl+C";
    }
  });

  const arreter = elt("button", "ghost", "Désactiver le lien");
  arreter.addEventListener("click", async () => {
    if (!confirm("Désactiver ce lien ? Les personnes qui l'ont n'auront plus accès.")) return;
    const { error: e } = await db.from("partages").delete().eq("token", data.token);
    if (e) return message("Désactivation impossible : " + e.message, "ko");
    ouvrirPartage();
  });

  const ligne = elt("div", "row tools");
  ligne.append(copier, arreter);
  zone.append(champ, ligne);
}

$("btn-partage").addEventListener("click", ouvrirPartage);
$("partage-close").addEventListener("click", () => $("partage").close());

// ---------- Export CSV ----------

function exporterCsv() {
  const colonnes = [
    ["N° Pokédex", (c) => c.numero],
    ["Pokémon", (c) => c.nom],
    ["Possédée", (c) => (c.possede ? "OUI" : "NON")],
    ["Wishlist", (c) => (c.wishlist ? "OUI" : "NON")],
    ["Extension", (c) => c.extension],
    ["N° carte", (c) => c.numero_carte],
    ["Rareté", (c) => c.rarete],
    ["Valeur (€)", (c) => (c.valeur ?? "") === "" ? "" : String(c.valeur).replace(".", ",")],
  ];
  const cellule = (v) => {
    const t = String(v ?? "");
    return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const lignes = [colonnes.map(([nom]) => nom).join(";")];
  for (const c of [...cartes].sort(tris.numero)) lignes.push(colonnes.map(([, f]) => cellule(f(c))).join(";"));

  // BOM : Excel reconnaît ainsi l'UTF-8 (accents)
  const blob = new Blob(["\uFEFF" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "classeur-pokemon-" + new Date().toLocaleDateString("sv-SE") + ".csv";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  message("✔ Export de " + cartes.length + " lignes.", "ok");
}

$("btn-export").addEventListener("click", exporterCsv);

// ---------- Impression de la wishlist ----------

function imprimerWishlist() {
  const sauvegarde = {
    mode: $("filter-select").value, tri: $("tri-select").value,
    gen: $("gen-select").value, ext: $("ext-select").value, rar: $("rar-select").value, q: $("filter-input").value,
  };
  $("filter-select").value = "wishlist-manquant";
  $("tri-select").value = "numero";
  $("gen-select").value = "";
  $("ext-select").value = "";
  $("rar-select").value = "";
  $("filter-input").value = "";
  dessiner();
  document.body.classList.add("impression");

  const restaurer = () => {
    document.body.classList.remove("impression");
    $("filter-select").value = sauvegarde.mode;
    $("tri-select").value = sauvegarde.tri;
    $("gen-select").value = sauvegarde.gen;
    $("ext-select").value = sauvegarde.ext;
    $("rar-select").value = sauvegarde.rar;
    $("filter-input").value = sauvegarde.q;
    dessiner();
    window.removeEventListener("afterprint", restaurer);
  };
  window.addEventListener("afterprint", restaurer);
  // Laisse le temps aux images de la liste de se charger avant d'ouvrir l'impression
  setTimeout(() => window.print(), 600);
}

$("btn-print").addEventListener("click", imprimerWishlist);

// ---------- Fenêtres : fermeture au clic sur le fond ----------

["dash", "partage", "scan"].forEach((id) =>
  $(id).addEventListener("click", (e) => {
    if (e.target === $(id)) $(id).close();
  })
);

// ---------- Installation sur téléphone (PWA) ----------

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
