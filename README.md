# Classeur Pokémon

Gestionnaire de collection de cartes Pokémon (cartes françaises) : plusieurs comptes, collection complète par extension,
wishlist, scanner, prix Cardmarket, classeur « un Pokémon par ligne » réservé au propriétaire.
Application statique (HTML/CSS/JS, sans outil de build) + Supabase, hébergée sur GitHub Pages.
Les données des cartes viennent de [TCGdex](https://tcgdex.dev).

## Fonctionnalités

- **Extensions** : toutes les extensions par série, avec progression ; une extension s'ouvre en grille (cartes possédées en couleur, manquantes grisées, ajout rapide +/−, « j'ai toute l'extension »).
- **Détail d'une carte** : image, prix, exemplaires possédés (quantité, état, variante, prix d'achat), wishlist.
- **Mes cartes** : toute la collection à plat, avec recherche, filtres et tri.
- **Wishlist** par carte, avec budget estimé et impression.
- **Scanner** : caméra ou photo → lecture du nom, du numéro et du code d'extension (OCR) → carte exacte, y compris Dresseurs et Énergies.
- **Tableau de bord** : valeur, extensions les plus avancées, raretés, cartes les plus chères, courbe de valeur (un point par jour).
- **Plusieurs comptes** : chacun a sa collection ; on peut consulter celle de l'autre en lecture seule.
- **Classeur** (compte propriétaire uniquement) : une ligne par Pokémon, synchronisé avec la collection.
- **Partage** par lien en lecture seule, **export CSV**, **application installable** sur téléphone (PWA).

## Mise en route

1. **Supabase** : créer un projet, lancer dans SQL Editor, dans l'ordre : `schema.sql`, `schema-v2.sql`, `schema-v3.sql`.
2. **Comptes** : Authentication > Users > Add user (e-mail + mot de passe, cocher « Auto Confirm User »), un par personne.
   Désactiver les inscriptions publiques (Authentication > Sign In / Providers > « Allow new users to sign up »).
   Un profil est créé automatiquement. Le compte le plus ancien reçoit le classeur ; pour l'activer ou le retirer :
   `update profils set classeur_actif = true where nom = 'Franck';`
3. **Config** : mettre l'URL et la clé `anon public` dans `config.js` (jamais la clé `service_role`).
4. **GitHub Pages** : pousser le dossier, Settings > Pages > branche `main`, dossier `/ (root)`.

## Test en local

```bash
python -m http.server 8000
```

Puis ouvrir http://localhost:8000 (la caméra n'est autorisée que sur `localhost` ou en HTTPS).

## Mettre à jour la liste des extensions

```bash
pwsh scripts/maj-extensions.ps1
```

## Structure

- `index.html`, `style.css`, `config.js`
- `js/` : modules (`main` navigation et comptes, `donnees` collection et prix, `api` TCGdex, `vue-*` écrans, `scan`, `dialogue-carte`, `partage`, `export`)
- `extensions.json`, `pokemon.json`, `raretes.json` : référentiels
- `sw.js`, `manifest.json`, `icon-*.png` : application installable
