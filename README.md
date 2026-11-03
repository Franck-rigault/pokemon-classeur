# Classeur Pokémon

Gestionnaire de collection de cartes Pokémon (cartes françaises) : plusieurs comptes, collection complète par extension,
wishlist, scanner, prix Cardmarket, classeurs virtuels, produits scellés.
Application statique (HTML/CSS/JS, sans outil de build) + Supabase, hébergée sur GitHub Pages.
Les données des cartes viennent de [TCGdex](https://tcgdex.dev).

## Fonctionnalités

**Collection**
- **Extensions** : toutes les extensions par série, avec progression ; une extension s'ouvre en grille (cartes possédées en couleur, manquantes grisées, ajout rapide +/−, « j'ai toute l'extension ») ou en **album** (pages de classeur 3×3, deux pages côte à côte sur grand écran, page tournée, balayage au doigt).
- **Coût pour compléter** une extension, **liste d'achat** (liens Cardmarket, ajout groupé à la wishlist) et **mode master set** (suivi des variantes normale / reverse / holo).
- **Détail d'une carte** : image **inclinable au toucher** (reflet holo), couleurs du type du Pokémon, prix, exemplaires (quantité, état, variante, **gradation PSA/CGC/BGS**, **rangement**, prix d'achat), wishlist.
- **Mes cartes** : recherche, filtres (extension, rareté, variante, état, rangement, catégorie, type, illustrateur, PV, gradation) et tri.
- **Rechercher** : toutes les cartes qui existent pour un nom (Pokémon, Dresseur, Énergie).
- **Wishlist** par carte, avec budget estimé et impression.

**Scanner**
- Caméra ou photo → lecture du nom, du numéro et du code d'extension (OCR) → carte exacte, y compris Dresseurs et Énergies.
- **Mode continu** : lecture automatique et ajout des cartes reconnues sans ambiguïté, avec annulation.

**Au-delà des cartes**
- **Mes classeurs** : classeurs virtuels à pages de cases (3×3 par défaut), glisser-déposer pour déplacer ou échanger.
- **Scellés** : coffrets, displays, boosters avec prix d'achat, valeur et rangement.
- **Tableau de bord** : valeur, extensions les plus avancées, **répartition en anneau** (rareté, type, catégorie ou extension), plus chères, **rentabilité** (achat / valeur payée), courbe de valeur avec **survol** et ligne du total payé.

**Fake Booster (jeu)**
- **Pack gratuit et illimité** de l'extension jouable la plus récente (choisie automatiquement) : paquet à déchirer, cartes révélées une par une (la meilleure en dernier), badge **NEW** sur les cartes pas encore possédées, halos, confettis, bruitages et vibrations. Le pack gratuit s'ouvre un booster à la fois ; le « ×10 rapide » existe seulement dans la boutique.
- **1 pièce 🪙 par doublon.** Les pièces servent dans la **boutique** à acheter des boosters des autres extensions (117 jouables).
- **Prix de la boutique** = valeur moyenne d'un booster (≈ 1 € = 1 pièce), calculée d'après les prix Cardmarket de toutes les cartes de l'extension et les probabilités du jeu. Recalculée **chaque nuit** par `.github/workflows/prix-boosters.yml` (script `scripts/maj-prix-boosters.mjs`), publiée sur la branche `donnees` ; `data/prix-boosters.json` sert de copie de secours.
- Structure des boosters et probabilités propres à chaque époque (`js/jeu-regles.js`). **Les taux de drop officiels n'existent pas** : ce sont des estimations inspirées des statistiques de la communauté, faciles à ajuster.
- Inventaire de jeu **sans doublon**, séparé de la vraie collection ; **classement** entre les joueurs (valeur de l'inventaire).
- **Succès** : 38 quêtes (boosters ouverts, doublons, cartes et extensions réunies, valeur, raretés « illustration spéciale rare »…) qui rapportent des pièces à récupérer (`js/jeu-quetes.js`, colonne ajoutée par `schema-v7.sql`).
- **Duel** : chacun ouvre un booster gratuit, la carte qui vaut le plus gagne 5 🪙 (égalité : 1 🪙 chacun). Le défi est lancé à l'autre compte, qui le relève quand il veut (`schema-v8.sql`).
- **Réinitialiser mon jeu** : efface cartes, pièces, compteurs et succès du jeu (double confirmation ; la vraie collection n'est pas touchée).

**Au quotidien**
- **Recherche globale** (🔍 en haut, touche « / » ou Ctrl + K) : collection, wishlist, extensions, scellés et classeurs d'un coup.
- **Sélection multiple** dans « Mes cartes » (état, variante, rangement, favori, retrait en lot) et **vues enregistrées** (combinaisons de filtres rappelées en un clic).
- **Annuler** : après un retrait ou une modification en lot, un message propose « ↩ Annuler » pendant quelques secondes (ou Ctrl + Z) ; plus de fenêtre de confirmation.
- **⭐ Coups de cœur** : une vitrine avec vos cartes préférées. **🔁 Doublons** : les exemplaires en trop, avec un bouton pour les ranger ailleurs.
- **🎯 Objectifs** (compléter une extension ou une série, toutes les cartes d'un Pokémon, nombre de cartes, valeur), **collections thématiques** (types, illustrations rares, Pokémon de départ, illustrateurs, avec les manquantes) et **défi à deux** (comparaison avec l'autre compte).
- **Accueil** : carte du jour, objectifs en cours et nouvelles extensions apparues chez TCGdex avec les cartes des Pokémon que vous suivez.
- **Fiche carte** : note personnelle, **fiche d'achat** (boutique, date, lien de la facture), **photos de votre propre carte**, noms anglais et japonais.
- **Journal d'activité** (menu ☰), **image à partager** (top 10, chiffres, progression d'une extension), **contrôle des données** (doublons exacts, informations manquantes, cartes ou images introuvables).
- **Accessibilité** (menu ☰) : taille du texte, contraste élevé, animations réduites, focus clavier renforcé ; lien « Aller au contenu ».
- Une bannière verte annonce quand une **nouvelle version** de l'application est disponible.

**Images de cartes** : si une image TCGdex ne charge pas, l'application essaie automatiquement TCGdex en anglais, puis Scrydex, puis la Pokémon TCG API (`js/images.js`) ; sans image du tout chez TCGdex, elle tente directement ces sources.

**Comptes et données**
- Plusieurs comptes : chacun a sa collection ; on peut consulter celle de l'autre en lecture seule. Classeurs virtuels et scellés restent privés.
- **Classeur Pokémon** (compte propriétaire uniquement) : une ligne par Pokémon, synchronisé avec la collection.
- **Import CSV** (export de cette appli ou d'une autre), **export CSV**, **lien de partage** en lecture seule, **application installable** (PWA).
- **Sauvegarde complète** (menu ☰) : un fichier JSON avec cartes, wishlist, scellés, classeurs, classeur Pokémon, jeu et historique ; restauration en mode « fusionner » (ajoute ce qui manque) ou « remplacer » (télécharge d'abord une sauvegarde de l'état actuel).
- **Mode hors-ligne** : après une première ouverture en ligne, la collection, la wishlist, les scellés et les classeurs virtuels se consultent **et se modifient sans réseau** ; les changements sont mis en file d'attente (bandeau jaune) puis envoyés dans l'ordre au retour de la connexion. Les images et fiches déjà vues sont gardées par le service worker. Le jeu, le classeur Pokémon, les prix et le scanner demandent une connexion.
- **Thème sombre ou clair** (menu ☰), animations douces et squelettes de chargement.

## Mise en route

1. **Supabase** : créer un projet, lancer dans SQL Editor, dans l'ordre : `schema.sql`, `schema-v2.sql`, `schema-v3.sql`, `schema-v4.sql`, `schema-v5.sql` (jeu), `schema-v6.sql` (pièces), `schema-v7.sql` (succès), `schema-v8.sql` (favoris, notes, achats, préférences, journal, photos, duels).
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
- `js/` : modules (`main` navigation et comptes, `donnees` / `donnees-extra` données, `horsligne` file d'attente et copie locale, `api` TCGdex, `vue-*` écrans, `album`, `graphiques`, `carte3d`, `theme`, `sauvegarde`, `images` (sources de secours), `prefs`, `journal`, `annuler`, `accueil`, `vue-objectifs`, `vue-favoris`, `vue-doublons`, `recherche-globale`, `partage-image`, `sante`, `acces`, `photos`, `jeu` / `jeu-regles` / `jeu-quetes`, `scan`, `import`, `dialogue-carte`, `partage`, `export`)
- `extensions.json`, `pokemon.json`, `raretes.json` : référentiels
- `sw.js`, `manifest.json`, `icon-*.png` : application installable
