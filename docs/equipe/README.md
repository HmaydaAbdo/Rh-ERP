# Domaine Équipe

## Rôle du domaine

Le domaine gère le référentiel des équipes de travail et les règles qui s'appliquent à leur sélection,
leur modification et leur utilisation par les domaines Employé et Paie. Il ne contient pas de catalogue
de données métier dans cette documentation.

La fiche Employé porte l'équipe courante. Chaque bulletin conserve séparément la référence à l'équipe
associée à son mois. Une modification ultérieure de l'équipe de l'employé ne réécrit donc pas les bulletins
antérieurs. Le bulletin référence le référentiel : modifier le libellé ou le code d'une équipe change la
valeur affichée pour les bulletins qui référencent cette même équipe.

## Les couches du domaine

Équipe est un référentiel court (code, libellé) mais il traverse trois couches. Chaque couche est décrite ici de bout
en bout pour pouvoir être relue et commentée séparément.

| Couche | Rôle pour Équipe | Où lire |
|---|---|---|
| **Application** | Créer, modifier, rechercher, importer et supprimer les équipes ; fournir le référentiel aux formulaires et filtres Employé et Paie | [Couche application](#couche-application) |
| **Analytique** | Lire la paie du dernier mois **par équipe** (Cartes, Analytique) ; mesurer la qualité du rattachement (bulletins sans équipe) | [Couche analytique](#couche-analytique) |
| **IA** | Laisser l'assistant retrouver une équipe et interroger la paie ou les effectifs par équipe, en lecture seule | [Couche IA](#couche-ia) |

### Couche application

**Backend** (`backend/src/main/java/staport/rh/equipe/`)

- **Contrôleurs.** `EquipeController` (`/equipes`) et `EquipeImportController` (`/equipes/import`). Chaque route porte
  `@PreAuthorize` sur sa permission (voir [Permissions](#permissions)) ; l'interface n'est jamais la seule barrière.
- **Service.** `EquipeService`, exposé aux autres domaines par la façade `IEquipeService` (ils n'accèdent pas au
  repository). À la création et à la modification il : retire les espaces extérieurs du libellé, normalise le code
  (`strip` puis majuscules, `Locale.ROOT`), contrôle l'unicité du code **puis** du libellé sans casse
  (`findByCodeIgnoreCase`, `findByLibelleIgnoreCase`, en excluant l'équipe courante lors d'une modification) et, à la
  modification, compare la version reçue à la version stockée (`VersionOptimiste.verifier`).
- **Recherche.** `EquipeSpecification` : filtres `code` et `libelle` en « contient » sans casse, avec échappement des
  caractères spéciaux du motif (`MotifRecherche`) ; `recherche` cherche dans l'un **ou** l'autre champ ; les filtres se
  combinent par ET ; le tri et la pagination viennent du `Pageable`.
- **Suppression.** Le service ne vérifie pas lui-même les références : la clé étrangère `fk_paie_equipe` et celle de la
  fiche Employé refusent la suppression, et `EquipeExceptionHandler` traduit cette `DataIntegrityViolationException`
  en `409` avec « Cette équipe est utilisée par au moins un bulletin de paie ou un employé et ne peut pas être
  supprimée ».
- **Erreurs.** `404` équipe inconnue ; `409` code ou libellé déjà pris (message distinct pour chacun) ou contrainte
  d'intégrité ; `400` fichier d'import illisible ou colonnes inattendues.
- **Audit.** L'entité est `@Audited` (historique Envers) et les écritures portent `@AuditableAction` :
  `EQUIPE_CREATION`, `EQUIPE_MODIFICATION`, `EQUIPE_SUPPRESSION` ; l'import est audité par `PerimetreImportEquipe`
  (nombre de lignes, résultat). Les lectures de l'assistant ont leurs propres entrées (`MCP_EQUIPE_*`).
- **Import.** `EquipeImportService` lit un classeur `.xlsx` (colonnes « Code » puis « Libellé », dans cet ordre), valide
  **tout** avant d'écrire, puis crée en une fois. Motifs de rejet exacts : « Code obligatoire », « Libellé
  obligatoire », « Code trop long (max 50 caractères) », « Libellé trop long (max 100 caractères) », « Colonnes
  supplémentaires non prises en charge », « Code déjà présent dans le fichier », « Libellé déjà présent dans le
  fichier », « Code d'équipe déjà existant », « Libellé d'équipe déjà existant ».
- **Base de données.** `V7` crée la table et sème les 17 équipes d'origine (`CH`, `OP`, `AT`, `EE`, `TER`, `GA`, `TOPO`,
  `ADMIN`, `ENROCHEMENT`, `R CONT`, `GABION`, `PHS`, `EB`, `A`, `LABO`, `ASPHALET`, `8`) ; `V8` remplace le texte libre
  du bulletin par la clé étrangère `paie.equipe_id` (la migration échoue plutôt que de perdre une valeur non
  rapprochée) ; `V9` et `V32` créent les permissions ; `V25` impose l'unicité sur `UPPER(BTRIM(code))` et
  `UPPER(BTRIM(libelle))` ; `V34` fusionne l'équipe temporaire `CH+OP`.

**Frontend** (`frontend/src/app/portail/equipe/`)

- **Routes** (chargement à la demande, `permissionGuard`) : `/equipes` (liste), `/equipes/cartes`, `/equipes/analytique`
  (lecture : `EQUIPE_READ`), `/equipes/new` et `/equipes/:id/edit` (`EQUIPE_WRITE`), `/equipes/:id` (`EQUIPE_READ`).
- **Composants.** `equipe-vues` (coque partagée, onglets Tabulaire/Cartes/Analytique), `equipe-list`, `equipe-form`,
  `equipe-detail`, `equipe-actions` (Nouvelle équipe, Importer, modèle Excel), `equipe-filtres` (filtres code et
  libellé conservés dans l'URL), `equipe-cartes` et `equipe-analytique` (hôtes minces des vues partagées).
- **Service.** `equipe.service.ts` appelle l'API ; `shared/reference-data/` expose le référentiel aux sélecteurs
  génériques des formulaires et filtres Employé et Paie (recherche, chargement au défilement, « Tout sélectionner »).
- **Garde-fous d'interface.** Boutons et routes sont masqués sans la permission correspondante ; le serveur reste la
  référence.

### Couche analytique

Les vues Cartes et Analytique ne sont pas propres à Équipe : ce sont des composants partagés (`portail/perimetre/`,
[référence technique](../frontend/vues-perimetre.md)) que le module configure dans `equipe-module.ts`.

| Réglage du module | Valeur pour Équipe | Effet |
|---|---|---|
| Dimension | `EQUIPE` | L'unité de regroupement est l'équipe |
| Parcours des Cartes | Équipe → Chantier → Fonction | Descente fixe, non modifiable par l'utilisateur |
| Sources | `PAIE` seule | Aucun chiffre ne vient des fiches Employé |
| Période | Dernier mois de paie enregistré, non modifiable | Pas de sélecteur de période |
| Orphelins | Affichés dans l'Analytique, absents des Cartes | Le groupe « sans équipe » n'est pas une carte du référentiel |
| Qualité | Section dédiée de l'Analytique | Anneau des bulletins sans équipe, si leur nombre est supérieur à zéro |

**Source unique des chiffres.** `POST /paie/analytique` (permission `PAIE_READ`) renvoie `PaieAnalytiqueDto` :
`kpis` du mois, `moisPrecedent`, `parChantier`, `parEquipe`, `parFonction`, `tranches`, `evolution` (tout l'historique du
périmètre) et `qualite` (`sansEquipe`, `sansObservation`). `parEquipe` liste **toutes** les équipes du mois, sans plafond.

**Définitions des indicateurs** (identiques dans l'interface, le rapport PDF et l'assistant)

| Indicateur | Définition |
|---|---|
| Effectif | Nombre de personnes payées dans le mois (un bulletin par employé et par mois) |
| Masse salariale | Somme des salaires totaux des bulletins du mois, en dirhams (DH) |
| STC (personnes) | Bulletins en solde de tout compte ou sortie ce mois-là (même règle que le rapport de paie) |
| STC (DH) | Montant de ces bulletins |
| Variation | Écart en personnes (effectif, STC) et en pourcentage (montants) par rapport au **mois calendaire précédent** ; sans bulletin ce mois-là, la comparaison est « indisponible », jamais un zéro trompeur |

**Règles de lecture à connaître**

- Une équipe absente du mois précédent est comparée à zéro ; sans aucune paie au mois précédent la comparaison est
  indisponible.
- « Orphelins » est une valeur de filtre (`equipeIds = 0`) : elle sert à filtrer et à suivre l'historique des
  bulletins sans équipe, mais elle n'est **jamais** enregistrée (un formulaire écrit `null`).
- Le graphique de répartition masque les équipes dont l'indicateur sélectionné vaut zéro ; le tableau « Voir les
  données » les garde toutes.
- Les graphiques et les cartes s'exportent séparément en PDF, avec tous les groupes même repliés.
- Sans `PAIE_READ`, aucune donnée de paie n'est demandée ni affichée.

### Couche IA

L'assistant RH n'accède à Équipe que par des **outils MCP de lecture** exposés par le backend (Spring AI) ; il n'écrit
rien, n'exécute aucun SQL et ne voit que ce que l'utilisateur connecté peut voir.

| Outil | Ce qu'il fait | Permission | Audit |
|---|---|---|---|
| `equipe_rechercher` | Trouve des équipes par texte partiel du code ou du libellé (1 à 20 résultats, 10 par défaut, total rendu) | `EQUIPE_READ` | `MCP_EQUIPE_RECHERCHER` |
| `equipe_fiche` | Lit code et libellé d'une équipe par identifiant | `EQUIPE_READ` | `MCP_EQUIPE_FICHE` |
| `paie_repartition` (`dimension = EQUIPE`) | Masse, effectif et STC par équipe pour un mois (50 groupes au plus, du plus gros au plus petit) | `PAIE_READ` | `MCP_PAIE_REPARTITION` |
| `employes_rechercher`, `employes_compter`, `employes_regrouper`, `paie_indicateurs`, `paie_periodes`, `paie_evolution`, `paie_mouvements`, `paie_qualite`, `paie_bulletins_rechercher` | Filtre `equipeIds` ; l'identifiant `0` désigne les employés ou bulletins sans équipe | permission de l'outil (`EMPLOYEE_READ` ou `PAIE_READ`) | `MCP_*` |

- **Résolution par nom.** Quand la question cite une équipe, l'agent appelle d'abord `equipe_rechercher`, puis réutilise
  l'identifiant comme filtre ; il ne devine jamais un identifiant.
- **Exactitude.** Chaque nombre de la réponse (et de la surface A2UI éventuelle) doit venir d'un résultat d'outil du même
  tour ; sinon la réponse est réécrite une fois, puis remplacée par une abstention.
- **Sur l'écran.** Sur `/equipes`, l'assistant reçoit le domaine et les filtres de l'écran et propose « Équipes les plus
  grandes » et « Sans équipe ».
- **Limites actuelles.** Les données exposées sont celles que la permission autorise, sans périmètre par fiche de
  poste (prévu au jalon J2 de [ia.md](../ia.md)) ; l'ouverture automatique de l'écran correspondant est retirée.
  Les outils d'écriture (créer, renommer, importer) n'existent pas.


---

## Analyse fonctionnelle et règles métier

- Le **libellé** est le nom sémantique utilisé pour présenter, sélectionner et regrouper les équipes dans
  les écrans, les filtres et les vues analytiques. Les choix proposés sont triés par libellé.
- Le **code** identifie l'équipe dans les échanges de données et les imports. Il reste visible dans la
  liste d'administration et peut être utilisé pour retrouver une équipe par recherche, mais il ne remplace
  pas le libellé dans les choix et regroupements destinés aux utilisateurs.
- Les relations persistées utilisent l'identifiant interne de l'équipe. Les identifiants ne sont pas les
  libellés affichés aux utilisateurs.
- Le code est obligatoire, limité à 50 caractères, retiré de ses espaces extérieurs et enregistré en
  majuscules. Le libellé est obligatoire, limité à 100 caractères et retiré de ses espaces extérieurs.
- Code et libellé sont chacun uniques sans tenir compte de la casse ni des espaces extérieurs. Un doublon
  est refusé avec une erreur de conflit (`409`).
- L'équipe est facultative sur la fiche Employé et le bulletin Paie. Dans une création ou modification
  manuelle de bulletin, le choix de l'équipe met aussi à jour la fiche Employé pour garder les deux états
  cohérents. L'équipe associée à chaque bulletin antérieur reste distincte.
- La suppression est refusée (`409`) si une fiche Employé ou un bulletin référence l'équipe.
- L'équipe temporaire `CH+OP` (`CHAUFFEURS + OPERATEURS`) est supprimée par migration. Ses bulletins
  sont reclassés à partir de leur propre fonction : fonctions `CH.` et `COURSIER` vers `CH` (Chauffeurs),
  fonctions `OP.` vers `OP` (Opérateurs), et `CHEF DE POSTE` vers `EE` (Enrobé). Une fonction liée à
  `CH+OP` qui n'est pas classée bloque la migration au lieu de laisser des données sans équipe.
- Les fiches Employé `INACTIF` n'ont pas d'équipe courante. Pour la fusion de `CH+OP`, seules les fiches
  actives suivent leur fonction; les bulletins historiques restent présents et sont reclassés selon leur
  fonction mensuelle. Les changements de données et la suppression sont audités.
- Une équipe a un état unique : il n'existe pas de statut actif/inactif.
- L'import Excel ne crée que de nouvelles équipes. Il valide le fichier entier avant l'écriture; une ligne
  invalide entraîne le rejet de tout le fichier, sans création partielle.

## Modèle de données

La table `equipe` porte le référentiel. Les tables Employé et Paie conservent chacune une relation
facultative vers une équipe. La relation du bulletin porte l'équipe de son mois; elle n'est pas remplacée
par une modification de l'équipe courante sur la fiche Employé.

| Champ | Type | Contraintes | Rôle |
|---|---|---|---|
| `id` | `Long` / `BIGINT` | Clé primaire, générée par la base | Référence technique des fiches et bulletins |
| `version` | `Long` / `BIGINT` | Obligatoire, version optimiste | Détecte une modification concurrente |
| `code` | `String` / `VARCHAR(50)` | Obligatoire, unique sans casse et espaces extérieurs | Identifiant d'échange et d'import |
| `libelle` | `String` / `VARCHAR(100)` | Obligatoire, unique sans casse et espaces extérieurs | Nom sémantique affiché et utilisé dans les sélections/regroupements |

## DTO exposés par le domaine

Les contrôleurs exposent des DTO et jamais les entités JPA. Les types ci-dessous décrivent le contrat
public actuel du domaine Équipe.

| DTO | Champ | Type | Contraintes | Description |
|---|---|---|---|---|
| `EquipeCreateRequestDto` | `code` | `String` | Obligatoire, non blanc, 50 caractères maximum | Identifiant d'échange à créer |
| `EquipeCreateRequestDto` | `libelle` | `String` | Obligatoire, non blanc, 100 caractères maximum | Nom sémantique à créer |
| `EquipeUpdateRequestDto` | `version` | `Long` | Obligatoire | Version reçue lors de la lecture; prévient l'écrasement concurrent |
| `EquipeUpdateRequestDto` | `code` | `String` | Obligatoire, non blanc, 50 caractères maximum | Nouveau code d'échange |
| `EquipeUpdateRequestDto` | `libelle` | `String` | Obligatoire, non blanc, 100 caractères maximum | Nouveau nom sémantique |
| `EquipeSearchCriteria` | `code` | `String?` | Facultatif, 50 caractères maximum | Filtre de liste sur le code |
| `EquipeSearchCriteria` | `libelle` | `String?` | Facultatif, 100 caractères maximum | Filtre de liste sur le libellé |
| `EquipeSearchCriteria` | `recherche` | `String?` | Facultatif, 100 caractères maximum | Recherche libre dans le code ou le libellé |
| `EquipeResponseDto` | `id` | `Long` | Présent dans la réponse | Identifiant interne utilisé par les relations |
| `EquipeResponseDto` | `version` | `Long` | Présent dans la réponse | Version à renvoyer lors d'une modification |
| `EquipeResponseDto` | `code` | `String` | Présent dans la réponse | Identifiant d'échange |
| `EquipeResponseDto` | `libelle` | `String` | Présent dans la réponse | Nom utilisé dans l'interface et les regroupements |
| `EquipeImportResultDto` | `totalLignes` | `int` | Présent dans la réponse | Nombre de lignes du fichier traitées |
| `EquipeImportResultDto` | `crees` | `int` | Présent dans la réponse | Nombre d'équipes créées |
| `EquipeImportResultDto` | `ignores` | `int` | Présent dans la réponse | Nombre de lignes rejetées |
| `EquipeImportResultDto` | `lignesIgnorees` | `List<LigneIgnoreeDto>` | Présent dans la réponse | Détail des lignes rejetées |
| `LigneIgnoreeDto` | `numeroLigne` | `int` | Présent dans chaque ligne rejetée | Numéro de ligne dans le classeur |
| `LigneIgnoreeDto` | `code`, `libelle`, `raison` | `String` | Présents dans chaque ligne rejetée | Valeurs lues et motif de rejet |

Une recherche retourne une page de `EquipeResponseDto`. Les critères `code` et `libelle` se combinent;
`recherche` trouve une correspondance dans l'un ou l'autre champ. Les champs sensibles à la casse sont
normalisés selon les règles métier ci-dessus.

## API et import

| Méthode | Route | Contrat |
|---|---|---|
| `POST` | `/equipes` | Création à partir de `EquipeCreateRequestDto` (`201`, `400`, `409`) |
| `PUT` | `/equipes/{id}` | Modification à partir de `EquipeUpdateRequestDto` (`200`, `400`, `404`, `409`) |
| `GET` | `/equipes/{id}` | Lecture d'une équipe (`200`, `404`) |
| `POST` | `/equipes/search` | Recherche paginée et triable (`200`) |
| `DELETE` | `/equipes/{id}` | Suppression protégée par les relations Employé et Paie (`204`, `404`, `409`) |
| `POST` | `/equipes/import` | Import atomique XLSX, créations seulement (`200`, `400`) |
| `GET` | `/equipes/import/modele` | Téléchargement du modèle XLSX vierge (`200`) |

Le classeur d'import attend les colonnes `Code` et `Libellé`. Le fichier est limité à 20 Mo. Les lignes
vides sont ignorées; les autres sont toutes validées avant l'écriture. Le code est normalisé en majuscules
et les deux valeurs sont nettoyées de leurs espaces extérieurs. Le résultat donne le nombre de lignes
créées/rejetées et détaille chaque ligne rejetée.

## Permissions

Le backend est la référence d'autorisation. Le masquage d'une route ou d'un bouton dans l'interface ne
remplace pas le contrôle serveur.

| Permission | Accès accordé |
|---|---|
| `EQUIPE_READ` | Liste, détail, Tabulaire, Cartes, Analytique et chargement des équipes dans les sélecteurs Employé/Paie |
| `EQUIPE_WRITE` | Créer et modifier une équipe; afficher les actions correspondantes |
| `EQUIPE_DELETE` | Demander la suppression d'une équipe, sous réserve qu'elle ne soit référencée |
| `EQUIPE_IMPORT` | Importer un classeur et télécharger son modèle |
| `EMPLOYEE_READ` | Accéder aux fiches Employé selon les permissions du domaine Employé; les Cartes Équipe ne chargent pas les effectifs des fiches |
| `PAIE_READ` | Lire le dernier mois de paie enregistré dans Cartes et Analytique, y compris la section qualité dédiée; sans ce droit, les données Paie ne sont ni chargées ni affichées |

Les formulaires Employé et Paie exigent également les droits de leur propre domaine. L'import Paie résout
les codes d'équipe côté serveur avec le droit `PAIE_IMPORT`; il ne déclenche pas un appel HTTP du client
vers `/equipes`.

## Les trois vues

Les routes de collection sont `/equipes` (Tabulaire), `/equipes/cartes` (Cartes) et
`/equipes/analytique` (Analytique). Elles utilisent les composants configurables partagés pour la coque
et le tableau Tabulaire; Cartes et Analytique utilisent les vues partagées de `portail/perimetre/`.
Équipe fournit sa configuration, ses filtres, ses colonnes et les critères de lecture transmis aux
domaines Employé et Paie. Les valeurs de filtre restent synchronisées dans l'URL lors du changement de vue.

- **Tabulaire** sert à retrouver, consulter et administrer les équipes. Le tableau présente le code et le
  libellé; les filtres code/libellé suivent la même règle dans les trois vues.
- **Cartes** suit la hiérarchie **Équipe → Chantier → Fonction**. Le libellé est le nom principal des équipes;
  leur code reste un repère secondaire. Les cartes prennent leurs indicateurs exclusivement des bulletins du
  dernier mois de paie enregistré. Le résumé indique le nombre d'équipes référencées, l'effectif en personnes et
  la masse salariale en DH; il ne présente pas de décompte fondé sur les fiches Employé. Le mois Paie est aligné
  sur le titre du niveau; résumé et export PDF des résultats sont regroupés dans le même en-tête. Les bulletins sans équipe
  ne sont pas présentés comme une carte Équipe. Le mois est déterminé par la base,
  sans sélecteur de période. La navigation
  par onglets remplace le raccourci vers le Tabulaire; l'accès aux employés est une icône avec infobulle à droite du titre de
  niveau dans Cartes. Elle conserve le périmètre courant et nécessite `EMPLOYEE_READ`; les filtres restent conservés entre les vues.
  Chaque carte présente séparément les quatre indicateurs Paie : Effectif (personnes), Masse salariale (DH),
  STC (personnes) et STC (DH). Chaque indicateur affiche son libellé, sa valeur du dernier mois enregistré et
  son évolution par rapport au mois calendaire précédent : écart en personnes et pourcentage en DH. Un groupe
  absent d'un mois précédent enregistré est comparé à zéro; sans paie enregistrée pour ce mois, la comparaison
  est indiquée comme indisponible. Les effectifs des fiches Employé ne sont pas chargés ni présentés dans ces Cartes,
  afin que l'effectif, la masse et les STC proviennent d'une seule source pour un même mois.
- **Analytique** présente la répartition par équipe pour le dernier mois de paie enregistré et l'évolution mensuelle
  pour une équipe choisie. Chaque graphique propose un multisélecteur déroulant de quatre indicateurs — Effectif (personnes),
  Masse salariale (DH), STC (personnes) et STC (DH) — et affiche un graphique distinct pour chaque indicateur coché.
  Les graphiques de répartition et le suivi incluent « Orphelins (sans équipe) »; le suivi transmet `equipeIds=0` et couvre
  l'historique des bulletins sans équipe. Un graphique d'anneau dédié à la qualité du rattachement, distinct des graphiques
  de répartition, apparaît dans cette section uniquement si le dernier mois contient des bulletins orphelins; il propose
  ses propres filtres Chantier et Fonction et s'exporte seul en PDF (`PAIE_READ`). Il n'apparaît ni dans le Tabulaire ni
  dans Cartes. Les sélecteurs des autres vues continuent de proposer « Orphelins » quand ils
  filtrent une équipe; un formulaire enregistre une valeur d'équipe nulle, jamais l'identifiant synthétique `0`.
  Comme tous les sélecteurs de l'application, ces contrôles permettent la recherche et le chargement au défilement;
  le filtre Chantier et le choix d'Équipe proposent également la recherche.
  Chaque carte de graphique contient son filtre Chantier; les deux filtres restent synchronisés dans l'URL et
  s'appliquent aux deux cartes. L'évolution conserve les mois antérieurs; le mois de référence courant ne peut pas
  être changé. Le graphique de répartition masque les groupes dont la valeur de l'indicateur sélectionné est nulle;
  le tableau « Voir les données » conserve tous les groupes. La vue n'expose ni le choix « Répartir par », ni les
  graphiques propres aux domaines Employé ou Paie.
  Les tableaux de données sont repliés par défaut et s'ouvrent avec « Voir les données ».

Les sélections, filtres et regroupements d'équipe utilisent le libellé pour la lecture humaine. Les autres
dimensions gardent leurs contrats propres. L'identifiant interne reste utilisé pour relier les données.
Dans les sélecteurs partagés, le code apparaît aussi comme repère court à côté du libellé; la recherche
porte sur les deux. Les filtres multiples disposent des actions « Tout sélectionner » et « Ne rien sélectionner ».
La définition complète des vues et des comportements communs est dans
[`conventions/frontend.md`](../../conventions/frontend.md).

### Export

Chaque composant qui expose des données peut être exporté séparément en PDF depuis son composant ou son
conteneur. Le document porte un titre métier, la période et le périmètre utiles au partage; il ne reprend pas
les noms des vues de l'application. L'export respecte les filtres et contient toutes les lignes du composant,
même celles masquées derrière « Afficher plus » ou un tableau replié. Pour les deux graphiques analytiques,
le graphique exporté montre l'indicateur sélectionné et le tableau joint présente les quatre mesures. Le PDF
porte une identité visuelle Staport et une date d'édition. L'impression Angular partagée ouvre le dialogue
d'impression du navigateur; l'utilisateur peut y enregistrer le document en PDF. Le modèle Excel téléchargeable
reste un modèle d'import, pas un export.

## Scénarios de vérification associés

| Règle ou parcours | Suites qui portent les vérifications |
|---|---|
| Création, modification, normalisation et unicité | `EquipeServiceTest`, `ReferentielUniciteInsensibleCasseTest`, tests du formulaire Équipe |
| Équipe facultative et synchronisation bulletin/fiche Employé | `PaieServiceTest`, tests du formulaire Paie |
| Suppression bloquée si l'équipe est référencée | `PaieServiceTest`, tests d'audit, `EndpointSecurityTest` |
| Import atomique et rejet des lignes invalides | `EquipeImportServiceTest`, `AuditImportTest`, tests d'actions d'import |
| Sélection, tri et nom de groupe par libellé | `equipe-module.spec.ts`, `reference-services.spec.ts`, `perimetre-groupes.spec.ts`, tests des formulaires Employé/Paie |
| Cartes : quatre mesures Paie lisibles, dernier mois et comparaison au mois précédent | `CartesPerimetreComponent.spec.ts`, `perimetre-groupes.spec.ts`, `frontend/e2e/equipes.spec.ts` |
| Orphelins proposés dans les filtres d'équipe, présents dans la répartition et suivis dans l'historique | `reference-services.spec.ts`, `paie-option.sources.spec.ts`, `employee-filtres.component.spec.ts`, `analytique-perimetre.component.spec.ts` |
| Orphelins absents du Tabulaire et des Cartes; graphique en anneau uniquement dans la section qualité Analytique si leur nombre est supérieur à zéro, filtres Chantier/Fonction et accès protégé par `PAIE_READ` | `cartes-perimetre.component.spec.ts`, `analytique-perimetre.component.spec.ts`, `equipe-vues.component.spec.ts` |
| Filtres URL et parcours Tabulaire, Cartes, Analytique | tests des hôtes de vue, tests du socle `portail/perimetre/`, `frontend/e2e/equipes.spec.ts` |
| PDF autonome par composant et contenu échappé | `pdf-export-button.component.spec.ts`, `pdf-impression.service.spec.ts` |
| Accès autorisé/refusé sur chaque route Équipe | `EndpointSecurityTest` et tests d'interface des permissions |

Les commandes et prérequis des suites sont décrits dans [la documentation des tests](../testing.md).

## Points à valider avec le propriétaire

Constats issus de la relecture du code pour clôturer le domaine. Chacun est un comportement **actuel**, pas une anomalie
à corriger d'office : à confirmer, à ajuster ou à classer.

| # | Constat | Question |
|---|---|---|
| 1 | La suppression est refusée par la clé étrangère ; le message dit « bulletin de paie ou employé » sans dire lequel ni combien | Préciser le message (nombre d'employés et de bulletins) ? |
| 2 | Quatre équipes d'origine (`A`, `LABO`, `ASPHALET`, `8`) ont été créées avec **libellé = code** en attendant le vrai libellé de la RH | Les libellés réels sont-ils renseignés ? |
| 3 | L'import ne fait que **créer** : aucun moyen de corriger des équipes en masse | Un import de mise à jour est-il utile ? |
| 4 | L'équipe est facultative sur la fiche et le bulletin (le [PV N°1](../handoff/pv-n1-erp-rh.md) propose de la rendre obligatoire) | Décision métier sur le caractère obligatoire ? |
| 5 | Aucun état actif/inactif : une équipe qui n'existe plus ne peut qu'être supprimée si rien ne la référence | Faut-il pouvoir « archiver » une équipe ? |
| 6 | L'assistant lit les équipes et la paie par équipe, sans périmètre par fiche de poste | Qui doit voir quelles équipes (jalon J2) ? |

## Documents liés

- [Domaine Employé](../employee/README.md) — équipe courante de la fiche.
- [Domaine Paie](../paie/README.md) — équipe portée par le bulletin du mois.
- [PV N°1 — proposition d'évolution](../handoff/pv-n1-erp-rh.md) — proposition de rendre l'équipe obligatoire sur un bulletin. Le comportement actuel reste facultatif.
