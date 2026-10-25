# Rapport et exports Paie

Le domaine produit des documents à partir des bulletins mensuels, sans les modifier. Le rapport PDF
réunit les indicateurs, graphiques et données détaillées pour le partage et l'impression. Le classeur
Excel permet l'exploitation ligne par ligne. Les règles de saisie et d'import restent dans
[le dossier Paie](../paie/README.md).

## Sources et définitions

Le grain est un bulletin par employé et par mois. Les rattachements utilisés sont ceux du bulletin;
les changements de la fiche Employé ne remplacent pas ces affectations historiques.

| Mesure | Définition et unité |
|---|---|
| Masse salariale | Somme de `salaireTotal`, en DH; ce total n'est jamais recalculé à partir du salaire de base ou des primes. |
| Effectif rémunéré | Nombre de bulletins du périmètre et du mois, en personnes. L'unicité employé/mois empêche le double comptage. |
| STC / sorties | Nombre de bulletins dont l'observation vaut `STC` ou `sortie`, sans tenir compte de la casse et des espaces autour. |
| Montant des STC | Somme de `salaireTotal` de ces mêmes bulletins, en DH. |
| Chantiers | Nombre de chantiers distincts du périmètre courant. |
| Comparaison | Même périmètre sur le mois civil immédiatement précédent. Sans bulletin précédent, la comparaison est indisponible; une masse réellement nulle reste une valeur connue. |
| Évolution | Masse, effectif et STC des mois disponibles dans une fenêtre maximale de douze mois finissant au mois du rapport. Aucun mois manquant n'est inventé. |

Les KPI, les comparaisons, le détail et les évolutions PDF appliquent les mêmes filtres de nom, CIN,
fonction et marchés. Nom et CIN utilisent une recherche « contient » insensible à la casse; `%` et
`_` sont des caractères ordinaires. Les filtres sont appliqués avant les agrégations en base.

## Assistant d’export

L'action **Exporter** du domaine Paie ouvre un assistant commun aux deux formats.

| Étape | Fonctionnement |
|---|---|
| Mois | Le dernier mois contenant des bulletins est présélectionné. Les mois sans paie sont indisponibles. Le résumé indique bulletins, chantiers, masse et STC. |
| Format | Choix entre rapport PDF et classeur Excel. |
| Marchés | Étape PDF : tous les marchés ou une sélection multiple, recherchable par code ou libellé. Une sélection coche « Sans vue d'ensemble »; ce choix reste modifiable. |
| Équipes | Sélection explicite par chantier; aucune équipe n'est cochée d'office. Toutes les équipes ou aucune peuvent être choisies pour un chantier. En PDF, seuls les marchés retenus sont proposés. |
| Matériel | Présente uniquement les tableaux associés aux équipes détaillées concernées. Les quantités entières vont de 0 à 999. Une cellule vide reste absente, sauf choix explicite de la remplir à zéro. |
| Export | Récapitulatif avec retour aux étapes; génération, téléchargement puis possibilité de télécharger à nouveau ou de recommencer. |

Un chargement incomplet des périodes, marchés ou tableaux de matériel bloque la progression et
propose **Réessayer**. Une réponse d'un ancien mois ne remplace pas les marchés du mois choisi.
La génération affiche une attente sans pourcentage. Une erreur de génération affiche le message
serveur disponible et conserve les choix afin de permettre une nouvelle tentative.

L'assistant choisit son propre périmètre : il n'hérite pas implicitement des filtres du tableau.
Les exports PDF individuels des composants restent disponibles dans les vues qui les proposent.

## Rapport PDF

### Structure et données complètes

Le document est au format A4 paysage. La couverture porte le mois, l'année, le département et les
espaces de signature. Les pages de contenu portent la période, le niveau et la pagination.

Un rapport filtré contient des pages **Périmètre du rapport** qui détaillent tous les filtres actifs,
avec continuation si nécessaire. Ces pages restent présentes quand la vue d'ensemble est retirée.

La vue d'ensemble présente les KPI, les deux graphiques d'évolution (montants en DH puis personnes)
et la répartition par chantier. Chaque chantier possède ensuite son chapitre : indicateurs,
évolutions, répartition et liste complète des employés.

- Sans équipe détaillée : une section contient tous les employés du chantier; la répartition est présentée par fonction.
- Avec équipes détaillées : chaque équipe choisie a sa section; les autres employés sont regroupés dans le reste du chantier. La répartition du chantier conserve toutes ses équipes, même non détaillées.
- Un employé apparaît exactement une fois dans le détail PDF, y compris s'il n'a pas d'équipe.
- Le détail est trié par fonction puis nom. Il conserve nom, fonction, CIN, jours, récupérations, salaire, primes, total et observation. Le reste du chantier indique aussi l'équipe réelle.
- Chaque section conserve son récapitulatif par fonction. Les graphiques matériel ne sont présents que pour un tableau concerné comportant une quantité positive.

Les équipes sont nommées par leur libellé. Les titres chantier présentent le nom suivi du code si le
nom existe, sinon le code. Le graphique global utilise le nom seul, avec le code comme repli.
Les libellés longs passent à la ligne. Les tableaux et répartitions importants continuent sur autant
de pages que nécessaire, avec une échelle de graphique cohérente entre les pages.

### Contrat PDF

`POST /paie/report/pdf` renvoie `application/pdf`, avec un nom de fichier comportant la période.

| Champ de `PaieReportPdfRequestDto` | Type JSON / contrainte | Description |
|---|---|---|
| `periode` | `string`, obligatoire, `aaaa-MM` | Mois du rapport. Une période absente ou invalide est refusée en `400`. |
| `nomPrenom` | `string|null`, 150 caractères au plus | Recherche « contient » sur le nom de l'employé. |
| `cin` | `string|null`, 30 caractères au plus | Recherche « contient » sur le CIN. |
| `fonctionId` | `integer(int64)|null` | Fonction du bulletin; sans valeur, toutes les fonctions. |
| `chantierIds` | `integer(int64)[]|null`, au plus 500 valeurs non nulles | Marchés du rapport; liste vide ou absente : tous. |
| `chantierId` | `integer(int64)|null` | Sélection simple acceptée pour compatibilité; `chantierIds` prévaut s'il est fourni. |
| `equipesParChantier` | `object<string,string[]>|null` | Code chantier → libellés des équipes disposant d'une section détaillée. Ce choix ne retire aucun employé du rapport. |
| `materiel` | `object<string,integer>|null`, valeurs de 0 à 999 | Libellé d'une ligne du catalogue matériel → quantité. Une ligne absente reste non renseignée. |
| `sansVueEnsemble` | `boolean|null` | `true` retire le chapitre global. Les chapitres chantier démarrent à I; les pages de périmètre sont conservées. |

Le PDF accepte une fonction simple et une sélection de marchés. `equipesParChantier` règle le détail
de présentation; il ne constitue pas un filtre d'exclusion. Les sélections multiples de fonctions
et le filtre par identifiants d'équipes de la recherche Paie ne sont pas exposés par ce contrat.

Sans bulletin sur le mois et le périmètre retenus, la génération est refusée (`404`). Les filtres
invalides sont refusés en `400`; un accès sans permission est refusé en `403`.

## Export Excel

Le classeur contient une feuille `GLB`, une feuille par chantier et, selon la configuration, une
feuille pour chaque équipe choisie. Les feuilles portent les données détaillées, totaux, comparaison
au mois précédent et récapitulatif par fonction. Le total précédent est absent lorsqu'il n'existe
aucun bulletin sur ce périmètre.

Un bulletin peut apparaître dans plusieurs feuilles Excel : globale, chantier, équipe. Cela permet
de partager séparément chaque feuille. L'exclusion d'une équipe de la feuille chantier ne la retire
ni de la feuille globale ni de sa propre feuille. Les comparaisons de la feuille chantier appliquent
la même exclusion au mois précédent.

`POST /paie/export` renvoie un classeur `.xlsx`.

| Champ de `PaieExportRequestDto` | Type JSON / contrainte | Description |
|---|---|---|
| `periode` | `string`, obligatoire, `aaaa-MM` | Mois du classeur; absence ou format invalide : `400`. |
| `feuillesEquipeMode` | `AUCUNE`, `TOUTES`, `PERSONNALISE` ou `null` | Sans valeur : `AUCUNE`. L'assistant produit `AUCUNE` ou `PERSONNALISE`. |
| `equipesParChantier` | `object<string,string[]>|null` | En mode personnalisé : code chantier → libellés des équipes ayant une feuille. |
| `equipesExcluesFeuilleChantier` | `object<string,string[]>|null` | Équipes retirées de la seule feuille du chantier indiqué. |
| `chantiers` | `string[]|null` | Codes qui restreignent tout le classeur, feuille globale comprise; vide ou absent : tous. |
| `materiel` | `object<string,integer>|null`, valeurs de 0 à 999 | Quantités du catalogue matériel. Les cellules absentes restent vides. |

Le catalogue matériel est partagé entre PDF et Excel. Il associe les tableaux au chantier et à
l'équipe; aucune quantité n'est déduite du nombre d'employés.
Il prévoit les tableaux **CAMION** pour `C168` / `CH` et **ENGINS** pour `C168` / `OP`.
Les équipes sont proposées par leur libellé; les codes servent au rattachement du catalogue.

## Permissions et audit

Les deux routes d'export exigent `PAIE_EXPORT`. L'assistant lit également les périodes, marchés et
tableaux matériel avec `PAIE_READ`. Les exports sont tracés dans l'audit sous `PAIE_EXPORT_EXCEL` et
`PAIE_RAPPORT_PDF`. La permission d'export ne permet pas d'écrire dans la paie.
Le [catalogue RBAC Paie](../rbac/paie.md) indique les accès détaillés.

## Mise en œuvre et scénarios

Les contrats d'export se trouvent dans `backend/src/main/java/staport/rh/paie/export/` et `report/`.
Le périmètre Excel est construit par `PaiePerimetreService`. Le modèle PDF est construit par
`PaieBiReportBuilder`; `RapportPageModelBuilder` le découpe en pages, puis `PaieReportHtmlBuilder`
construit le document, rendu par `PaieReportHtmlPdfService`. Les polices, styles et logo sont embarqués.
La sélection des lignes ne dépend jamais de la pagination de l'écran.

| Scénario | Preuve automatisée |
|---|---|
| Agrégats, comparaison, STC, sections et absence de double détail | `PaieBiReportBuilderTest` |
| Évolutions et effectifs filtrés comme le détail, caractères `%` et `_` littéraux | `PaieRechercheJokersTest` sur PostgreSQL |
| Pagination, grands textes, tableaux et pages complètes de périmètre | `RapportPageModelBuilderTest` |
| PDF valide, texte complet, filtres affichés, graphiques réellement rendus, données échappées | `PaieReportHtmlPdfServiceTest` |
| Graphiques d'évolution, répartition et matériel | `RapportEvolutionSvgBuilderTest`, `RapportChartSvgBuilderTest` |
| Feuilles Excel, exclusions, équipes et cellules | `PaieExportServiceTest` |
| Choix, données chargées, reprise après erreur et réponses obsolètes | Specs `paie-export-wizard` et de ses étapes |
| Permission par route | `EndpointSecurityTest` |

Les accords métier et la validation du document complet restent dans le [PV global](../handoff/pv-n1-erp-rh.md).
Les résultats d'une exécution locale ou CI ne constituent pas une preuve de déploiement en production.
