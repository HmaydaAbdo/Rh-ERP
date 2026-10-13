# Design System

> Conventions de design applicables à tout le frontend : identité visuelle, jetons, thèmes, typographie, mouvement,
> composants, visualisations et accessibilité. Complète `frontend.md` (section « Design System »), qui pose la règle
> générale : aucune valeur de design écrite en dur. L'identité Staport constitue le fil visuel commun ; les détails
> propres à une application (logo d'écran, parcours, composants métier) sont décrits dans sa documentation.

---

# Source unique : les jetons

Toute valeur de design (couleur, espacement, rayon, ombre, taille de texte, durée) est un **jeton** défini par la source
de tokens de l'application et consommé via les variables correspondantes (`var(--…)` sur le Web). Un composant n'écrit
jamais d'hexadécimal, de couleur `rgba()`, d'ombre ou de durée en dur ; si un jeton manque, on l'ajoute à cette source.

Les jetons forment trois couches :

| Couche | Rôle | Exemples |
|---|---|---|
| **Primitives** | L'échelle de couleurs de la marque ; identique dans les deux thèmes | `--brand-50` … `--brand-950` |
| **Sémantiques** | Intention indépendante du composant ; adaptées au thème | surface, texte, action, statut, focus, graphiques |
| **Composants** | Décisions répétées propres à un composant ou une famille cohérente | hauteur de contrôle, rayon de dialogue, élévation de menu |

Un composant utilise les jetons sémantiques ou de composant, jamais une primitive de marque (`--brand-*`) : c'est ce qui
lui permet de suivre le thème et de changer d'identité sans réécriture. Les variables d'une bibliothèque sont générées
ou mappées depuis les tokens Staport ; elles ne deviennent pas une source de vérité concurrente. La couleur d'action sert
aux actions et à leur repérage ; les couleurs de statut restent distinctes de la marque.

Tout nouveau jeton est défini pour chaque thème applicable dans le même changement. Ne pas créer une valeur par composant
lorsqu'un jeton sémantique existant exprime déjà l'intention.

---

# Identité visuelle Staport

L'interface traduit l'identité Staport en une expérience **précise, accueillante et premium**, adaptée à des outils de
travail : hiérarchie typographique nette, données immédiatement lisibles, surfaces avec une profondeur maîtrisée,
alignements réguliers et interactions soignées. Le bleu de la marque ancre l'interface ; un accent minéral chaud peut
compléter les repères de navigation et les détails de marque sans remplacer le bleu d'action.

Le caractère immersif vient de la continuité du contexte, de la qualité des visualisations et d'une composition qui aide
à comprendre l'espace de travail. Il ne masque pas les données ni ne réduit leur contraste. Un écran d'accès peut installer
une atmosphère marine propre à Staport ; les écrans métier gardent des surfaces calmes. Les accents lumineux sont
réservés aux actions, sélections et informations qui méritent l'attention. Éviter le néon généralisé, le glassmorphism
systématique, les dégradés décoratifs et les effets qui éloignent l'interface de l'identité Staport.
Vérifier le contraste du bleu extrait du logo avant de l'utiliser comme couleur de texte ou de contrôle sur une surface ;
le logo ne garantit pas à lui seul un contraste suffisant pour les usages d'interface.

Le rendu premium repose sur le soin apporté à la typographie, aux espacements, aux états de composants et à la stabilité
visuelle, pas sur l'ajout d'effets. Les écrans denses gardent des niveaux de lecture évidents. Chaque écran conserve une
action principale identifiable et un parcours métier compréhensible sans animation.

Pour les fonctions assistées par IA, distinguer clairement la suggestion de l'action confirmée. Une réponse fondée sur
des données expose le contexte ou les sources disponibles ; les appels d'outils et les actions avec effet de bord sont
visibles et confirmés selon le risque. L'assistance complète le parcours métier et ne le remplace pas.

Quand le produit comporte un espace analytique ou une assistance intelligente, privilégier une vue de travail adaptée
au rôle, une recherche globale, des indicateurs accompagnés de leur période et de leur définition, ainsi que des anomalies
expliquées avec leur source. Un panneau d'assistance reste contextuel et secondaire. Les prédictions sont présentées comme
des estimations avec leur contexte, jamais comme des certitudes.

---

# Thèmes clair et sombre

Les applications proposent au minimum un thème clair et un thème sombre. Elles suivent la préférence système jusqu'au
choix explicite de l'utilisateur ; ce choix est appliqué avant le premier affichage et conservé localement. Le contraste
élevé complète ces thèmes en respectant les préférences système et les couleurs `forced-colors` : il ne demande pas une
troisième palette de marque qui dupliquerait les thèmes.

* Le thème est porté par l'attribut `data-theme="light|dark"` sur `<html>` ; **un seul** jeu de jetons par thème, redéfini
  sous `:root[data-theme='dark']` (et, sans attribut, sous `prefers-color-scheme: dark`).
* `ThemeService` (`core/theme/`) pilote l'attribut : tant que l'utilisateur n'a pas choisi, le thème suit son système ; son
  choix est mémorisé localement (`localStorage`, jamais envoyé au serveur). Le script d'`index.html` applique la même règle
  avant le premier affichage — pas de flash du mauvais thème.
* Un composant ne teste jamais le thème. S'il doit réagir à un changement (ex. un graphique qui lit ses couleurs une fois),
  il relit les jetons au changement de `ThemeService.theme()`.
* Un élément monochrome sombre (le logo) passe en blanc en thème sombre par un filtre CSS
  (`:host-context([data-theme='dark'])`), pas par un second fichier.
* Tout écran se vérifie dans **les deux thèmes**, avec contraste élevé et `forced-colors`, avant d'être livré.

---

# Bibliothèques UI et thème

Les jetons Staport et les composants propres à Staport sont la source visuelle. Angular Aria/CDK fournit les primitives
d'interaction accessibles; Tailwind CSS 4 fournit les utilitaires reliés aux jetons; Lucide Angular fournit les icônes.
Les composants sont composés et testés dans Storybook ou un catalogue équivalent avant d'être partagés (ERP-RH : `src/app/shared/ui/` et la route de développement `/catalogue`, vérifiée par axe en thèmes clair et sombre).

Utiliser les composants Angular Aria et CDK comme primitives accessibles et construire les composants Staport par-dessus,
avec HTML natif dès que l'interaction est simple. Le système de design est porté par les jetons Staport, Tailwind CSS 4,
SCSS/CSS des composants et Lucide Angular; il ne dépend pas du style visuel d'un fournisseur de widgets.

Chaque composant partagé définit les états qui s'appliquent parmi : repos, survol, focus-visible, actif, désactivé,
chargement et erreur, ainsi que ses variantes de densité si elles sont utiles. Ces états restent perceptibles sans dépendre
uniquement de la couleur. Valider au clavier, lecteur d'écran, focus, contraste, français, comportement zoneless et
performance chaque composant partagé.
AG Grid Community n'est utilisé que pour une grille avancée lorsqu'un besoin mesuré le justifie ; il est encapsulé
et chargé à la demande. PrimeNG, PrimeIcons et PrimeFlex sont exclus du socle pour limiter le verrouillage fournisseur et
garder la maîtrise du langage visuel.

Tout contournement CSS des composants tiers doit être local, stable et documenté; éviter `::ng-deep`, sélecteurs internes
non contractuels et règles globales qui fuient dans les autres domaines.

---

# Typographie

* **Une seule famille** de texte pour toute l'interface (`--font-sans`) et une famille à chasse fixe (`--font-mono`)
  réservée aux identifiants (codes, numéros de pièce, périodes) — classe utilitaire `.mono`.
* Les polices sont **embarquées dans l'application** (paquets `@fontsource/*`, déclarés dans `angular.json`) : jamais de CDN
  ni d'appel à un service externe, l'application doit fonctionner sans accès à Internet.
* Les **chiffres tabulaires** (`font-variant-numeric: tabular-nums`) sont obligatoires partout où l'on compare des montants
  (tableaux, tuiles de synthèse).
* Tailles : uniquement l'échelle des jetons (`--text-xs` à `--text-xl`), plus `--text-page-title` pour les titres d'écran et
  `--text-display` pour une accroche d'accueil courte.

---

# Mouvement

Le mouvement **explique un changement d'état** — un écran qui arrive, un thème qui change, une donnée qui charge, un appui —
et ne décore jamais un écran de travail. Tout est défini une seule fois dans `src/styles/_motion.scss`.

| Situation | Mouvement |
|---|---|
| Un écran apparaît | Fondu en montant de 6 px, `--duration-base` (220 ms) |
| Bascule de thème | Les couleurs glissent d'un thème à l'autre (classe `theme-transition` posée 300 ms par `ThemeService`, jamais au premier affichage) |
| Données en chargement | **Squelette** (`app-skeleton`) : la silhouette de ce qui arrive, qui respire doucement — jamais un « Chargement… » seul |
| Un appui sur un bouton | Il s'enfonce de 2 % (`--duration-fast`) |
| Survol (ligne de tableau, onglet, bouton) | Changement de fond ou de couleur en `--duration-fast`, sans déplacement |
| Menu en tiroir, panneaux, fenêtres | `--duration-base`, courbe `--ease-out`, jamais de rebond |
| Un graphique | Tracé de 600 ms, supprimé si l'utilisateur demande moins de mouvement |

* **Jetons** : `--duration-fast` (150 ms), `--duration-base` (220 ms), `--duration-slow` (400 ms, entrées en cascade),
  `--duration-slower` (700 ms, remplissage d'une jauge), `--duration-slowest` (1200 ms, mouvement indéterminé),
  `--duration-skeleton` (1400 ms), `--ease-out` (la courbe de toute entrée), `--ease-in-out` (un balayage continu).
  Un composant n'écrit jamais une durée ni une courbe en dur.
* On n'anime que `opacity` et `transform` (et les couleurs) : jamais une propriété qui force une mise en page. Seule exception
  assumée : l'ouverture du menu latéral anime sa `width` — c'est un élément fixe superposé au contenu, aucune mise en page ne se
  recalcule autour de lui.
* **`prefers-reduced-motion`** : la feuille de mouvement neutralise toute animation et transition (durée quasi nulle) ; un
  mouvement propre à une bibliothèque (Chart.js) est coupé par le code (`mouvementReduit()`).
* Les animations élaborées sont réservées aux transitions ou récits de données qui apportent une information. Elles ne
  bloquent pas l'action et ne déplacent pas le contenu ; vérifier leur fluidité sur les appareils visés et les supprimer
  si leur durée ou leur coût nuit au travail.

---

# Graphiques

Chart.js dessine dans un canvas et ne lit pas le CSS ; l'habillage est donc commun (`paie-chart-theme.ts`) et lit les jetons.
Chaque graphique répond à une question explicite et présente les unités, la période et la source des données utiles à
son interprétation.

* **Une mesure, un axe.** Jamais deux échelles dans un même graphique (masse et bulletins ne sont pas comparables) : on
  propose un choix de mesure ou deux graphiques.
* **La couleur suit l'entité, jamais son rang** : une mesure a la même couleur dans tous les graphiques, quel que soit le
  filtre. Palette catégorielle `--chart-1…8` validée avec le validateur de la méthode (écart de vision des couleurs ≥ 8,
  plancher de vision normale ≥ 15) en clair **et** en sombre, dans un ordre fixe ; au-delà de trois séries on regroupe ou on
  sépare. Les couleurs de statut ne servent jamais de série.
* **Marques fines** : barres de 18 px au plus, bout arrondi de 4 px, ligne de 2 px, repères d'au moins 8 px cerclés de la
  couleur de la carte ; grille discrète, jamais de cadre ; pas de légende pour une série unique (le titre la nomme).
* **Thème** : un graphique dépend de `ThemeService.theme()` pour être redessiné à la bascule ; il lit police, textes, grille
  et infobulle dans les jetons.
* **Accessibilité** : un tableau de données déplié à la demande, un nom accessible et une interaction clavier ; une infobulle
  au survol de toute la ligne ou de toute la colonne, pas seulement de la barre ; le texte n'a jamais la couleur de la série.

---

# Mise en page des écrans

La structure d'un écran de liste est définie **une seule fois**, dans la feuille globale `src/styles/_page.scss` (comme le style
des tableaux) : aucun écran ne redéfinit la carte, l'en-tête, les filtres ni la barre du tableau.

| Classe | Rôle |
|---|---|
| `app-page` | Le conteneur d'écran, sans surface décorative : les listes restent posées sur le canevas ; les formulaires et consultations choisissent explicitement une surface |
| `app-page__header` | Le titre éditorial (`--text-page-title`) de l'écran et, à droite, ses actions |
| `app-page__header` + `app-page__actions app-page__actions--liste` | Les actions d'un écran de liste (Importer, Synchroniser, Exporter, puis l'action principale « Nouveau … » en dernier), à droite du titre ; en une grille sur téléphone. Les écrans qui ont des onglets de vue (la paie) les posent au même niveau que les onglets |
| `app-toolbar` | Les filtres regroupés dans une bande secondaire, sans ajouter une carte lourde : contrôles de même hauteur (`--control-height`), deux par ligne sur téléphone. `app-toolbar__clear` : le bouton « Réinitialiser » ; `app-toolbar__date` : un champ précédé d'un petit libellé (« Du », « Au ») |
| `app-table-bar` | Le total à gauche (`app-table-bar__total`), les outils à droite (`app-table-bar__tools`) — pour les écrans dont les actions sont dans l'en-tête, seulement le choix des colonnes |
| `app-table-bar` + `app-column-chooser.en-ligne` | Le choix des colonnes se pose toujours dans la barre du tableau |

Formulaires et consultations (`src/styles/_forms.scss`) :

| Classe | Rôle |
|---|---|
| `app-page--narrow` / `app-page--wide` | Surface et largeur maximale de formulaire ou consultation (760 / 1000 px) |
| `app-back` | Le retour à la liste : un lien discret « ← Employés » au-dessus du titre, jamais un bouton |
| `app-page__actions` | Les actions de l'en-tête (consultation : Historique puis **Modifier**, l'action principale, en dernier) |
| `app-form__grid` (`--3`) | La grille de champs : 2 colonnes (ou 3), 1 sur téléphone ; `app-form__wide` pour un champ pleine largeur |
| `app-form__section` | Le titre d'un groupe de champs (ligne de séparation) — dès qu'un formulaire dépasse six champs |
| `field`, `field__req`, `field-error` | Un champ : libellé, contrôle, aide, erreur ; l'astérisque d'un champ obligatoire est rouge ; un champ invalide et touché a la bordure rouge |
| `app-form__actions` | Annuler (texte) puis l'action principale (à droite) ; collé au bas de l'écran sur téléphone |
| `app-detail` (`--3`) | Une consultation : étiquette en petites capitales, valeur, une ligne de séparation par information |

Fenêtres (`src/styles/_overlays.scss`) : toutes les fenêtres de dialogue ont le même rayon, les mêmes marges et un pied
séparé ; les **confirmations de suppression** sont étroites (30 rem), avec « Annuler » discret et « Supprimer » en rouge
(`--color-danger`) ; le sélecteur de fichier natif prend l'allure d'un bouton secondaire. Les textes des composants Staport,
calendriers et messages vides sont en français.

**Ordre des outils, du moins au plus important** : choix des colonnes (`app-column-chooser` avec la classe `en-ligne`), actions
secondaires (Exporter, Importer — bouton fractionné dont le menu porte le modèle de fichier, Synchroniser), puis l'**action
principale** en bleu plein, toujours en dernier (« Nouveau… »). Une seule action principale par écran.

---

# Responsive

Tout écran fonctionne du téléphone (390 px) au grand écran, **sans défilement horizontal de la page** : seul un tableau défile
horizontalement, à l'intérieur de sa carte.

* **Points de rupture** : jetons Sass dans `src/styles/_breakpoints.scss` (`phone` ≤ 767 px, `tablet-down` ≤ 1023 px,
  `compact-nav` pour la navigation en tiroir) ; une feuille de composant les utilise par `@use 'breakpoints' as bp;`
  puis `@include bp.phone { … }`. Jamais un `@media` à valeur écrite en dur dans un composant.
* **Navigation** : sur grand écran, le menu latéral reste iconique et compact, avec les libellés en infobulle ; il se déploie au survol ou au focus clavier et se replie quand le pointeur sort après un clic, ou quand le focus quitte les liens. Sur téléphone et tablette tactile, il devient un **tiroir** ouvert par une barre du haut — fond sombre cliquable, `Échap` et le choix d'un écran le referment.
* **Cibles tactiles** : sur écran tactile (`pointer: coarse`) ou téléphone, tout contrôle fait au moins 44 px
  (`--control-height`) et le texte d'un champ au moins 16 px (`--control-font-size`) — sinon iOS zoome à la saisie.
* **Grilles** : colonnes en `minmax(0, 1fr)` (jamais `1fr` seul : un contenu large étirerait la colonne), réduites à deux
  colonnes sur tablette et à une sur téléphone. Un élément pleine largeur se place par `grid-column: 1 / -1`
  (jamais `span n`, qui crée des colonnes implicites).
* **Tableaux** : les en-têtes affichent leur libellé complet et reviennent à la ligne aux espaces. La largeur minimale de
  colonne est de 9 rem (`--table-column-min-width`) afin d'éviter une coupure caractère par caractère ; le tableau défile
  dans son propre conteneur lorsque toutes ses colonnes ne tiennent pas dans la fenêtre.
* **Tableaux** : la première colonne reste en vue pendant le défilement horizontal ; le paginateur se replie sur
  plusieurs lignes, sans « première / dernière page ».
* **Barres de filtres** : ce qui est secondaire se replie derrière un bouton « Filtres (n) » sur téléphone (le n compte les
  filtres actifs cachés) ; sur grand écran tout reste visible.
* **Dialogues** : plafonnés à la largeur de l'écran sur téléphone (`styles.scss`), quelle que soit la largeur donnée par l'écran.

---

# Accessibilité

Vérifiée automatiquement (axe-core, WCAG 2.2 niveau AA et bonnes pratiques) dans les thèmes clair et sombre, et manuellement avec
contraste élevé et navigation clavier : **aucune violation** est la barre à tenir.

* **Contraste** : texte d'au moins 4,5:1 (3:1 pour les grands textes) ; composants d'interface et éléments graphiques
  nécessaires à la compréhension d'au moins 3:1 avec les couleurs adjacentes. Les pastilles d'état
  tirent leurs couleurs des jetons de statut (`styles/_status.scss`) ; un état n'est
  jamais porté par la seule couleur (la pastille dit « Actif », « Inactif »).
* **Noms accessibles** : tout bouton d'icône a un `aria-label` précis (« Modifier AABIDDI MOHAMED », pas « Modifier ») ; tout champ
  a un `<label for>` ou un `aria-label` (un champ de barre de filtres, qui n'a que son placeholder, porte `aria-label`) ; une
  colonne d'actions vide a un en-tête lu par les lecteurs d'écran (`app-lecteur`) ; un graphique a un `ariaLabel` et un tableau
  de données.
* **Clavier** : un lien d'évitement « Aller au contenu » en premier ; un anneau de focus unique (`:focus-visible`) sur tout élément
  interactif, jamais supprimé sans équivalent ; une zone qui défile (graphique, tableau) est atteignable au clavier
  (`tabindex="0"`, `role="region"`, libellé) ; le menu latéral iconique se déploie au survol ou lorsque l'un de ses contrôles reçoit le focus clavier (`:has(:focus-visible)`), jamais au seul clic, puis se replie à la sortie.
* **Formulaires** : un message d'erreur est annoncé (`role="alert"`) ; une soumission refusée met le focus sur le premier champ
  invalide (`focaliserPremiereErreur`, par `focusBoundControl` de Signal Forms) ; quitter un formulaire modifié demande confirmation
  (`unsavedChangesGuard`, boîte « Quitter sans enregistrer ? ») et un formulaire enregistré est remis à l'état intact (`reset()`) avant de
  naviguer ; les champs hors
  authentification ont `autocomplete="off"`, et `spellcheck="false"` quand ils portent un code (CIN, code, identifiant).
* **Langue et formats** : `lang="fr"`, locale `fr-FR` (nombres « 5 500,00 », dates), textes UI en français ; les noms de marque
  portent `translate="no"` ; les points de suspension sont typographiques (`…`).
* **Tactile et écrans à encoche** : `touch-action: manipulation`, pas de halo de toucher, `overscroll-behavior: contain` sur les
  panneaux défilants, `viewport-fit=cover` et `env(safe-area-inset-*)` sur la barre du haut et le pied de formulaire.
* **Mouvement** : voir la section « Mouvement » ; `prefers-reduced-motion` est respecté.

---

# Principes

* Les jetons sont la source de vérité du style ; deux thèmes, un seul jeu de composants.
* Jamais de couleur en dur ; jamais de primitive dans un composant.
* Un jeton ajouté est défini dans les deux thèmes dans le même changement.
* Le thème de la librairie est généré ; on ne le modifie pas à la main.
* Polices embarquées, chiffres tabulaires pour les montants.
* Le contraste élevé et `forced-colors` restent utilisables ; l'état n'est jamais indiqué par la couleur seule.
* Le mouvement sert la compréhension, reste fluide et respecte `prefers-reduced-motion`.
