const db = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const PAGE = 1000;

let cartes = [];

const normalise = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const euros = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);

function message(texte, type = "") {
  const el = $("msg");
  el.textContent = texte;
  el.className = "msg " + type;
}

// ---------- Authentification ----------

async function chargerExtensions() {
  try {
    const liste = await (await fetch("extensions.json")).json();
    const dl = $("extensions");
    for (const e of liste) {
      const o = document.createElement("option");
      o.value = e.value;
      o.label = e.label;
      dl.append(o);
    }
  } catch {
    // La liste est facultative : la saisie libre reste possible.
  }
}

async function chargerRaretes() {
  try {
    const liste = await (await fetch("raretes.json")).json();
    const dl = $("raretes");
    for (const r of liste) {
      const o = document.createElement("option");
      o.value = r;
      dl.append(o);
    }
  } catch {
    // La liste est facultative : la saisie libre reste possible.
  }
}

async function init() {
  chargerExtensions();
  chargerRaretes();
  const { data } = await db.auth.getSession();
  afficher(data.session);
  db.auth.onAuthStateChange((_evt, session) => afficher(session));
}

async function afficher(session) {
  $("login").hidden = !!session;
  $("app").hidden = !session;
  if (session) await charger();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-msg").textContent = "";
  const { error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value,
  });
  if (error) {
    $("login-msg").textContent = "Connexion impossible : " + error.message;
    $("login-msg").className = "msg ko";
  }
});

$("logout").addEventListener("click", () => db.auth.signOut());

// ---------- Données ----------

async function charger() {
  message("Chargement…");
  const tout = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await db
      .from("pokemon")
      .select("*")
      .order("numero", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(debut, debut + PAGE - 1);
    if (error) return message("Erreur de chargement : " + error.message, "ko");
    tout.push(...data);
    if (data.length < PAGE) break;
  }
  cartes = tout;
  message(cartes.length + " cartes chargées.");
  dessiner();
}

async function maj(carte, champs) {
  const ancien = { ...carte };
  Object.assign(carte, champs);
  dessiner();
  const { error } = await db.from("pokemon").update(champs).eq("id", carte.id);
  if (error) {
    Object.assign(carte, ancien);
    dessiner();
    message("Échec de la sauvegarde : " + error.message, "ko");
  }
}

// ---------- Affichage ----------

function visibles() {
  const filtre = normalise($("filter-input").value);
  const mode = $("filter-select").value;
  return cartes.filter((c) => {
    if (filtre && !normalise(c.nom).includes(filtre) && String(c.numero ?? "") !== filtre) return false;
    if (mode === "possede") return c.possede;
    if (mode === "manquant") return !c.possede;
    if (mode === "wishlist") return c.wishlist;
    if (mode === "wishlist-manquant") return c.wishlist && !c.possede;
    return true;
  });
}

function dessiner() {
  const corps = $("rows");
  corps.textContent = "";

  for (const c of visibles()) {
    const tr = document.createElement("tr");
    if (c.possede) tr.className = "possede";

    const tdNum = document.createElement("td");
    tdNum.textContent = c.numero ?? "";

    const tdNom = document.createElement("td");
    tdNom.textContent = c.nom;

    const tdPos = document.createElement("td");
    const cbPos = document.createElement("input");
    cbPos.type = "checkbox";
    cbPos.checked = c.possede;
    cbPos.addEventListener("change", () => maj(c, { possede: cbPos.checked }));
    tdPos.append(cbPos);

    const tdExt = document.createElement("td");
    const inExt = document.createElement("input");
    inExt.type = "text";
    inExt.setAttribute("list", "extensions");
    inExt.placeholder = "—";
    inExt.autocomplete = "off";
    inExt.value = c.extension ?? "";
    // Un clic vide le champ pour afficher toute la liste ; on restaure si rien n'est choisi.
    inExt.addEventListener("focus", () => { inExt.value = ""; });
    inExt.addEventListener("change", () => maj(c, { extension: inExt.value.trim() || null }));
    inExt.addEventListener("blur", () => { inExt.value = c.extension ?? ""; });
    tdExt.append(inExt);

    if (c.extension) {
      const effacer = document.createElement("button");
      effacer.type = "button";
      effacer.className = "clear";
      effacer.textContent = "✕";
      effacer.title = "Retirer l'extension";
      // mousedown : agit avant le blur du champ, qui restaurerait l'ancienne valeur
      effacer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        maj(c, { extension: null });
      });
      tdExt.append(effacer);
    }

    const champTexte = (champ, placeholder, liste) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      if (liste) input.setAttribute("list", liste);
      input.placeholder = placeholder;
      input.autocomplete = "off";
      input.value = c[champ] ?? "";
      input.addEventListener("change", () => maj(c, { [champ]: input.value.trim() || null }));
      td.append(input);
      return td;
    };

    const tdInfos = [tdExt, champTexte("numero_carte", "ex. 189/159"), champTexte("rarete", "ex. Gold", "raretes")];

    const tdVal = document.createElement("td");
    const inVal = document.createElement("input");
    inVal.type = "number";
    inVal.min = "0";
    inVal.step = "0.01";
    inVal.value = c.valeur;
    inVal.addEventListener("change", () => maj(c, { valeur: Number(inVal.value) || 0 }));
    tdVal.append(inVal);

    const tdWl = document.createElement("td");
    const cbWl = document.createElement("input");
    cbWl.type = "checkbox";
    cbWl.checked = c.wishlist;
    cbWl.addEventListener("change", () => maj(c, { wishlist: cbWl.checked }));
    tdWl.append(cbWl);

    tr.append(tdNum, tdNom, tdPos, ...tdInfos, tdVal, tdWl);
    corps.append(tr);
  }

  const wl = cartes.filter((c) => c.wishlist && !c.possede);
  $("stat-possedes").textContent = cartes.filter((c) => c.possede).length + " / " + cartes.length;
  $("stat-wl-nb").textContent = wl.length;
  $("stat-wl-val").textContent = euros(wl.reduce((s, c) => s + Number(c.valeur || 0), 0));
  $("stat-total-val").textContent = euros(
    cartes.filter((c) => c.possede).reduce((s, c) => s + Number(c.valeur || 0), 0)
  );
}

// ---------- Ajout à la wishlist par le nom (remplace F2 / F3) ----------

$("wish-input").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const saisie = normalise(e.target.value);
  if (!saisie) return message("");

  const carte = cartes.find((c) => normalise(c.nom) === saisie);
  if (!carte) return message("✘ Pokémon introuvable : " + e.target.value, "ko");

  await maj(carte, { wishlist: true });
  message("✔ " + carte.nom + " ajouté à la wishlist", "ok");
  e.target.value = "";
});

// ---------- Filtres ----------

$("filter-input").addEventListener("input", dessiner);
$("filter-select").addEventListener("change", dessiner);

// ---------- Ajout d'un Pokémon ----------

$("add-toggle").addEventListener("click", () => {
  $("add-form").hidden = !$("add-form").hidden;
});

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nouvelle = {
    numero: $("add-numero").value ? Number($("add-numero").value) : null,
    nom: $("add-nom").value.trim(),
    extension: $("add-extension").value.trim() || null,
    numero_carte: $("add-numero-carte").value.trim() || null,
    rarete: $("add-rarete").value.trim() || null,
    valeur: Number($("add-valeur").value) || 0,
  };
  const { data, error } = await db.from("pokemon").insert(nouvelle).select().single();
  if (error) return message("Échec de l'ajout : " + error.message, "ko");
  cartes.push(data);
  cartes.sort((a, b) => (a.numero ?? 1e9) - (b.numero ?? 1e9) || a.id - b.id);
  e.target.reset();
  dessiner();
  message("✔ " + data.nom + " ajouté.", "ok");
});

init();
