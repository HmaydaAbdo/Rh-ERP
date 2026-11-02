# Inventaire des composants d'interface partagés

> État initial observé le 30 octobre 2026 dans `frontend/src/app/portail`, `frontend/src/app/shared` et le catalogue `/catalogue`.
> Cet inventaire est un point de départ vérifiable, pas une autorisation de conserver des interfaces locales.
> Le suivi de l'harmonisation frontend est dans Jira (KAN-178, correctifs Heures supplémentaires KAN-173).

## Cible

Toute interface et toute interaction d'un domaine utilisent les composants du socle partagé, configurés par des données et
des adaptateurs métier. Cette règle vaut aussi pour une interface utilisée par un seul domaine : le nombre d'utilisateurs
ne détermine pas si un composant est partagé. Aucun domaine ne possède son propre système de filtres, formulaire, tableau,
dialogue, état vide, assistant, visualisation ou style de contrôle.

Les domaines restent propriétaires de leurs modèles, règles métier, permissions, requêtes et adaptateurs. Ces éléments
alimentent les composants partagés via leur API publique et les points d'extension officiels d'Angular/CDK ; ils ne créent
pas un second rendu ou une interaction parallèle.

## Composants déjà partagés à ajouter au catalogue visible

Le catalogue actuel importe les composants de `shared/ui/`, mais n'expose pas plusieurs composants visuels déjà réutilisés.
Ils doivent être ajoutés à `/catalogue` et au registre documentaire :

| Composant existant | Démonstration à ajouter | Contrat d'exemple |
|---|---|---|
| `app-collection-shell` | En-tête, actions projetées, filtres projetés et navigation entre vues | Configuration locale déterministe et projection d'actions/filtres |
| `app-collection-table` | Barre total/outils, colonnes, cellules projetées, états chargement/vide/erreur et export | Données locales, `ColumnState`, projection de cellules |
| `app-column-chooser` | Choix, ordre et visibilité des colonnes, clavier | État de colonnes local |
| `app-lazy-select` | Recherche et chargement progressif sans backend réel | Source mémoire déterministe conforme à `LazySelectSource` |
| `app-month-picker` | Sélection de mois, navigation d'année et mois indisponibles | Valeurs locales incluant une période vide et limitée |
| `app-vue-switcher` | États actif/inactif et navigation conservant les paramètres | Routes de démonstration disponibles |

Ces composants sont déjà dans `shared/ui/` et ont des usages de production. Leur ajout au catalogue ne signifie pas
qu'il faut en créer des copies. Les vues configurables `app-cartes-perimetre` et `app-analytique-perimetre` sont également
à référencer dans le catalogue et documenter comme motifs partagés ; leurs parcours avec données réelles restent validés
par leurs tests d'intégration de vues, et la démo catalogue doit employer des données déterministes si leur API le permet.

## Composants partagés manquants à concevoir

| Besoin transversal constaté | Proposition au socle partagé | Domaines concernés |
|---|---|---|
| Barre cockpit de filtres avec champs regroupés sur une ligne, espacement cohérent, remise à zéro et filtres avancés adaptables | Proposition de nom : `app-collection-filter-bar`, structurelle et à contenu projeté ; elle fournit la mise en page et les comportements communs, les domaines fournissent les champs et critères. L'ajouter au catalogue avant migration. Vérifier les API Angular/CDK officielles avant de construire son interaction. | Paie, Heures supplémentaires, Employés, Chantiers, Équipes, Fonctions, Utilisateurs, Rôles, Journal d'audit |
| Structure commune d'assistant multistep avec progression, étapes, retour/suite, validation et résumé | Proposition de nom : `app-workflow-shell` ; évaluer puis ajouter au socle un composant configurable d'étapes. Les fichiers Excel, règles de résolution et opérations restent configurés par le domaine. | Paie (import/export) et Heures supplémentaires (import) |
| Coques communes de formulaires, fiches et authentification | Propositions de noms : `app-form-shell` et `app-auth-shell`. Les champs utilisent déjà plusieurs contrôles partagés, mais pages et sections sont encore composées domaine par domaine. Inventorier les répétitions ; ajouter au socle et au catalogue les coques/sections réellement communes, avec contenu projeté ou configuration typée. Le domaine fournit son schéma Signal Forms et ses libellés métier. | Auth, Employés, Paie, Chantier, Équipe, Fonction, Utilisateurs, Rôles, Heures supplémentaires |
| Carte interactive générique | Avant tout composant maison, évaluer l'intégration Angular officielle de MapLibre `@maplibre/ngx-maplibre-gl` (composants standalone de carte, marqueur, popup, contrôle, sources et couches). Si elle couvre l'usage, l'employer dans une façade Staport partagée et configurable ; ne garder dans le domaine que la conversion des données. Ne créer `app-map-view` que si un besoin visuel commun reste absent après cette vérification, puis le cataloguer. | Chantier aujourd'hui ; tout futur domaine cartographique |

L'API du cockpit de filtres doit supporter les particularités sans créer de modes métier : nombre variable de champs, ligne
principale, filtres secondaires repliables, action de réinitialisation, responsive, étiquette accessible et projection du
contenu. Les filtres Paie et Journal ont des champs avancés ; Heures supplémentaires a une période et des filtres
référentiels. La configuration déclare ces contenus, le composant partagé ne connaît pas ces domaines.

La conception d'un nouveau composant transversal suit la règle « framework d'abord » : examiner Angular Forms, Angular Aria,
CDK et les extensions officielles pertinentes, documenter les limites réelles puis construire seulement le raccordement Staport
qui manque. Ne pas copier un contrôle fourni par Angular/CDK.

## Inventaire des domaines et mises à jour requises

| Domaine / zone | État observé | Mise à jour nécessaire pour atteindre la cible |
|---|---|---|
| Paie / Rapport | Coque, tabulaire, cartes et analytique partagés ; filtres et assistants import/export composés dans Paie ; l'export de rapport suit les contrats métier Paie. | Remplacer la structure visuelle locale des filtres par le cockpit partagé ; brancher import/export sur l'assistant partagé après son ajout ; garder les critères, calculs, documents et étapes métier comme configuration/adaptateurs. |
| Heures supplémentaires | Coque, table, cartes et analytique partagés ; filtres écrits en ligne dans l'hôte de vues ; formulaire et import dédiés. | Utiliser le cockpit commun ; après ajout du gabarit d'assistant, utiliser ses étapes et ses contrôles partagés ; conserver les règles de S/H, forfait, CIN et préremplissage dans les services/adaptateurs du domaine. |
| Employés | Coque, table et vues partagées ; filtre dédié ; formulaire/détail métier et actions d'import. | Brancher le cockpit commun ; auditer les champs et layouts de formulaire pour n'utiliser que les contrôles/sections du socle. |
| Chantiers | Coque, table et vues partagées ; filtre dédié ; carte cartographique propre au métier. | Brancher le cockpit commun ; la carte reste une configuration de la vue cartographique partagée ou une extension générique du socle, jamais une seconde bibliothèque locale de contrôles. |
| Équipes | Coque, table et vues partagées ; filtre dédié. | Brancher le cockpit commun ; vérifier le formulaire de référence avec les mêmes sections et champs partagés. |
| Fonctions | Coque, table et vues partagées ; filtre dédié. | Brancher le cockpit commun ; vérifier le formulaire de référence avec les mêmes sections et champs partagés. |
| Administration — Utilisateurs et Rôles | `stp-table`, filtres, barre total/colonnes et enveloppe de page composés séparément ; composants de formulaire métier déjà basés sur les contrôles partagés. | Migrer l'enveloppe/table vers `app-collection-shell` et `app-collection-table` ; utiliser le cockpit commun ; garder les actions Reset/permission propres comme projections et configuration. |
| Administration — Paramètres | Liste d'éléments de configuration et éditeur intégré, pas de collection filtrable classique. | Vérifier l'usage des contrôles et états partagés ; aucun composant de filtre ni nouveau composant catalogue ne se justifie actuellement. |
| Audit — Journal | `stp-table`, filtres avec panneau avancé, barre total/colonnes et dialogue de détail composés dans le domaine. | Migrer l'enveloppe et le tableau vers les composants de collection partagés ; utiliser le cockpit commun pour filtres simples/avancés ; garder le contenu des événements et le panneau d'inspection comme données/adaptateur métier. |
| Audit — Historique et Champs | Composants de rendu des versions et différences d'audit. | Vérifier leurs primitives contre le catalogue ; les données de différence ne sont pas un nouveau composant d'interface général. Extraire au socle tout rendu de liste/état réutilisable trouvé pendant la revue. |
| Auth — connexion, mot de passe oublié/réinitialisé, accès refusé | Formulaires Signal Forms et `stp-field-error` déjà employés ; quelques entrées, boutons de visibilité du mot de passe et styles de carte restent définis dans les pages Auth. | Remplacer les contrôles refaits à la main par `stp-password-input`, les boutons et champs partagés ; cataloguer toute coque Auth ou section de formulaire commune avant de la réutiliser. Garder flux de session, jetons, validation et messages métier dans les services/configurations Auth. |
| Chantier — carte | `app-chantier-carte` porte l'initialisation et l'interaction MapLibre mais dépend encore du type métier `ChantierCarte` et vit sous le domaine Chantier. L'application utilise Angular 22.2.3 et MapLibre GL JS 6.14.0 ; la version documentée de `@maplibre/ngx-maplibre-gl` annonce des peer dependencies Angular ≥22 et MapLibre ≥6. | Évaluer la compatibilité réelle, le zoneless, les interactions, l'accessibilité et le rendu de `@maplibre/ngx-maplibre-gl` dans le projet ; préférer cette intégration officielle à notre gestion manuelle du cycle de vie. Ajouter ensuite une façade partagée de style/configuration Staport au catalogue si nécessaire. Garder dans Chantier uniquement les données et règles d'accès. |
| Périmètre partagé — Cartes et Analytique | Composants communs configurés par les hôtes Équipe, Fonction, Chantier, Employés, Paie et Heures supplémentaires. | Ajouter leur contrat et une démonstration déterministe au catalogue ; ne créer aucun rendu de cartes/analytique par domaine. |

Les détails métier, pages de création/édition, contrôles de permission, colonnes et adaptateurs d'API restent variés par nature ;
leur rendu se compose toutefois exclusivement de composants partagés. Les pages n'ont pas besoin de partager le même schéma de
données pour partager les mêmes contrôles, espacements, états, navigation et contrats d'accessibilité.

## Ordre de mise en conformité

1. Ajouter au catalogue les sept composants visuels déjà partagés et y référencer Cartes/Analytique.
2. Concevoir, tester et cataloguer la barre cockpit de filtres à partir des besoins Paie, Heures supplémentaires, Employés,
   Chantiers, Équipes, Fonctions, Utilisateurs, Rôles et Audit.
3. Migrer les filtres de ces domaines sans modifier leurs critères, permissions, URL ou contrat API.
4. Migrer Utilisateurs, Rôles et Journal vers la coque/table partagée et vérifier les projections d'actions et les états.
5. Concevoir l'assistant multistep commun à partir de la Paie et des Heures supplémentaires ; migrer leurs assistants.
6. Vérifier l'intégration officielle Angular de MapLibre dans le projet, puis partager/cataloguer sa configuration Staport ; garder un hôte Chantier limité au raccordement des données.
7. Harmoniser Auth, chaque formulaire, détail et écran de paramètres avec les composants/champs partagés ; extraire au
   catalogue les coques visuelles récurrentes et remplacer les interactions/styles locaux.
8. Ajouter un contrôle de revue/lint pour empêcher les nouveaux contrôles, filtres et mises en page applicatives de contourner
   le socle. Maintenir une liste d'exceptions temporaires approuvées, avec date d'expiration et plan de sortie.

## Limites de cet audit

L'inventaire a été établi en parcourant les composants et gabarits présents dans `frontend/src/app/portail`, les répertoires de
composants partagés et le catalogue Angular. Les exigences et l'ordre de migration sont donc des constats de code à vérifier
en navigateur et par tests au moment de chaque changement. Les fonctions sans interface (API, services et règles métier) ne
sont pas concernées par la réutilisation des composants visuels.
