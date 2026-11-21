# Recettes Insta

Appli web installable (PWA) pour retrouver les recettes enregistrées dans une collection Instagram :
recherche par titre, auteur ou texte, **index par ingrédient** (avec combinaison : poulet + citron),
lien direct vers le post, et **export en PDF** d'une fiche recette propre.

Tout reste sur ton appareil (stockage local du navigateur) : rien n'est envoyé à un serveur.

En ligne : https://noliramlis.github.io/recettes-insta/ — existe aussi en **appli Android** (APK, dossier
[`android/`](android/)) qui lit Instagram toute seule : voir plus bas.

## 1. Récupérer les posts (sur ordinateur, une fois)

Instagram n'offre pas d'accès aux enregistrements pour les applis. L'extraction passe par un
« favori-bouton » (bookmarklet) qui contient le script [`extraction.js`](extraction.js) :

1. Dans l'aide de l'appli (*Comment récupérer mes posts ?*), fais glisser le bouton **📥 Recettes Insta**
   dans la barre de favoris (une seule fois ; `Ctrl+Maj+B` pour l'afficher).
2. Sur instagram.com, connecté, ouvre ta collection : *Profil → Enregistrements →* ta collection.
3. Clique sur le favori : il lit la collection page par page (avec des pauses), puis télécharge
   `recettes-insta-AAAA-MM-JJ.json` (lien, auteur, texte et miniature de chaque post).
4. Dans l'appli : menu ⋮ → *Importer l'extraction Instagram*.

Relancer plus tard n'ajoute que les nouveaux posts ; tes corrections sont conservées.
Le script utilise l'API interne du site Instagram : s'il cesse de marcher, c'est qu'Instagram a changé
quelque chose et il faudra l'adapter.

## 2. Utilisation

- **Recettes** : recherche plein texte ; en tapant un ingrédient, une suggestion permet de filtrer dessus.
- **Ingrédients** : index par catégorie avec le nombre de recettes ; en choisir plusieurs affine
  (les nombres se mettent à jour selon la sélection).
- **Fiche** : ouvrir le post dans Instagram, exporter en PDF (via l'impression → *Enregistrer en PDF*),
  corriger le titre, ajouter/retirer des ingrédients, modifier le texte de la fiche, note perso, favori,
  masquer ce qui n'est pas une recette.
- **Sélection** : appui long sur une recette (Ctrl+clic sur ordinateur), puis appuis courts pour en cocher
  d'autres ; la barre du bas propose *Tout* et *Exporter la sélection* (un PDF, une recette par page).
  *Retour* ou ✕ quitte la sélection.
- Menu ⋮ → *Exporter en PDF les recettes affichées* : toute la liste filtrée en un PDF.
- Menu ⋮ → *Sauvegarder* : fichier JSON avec tes modifications (réimportable sur un autre appareil).

## 3. Appli Android (APK, hors store)

Même interface (les fichiers du site sont copiés dans l'APK à chaque build), plus ce qu'un site ne peut pas faire :

- **Connexion à Instagram dans l'appli** (une fois, page de connexion officielle).
- Menu ⋮ → **Synchroniser avec Instagram** : choix de la collection (mémorisé), puis lecture dans un
  navigateur caché, sans PC ni fichier. Les fois suivantes, seuls les nouveaux posts sont lus.
- **Partager → Recettes Insta** depuis l'appli Instagram : le post est lu en arrière-plan et sa fiche s'ouvre.
- PDF via l'impression Android, sauvegarde via le sélecteur de fichiers.

Le navigateur caché ouvre `https://www.instagram.com/robots.txt` (page neutre, même origine que l'API web)
et y exécute [`android/app/src/main/assets/instagram.js`](android/app/src/main/assets/instagram.js).

Construire l'APK (JDK 17 et SDK Android, `sdk.dir` dans `android/local.properties`) :

```
cd android
gradlew assembleRelease     # → APK dans %LOCALAPPDATA%\Android\build\recettes-insta\app\outputs\apk\release\ (Windows)
ecettes-instappoutputspk
elease)
```

L'APK est signé avec la clé locale du PC (clé de debug) : les mises à jour doivent être construites
sur le même PC pour s'installer par-dessus.

## Structure

| Fichier | Rôle |
|---|---|
| `extraction.js` | Script du favori (ou de la console) sur instagram.com |
| `ingredients.js` | Dictionnaire d'ingrédients (catégories, variantes, quelques noms anglais) |
| `parser.js` | Analyse du texte : titre, liste d'ingrédients, préparation, ingrédients reconnus |
| `app.js` | Interface : liste, index, fiche, PDF, import/sauvegarde |
| `db.js` | Stockage IndexedDB |
| `sw.js`, `manifest.webmanifest` | Installation et fonctionnement hors-ligne |
| `android/` | Appli Android : WebView + navigateur Instagram caché + réception des partages |

Un ingrédient manque ou est mal regroupé ? Ajoute une ligne ou une variante dans `ingredients.js` :
l'analyse est refaite à chaque ouverture, toutes les recettes en profitent.
