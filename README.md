# Recettes Insta

Appli web installable (PWA) pour retrouver les recettes enregistrées dans une collection Instagram :
recherche par titre, auteur ou texte, **index par ingrédient** (avec combinaison : poulet + citron),
lien direct vers le post, et **export en PDF** d'une fiche recette propre.

Tout reste sur ton appareil (stockage local du navigateur) : rien n'est envoyé à un serveur.

En ligne : https://noliramlis.github.io/recettes-insta/

## 1. Récupérer les posts (sur ordinateur, une fois)

Instagram n'offre pas d'accès aux enregistrements pour les applis. Le fichier [`extraction.js`](extraction.js)
se lance à la main dans la console du navigateur, sur instagram.com, connecté à ton compte :

1. Ouvre ta collection : *Profil → Enregistrements →* ta collection.
2. `F12` → onglet *Console* → colle le script (bouton *Copier le script* dans l'aide de l'appli) → `Entrée`.
3. Il lit la collection page par page (avec des pauses), puis télécharge `recettes-insta-AAAA-MM-JJ.json`
   (lien, auteur, texte et miniature de chaque post).
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
- Menu ⋮ → *Exporter en PDF les recettes affichées* : un PDF avec une recette par page.
- Menu ⋮ → *Sauvegarder* : fichier JSON avec tes modifications (réimportable sur un autre appareil).

## Structure

| Fichier | Rôle |
|---|---|
| `extraction.js` | Script à coller dans la console d'Instagram |
| `ingredients.js` | Dictionnaire d'ingrédients (catégories, variantes, quelques noms anglais) |
| `parser.js` | Analyse du texte : titre, liste d'ingrédients, préparation, ingrédients reconnus |
| `app.js` | Interface : liste, index, fiche, PDF, import/sauvegarde |
| `db.js` | Stockage IndexedDB |
| `sw.js`, `manifest.webmanifest` | Installation et fonctionnement hors-ligne |

Un ingrédient manque ou est mal regroupé ? Ajoute une ligne ou une variante dans `ingredients.js` :
l'analyse est refaite à chaque ouverture, toutes les recettes en profitent.
