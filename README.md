# Classeur Pokémon

Gestionnaire de collection de cartes Pokémon (cartes françaises) : plusieurs comptes, collection complète par extension,
wishlist, scanner, prix Cardmarket, classeurs virtuels, produits scellés.
Application statique (HTML/CSS/JS, sans outil de build) + Supabase, hébergée sur GitHub Pages.
Les données des cartes viennent de [TCGdex](https://tcgdex.dev).

## Fonctionnalités

**Collection**
- **Extensions** : toutes les extensions par série, avec progression ; une extension s'ouvre en grille (cartes possédées en couleur, manquantes grisées, ajout rapide +/−, « j'ai toute l'extension »).
- **Coût pour compléter** une extension, **liste d'achat** (liens Cardmarket, ajout groupé à la wishlist) et **mode master set** (suivi des variantes normale / reverse / holo).
- **Détail d'une carte** : image, prix, exemplaires (quantité, état, variante, **gradation PSA/CGC/BGS**, **rangement**, prix d'achat), wishlist.
- **Mes cartes** : recherche, filtres (extension, rareté, variante, état, rangement, catégorie, type, illustrateur, PV, gradation) et tri.
- **Rechercher** : toutes les cartes qui existent pour un nom (Pokémon, Dresseur, Énergie).
- **Wishlist** par carte, avec budget estimé et impression.

**Scanner**
- Caméra ou photo → lecture du nom, du numéro et du code d'extension (OCR) → carte exacte, y compris Dresseurs et Énergies.
- **Mode continu** : lecture automatique et ajout des cartes reconnues sans ambiguïté, avec annulation.

**Au-delà des cartes**
- **Mes classeurs** : classeurs virtuels à pages de cases (3×3 par défaut), glisser-déposer pour déplacer ou échanger.
- **Scellés** : coffrets, displays, boosters avec prix d'achat, valeur et rangement.
- **Tableau de bord** : valeur, extensions les plus avancées, raretés, plus chères, **rentabilité** (achat / valeur), courbe de valeur.

**Fake Booster (jeu)**
- **Pack gratuit et illimité** de l'extension jouable la plus récente (choisie automatiquement) : paquet à déchirer, cartes révélées une par une (la meilleure en dernier), badge **NEW** sur les cartes pas encore possédées, halos, confettis, bruitages et vibrations. Mode « ×10 rapide » avec résumé.
- **1 pièce 🪙 par doublon.** Les pièces servent dans la **boutique** à acheter des boosters des autres extensions (117 jouables).
- **Prix de la boutique** = valeur moyenne d'un booster (≈ 1 € = 1 pièce), calculée d'après les prix Cardmarket de toutes les cartes de l'extension et les probabilités du jeu. Recalculée **chaque nuit** par `.github/workflows/prix-boosters.yml` (script `scripts/maj-prix-boosters.mjs`), publiée sur la branche `donnees` ; `data/prix-boosters.json` sert de copie de secours.
- Structure des boosters et probabilités propres à chaque époque (`js/jeu-regles.js`). **Les taux de drop officiels n'existent pas** : ce sont des estimations inspirées des statistiques de la communauté, faciles à ajuster.
- Inventaire de jeu **sans doublon**, séparé de la vraie collection ; **classement** entre les joueurs (valeur de l'inventaire).

**Comptes et données**
- Plusieurs comptes : chacun a sa collection ; on peut consulter celle de l'autre en lecture seule. Classeurs virtuels et scellés restent privés.
- **Classeur Pokémon** (compte propriétaire uniquement) : une ligne par Pokémon, synchronisé avec la collection.
- **Import CSV** (export de cette appli ou d'une autre), **export CSV**, **lien de partage** en lecture seule, **application installable** (PWA).

## Mise en route

1. **Supabase** : créer un projet, lancer dans SQL Editor, dans l'ordre : `schema.sql`, `schema-v2.sql`, `schema-v3.sql`, `schema-v4.sql`, `schema-v5.sql` (jeu), `schema-v6.sql` (pièces).
2. **Comptes** : Authentication > Users > Add user (e-mail + mot de passe, cocher « Auto Confirm User »), un par personne.
   Désactiver les inscriptions publiques (Authentication > Sign In / Providers > « Allow new users to sign up »).
   Un profil est créé automatiquement. Le compte le plus ancien reçoit le classeur Pokémon ; pour l'activer ou le retirer :
   `update profils set classeur_actif = true where nom = 'Franck';`
3. **Config** : mettre l'URL et la clé `anon public` dans `config.js` (jamais la clé `service_role`).
4. **GitHub Pages** : pousser le dossier, Settings > Pages > branche `main`, dossier `/ (root)`.

Ne relancez pas `schema-v3.sql` après `schema-v4.sql` sans nécessité : v4 remplace une contrainte d'unicité de la table `collection`.

## Test en local

```bash
python -m http.server 8000
```

Puis ouvrir http://localhost:8000 (la caméra n'est autorisée que sur `localhost` ou en HTTPS).

## Mettre à jour la liste des extensions

```bash
pwsh scripts/maj-extensions.ps1
```

## Recalculer les prix des boosters à la main

Le travail GitHub le fait chaque nuit ; pour le lancer tout de suite : dépôt > onglet **Actions** > « Prix des boosters » > **Run workflow**.
En local (Node 20 ou plus) :

```bash
node scripts/maj-prix-boosters.mjs
```

Remarque : GitHub désactive les travaux planifiés d'un dépôt resté sans activité pendant 60 jours ; il suffit de les réactiver dans l'onglet Actions.

## Structure

- `index.html`, `style.css`, `config.js`
- `js/` : modules (`main` navigation et comptes, `donnees` / `donnees-extra` données, `api` TCGdex, `vue-*` écrans, `scan`, `import`, `dialogue-carte`, `partage`, `export`)
- `extensions.json`, `pokemon.json`, `raretes.json` : référentiels
- `sw.js`, `manifest.json`, `icon-*.png` : application installable
