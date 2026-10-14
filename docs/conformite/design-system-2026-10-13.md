# Contrôle du Design System — 2026-10-13

## Périmètre et statut

Contrôle du kit partagé et des principaux écrans de l’application, selon [`conventions/design-system.md`](../../conventions/design-system.md), dans l’image Compose accessible sur `http://127.0.0.1:5002`.

**Statut : contrôle clôturé le 2026-10-14 à la demande de l’utilisateur.** La CI et l’image du commit `006f777` sont validées ; l’instance Compose répond sur `http://127.0.0.1:5002` et sert bien le nouveau jeton `--space-2xl`. Le parcours navigateur couvre les 11 routes principales en responsive, thème clair/sombre et contraste forcé. La clôture ne transforme pas les vérifications non exécutées en preuves : la sortie réelle d’un lecteur d’écran et l’inspection visuelle exhaustive de toutes les variantes restent explicitement non vérifiées.

## Preuves d’exécution

### CI et image

Le [run GitHub Actions 38463587093](https://github.com/HmaydaAbdo/Rh-ERP/actions/runs/38463587093), sur `006f777` (tentative 2), est terminé avec succès : les cinq jobs `postgres`, `frontend`, `backend`, `full-stack` et `backup` sont verts. Les tests frontend, le build de production, les E2E, les tests backend et la construction/publication des images passent. La tentative 1 avait reçu un `HTTP 429` de Maven Central pendant la construction de l’image backend ; la relance ciblée du job backend a réussi.

Sur l’instance Compose `http://127.0.0.1:5002`, la feuille chargée définit `--space-2xl: 4rem`, ce qui confirme le bundle frontend mis à jour. La connexion et les requêtes API fonctionnent après authentification. Une seule erreur `401` a été observée au premier rafraîchissement avant la connexion ; elle ne se reproduit pas ensuite. Aucun avertissement navigateur n’a été relevé.

### Contrôle navigateur de l’application

Connexion réussie à l’instance locale. Les routes Paie tabulaire/cartes/analytique, Employés, Chantiers, Fonctions, Équipes, Utilisateurs, Rôles, Paramètres et Journal d’audit ont été parcourus. L’instance contient 17 équipes, un utilisateur, deux rôles et des entrées d’audit ; Paie, Employés, Chantiers et Fonctions sont vides et affichent leurs états vides attendus. L’analytique Paie indique clairement qu’aucun bulletin n’est à analyser.

À 390 px, les 11 routes principales ont été parcourues ; aucune n’a de débordement horizontal de page. Le débordement des tableaux reste dans leur conteneur défilant.

En thème sombre avec `forced-colors: active`, les 11 routes principales ont été rouvertes à 390 px : chaque titre reste présent, le texte reprend les couleurs système et aucune page ne déborde horizontalement. Les rendus Paie et Journal ont été inspectés visuellement ; le tableau garde son défilement horizontal interne et les contrôles restent lisibles.

Dans le tableau Paie, les 16 colonnes déclarées restent disponibles ; les en-têtes affichent les abréviations compactes approuvées et chaque bouton de tri expose le libellé complet. Le sélecteur montre les 16 options avec une case visible par option, reste dans le viewport et défile ; `Fin` amène les dernières colonnes à l’écran et `Échap` ferme le menu. Ces points ont été vérifiés sur Compose et sont aussi couverts par les E2E du sélecteur.

### Thèmes, accessibilité et responsive

- Le catalogue `/catalogue` est contrôlé par axe en clair et en sombre dans les E2E ; les tests CI du sélecteur, du dialogue, du tableau et du graphique couvrent leurs principaux parcours clavier.
- Les pages principales ont été parcourues à 390 px en thème clair puis en thème sombre avec contraste forcé ; les 11 titres sont présents et aucune page ne déborde horizontalement.
- Les thèmes clair et sombre répondent au bouton de bascule et l’état sombre a été rétabli après le contrôle. Le test axe du dépôt couvre le catalogue clair/sombre, pas toutes les routes en contraste forcé.
- Un rendu Paie en contraste forcé a été inspecté : les cases, le défilement du sélecteur et les repères de focus restent visibles.
- Le CI vérifie aussi les cibles tactiles et les interactions mobiles ciblées ; cette passe ne simule pas un lecteur d’écran.

## Couverture traçable des composants partagés

Les états ci-dessous correspondent aux assertions déjà présentes dans les specs ; ils ne signifient pas que chaque variante a fait l’objet d’une inspection visuelle manuelle.

| Composant | États et interactions vérifiés par les specs | Parcours navigateur complémentaire |
|---|---|---|
| `stp-icon` | Icône connue/inconnue, décorative, taille héritée ou fixée | Catalogue axe clair/sombre |
| `stp-button` | Variantes, bouton/lien, icône seule, chargement, clic bloqué | Actions et formulaires E2E |
| `stp-badge` | Valeur et sévérités | Catalogue axe clair/sombre |
| `stp-dialog` | Fermé/ouvert, Échap, fermeture, non-fermé, focus piégé, tiroir | Focus piégé, retour du focus et axe du dialogue |
| `stp-menu-button` | Ouvert, action, action désactivée, bouton désactivé, icône seule | Menus d’import E2E |
| `stp-split-button` | Action principale, menu secondaire, désactivation | Import Paie E2E |
| `stp-select` | Simple/multiple, filtrage, vide, chargement, désactivé, effacement, page suivante, valeur hors page | Flèches/Entrée/Échap, `End`, viewport mobile, 16 cases Paie |
| `stp-table` | Vide/chargement, tri, pagination mémoire/serveur, ligne clavier, largeur et ordre des colonnes | Tri, pagination et réordonnancement au clavier |
| `stp-number-input` | Format `fr-FR`, bornes, décimales, saisie vide, désactivé, focus, erreur | Formulaires E2E |
| `stp-password-input` | Masquer/afficher, valeur, validation, désactivé, focus | Connexion et formulaires E2E |
| `stp-date-input` | Liaison/format, effacement, champ touché, désactivé, focus | Formulaires E2E |
| `stp-month-input` | Placeholder, ouverture, choix, Échap, erreur, désactivé, focus | Assistant d’export Paie E2E |
| `stp-message` | Information, avertissement et erreur avec annonces adaptées | Catalogue axe clair/sombre |
| `stp-field-error` | Non touché, touché/invalide, plusieurs règles, retour valide | Formulaires E2E |
| `stp-chart` | Nom accessible, création, mise à jour, clic, destruction | Flèches, Début/Fin et sélection clavier |

Références de specs : `frontend/src/app/shared/ui/<composant>/*.spec.ts` ; parcours catalogue : `frontend/e2e/catalogue.spec.ts`. Le thème système est testé dans `frontend/src/app/core/theme/theme.service.spec.ts`.

## Contrôle des jetons

Un scan des styles du frontend ne trouve pas de couleurs littérales, d’ombres d’élévation, de rayons ni de durées hors de la source de jetons. Les couleurs, opacités et élévations sont dans `frontend/src/styles/_tokens.scss`. Les deux `box-shadow` de `table.component.scss` sont des séparateurs géométriques avec couleurs de jetons, pas des ombres d’élévation.

Les espacements codés en dur trouvés par le scan ont été rattachés à l’échelle : le badge de filtres utilise `--space-xs`, les états vides des cartes/analytique utilisent désormais `--space-2xl` comme maximum de leur `clamp()`, et le retrait réservé à l’icône du sélecteur réutilise `--space-md`. Le `margin: -1px` du helper `visually-hidden` est une technique de masquage accessible, pas un espacement de mise en page.

## Vérifications non exécutées à la clôture

1. Faire une validation avec une technologie d’assistance réelle (par exemple NVDA) sur les annonces, le focus et les actions du kit, notamment tableau, menus, sélecteurs et graphique. Les arbres d’accessibilité et les tests clavier ne remplacent pas cette validation.
2. Compléter l’inspection visuelle des états applicables (survol, focus-visible, actif, désactivé, chargement, erreur) pour chaque variante du kit dans les deux thèmes et en contraste forcé. La revue navigateur de cette passe couvre les principales routes et interactions, mais pas chaque variante d’état de chaque composant.

Ces deux vérifications sont enregistrées comme réserves acceptées lors de la clôture demandée par l’utilisateur ; elles ne sont pas présentées comme réussies. Le contrôle est fermé dans le suivi. Réouvrir ce contrôle si une attestation stricte de ces deux preuves est nécessaire.
