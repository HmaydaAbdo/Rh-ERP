# Frontend

> Conventions Angular applicables à tout le frontend. Document générique et réutilisable d'un
> projet à l'autre — aucun nom de domaine métier propre à un projet particulier n'y figure.

## Technologies et version

Utiliser la version majeure stable la plus récente et prise en charge d'Angular, avec son dernier correctif compatible. Dès qu'une nouvelle majeure stable paraît, planifier sa mise à niveau et progresser sans conserver durablement une majeure ancienne. Si une incompatibilité réelle impose un report, documenter le blocage, son responsable et sa date de réexamen. Vérifier les matrices officielles et les dépendances peer entre Angular, CLI, Node.js, TypeScript, RxJS et les bibliothèques UI. Verrouiller les versions dans le lockfile et le runtime CI ; ne pas utiliser de versions alpha, bêta, candidates ou snapshots en production.

* Angular standalone, lazy-loaded, Signals pour l'état réactif et détection zoneless (zoneless est le défaut d'Angular 21+; ne pas réactiver Zone.js par provider).
* Angular Aria/CDK comme primitives accessibles et fondation des composants Staport, sans dépendance à une suite commerciale de widgets.
* Tailwind CSS 4 pour les utilitaires, SCSS/CSS pour les composants et jetons de design.
* Lucide Angular pour les icônes. PrimeNG, PrimeIcons et PrimeFlex ne sont pas utilisés.
* Signal Forms (`@angular/forms/signals`) pour tous les formulaires et champs de saisie ; Reactive Forms et `ngModel` ne sont plus utilisés. RxJS reste le format HTTP et flux.

Les composants partagés composent Aria/CDK avec le langage visuel Staport; utiliser des éléments HTML natifs lorsque l'interaction est simple. Ne jamais ajouter PrimeNG, PrimeIcons ou PrimeFlex. Toute évolution de ce choix est une décision d'architecture et exige une revue des coûts, licences, accessibilité, zoneless, bundle et maintenance.

## Workflow Angular

1. Vérifier la version majeure stable la plus récente prise en charge et les matrices officielles Angular/Node/TypeScript/RxJS ; fixer le runtime dans la configuration du projet et de la CI.
2. Mettre à jour une version majeure à la fois avec l'outil de migration officiel, examiner chaque migration générée et garder les paquets du framework alignés. Ne pas mêler à une mise à niveau une réécriture globale des composants ou des formulaires.
3. Examiner peer dependencies et licences de chaque dépendance directe ou transitive. Préférer les API Angular natives, Aria/CDK et composants Staport.
4. Pour chaque étape, exécuter l'installation reproductible, lint/typecheck, tests unitaires/composants, build de production et tests E2E. Ne pas masquer une incompatibilité par une résolution forcée ou une augmentation arbitraire des budgets.
5. Examiner notes de version et dépréciations; valider navigation, accessibilité, thèmes, responsive, performances et bundle sur les parcours concernés.

Une migration n'est terminée que lorsque les dépendances sont reproductibles sans contournement, le runtime reste supporté, les licences sont confirmées et les validations sont vertes.

---

# Architecture

Le frontend est organisé par domaines métier.

Exemple :

```text
portail/
├── <domaine-a>/
├── <domaine-b>/
├── <domaine-c>/
└── ...
```

L'organisation doit refléter les domaines du backend.

Ne jamais créer un dossier technique regroupant plusieurs domaines.

---

# Composants

* Tous les composants, directives et pipes applicatifs sont standalone; ne pas créer de NgModule métier.
* Un composant possède une seule responsabilité.
* Les composants contiennent uniquement la logique de présentation.
* Toute logique métier appartient à un Service.
* Activer le mode strict TypeScript et conserver des types explicites aux frontières des API et bibliothèques ; ne pas contourner les erreurs de types par `any` ou des assertions injustifiées.
* Utiliser les templates sémantiques et le control flow Angular (`@if`, `@for`, `@switch`) ; ne pas créer de logique métier complexe dans les templates.
* Conserver le défaut OnPush de la version Angular cible et expliciter `ChangeDetectionStrategy.OnPush` quand cela rend l'intention lisible. Importer seulement les directives/composants Aria/CDK nécessaires.
* Les composants métier restent dans leur domaine; les composants Staport partagés exposent une API explicite et cohérente.

### Signals et état réactif

* Utiliser `signal()` pour l'état local modifiable et `computed()` pour les valeurs dérivées. Réserver `effect()` à la synchronisation avec un effet externe, pas à la copie d'un signal vers un autre.
* Utiliser `linkedSignal()` seulement lorsqu'un état dérivé doit rester modifiable par l'utilisateur tout en suivant une nouvelle valeur source ; préférer `computed()` pour un état strictement dérivé.
* Exposer un état en lecture seule lorsque sa mutation doit rester privée. Utiliser Signals pour l'état consommé par le template et les API Signal stables de la version ciblée.
* Les Observables restent le format des API HTTP, événements continus et orchestration d'annulation/retry. Convertir avec `toSignal()` à la frontière lorsque le template consomme le flux comme état; ne pas conserver en parallèle le même état dans un Observable et un Signal.
* Utiliser `resource()` / `httpResource()` pour des lectures déclaratives pilotées par Signals lorsque l'annulation et l'état `loading/error/value` simplifient réellement le parcours. Les Resources sont réservées aux lectures, jamais aux mutations.
* Ne jamais compter sur Zone.js pour actualiser un champ ordinaire depuis une souscription. Utiliser Signals, `AsyncPipe`, événements Angular ou une API de détection documentée.
* Utiliser `takeUntilDestroyed()` pour les souscriptions liées au cycle de vie; toute souscription manuelle doit avoir une durée de vie explicite.

### Zoneless

* Angular 21+ est zoneless par défaut : ne pas fournir `provideZoneChangeDetection()`. Retirer Zone.js des dépendances, polyfills et tests. Toute exception d'un adaptateur tiers est isolée, documentée et testée.
* Vérifier les mises à jour après HTTP, formulaires, navigation/guards, dialogs, notifications, timers et événements des composants tiers sans Zone.js.
* Le socle doit compiler et exécuter tests/build sans Zone.js. Tester les notifications de rendu asynchrones, et ne pas ajouter une dépendance Zone comme correctif.

### Formulaires

Signal Forms est le standard pour tous les formulaires. Utiliser les schémas typés pour centraliser validation,
état des champs et soumission ; les contrôles partagés implémentent les interfaces Signal Forms adaptées. Ne pas
introduire Reactive Forms ou les formulaires pilotés par template (`ngModel`) dans un formulaire applicatif.

Quand un domaine propose un import de données, le formulaire et l'import couvrent les mêmes champs métier dans
les deux sens. Les valeurs de référence peuvent avoir une représentation adaptée au parcours (par exemple un
sélecteur d'employé dans le formulaire et un CIN dans le fichier), mais le champ métier correspondant reste
présent dans les deux. Les métadonnées propres au format d'import, comme le numéro de ligne, ne sont pas des
champs métier. Le formulaire et l'import appliquent le même statut obligatoire ou facultatif. Le formulaire rend
ce statut visible dans chaque libellé : marqueur `*` pour les champs requis, mention « (facultatif) » ou
« (facultative) » pour les autres.

---

# Injection de dépendances

Toujours utiliser :

```ts
inject()
```

Ne jamais utiliser l'injection par constructeur.

Exemple :

```ts
private readonly xxxService = inject(XxxService);
```

---

# Services

Les Services :

* centralisent les appels HTTP ;
* portent l'orchestration et l'état applicatif côté frontend ;
* sont l'unique accès au backend.

Un composant ne fait jamais d'appel HTTP directement. Le frontend peut valider une saisie pour guider
l'utilisateur, mais les règles métier faisant autorité et leur validation restent côté backend.

---

# Formulaires (Signal Forms)

Tous les formulaires, y compris les barres de filtres et les champs isolés (recherche, confirmation), utilisent Signal Forms (`form()`, `FormField`, `FormRoot`) ; l'API est stable depuis Angular 22. Reactive Forms (`FormBuilder`, `FormGroup`, `formControlName`) et Template Driven Forms (`ngModel`) sont interdits.

* **Modèle** : un `signal` typé porte les valeurs ; `form(modele, schema, { submission })` en dérive les champs. Les règles de validation sont dans le schéma (`required`, `maxLength`, `min`, `email`, `validate`, `disabled`), chacune avec son `message` : le message affiché est celui de la règle. Une règle métier réutilisable est une fonction de schéma (ex. `motDePasseConforme(chemin)`).
* **Gabarit** : `<form [formRoot]="form">` (soumission sans rechargement, `novalidate`), `[formField]="form.champ"` sur un champ natif ou un contrôle du kit, `<stp-field-error [field]="form.champ" />` pour le message sous le champ (annoncé, affiché une fois le champ touché ou le formulaire soumis).
* **Soumission** : l'action est déclarée dans `submission` (`action`, et `onInvalid: focaliserPremiereErreur`). Elle marque tous les champs touchés, ne s'exécute que si le formulaire est valide et fournit `form().submitting()` pour le bouton (plus de signal `saving` à la main). Une requête HTTP s'attend avec `attendreEnregistrement` : une erreur HTTP, déjà notifiée par `errorInterceptor`, laisse le formulaire affiché.
* **État** : charger un enregistrement = `modele.set(...)` (le formulaire reste intact) ; enregistrer = `form().reset()` avant de naviguer, de sorte que `unsavedChangesGuard` (qui lit `form().dirty()`) ne pose pas de question.
* **Filtres de liste** : le modèle des filtres est un signal ; `debounce(chemin.champ, 300)` retarde les champs texte, `surChangementDesFiltres(filtres, () => this.onSearch())` relance la recherche (sauf à l'initialisation) ; « Réinitialiser » = `form().reset(valeursVides())`.
* **Contrôles du kit** : un champ du kit est un `FormValueControl` (`value = model()`, `disabled = input()`, `touch = output()`, `focus()`), jamais un `ControlValueAccessor`. Ses bornes (`min`, `max`) viennent des règles du schéma.
* **Parité avec les imports** : maintenir la même liste de champs métier et les mêmes statuts obligatoire/facultatif entre le contrat d'import et le formulaire du domaine, dans les deux sens ; afficher le statut dans le libellé et couvrir cette parité dans les tests du formulaire et de l'import.

Interdictions :

* `ngModel` et Reactive Forms ;
* mélanger un champ Signal Forms et un champ à l'état propre dans un même formulaire.

---

# Sélecteurs (listes déroulantes)

Un composant générique unique sert à tout sélecteur ou multisélecteur de l'application, sans
exception, qu'il propose une liste métier ou un choix fini (période, statut, taille de page ou
indicateur). Il fournit toujours une recherche et révèle les options par blocs au défilement. Une
petite liste ne désactive pas ces interactions.

## Cardinalité

* Un filtre de liste (recherche/filtre d'une page de résultats) sur une dimension à cardinalité
  réelle (plus de 2-3 valeurs typiques) est **toujours** en sélection multiple.
* Un champ de formulaire qui pilote une relation unique de l'enregistrement édité (une clé
  étrangère à cardinalité 1) reste en sélection simple — le multiselect n'a de sens que là où
  sélectionner plusieurs valeurs à la fois est une opération métier valide ; l'appliquer à une
  relation unique permettrait d'enregistrer un état métier impossible.
* Une relation réellement multiple (many-to-many) reste en sélection multiple, dans les deux
  contextes (formulaire et filtre).
* Exception admise, jamais un oubli silencieux mais une exception explicite documentée à l'endroit
  du code concerné : un filtre à cardinalité intrinsèquement binaire (ex. un statut actif/inactif)
  peut rester en sélection simple si le multiselect n'apporterait rien.

## Recherche et chargement différé

* Toute liste métier adossée au backend utilise `app-lazy-select` et son contrat de recherche côté
  serveur au fil de la frappe (débounce obligatoire) et de chargement paginé au défilement.
* Toute liste finie est passée au même `stp-select` : recherche dans les libellés puis chargement
  paresseux par blocs au défilement. Les blocs sont un mécanisme commun de rendu, même lorsqu'une
  liste courte tient dans le premier bloc.
* Aucun `<select>` natif, contrôle maison, ou option désactivant recherche et défilement paresseux
  n'est ajouté dans un écran. Les listes à source backend ne sont jamais chargées intégralement
  pour simuler recherche ou pagination côté client.
* Un domaine qui expose un sélecteur fournit une implémentation du contrat correspondant (une
  méthode de pagination filtrée + une résolution par identifiant, pour afficher correctement une
  valeur déjà sélectionnée avant même que sa page ne soit chargée, ex. en modification) — jamais
  une duplication de la pagination/du debounce dans chaque composant consommateur.

## Largeur du panneau

Le panneau d'options d'un sélecteur ne doit jamais être limité à la largeur (étroite) du champ qui
l'ouvre, notamment dans une barre de filtres : les libellés longs seraient tronqués et une barre de
défilement horizontale apparaîtrait. Le composant partagé impose une largeur minimale issue des
tokens `--select-panel-min-width` / `--select-panel-max-width` (`_tokens.scss`) et masque le
défilement horizontal — ne jamais contourner cette règle dans un écran, corriger le composant. Le
panneau reste dans la fenêtre du navigateur, garde son défilement vertical visible lorsque la liste
dépasse sa hauteur et fait défiler l'option active pendant la navigation clavier.

## Composant partagé

Le composant partagé encapsule le composant de sélection simple et le composant de sélection
multiple de la librairie UI derrière un seul point d'entrée (`FormValueControl`, lié par `[formField]`) — la valeur
exposée au formulaire hôte reste un identifiant (ou un tableau d'identifiants), jamais l'objet
complet, pour ne rien changer aux DTO existants. Toute nouvelle liste déroulante du projet réutilise
ce composant plutôt que d'implémenter sa propre pagination/recherche.

---

# Tableaux

Tout tableau de données utilise un composant Staport accessible bâti sur HTML natif et Aria/CDK. Pour une grille très dense
ou nécessitant virtualisation avancée, AG Grid Community peut être chargé à la demande après validation du contrat, de la
licence et du bénéfice mesuré. Toute grille respecte les exigences suivantes :

* **Tri** : toute colonne de données est triable au clavier et à la souris ; seules les
  colonnes d'actions ne le sont pas.
* **Redimensionnement** par poignée pointeur et flèches gauche/droite au clavier, **réordonnancement** par glisser-déposer ou
  Alt + flèches sur le bouton d'en-tête, et **choix des colonnes visibles** (composant partagé `app-column-chooser`).
* **Pagination** avec total lisible, page courante, options de taille et navigation accessible.
* **Filtres en temps réel** (délai de saisie de 300 ms) : aucun bouton « Rechercher », seul un bouton
  « Réinitialiser » reste dans la barre de filtres.

## Style unique

Tous les tableaux interactifs ont **le même style**, défini une seule fois dans le design system Staport
(`shared/ui/table/table.component.scss`, couleurs dans les tokens `--table-*` de `styles/_tokens.scss`) : lignes compactes, grille
visible, en-têtes en majuscules sur fond neutre, alternance de lignes, survol, état vide illustré, paginateur compact. Les classes d'alignement
(`text-center`, `text-right`) et de graisse (`font-semibold`, `font-bold`) utilisées par `TableColumn.align` et
`cellClass` y sont définies. **Aucun écran ne redéfinit ces règles** : toute évolution du style se fait dans
`table.component.scss`, pour tous les tableaux interactifs à la fois. Un petit tableau statique de résultats d'import peut utiliser
`app-static-table-scroll` et `app-static-table` (`styles/_page.scss`) ; il garde un nom accessible, une légende, des en-têtes
`scope="col"` et un défilement clavier/tactile indépendant. Ne pas utiliser cette exception pour une liste métier.

## Colonnes pilotées par la configuration

Les colonnes sont déclarées une seule fois dans le composant (`TableColumn`, voir
`shared/table/table-columns.ts`) et regroupées dans un `ColumnState` :

```ts
readonly columns = new ColumnState([{ field: 'code', header: 'Code' }, ...]);
readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
readonly pageReport = TABLE_PAGE_REPORT;
```

L'en-tête et le corps parcourent `columns.visible` (`@for`), le corps choisissant le rendu de chaque
colonne par `@switch (col.field)` ; la table reçoit `[columns]="columns.visible"` et
`(onColReorder)="columns.onReorder($event.columns)"`. Le corps ne doit **jamais** écrire ses `<td>`
en dur dans l'ordre d'origine : le réordonnancement ne déplacerait alors que l'en-tête. Le
`colspan` du message « aucun résultat » vaut `columns.visible.length + 1` (colonne d'actions).

Un en-tête **groupé** sur plusieurs lignes (`colspan`/`rowspan`) est à proscrire sauf besoin métier documenté et validation
accessibilité des en-têtes associés.

## Tri

* Tableau paginé côté serveur (`[lazy]="true"`) : `TableColumn.sortField` porte le chemin de propriété
  de l'entité (ex. `chantier.code` pour une relation) transmis tel quel au paramètre `sort` du
  backend (`Pageable`) — chaque champ ajouté doit être testé contre le backend (un chemin invalide
  provoque une erreur 500). Une relation facultative (clé étrangère nullable) ne doit pas faire
  disparaître les lignes sans valeur du résultat trié.
* Tableau non paginé côté serveur (liste complète en mémoire, ex. rôles, utilisateurs) : tri,
  pagination et filtres sont faits côté client par le composant Staport ; `sortField` peut cibler un nombre
  d'éléments (ex. `permissions.length`).
* Une nouvelle colonne s'ajoute toujours avec son tri, dans le même changement.

---

# Templates

Utiliser exclusivement le nouveau Control Flow Angular.

Autorisé :

```html
@if (...)

@for (...)

@switch (...)
```

Interdit :

```html
*ngIf

*ngFor

*ngSwitch
```

---

# Gestion de l'état

* RxJS/Observables pour les flux asynchrones (HTTP, événements répétés dans le temps) — un
  intercepteur ou un Service qui expose un flux continu reste en RxJS.
* Angular Signals (`signal`, `computed`) — autorisés, choix confirmé le 2026-10-03 (déjà utilisés par
  `AuthService` et `AppComponent`) — pour un état synchrone simple porté par un Service ou un
  composant (ex. utilisateur courant, état d'authentification, dérivés calculés d'un état local) —
  préférer un Signal à une propriété de classe mutable brute dès que des composants doivent réagir
  à ce changement d'état.
* Ne pas mélanger les deux paradigmes pour la même donnée dans le même Service — un état est soit
  un flux RxJS, soit un Signal, jamais dupliqué sous les deux formes en parallèle.

---

# Lazy Loading

Toute nouvelle page utilise :

* loadComponent
* loadChildren

Ne jamais importer directement une page dans les routes.

---

# Pattern des trois vues métier

Tout domaine métier qui présente une collection consultable propose trois vues du même périmètre : **Tabulaire**,
**Cartes** et **Analytique**. Elles offrent trois façons de lire les données du domaine; elles ne créent pas trois
sources de vérité ni trois règles métier.

* La coque et l'assemblage Tabulaire utilisent les composants configurables partagés de
  `shared/components/collection-shell/` et `shared/components/collection-table/` (ADR 0012). Le domaine reste
  propriétaire de ses routes, filtres, adaptateur de données, colonnes, cellules, actions et permissions. Il fournit
  une configuration typée et projette ses filtres/actions et gabarits; aucun contrat métier ni branche conditionnelle
  par domaine ne doit être ajouté au socle partagé. Ne pas créer de classe de base commune.
  La coque et Tabulaire sont donc partagés eux aussi. Le contenu des vues **Cartes** et **Analytique** est partagé
  par tous les modules : voir « Cartes par niveaux et Analytique graphique » ci-dessous.
* Les routes de collection sont regroupées sous une coque de domaine : la route racine affiche Tabulaire,
  `/cartes` affiche Cartes et `/analytique` affiche Analytique. Les pages de création, de consultation et de
  modification restent hors de cette coque.
* Le sélecteur, le titre et l'emplacement des actions gardent la même place dans les trois vues. Les filtres sont propres
  au domaine; lorsqu’ils s’appliquent à plusieurs vues, ils sont visibles au même endroit et leurs valeurs sont
  synchronisées avec les paramètres d’URL afin de permettre le lien direct, le rechargement et le retour navigateur.
  Un filtre n’est partagé entre des vues que s’il a le même sens métier dans chacune.
* Chaque vue charge son propre contenu par une route lazy-loaded. Cartes représente les enregistrements du domaine
  avec une organisation adaptée à leur lecture; Analytique définit explicitement ses indicateurs, périodes, filtres
  et autorisations. Une projection provenant d’un autre domaine passe par son contrat public et ne redéfinit pas
  ses règles métier.
* Les trois vues appliquent la même permission de lecture du domaine et conservent les permissions d’écriture sur
  les seules actions et routes qui les exigent. Les différences d’affichage ne remplacent jamais les contrôles
  d’accès backend.
* La navigation entre vues conserve les filtres et le contexte métier communs. Les états de chargement, erreur,
  absence de données, clavier, lecteur d’écran, responsive et thèmes sont vérifiés pour chaque vue.

Avant de livrer un domaine, documenter dans son README le rôle des trois vues et la définition de ses indicateurs;
ajouter les routes et permissions à son document RBAC lorsqu’elles changent. Ne pas afficher un onglet « disponible
prochainement » sans parcours livré.

## Cartes par niveaux et Analytique graphique (vues partagées)

Les vues **Cartes** et **Analytique** de **tous** les modules — Paie, Employés, Équipes, Fonctions, Chantiers, et tout futur
module — sont les composants partagés de `portail/perimetre/` (ADR 0011 et ADR 0014). Il est interdit d'écrire une Cartes ou une
Analytique propre à un module : on décrit le module, on ne copie pas la vue.

**Ce qui reste propre au module** : ses routes, filtres, colonnes, cellules, actions, adaptateurs, règles métier, hiérarchie
de navigation et priorité de ses indicateurs.
**Ce qui est partagé et configuré par le module** : la coque, le tableau Tabulaire, le rendu des Cartes et les composants
graphiques de l'Analytique. Le module déclare ses libellés et l'ordre des sources métier; le socle partagé n'identifie aucun
domaine et ne contient pas de branche conditionnelle métier.

### Exporter les données des vues

Chaque composant de données des vues de collection — **Tabulaire, Cartes et Analytique** — fournit son propre export.
L'export comprend tout le résultat du filtre actif, même lorsque la vue est paginée ou développe une liste par étapes;
un graphique inclut aussi ses données sous forme de tableau. L'export suit le périmètre et les permissions actifs et
ne révèle aucune donnée inaccessible à l'utilisateur. Les règles métier et les libellés sémantiques du domaine
s'appliquent aussi au document. Chaque README de domaine précise le format et les limites de ses exports. Les tests
vérifient la parité entre le document exporté et les données complètes de la vue.

L'action d'export PDF est une icône sans bordure permanente placée en haut à droite du composant ou de sa barre d'outils,
dans le conteneur des données qu'elle exporte. Si une carte offre d'autres actions, son export rejoint leur rangée
d'icônes dans le pied de carte; les actions sont réparties sur toute la largeur disponible. Le survol et le focus mettent en évidence le composant concerné.
Dans le Tabulaire partagé, utiliser l'emplacement
prévu dans la barre du tableau, à côté du choix des colonnes. Chaque composant de données exportable
conserve son action propre, même lorsqu'un export de l'ensemble de la vue existe. Le bouton porte
un nom accessible et une infobulle qui précisent le contenu exporté ; il reste visible et utilisable
au clavier et sur écran tactile. L'impression partagée permet d'imprimer ou d'enregistrer un PDF
contenant tout le résultat filtré, selon les droits actifs.

### Brancher un module

1. Écrire `<module>-module.ts` : une fonction (ou une constante) qui renvoie un `ModulePerimetre` — clé, pluriel, début du
   fil (« Tous les chantiers »), dimension du référentiel (`null` si le module n'en a pas : Employés, Paie), hiérarchie
   obligatoire des niveaux Cartes, ordre des sources analytiques, libellés métiers spécifiques, route et permission, les
   paramètres de retour à la vue Tabulaire, les critères Employés et Paie que ses filtres produisent, et son référentiel éventuel.
2. Écrire deux hôtes minces, `<module>-cartes.component.ts` et `<module>-analytique.component.ts`, dont le gabarit tient en
   une ligne (`<app-cartes-perimetre [module]="module" />`). Un hôte peut projeter `#actionsCarte` pour ajouter ses boutons
   propres à chaque carte ; il peut appeler `recharger()` après une action.
3. Router `/<module>/cartes` et `/<module>/analytique` sous la coque du module.
4. Tester la description du module (`<module>-module.spec.ts`) et ajouter le parcours des trois vues aux tests E2E.

### Le périmètre est dans l'URL

`chantierIds`, `equipeIds` (`0` = sans équipe), `fonctionIds` et `periode` (`AAAA-MM`). L'ordre des dimensions Cartes est
déclaré dans le module, et non dans l'URL : les anciens paramètres `par` sont ignorés. Les filtres propres au module s'y
ajoutent et ne les remplacent jamais ; une valeur invalide est ignorée. La barre de filtres d'un module écrit ses paramètres
**en fusion** avec l'URL (`queryParamsHandling: 'merge'`), pour ne pas perdre les étapes ni le mois. Changer de vue conserve
tous les paramètres métier.

### Cartes : parcours hiérarchique

- Chaque module définit une **hiérarchie métier fixe** de dimensions. La vue affiche le premier niveau disponible, puis avance au
  niveau suivant lorsqu'une carte est ouverte; elle ne propose pas de sélecteur libre de regroupement. Le module Paie commence
  par les mois, puis suit sa hiérarchie déclarée.
- Ouvrir une carte en fait une **étape du fil** (le paramètre d'URL de sa dimension, une seule valeur) ; chaque étape se retire
  seule ; le fil ne montre jamais un identifiant technique. Les fiches Employé forment le dernier niveau lorsque le droit de
  lecture est accordé.
- Chaque carte réunit les **fiches Employé** (dernier état importé) et, lorsque `PAIE_READ` est accordée, les quatre mesures du
  mois : **Effectif (personnes)**, **Masse salariale (DH)**, **STC (personnes)** et **STC (DH)**. Chaque mesure présente son
  libellé, sa valeur et sa comparaison au mois calendaire précédent : écart en personnes, pourcentage en DH. La comparaison
  utilise uniquement ce mois contigu, jamais un mois antérieur plus ancien. Un groupe absent du mois précédent vaut zéro si
  des données y sont enregistrées; si le mois n'existe pas, la comparaison est indiquée comme indisponible. Un montant dont
  la base précédente est nulle n'est pas converti en pourcentage. Le module Paie commence par la liste des mois tant qu'aucun
  mois n'est choisi.
- Au niveau de la dimension du module, **toutes** les entrées du référentiel sont des cartes, même sans fiche ni bulletin
  (chiffres à zéro, jamais inventés). Dès qu'une autre dimension restreint le périmètre, seules les cartes qui ont des données
  existent. Le statut métier du référentiel se montre en pastille.
- Un lien « Voir la liste » (Tabulaire du module, avec ses filtres propres) et « Voir les employés » (périmètre courant) sont
  toujours disponibles.

### Analytique : un tableau de bord graphique

- Chaque module déclare l'ordre de ses sources analytiques et ses libellés propres; la source principale vient en premier.
  Les projections Employé et Paie restent chacune dans leur bloc et respectent leurs permissions.
- Côté **Paie** : chiffres du mois avec leur variation, **évolution mensuelle** sur tout l'historique (une seule mesure à la
  fois, un seul axe : masse, effectif, STC en personnes, STC en dirhams ; le mois analysé est mis en valeur), **répartition**
  en barres par une autre dimension (un clic sur une barre approfondit le périmètre), tranches de total, mouvements mois par
  mois, qualité des données. Côté **fiches Employé** : chiffres clés, pyramide des âges, ancienneté, répartition en poste /
  sortis. Chaque graphique est accompagné de son tableau de données (« Voir les données »).
- Un mois sans bulletin garde l'historique du périmètre et affiche les indicateurs à zéro avec un message explicite.

### Règles communes

- **Filtres cohérents** : les filtres propres au module agissent de la même façon dans les trois vues. Quand ils restreignent
  le référentiel, le référentiel filtré borne les fiches et la paie ; s'il est vide, aucune source n'est interrogée.
- **Droits** : chaque source n'est lue qu'avec son droit (`EMPLOYEE_READ`, `PAIE_READ`) et son bloc est remplacé par une phrase
  claire sinon. Une source en panne n'efface pas les autres.
- **Accessibilité** : listes de définitions valides (`dt` / `dd`), contraste vérifié (axe) sur Cartes et Analytique, graphiques
  accompagnés d'un tableau, fil et parcours des cartes au clavier.

---

# Performance des écrans

* Contrôler la taille du bundle et charger les routes et composants coûteux à la demande ; justifier une dépendance par
  son bénéfice mesuré.
* Pour les grands jeux de données, utiliser la pagination et, si le volume ou les mesures le justifient, la virtualisation ;
  préserver la navigation clavier et les noms accessibles.
* Lorsqu'une nouvelle lecture remplace une ancienne (recherche, filtres ou changement d'écran), annuler ou ignorer la
  réponse devenue obsolète. Ne pas annuler silencieusement une mutation déjà engagée côté serveur.
* Garder les calculs coûteux hors des templates ; dériver l'état avec les API réactives Angular adaptées et mesurer
  avant d'ajouter une mémorisation ou une abstraction.

---

# Gestion des erreurs

Toutes les erreurs HTTP sont gérées par l'intercepteur global.

Les composants :

* ne montrent jamais les erreurs HTTP ;
* ne créent jamais de Toast d'erreur.

Un callback `error` est autorisé uniquement pour :

* arrêter un loading ;
* remettre un formulaire dans un état cohérent ;
* effectuer un traitement local.

---

# Notifications

Les messages de succès sont gérés localement.

Les messages d'erreur sont gérés uniquement par l'intercepteur HTTP.

---

# RBAC

Les autorisations proviennent des permissions effectives de l'utilisateur courant (voir
`conventions/security.md`) — jamais d'un rôle codé en dur.

Un Service d'authentification centralise l'état de connexion et expose au minimum :

```ts
hasPermission(code: string): boolean
hasAnyPermission(codes: string[]): boolean
```

Les guards de route utilisent ce Service — un guard d'authentification simple (utilisateur connecté
ou non) et un guard de permission générique paramétré par les données de route :

```ts
{ path: 'xxx', canActivate: [permissionGuard], data: { permission: 'XXX_MANAGE' } }
```

Un guard améliore la navigation et l'expérience utilisateur ; il ne constitue jamais une frontière
de sécurité. Le backend vérifie la permission sur chaque opération (voir `conventions/security.md`).

Les éléments de navigation et boutons sensibles (ex. suppression) se conditionnent de la même façon
au niveau du template :

```html
@if (authService.hasPermission('XXX_DELETE')) { ... }
```

Toute nouvelle fonctionnalité définit explicitement ses autorisations.

---

# Sécurité

Ne jamais construire du HTML contenant une donnée utilisateur.

Pour une interface agentique, consommer les événements par un client de protocole typé. L'interface ne rend que
des composants Angular connus : une réponse de modèle ne devient jamais HTML, template, script ou style exécutable.
Afficher clairement l'état de l'agent, les sources utilisées et les actions demandant confirmation.

Interdiction :

```ts
`<strong>${username}</strong>`
```

Utiliser un template Angular lorsque du contenu formaté est nécessaire.

---

# Design System

Toutes les couleurs, espacements et tailles proviennent des Design Tokens.

Utiliser :

```scss
var(--...)
```

Ne jamais écrire directement :

* couleurs hexadécimales ;
* tailles ;
* espacements ;
* rayons ;
* ombres

lorsqu'un token existe déjà.

Si un token manque, l'ajouter dans `_tokens.scss` — avec sa valeur dans les deux thèmes (clair et sombre).

Les thèmes, les jetons sémantiques, la typographie et le mouvement sont décrits dans `design-system.md`.

---

# Communication avec le backend

Le frontend consomme uniquement les DTO exposés par l'API.

Ne jamais dépendre :

* des entités JPA ;
* des structures internes du backend.

Toute évolution d'un contrat API doit être répercutée sur le frontend.

---

# Documentation

Après toute évolution d'un module frontend, mettre à jour la documentation concernée dans `docs/`
(structure propre à chaque projet — voir son propre `README.md`).

---

# Qualité et tests

* Appliquer les couches et portes de [`testing.md`](testing.md) aux unités, composants, contrats, parcours navigateur et flux full stack pertinents.
* Les tests de composants vérifient états, clavier, Signals, formulaires et erreurs ; utiliser les harness Angular/CDK lorsqu'ils existent plutôt que tester les classes CSS internes.
* Les tests d'intégration vérifient router, guards, intercepteurs, services HTTP et contrats avec le serveur ; employer des fixtures représentatives et des assertions sur statuts et permissions.
* Les parcours E2E couvrent les navigateurs et tailles d'écran pris en charge, les autorisations, les parcours métier critiques, ainsi que les états accessibles et les erreurs.
* Automatiser les contrôles d'accessibilité possibles et vérifier clavier, lecteur d'écran, contraste, zoom, mobile, thèmes et reduced-motion selon la portée du changement.

---

# Principes

* Architecture par domaine métier.
* Composants Standalone.
* inject() uniquement.
* Signal Forms pour tous les formulaires.
* Nouveau Control Flow Angular uniquement.
* Zoneless par défaut, Signals pour l'état UI, RxJS pour HTTP/flux et `resource()` seulement pour les lectures.
* Les Services centralisent les appels HTTP.
* Les composants restent centrés sur la présentation.
* Tout tableau de données offre tri, redimensionnement, réordonnancement, choix des colonnes, pagination avec total et filtres en temps réel.
* Les erreurs HTTP sont gérées de manière centralisée.
* Toute nouvelle route est chargée en Lazy Loading.
* Utiliser la version stable la plus récente et garder le framework à jour ; aligner ses outils et dépendances compatibles.
* Tout sélecteur recherche et charge ses options par page depuis le backend via le composant
  partagé — sélection multiple pour un filtre de liste ou une relation many-to-many, sélection
  simple pour une relation unique d'un enregistrement.
* Les autorisations sont explicites et reposent sur les permissions effectives, jamais un rôle codé en dur.
* Les Design Tokens sont la source de vérité du style.
* Le frontend reste synchronisé avec les contrats du backend.
* Toute fonctionnalité est documentée.
* Aucun code mort ne doit être conservé.
* Toute nouvelle fonctionnalité CRUD doit fournir une expérience utilisateur complète : liste paginée et triable, recherche, filtres si disponibles, création, consultation, modification, suppression (si autorisée), validations, gestion des erreurs, états de chargement et messages de succès.

## Références Angular

- [Versions, cadence et politique de support](https://angular.dev/reference/releases)
- [Compatibilité Angular, Node.js, TypeScript et RxJS](https://angular.dev/reference/versions)
- [Guide officiel de mise à jour](https://angular.dev/update-guide)
- [Signals et état dérivé avec `linkedSignal`](https://angular.dev/guide/signals)
- [Signal Forms](https://angular.dev/guide/forms/signals/overview)
